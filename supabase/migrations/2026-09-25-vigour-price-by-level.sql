-- ════════════════════════════════════════════════════════════════════════════
-- 2026-09-25-vigour-price-by-level.sql — THE REFILL PRICE SCALES WITH LEVEL.
-- MONEY MOVES IN THIS FILE.
--
-- LANE C. STAGED, NOT APPLIED. SECURITY GO REQUIRED (CLAUDE.md §2 — gold).
--
-- TYLER, 2026-09-25 (docs/design/HUNTS_AND_ANALYZER.md §4.6): (1) the Vigour
-- refill price SCALES WITH THE CHARACTER'S LEVEL, Huntera-style; (2) when
-- Vigour runs out the hunt pays 25% (VIGOUR_DRY_MULT stays 0.25). NOT reopened:
-- gold only, +120 minutes per refill, at most 5 refills per UTC day, the 22-hour
-- paid ceiling, reset on hr_utc_day_key.
--
-- THE SHAPE (Huntera, measured 2026-09-18; OUR coefficients, not theirs):
--     refill n of the day costs floor((base + per_level x L) x (1 + (n-1) x step))
-- where L is the character's COMBAT LEVEL, read by hr_party_level(user, slot)
-- off the server-owned player_skills rows INSIDE the price function — never a
-- parameter, never the wire. Combat level and not total level because a hunt's
-- gold comes from the monster a character can kill, which combat gates; total
-- level also counts gathering/artisan skills that pay a hunt nothing.
--
-- WHY A NEW FILE AND NOT AN EDIT OF 2026-09-22-vigour-refill.sql: that file is
-- APPLIED (2026-09-23 06:26:46 UTC, tests/schema-apply-order.json) with an EMPTY
-- nth-ladder catalogue, so every refill on production answers refill_unpriced
-- today. An applied file is history; this one supersedes it forward:
--   §1  hr_vigour_price_rule — ONE row holding base / per_level / step /
--       refills_max, seeded with Tyler's ruling. Every future adjustment is a
--       reviewed UPDATE of this row, never a code change.
--   §2  hr_vigour_refill_price(user, slot, nth) — THE formula, once. Callable by
--       NOBODY: two SECURITY DEFINER callers reach it as owner.
--   §3  hr_vigour_of — restated with the cap read from the rule row and three
--       new fields (level, next_refill_gold, refills_left) computed by §2.
--   §4  hr_vigour_refill__ungated — restated; prices from §2, minutes from §3.
--   §5  drop the empty, now-unread hr_vigour_prices (refused if it has a row).
--   §6  hr_client_rpc_baseline note for hr_vigour_refill re-worded (signature
--       unchanged). hr_rpc_gate's bucket and the wrapper are untouched.
--   §7  the §4 self-check, EXECUTED.
--
-- GRANT HYGIENE (the S-5 history, docs/planning/SEC_HUNTS_M6_2026-09-22.md):
-- this file grants hr_engine NOTHING and adds no client RPC, so the detector's
-- c_engine_allow and the RPC baseline's identity rows are untouched and
-- hr_assert_grant_hygiene is NOT restated — it is only EXECUTED, strict, at the
-- end of §7 on whatever detector body is live (M7's trophy-claim link included).
--
-- AFTER APPLYING (Coordinator): tests/live-hash-drift.baseline.json goes red on
-- hr_vigour_of (pinned; restated here by design) — read --codediff, then
-- --live --write with the why "2026-09-25-vigour-price-by-level.sql §3: cap read
-- from hr_vigour_price_rule; adds level / next_refill_gold / refills_left via
-- hr_vigour_refill_price". restore-census: hr_vigour_price_rule is classified
-- operator_tunable in this lane; re-measure its live_value after the apply.
--
-- REVERSIBILITY
--   re-apply 2026-09-22-vigour-daily.sql §1 and 2026-09-22-vigour-refill.sql
--   §2-§3 (recreates the EMPTY hr_vigour_prices: every refill refill_unpriced);
--   drop function public.hr_vigour_refill_price(uuid, int, int);
--   drop table public.hr_vigour_price_rule;
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_vigour_refill__ungated(int,uuid)') is null
     or to_regprocedure('public.hr_vigour_refill(int,uuid)') is null then
    raise exception 'PRECONDITION: hr_vigour_refill is absent - apply 2026-09-22-vigour-refill.sql FIRST'; end if;
  if to_regprocedure('public.hr_vigour_of(uuid,int)') is null then
    raise exception 'PRECONDITION: hr_vigour_of is absent - apply 2026-09-22-vigour-daily.sql FIRST'; end if;
  if to_regprocedure('public.hr_party_level(uuid,int)') is null then
    raise exception 'PRECONDITION: hr_party_level is absent - apply 2026-09-23-m8-parties-s1-1-tables.sql FIRST'; end if;
  if position('''hr_vigour_refill''' in pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure)) = 0 then
    raise exception 'PRECONDITION: hr_rpc_gate has no hr_vigour_refill bucket - the verb would answer rate_limited forever'; end if;
  if position('''vigour''' in (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_kind_check')) = 0 then
    raise exception 'PRECONDITION: player_ledger.kind does not admit ''vigour'' - a purchase with no journal is not a purchase'; end if;
end $$;

-- ── 1. THE PRICE RULE — the only place a Vigour gold number lives ──────────
-- ONE row (`id boolean primary key check (id)`, hr_tick_config's singleton
-- idiom). The coefficients are DERIVED FROM HEARTHRISE'S OWN ECONOMY (design
-- §4.6 carries the table and the gold/h estimates behind it), not Huntera's:
-- refill 1 costs about the gold of the two hours it buys at that level.
--
-- refills_max IS THE PER-DAY CAP, AS DATA (Tyler: 5). Its CHECK stops at 11
-- because 11 x 120 = 1,320 = the 22 h ceiling: a twelfth rung could never be
-- delivered, so it can never be configured. Raising the cap is an UPDATE under a
-- Security review, exactly like a price.
--
-- ⚠ SEEDED, and that is the point of this file: I-3 kept the old ladder EMPTY
--   because nobody had ruled; Tyler ruled on 2026-09-25. `on conflict do
--   nothing`, so a re-apply never reverts an operator's reviewed UPDATE.
--   1,500 + 450 x L, step 0.5: refill 1 is 3,750 gold at combat level 5
--   (~1,900 gold/h hunting) and 42,000 at level 90 (~30,000 gold/h); refill 5
--   is 3x refill 1. The table and the five-line argument are in design §4.6.
create table if not exists public.hr_vigour_price_rule (
  id             boolean primary key default true check (id),
  -- BOUNDED (Security VP-2, 2026-09-26): hr_vigour_of prices through these on
  -- EVERY envelope, so a typo that overflowed bigint would take hr_state_of down
  -- for every player, not just the shop. 1e9 each: (1e9 + 1e9 x 126) x 101 is
  -- ~1.3e13, five orders under bigint at the top combat level and step/cap.
  base_gold      bigint  not null check (base_gold > 0 and base_gold <= 1000000000),
  per_level_gold bigint  not null check (per_level_gold >= 0 and per_level_gold <= 1000000000),
  -- The within-day escalation, EXACT (numeric, never float): rung n pays
  -- (1 + (n-1) x step) times rung 1.
  step           numeric(6,4) not null check (step > 0 and step <= 10),
  refills_max    int     not null check (refills_max between 0 and 11),
  ruled          text    not null check (length(ruled) > 0),
  updated_at     timestamptz not null default now()
);

comment on table public.hr_vigour_price_rule is
  'THE VIGOUR REFILL PRICE (2026-09-25, Tyler: scales with level). One row. Refill n of the UTC day costs floor((base_gold + per_level_gold x combat level) x (1 + (n-1) x step)); refills_max is the per-day cap. Read ONLY by hr_vigour_refill_price, which the meter (hr_vigour_of) and the verb (hr_vigour_refill__ungated) both call, so the advertised and the charged price are one computation. No row = the shop is closed (refill_unpriced). Adjusted by a reviewed UPDATE under a Security GO, never a code change.';

insert into public.hr_vigour_price_rule (id, base_gold, per_level_gold, step, refills_max, ruled)
values (true, 1500, 450, 0.5, 5,
        'Tyler 2026-09-25: scales with level, 25% dry, 5/day, +120 min, 22h ceiling; coefficients from HUNTS_AND_ANALYZER.md 4.6')
on conflict (id) do nothing;

alter table public.hr_vigour_price_rule enable row level security;
alter table public.hr_vigour_price_rule force row level security;
-- NO CLIENT GRANT AND NO POLICY. The client never prices: the NEXT price
-- reaches the browser on the envelope (§3), computed by the same function the
-- verb charges with. A table the client can read is a second place to derive a
-- price from, and a derived price is one that can disagree with the charge.
revoke all on public.hr_vigour_price_rule from public, anon, authenticated, service_role;

-- ── 2. hr_vigour_refill_price — THE FORMULA, ONCE ──────────────────────────
-- Returns { nth, level, gold } for refill `p_nth` of today on (p_user, p_slot),
-- or NULL when that refill is not for sale (no rule row, nth < 1, nth past the
-- cap). The LEVEL IS READ HERE, from player_skills via hr_party_level — the
-- same combat level the party panel and the level spread already use — so no
-- caller can hand it one. STABLE: it writes nothing.
create or replace function public.hr_vigour_refill_price(p_user uuid, p_slot int, p_nth int)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_catalog as $$
declare
  r     public.hr_vigour_price_rule%rowtype;
  v_lvl int;
begin
  if p_user is null or p_nth is null or p_nth < 1 then return null; end if;
  select * into r from public.hr_vigour_price_rule where id;
  if not found or p_nth > r.refills_max then return null; end if;
  v_lvl := greatest(1, coalesce(public.hr_party_level(p_user, coalesce(p_slot, 0)), 1));
  return jsonb_build_object(
    'nth',   p_nth,
    'level', v_lvl,
    'gold',  floor((r.base_gold + r.per_level_gold * v_lvl)::numeric
                   * (1 + (p_nth - 1) * r.step))::bigint);
end $$;

comment on function public.hr_vigour_refill_price(uuid, int, int) is
  'THE VIGOUR REFILL PRICE (2026-09-25). floor((base + per_level x combat level) x (1 + (nth-1) x step)) from hr_vigour_price_rule; NULL when not for sale. The level is read from the server''s player_skills via hr_party_level, never a parameter. Callable by NOBODY: hr_vigour_of and hr_vigour_refill__ungated reach it as owner - one function, two callers, no second formula.';

revoke execute on function public.hr_vigour_refill_price(uuid, int, int) from public;
revoke execute on function public.hr_vigour_refill_price(uuid, int, int)
  from anon, authenticated, service_role;

-- ── 3. hr_vigour_of — the meter, now also stating the next price ───────────
-- 2026-09-22-vigour-daily.sql §1's body, carried verbatim except:
--   · the per-day cap comes from hr_vigour_price_rule.refills_max (DATA), not a
--     constant, and it gates only what is still for sale: bought minutes are
--     clamped by the ceiling alone, so an operator cutting the cap or closing
--     the shop never shrinks minutes a player already bought (VP-1);
--   · refill_min, refills_left, next_refill_gold and level are added. refills_left
--     is what the verb would still SELL (day cap AND whole blocks under the
--     ceiling, finding S-3), so the panel can never offer a refill the server
--     refuses (CLAUDE.md §6). next_refill_gold is NULL exactly when it is 0.
create or replace function public.hr_vigour_of(p_user uuid, p_slot int default 0)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_catalog as $$
declare
  -- THE FLOOR, in minutes. 720 = 12 h = hr_offline_cap_ms's base for everybody,
  -- which is what makes "nobody loses what they can earn today" a property
  -- rather than a hope. Mirrors src/core/hunt.js VIGOUR_FLOOR_MIN.
  c_floor_min   constant int := 720;
  -- The hard daily ceiling on PAID minutes. src/core/hunt.js VIGOUR_CEILING_MIN.
  c_ceiling_min constant int := 22 * 60;
  -- Minutes one refill adds (design 4.4, not reopened 2026-09-25). The PRICE
  -- and the per-day CAP are not here: they are hr_vigour_price_rule's row,
  -- read through hr_vigour_refill_price, because money is tuned by data.
  c_refill_min  constant int := 120;
  -- THE READ CLAMP on the day's counter: the most refills ANY rule row could
  -- ever have sold (hr_vigour_price_rule.refills_max CHECK <= 11, because
  -- 11 x 120 = the ceiling). Not today's refills_max - see (2).
  c_refills_bound constant int := 11;
  v_day       text := public.hr_utc_day_key(now());
  v_slot      int  := coalesce(p_slot, 0);
  v_cap       int;
  v_grant     int;
  v_refills   int;
  v_bought    int;
  v_budget    int;
  v_left      int;
  v_next      jsonb;
  v_spent     bigint;
  -- The day's charge in MILLISECONDS, before the single division. bigint on
  -- purpose: 22 h is 79,200,000 and an overspent night is larger still.
  v_spent_ms  bigint;
begin
  if p_user is null then return null; end if;

  -- (1) THE DERIVED GRANT. `hr_offline_cap_ms` is the server's own answer to
  --     "how long may this character be paid for while away"; Vigour is the
  --     same entitlement counted in minutes, so there is ONE ladder.
  v_grant := greatest(c_floor_min,
    (coalesce(public.hr_offline_cap_ms(p_user, v_slot), 0) / 60000)::int);

  -- (2) WHAT WAS BOUGHT TODAY, from the append-only daily counter the refill
  --     verb increments - never from a column that verb maintains.
  select coalesce(value, 0)::int into v_refills from public.player_progress
   where user_id = p_user and slot = v_slot
     and kind = 'daily' and key = 'ev:vigour_refills' and period_key = v_day;
  v_refills := greatest(0, coalesce(v_refills, 0));
  -- The per-day cap, as DATA. It gates what is still FOR SALE (3b) and never
  -- what was BOUGHT: clamping the count by today's cap would confiscate paid
  -- minutes the moment an operator lowered refills_max (Security VP-1,
  -- 2026-09-26). A corrupted counter is still clamped on READ (M6 GATE(c4)),
  -- by the bound no rule can exceed; with the 720 floor the budget below is the
  -- ceiling for any count >= 5 either way, so this widens nothing.
  select refills_max into v_cap from public.hr_vigour_price_rule where id;
  v_refills := least(c_refills_bound, v_refills);
  v_bought  := v_refills * c_refill_min;

  -- (3) THE BUDGET. The ceiling is applied HERE and only here, so every reader
  --     of this function sees the same capped number.
  v_budget := least(c_ceiling_min, v_grant + v_bought);

  -- (3b) WHAT IS STILL FOR SALE, AND AT WHAT PRICE. The same two refusals the
  --      verb makes before any debit: the day cap, and a block the ceiling would
  --      clamp (S-3: refused, never sold partial).
  v_left := greatest(0, least(coalesce(v_cap, 0) - v_refills,
                              (c_ceiling_min - v_budget) / c_refill_min));
  if v_left > 0 then
    v_next := public.hr_vigour_refill_price(p_user, v_slot, v_refills + 1);
  end if;
  if v_next is null then v_left := 0; end if;

  -- (4) WHAT HAS BEEN SPENT TODAY. Written by the engine out of a SETTLED
  --     window, from the same `ms` the payout was computed from, in the same
  --     transaction - so a window cannot pay and not charge (design §5).
  --
  -- ⚠ TWO ROWS, ONE NUMBER, AND THE DIVISION HAPPENS HERE (finding S-1).
  --   The engine writes the window's charge as a QUOTIENT ('ev:vigour_min',
  --   whole minutes) and a REMAINDER ('ev:vigour_rem_ms'); summing the
  --   remainders and dividing ONCE is what makes the charge conserve under
  --   subdivision. See 2026-09-22-vigour-daily.sql §1 and GATE(c7).
  select coalesce(sum(case when key = 'ev:vigour_min' then value else 0 end), 0) * 60000
       + coalesce(sum(case when key = 'ev:vigour_rem_ms' then value else 0 end), 0)
    into v_spent_ms
    from public.player_progress
   where user_id = p_user and slot = v_slot
     and kind = 'daily' and key in ('ev:vigour_min', 'ev:vigour_rem_ms')
     and period_key = v_day;
  v_spent := greatest(0, coalesce(v_spent_ms, 0)) / 60000;

  return jsonb_build_object(
    'day_key',       v_day,
    'grant_min',     v_grant,
    'refills',       v_refills,
    'refills_max',   coalesce(v_cap, 0),
    'refill_min',    c_refill_min,
    'refills_left',  v_left,
    -- THE NEXT PRICE, from the one formula the verb charges with. NULL when
    -- nothing is for sale, so the panel has no number to offer.
    'next_refill_gold', (v_next->>'gold')::bigint,
    -- The server's combat level that priced it (null with nothing for sale).
    'level',         (v_next->>'level')::int,
    'bought_min',    v_bought,
    'budget_min',    v_budget,
    'ceiling_min',   c_ceiling_min,
    'spent_min',     v_spent,
    -- NEVER NEGATIVE. The panel renders a bar; a negative remaining would be a
    -- number a player cannot act on rendered as though they could.
    'remaining_min', greatest(0, v_budget - v_spent),
    -- The rate past the budget (Tyler 2026-09-25: 25%). Reported so the panel's
    -- sentence comes from the server, not from a client constant.
    'dry_mult',      0.25);
end $$;

comment on function public.hr_vigour_of(uuid, int) is
  'THE VIGOUR METER (2026-09-22; price fields 2026-09-25). Derived grant (greatest(720, offline cap in minutes)) + bought minutes, capped at the 22h daily ceiling, minus what a settled window has charged (quotient + remainder, divided ONCE - S-1). Also states refills_left (day cap from hr_vigour_price_rule AND whole blocks under the ceiling) and next_refill_gold from hr_vigour_refill_price - the same function the refill verb charges with. READ-ONLY. Mirrors src/core/hunt.js vigourBudgetMin and vigourCharge.';

-- Unchanged: engine-only. The client reads the meter on the envelope.
revoke execute on function public.hr_vigour_of(uuid, int) from public;
revoke execute on function public.hr_vigour_of(uuid, int) from anon, authenticated, service_role;
grant  execute on function public.hr_vigour_of(uuid, int) to hr_engine;

-- ── 4. hr_vigour_refill__ungated — priced by level, server-side ────────────
-- 2026-09-22-vigour-refill.sql §3's body, carried verbatim except (0b) and (5):
-- the price is hr_vigour_refill_price(caller, slot, today's count + 1) and the
-- minutes are the meter's refill_min. The SIGNATURE IS UNCHANGED — (p_slot,
-- p_idem) and nothing else — so no level, price, amount or currency crosses the
-- wire; §7(c) proves an extra argument cannot even resolve.
create or replace function public.hr_vigour_refill__ungated(p_slot int, p_idem uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  v_uid     uuid := auth.uid();
  v_slot    int  := coalesce(p_slot, 0);
  v_st      public.player_state%rowtype;
  v_day     text;
  v_cached  jsonb;
  v_vig     jsonb;
  v_price   jsonb;
  v_nth     int;
  v_cost    bigint;
  v_min     int;
  -- How many of `v_min` this purchase would ACTUALLY add to the budget once
  -- hr_vigour_of's ceiling clamp has had its say (finding S-3). Computed before
  -- the debit; a refill that would deliver fewer than it charges for is refused.
  v_delivers int;
  v_cap     int;
  v_intent  text;
  v_result  jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot', 'slot', p_slot);
  end if;

  -- ── (0) THE IDEMPOTENCY KEY IS REQUIRED ON A MONEY VERB (finding S-4).
  --        A null key skips idempotency at BOTH ends, so the verb would debit
  --        on every call. BEFORE THE ADVISORY LOCK, deliberately: a call that
  --        cannot be made safe must not first serialise every other call on
  --        this character behind it.
  if p_idem is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'vigour_refill', 'missing_idem', '{}'::jsonb, 1);
    return jsonb_build_object('ok', false, 'error', 'missing_idem', 'slot', v_slot);
  end if;

  -- ── (0b) NO PRICE RULE — REFUSED BY ITS OWN NAME (I-3's shape, kept). With
  --        the rule row absent the shop is closed, and saying
  --        `vigour_daily_cap` would tell a player they used up a limit they
  --        could never reach. Before the lock, like (0).
  if not exists (select 1 from public.hr_vigour_price_rule where id) then
    perform public.hr_record_rejection(v_uid, v_slot, 'vigour_refill', 'refill_unpriced', '{}'::jsonb, 1);
    return jsonb_build_object('ok', false, 'error', 'refill_unpriced', 'slot', v_slot);
  end if;

  -- ── (1) SERIALISE ON THE CHARACTER. Byte-identical to hr_apply's key, so this
  --        also serialises against an accrual settling the same character.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- ── (2) THE SERVER'S DAY, read AFTER the lock, so a purchase cannot straddle
  --        the rollover and be counted in one day while priced in another.
  v_day := public.hr_utc_day_key(now());
  v_intent := 'vigour_refill:' || v_day;

  -- ── (3) IDEMPOTENCY IS PER (KEY, INTENT, SLOT), read INSIDE the lock. ONLY
  --        SUCCESSES ARE CACHED (see (9)), so "you are short 400 gold" stays
  --        retryable.
  select public.hr_intent_replay(v_uid, v_slot, p_idem, v_intent) into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return v_cached; end if;
  if v_cached is not null then return v_cached || jsonb_build_object('replayed', true); end if;

  select * into v_st from public.player_state
   where user_id = v_uid and slot = v_slot for update;
  if v_st.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- ── (4) WHERE THIS CHARACTER STANDS, from the ONE meter.
  v_vig := public.hr_vigour_of(v_uid, v_slot);
  v_nth := coalesce((v_vig->>'refills')::int, 0) + 1;
  v_cap := coalesce((v_vig->>'refills_max')::int, 0);
  v_min := (v_vig->>'refill_min')::int;

  -- ── (5) THE PER-DAY CLAMP (the rule row's refills_max), refused BY NAME
  --        before any debit.
  if v_nth > v_cap then
    perform public.hr_record_rejection(v_uid, v_slot, 'vigour_refill', 'vigour_daily_cap',
      jsonb_build_object('used', v_nth - 1, 'limit', v_cap), 1);
    return jsonb_build_object('ok', false, 'error', 'vigour_daily_cap',
      'used', v_nth - 1, 'limit', v_cap, 'vigour', v_vig);
  end if;

  -- THE PRICE: the one formula, on the server's level and the server's count.
  -- The same call hr_vigour_of made to state next_refill_gold.
  v_price := public.hr_vigour_refill_price(v_uid, v_slot, v_nth);
  v_cost  := (v_price->>'gold')::bigint;
  if v_cost is null or v_min is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'vigour_refill', 'vigour_daily_cap',
      jsonb_build_object('nth', v_nth), 1);
    return jsonb_build_object('ok', false, 'error', 'vigour_daily_cap', 'nth', v_nth, 'vigour', v_vig);
  end if;

  -- ── (6) THE CEILING. A refill that would buy NOTHING, or only PART of its
  --        block (finding S-3), is refused rather than sold. The DELIVERED
  --        minutes are computed BEFORE the debit.
  v_delivers := least(coalesce((v_vig->>'ceiling_min')::int, 0)
                        - coalesce((v_vig->>'budget_min')::int, 0), v_min);
  if v_delivers < v_min then
    perform public.hr_record_rejection(v_uid, v_slot, 'vigour_refill', 'vigour_ceiling',
      jsonb_build_object('budget_min', v_vig->>'budget_min', 'ceiling_min', v_vig->>'ceiling_min',
                         'would_deliver', greatest(0, v_delivers), 'minutes', v_min), 1);
    return jsonb_build_object('ok', false, 'error', 'vigour_ceiling',
      'budget_min', (v_vig->>'budget_min')::int, 'ceiling_min', (v_vig->>'ceiling_min')::int,
      'would_deliver', greatest(0, v_delivers), 'minutes', v_min,
      'vigour', v_vig);
  end if;

  -- ── (7) THE DEBIT. Every number here came from the server's rule row, the
  --        server's skills and the server's counter; nothing on the wire priced
  --        anything. The check and the update are one statement apart inside a
  --        transaction holding the row lock.
  if coalesce(v_st.gold, 0) < v_cost then
    perform public.hr_record_rejection(v_uid, v_slot, 'vigour_refill', 'insufficient_gold',
      jsonb_build_object('cost', v_cost, 'have', coalesce(v_st.gold, 0)), 1);
    return jsonb_build_object('ok', false, 'error', 'insufficient_gold',
      'cost', v_cost, 'have', coalesce(v_st.gold, 0),
      'short_by', v_cost - coalesce(v_st.gold, 0), 'vigour', v_vig);
  end if;
  update public.player_state
     set gold = gold - v_cost, version = version + 1, updated_at = now()
   where user_id = v_uid and slot = v_slot;
  -- ⚠ accrued_to IS NOT TOUCHED: a purchase is not an activity change.

  -- ── (8) THE COUNTER. The SAME daily row hr_vigour_of reads.
  insert into public.player_progress as pp
    (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, v_slot, 'daily', 'ev:vigour_refills', 1, v_day, 'active', now())
  on conflict (user_id, slot, kind, key, period_key)
    do update set value = pp.value + 1, updated_at = now();

  -- ── (9) THE JOURNAL. ONE append-only row per refill carrying the SIGNED gold
  --        movement and the level that priced it. gold_in/xp_in/qty_in/gems_in
  --        are written as ZERO: this transaction MINTED nothing.
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (v_uid, v_slot, 'vigour', v_intent, -v_cost, 0, 0, 0, 0,
     jsonb_build_object('nth', v_nth, 'cost', v_cost, 'minutes', v_min,
                        'level', (v_price->>'level')::int,
                        'currency', 'gold', 'day', v_day, 'idem', p_idem));

  -- ── (10) THE ENVELOPE, re-read from the rows.
  select * into v_st from public.player_state where user_id = v_uid and slot = v_slot;
  v_result := jsonb_build_object(
    'ok', true, 'nth', v_nth, 'cost', v_cost, 'minutes', v_min, 'currency', 'gold',
    'level', (v_price->>'level')::int,
    'gold', v_st.gold, 'version', v_st.version, 'slot', v_slot,
    'vigour', public.hr_vigour_of(v_uid, v_slot));

  -- SUCCESSES ONLY, unconditionally (§(0) refuses a null key).
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, v_slot, v_intent, v_result, now())
    on conflict (user_id, intent_id) do nothing;

  return v_result;
end $$;

-- Re-asserted, unchanged from 2026-09-22-vigour-refill.sql §4: the ungated body
-- is callable by nobody; the gated wrapper (not restated) by authenticated only.
revoke execute on function public.hr_vigour_refill__ungated(int, uuid) from public;
revoke execute on function public.hr_vigour_refill__ungated(int, uuid)
  from anon, authenticated, service_role;

-- ── 5. RETIRE THE EMPTY nth-LADDER ─────────────────────────────────────────
-- Nothing reads hr_vigour_prices after §3/§4. It was applied EMPTY (I-3) and
-- has never held a price; a row in it now would be a price someone typed that
-- this file does not account for, so the drop REFUSES rather than discards it.
do $$
begin
  if to_regclass('public.hr_vigour_prices') is null then
    raise notice 'hr_vigour_prices already gone - drop skipped'; return; end if;
  if exists (select 1 from public.hr_vigour_prices) then
    raise exception 'hr_vigour_prices holds % row(s) - a price nobody recorded; refusing to drop it blind', (select count(*) from public.hr_vigour_prices); end if;
  execute 'drop table public.hr_vigour_prices';
end $$;

-- ── 6. Grant-hygiene baseline: the note only ───────────────────────────────
-- Same proname / identity_args / grantee as 2026-09-22; only the description of
-- where the price comes from changes. Targeted, never hr_grant_baseline_sync().
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent - nothing to record'; return;
  end if;
  update public.hr_client_rpc_baseline
     set note = 'added 2026-09-22, re-priced 2026-09-25: buys +120 paid hunting minutes for GOLD on the '
       'calling character. Price = hr_vigour_refill_price(caller, slot, today''s refill count + 1) from '
       'hr_vigour_price_rule and the SERVER''s combat level (hr_party_level); the caller sends one of its '
       'own slots and an idempotency key and nothing else - no level, amount, price or currency. Gems and '
       'Hearth Tokens may never buy hunting time (HUNTS_AND_ANALYZER.md 4.4). Capped at refills_max per '
       'UTC day and refused at the 22h ceiling rather than sold partial. MONEY SURFACE: Security GO only.'
   where proname = 'hr_vigour_refill' and grantee = 'authenticated'
     and identity_args = 'p_slot integer, p_idem uuid';
  if not found then
    raise exception 'hr_client_rpc_baseline has no hr_vigour_refill row for (p_slot integer, p_idem uuid) - the baseline and the verb disagree';
  end if;
end $$;

-- ── 7. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) — EXECUTED ────────────────
do $$
declare
  v_uid  constant uuid := '00000000-0000-4000-8000-0000b5540001';
  -- A second character at a HIGHER combat level, for (e2).
  v_uidh constant uuid := '00000000-0000-4000-8000-0000b5540002';
  -- The clan-perked probe that makes the ceiling branch reachable (e7).
  v_uidp constant uuid := '00000000-0000-4000-8000-0000b5540003';
  r      public.hr_vigour_price_rule%rowtype;
  v_src  text;
  v_r    jsonb;
  v_vig  jsonb;
  v_p    jsonb;
  v_ph   jsonb;
  v_gold bigint;
  v_gems bigint;
  v_tok  bigint;
  v_lvl  int;
  v_lvlh int;
  v_want bigint;
  v_clan uuid;
  v_i    int;
  v_h    jsonb;
  v_day  text := public.hr_utc_day_key(now());
  v_role text;
begin
  -- (a) STATICS on the executable text (comments stripped).
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_vigour_refill__ungated';
  -- (a1) NO PRICE IN THE VERB: no 3+ digit literal, and it prices through §2.
  if v_src ~ '[^0-9a-zA-Z_]\d{3,}' then
    raise exception 'GATE(a1): the verb contains a 3+ digit literal - a price typed into code is a price Tyler cannot tune'; end if;
  if position('hr_vigour_refill_price' in v_src) = 0 then
    raise exception 'GATE(a1): the verb does not price through hr_vigour_refill_price'; end if;
  if position('hr_vigour_prices' in v_src) > 0 then
    raise exception 'GATE(a1): the verb still reads the retired nth-ladder'; end if;
  -- (a2) GOLD ONLY (gems_in is the explicit ZERO stamp, blanked first).
  if regexp_replace(v_src, 'gems_in', '', 'g') ~* '(gems|hearth_tokens|dungeon_scrip|marks)' then
    raise exception 'GATE(a2): the verb names a currency that is not gold - gems and Hearth Tokens may NEVER buy hunting time'; end if;
  if v_src !~ 'gold[[:space:]]*=[[:space:]]*gold[[:space:]]*-' then
    raise exception 'GATE(a2): the verb does not debit player_state.gold'; end if;
  -- (a3) ONE FORMULA. The price function holds no number either, reads the
  --      level itself, and is the only body that names the rule's coefficients.
  select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_vigour_refill_price';
  if v_src ~ '[^0-9a-zA-Z_]\d{2,}' then
    raise exception 'GATE(a3): hr_vigour_refill_price contains a 2+ digit literal - a coefficient belongs in the rule row'; end if;
  if position('hr_party_level' in v_src) = 0 then
    raise exception 'GATE(a3): hr_vigour_refill_price does not read the server''s combat level'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname <> 'hr_vigour_refill_price'
                and p.prosrc ~ 'per_level_gold') then
    raise exception 'GATE(a3): a second body names per_level_gold - that is a second copy of the formula'; end if;
  if position('hr_vigour_refill_price' in (select prosrc from pg_proc where oid = 'public.hr_vigour_of(uuid,int)'::regprocedure)) = 0 then
    raise exception 'GATE(a3): hr_vigour_of does not state the next price through hr_vigour_refill_price'; end if;
  -- (a4) NO LEVEL OR PRICE ON THE WIRE: exactly one overload of each, (int, uuid).
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('hr_vigour_refill', 'hr_vigour_refill__ungated')) <> 2
     or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname in ('hr_vigour_refill', 'hr_vigour_refill__ungated')
                   and pg_get_function_identity_arguments(p.oid) <> 'p_slot integer, p_idem uuid') then
    raise exception 'GATE(a4): hr_vigour_refill carries an overload or an argument beyond (p_slot, p_idem)'; end if;
  -- (a5) PRIVILEGES. The price function and the rule table: nobody. The
  --      ungated body: nobody. The wrapper: authenticated. The level's source
  --      rows: no client write.
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine'] loop
    if has_function_privilege(v_role, 'public.hr_vigour_refill_price(uuid,int,int)', 'execute') then
      raise exception 'GATE(a5): % can call hr_vigour_refill_price', v_role; end if;
    if has_function_privilege(v_role, 'public.hr_vigour_refill__ungated(int,uuid)', 'execute') then
      raise exception 'GATE(a5): % can call the UNGATED verb', v_role; end if;
    if has_table_privilege(v_role, 'public.hr_vigour_price_rule', 'select,insert,update,delete') then
      raise exception 'GATE(a5): % holds a privilege on hr_vigour_price_rule', v_role; end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.hr_vigour_refill(int,uuid)', 'execute') then
    raise exception 'GATE(a5): authenticated cannot call the gated wrapper - the verb ships dead'; end if;
  if has_table_privilege('authenticated', 'public.player_skills', 'insert,update') then
    raise exception 'GATE(a5): a client can write player_skills - the level that prices a refill would be client-authored'; end if;
  if to_regclass('public.hr_vigour_prices') is not null then
    raise exception 'GATE(a5): the retired hr_vigour_prices still exists'; end if;

  -- (b) THE RULE IS TYLER'S: one row, 5 a day, a rising step.
  select * into r from public.hr_vigour_price_rule where id;
  if not found or (select count(*) from public.hr_vigour_price_rule) <> 1 then
    raise exception 'GATE(b): hr_vigour_price_rule is not exactly one row'; end if;
  if r.refills_max <> 5 then
    raise exception 'GATE(b): refills_max is % - Tyler ruled 5 a day (not reopened 2026-09-25)', r.refills_max; end if;
  if r.per_level_gold <= 0 then
    raise exception 'GATE(b): per_level_gold is % - Tyler ruled the price SCALES WITH LEVEL', r.per_level_gold; end if;

  -- (b2) THE COEFFICIENTS ARE BOUNDED (VP-2): an overflowing typo is refused
  --      at the UPDATE, never discovered by hr_state_of.
  begin
    update public.hr_vigour_price_rule set per_level_gold = 1000000001 where id;
    raise exception 'GATE(b2): per_level_gold accepted 1,000,000,001 - an unbounded coefficient can overflow the envelope';
  exception when check_violation then null;
  end;
  begin
    update public.hr_vigour_price_rule set base_gold = 1000000001 where id;
    raise exception 'GATE(b2): base_gold accepted 1,000,000,001 - an unbounded coefficient can overflow the envelope';
  exception when check_violation then null;
  end;

  begin  -- ── SUBTRANSACTION ────────────────────────────────────────────────
    insert into auth.users (id) values (v_uid), (v_uidh), (v_uidp);
    perform set_config('request.jwt.claim.sub', v_uidh::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(e): no high probe: %', v_r; end if;
    -- The high probe's combat skills set on its OWN rows (a synthetic probe,
    -- not a player; rolled back at HR925).
    update public.player_skills set xp = public.hr_xp_for_level(60)
     where user_id = v_uidh and slot = 0
       and skill_id in ('attack', 'strength', 'defense', 'hitpoints');
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(e): no probe character: %', v_r; end if;

    -- (e1) TWO LEVELS, TWO PRICES, AS THE FORMULA SAYS.
    v_p  := public.hr_vigour_refill_price(v_uid, 0, 1);
    v_ph := public.hr_vigour_refill_price(v_uidh, 0, 1);
    v_lvl := (v_p->>'level')::int; v_lvlh := (v_ph->>'level')::int;
    if v_lvl <> public.hr_party_level(v_uid, 0) or v_lvlh <> public.hr_party_level(v_uidh, 0) then
      raise exception 'GATE(e1): the price was not computed at the server''s combat level (% / %)', v_p, v_ph; end if;
    if v_lvlh <= v_lvl then
      raise exception 'GATE(e1) CANNOT RUN: the high probe is level %, not above %', v_lvlh, v_lvl; end if;
    if (v_p->>'gold')::bigint <> r.base_gold + r.per_level_gold * v_lvl
       or (v_ph->>'gold')::bigint <> r.base_gold + r.per_level_gold * v_lvlh then
      raise exception 'GATE(e1): rung 1 is not base + per_level x level (% at %, % at %)', v_p->>'gold', v_lvl, v_ph->>'gold', v_lvlh; end if;
    if (v_ph->>'gold')::bigint - (v_p->>'gold')::bigint <> r.per_level_gold * (v_lvlh - v_lvl) then
      raise exception 'GATE(e1): the two levels differ by % gold, the formula says %',
        (v_ph->>'gold')::bigint - (v_p->>'gold')::bigint, r.per_level_gold * (v_lvlh - v_lvl); end if;
    if public.hr_vigour_refill_price(v_uid, 0, 0) is not null
       or public.hr_vigour_refill_price(v_uid, 0, r.refills_max + 1) is not null then
      raise exception 'GATE(e1): a rung outside 1..refills_max was priced'; end if;

    -- (e2) THE METER ADVERTISES WHAT THE VERB WILL CHARGE.
    v_vig := public.hr_vigour_of(v_uid, 0);
    if (v_vig->>'next_refill_gold')::bigint <> (v_p->>'gold')::bigint
       or (v_vig->>'refills_left')::int <> r.refills_max
       or (v_vig->>'refills_max')::int <> r.refills_max then
      raise exception 'GATE(e2): the meter does not state the next price / refills left: %', v_vig; end if;
    if public.hr_state_of(v_uid, 0)->'vigour' is distinct from v_vig then
      raise exception 'GATE(e2): the envelope and hr_vigour_of disagree'; end if;

    -- (e3) BROKE → insufficient_gold, counts nothing.
    update public.player_state set gold = 0 where user_id = v_uid and slot = 0;
    v_r := public.hr_vigour_refill__ungated(0, gen_random_uuid());
    if v_r->>'error' is distinct from 'insufficient_gold' or (v_r->>'cost')::bigint <> (v_p->>'gold')::bigint then
      raise exception 'GATE(e3): a broke character was answered %', v_r; end if;

    -- (e4) NULL KEY → missing_idem, with gold on the table.
    update public.player_state set gold = 100000000, gems = 777, hearth_tokens = 55
     where user_id = v_uid and slot = 0;
    select gold, gems, hearth_tokens into v_gold, v_gems, v_tok
      from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_vigour_refill__ungated(0, null);
    if coalesce(v_r->>'error', '') <> 'missing_idem'
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold then
      raise exception 'GATE(e4): a null p_idem was answered % or moved gold', v_r; end if;

    -- (e5) A CLIENT-SUPPLIED LEVEL OR PRICE HAS NO EFFECT. It cannot resolve
    --      as an argument (42883), and a forged JWT claim is not read.
    begin
      execute 'select public.hr_vigour_refill(p_slot => 0, p_idem => gen_random_uuid(), p_level => 1)';
      raise exception 'GATE(e5): hr_vigour_refill accepted a p_level argument';
    exception when undefined_function then null;
    end;
    begin
      execute 'select public.hr_vigour_refill(p_slot => 0, p_idem => gen_random_uuid(), p_price => 1)';
      raise exception 'GATE(e5): hr_vigour_refill accepted a p_price argument';
    exception when undefined_function then null;
    end;
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', v_uid, 'level', 1, 'price', 1, 'cost', 1)::text, true);

    -- (e6) THE HAPPY PATH, THEN THE WHOLE DAY: every rung charges exactly
    --      floor((base + per_level x L) x (1 + (n-1) x step)), what the meter
    --      advertised one call earlier, and journals the signed debit.
    for v_i in 1..r.refills_max loop
      v_vig  := public.hr_vigour_of(v_uid, 0);
      v_want := floor((r.base_gold + r.per_level_gold * v_lvl)::numeric * (1 + (v_i - 1) * r.step))::bigint;
      if (v_vig->>'next_refill_gold')::bigint <> v_want then
        raise exception 'GATE(e6): rung % advertised %, the formula says %', v_i, v_vig->>'next_refill_gold', v_want; end if;
      v_gold := (select gold from public.player_state where user_id = v_uid and slot = 0);
      v_r := public.hr_vigour_refill__ungated(0, ('00000000-0000-4000-8000-0000b554a00' || v_i)::uuid);
      if coalesce(v_r->>'ok', 'false') <> 'true' or (v_r->>'cost')::bigint <> v_want
         or (v_r->>'level')::int <> v_lvl then
        raise exception 'GATE(e6): rung % answered % - wanted cost % at level %', v_i, v_r, v_want, v_lvl; end if;
      if (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold - v_want then
        raise exception 'GATE(e6): rung % did not debit exactly %', v_i, v_want; end if;
      if (select gold from public.player_ledger where user_id = v_uid and kind = 'vigour'
            and (meta->>'nth')::int = v_i) is distinct from -v_want then
        raise exception 'GATE(e6): rung % did not journal the signed debit', v_i; end if;
      if v_i > 1 and v_want <= (select -gold from public.player_ledger where user_id = v_uid
                                   and kind = 'vigour' and (meta->>'nth')::int = v_i - 1) then
        raise exception 'GATE(e6): rung % is not dearer than rung %', v_i, v_i - 1; end if;
      -- (e6r) THE REPLAY of this rung's key charges nothing.
      v_r := public.hr_vigour_refill__ungated(0, ('00000000-0000-4000-8000-0000b554a00' || v_i)::uuid);
      if coalesce(v_r->>'replayed', 'false') <> 'true'
         or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold - v_want then
        raise exception 'GATE(e6r): a replayed key on rung % charged again: %', v_i, v_r; end if;
    end loop;
    if (select count(*) from public.player_ledger where user_id = v_uid and kind = 'vigour') <> r.refills_max then
      raise exception 'GATE(e6): % refills journalled % rows', r.refills_max,
        (select count(*) from public.player_ledger where user_id = v_uid and kind = 'vigour'); end if;
    perform set_config('request.jwt.claims', '', true);

    -- (e7) REFILL 6 IS REFUSED, TAKES NOTHING, AND THE METER SAID SO FIRST.
    v_vig := public.hr_vigour_of(v_uid, 0);
    if (v_vig->>'refills_left')::int <> 0 or v_vig->>'next_refill_gold' is not null then
      raise exception 'GATE(e7): after % refills the meter still offers one: %', r.refills_max, v_vig; end if;
    v_gold := (select gold from public.player_state where user_id = v_uid and slot = 0);
    v_r := public.hr_vigour_refill__ungated(0, gen_random_uuid());
    if v_r->>'error' is distinct from 'vigour_daily_cap' then
      raise exception 'GATE(e7): refill % answered % - it must be vigour_daily_cap', r.refills_max + 1, v_r; end if;
    if (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold then
      raise exception 'GATE(e7): the refused refill took gold'; end if;
    if (v_vig->>'budget_min')::int > (v_vig->>'ceiling_min')::int then
      raise exception 'GATE(e7): the budget passed the 22h ceiling: %', v_vig; end if;
    if exists (select 1 from public.player_progress where user_id = v_uid
                and kind = 'daily' and key = 'ev:vigour_refills' and period_key <> v_day) then
      raise exception 'GATE(e7): a refill counted against a day that is not today'; end if;

    -- (e7b) CUTTING THE CAP NEVER TAKES BACK WHAT WAS PAID (VP-1). With the
    --       whole day bought, refills_max drops to 1: the budget stands, the
    --       meter offers nothing, and the verb refuses by the cap with no debit.
    update public.hr_vigour_price_rule set refills_max = 1 where id;
    if (public.hr_vigour_of(v_uid, 0)->>'budget_min')::int <> (v_vig->>'budget_min')::int
       or (public.hr_vigour_of(v_uid, 0)->>'refills')::int <> r.refills_max
       or (public.hr_vigour_of(v_uid, 0)->>'refills_left')::int <> 0 then
      raise exception 'GATE(e7b): cutting refills_max moved paid minutes: % -> %', v_vig, public.hr_vigour_of(v_uid, 0); end if;
    v_r := public.hr_vigour_refill__ungated(0, gen_random_uuid());
    if v_r->>'error' is distinct from 'vigour_daily_cap'
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold then
      raise exception 'GATE(e7b): after the cap cut a refill answered % or moved gold', v_r; end if;
    update public.hr_vigour_price_rule set refills_max = r.refills_max where id;
    -- (e7c) A CORRUPTED COUNTER IS STILL CLAMPED ON READ (M6 GATE(c4)): 99
    --       refills read back as at most the rule's hard bound, and the budget
    --       never passes the ceiling.
    update public.player_progress set value = 99 where user_id = v_uid and slot = 0
       and kind = 'daily' and key = 'ev:vigour_refills' and period_key = v_day;
    if (public.hr_vigour_of(v_uid, 0)->>'refills')::int > 11
       or (public.hr_vigour_of(v_uid, 0)->>'budget_min')::int > (v_vig->>'ceiling_min')::int then
      raise exception 'GATE(e7c): a stuffed counter widened the meter: %', public.hr_vigour_of(v_uid, 0); end if;
    update public.player_progress set value = r.refills_max where user_id = v_uid and slot = 0
       and kind = 'daily' and key = 'ev:vigour_refills' and period_key = v_day;

    -- (e8) GEMS AND HEARTH TOKENS NEVER MOVED through the whole day.
    if (select gems from public.player_state where user_id = v_uid and slot = 0) <> v_gems
       or (select hearth_tokens from public.player_state where user_id = v_uid and slot = 0) <> v_tok
       or exists (select 1 from public.player_ledger where user_id = v_uid and kind = 'vigour'
                   and (coalesce(gems_in, 0) <> 0 or coalesce(gold_in, 0) <> 0)) then
      raise exception 'GATE(e8): a refill moved gems or hearth tokens, or minted'; end if;

    -- (e9) THE CEILING-CLAMPED REFILL IS REFUSED, NOT SOLD (S-3), on a clan-
    --      perked character (level-7 clan = 900-minute grant), and the meter's
    --      refills_left reached 0 BEFORE the day cap did.
    insert into public.clans (name, created_by) values ('__vigour_level_probe__', v_uidp)
      returning id into v_clan;
    update public.clans set level = 7 where id = v_clan;
    insert into public.clan_members (clan_id, user_id) values (v_clan, v_uidp);
    perform set_config('request.jwt.claim.sub', v_uidp::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(e9): no perked probe: %', v_r; end if;
    update public.player_state set gold = 100000000 where user_id = v_uidp and slot = 0;
    if (public.hr_vigour_of(v_uidp, 0)->>'grant_min')::int <= 720 then
      raise exception 'GATE(e9) CANNOT RUN: the perked probe has no grant above the floor'; end if;
    v_i := 0;
    loop
      v_vig := public.hr_vigour_of(v_uidp, 0);
      exit when (v_vig->>'refills_left')::int = 0;
      v_r := public.hr_vigour_refill__ungated(0, gen_random_uuid());
      if coalesce(v_r->>'ok', 'false') <> 'true' then
        raise exception 'GATE(e9): the meter offered a refill the verb refused: %', v_r; end if;
      v_i := v_i + 1;
      exit when v_i > r.refills_max;
    end loop;
    if v_i = 0 or v_i >= r.refills_max then
      raise exception 'GATE(e9) CANNOT RUN: % sold - the ceiling never bit before the day cap', v_i; end if;
    v_gold := (select gold from public.player_state where user_id = v_uidp and slot = 0);
    v_r := public.hr_vigour_refill__ungated(0, gen_random_uuid());
    if coalesce(v_r->>'error', '') <> 'vigour_ceiling'
       or (v_r->>'would_deliver')::int >= (v_r->>'minutes')::int then
      raise exception 'GATE(e9): a ceiling-clamped refill was answered %', v_r; end if;
    if (select gold from public.player_state where user_id = v_uidp and slot = 0) <> v_gold then
      raise exception 'GATE(e9): the refused partial refill took gold'; end if;

    -- (e10) NO RULE ROW → refill_unpriced by name, funded, no gold moves, the
    --       meter offers nothing, and minutes ALREADY BOUGHT are not taken back.
    v_vig := public.hr_vigour_of(v_uid, 0);
    delete from public.hr_vigour_price_rule;
    v_gold := (select gold from public.player_state where user_id = v_uid and slot = 0);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_vigour_refill__ungated(0, gen_random_uuid());
    if coalesce(v_r->>'error', '') <> 'refill_unpriced'
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold then
      raise exception 'GATE(e10): with no rule row a funded refill answered % or moved gold', v_r; end if;
    if (public.hr_vigour_of(v_uid, 0)->>'budget_min')::int <> (v_vig->>'budget_min')::int
       or (public.hr_vigour_of(v_uid, 0)->>'refills_left')::int <> 0
       or public.hr_vigour_of(v_uid, 0)->>'next_refill_gold' is not null then
      raise exception 'GATE(e10): closing the shop moved the meter: % -> %', v_vig, public.hr_vigour_of(v_uid, 0); end if;

    raise exception using errcode = 'HR925', message = 'vigour-price-by-level §7 complete - rolling back';
  exception when sqlstate 'HR925' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  -- (f) NOTHING LEAKED, AND THE RULE ROW SURVIVED (e10) DELETED IT INSIDE.
  if exists (select 1 from public.player_state     where user_id in (v_uid, v_uidh, v_uidp))
     or exists (select 1 from public.player_skills    where user_id in (v_uid, v_uidh, v_uidp))
     or exists (select 1 from public.player_inventory where user_id in (v_uid, v_uidh, v_uidp))
     or exists (select 1 from public.player_equipment where user_id in (v_uid, v_uidh, v_uidp))
     or exists (select 1 from public.player_progress  where user_id in (v_uid, v_uidh, v_uidp))
     or exists (select 1 from public.player_ledger    where user_id in (v_uid, v_uidh, v_uidp))
     or exists (select 1 from public.player_intents   where user_id in (v_uid, v_uidh, v_uidp))
     or exists (select 1 from public.clan_members     where user_id in (v_uid, v_uidh, v_uidp))
     or exists (select 1 from public.clans            where name = '__vigour_level_probe__')
     or exists (select 1 from auth.users             where id in (v_uid, v_uidh, v_uidp)) then
    raise exception 'GATE(f): §7 LEAKED a probe row';
  end if;
  if (select count(*) from public.hr_vigour_price_rule) <> 1 then
    raise exception 'GATE(f): the price rule did not survive the rolled-back probes'; end if;

  -- (g) THE DETECTOR IS GREEN, strict, on whatever body is live. This file
  --     grants hr_engine nothing and adds no client RPC.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    v_h := public.hr_assert_grant_hygiene(true);
    if v_h is null
       or jsonb_array_length(coalesce(v_h->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'ungated_client_rpcs', '[]'::jsonb)) <> 0
       or jsonb_array_length(coalesce(v_h->'engine_execute_outside_allowlist', '[]'::jsonb)) <> 0 then
      raise exception 'GATE(g): hr_assert_grant_hygiene is RED after this file: %', v_h; end if;
  end if;

  raise notice 'vigour-price-by-level: one rule row (5/day, level-scaled); one price function callable by nobody, read by the meter and the verb; no number and no second currency in the verb; no level/price argument resolves; EXECUTED - two levels price apart by exactly per_level x delta, the meter advertises what the verb then charges on every rung, each rung debits exactly the formula and journals the signed row, replays charge nothing, refill 6 is refused with no gold moved, gems and tokens never move, the ceiling-clamped refill is refused and the meter stopped offering first, and with no rule row a funded refill is refill_unpriced and bought minutes stand; detector green - net zero';
end $$;
