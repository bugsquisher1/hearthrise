-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1059-company-trades.sql — TRADE LEVELS BELONG TO THE COMPANY, AND EACH HERO'S TOWN WORK HAS A DAY
--   (lane/r12-company-trades, backend-architect, 2026-11-22; FB-10 slice 1; 11-build-audit.md R12).
--
-- STATUS: supabase/migration-notes/1059-company-trades.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 1059-company-trades-catalogue.generated.sql (hr_work_day), after
--   1026-job-counts.sql (re-cut in this lane) and 1040-rested-bank-cut.sql (re-derived in this lane: hr_apply is its image here).
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §8 self-check.
-- EDGE: hr-accrue moves with it (accrual.js stops a town job at the work day's end; accrue-gather.js and accrue-artisan.js propose
--   `work_to` on every town-work window; envelope.js reads the `work_day` section; tick-shadow.js carries the day between polls; tick-
--   contract.js folds `work_to`). Apply, then deploy: an old edge on this database settles a window that ends a job by its `accrued_to`
--   (now: the day counts the job's idle tail, the safe direction) and a window past the cap is refused `work_cap`; a new edge on the
--   old database reads no `work_day` section and proposes no `work_to` (its self-configuring switch). Deploy soon after the apply.
-- RESTATEMENT-DEBT-ACK: hr_apply was restated whole by 1040-rested-bank-cut.sql (chain depth 0); this file adds FOUR anchored
--   edits marked WORK-DAY, each matched once (depth 1), rather than a second 158k-char restatement a day after the first.
--
-- ── THE RULINGS (Tyler 2026-11-22, newest wins) ─────────────────────────────
--   CR-Q1 a: trades are the company's, not each hero's ("Trade Levels are owned by the company"). CR-Q3 b: each hero's town work is
--   capped each day, longer with Premium. Work is bought in 2 h blocks at x1.5, at most 4 a day: the buy is a later slice; the cap
--   counts what the ledger says was bought (hr_work_extra_ms: the hook, 0 until a `work` row joins hr_time_blocks).
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- public.company_trades (user_id, trade_id, xp)    NEW: THE ONE COPY of a company's trade XP. A trade is a skill whose hr_skills.cat
--   is in hr_work_day.trade_cats (gather, artisan: Woodcutting, Mining, Fishing, Farming, Cooking, Crafting, Smithing, Runecrafting).
--   RLS on, no policy, no client grant: the client reads it through the projection below.
-- THE PROJECTION. Every hero keeps its player_skills row for every trade, and that row IS the company's XP: every reader (the
--   envelope, every gate, the engine) stays as it was. The trigger hr_trade_row_sync (BEFORE INSERT OR UPDATE OF xp ON player_skills,
--   trade rows only) is the only way the two meet:
--     an UPDATE of a trade row's xp sets the company's XP to the new value (every writer's `xp = xp + n` reads the company's total,
--       because the row IS it) and writes it to every other hero's row;
--     an INSERT of a row the hero has not got adds its xp to the company (a seed adds 0) and the row is born at the company's total;
--     an INSERT that hits a row the hero has got (an upsert) does nothing: its DO UPDATE is the write.
--   So every writer stays as it was too: hr_apply's XP and remainder loops, the three farm verbs, hero creation.
-- player_state.work_day date, work_ms bigint   NEW: the last UTC day the hero did town work and the ms of it that day.
-- hr_work_fold(day, used, from, to, base, extra, today) -> { ok, day, used_ms, over_ms, left_ms }   the SQL twin of
--   src/core/work-day.js foldWork (tests/company-trades.mjs CT-TWIN pins them equal). hr_work_base_ms(user, slot): the free day,
--   or the free day and Premium's extra (hr_premium_active, the one premium check). hr_work_extra_ms(user, slot): bought work today.
-- THE SECTION `work_day` (hr_work_day_view) { today, day, used_ms, base_ms, extra_ms, cap_ms, today_ms, left_ms, premium, trades }; its
--   engine half is hr_work_state { today, day, used_ms, base_ms, extra_ms }, which the world tick's town read carries too:
--   hr_tick_town_state (1048-narrow-town-read.sql) RESTATED WHOLE with one key, `work_day` (§5b; pinned to 1048's image or its own).
-- hr_apply (WORK-DAY): a window of town work (an accrual journalled gather or craft of a hero whose SERVER pointer is a work kind)
--   spends [old watermark, its end] of the hero's day. Its end is the engine's `work_to` (a NEW delta key: where the window's work
--   ended; for a window cut short by an absence's cap, before the watermark jumps past the unpaid tail), else the new watermark (a
--   window the job continues past) or the proposed accrued_to (a window that ends the job), held into [old watermark, the new
--   watermark]. A day past its cap is refused `work_cap`; a counted job the cap ended says end `work_cap` (1026's job_end); a NEW town
--   job on a day with no work left is refused `work_cap`.
-- ERROR TAXONOMY: work_cap (NEW: the day's town work is used up, or a window would pass it; detail { day, used_ms, over_ms, left_ms }),
--   bad_delta (a `work_to` that is not an instant, or beside no accrual).
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
-- THE ACCOUNT'S TRADE KEY (hr_trade_lock: pg_advisory_xact_lock on 'hr_trades:<user>') is taken by the trigger before it reads or
--   writes company_trades or another hero's row. On an upsert (every production writer: hr_apply, the farm verbs, hero creation) the
--   BEFORE INSERT trigger fires before the row is locked, so a trade row is never locked without the key: two heroes crediting Mining
--   at once serialize on the key, and the second reads the first's total (no lost update, no double count). The key is the LAST lock a
--   writer takes (after its hero, the farm, the depot and the purse); after it a writer touches only trade rows, the company row and its
--   own hero's rows, which no other holder of the key wants. The fan-out UPDATEs other heroes' rows in place (no key column moves, so no
--   foreign-key lock on their player_state rows, which their own settles may hold). A plain `update ... set xp` on a trade row (no
--   production writer does one) takes the row before the key: safe alone, and named in §8.
-- THE WORK DAY is written only inside hr_apply under the hero's lock and row (`for update`), from the server's own watermark and
--   clock. A replayed settle key returns before the UPDATE, so a window is spent once.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- No new client verb, grant or policy. One new delta key (`work_to`), engine-only (hr_apply runs only as hr_engine), which can only
--   SHORTEN what a window spends, never pay more: payment is unchanged and bounded as before; the cap the engine already obeys is
--   now re-checked. The day trusts the engine's `work_to` as it trusts the window's yield: a buggy engine that both ignored the stop
--   AND under-stated `work_to` would pass the cap (two independent defects; tests/company-trades.mjs pins the honest engine's
--   `work_to` to its paid span on both doors). Trade XP stays monotonic for every production
--   writer (hr_apply refuses a negative XP delta). Money surface: XP credit moves from the hero to the company; ON THE PRE-EA
--   SECURITY LIST (the fold below raises sibling heroes' trade XP to their company's best).
--
-- ── THE FOLD (once, at the apply) ───────────────────────────────────────────
-- Each company's XP in each trade is the BEST its heroes held (max, never the sum: nothing is minted). Every hero's row is set to
--   it, and every hero gets a row for every trade. One player_ledger row an account whose rows moved (kind admin, intent
--   company_trades_fold, the totals in meta). A second apply finds every row already equal and writes nothing.
--
-- ── COST AT 100x PLAYERS (2,000 accounts x 4 heroes) ─────────────────────────
-- A town-work settle that credits one trade writes 1 company row and the account's other 3 hero rows (HOT updates, ~4 x 60 B), and
--   reads hr_work_day once; the ledger is not scanned until bought work exists (hr_work_extra_ms reads hr_time_blocks first). Rows:
--   company_trades 2,000 x 8 = 16,000 (~1 MB). Two columns on player_state (~12 B a hero). No new journal row a window.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply 1048's hr_tick_town_state and 1040's image of hr_apply (the four WORK-DAY edits go); drop the trigger hr_trade_row_sync and
--   its function, the section row, hr_work_day_view, hr_work_state, hr_work_fold, hr_work_base_ms, hr_work_extra_ms, hr_work_kinds,
--   hr_trade_lock, hr_trade_is, the two columns and company_trades. Per-hero trade rows keep the company's totals (the fold is not
--   undone: a hero keeps the XP it reads).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.hr_work_day') is null or not exists (select 1 from public.hr_work_day) then
    raise exception 'PRECONDITION: the work-day catalogue first (1059-company-trades-catalogue.generated.sql)'; end if;
  if to_regclass('public.hr_time_blocks') is null then
    raise exception 'PRECONDITION: the bought-time catalogue first (1058-hunting-blocks-catalogue.generated.sql)'; end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_state' and column_name = 'job_end') then
    raise exception 'PRECONDITION: 1026-job-counts.sql first (player_state.job_end)'; end if;
  if to_regprocedure('public.hr_premium_active(uuid,integer,timestamp with time zone)') is null
     or to_regprocedure('public.hr_utc_day_start(timestamp with time zone)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null or to_regclass('public.hr_state_sections') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
  -- THE PIN: hr_apply is 1040-rested-bank-cut.sql's image (re-derived in this lane) or this file's own (a second apply).
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure;
  if v_md5 not in ('dd5c083803e9a54ebe8b7765ab5c2983', '4c9289bb76e2f7eec7d862bb8a7ac9e1') then
    raise exception 'PIN: hr_apply is neither 1040''s image nor this file''s own (md5 %): another file moved it; re-derive', v_md5; end if;
end $mig$;

-- ── §1 THE COMPANY'S TRADES ──────────────────────────────────────────────────
create table if not exists public.company_trades (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  trade_id   text        not null,
  xp         bigint      not null default 0 check (xp >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, trade_id)
);
alter table public.company_trades enable row level security;
revoke all on public.company_trades from public, anon, authenticated, service_role;
comment on table public.company_trades is
  '1059-company-trades.sql: the one copy of a company''s trade XP (Tyler CR-Q1 a). Every hero''s player_skills row for a trade is its projection (hr_trade_row_sync).';

-- ── §2 WHAT A TRADE IS, AND THE ACCOUNT'S TRADE KEY ──────────────────────────
-- plpgsql, not sql: each is called per row or per settle, and a plpgsql body's plan is cached for the backend (tests/settle-budget.mjs SB-3).
create or replace function public.hr_trade_is(p_skill text)
returns boolean language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- COMPANY-TRADES (1059-company-trades.sql): a skill whose catalogue category is a trade category (hr_work_day, src/data/work-day.js).
  return exists (select 1 from public.hr_skills k join public.hr_work_day w on w.id
                  where k.skill_id = p_skill and k.cat = any (w.trade_cats));
end $fn$;

create or replace function public.hr_trade_lock(p_user uuid)
returns void language plpgsql set search_path = public, pg_catalog as $fn$
begin
  -- COMPANY-TRADES (1059-company-trades.sql): the account's trade key, the last lock a writer of trade XP takes (header, CONCURRENCY).
  perform pg_advisory_xact_lock(hashtextextended('hr_trades:' || p_user::text, 0));
end $fn$;

create or replace function public.hr_work_kinds()
returns text[] language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- COMPANY-TRADES (1059-company-trades.sql): the pointer kinds that are town work (hr_work_day, src/data/work-day.js WORK_KINDS).
  return coalesce((select w.work_kinds from public.hr_work_day w where w.id), '{}'::text[]);
end $fn$;

-- ── §3 THE FOLD: EACH COMPANY'S BEST, ON EVERY HERO (once; a second apply writes nothing) ─────────────────────────────────────
drop trigger if exists hr_trade_row_sync on public.player_skills;
do $mig$
declare r record; v_moved int; v_total int := 0; v_accts int := 0;
begin
  insert into public.company_trades as c (user_id, trade_id, xp)
    select s.user_id, s.skill_id, max(s.xp) from public.player_skills s
     where public.hr_trade_is(s.skill_id)
     group by s.user_id, s.skill_id
    on conflict (user_id, trade_id) do update set xp = greatest(c.xp, excluded.xp)
     where excluded.xp > c.xp;
  -- every hero a row for every trade (a hero older than a trade, the b370 lesson), at its company's total
  insert into public.player_skills (user_id, slot, skill_id, xp)
    select ps.user_id, ps.slot, k.skill_id, coalesce(c.xp, 0)
      from public.player_state ps
      cross join public.hr_skills k
      left join public.company_trades c on c.user_id = ps.user_id and c.trade_id = k.skill_id
     where public.hr_trade_is(k.skill_id)
    on conflict (user_id, slot, skill_id) do nothing;
  for r in select c.user_id, jsonb_object_agg(c.trade_id, c.xp order by c.trade_id) as trades,
                  (select min(ps.slot) from public.player_state ps where ps.user_id = c.user_id) as slot
             from public.company_trades c
            where exists (select 1 from public.player_skills s where s.user_id = c.user_id and s.skill_id = c.trade_id and s.xp <> c.xp)
            group by c.user_id loop
    update public.player_skills s set xp = c.xp
      from public.company_trades c
     where c.user_id = r.user_id and s.user_id = c.user_id and s.skill_id = c.trade_id and s.xp <> c.xp;
    get diagnostics v_moved = row_count;
    if r.slot is not null then
      insert into public.player_ledger (user_id, slot, kind, intent, meta)
        values (r.user_id, r.slot, 'admin', 'company_trades_fold',
                jsonb_build_object('trades', r.trades, 'rows_raised', v_moved, 'why', 'Tyler 2026-11-22 CR-Q1 a: trade Levels are the company''s'));
    end if;
    v_total := v_total + v_moved; v_accts := v_accts + 1;
  end loop;
  raise notice 'company-trades fold: % account(s), % hero trade row(s) raised to their company''s best (max, nothing minted)', v_accts, v_total;
end $mig$;

-- ── §4 THE PROJECTION ────────────────────────────────────────────────────────
create or replace function public.hr_trade_row_sync()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_x bigint;
begin
  -- COMPANY-TRADES (1059-company-trades.sql): a trade row IS its company's XP. The rules are the file header's THE PROJECTION.
  if not public.hr_trade_is(new.skill_id) then return new; end if;
  perform public.hr_trade_lock(new.user_id);
  if tg_op = 'INSERT' then
    -- an upsert of a row the hero has: its DO UPDATE is the write (and fires this trigger as an UPDATE)
    if exists (select 1 from public.player_skills s where s.user_id = new.user_id and s.slot = new.slot and s.skill_id = new.skill_id) then
      return new;
    end if;
    insert into public.company_trades as c (user_id, trade_id, xp) values (new.user_id, new.skill_id, greatest(0, coalesce(new.xp, 0)))
      on conflict (user_id, trade_id) do update set xp = c.xp + greatest(0, coalesce(excluded.xp, 0)), updated_at = now()
      returning c.xp into v_x;
  else
    if new.xp is not distinct from old.xp then return new; end if;
    select c.xp into v_x from public.company_trades c where c.user_id = new.user_id and c.trade_id = new.skill_id;
    -- the fan-out's own write (or a write of the total it already holds)
    if new.xp is not distinct from v_x then return new; end if;
    insert into public.company_trades as c (user_id, trade_id, xp) values (new.user_id, new.skill_id, greatest(0, coalesce(new.xp, 0)))
      on conflict (user_id, trade_id) do update set xp = greatest(0, coalesce(excluded.xp, 0)), updated_at = now()
      returning c.xp into v_x;
  end if;
  new.xp := v_x;
  -- every other hero of the company reads the same total (rows in place: no key column moves)
  update public.player_skills s set xp = v_x
   where s.user_id = new.user_id and s.skill_id = new.skill_id and s.slot <> new.slot and s.xp is distinct from v_x;
  return new;
end $fn$;
create trigger hr_trade_row_sync before insert or update of xp on public.player_skills
  for each row execute function public.hr_trade_row_sync();

-- ── §5 THE WORK DAY ──────────────────────────────────────────────────────────
alter table public.player_state add column if not exists work_day date;
alter table public.player_state add column if not exists work_ms bigint not null default 0;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_state_work_ms_ck') then
    alter table public.player_state add constraint player_state_work_ms_ck check (work_ms >= 0 and work_ms <= 86400000);
  end if;
end $mig$;
comment on column public.player_state.work_day is
  '1059-company-trades.sql: the last UTC day this hero did town work (work_ms is that day''s). Written only by hr_apply.';

create or replace function public.hr_work_fold(p_day date, p_used bigint, p_from timestamptz, p_to timestamptz,
                                               p_base bigint, p_extra bigint, p_today date)
returns jsonb language plpgsql immutable set search_path = public, pg_catalog as $fn$
declare
  c_day constant bigint := 86400000;
  v_from bigint := floor(extract(epoch from p_from) * 1000)::bigint;
  v_to   bigint;
  v_dms  bigint := case when p_day is null then null else (p_day - date '1970-01-01')::bigint * 86400000 end;
  v_tms  bigint := (p_today - date '1970-01-01')::bigint * 86400000;
  v_d bigint; v_last bigint; v_i int := 0; v_ov bigint; v_cap bigint; v_before bigint;
  v_over bigint := 0; v_out bigint; v_used bigint := 0; v_outcap bigint := 0;
begin
  -- WORK-DAY (1059-company-trades.sql): the SQL twin of src/core/work-day.js foldWork. What the window of work [p_from, p_to] spends of
  -- a hero whose last work day is p_day (p_used ms of it): its overlap with each UTC day it touches, each day held to its cap (p_base,
  -- plus p_extra on p_today only). Returns the state after it (the day p_to falls in) and by how much the window took the worst day
  -- past its cap. A day already past its cap (Premium ran out) may not grow, but a window that adds nothing passes: a job can always end.
  v_to := greatest(v_from, floor(extract(epoch from p_to) * 1000)::bigint);
  v_d := (v_from / c_day) * c_day;
  v_out := v_d;
  v_last := (v_to / c_day) * c_day;
  while v_d <= v_last and v_i < 8 loop
    v_ov := greatest(0, least(v_to, v_d + c_day) - greatest(v_from, v_d));
    v_before := case when v_d = v_dms then greatest(0, coalesce(p_used, 0)) else 0 end;
    v_used := v_before + v_ov;
    v_cap := greatest(0, coalesce(p_base, 0)) + case when v_d = v_tms then greatest(0, coalesce(p_extra, 0)) else 0 end;
    v_over := greatest(v_over, v_used - greatest(v_cap, v_before));
    v_out := v_d; v_outcap := v_cap;
    v_d := v_d + c_day; v_i := v_i + 1;
  end loop;
  if v_last - (v_from / c_day) * c_day >= 8 * c_day then v_over := greatest(v_over, c_day); end if;
  return jsonb_build_object('ok', v_over <= 0, 'day', (date '1970-01-01' + (v_out / c_day)::int)::text, 'used_ms', v_used,
                            'over_ms', greatest(0, v_over), 'left_ms', greatest(0, v_outcap - v_used));
end $fn$;

create or replace function public.hr_work_base_ms(p_user uuid, p_slot integer)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- WORK-DAY (1059-company-trades.sql): the hero's base work day, the free day or the free day and Premium's extra (CR-Q3 b).
  return (select ((w.free_min + case when public.hr_premium_active(p_user, p_slot, now()) then w.premium_extra_min else 0 end)::bigint * 60000)
            from public.hr_work_day w where w.id);
end $fn$;

create or replace function public.hr_work_extra_ms(p_user uuid, p_slot integer)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
declare v_block bigint;
begin
  -- WORK-DAY (1059-company-trades.sql): THE HOOK for bought work (Tyler 2026-11-22: 2 h blocks, x1.5, at most 4 a day; a later slice).
  -- Today's bought blocks of kind `work` (player_ledger kind shop, intent time_buy:work:<price>, the prefix hr_time_buy journals) times
  -- that kind's block. Until hr_time_blocks has a `work` row the ledger is not read and this is 0.
  select b.block_min::bigint * 60000 into v_block from public.hr_time_blocks b where b.kind = 'work';
  if v_block is null then return 0; end if;
  return v_block * (select count(*) from public.player_ledger l
                     where l.user_id = p_user and l.slot = p_slot and l.kind = 'shop' and l.intent like 'time\_buy:work:%'
                       and l.at >= public.hr_utc_day_start(now()));
end $fn$;

create or replace function public.hr_work_state(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  -- WORK-DAY (1059-company-trades.sql): what the ENGINE reads of the hero's work day (src/core/work-day.js workStateOf): the server's
  -- today, the stored day and its ms, the base day and today's bought work. The `work_day` section and the world tick's town read
  -- (hr_tick_town_state) both carry it, so the engine's inputs are one definition on every door.
  return (select jsonb_build_object('today', ((now() at time zone 'utc')::date)::text, 'day', ps.work_day::text, 'used_ms', ps.work_ms,
                   'base_ms', public.hr_work_base_ms(p_user, p_slot), 'extra_ms', public.hr_work_extra_ms(p_user, p_slot))
            from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot);
end $fn$;

create or replace function public.hr_work_day_view(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v jsonb; v_cap bigint; v_t bigint;
begin
  -- THE SECTION `work_day` (1059-company-trades.sql): the hero's work day as the server holds it. The engine's half (hr_work_state:
  -- `day`/`used_ms` the stored state it starts from); `today_ms`/`left_ms`/`cap_ms` today's, as of the last settle; `trades` the
  -- company's trades (every hero reads their Levels in `skills`, the projection of company_trades).
  v := public.hr_work_state(p_user, p_slot);
  if v is null then return null; end if;
  v_cap := (v->>'base_ms')::bigint + (v->>'extra_ms')::bigint;
  v_t := case when v->>'day' = v->>'today' then (v->>'used_ms')::bigint else 0 end;
  return v || jsonb_build_object('cap_ms', v_cap, 'today_ms', v_t, 'left_ms', greatest(0, v_cap - v_t),
    'premium', public.hr_premium_active(p_user, p_slot, now()),
    'trades', coalesce((select jsonb_agg(k.skill_id order by k.skill_id) from public.hr_skills k where public.hr_trade_is(k.skill_id)), '[]'::jsonb));
end $fn$;
insert into public.hr_state_sections (key, fn, note) values
  ('work_day', 'hr_work_day_view', '1059-company-trades.sql: the hero''s town work day (used, cap, left) and the company''s trades')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §5b THE WORLD TICK'S TOWN READ CARRIES THE DAY (1048-narrow-town-read.sql's hr_tick_town_state, restated whole + one key) ─────
-- The tick builds a town hero's engine inputs from this read (envelope.js engineInputsFromEnvelope), so without `work_day` it would
-- not stop a job at the day's end and hr_apply would refuse its window. The key is hr_work_state, the engine's half of the section.
do $mig$
declare v_md5 text;
begin
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_tick_town_state(uuid,integer)');
  if v_md5 is null then raise exception 'PRECONDITION: 1048-narrow-town-read.sql first (hr_tick_town_state)'; end if;
  if v_md5 not in ('e702b0fd863d73ea2a9f88704023ed5b', 'c11bd877a9342fbe9c79caa679e6f538') then
    raise exception 'PIN: hr_tick_town_state is neither 1048''s image nor this file''s own (md5 %): another file moved it; re-derive', v_md5; end if;
end $mig$;
create or replace function public.hr_tick_town_state(p_user uuid, p_slot integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare
  v_role text;
  v_st   public.player_state%rowtype;
  v_m    jsonb;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role', 'hr_tick') then
    raise exception 'hr_tick_town_state: not callable by %', v_role using errcode = '42501';
  end if;
  select * into v_st from public.player_state where user_id = p_user and slot = coalesce(p_slot, 0);
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  v_m := public.hr_hunt_member_state(p_user, v_st.slot);
  if coalesce((v_m ->> 'ok')::boolean, false) is not true then return v_m; end if;
  return v_m || jsonb_build_object(
    'now', now(),
    'state', (v_m -> 'state') || jsonb_build_object(
      'slot', v_st.slot,
      'active_kind', v_st.active_kind, 'active_id', v_st.active_id,
      'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to,
      'bank_cap', v_st.bank_cap, 'tool_carry', v_st.tool_carry, 'fight', v_st.fight),
    'bank', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.account_bank where user_id = p_user), '{}'::jsonb),
    'bench_run', public.hr_bench_run_view(p_user, v_st.slot),
    'bench_tax', public.hr_bench_tax_view(p_user, v_st.slot),
    'skill_inputs', public.hr_skill_inputs_view(p_user, v_st.slot),
    -- WORK-DAY (1059-company-trades.sql): the hero's work day, the engine's half of the `work_day` section
    'work_day', public.hr_work_state(p_user, v_st.slot));
end $fn$;

-- ── §6 hr_apply: FOUR ANCHORED EDITS (WORK-DAY; RESTATEMENT-DEBT-ACK in the header) ──────────────────────────────────────────
do $mig$
declare
  v_def text; v_n int; v_i int;
  a_old text[]; a_new text[];
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'WORK-DAY (1059') > 0 then raise notice 'hr_apply already carries WORK-DAY: edits skipped'; return; end if;
  a_old := array[
$a$  v_job_count int; v_job_next text; v_job_end jsonb; v_job_left int;
$a$,
$a$    'workers', 'workers_accrued_to'];$a$,
$a$    update public.player_state
       set -- (gold: the ACCOUNT purse, moved at the GOLD block above, 2026-12-15-account-gold.sql)
$a$,
$a$           accrued_to   = v_accrued,
$a$];
  a_new := array[
$a$  v_job_count int; v_job_next text; v_job_end jsonb; v_job_left int;
  -- WORK-DAY (1059-company-trades.sql): what this window spends of the hero's work day, and where its work ended.
  v_work jsonb; v_work_end timestamptz; v_work_left bigint;
$a$,
$a$    'workers', 'workers_accrued_to',
    -- WORK-DAY (1059-company-trades.sql): the instant a window's work ended (engine output, never client input), beside its accrual.
    -- The work day spends up to it, never past the window's own watermark (for a window that ends the job, now()).
    'work_to'];$a$,
$a$    -- ── WORK-DAY (1059-company-trades.sql; Tyler 2026-11-22 CR-Q3 b: each hero's town work is capped each day) ────────────────
    -- A window of town work (an accrual journalled gather or craft of a hero whose SERVER pointer is a work kind) spends [the old
    -- watermark, its end] of the hero's day, split at UTC midnights (hr_work_fold, the twin of src/core/work-day.js foldWork). Its end:
    -- the engine's `work_to`, else the new watermark (a window the job continues past) or the proposed `accrued_to` (a window that
    -- ENDS the job), held into [old watermark, the new watermark]. A day past its cap is refused: the engine stops the job at the cap
    -- (accrual.js), so an honest window never is. A counted job the cap ended says so; a NEW town job on a spent day is refused.
    v_work := null;
    if p_delta ? 'work_to' then
      if not (p_delta ? 'accrued_to') or jsonb_typeof(p_delta->'work_to') <> 'string'
         or (p_delta->>'work_to') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$' then
        perform public.hr_reject('bad_delta', jsonb_build_object('why', 'work_to is an instant, beside an accrual'));
      end if;
    end if;
    if p_delta ? 'accrued_to' and coalesce(p_delta #>> '{journal,kind}', '') in ('gather', 'craft')
       and v_st.active_kind = any (public.hr_work_kinds()) then
      v_work_end := case when p_delta ? 'work_to' then (p_delta->>'work_to')::timestamptz
                         when not (p_delta ? 'activity') then v_accrued
                         when p_delta->>'accrued_to' = 'now' then now()
                         else (p_delta->>'accrued_to')::timestamptz end;
      v_work_end := least(v_accrued, greatest(v_st.accrued_to, v_work_end));
      v_work := public.hr_work_fold(v_st.work_day, v_st.work_ms, v_st.accrued_to, v_work_end,
                  public.hr_work_base_ms(v_uid, v_slot), public.hr_work_extra_ms(v_uid, v_slot), (now() at time zone 'utc')::date);
      if not (v_work->>'ok')::boolean then
        perform public.hr_reject('work_cap', v_work - 'ok');
      end if;
      -- THE END'S WORD: a counted job the day's cap ended (within a minute of it) says `work_cap`; a count reached stays `count`.
      if p_delta ? 'activity' and (v_work->>'left_ms')::bigint <= 60000 and v_job_end is not null and v_job_end->>'end' = 'stopped' then
        v_job_end := v_job_end || jsonb_build_object('end', 'work_cap');
      end if;
    end if;
    if p_delta ? 'activity' and coalesce(v_act->>'kind', '') = any (public.hr_work_kinds()) then
      v_work_left := public.hr_work_base_ms(v_uid, v_slot) + public.hr_work_extra_ms(v_uid, v_slot)
        - case when coalesce((v_work->>'day')::date, v_st.work_day) = (now() at time zone 'utc')::date
               then coalesce((v_work->>'used_ms')::bigint, v_st.work_ms) else 0 end;
      if v_work_left <= 0 then
        perform public.hr_reject('work_cap', jsonb_build_object('left_ms', 0, 'why', 'the hero''s town work is used up today'));
      end if;
    end if;

    update public.player_state
       set -- (gold: the ACCOUNT purse, moved at the GOLD block above, 2026-12-15-account-gold.sql)
$a$,
$a$           accrued_to   = v_accrued,
           -- WORK-DAY (1059-company-trades.sql): the day this window's work ended in, and the ms of town work done that day.
           work_day     = coalesce((v_work->>'day')::date, work_day),
           work_ms      = coalesce((v_work->>'used_ms')::bigint, work_ms),
$a$];
  for v_i in 1 .. array_length(a_old, 1) loop
    v_n := (length(v_def) - length(replace(v_def, a_old[v_i], ''))) / length(a_old[v_i]);
    if v_n <> 1 then raise exception 'hr_apply: WORK-DAY anchor % matched % times (need 1): the body moved', v_i, v_n; end if;
    v_def := replace(v_def, a_old[v_i], a_new[v_i]);
  end loop;
  -- CREATE OR REPLACE keeps the function's grants; no grant moves here.
  execute v_def;
end $mig$;

-- ── §7 GRANTS: nothing here is client-callable ───────────────────────────────
do $grants$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_trade_is(text)', 'public.hr_trade_lock(uuid)', 'public.hr_work_kinds()',
                               'public.hr_trade_row_sync()',
                               'public.hr_work_fold(date,bigint,timestamp with time zone,timestamp with time zone,bigint,bigint,date)',
                               'public.hr_work_base_ms(uuid,integer)', 'public.hr_work_extra_ms(uuid,integer)',
                               'public.hr_work_state(uuid,integer)', 'public.hr_work_day_view(uuid,integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $grants$;

-- ── §8 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) THE PROJECTION: two heroes of one account; hero 0's Mining credit (the real hr_apply) is the company's and hero 1 reads it; hero 1's
--     credit adds to it, never replaces it; a replayed key moves nothing; a combat skill stays each hero's own; every hero's trade row
--     equals its company row; a new hero is born at the company's totals.
-- (b) THE TWIN: hr_work_fold at a midnight crossing that fits and one that does not, and a day with bought work.
-- (c) THE DAY: a free hero's town job spends its window; a window past the 8 h cap is refused work_cap and moves nothing; a window to the
--     cap lands; a NEW job is then refused work_cap; the beta Premium switch makes the day 10 h; a forged `work_to` (no instant, no accrual) is
--     bad_delta.
-- (d) THE SURFACE: nothing here is client-executable, company_trades is unreadable to clients, the section is registered, the edits
--     are in hr_apply once, grant hygiene is quiet.
do $$
declare
  c_u constant uuid := '000000c0-0000-4000-a000-000000c01059';
  k constant text := '000000c0-0000-4000-a000-0000';
  v jsonb; v_ver bigint; v_node text; v_x bigint; v_n int; v_st public.player_state%rowtype; v_cap bigint; v_role text; v_y timestamptz;
begin
  begin
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'company-trades §8 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);
    update public.hr_flags set enabled = false where key = 'beta_premium';
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'company-trades §8-harness: hero 0 refused: %', v; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'company-trades §8-harness: hero 1 refused: %', v; end if;
    update public.player_state set premium_until = null where user_id = c_u;
    select a.activity_id into v_node from public.hr_activities a where a.kind = 'gather' and a.req_skill = 'mining' and coalesce(a.req_lv, 1) <= 1
     order by a.activity_id limit 1;
    if v_node is null then raise exception 'company-trades §8-harness: no level-1 mining node'; end if;

    -- (a) THE PROJECTION
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    v := public.hr_apply(c_u, 0, v_ver, (k || '0c105901')::uuid, jsonb_build_object('xp', jsonb_build_object('mining', 100, 'melee', 7),
           'journal', jsonb_build_object('kind', 'admin', 'intent', 'company_trades_probe')));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'company-trades §8(a): hero 0''s credit refused: %', v; end if;
    select version into v_ver from public.player_state where user_id = c_u and slot = 1;
    v := public.hr_apply(c_u, 1, v_ver, (k || '0c105902')::uuid, jsonb_build_object('xp', jsonb_build_object('mining', 50),
           'journal', jsonb_build_object('kind', 'admin', 'intent', 'company_trades_probe')));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'company-trades §8(a): hero 1''s credit refused: %', v; end if;
    perform public.hr_apply(c_u, 1, v_ver, (k || '0c105902')::uuid, jsonb_build_object('xp', jsonb_build_object('mining', 50),
           'journal', jsonb_build_object('kind', 'admin', 'intent', 'company_trades_probe')));
    select xp into v_x from public.company_trades where user_id = c_u and trade_id = 'mining';
    if v_x is distinct from 150
       or (select xp from public.player_skills where user_id = c_u and slot = 0 and skill_id = 'mining') is distinct from 150
       or (select xp from public.player_skills where user_id = c_u and slot = 1 and skill_id = 'mining') is distinct from 150 then
      raise exception 'company-trades §8(a): Mining company % hero 0 % hero 1 % (want 150 each)', v_x,
        (select xp from public.player_skills where user_id = c_u and slot = 0 and skill_id = 'mining'),
        (select xp from public.player_skills where user_id = c_u and slot = 1 and skill_id = 'mining'); end if;
    if (select xp from public.player_skills where user_id = c_u and slot = 0 and skill_id = 'melee')
       = (select xp from public.player_skills where user_id = c_u and slot = 1 and skill_id = 'melee') then
      raise exception 'company-trades §8(a): a combat skill moved on the other hero'; end if;
    if exists (select 1 from public.company_trades c where c.user_id = c_u and not public.hr_trade_is(c.trade_id)) then
      raise exception 'company-trades §8(a): a combat skill has a company row'; end if;
    v := public.hr_create_character(2);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'company-trades §8-harness: hero 2 refused: %', v; end if;
    if (select xp from public.player_skills where user_id = c_u and slot = 2 and skill_id = 'mining') is distinct from 150 then
      raise exception 'company-trades §8(a): a new hero was not born at the company''s Mining'; end if;
    if exists (select 1 from public.player_skills s join public.company_trades c on c.user_id = s.user_id and c.trade_id = s.skill_id
                where s.user_id = c_u and s.xp <> c.xp) then
      raise exception 'company-trades §8(a): a hero''s trade row is not its company''s'; end if;

    -- (b) THE TWIN
    v := public.hr_work_fold('2026-11-20', 7 * 3600000, '2026-11-20T23:00:00Z', '2026-11-21T03:00:00Z', 8 * 3600000, 0, '2026-11-21');
    if v <> jsonb_build_object('ok', true, 'day', '2026-11-21', 'used_ms', 3 * 3600000, 'over_ms', 0, 'left_ms', 5 * 3600000) then
      raise exception 'company-trades §8(b): a fitting midnight crossing folded to %', v; end if;
    v := public.hr_work_fold('2026-11-20', 7 * 3600000, '2026-11-20T22:30:00Z', '2026-11-21T01:00:00Z', 8 * 3600000, 0, '2026-11-21');
    if (v->>'ok')::boolean or (v->>'over_ms')::bigint <> 1800000 then
      raise exception 'company-trades §8(b): a crossing 30 min over folded to %', v; end if;
    v := public.hr_work_fold('2026-11-21', 8 * 3600000, '2026-11-21T10:00:00Z', '2026-11-21T11:00:00Z', 8 * 3600000, 2 * 3600000, '2026-11-21');
    if not (v->>'ok')::boolean or (v->>'left_ms')::bigint <> 3600000 then
      raise exception 'company-trades §8(b): bought work today folded to %', v; end if;

    -- (c) THE DAY: hero 0 gathers Mining; its watermark at 10:00 YESTERDAY (UTC, so the probe reads the same at any hour), a window
    --     to 18:01 (8 h 1 min) is refused, a window to 18:00 (the 8 h cap) lands
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    v := public.hr_apply(c_u, 0, v_ver, (k || '0c105903')::uuid, jsonb_build_object('activity',
           jsonb_build_object('kind', 'gather', 'id', v_node, 'restart', true, 'count', 100000, 'next', 'wait')));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'company-trades §8(c): starting the job was refused: %', v; end if;
    v_cap := public.hr_work_base_ms(c_u, 0);
    if v_cap <> 8 * 3600000 then raise exception 'company-trades §8(c): a free day is % ms, want 8 h', v_cap; end if;
    v_y := (date_trunc('day', now() at time zone 'utc') - interval '1 day') at time zone 'utc';
    update public.player_state set accrued_to = v_y + interval '10 hours', active_since = v_y + interval '10 hours', work_day = null, work_ms = 0
     where user_id = c_u and slot = 0;
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    v := public.hr_apply(c_u, 0, v_ver, (k || '0c105904')::uuid, jsonb_build_object(
           'accrued_to', v_y + interval '18 hours 1 minute', 'xp', jsonb_build_object('mining', 10),
           'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue')));
    select * into v_st from public.player_state where user_id = c_u and slot = 0;
    if v->>'error' is distinct from 'work_cap' or v_st.work_ms <> 0 or v_st.version <> v_ver
       or (select xp from public.company_trades where user_id = c_u and trade_id = 'mining') <> 150 then
      raise exception 'company-trades §8(c): a window past the cap answered % (work_ms %)', v, v_st.work_ms; end if;
    v := public.hr_apply(c_u, 0, v_ver, (k || '0c105905')::uuid, jsonb_build_object(
           'accrued_to', v_y + interval '18 hours', 'xp', jsonb_build_object('mining', 10),
           'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue')));
    select * into v_st from public.player_state where user_id = c_u and slot = 0;
    if coalesce(v->>'ok', '') <> 'true' or v_st.work_day is distinct from (v_y at time zone 'utc')::date or v_st.work_ms <> v_cap
       or (select xp from public.company_trades where user_id = c_u and trade_id = 'mining') <> 160 then
      raise exception 'company-trades §8(c): a window to the cap answered % (day %, work_ms %)', v, v_st.work_day, v_st.work_ms; end if;
    -- a forged work_to: no instant, or beside no accrual
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    v := public.hr_apply(c_u, 0, v_ver, (k || '0c105906')::uuid, jsonb_build_object(
           'accrued_to', now(), 'work_to', 'soon', 'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue')));
    if v->>'error' is distinct from 'bad_delta' then raise exception 'company-trades §8(c): a work_to that is no instant answered %', v; end if;
    v := public.hr_apply(c_u, 0, v_ver, (k || '0c10590a')::uuid, jsonb_build_object(
           'work_to', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'journal', jsonb_build_object('kind', 'admin', 'intent', 'probe')));
    if v->>'error' is distinct from 'bad_delta' then raise exception 'company-trades §8(c): a work_to beside no accrual answered %', v; end if;
    -- a NEW job on a day with no work left: give the hero a full day today, then ask
    update public.player_state set work_day = (now() at time zone 'utc')::date, work_ms = v_cap where user_id = c_u and slot = 0;
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    v := public.hr_apply(c_u, 0, v_ver, (k || '0c105907')::uuid, jsonb_build_object('activity',
           jsonb_build_object('kind', 'gather', 'id', v_node, 'restart', true, 'count', 20, 'next', 'wait')));
    if v->>'error' is distinct from 'work_cap' then raise exception 'company-trades §8(c): a new job on a spent day answered %', v; end if;
    -- the section says so, and Premium's day is 10 h
    v := public.hr_state_of(c_u, 0)->'work_day';
    if (v->>'left_ms')::bigint <> 0 or (v->>'cap_ms')::bigint <> v_cap or not (v->'trades' ? 'mining') or v->'trades' ? 'melee' then
      raise exception 'company-trades §8(c): the section reads %', v; end if;
    update public.hr_flags set enabled = true where key = 'beta_premium';
    if public.hr_work_base_ms(c_u, 0) <> 10 * 3600000 then
      raise exception 'company-trades §8(c): a Premium day is % ms, want 10 h', public.hr_work_base_ms(c_u, 0); end if;
    update public.hr_flags set enabled = false where key = 'beta_premium';
    raise exception using errcode = 'HR159', message = 'company-trades §8 complete - rolling back';
  exception when sqlstate 'HR159' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.player_state where user_id = c_u) or exists (select 1 from public.company_trades where user_id = c_u) then
    raise exception 'company-trades §8: LEAKED a probe row'; end if;
  -- (d) THE SURFACE
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.company_trades', 'select') or has_table_privilege(v_role, 'public.company_trades', 'update')
       or has_function_privilege(v_role, 'public.hr_work_day_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_trade_lock(uuid)', 'execute')
       or has_function_privilege(v_role, 'public.hr_work_fold(date,bigint,timestamp with time zone,timestamp with time zone,bigint,bigint,date)', 'execute') then
      raise exception 'company-trades §8(d): % reaches the company''s trades or the work day', v_role; end if;
  end loop;
  if not exists (select 1 from public.hr_state_sections where key = 'work_day' and fn = 'hr_work_day_view') then
    raise exception 'company-trades §8(d): the work_day section is not registered'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'hr_trade_row_sync' and tgrelid = 'public.player_skills'::regclass) then
    raise exception 'company-trades §8(d): the projection trigger is missing'; end if;
  select (length(prosrc) - length(replace(prosrc, 'WORK-DAY (1059', ''))) / length('WORK-DAY (1059') into v_n
    from pg_proc where oid = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure;
  if v_n <> 4 then raise exception 'company-trades §8(d): hr_apply carries % WORK-DAY edits, want 4', v_n; end if;
  if exists (select 1 from public.player_skills s join public.company_trades c on c.user_id = s.user_id and c.trade_id = s.skill_id
              where s.xp <> c.xp) then
    raise exception 'company-trades §8(d): a hero''s trade row is not its company''s'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'company-trades: trade XP is the company''s (projected on every hero), a hero''s town work stops at its day (8 h, 10 h Premium), work_cap refuses a window past it and a new job on a spent day; all green';
end $$;
