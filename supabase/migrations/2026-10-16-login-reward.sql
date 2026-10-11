-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-16-login-reward.sql — THE DAILY LOGIN REWARD: SUPPLIES, A x3 CAP,
--                                AND A MISSED DAY COSTS ONE STEP. POSTGRES
--                                RE-DERIVES THE PRICE AND REFUSES ANY OTHER.
--
-- STATUS: STAGED, NOT APPLIED - REVIEW ONLY. Moves gold, gems and inventory,
-- so it moves only on a Security GO and the Coordinator applies it (one file,
-- tools/apply-migration.mjs).
-- APPLY ORDER: DEPLOY THE EDGE FIRST (hr-accrue with the new
-- src/data/rewards.js), THEN THIS FILE, back to back. This file makes hr_apply
-- refuse a daily:login claim that is not priced from the new cycle, so an old
-- edge against it answers `login_price_mismatch` on every claim until the new
-- edge is live. The other order is harmless: a new edge against the old
-- database reads no `last` from hr_claim_lookup, prices everyone at day 1 of
-- the new (smaller) cycle and is verified by nothing, for as long as the gap.
--
-- ── WHY (the coherence audit, 2026-10-09, Top-10 #9) ────────────────────────
-- The old cycle paid 43,000 gold in week one (day 7: 20,000 gold + 30 gems),
-- the week multiplier ran to x26 (520,000 gold on one day-7 claim) and one
-- missed day reset the streak to day 1. Logging in out-earned playing, and
-- stepping away — the thing an idle game is about — cost everything. The new
-- cycle (src/data/rewards.js DAILY_LOGIN_CYCLE) pays supplies (cooked food,
-- seeds, one Bone Key a week) plus modest gold: 1,000 gold in week one (the
-- measured median first week earns ~950 from play and ~450 from the daily
-- quests). Gold and supplies scale +50% per completed week to a cap of x3
-- (week five); keys and gems never scale and pay ONLY when the BONUS IS DUE:
-- a straight arrival (the last claim was yesterday) AND no login claim in the
-- six server days before today paid keys or gems (read from player_ledger,
-- hr_login_bonus_ready). So keys and gems pay at most once per 7 server days
-- whatever the claim pattern — every other day cannot sit on day 7, and
-- "skip two, then claim day 6 and day 7" cannot re-take day 7's key every
-- four days (Security, 2026-10-10, twice). A missed day costs one step: a
-- player on day 5 who misses a day claims day 5 again, not day 1.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
--   §1 hr_login_catalogue(): the cycle, the week bonus, the cap and the streak
--      ceiling as ONE jsonb literal GENERATED from src/data/rewards.js between
--      BEGIN/END markers. tests/login-reward.mjs regenerates it and fails on any
--      byte of drift, and runs hr_login_price against priceDailyLogin over every
--      streak 1..120 (no second copy that can disagree in silence).
--   §2 hr_login_price(streak, bonus): the SQL pricer. hr_login_bonus_ready:
--      straight-arrival aside, whether keys/gems may pay today (ledger). hr_claim_last(...): the most
--      recent CLAIMED row before today and its gap in whole UTC days, measured
--      on the server clock. hr_login_streak(user, slot): the streak rule
--      (last + 1 − missed days, floored at 1, wrapped past the ceiling).
--   §3 hr_claim_lookup: returns `last` beside today/prev/rows (additive), so the
--      edge's deriveLoginStreak reads the server's gap and never parses a key.
--   §4 hr_login_claim_verify + ONE anchored hr_apply edit: inside the
--      progress_claim loop, a daily:login claim is re-priced UNDER THE
--      CHARACTER LOCK — the period must be today, the claimed row's value must
--      be the server's streak, and the delta's gold, gems and items must equal
--      hr_login_price exactly. Anything else raises `login_price_mismatch` and
--      the whole apply rolls back (gold, items, the progress row, the journal).
--      Edge decides what should happen; Postgres decides whether it may.
--   §5 self-check by execution on a probe character, net-zero.
--
-- ── CONCURRENCY + IDEMPOTENCY ──────────────────────────────────────────────
-- Unchanged and inherited: hr_apply takes the per-character advisory lock and
-- the version check before any of this runs; a second claim the same day
-- finds a 'claimed' row and is refused `not_claimable`; a replay with the same
-- intent key answers from player_intents before reaching the claim block. The
-- verify reads player_progress under that same lock, so it prices the history
-- the claim will be committed against.
--
-- ── NO CLIENT PATH ─────────────────────────────────────────────────────────
-- Every function here is revoked from public, anon, authenticated and
-- service_role; hr_claim_lookup stays hr_engine-only. The client never names a
-- period, an amount or a streak (request.js reads {kind, key} only).
--
-- ── COST AT 100x PLAYERS ───────────────────────────────────────────────────
-- One extra indexed read per login claim (≤ 31 rows of one (user, slot, kind,
-- key) prefix, the PK) inside hr_claim_lookup, and the same read again inside
-- hr_apply's verify; one claim per character per day. No new table, no new
-- row per claim (the claim row and the one ledger row are what existed).
--
-- RESTATEMENT-DEBT-ACK: hr_apply is a grandfathered patch chain and this adds one anchored edit (the login re-price inside progress_claim); a restatement of a 2,800-line money body in the same lane as the reward change is the larger risk, and slice 7 owns the restatement.
-- ⚠ AFTER APPLYING: re-seed `node tests/live-hash-drift.mjs --live --write`
--   (hr_apply), whys from `--codediff`, re-pin restore-census (Coordinator).
-- REVERSIBILITY: re-apply the previous hr_claim_lookup body (2026-08-16-claim-
--   reward.sql §1), remove the one hr_apply edit by hand, drop the five
--   functions. The old edge then prices the old cycle again. No data moves.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED, THE ANCHOR EXACTLY ONCE ────────────────
do $mig$
declare
  v_apply text; v_n int;
  c_anchor constant text := $anc$        if v_rows <> 1 then
          perform public.hr_reject('not_claimable',
            jsonb_build_object('kind', v_prog->>'kind', 'key', v_prog->>'key'));
        end if;$anc$;
begin
  if to_regclass('public.player_progress') is null then
    raise exception 'player_progress is missing — apply 2026-08-11-player-state.sql first'; end if;
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null
     or to_regprocedure('public.hr_claim_lookup(uuid,int,text,text)') is null
     or to_regprocedure('public.hr_utc_day_key(timestamptz)') is null
     or to_regprocedure('public.hr_reject(text,jsonb)') is null then
    raise exception 'hr_apply / hr_claim_lookup / hr_utc_day_key / hr_reject missing — apply the engine chain first'; end if;
  v_apply := replace(pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_apply, 'hr_login_claim_verify') = 0 then
    v_n := (length(v_apply) - length(replace(v_apply, c_anchor, ''))) / length(c_anchor);
    if v_n <> 1 then
      raise exception 'hr_apply: the progress_claim anchor appears % time(s), expected exactly 1', v_n; end if;
  end if;
end $mig$;

-- ── 1. THE CATALOGUE, GENERATED FROM src/data/rewards.js ───────────────────
create or replace function public.hr_login_catalogue()
returns jsonb language sql immutable set search_path = pg_catalog as $fn$
  select
  -- BEGIN GENERATED login-catalogue (src/data/rewards.js; tests/login-reward.mjs)
  '{"cycle":[{"gold":60,"items":{"cooked_shrimp":10}},{"gold":80,"items":{"turnip_seed":10}},{"gold":100,"items":{"cooked_shrimp":15}},{"gold":130,"items":{"carrot_seed":10}},{"gold":160,"items":{"cooked_herring":10}},{"gold":200,"items":{"turnip_seed":15}},{"gold":270,"gems":2,"keys":{"bone_key":1}}],"week_bonus":0.5,"max_mult":3,"streak_cap":35}'
  -- END GENERATED login-catalogue
  ::jsonb
$fn$;
revoke execute on function public.hr_login_catalogue() from public, anon, authenticated, service_role;

-- ── 2. THE PRICER, THE LAST CLAIM, THE STREAK ──────────────────────────────
-- priceDailyLogin, in SQL. round() on numeric rounds half away from zero, which
-- for these positive amounts is Math.round's half-up; the parity sweep in
-- tests/login-reward.mjs is what holds that true, not this sentence.
drop function if exists public.hr_login_price(int);
drop function if exists public.hr_login_price(int, boolean);
create or replace function public.hr_login_price(p_streak int, p_bonus boolean)
returns jsonb language plpgsql immutable set search_path = public, pg_catalog as $fn$
declare
  c_cat   constant jsonb := public.hr_login_catalogue();
  v_days  int := jsonb_array_length(c_cat->'cycle');
  v_s     int := greatest(1, coalesce(p_streak, 1));
  v_day   int; v_weeks int; v_mult numeric; v_row jsonb;
  v_items jsonb := '{}'::jsonb; v_id text; v_q numeric; v_n bigint;
begin
  v_day   := ((v_s - 1) % v_days) + 1;
  v_weeks := (v_s - 1) / v_days;
  v_mult  := least((c_cat->>'max_mult')::numeric, 1 + v_weeks * (c_cat->>'week_bonus')::numeric);
  v_row   := c_cat->'cycle'->(v_day - 1);
  for v_id, v_q in select key, value::numeric from jsonb_each_text(coalesce(v_row->'items', '{}'::jsonb)) loop
    v_n := round(v_q * v_mult)::bigint;
    if v_n > 0 then
      v_items := v_items || jsonb_build_object(v_id, coalesce((v_items->>v_id)::bigint, 0) + v_n); end if;
  end loop;
  -- keys (and gems, below) only when the bonus is due (hr_login_claim_verify:
  -- a straight arrival and none paid in the six server days before today)
  for v_id, v_q in select key, value::numeric from jsonb_each_text(
      case when coalesce(p_bonus, false) then coalesce(v_row->'keys', '{}'::jsonb) else '{}'::jsonb end) loop
    if v_q > 0 then
      v_items := v_items || jsonb_build_object(v_id, coalesce((v_items->>v_id)::bigint, 0) + v_q::bigint); end if;
  end loop;
  return jsonb_build_object(
    'streak', v_s, 'cycle_day', v_day, 'weeks', v_weeks, 'mult', v_mult,
    'gold', round(coalesce((v_row->>'gold')::numeric, 0) * v_mult)::bigint,
    'gems', case when coalesce(p_bonus, false) then coalesce((v_row->>'gems')::bigint, 0) else 0 end,
    'items', v_items);
end $fn$;
revoke execute on function public.hr_login_price(int, boolean) from public, anon, authenticated, service_role;

-- The most recent CLAIMED row of (kind, key) before today, and how many whole
-- UTC days ago it was. The key is hr_utc_day_key's 'YYYY-M-D'; a row whose key
-- is not that shape (a permanent '' row) is not a day and is skipped.
create or replace function public.hr_claim_last(p_user uuid, p_slot int, p_kind text, p_key text)
returns jsonb language sql stable set search_path = public, pg_catalog as $fn$
  select jsonb_build_object(
           'period', pp.period_key, 'value', pp.value, 'state', pp.state,
           'gap', (now() at time zone 'utc')::date - to_date(pp.period_key, 'YYYY-MM-DD'))
    from public.player_progress pp
   where pp.user_id = p_user and pp.slot = coalesce(p_slot, 0)
     and pp.kind = p_kind and pp.key = p_key
     and pp.state = 'claimed'
     and pp.period_key ~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$'
     and pp.period_key <> public.hr_utc_day_key(now())
   order by to_date(pp.period_key, 'YYYY-MM-DD') desc
   limit 1
$fn$;
revoke execute on function public.hr_claim_last(uuid, int, text, text) from public, anon, authenticated, service_role;

-- deriveLoginStreak, in SQL: last + 1 − (gap − 1), floored at 1, wrapped one
-- week at a time past the ceiling so a stored streak is bounded.
create or replace function public.hr_login_streak(p_user uuid, p_slot int)
returns int language plpgsql stable set search_path = public, pg_catalog as $fn$
declare
  c_cat  constant jsonb := public.hr_login_catalogue();
  v_cap  int := (c_cat->>'streak_cap')::int;
  v_days int := jsonb_array_length(c_cat->'cycle');
  v_last jsonb := public.hr_claim_last(p_user, p_slot, 'daily', 'login');
  v_val  bigint; v_gap int; v_s bigint;
begin
  if v_last is null or v_last->>'state' is distinct from 'claimed' then return 1; end if;
  v_val := (v_last->>'value')::bigint;
  v_gap := (v_last->>'gap')::int;
  if v_val is null or v_val < 1 or v_gap is null or v_gap < 1 then return 1; end if;
  v_s := v_val + 1 - (v_gap - 1);
  if v_s < 1 then return 1; end if;
  if v_s <= v_cap then return v_s::int; end if;
  return (v_cap - v_days + ((v_s - 1) % v_days) + 1)::int;
end $fn$;
revoke execute on function public.hr_login_streak(uuid, int) from public, anon, authenticated, service_role;

-- KEYS AND GEMS AT MOST ONCE PER 7 SERVER DAYS (Security, 2026-10-10). TRUE
-- unless a login claim journalled in the six UTC days before today paid gems
-- or a cycle key. Read from player_ledger — what was PAID, not what a streak
-- row says — on player_ledger_user_idx (user, slot, at desc), one 8-day range.
-- Today is excluded: the claim being verified journals itself in the same
-- apply, and a second claim today is already refused not_claimable. Ledger
-- retention is 90 days (2026-09-18-ledger-rollup-currencies.sql), far past 7.
create or replace function public.hr_login_bonus_ready(p_user uuid, p_slot int)
returns boolean language sql stable set search_path = public, pg_catalog as $fn$
  select not exists (
    select 1 from public.player_ledger l
     where l.user_id = p_user and l.slot = coalesce(p_slot, 0)
       and l.at >= now() - interval '8 days'
       and l.kind = 'quest' and l.intent like 'claim_reward:daily:login:%'
       and (l.at at time zone 'utc')::date
           between (now() at time zone 'utc')::date - 6 and (now() at time zone 'utc')::date - 1
       and (coalesce(l.gems_in, 0) > 0
            or exists (select 1
                         from jsonb_array_elements(public.hr_login_catalogue()->'cycle') d(r)
                        cross join lateral jsonb_object_keys(coalesce(d.r->'keys', '{}'::jsonb)) k
                        where coalesce(l.meta->'delta'->'i', '{}'::jsonb) ? k)))
$fn$;
revoke execute on function public.hr_login_bonus_ready(uuid, int) from public, anon, authenticated, service_role;

-- ── 3. hr_claim_lookup — `last` joins the answer (additive) ────────────────
-- The 2026-08-16-claim-reward.sql body verbatim, plus one key. today/prev/rows
-- are unchanged, so every other claimable reads exactly what it read before.
create or replace function public.hr_claim_lookup(
  p_user uuid, p_slot int, p_kind text, p_key text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today text;
  v_prev  text;
begin
  if p_user is null or p_kind is null or p_key is null then
    return jsonb_build_object('today', null, 'prev', null, 'rows', '{}'::jsonb, 'last', null);
  end if;
  -- THE SERVER'S CLOCK, THE SERVER'S DAY FUNCTION. Never an argument: a caller
  -- that can name the day can claim every day since launch in a loop.
  v_today := public.hr_utc_day_key(now());
  v_prev  := public.hr_utc_day_key(now() - interval '1 day');

  return jsonb_build_object(
    'today', v_today,
    'prev',  v_prev,
    'rows',  coalesce((
      select jsonb_object_agg(period_key,
               jsonb_build_object('value', value, 'state', state))
        from public.player_progress
       where user_id = p_user
         and slot    = coalesce(p_slot, 0)
         and kind    = p_kind
         and key     = p_key
         and period_key in ('', v_today, v_prev)), '{}'::jsonb),
    -- 2026-10-16-login-reward.sql: the last CLAIMED day before today and its
    -- gap, so a streak rule needs no key parsing and no clock of its own.
    'last',  public.hr_claim_last(p_user, p_slot, p_kind, p_key),
    -- …and, for the login claim only, whether keys/gems may pay today (the
    -- ledger rule above), so the edge prices what the verify will demand.
    'bonus_ready', case when p_kind = 'daily' and p_key = 'login'
                        then public.hr_login_bonus_ready(p_user, p_slot) end);
end $$;
revoke execute on function public.hr_claim_lookup(uuid, int, text, text) from public, anon, authenticated, service_role;
grant  execute on function public.hr_claim_lookup(uuid, int, text, text) to hr_engine;

-- ── 4. THE RE-PRICE, AND THE ONE hr_apply EDIT ─────────────────────────────
-- Called by hr_apply (SECURITY DEFINER, owner) from inside its protected block,
-- after progress_claim flipped today's daily:login row to 'claimed'. Raises
-- through hr_reject, so a refusal rolls back the whole apply.
create or replace function public.hr_login_claim_verify(p_uid uuid, p_slot int, p_period text, p_delta jsonb)
returns void language plpgsql stable set search_path = public, pg_catalog as $fn$
declare
  v_today  text := public.hr_utc_day_key(now());
  v_streak int;
  v_last   jsonb;
  v_q      jsonb;
  v_val    bigint;
  v_gold   bigint := coalesce((p_delta->>'gold')::bigint, 0);
  v_gems   bigint := coalesce((p_delta->>'gems')::bigint, 0);
  v_items  jsonb  := coalesce(p_delta->'items', '{}'::jsonb);
begin
  if p_period is distinct from v_today then
    perform public.hr_reject('login_price_mismatch',
      jsonb_build_object('why', 'period', 'period', p_period, 'today', v_today)); end if;
  v_streak := public.hr_login_streak(p_uid, p_slot);
  v_last := public.hr_claim_last(p_uid, p_slot, 'daily', 'login');
  -- The bonus is due on a STRAIGHT arrival (the last claim yesterday) AND only
  -- if no keys/gems were paid in the six server days before today.
  v_q := public.hr_login_price(v_streak,
    v_last is not null and v_last->>'state' = 'claimed'
    and (v_last->>'value')::bigint >= 1 and (v_last->>'gap')::int = 1
    and public.hr_login_bonus_ready(p_uid, p_slot));
  select value into v_val from public.player_progress
   where user_id = p_uid and slot = p_slot and kind = 'daily' and key = 'login'
     and period_key = v_today and state = 'claimed';
  if v_val is distinct from v_streak::bigint
     or v_gold <> (v_q->>'gold')::bigint
     or v_gems <> (v_q->>'gems')::bigint
     or jsonb_typeof(v_items) <> 'object' or v_items <> (v_q->'items') then
    perform public.hr_reject('login_price_mismatch',
      jsonb_build_object('why', 'price', 'expected', v_q,
        'proposed', jsonb_build_object('streak', v_val, 'gold', v_gold, 'gems', v_gems, 'items', v_items)));
  end if;
end $fn$;
revoke execute on function public.hr_login_claim_verify(uuid, int, text, jsonb) from public, anon, authenticated, service_role;

do $mig$
declare
  v_def text;
  c_anchor constant text := $anc$        if v_rows <> 1 then
          perform public.hr_reject('not_claimable',
            jsonb_build_object('kind', v_prog->>'kind', 'key', v_prog->>'key'));
        end if;$anc$;
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'hr_login_claim_verify') > 0 then
    raise notice 'hr_apply already re-prices the login claim — patch skipped'; return; end if;
  v_def := replace(v_def, c_anchor, c_anchor || $add$
        -- THE LOGIN CLAIM IS RE-PRICED HERE (2026-10-16-login-reward.sql):
        -- under this apply's character lock, the period must be today, the
        -- claimed row must hold the server's streak and the delta's gold, gems
        -- and items must equal hr_login_price. Edge proposes; this disposes.
        if v_prog->>'kind' = 'daily' and v_prog->>'key' = 'login' then
          perform public.hr_login_claim_verify(v_uid, v_slot, coalesce(v_prog->>'period', ''), p_delta);
        end if;$add$);
  execute v_def;
end $mig$;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from anon, authenticated, service_role;
grant  execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 5. SELF-CHECK (§4) — BY EXECUTION, ON A PROBE CHARACTER ────────────────
-- Every arm drives the REAL hr_apply against a fabricated character inside a
-- subtransaction discarded by a sentinel raise (HR948), so the block is
-- net-zero; a leak check runs after it.
do $$
declare
  v_uid   constant uuid := '00000000-0000-4000-c000-0000010a1d01';
  v_today text := public.hr_utc_day_key(now());
  v_r jsonb; v_ver bigint; v_g0 bigint; v_g1 bigint; v_q jsonb; v_lk jsonb; v_n int;
  v_fn text; v_missing text;
  -- One honest claim delta for streak s, the edge's shape (claim-reward.js claimDelta).
  -- Built inline below; `p` is the price.
begin
  -- (a) THE CATALOGUE AND THE PRICER, by value.
  if jsonb_array_length(public.hr_login_catalogue()->'cycle') <> 7
     or (public.hr_login_catalogue()->>'max_mult')::numeric <> 3
     or (public.hr_login_catalogue()->>'streak_cap')::int <> 35 then
    raise exception 'login-reward self-check (a): the catalogue is not the 7-day, x3, cap-35 cycle: %', public.hr_login_catalogue(); end if;
  v_q := public.hr_login_price(1, false);
  if (v_q->>'gold')::bigint <> 60 or v_q->'items' <> '{"cooked_shrimp":10}'::jsonb or (v_q->>'gems')::int <> 0 then
    raise exception 'login-reward self-check (a): day 1 prices %', v_q; end if;
  v_q := public.hr_login_price(35, true);
  if (v_q->>'gold')::bigint <> 810 or v_q->'items' <> '{"bone_key":1}'::jsonb or (v_q->>'gems')::int <> 2 then
    raise exception 'login-reward self-check (a): a straight day 35 (x3, day 7) prices %', v_q; end if;
  v_q := public.hr_login_price(7, false);
  if v_q->'items' <> '{}'::jsonb or (v_q->>'gems')::int <> 0 or (v_q->>'gold')::bigint <> 270 then
    raise exception 'login-reward self-check (a): a day 7 reached by a step back pays % — keys and gems are for a straight arrival only', v_q; end if;
  if (public.hr_login_price(100000, true)->>'mult')::numeric <> 3 then
    raise exception 'login-reward self-check (a): the multiplier is not capped at x3 (%)', public.hr_login_price(100000, true); end if;
  -- Every id the cycle pays is a catalogued item, or hr_apply would refuse the
  -- honest claim `unknown_item`.
  select string_agg(distinct k, ',') into v_missing
    from jsonb_array_elements(public.hr_login_catalogue()->'cycle') d(r)
   cross join lateral jsonb_object_keys(coalesce(d.r->'items', '{}') || coalesce(d.r->'keys', '{}')) k
   where not exists (select 1 from public.hr_items i where i.item_id = k);
  if v_missing is not null then
    raise exception 'login-reward self-check (a): the cycle pays uncatalogued item(s): %', v_missing; end if;

  -- (b) NO CLIENT PATH.
  foreach v_fn in array array['public.hr_login_catalogue()', 'public.hr_login_price(int,boolean)',
      'public.hr_claim_last(uuid,int,text,text)', 'public.hr_login_streak(uuid,int)',
      'public.hr_login_bonus_ready(uuid,int)',
      'public.hr_login_claim_verify(uuid,int,text,jsonb)', 'public.hr_claim_lookup(uuid,int,text,text)',
      'public.hr_apply(uuid,int,bigint,uuid,jsonb)'] loop
    if has_function_privilege('anon', v_fn, 'execute') or has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'login-reward self-check (b): a client role can execute %', v_fn; end if;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_claim_lookup(uuid,int,text,text)', 'execute') then
    raise exception 'login-reward self-check (b): hr_engine lost hr_claim_lookup — every claim would fail'; end if;
  v_n := (length(pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure))
          - length(replace(pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure),
                           'hr_login_claim_verify', ''))) / length('hr_login_claim_verify');
  if v_n <> 1 then
    raise exception 'login-reward self-check (b): hr_apply names hr_login_claim_verify % time(s), expected 1', v_n; end if;

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    perform public.hr_create_character(0);

    -- (c) A FRESH CHARACTER: no last claim, streak 1.
    v_lk := public.hr_claim_lookup(v_uid, 0, 'daily', 'login');
    if v_lk->'last' <> 'null'::jsonb or public.hr_login_streak(v_uid, 0) <> 1 then
      raise exception 'login-reward self-check (c): a fresh character reads last % / streak %',
                      v_lk->'last', public.hr_login_streak(v_uid, 0); end if;

    -- (d) A FORGED PRICE IS REFUSED AND MOVES NOTHING: one gold too many, an
    --     extra item, a streak of 2 on day 1, and yesterday's period.
    select version, gold into v_ver, v_g0 from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
      'gold', 61, 'items', '{"cooked_shrimp":10}'::jsonb,
      'progress', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today,'add',1,'state','done')),
      'progress_claim', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today)),
      'journal', jsonb_build_object('kind','quest','intent','lr:probe:gold')));
    if v_r->>'error' is distinct from 'login_price_mismatch' then
      raise exception 'login-reward self-check (d): 61 gold on day 1 returned %', v_r; end if;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
      'gold', 60, 'gems', 2, 'items', '{"cooked_shrimp":10}'::jsonb,
      'progress', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today,'add',1,'state','done')),
      'progress_claim', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today)),
      'journal', jsonb_build_object('kind','quest','intent','lr:probe:gems')));
    if v_r->>'error' is distinct from 'login_price_mismatch' then
      raise exception 'login-reward self-check (d): 2 forged gems on day 1 returned %', v_r; end if;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
      'gold', 60, 'items', '{"cooked_shrimp":10,"bone_key":1}'::jsonb,
      'progress', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today,'add',1,'state','done')),
      'progress_claim', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today)),
      'journal', jsonb_build_object('kind','quest','intent','lr:probe:items')));
    if v_r->>'error' is distinct from 'login_price_mismatch' then
      raise exception 'login-reward self-check (d): an extra Bone Key returned %', v_r; end if;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
      'gold', 80, 'items', '{"turnip_seed":10}'::jsonb,
      'progress', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today,'add',2,'state','done')),
      'progress_claim', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today)),
      'journal', jsonb_build_object('kind','quest','intent','lr:probe:streak')));
    if v_r->>'error' is distinct from 'login_price_mismatch' then
      raise exception 'login-reward self-check (d): a forged day-2 streak on a fresh character returned %', v_r; end if;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
      'gold', 60, 'items', '{"cooked_shrimp":10}'::jsonb,
      'progress', jsonb_build_array(jsonb_build_object('kind','daily','key','login',
                    'period', public.hr_utc_day_key(now() - interval '1 day'),'add',1,'state','done')),
      'progress_claim', jsonb_build_array(jsonb_build_object('kind','daily','key','login',
                    'period', public.hr_utc_day_key(now() - interval '1 day'))),
      'journal', jsonb_build_object('kind','quest','intent','lr:probe:period')));
    if v_r->>'error' is distinct from 'login_price_mismatch' then
      raise exception 'login-reward self-check (d): a claim filed under yesterday returned %', v_r; end if;
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = 0;
    if v_g1 <> v_g0 or exists (select 1 from public.player_progress where user_id = v_uid and key = 'login')
       or exists (select 1 from public.player_inventory where user_id = v_uid and item_id = 'bone_key') then
      raise exception 'login-reward self-check (d): a refused claim moved gold (% -> %) or wrote a row', v_g0, v_g1; end if;

    -- (e) THE HONEST DAY-1 CLAIM PAYS EXACTLY THE PRICE.
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
      'gold', 60, 'items', '{"cooked_shrimp":10}'::jsonb,
      'progress', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today,'add',1,'state','done')),
      'progress_claim', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today)),
      'journal', jsonb_build_object('kind','quest','intent','lr:probe:e')));
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = 0;
    if coalesce(v_r->>'ok', 'false') <> 'true' or v_g1 - v_g0 <> 60 then
      raise exception 'login-reward self-check (e): the honest day-1 claim returned % and moved % gold', v_r, v_g1 - v_g0; end if;

    -- (f) A MISSED DAY COSTS ONE STEP. The last claim was day 5, three days
    --     ago (two missed days): today is day 4, not day 6 and not day 1.
    delete from public.player_progress where user_id = v_uid and key = 'login';
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
      values (v_uid, 0, 'daily', 'login', public.hr_utc_day_key(now() - interval '3 days'), 5, 'claimed');
    if public.hr_login_streak(v_uid, 0) <> 4
       or (public.hr_claim_lookup(v_uid, 0, 'daily', 'login')->'last'->>'gap')::int <> 3 then
      raise exception 'login-reward self-check (f): day 5 three days ago gives streak % (gap %), expected 4 (3)',
                      public.hr_login_streak(v_uid, 0), public.hr_claim_lookup(v_uid, 0, 'daily', 'login')->'last'; end if;
    -- The lookup still answers the SERVER's today/prev and stays bounded to
    -- three period keys: the three-days-ago row reaches it only as `last`.
    v_lk := public.hr_claim_lookup(v_uid, 0, 'daily', 'login');
    if v_lk->>'today' is distinct from v_today
       or v_lk->>'prev' is distinct from public.hr_utc_day_key(now() - interval '1 day')
       or (v_lk->'rows') ? public.hr_utc_day_key(now() - interval '3 days') then
      raise exception 'login-reward self-check (f): hr_claim_lookup is not the server''s bounded view: %', v_lk; end if;
    -- …and only the 'claimed' row counts: a later 'done' row is not a claim.
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
      values (v_uid, 0, 'daily', 'login', public.hr_utc_day_key(now() - interval '1 day'), 30, 'done');
    if public.hr_login_streak(v_uid, 0) <> 4 then
      raise exception 'login-reward self-check (f): an unclaimed row moved the streak to %', public.hr_login_streak(v_uid, 0); end if;
    v_q := public.hr_login_price(4, false);
    select version, gold into v_ver, v_g0 from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
      'gold', (v_q->>'gold')::bigint, 'items', v_q->'items',
      'progress', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today,'add',4,'state','done')),
      'progress_claim', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today)),
      'journal', jsonb_build_object('kind','quest','intent','lr:probe:f')));
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = 0;
    if coalesce(v_r->>'ok', 'false') <> 'true' or v_g1 - v_g0 <> (v_q->>'gold')::bigint then
      raise exception 'login-reward self-check (f): the day-4 claim after a miss returned % (moved %)', v_r, v_g1 - v_g0; end if;

    -- (g) THE RESET-TO-ONE PRICE IS REFUSED after a miss (the old rule).
    delete from public.player_progress where user_id = v_uid and key = 'login' and period_key = v_today;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
      'gold', 60, 'items', '{"cooked_shrimp":10}'::jsonb,
      'progress', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today,'add',1,'state','done')),
      'progress_claim', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today)),
      'journal', jsonb_build_object('kind','quest','intent','lr:probe:g')));
    if v_r->>'error' is distinct from 'login_price_mismatch' then
      raise exception 'login-reward self-check (g): a reset-to-day-1 claim after one step back returned %', v_r; end if;

    -- (h) DAY 7 PAYS THE KEY AND THE GEMS; THE CEILING WRAPS.
    delete from public.player_progress where user_id = v_uid and key = 'login';
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
      values (v_uid, 0, 'daily', 'login', public.hr_utc_day_key(now() - interval '1 day'), 6, 'claimed');
    v_q := public.hr_login_price(public.hr_login_streak(v_uid, 0), true);
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
      'gold', (v_q->>'gold')::bigint, 'gems', (v_q->>'gems')::bigint, 'items', v_q->'items',
      'progress', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today,'add',7,'state','done')),
      'progress_claim', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today)),
      'journal', jsonb_build_object('kind','quest','intent','lr:probe:h')));
    if coalesce(v_r->>'ok', 'false') <> 'true'
       or not exists (select 1 from public.player_inventory where user_id = v_uid and item_id = 'bone_key' and qty >= 1) then
      raise exception 'login-reward self-check (h): the day-7 claim returned % or paid no Bone Key', v_r; end if;
    -- (i) THE SKIP PATTERN: day 7 claimed two days ago, yesterday skipped. The
    --     step back lands on day 7 again, and it pays NO key and NO gems.
    delete from public.player_progress where user_id = v_uid and key = 'login';
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
      values (v_uid, 0, 'daily', 'login', public.hr_utc_day_key(now() - interval '2 days'), 7, 'claimed');
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
      'gold', 270, 'gems', 2, 'items', '{"bone_key":1}'::jsonb,
      'progress', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today,'add',7,'state','done')),
      'progress_claim', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today)),
      'journal', jsonb_build_object('kind','quest','intent','lr:probe:skip')));
    if v_r->>'error' is distinct from 'login_price_mismatch' then
      raise exception 'login-reward self-check (i): a day 7 reached by skipping paid its key and gems (%)', v_r; end if;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
      'gold', 270,
      'progress', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today,'add',7,'state','done')),
      'progress_claim', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today)),
      'journal', jsonb_build_object('kind','quest','intent','lr:probe:skip2')));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'login-reward self-check (i): the gold-only day 7 after a skip was refused (%)', v_r; end if;
    -- (j) SKIP TWO, THEN STRAIGHT: day 7's key paid, two days skipped (back to
    --     day 6), then day 6 and day 7 on consecutive days. The second day 7
    --     is a straight arrival but lands FOUR days after the last key: it pays
    --     gold only. CONTROL first: a key seven days ago leaves today's due.
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta, at)
      values (v_uid, 0, 'quest', 'claim_reward:daily:login:lr-probe-7', 270, 270, 0, 1, 2,
              '{"delta":{"g":270,"m":2,"i":{"bone_key":1}}}'::jsonb, now() - interval '7 days');
    if not public.hr_login_bonus_ready(v_uid, 0) then
      raise exception 'login-reward self-check (j): a key paid seven days ago blocks today''s'; end if;
    delete from public.player_progress where user_id = v_uid and key = 'login';
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
      values (v_uid, 0, 'daily', 'login', public.hr_utc_day_key(now() - interval '1 day'), 6, 'claimed');
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta, at)
      values (v_uid, 0, 'quest', 'claim_reward:daily:login:lr-probe-4', 270, 270, 0, 1, 2,
              '{"delta":{"g":270,"m":2,"i":{"bone_key":1}}}'::jsonb, now() - interval '4 days');
    if public.hr_login_bonus_ready(v_uid, 0)
       or (public.hr_claim_lookup(v_uid, 0, 'daily', 'login')->>'bonus_ready')::boolean is distinct from false then
      raise exception 'login-reward self-check (j): a key paid four days ago leaves another due'; end if;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
      'gold', 270, 'gems', 2, 'items', '{"bone_key":1}'::jsonb,
      'progress', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today,'add',7,'state','done')),
      'progress_claim', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today)),
      'journal', jsonb_build_object('kind','quest','intent','lr:probe:j')));
    if v_r->>'error' is distinct from 'login_price_mismatch' then
      raise exception 'login-reward self-check (j): skip two then a straight day 7 paid its key again (%)', v_r; end if;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
      'gold', 270,
      'progress', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today,'add',7,'state','done')),
      'progress_claim', jsonb_build_array(jsonb_build_object('kind','daily','key','login','period',v_today)),
      'journal', jsonb_build_object('kind','quest','intent','lr:probe:j2')));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'login-reward self-check (j): the gold-only straight day 7 inside the week was refused (%)', v_r; end if;

    delete from public.player_progress where user_id = v_uid and key = 'login';
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
      values (v_uid, 0, 'daily', 'login', public.hr_utc_day_key(now() - interval '1 day'), 35, 'claimed');
    if public.hr_login_streak(v_uid, 0) <> 29 then
      raise exception 'login-reward self-check (h): streak 35 then a claim gives %, expected the wrap to 29',
                      public.hr_login_streak(v_uid, 0); end if;

    raise exception using errcode = 'HR948', message = 'login-reward §4 complete — rolling back';
  exception when sqlstate 'HR948' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'login-reward self-check: §4 LEAKED a probe row'; end if;

  raise notice 'login-reward self-check PASSED: (a) the generated cycle prices day 1, the x3 day 7 and caps the '
               'multiplier, and pays only catalogued items; (b) no client role reaches any of it and hr_apply '
               're-prices once; (c) a fresh character is day 1; (d) a forged gold, item, streak or period is refused '
               'and moves nothing; (e) the honest claim pays the price; (f) a missed day costs one step and an '
               'unclaimed row does not count; (g) the old reset-to-day-1 price is refused; (h) day 7 pays the key '
               'and the ceiling wraps; (i) a day 7 reached by skipping pays no key and no gems; (j) keys and gems pay '
               'at most once per 7 server days, a straight day 7 four days after the last key pays gold only';
end $$;
