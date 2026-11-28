-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1073-k1-job-slice.sql — THE KIT TRADES' JOB SLICE: a hero works one recipe for up to a work day, the server
--   settles it from its own seed, with the page open or the browser closed (lane/k1-job-slice, backend-architect, 2026-11-26;
--   docs/design/redesign/09-crafting.md sections 4.9 (built in 4.10) and 6; the spec is .claude/coordination/HANDOFFS.md "2026-11-26 K1"
--   and its two make jobs from "2026-11-26 backend-architect (lane/tp-server-1)": the Tempering Salts a band, the imbuements).
--
-- STATUS: supabase/migration-notes/1073-k1-job-slice.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after every file on set/v0.2.144, after
--   1063-trade-formulas-catalogue.generated.sql (hr_trade_recipes, hr_trade_ground_bands and the roller twin hr_trade_roll, regenerated in
--   this lane), 1059-company-trades.sql (the work day), 1071-work-blocks.sql (bought work in the day's cap) and
--   1065-named-pieces-items-catalogue.generated.sql (regenerated in this lane: the job slice's new faces are hr_items rows).
--   Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §9 self-check.
-- EDGE: none. No engine file reads a job: the server settles it itself (§4), so either side of any hr-accrue deploy.
-- CLIENT: the Work window's Jobs list (src/shell/windows/work-jobs.js), the start and end presses (src/session/trade-intents.js), the
--   section's reader (src/session/trade-sections.js). Dark (switch `trade_jobs` off at apply): the section is null and both verbs not_open.
--
-- ── THE RULE (09 4.9 and 6, the designer's spec) ───────────────────────────
-- A job is ONE recipe (hr_trade_recipes: a kind at a band) worked by ONE resting hero for a count of attempts, at most a work day of them.
-- The client sends the recipe and a count and nothing else: never an output, a quality, a time, a seed, an XP amount or a price it set
-- (p_fee is its echo of the server's quote, checked, never used). The inputs are debited and the fee burned at the start; the goods are
-- one calculation at the end from the stored seed (hr_trade_roll, the generated twin of src/core/trades.js settleJob, pinned exactly).
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- §1 TABLES (RLS on, no policy, no client grant):
--    trade_jobs (id, user_id, slot, idem, recipe, kind, trade, band, rung, level, count, fee, inputs, took, seed, started_at, ends_at,
--      settled_at, end_reason, result): one row a job; at most one OPEN (settled_at null) a hero (trade_jobs_open_one); (user_id, idem)
--      unique, so a replayed key answers the same row. `level` is the company's trade Level at the start (the job settles on it), `seed` a
--      uint32 drawn by the server (never projected), `ends_at` the server's planned end (raised, never lowered, when bought work lengthens
--      the day under a running job).
--    company_trade_xp (user_id, trade_id, xp): THE COMPANY'S TRADE XP in 09's table (seconds of work: hr_trade_xp, 1,000 hours to 99), one
--      row an account and trade (src/data/trades.js TRADES ids). Deliberately NOT company_trades (1059): that table is the live skills'
--      XP on the old curve, and one number read on two curves would let a job's hours open the live bench's rows and back (CONFLICTS
--      2026-11-26 k1-job-slice). The live town work keeps its own until the slice replaces it.
--    company_stock (user_id, item_id, quality 1 Fine | 2 Master, qty): the company's Fine and Master goods (09 6: stacks keyed by kind,
--      band and quality; the face IS the band). Plain goods are ordinary items in Storage (account_bank), where every reader already is.
-- §2 THE SWITCH hr_flags `trade_jobs`, off at apply.
-- §3 INTERNAL (owner only):
--    hr_trade_work_stop(user, slot, from) -> timestamptz   the twin of src/core/work-day.js workStopMs on hr_work_state (pinned by
--      tests/trade-jobs.mjs TJ-TWIN): from `from`, the hero works until the day's town work is used, the next UTC day's cap after midnight.
--      Each UTC day's cap is its own (lane/k1-server-fixes): the base plus the work blocks bought on that day, so a job read after
--      midnight stops where it did on its own day (TJ-MIDNIGHT); for a start today it is workStopMs exactly.
--    hr_trade_level_of(user, trade) -> int                 the company's trade Level (hr_trade_level of company_trade_xp).
--    hr_trade_band_open(user, band) -> boolean             band 0 always (09 4.9); any other band only with a depth record at that band
--      or deeper: some hero of the account holds hunt_density.danger_held on a Danger scale ground of band >= it (hr_trade_ground_bands;
--      the designer's ruling, HANDOFFS 2026-11-27 designer-kit-band1 item 4).
--    hr_trade_job_quote(user, slot, recipe, count) -> jsonb   the start's decision without a write, its refusals in the spec's order
--      after `busy`: bad_recipe · rung_locked · band_locked · work_cap · count_cap; ok { fee, count, count_cap, spent_ms, ends_at, ... }.
--    hr_trade_job_close(user, slot, at, early) -> jsonb    THE SETTLE, the caller holding the hero's lock. The job's true end E is
--      least(started + the time of its count, hr_trade_work_stop(started)); it settles at least(at, E) when `early` (a stop), else only
--      when E <= at (a finished job; otherwise ends_at is raised to E and it answers not_due). Elapsed -> attempts, goods by quality,
--      returned sets and XP from hr_trade_roll on the stored seed, re-checked inside hr_trade_job_bound (attempts and XP exact, units and
--      returns at most). Credits: Plain goods, returned sets and the unattempted sets' inputs to the account's Storage; Fine and Master
--      to company_stock (none while quality is dark: hr_trade_levers.quality_live 0, 09 4.11 row 6, every job lands Plain); THE FEE OF
--      EVERY SET NEVER ATTEMPTED (09 4.11 row 5, lane/one-town-work): fee - ceil(fee x attempted / count), through ONE hr_apply gold
--      credit journalled trade_fee_refund, keyed md5('trade_fee_refund:' || job) (a stop, and a job the day's cap ended alike: the fee is
--      the sink on goods made); XP to company_trade_xp. The work day spends [started, the settle's instant] (hr_work_fold). A stop SPENDS
--      the seed: a restart is a new job with a new seed, and the stopped one only ever lands a prefix of its own sequence.
--    hr_trade_job_wants_block(user, slot) -> boolean       the hero's open job would stop at the day's cap with sets left (§5b).
-- §4 VERBS (authenticated; each keyed, gated, under hr_hunt_lock, answering the envelope: rule 11):
--    hr_trade_job_start(p_slot, p_recipe, p_count, p_fee, p_idem). Refusals in the order they are decided:
--      not_signed_in · not_open · bad_slot · bad_idem · bad_recipe (shape) · bad_count · bad_quote · intent_mismatch · rate_limited
--      · no_character · bad_recipe {why} (not a catalogue recipe, its kind ships later, or its face or an input is no item yet)
--      · busy {doing} (the hero hunts, holds a town pointer, or holds a job) · rung_locked {level, need} · band_locked {band}
--      · work_cap {left_ms} · count_cap {count_cap} · quote_changed {fee, count} · short_inputs {item_id, have, need, bag, storage}
--      · insufficient_gold (hr_apply's) · ok { job, envelope }.
--      On ok: the inputs for p_count sets leave the hero's bag, then Storage (hr_materials_take, all or nothing); ONE hr_apply
--      { gold: -fee } journalled (kind craft, or gather for a gathering job; intent trade_job:<recipe>:<count>:<fee>; meta.reason
--      trade_fee) claims the key; the job row; ONE trade_in ledger row when inputs moved. A second press of the key answers the same job.
--    hr_trade_job_end(p_slot, p_early, p_idem): p_early false collects a FINISHED job (not_due {ends_at} before the server says it is
--      done, so a client clock ahead can never cut the last attempt); p_early true stops it now. Refusals: not_signed_in · not_open ·
--      bad_slot · bad_idem · intent_mismatch · rate_limited · no_character · no_job · not_due · ok { result, envelope }.
-- §5 THE SWEEP hr_trade_jobs_sweep(p_limit, p_user) -> { seen, settled, busy, errors }, cron 'hr-trade-jobs' every minute: every open
--    job whose ends_at has passed is collected exactly as hr_trade_job_end(false) would (hr_trade_job_close at its true end), so a job
--    with the browser closed lands the same goods as one watched to its end. Never waits on a lock (try-lock the hero, its row, the
--    depot and the purse, which the fee refund credits; a busy hero is next minute's). p_user (null = every account) keeps the self-check to its own probe. The same cron runs
--    hr_trade_jobs_prune(p_limit): settled rows older than 30 days go (the ledger is the history), never an open one.
-- §5b THE STANDING WORK RULE BUYS FOR A RUNNING JOB (09 4.11 row 7, lane/one-town-work): hr_time_auto_buy and hr_time_auto_sweep
--    (1071-work-blocks.sql) RESTATED, pinned to 1071's images: a hero is working for the rule when its pointer is town work OR its open
--    job would stop at the day's cap with sets left; the rest of 1071's rule is unchanged. A bought block raises the job's end.
-- §6 THE GUARD hr_trade_job_busy, BEFORE UPDATE OF active_kind ON player_state, when it leaves idle: a hero holding a job cannot start
--    a hunt, a gathering job or a bench run (raises HRJ01 trade_job_open), so a job's hours are never also hunted or worked twice.
-- §7 THE SECTION `trade_jobs` (hr_trade_jobs_view): { trades { <trade>: { xp, level } }, job (the open one: recipe, name, face, count,
--    started_at, ends_at, attempt_ms, fee; never its seed), last (the newest settled: its result), recipes [ { id, name, trade, kind,
--    band, face, r_level, inputs, quote } ] (quote: the server's whole-day job, the count min(count_cap, what bag + Storage feed) and
--    its fee, or the refusal the start would answer), stock { <item>: { fine, master } } }; null while the switch is off.
-- JOURNAL (player_ledger, one row each a job and reason, meta.reason and meta.recipe; never a row a tick): trade_fee (the start, the gold
--   burned; via hr_apply), trade_in (inputs debited), trade_out (goods by face, band and quality; qty_in stamps the goods made),
--   trade_return (sets handed back by a yield over 1000), trade_refund (the unattempted sets at a stop or the day's end),
--   trade_fee_refund (their share of the fee back, a gold credit via hr_apply), trade_xp (the XP, in meta: it is company XP on 09's curve,
--   so it stamps no hero's xp_in). The gold ledger of 09 5.6 is a query on these.
-- CLAMPS: per call count_cap (one work day's attempts at the company's speed: floor(cap_ms x speed / own work)); per day the work day
--   (base, Premium's extra, bought blocks: hr_work_extra_ms) spent by the job's own span; the output band is the recipe's and no request
--   names one; inputs only from the hero's own bag and its account's Storage; the fee only from hr_trade_job_fee (the catalogue's V).
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- THE LOCK ORDER is the house's (hr_materials_take): the hero (advisory key, player_state row, its open hunt row: hr_hunt_lock) -> the
-- account depot (advisory 'hr:depot:<user>') -> bag rows -> Storage rows -> company_stock rows -> the purse (hr_apply: the start's fee,
-- the settle's fee refund) -> company_trade_xp rows, last. Every write to a job (start, collect, stop, sweep) holds its hero's lock, and the open job is read
-- FOR UPDATE under it, so a collect and the sweep racing settle once (the second finds no open job and answers no_job / skips). Two
-- heroes of one company crediting one trade serialise on the company_trade_xp row (`xp = xp + n`, never read-modify-write). The start's
-- key is read before and under the lock (hr_intent_replay) and claimed by its one hr_apply; the end's key is claimed by its own
-- player_intents row. THE SWEEP NEVER WAITS: try-locks only, so it cannot join a deadlock with a party settle or a press.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- New: two client verbs that move inventory and burn gold, one cron. Nothing a client sends reaches another player: the goods land in
-- the presser's own Storage and company stock, the XP on its own account. Every number is the server's: the recipe row, the count cap,
-- the fee (V), the seed (gen_random_uuid's CSPRNG, stored, never projected), the band (the recipe's), the dice (the generated roller).
-- A stop cannot re-roll (the seed is spent, a prefix of one sequence) and cannot dodge the work day (the span is folded either way).
-- The fee refund (lane/one-town-work) is a gold CREDIT: at most the fee this job burned, of its unattempted sets only, once a job (the
-- settle's one transaction and a key derived from the job id), from the stored fee and count, never a client number. Start-then-stop
-- returns exactly what the start took (no gold made); it does not buy free work (no set attempted, no goods, no XP).
-- The Storage over its stack cap: a settle credits Storage even past hr_depot_cap (a hero's own goods are never destroyed, the rule of
-- hr_hunt_close's bag), bounded by the catalogue's faces (25 recipes since lane/one-town-work's band 0 batch). ON THE PRE-EA SECURITY LIST (13-security-list.md S-10, S-27).
--
-- ── COST (100x: 2,000 accounts x 4 heroes) ───────────────────────────────────
-- A job is three writes (09 6): the start (hr_apply's row + the job row + trade_in), the settle (Storage and stock upserts, the XP row,
-- player_state, at most four ledger rows). At most ~6 ledger rows a job, a job about a hero-day: ~48,000 rows a day at the extreme,
-- ~15 MB, inside the prune. trade_jobs: one row a job, 30 days kept (~240,000 rows, ~70 MB). The sweep reads its partial index on
-- ends_at (open jobs only) each minute and settles only what is due. Dark, every envelope pays one hr_flags read; lit, the section quotes
-- 25 recipes from shared reads (a handful of PK lookups each). A fee refund is one more hr_apply and ledger row on a settle with
-- unattempted sets (a stop or the day's cap), never a row a tick.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Drop the cron 'hr-trade-jobs', the trigger hr_trade_job_busy, the section row, the two verbs (+ their baseline rows) and the internal
-- functions, then the three tables (a job's goods already moved stay where they landed; the ledger is history). The flag row may stay.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_trade_recipes') is null or to_regclass('public.hr_trade_ground_bands') is null
     or to_regprocedure('public.hr_trade_roll(text,integer,integer,boolean,integer,integer,integer,bigint,bigint)') is null
     or to_regprocedure('public.hr_trade_job_bound(text,integer,integer,boolean,integer,integer,integer,bigint)') is null
     or to_regprocedure('public.hr_trade_job_fee(text,integer,integer)') is null or to_regprocedure('public.hr_trade_level(bigint)') is null then
    raise exception 'PRECONDITION: the trades'' catalogue with the job slice''s rows first (1063-trade-formulas-catalogue.generated.sql)'; end if;
  if to_regprocedure('public.hr_work_state(uuid,integer)') is null or to_regprocedure('public.hr_work_fold(date,bigint,timestamp with time zone,timestamp with time zone,bigint,bigint,date)') is null then
    raise exception 'PRECONDITION: the work day first (1059-company-trades.sql)'; end if;
  if to_regprocedure('public.hr_work_extra_ms(uuid,integer)') is null or position('WORK-BLOCKS (1071' in (select prosrc from pg_proc where oid = 'public.hr_work_extra_ms(uuid,integer)'::regprocedure)) = 0 then
    raise exception 'PRECONDITION: bought work in the day''s cap first (1071-work-blocks.sql)'; end if;
  if to_regprocedure('public.hr_materials_take(uuid,integer,jsonb,boolean)') is null or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_record_rejection(uuid,integer,text,text,jsonb,bigint)') is null or to_regprocedure('public.hr_flag_on(text)') is null
     or to_regprocedure('public.hr_state_of(uuid,integer)') is null or to_regprocedure('public.hr_cron_ensure(text,text,text)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regclass('public.hr_state_sections') is null or to_regclass('public.hunt_density') is null then
    raise exception 'PRECONDITION: a seam this file calls is missing'; end if;
  if not exists (select 1 from public.hr_trade_recipes) then raise exception 'PRECONDITION: hr_trade_recipes is empty'; end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.trade_jobs (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null,
  slot       int         not null,
  idem       uuid        not null,
  recipe     text        not null check (recipe ~ '^[a-z][a-z0-9_]{1,63}$'),
  kind       text        not null references public.hr_trade_kinds (kind),
  trade      text        not null,
  face       text        not null check (face ~ '^[a-z0-9_]{1,64}$'),
  band       int         not null check (band >= 0),
  rung       int         not null check (rung >= 1),
  level      int         not null check (level between 1 and 99),
  count      int         not null check (count between 1 and 100000),
  fee        bigint      not null check (fee >= 0),
  inputs     jsonb       not null check (jsonb_typeof(inputs) = 'object'),
  took       jsonb       not null check (jsonb_typeof(took) = 'object'),
  seed       bigint      not null check (seed >= 0 and seed < 4294967296),
  started_at timestamptz not null,
  ends_at    timestamptz not null,
  settled_at timestamptz,
  end_reason text        check (end_reason in ('done', 'work_cap', 'stop')),
  result     jsonb,
  foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade,
  unique (user_id, idem),
  check (ends_at >= started_at),
  check ((settled_at is null) = (end_reason is null) and (settled_at is null) = (result is null))
);
create unique index if not exists trade_jobs_open_one on public.trade_jobs (user_id, slot) where settled_at is null;
create index if not exists trade_jobs_due on public.trade_jobs (ends_at) where settled_at is null;
create index if not exists trade_jobs_last on public.trade_jobs (user_id, slot, settled_at desc) where settled_at is not null;

create table if not exists public.company_trade_xp (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  trade_id   text        not null check (trade_id ~ '^[a-z]{1,16}$'),
  xp         bigint      not null default 0 check (xp >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, trade_id)
);
create table if not exists public.company_stock (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  item_id    text        not null check (item_id ~ '^[a-z0-9_]{1,64}$'),
  quality    smallint    not null check (quality in (1, 2)),
  qty        bigint      not null check (qty > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id, quality)
);
alter table public.trade_jobs enable row level security;
alter table public.company_trade_xp enable row level security;
alter table public.company_stock enable row level security;
revoke all on public.trade_jobs, public.company_trade_xp, public.company_stock from public, anon, authenticated, service_role;
comment on table public.trade_jobs is '1073-k1-job-slice.sql: one row a kit-trade job (recipe, count, the company Level, the server''s seed, start and end); one open a hero; settled by hr_trade_job_close.';
comment on table public.company_trade_xp is '1073-k1-job-slice.sql: the company''s trade XP on 09''s table (seconds of work), one row an account and trade; written only by hr_trade_job_close.';
comment on table public.company_stock is '1073-k1-job-slice.sql: the company''s Fine (1) and Master (2) goods, one row an item and quality; Plain goods are Storage items.';

-- ── §2 THE SWITCH ────────────────────────────────────────────────────────────
insert into public.hr_flags (key, enabled, note) values
  ('trade_jobs', false, '1073-k1-job-slice.sql: the kit trades'' jobs (hr_trade_job_start / _end, the sweep, the trade_jobs section). Lit with the Work window''s Jobs list and the designer''s read of the sample.')
  on conflict (key) do nothing;

-- ── §3 INTERNAL ──────────────────────────────────────────────────────────────
create or replace function public.hr_trade_work_stop(p_user uuid, p_slot int, p_from timestamptz)
returns timestamptz language plpgsql stable set search_path = public, pg_catalog as $fn$
declare
  c_day constant bigint := 86400000; w jsonb; v_from bigint; v_d0 bigint; v_dms bigint; v_tms bigint; v_base bigint; v_extra bigint;
  v_used bigint; v_left bigint; v_mid bigint; v_stop bigint; v_block bigint; v_x0 bigint; v_x1 bigint;
begin
  -- K1 (1073-k1-job-slice.sql): the twin of src/core/work-day.js workStopMs on the server's own work state (hr_work_state): from p_from
  -- the hero works until the day's town work is used; if midnight comes first, the next UTC day's cap. Null for no hero.
  -- EACH UTC DAY'S CAP IS ITS OWN (lane/k1-server-fixes): the base day plus the work blocks bought ON THAT DAY. Today's are
  -- hr_work_state's extra_ms (1071's hr_work_extra_ms), so a start today is workStopMs exactly; an earlier day's are counted from the
  -- ledger the way 1071's hr_time_bought counts today's, so a job read after midnight (the sweep, a Collect, the section) still stops
  -- where it did on the day it started, its bought blocks in it. A day after today has bought none yet.
  w := public.hr_work_state(p_user, p_slot);
  if w is null then return null; end if;
  v_from := floor(extract(epoch from p_from) * 1000)::bigint;
  v_d0 := (v_from / c_day) * c_day;
  v_dms := case when w->>'day' is null then null else ((w->>'day')::date - date '1970-01-01')::bigint * c_day end;
  v_tms := ((w->>'today')::date - date '1970-01-01')::bigint * c_day;
  v_base := greatest(0, coalesce((w->>'base_ms')::bigint, 0));
  v_extra := greatest(0, coalesce((w->>'extra_ms')::bigint, 0));
  v_used := greatest(0, coalesce((w->>'used_ms')::bigint, 0));
  v_mid := v_d0 + c_day;
  if v_d0 < v_tms then
    select b.block_min::bigint * 60000 into v_block from public.hr_time_blocks b where b.kind = 'work';
  end if;
  v_x0 := case when v_d0 = v_tms then v_extra when v_d0 > v_tms or v_block is null then 0
               else v_block * (select count(*) from public.player_ledger l
                                where l.user_id = p_user and l.slot = p_slot and l.kind = 'shop' and l.intent like 'time\_buy:%'
                                  and l.intent like 'time\_buy:work:%'
                                  and l.at >= timestamptz '1970-01-01 00:00:00+00' + v_d0 * interval '1 millisecond'
                                  and l.at < timestamptz '1970-01-01 00:00:00+00' + v_mid * interval '1 millisecond') end;
  v_left := greatest(0, v_base + v_x0 - case when v_d0 = v_dms then v_used else 0 end);
  if v_from + v_left < v_mid then v_stop := v_from + v_left;
  else
    v_x1 := case when v_mid = v_tms then v_extra when v_mid > v_tms or v_block is null then 0
                 else v_block * (select count(*) from public.player_ledger l
                                  where l.user_id = p_user and l.slot = p_slot and l.kind = 'shop' and l.intent like 'time\_buy:%'
                                    and l.intent like 'time\_buy:work:%'
                                    and l.at >= timestamptz '1970-01-01 00:00:00+00' + v_mid * interval '1 millisecond'
                                    and l.at < timestamptz '1970-01-01 00:00:00+00' + (v_mid + c_day) * interval '1 millisecond') end;
    v_stop := v_mid + greatest(0, v_base + v_x1 - case when v_mid = v_dms then v_used else 0 end);
  end if;
  return timestamptz '1970-01-01 00:00:00+00' + v_stop * interval '1 millisecond';
end $fn$;

create or replace function public.hr_trade_level_of(p_user uuid, p_trade text)
returns int language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- K1 (1073-k1-job-slice.sql): the company's Level in a trade on 09's table.
  -- plpgsql, not sql (lane/bench-cut-server, tests/settle-budget.mjs SB-3): once 1079 lights trade_jobs, the section quotes every recipe in
  -- every envelope (about 130 calls a hero), and a SET-clause SQL function is re-planned per call on PostgreSQL 17; plpgsql keeps the plan.
  return public.hr_trade_level(coalesce((select x.xp from public.company_trade_xp x where x.user_id = p_user and x.trade_id = p_trade), 0));
end $fn$;

create or replace function public.hr_trade_band_open(p_user uuid, p_band int)
returns boolean language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- K1 (1073-k1-job-slice.sql; 09 4.2 and 4.9): band 0 is open to every company; any other band only where a hero of the account holds
  -- a depth record (hunt_density.danger_held) on a Danger scale ground of THAT BAND OR DEEPER (the designer, 2026-11-27: bands 1 to 3
  -- have one or two grounds each, so a company that went from the Thicket to the Warrens would never open iron on an exact match).
  -- plpgsql, not sql (lane/bench-cut-server, tests/settle-budget.mjs SB-3): once 1079 lights trade_jobs, the section quotes every recipe in
  -- every envelope (about 130 calls a hero), and a SET-clause SQL function is re-planned per call on PostgreSQL 17; plpgsql keeps the plan.
  return coalesce(p_band, -1) = 0 or exists (select 1 from public.hunt_density d join public.hr_trade_ground_bands g on g.hunt_id = d.hunt_id
                                              where d.user_id = p_user and d.danger_held is not null and g.band >= p_band);
end $fn$;

create or replace function public.hr_trade_job_quote(p_user uuid, p_slot int, p_recipe text, p_count int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
declare
  r public.hr_trade_recipes%rowtype; k public.hr_trade_kinds%rowtype; w jsonb; v_lv int; v_cap bigint; v_used bigint; v_stop timestamptz;
  v_count_cap bigint; v_full jsonb; v_one jsonb; v_missing text;
begin
  -- K1 (1073-k1-job-slice.sql): THE START'S DECISION WITHOUT A WRITE (header §3). The refusals after `busy`, in the spec's order.
  select * into r from public.hr_trade_recipes where recipe = p_recipe;
  if not found then return jsonb_build_object('ok', false, 'error', 'bad_recipe', 'why', 'not_a_recipe'); end if;
  select * into k from public.hr_trade_kinds where kind = r.kind;
  if not found or k.ships <> 'v030' then return jsonb_build_object('ok', false, 'error', 'bad_recipe', 'why', 'ships_later'); end if;
  select x.item into v_missing from (select r.face as item union all select key from jsonb_object_keys(r.inputs) key) x
   where not exists (select 1 from public.hr_items i where i.item_id = x.item) order by 1 limit 1;
  if v_missing is not null then return jsonb_build_object('ok', false, 'error', 'bad_recipe', 'why', 'item_owed', 'item_id', v_missing); end if;
  v_lv := public.hr_trade_level_of(p_user, r.trade);
  if v_lv < r.r_level then return jsonb_build_object('ok', false, 'error', 'rung_locked', 'trade', r.trade, 'level', v_lv, 'need', r.r_level); end if;
  if not public.hr_trade_band_open(p_user, r.band) then return jsonb_build_object('ok', false, 'error', 'band_locked', 'band', r.band); end if;
  w := public.hr_work_state(p_user, p_slot);
  if w is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  v_cap := (w->>'base_ms')::bigint + (w->>'extra_ms')::bigint;
  v_used := case when w->>'day' = w->>'today' then (w->>'used_ms')::bigint else 0 end;
  v_stop := public.hr_trade_work_stop(p_user, p_slot, now());
  if v_stop <= now() then
    return jsonb_build_object('ok', false, 'error', 'work_cap', 'left_ms', greatest(0, v_cap - v_used), 'cap_ms', v_cap); end if;
  /* ONE WORK DAY OF ATTEMPTS at the company's speed: the bound over the day's whole cap, the count unlimited */
  v_count_cap := coalesce((public.hr_trade_job_bound(r.kind, r.rung, v_lv, false, 0, 1000, 100000, v_cap)->>'attempts')::bigint, 0);
  /* p_count null: the section's probe (the recipe is open; how many the day allows), priced by the caller for its own count */
  if p_count is null and v_count_cap >= 1 then
    return jsonb_build_object('ok', true, 'level', v_lv, 'count_cap', v_count_cap, 'stop', v_stop); end if;
  if p_count is null or p_count < 1 or p_count > v_count_cap then
    return jsonb_build_object('ok', false, 'error', 'count_cap', 'count_cap', v_count_cap); end if;
  v_full := public.hr_trade_job_bound(r.kind, r.rung, v_lv, false, 0, 1000, p_count, 1000000000000);
  v_one := public.hr_trade_job_bound(r.kind, r.rung, v_lv, false, 0, 1000, 1, 1000000000000);
  return jsonb_build_object('ok', true, 'recipe', r.recipe, 'kind', r.kind, 'trade', r.trade, 'stage', k.stage, 'face', r.face, 'band', r.band,
    'rung', r.rung, 'r_level', r.r_level, 'level', v_lv, 'count', p_count, 'count_cap', v_count_cap, 'fee', public.hr_trade_job_fee(r.kind, r.band, p_count),
    'spent_ms', (v_full->>'spent_ms')::bigint, 'attempt_ms', (v_one->>'spent_ms')::bigint, 'inputs', r.inputs,
    'ends_at', least(now() + ((v_full->>'spent_ms')::bigint * interval '1 millisecond'), v_stop));
end $fn$;

create or replace function public.hr_trade_job_close(p_user uuid, p_slot int, p_at timestamptz, p_early boolean)
returns jsonb language plpgsql set search_path = public, pg_catalog as $fn$
declare
  j public.trade_jobs%rowtype; v_stop timestamptz; v_full jsonb; v_end timestamptz; v_at timestamptz; v_reason text; v_ms bigint;
  v_roll jsonb; v_b jsonb; v_made bigint; v_ret bigint; v_unused bigint; v_back jsonb := '{}'::jsonb; v_retd jsonb := '{}'::jsonb;
  v_refd jsonb := '{}'::jsonb; l record; v_n bigint; w jsonb; f jsonb; v_kind text; v_intent text; v_res jsonb; v_q int;
  v_fee_back bigint := 0; v_claim text; v_ver bigint; v_a jsonb;
begin
  -- K1 (1073-k1-job-slice.sql): THE SETTLE (header §3). The caller holds the hero's lock (hr_hunt_lock, or the sweep's try-locks).
  select * into j from public.trade_jobs where user_id = p_user and slot = p_slot and settled_at is null for update;
  if not found then return null; end if;
  v_stop := public.hr_trade_work_stop(p_user, p_slot, j.started_at);
  v_full := public.hr_trade_job_bound(j.kind, j.rung, j.level, false, 0, 1000, j.count, 1000000000000);
  if v_full is null or v_stop is null then raise exception using errcode = 'HRJ02', message = 'trade job: the catalogue refuses job ' || j.id; end if;
  v_end := greatest(j.started_at, least(j.started_at + ((v_full->>'spent_ms')::bigint * interval '1 millisecond'), v_stop));
  if not coalesce(p_early, false) and v_end > p_at then
    -- NOT DONE YET (bought work lengthened the day under it): the planned end moves up to the true one, never down.
    update public.trade_jobs set ends_at = greatest(ends_at, v_end) where id = j.id;
    return jsonb_build_object('ok', false, 'error', 'not_due', 'ends_at', greatest(j.ends_at, v_end));
  end if;
  v_at := greatest(j.started_at, least(p_at, v_end));
  v_reason := case when v_at < v_end then 'stop'
                   when v_end >= j.started_at + ((v_full->>'spent_ms')::bigint * interval '1 millisecond') then 'done' else 'work_cap' end;
  v_ms := floor(extract(epoch from (v_at - j.started_at)) * 1000)::bigint;
  v_roll := public.hr_trade_roll(j.kind, j.rung, j.level, false, 0, 1000, j.count, v_ms, j.seed);
  v_b := public.hr_trade_job_bound(j.kind, j.rung, j.level, false, 0, 1000, j.count, v_ms);
  v_made := (v_roll->>'plain')::bigint + (v_roll->>'fine')::bigint + (v_roll->>'master')::bigint;
  v_ret := (v_roll->>'returned')::bigint;
  /* THE BOUND, once more (09 6): attempts and XP exact, units and returned sets at most. A roller that ever passed it is a defect */
  if v_roll is null or v_b is null or (v_roll->>'attempts')::bigint <> (v_b->>'attempts')::bigint or (v_roll->>'xp')::bigint <> (v_b->>'xp')::bigint
     or v_made > (v_b->>'units_max')::bigint or v_ret > (v_b->>'returned_max')::bigint then
    raise exception using errcode = 'HRJ03', message = 'trade job: the roll ' || coalesce(v_roll::text, 'null') || ' passes the bound ' || coalesce(v_b::text, 'null'); end if;
  v_unused := j.count - (v_roll->>'attempts')::bigint;
  /* THE ACCOUNT DEPOT, after the hero (the house's order), before any Storage row */
  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || p_user::text, 0));
  -- the goods: Plain to Storage, Fine and Master to the company's stock
  if (v_roll->>'plain')::bigint > 0 then
    insert into public.account_bank as b (user_id, item_id, qty) values (p_user, j.face, (v_roll->>'plain')::bigint)
      on conflict (user_id, item_id) do update set qty = b.qty + excluded.qty, updated_at = now();
  end if;
  foreach v_q in array array[1, 2] loop
    v_n := (v_roll->>(case v_q when 1 then 'fine' else 'master' end))::bigint;
    if v_n > 0 then
      insert into public.company_stock as s (user_id, item_id, quality, qty) values (p_user, j.face, v_q, v_n)
        on conflict (user_id, item_id, quality) do update set qty = s.qty + excluded.qty, updated_at = now();
    end if;
  end loop;
  -- the sets: returned by a yield over 1000, and the unattempted ones, back to Storage
  for l in select key as item, value::bigint as per from jsonb_each_text(j.inputs) order by key loop
    if v_ret > 0 then v_retd := v_retd || jsonb_build_object(l.item, l.per * v_ret); end if;
    if v_unused > 0 then v_refd := v_refd || jsonb_build_object(l.item, l.per * v_unused); end if;
    v_n := l.per * (v_ret + v_unused);
    if v_n > 0 then
      insert into public.account_bank as b (user_id, item_id, qty) values (p_user, l.item, v_n)
        on conflict (user_id, item_id) do update set qty = b.qty + excluded.qty, updated_at = now();
    end if;
  end loop;
  v_kind := case when (select stage from public.hr_trade_kinds where kind = j.kind) = 'gather' then 'gather' else 'craft' end;
  v_intent := 'trade_job:' || j.recipe;
  -- THE FEE OF EVERY SET NEVER ATTEMPTED comes back (09 4.11 row 5, ONE-TOWN-WORK): fee - ceil(fee x attempted / count), the same instant
  -- the materials do, through ONE hr_apply gold credit journalled trade_fee_refund under a key derived from the job (a job settles once;
  -- the key makes a second credit impossible on any path). At most the fee this job burned, never more; the attempted sets keep theirs.
  -- The purse after the Storage rows (the house's lock order). A refusal (the account's daily budget, a fuse) raises: nothing of the
  -- settle lands, the sweep retries next minute.
  if v_unused > 0 and j.fee > 0 then
    v_fee_back := j.fee - ((j.fee * (j.count - v_unused) + j.count - 1) / j.count);
  end if;
  if v_fee_back > 0 then
    v_claim := current_setting('request.jwt.claim.sub', true);
    if auth.uid() is distinct from p_user then perform set_config('request.jwt.claim.sub', p_user::text, true); end if;
    select version into v_ver from public.player_state where user_id = p_user and slot = p_slot;
    v_a := public.hr_apply(p_user, p_slot, v_ver, md5('trade_fee_refund:' || j.id::text)::uuid, jsonb_build_object(
             'gold', v_fee_back,
             'journal', jsonb_build_object('kind', v_kind, 'intent', v_intent,
                                           'meta', jsonb_build_object('reason', 'trade_fee_refund', 'recipe', j.recipe, 'job', j.id, 'band', j.band,
                                                                      'fee', j.fee, 'count', j.count, 'sets', v_unused, 'refund', v_fee_back,
                                                                      'end', v_reason))));
    perform set_config('request.jwt.claim.sub', coalesce(v_claim, ''), true);
    if coalesce(v_a->>'ok', 'false') <> 'true' or coalesce(v_a->>'replayed', 'false') = 'true' then
      raise exception using errcode = 'HRJ04', message = 'trade job: the fee refund was refused: ' || coalesce(v_a::text, 'null'); end if;
  end if;
  -- the company's XP, last
  if (v_roll->>'xp')::bigint > 0 then
    insert into public.company_trade_xp as x (user_id, trade_id, xp) values (p_user, j.trade, (v_roll->>'xp')::bigint)
      on conflict (user_id, trade_id) do update set xp = x.xp + excluded.xp, updated_at = now();
  end if;
  -- the work day: the job's own span [started, the settle's instant], folded as the town work it was
  w := public.hr_work_state(p_user, p_slot);
  f := public.hr_work_fold(nullif(w->>'day', '')::date, (w->>'used_ms')::bigint, j.started_at, v_at, (w->>'base_ms')::bigint,
                           (w->>'extra_ms')::bigint, (w->>'today')::date);
  update public.player_state set work_day = (f->>'day')::date, work_ms = least(86400000, greatest(0, (f->>'used_ms')::bigint)),
         version = version + 1, updated_at = now()
   where user_id = p_user and slot = p_slot;
  -- the journal: one row a reason that moved something (the fee refund is hr_apply's own row, above)
  if v_made > 0 then
    insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, qty_in, meta)
    values (p_user, p_slot, v_kind, v_intent, j.face, v_made, 0, v_made,
            jsonb_build_object('reason', 'trade_out', 'recipe', j.recipe, 'job', j.id, 'band', j.band,
                               'plain', (v_roll->>'plain')::bigint, 'fine', (v_roll->>'fine')::bigint, 'master', (v_roll->>'master')::bigint));
  end if;
  if v_retd <> '{}'::jsonb then
    insert into public.player_ledger (user_id, slot, kind, intent, qty, gold, meta)
    values (p_user, p_slot, v_kind, v_intent, (select sum(value::bigint) from jsonb_each_text(v_retd)), 0,
            jsonb_build_object('reason', 'trade_return', 'recipe', j.recipe, 'job', j.id, 'sets', v_ret, 'items', v_retd));
  end if;
  if v_refd <> '{}'::jsonb then
    insert into public.player_ledger (user_id, slot, kind, intent, qty, gold, meta)
    values (p_user, p_slot, v_kind, v_intent, (select sum(value::bigint) from jsonb_each_text(v_refd)), 0,
            jsonb_build_object('reason', 'trade_refund', 'recipe', j.recipe, 'job', j.id, 'sets', v_unused, 'items', v_refd, 'end', v_reason));
  end if;
  if (v_roll->>'xp')::bigint > 0 then
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
    values (p_user, p_slot, v_kind, v_intent, 0,
            jsonb_build_object('reason', 'trade_xp', 'recipe', j.recipe, 'job', j.id, 'trade', j.trade, 'xp', (v_roll->>'xp')::bigint,
                               'level', j.level, 'worked_ms', v_ms));
  end if;
  v_res := jsonb_build_object('job', j.id, 'recipe', j.recipe, 'end', v_reason, 'at', v_at, 'count', j.count,
             'attempts', (v_roll->>'attempts')::bigint, 'plain', (v_roll->>'plain')::bigint, 'fine', (v_roll->>'fine')::bigint,
             'master', (v_roll->>'master')::bigint, 'returned', v_ret, 'refunded', v_unused, 'fee_refund', v_fee_back,
             'xp', (v_roll->>'xp')::bigint, 'worked_ms', v_ms);
  update public.trade_jobs set settled_at = now(), end_reason = v_reason, result = v_res where id = j.id;
  return jsonb_build_object('ok', true) || v_res;
end $fn$;

-- ── §4 THE VERBS ─────────────────────────────────────────────────────────────
create or replace function public.hr_trade_job_start(p_slot int, p_recipe text, p_count int, p_fee bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'trade_job';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_h public.hunt_sessions%rowtype; v_st public.player_state%rowtype;
  v_q jsonb; v_need jsonb := '{}'::jsonb; l record; v_take jsonb; v_a jsonb; v_job uuid := gen_random_uuid(); v_seed bigint; v_kind text;
  v_fee bigint; v_n bigint;
begin
  -- K1 (1073-k1-job-slice.sql): START A KIT-TRADE JOB. The contract and the refusals are this file's header, §4.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_flag_on('trade_jobs') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_recipe is null or p_recipe !~ '^[a-z][a-z0-9_]{1,63}$' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_recipe', 'why', 'not_a_recipe')); end if;
  if p_count is null or p_count < 1 or p_count > 100000 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_count')); end if;
  if p_fee is null or p_fee < 0 or p_fee > 1000000000000 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  v_verb := 'trade_job:' || p_recipe || ':' || p_count || ':' || p_fee;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then
    if coalesce(v_r->>'ok', 'false') = 'true' then
      return jsonb_build_object('ok', true, 'replayed', true, 'job', (select to_jsonb(t) - 'seed' from public.trade_jobs t where t.user_id = v_uid and t.idem = p_idem)); end if;
    return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_h := public.hr_hunt_lock(v_uid, p_slot);
  -- A SECOND PRESS OF ONE KEY that waited on the lock answers the first one's decision (2027-04-19-key-under-lock.sql).
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then
    if coalesce(v_r->>'ok', 'false') = 'true' then
      return jsonb_build_object('ok', true, 'replayed', true, 'job', (select to_jsonb(t) - 'seed' from public.trade_jobs t where t.user_id = v_uid and t.idem = p_idem)); end if;
    return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  select * into v_st from public.player_state where user_id = v_uid and slot = p_slot;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_ver := v_st.version;
  -- bad_recipe (the catalogue's) before busy, then the rest in the quote's order
  v_q := public.hr_trade_job_quote(v_uid, p_slot, p_recipe, p_count);
  if v_q->>'error' = 'bad_recipe' then return public.hr_note_rejection(c_verb, p_slot, v_q); end if;
  if v_st.active_kind <> 'idle' or v_h.id is not null
     or exists (select 1 from public.trade_jobs t where t.user_id = v_uid and t.slot = p_slot and t.settled_at is null) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'busy',
             'doing', case when v_h.id is not null then 'hunt' when v_st.active_kind <> 'idle' then v_st.active_kind else 'trade_job' end)); end if;
  if coalesce(v_q->>'ok', 'false') <> 'true' then return public.hr_note_rejection(c_verb, p_slot, v_q); end if;
  v_fee := (v_q->>'fee')::bigint;
  if v_fee <> p_fee then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'fee', v_fee, 'count', p_count)); end if;
  for l in select key as item, value::bigint as per from jsonb_each_text(v_q->'inputs') loop
    v_need := v_need || jsonb_build_object(l.item, l.per * p_count);
  end loop;
  v_kind := case when v_q->>'stage' = 'gather' then 'gather' else 'craft' end;
  /* THE CHARGE, all or nothing: the inputs (the bag, then the account's Storage), then the purse. A refusal after the take raises, and
     the block's rollback puts the inputs back. The SEED: 32 bits of a CSPRNG uuid, drawn here, stored, never projected. */
  v_seed := ('x' || substr(md5(gen_random_uuid()::text), 1, 8))::bit(32)::bigint;
  begin
    v_take := public.hr_materials_take(v_uid, p_slot, v_need, true);
    if coalesce(v_take->>'ok', 'false') <> 'true' then raise exception using errcode = 'HRJ11', message = 'trade job: inputs short'; end if;
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'gold', -v_fee,
             'journal', jsonb_build_object('kind', v_kind, 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'trade_fee', 'recipe', p_recipe, 'job', v_job, 'band', (v_q->>'band')::int,
                                                                      'count', p_count, 'fee', v_fee, 'level', (v_q->>'level')::int))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then raise exception using errcode = 'HRJ12', message = 'trade job: hr_apply refused'; end if;
    if coalesce(v_a->>'replayed', 'false') = 'true' then raise exception using errcode = 'HRJ13', message = 'trade job: replayed'; end if;
  exception
    when sqlstate 'HRJ11' then
      return public.hr_note_rejection(c_verb, p_slot, (v_take - 'error' - 'ok') || jsonb_build_object('ok', false, 'error', 'short_inputs'));
    when sqlstate 'HRJ12' then return public.hr_note_rejection(c_verb, p_slot, v_a || jsonb_build_object('ok', false));
    when sqlstate 'HRJ13' then
      return jsonb_build_object('ok', true, 'replayed', true, 'job', (select to_jsonb(t) - 'seed' from public.trade_jobs t where t.user_id = v_uid and t.idem = p_idem));
  end;
  insert into public.trade_jobs (id, user_id, slot, idem, recipe, kind, trade, face, band, rung, level, count, fee, inputs, took, seed, started_at, ends_at)
  values (v_job, v_uid, p_slot, p_idem, p_recipe, v_q->>'kind', v_q->>'trade', v_q->>'face', (v_q->>'band')::int, (v_q->>'rung')::int, (v_q->>'level')::int,
          p_count, v_fee, v_q->'inputs', coalesce(v_take->'from', '{}'::jsonb), v_seed, now(), (v_q->>'ends_at')::timestamptz);
  if v_need <> '{}'::jsonb then
    select sum(value::bigint) into v_n from jsonb_each_text(v_need);
    insert into public.player_ledger (user_id, slot, kind, intent, qty, gold, meta)
    values (v_uid, p_slot, v_kind, 'trade_job:' || p_recipe, -v_n, 0,
            jsonb_build_object('reason', 'trade_in', 'recipe', p_recipe, 'job', v_job, 'count', p_count, 'items', v_need, 'took', v_take->'from'));
  end if;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -v_fee,
    'job', (select to_jsonb(t) - 'seed' from public.trade_jobs t where t.id = v_job), 'envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

create or replace function public.hr_trade_job_end(p_slot int, p_early boolean, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'trade_job_end';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_res jsonb;
begin
  -- K1 (1073-k1-job-slice.sql): COLLECT A FINISHED JOB, or STOP ONE NOW (p_early). The contract is this file's header, §4.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_flag_on('trade_jobs') then return jsonb_build_object('ok', false, 'error', 'not_open'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_verb := 'trade_job_end:' || case when coalesce(p_early, false) then 'stop' else 'collect' end;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return v_r || jsonb_build_object('replayed', true); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return v_r || jsonb_build_object('replayed', true); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_res := public.hr_trade_job_close(v_uid, p_slot, now(), coalesce(p_early, false));
  if v_res is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_job')); end if;
  if coalesce(v_res->>'ok', 'false') <> 'true' then return v_res; end if;
  -- THE KEY IS CLAIMED by its decision (a replay answers this receipt, no envelope)
  insert into public.player_intents (user_id, intent_id, slot, intent, result)
  values (v_uid, p_idem, p_slot, v_verb, v_res) on conflict (user_id, intent_id) do nothing;
  return v_res || jsonb_build_object('envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;

-- ── §5 THE SWEEP (browser closed: the server collects every finished job) ───
create or replace function public.hr_trade_jobs_sweep(p_limit integer default 500, p_user uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare c record; v jsonb; v_seen int := 0; v_done int := 0; v_busy int := 0; v_err int := 0; v_msg text;
begin
  -- K1 (1073-k1-job-slice.sql): EVERY MINUTE (cron 'hr-trade-jobs'), each open job whose ends_at has passed is collected exactly as
  -- hr_trade_job_end(false) would, at its true end, so the goods are the watched job's. Each in its own subtransaction; never waits.
  -- p_user (null: every account) keeps a probe to its own account (the §9 self-check).
  for c in select t.user_id, t.slot from public.trade_jobs t
            where t.settled_at is null and t.ends_at <= now() and (p_user is null or t.user_id = p_user)
            order by t.ends_at, t.id limit greatest(1, least(coalesce(p_limit, 500), 5000)) loop
    v_seen := v_seen + 1;
    begin
      if not pg_try_advisory_xact_lock(hashtextextended(c.user_id::text || ':' || c.slot::text, 0)) then v_busy := v_busy + 1; continue; end if;
      perform 1 from public.player_state where user_id = c.user_id and slot = c.slot for update skip locked;
      if not found then v_busy := v_busy + 1; continue; end if;
      if not pg_try_advisory_xact_lock(hashtextextended('hr:depot:' || c.user_id::text, 0)) then v_busy := v_busy + 1; continue; end if;
      -- the purse too, never waited on: a job the day's cap ended credits its unattempted sets' fee back (hr_apply), and a party settle
      -- holding this account's purse would otherwise make the sweep wait on it while it holds the hero (ONE-TOWN-WORK)
      perform 1 from public.account_wallet w where w.user_id = c.user_id for update skip locked;
      if not found and exists (select 1 from public.account_wallet w where w.user_id = c.user_id) then v_busy := v_busy + 1; continue; end if;
      v := public.hr_trade_job_close(c.user_id, c.slot, now(), false);
      if coalesce(v->>'ok', '') = 'true' then v_done := v_done + 1; end if;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_err := v_err + 1;
      perform public.hr_record_rejection(c.user_id, c.slot, 'trade_jobs', 'sweep_fault', jsonb_build_object('error', left(v_msg, 200)), 1);
    end;
  end loop;
  return jsonb_build_object('seen', v_seen, 'settled', v_done, 'busy', v_busy, 'errors', v_err);
end $fn$;

create or replace function public.hr_trade_jobs_prune(p_limit integer default 1000)
returns integer language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_n int;
begin
  -- K1 (1073-k1-job-slice.sql): THE PRUNE, with the sweep each minute: settled jobs past 30 days (the ledger keeps the history), a
  -- bounded batch. Never an open job.
  with old as (select id from public.trade_jobs where settled_at is not null and settled_at < now() - interval '30 days'
                order by settled_at limit greatest(1, least(coalesce(p_limit, 1000), 10000)))
  delete from public.trade_jobs t using old where t.id = old.id;
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

-- ── §5b THE STANDING WORK RULE BUYS FOR A RUNNING JOB (09 4.11 row 7, ONE-TOWN-WORK) ─────────────────
-- 1071-work-blocks.sql's rule bought a work block only while the hero's POINTER was town work. With one town work the job is what
-- bought work is for: a hero whose open job would stop at the day's cap with sets left (its whole count's time from its start passes
-- hr_trade_work_stop) is working for the rule. Everything else is 1071's rule unchanged (the lead, the quote, the count, the ceiling,
-- the reserve, the key, the never-wait locks); a block bought under a job moves the job's end (hr_trade_job_close raises ends_at).
create or replace function public.hr_trade_job_wants_block(p_user uuid, p_slot int)
returns boolean language plpgsql stable set search_path = public, pg_catalog as $fn$
declare j public.trade_jobs%rowtype; v_full jsonb; v_stop timestamptz;
begin
  -- ONE-TOWN-WORK (1073-k1-job-slice.sql §5b): the hero's open job would stop at the day's cap with sets left.
  select * into j from public.trade_jobs where user_id = p_user and slot = p_slot and settled_at is null;
  if not found then return false; end if;
  v_full := public.hr_trade_job_bound(j.kind, j.rung, j.level, false, 0, 1000, j.count, 1000000000000);
  v_stop := public.hr_trade_work_stop(p_user, p_slot, j.started_at);
  return v_full is not null and v_stop is not null
     and j.started_at + ((v_full->>'spent_ms')::bigint * interval '1 millisecond') > v_stop;
end $fn$;

do $mig$
declare v_md5 text;
begin
  -- THE PINS: the two bodies restated below are 1071-work-blocks.sql's images or this file's own (a second apply)
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_time_auto_buy(uuid,integer,text)'::regprocedure;
  if v_md5 is null or (v_md5 not in ('450a1387bbfe0ce0e64df52c68de73e5', 'fc77e75aa2c59592ac2d60ab7a424810')) then
    raise exception 'PIN: hr_time_auto_buy is neither 1071''s image nor this file''s own (md5 %): another file moved it; re-derive', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_time_auto_sweep(integer)'::regprocedure;
  if v_md5 is null or (v_md5 not in ('69b332f12f6b9b820be6448e2e2daa9f', 'bb89955a0f594149ebb20bddf195f5c4')) then
    raise exception 'PIN: hr_time_auto_sweep is neither 1071''s image nor this file''s own (md5 %): another file moved it; re-derive', v_md5; end if;
end $mig$;

create or replace function public.hr_time_auto_buy(p_user uuid, p_slot integer, p_kind text)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_up int; v_max bigint; v_lead bigint; v_q jsonb; v_price bigint; v_lv int; v_res bigint; v_purse bigint; v_ver bigint;
  v_sat timestamptz; v_at timestamptz; v_idem uuid; v_verb text; v_r jsonb; v_a jsonb; v_due boolean; v_n int;
begin
  -- WORK-BLOCKS (1071-work-blocks.sql): ONE ATTEMPT OF ONE HERO'S STANDING RULE (header §7). auth.uid() must be p_user: the sweep names
  -- the hero it acts for (request.jwt.claim.sub), so hr_apply journals it as that hero's own purchase.
  -- ONE-TOWN-WORK (1073-k1-job-slice.sql §5b): a hero is working for the rule when its pointer is town work OR its open job would stop
  -- at the day's cap with sets left (hr_trade_job_wants_block).
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
                                          and ps.active_kind = any (public.hr_work_kinds()))
       and not public.hr_trade_job_wants_block(p_user, p_slot) then
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
  -- ONE-TOWN-WORK (1073-k1-job-slice.sql §5b): a hero with an open trade job is a town-work candidate too.
  for c in select r.user_id, r.slot, r.kind from public.hero_time_rules r
             join public.player_state ps on ps.user_id = r.user_id and ps.slot = r.slot
            where (r.kind = 'hunt' and exists (select 1 from public.hunt_sessions h where h.user_id = r.user_id and h.slot = r.slot and h.ended_at is null))
               or (r.kind = 'work' and (ps.active_kind = any (public.hr_work_kinds())
                                        or exists (select 1 from public.trade_jobs t where t.user_id = r.user_id and t.slot = r.slot and t.settled_at is null)))
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

-- ── §6 THE GUARD: a hero holding a job does nothing else ───────────────────
create or replace function public.hr_trade_job_busy()
returns trigger language plpgsql set search_path = public, pg_catalog as $fn$
begin
  -- K1 (1073-k1-job-slice.sql): the pointer leaving idle (a hunt, a gathering job, a bench run) while this hero holds a trade job is
  -- refused, so a job's hours are never also hunted or worked twice. End the job first (hr_trade_job_end).
  if exists (select 1 from public.trade_jobs j where j.user_id = new.user_id and j.slot = new.slot and j.settled_at is null) then
    raise exception using errcode = 'HRJ01', message = 'trade_job_open',
      detail = 'this hero is working a trade job; end it first (hr_trade_job_end)';
  end if;
  return new;
end $fn$;
drop trigger if exists hr_trade_job_busy on public.player_state;
create trigger hr_trade_job_busy before update of active_kind on public.player_state
  for each row when (old.active_kind = 'idle' and new.active_kind <> 'idle') execute function public.hr_trade_job_busy();

-- ── §7 THE SECTION `trade_jobs` ──────────────────────────────────────────────
create or replace function public.hr_trade_jobs_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare
  v_job jsonb; v_last jsonb; v_recipes jsonb := '[]'::jsonb; r record; v_q jsonb; v_feed bigint; v_count bigint; v_open public.trade_jobs%rowtype;
  v_end timestamptz; v_full jsonb;
begin
  -- K1 (1073-k1-job-slice.sql): THE SECTION `trade_jobs` (header §7). Every number is the server's; the seed never leaves.
  if not public.hr_flag_on('trade_jobs') then return null; end if;
  select * into v_open from public.trade_jobs where user_id = p_user and slot = p_slot and settled_at is null;
  if found then
    v_full := public.hr_trade_job_bound(v_open.kind, v_open.rung, v_open.level, false, 0, 1000, v_open.count, 1000000000000);
    v_end := greatest(v_open.started_at, least(v_open.started_at + (coalesce((v_full->>'spent_ms')::bigint, 0) * interval '1 millisecond'),
                                               coalesce(public.hr_trade_work_stop(p_user, p_slot, v_open.started_at), v_open.ends_at)));
    v_job := jsonb_build_object('id', v_open.id, 'recipe', v_open.recipe, 'name', (select name from public.hr_trade_recipes where recipe = v_open.recipe),
      'face', (select face from public.hr_trade_recipes where recipe = v_open.recipe), 'trade', v_open.trade, 'band', v_open.band,
      'count', v_open.count, 'fee', v_open.fee, 'level', v_open.level, 'started_at', v_open.started_at, 'ends_at', v_end,
      'attempt_ms', (public.hr_trade_job_bound(v_open.kind, v_open.rung, v_open.level, false, 0, 1000, 1, 1000000000000)->>'spent_ms')::bigint,
      'due', v_end <= now());
  end if;
  select jsonb_build_object('id', t.id, 'recipe', t.recipe, 'name', (select name from public.hr_trade_recipes where recipe = t.recipe),
           'face', (select face from public.hr_trade_recipes where recipe = t.recipe), 'settled_at', t.settled_at, 'result', t.result)
    into v_last from public.trade_jobs t where t.user_id = p_user and t.slot = p_slot and t.settled_at is not null
   order by t.settled_at desc limit 1;
  for r in select x.* from public.hr_trade_recipes x join public.hr_trade_kinds k on k.kind = x.kind where k.ships = 'v030' order by x.trade, x.band, x.recipe loop
    /* the whole-day job the start would take: as many sets as bag + Storage feed, at most the day's count */
    v_feed := null;
    select min(floor((coalesce((select i.qty from public.player_inventory i where i.user_id = p_user and i.slot = p_slot and i.item_id = e.key), 0)
                      + coalesce((select b.qty from public.account_bank b where b.user_id = p_user and b.item_id = e.key), 0)) / greatest(1, e.value::bigint)))::bigint
      into v_feed from jsonb_each_text(r.inputs) e;
    v_q := public.hr_trade_job_quote(p_user, p_slot, r.recipe, null);
    if coalesce(v_q->>'ok', 'false') = 'true' then
      v_count := least((v_q->>'count_cap')::bigint, coalesce(v_feed, (v_q->>'count_cap')::bigint));
      if v_count < 1 then v_q := jsonb_build_object('ok', false, 'error', 'short_inputs', 'count_cap', (v_q->>'count_cap')::bigint);
      else
        /* the start's own numbers for that count: the fee (hr_trade_job_fee) and the end (its time, cut by the day's stop) */
        v_full := public.hr_trade_job_bound(r.kind, r.rung, (v_q->>'level')::int, false, 0, 1000, v_count::int, 1000000000000);
        v_q := jsonb_build_object('ok', true, 'count', v_count, 'count_cap', (v_q->>'count_cap')::bigint, 'level', (v_q->>'level')::int,
                 'fee', public.hr_trade_job_fee(r.kind, r.band, v_count::int), 'spent_ms', (v_full->>'spent_ms')::bigint,
                 'ends_at', least(now() + ((v_full->>'spent_ms')::bigint * interval '1 millisecond'), (v_q->>'stop')::timestamptz));
      end if;
    end if;
    v_recipes := v_recipes || jsonb_build_array(jsonb_build_object('id', r.recipe, 'name', r.name, 'trade', r.trade, 'kind', r.kind, 'band', r.band,
                   'face', r.face, 'r_level', r.r_level, 'inputs', r.inputs, 'quote', v_q));
  end loop;
  return jsonb_build_object(
    'trades', (select coalesce(jsonb_object_agg(t.trade, jsonb_build_object('xp', coalesce(x.xp, 0), 'level', public.hr_trade_level(coalesce(x.xp, 0)))), '{}'::jsonb)
                 from (select distinct trade from public.hr_trade_kinds where ships = 'v030') t
                 left join public.company_trade_xp x on x.user_id = p_user and x.trade_id = t.trade),
    'job', v_job, 'last', v_last, 'recipes', v_recipes,
    'stock', (select coalesce(jsonb_object_agg(s.item_id, s.q), '{}'::jsonb) from (
                select item_id, jsonb_build_object('fine', coalesce(sum(qty) filter (where quality = 1), 0), 'master', coalesce(sum(qty) filter (where quality = 2), 0)) q
                  from public.company_stock where user_id = p_user group by item_id) s));
end $fn$;

insert into public.hr_state_sections (key, fn, note) values
  ('trade_jobs', 'hr_trade_jobs_view', '1073-k1-job-slice.sql: the kit trades'' jobs (the company''s trade Levels, the open job and its end, the last result, every recipe''s whole-day quote, the Fine and Master stock); null while trade_jobs is off')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §8 GRANTS (revoke before grant), THE BASELINE, THE CRON ─────────────────
do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_trade_work_stop(uuid,integer,timestamp with time zone)', 'public.hr_trade_level_of(uuid,text)',
                               'public.hr_trade_band_open(uuid,integer)', 'public.hr_trade_job_quote(uuid,integer,text,integer)',
                               'public.hr_trade_job_close(uuid,integer,timestamp with time zone,boolean)', 'public.hr_trade_jobs_sweep(integer,uuid)', 'public.hr_trade_jobs_prune(integer)',
                               'public.hr_trade_jobs_view(uuid,integer)', 'public.hr_trade_job_busy()', 'public.hr_trade_job_wants_block(uuid,integer)',
                               'public.hr_time_auto_buy(uuid,integer,text)', 'public.hr_time_auto_sweep(integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
  foreach v_sig in array array['public.hr_trade_job_start(integer,text,integer,bigint,uuid)', 'public.hr_trade_job_end(integer,boolean,uuid)'] loop
    execute format('revoke execute on function %s from public, anon, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end $mig$;
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_trade_job_start', 'p_slot integer, p_recipe text, p_count integer, p_fee bigint, p_idem uuid', 'authenticated',
   'added 1073-k1-job-slice.sql (lane/k1-job-slice): MONEY (a gold sink and an inventory debit) - start a kit-trade job: one catalogue recipe, a count up to one work day, the fee the server''s; inputs from the bag then Storage; refuses busy, rung_locked, band_locked, work_cap, count_cap, quote_changed, short_inputs; dark (trade_jobs); pre-EA Security list S-27'),
  ('hr_trade_job_end', 'p_slot integer, p_early boolean, p_idem uuid', 'authenticated',
   'added 1073-k1-job-slice.sql (lane/k1-job-slice): MONEY (inventory and trade XP credit) - collect a finished kit-trade job (not_due before the server says) or stop one now; the goods from the stored seed; dark (trade_jobs); pre-EA Security list S-27')
  on conflict (proname, identity_args, grantee) do update set note = excluded.note;
do $mig$ begin perform public.hr_cron_ensure('hr-trade-jobs', '* * * * *', 'select public.hr_trade_jobs_sweep(500), public.hr_trade_jobs_prune(1000)'); end $mig$;

-- ── §9 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) THE SURFACE: three tables with RLS on, no policy and no client privilege; the switch is off; dark, both verbs answer not_open and
--     the section is null; the internal functions reach no client role; the two verbs are exactly the signed-in client's and in the
--     baseline; the cron is scheduled; grant hygiene is quiet.
-- (b) THE TWIN: hr_trade_work_stop at a fresh hero's first instant is that instant plus its whole day.
-- (c) LIT, THE REFUSALS IN ORDER, each moving nothing: bad_recipe (no such recipe), busy (a gathering pointer), rung_locked (Smithing 1
--     on the Iron salts), band_locked (band 1, no depth record; a record at a deeper band opens it, one at a shallower band does not),
--     count_cap (one past the day), quote_changed (fee + 1), short_inputs (Cook Shrimp with no shrimp), work_cap (the day used).
-- (d) LIT, A JOB, STARTED AND COLLECTED: Cook Shrimp for the whole day's count from the bag and Storage: the shrimp leave, the fee burns,
--     one trade_fee and one trade_in row; the key pressed again answers the same job and moves nothing; the pointer cannot leave idle
--     (HRJ01); a collect before the end is not_due; with the job's clock run back to its end, the sweep collects it: the goods are
--     hr_trade_roll on the stored seed (Plain in Storage, Fine and Master in company_stock), the XP is the bound's, the work day spent its
--     span, and a second sweep and a collect find nothing (no_job).
-- (e) LIT, A STOP: a second job stopped at once lands nothing made, refunds every set to Storage (trade_refund) and the whole fee
--     (trade_fee_refund, the purse back where it was), and spends its seed; (d)'s done job had no fee back.
-- (f) LIT, THE RULE FOR A JOB: no job is not_working; then a whole day's job on the day's last minutes of work, its answer decided by
--     the server's one clock (now() is one instant in the apply) at EVERY time of day (lane/k1-server-fixes: this check was red in
--     the day's last 5 minutes and from 21:49 to 21:55 UTC, so an apply there was refused):
--       its work ends before midnight: it wants a block; the rule buys it while today can still work the block whole (the quote's
--         room), and the job's end moves out; later in the day the rule answers day_ending
--       midnight comes first: the job runs on into the next UTC day's fresh cap with its whole count, so it wants no block (the rule
--         answers not_working) and it ends past midnight
-- (g) A JOB'S OWN DAY (lane/k1-server-fixes): a stop read on a later UTC day counts the work blocks bought on the job's day, both where
--     that day's cap ends the work and where its block carries the work past midnight.
do $$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-000000c11073';
  v jsonb; q jsonb; v_job public.trade_jobs%rowtype; v_roll jsonb; v_g bigint; v_n bigint; v_cap bigint; v_ms bigint; v_t timestamptz;
  v_fine bigint; v_master bigint; v_plain bigint; v_stock bigint; v_now bigint; v_left bigint; v_blk bigint; v_room bigint; v_y timestamptz;
  v_base bigint;
begin
  -- (a) the surface, before any probe
  if exists (select 1 from pg_class t where t.oid in ('public.trade_jobs'::regclass, 'public.company_trade_xp'::regclass, 'public.company_stock'::regclass)
              and not t.relrowsecurity)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('trade_jobs', 'company_trade_xp', 'company_stock')) then
    raise exception 'VERIFY(a): a job table has RLS off or a policy'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated']) g(r), unnest(array['public.trade_jobs', 'public.company_trade_xp', 'public.company_stock']) t(n)
              where has_table_privilege(g.r, t.n, 'select') or has_table_privilege(g.r, t.n, 'insert') or has_table_privilege(g.r, t.n, 'update')
                 or has_table_privilege(g.r, t.n, 'delete')) then
    raise exception 'VERIFY(a): a client role reaches a job table'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated']) g(r),
                       unnest(array['public.hr_trade_work_stop(uuid,integer,timestamp with time zone)', 'public.hr_trade_level_of(uuid,text)',
                                    'public.hr_trade_band_open(uuid,integer)', 'public.hr_trade_job_quote(uuid,integer,text,integer)',
                                    'public.hr_trade_job_close(uuid,integer,timestamp with time zone,boolean)', 'public.hr_trade_jobs_sweep(integer,uuid)', 'public.hr_trade_jobs_prune(integer)',
                                    'public.hr_trade_jobs_view(uuid,integer)', 'public.hr_trade_job_wants_block(uuid,integer)',
                                    'public.hr_time_auto_buy(uuid,integer,text)', 'public.hr_time_auto_sweep(integer)']) f(s)
              where has_function_privilege(g.r, f.s, 'execute')) then
    raise exception 'VERIFY(a): a client role reaches an internal job function'; end if;
  if has_function_privilege('anon', 'public.hr_trade_job_start(integer,text,integer,bigint,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_trade_job_end(integer,boolean,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_trade_job_start(integer,text,integer,bigint,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_trade_job_end(integer,boolean,uuid)', 'execute')
     or (select count(*) from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_trade_job_start', 'hr_trade_job_end')) <> 2 then
    raise exception 'VERIFY(a): the two verbs are not exactly the signed-in client''s'; end if;
  if to_regclass('cron.job') is not null and not exists (select 1 from cron.job where jobname = 'hr-trade-jobs') then
    raise exception 'VERIFY(a): the sweep is not scheduled'; end if;
  -- the switch is dark until 1079-one-town-work-cut.sql lights it (its bridge helper marks that it has run: a retried apply finds it lit)
  if (select enabled from public.hr_flags where key = 'trade_jobs') is distinct from (to_regprocedure('public.hr_hearth_fuel_of(text)') is not null) then
    raise exception 'VERIFY(a): trade_jobs is % at the apply', (select case when enabled then 'lit' else 'dark' end from public.hr_flags where key = 'trade_jobs'); end if;
  begin
    update public.hr_flags set enabled = false where key = 'trade_jobs';   -- the dark arm reads it dark (rolled back below)
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'k1-job-slice §9 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a)-harness: hr_create_character refused: %', v; end if;
    if public.hr_trade_job_start(0, 'meal_b0', 1, 0, '000000c0-0000-4000-a000-00000c107300')->>'error' is distinct from 'not_open'
       or public.hr_trade_job_end(0, false, '000000c0-0000-4000-a000-00000c107301')->>'error' is distinct from 'not_open'
       or public.hr_trade_jobs_view(v_u, 0) is not null then
      raise exception 'VERIFY(a): a dark verb or the section answered something'; end if;

    -- (b) the twin at a fresh hero's first instant: the whole day
    update public.player_state set work_day = null, work_ms = 0 where user_id = v_u and slot = 0;
    v_cap := (public.hr_work_state(v_u, 0)->>'base_ms')::bigint + (public.hr_work_state(v_u, 0)->>'extra_ms')::bigint;
    v_t := date_trunc('day', now() at time zone 'utc') at time zone 'utc' + interval '1 hour';
    if public.hr_trade_work_stop(v_u, 0, v_t) is distinct from v_t + v_cap * interval '1 millisecond' then
      raise exception 'VERIFY(b): a fresh day from % stops at %, not % later', v_t, public.hr_trade_work_stop(v_u, 0, v_t), v_cap; end if;

    -- (c) lit, the refusals in order, each moving nothing
    update public.hr_flags set enabled = true where key = 'trade_jobs';
    delete from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'shrimp';
    delete from public.account_bank where user_id = v_u and item_id in ('shrimp', 'cooked_shrimp');
    insert into public.account_wallet as w (user_id, gold) values (v_u, 100000000)
      on conflict (user_id) do update set gold = excluded.gold, version = w.version + 1, updated_at = now();
    v_n := (select count(*) from public.player_ledger where user_id = v_u);
    delete from public.hr_rate_counters where user_id = v_u;
    if public.hr_trade_job_start(0, 'meal_b99', 1, 0, gen_random_uuid())->>'error' is distinct from 'bad_recipe' then
      raise exception 'VERIFY(c): no such recipe answered otherwise'; end if;
    update public.player_state set active_kind = 'gather', active_id = (select activity_id from public.hr_activities where kind = 'gather' order by 1 limit 1)
     where user_id = v_u and slot = 0;
    q := public.hr_trade_job_quote(v_u, 0, 'meal_b0', 1);
    v := public.hr_trade_job_start(0, 'meal_b0', 1, (q->>'fee')::bigint, gen_random_uuid());
    if v->>'error' is distinct from 'busy' or v->>'doing' is distinct from 'gather' then raise exception 'VERIFY(c): a gathering hero answered %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    v := public.hr_trade_job_start(0, 'temper_kit_b1', 1, 1, gen_random_uuid());
    if v->>'error' is distinct from 'rung_locked' or (v->>'need')::int <> (select r_level from public.hr_trade_recipes where recipe = 'temper_kit_b1') then
      raise exception 'VERIFY(c): Smithing 1 on the Iron salts answered %', v; end if;
    insert into public.company_trade_xp (user_id, trade_id, xp) values (v_u, 'smithing', (select xp from public.hr_trade_xp where level = 21));
    delete from public.hunt_density where user_id = v_u;
    v := public.hr_trade_job_start(0, 'temper_kit_b1', 1, 1, gen_random_uuid());
    if v->>'error' is distinct from 'band_locked' or (v->>'band')::int <> 1 then raise exception 'VERIFY(c): band 1 with no depth record answered %', v; end if;
    -- a depth record at a DEEPER band opens band 1 (the designer, 2026-11-27); one at band 1 does not open band 2
    insert into public.hunt_density (user_id, slot, hunt_id, density, danger_held)
      select v_u, 0, g.hunt_id, 1, 10 from public.hr_trade_ground_bands g where g.band = (select max(band) from public.hr_trade_ground_bands);
    if not public.hr_trade_band_open(v_u, 1) or not public.hr_trade_band_open(v_u, (select max(band) from public.hr_trade_ground_bands))
       or public.hr_trade_band_open(v_u, (select max(band) from public.hr_trade_ground_bands) + 1)
       or coalesce(public.hr_trade_job_quote(v_u, 0, 'temper_kit_b1', 1)->>'ok', '') <> 'true' then
      raise exception 'VERIFY(c): a record at the deepest band opens band 1 %, its own %, the next %; the Iron salts quote %', public.hr_trade_band_open(v_u, 1),
        public.hr_trade_band_open(v_u, (select max(band) from public.hr_trade_ground_bands)),
        public.hr_trade_band_open(v_u, (select max(band) from public.hr_trade_ground_bands) + 1), public.hr_trade_job_quote(v_u, 0, 'temper_kit_b1', 1); end if;
    delete from public.hunt_density where user_id = v_u;
    insert into public.hunt_density (user_id, slot, hunt_id, density, danger_held)
      select v_u, 0, g.hunt_id, 1, 10 from public.hr_trade_ground_bands g where g.band = 1;
    if not public.hr_trade_band_open(v_u, 1) or public.hr_trade_band_open(v_u, 2) then
      raise exception 'VERIFY(c): a band 1 record opens band 1 %, band 2 %', public.hr_trade_band_open(v_u, 1), public.hr_trade_band_open(v_u, 2); end if;
    delete from public.hunt_density where user_id = v_u;
    q := public.hr_trade_job_quote(v_u, 0, 'meal_b0', 1);
    v := public.hr_trade_job_start(0, 'meal_b0', (q->>'count_cap')::int + 1, 0, gen_random_uuid());
    if v->>'error' is distinct from 'count_cap' then raise exception 'VERIFY(c): one past the day''s count answered %', v; end if;
    v := public.hr_trade_job_start(0, 'meal_b0', 3, (public.hr_trade_job_quote(v_u, 0, 'meal_b0', 3)->>'fee')::bigint + 1, gen_random_uuid());
    if v->>'error' is distinct from 'quote_changed' then raise exception 'VERIFY(c): a wrong fee answered %', v; end if;
    v := public.hr_trade_job_start(0, 'meal_b0', 3, (public.hr_trade_job_quote(v_u, 0, 'meal_b0', 3)->>'fee')::bigint, gen_random_uuid());
    if v->>'error' is distinct from 'short_inputs' or v->>'item_id' is distinct from 'shrimp' then raise exception 'VERIFY(c): no shrimp answered %', v; end if;
    update public.player_state set work_day = (now() at time zone 'utc')::date, work_ms = v_cap where user_id = v_u and slot = 0;
    if public.hr_trade_job_start(0, 'meal_b0', 1, 0, gen_random_uuid())->>'error' is distinct from 'work_cap' then
      raise exception 'VERIFY(c): a used day answered otherwise'; end if;
    update public.player_state set work_day = null, work_ms = 0 where user_id = v_u and slot = 0;
    if (select count(*) from public.player_ledger where user_id = v_u) <> v_n or (select gold from public.account_wallet where user_id = v_u) <> 100000000
       or exists (select 1 from public.trade_jobs where user_id = v_u) then
      raise exception 'VERIFY(c): a refusal moved something'; end if;

    -- (d) lit, a job: the whole day of Cook Shrimp, fed from the bag and Storage
    q := public.hr_trade_job_quote(v_u, 0, 'meal_b0', 1);
    v_cap := (q->>'count_cap')::bigint;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, 'shrimp', 5);
    insert into public.account_bank (user_id, item_id, qty) values (v_u, 'shrimp', v_cap);
    q := public.hr_trade_job_quote(v_u, 0, 'meal_b0', v_cap::int);
    v_g := (select gold from public.account_wallet where user_id = v_u);
    v := public.hr_trade_job_start(0, 'meal_b0', v_cap::int, (q->>'fee')::bigint, '000000c0-0000-4000-a000-00000c107310');
    if coalesce(v->>'ok', '') <> 'true' or (v->'job') ? 'seed' or v->'envelope'->'trade_jobs'->'job'->>'recipe' is distinct from 'meal_b0'
       or (select gold from public.account_wallet where user_id = v_u) <> v_g - (q->>'fee')::bigint
       or exists (select 1 from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'shrimp')
       or (select qty from public.account_bank where user_id = v_u and item_id = 'shrimp') <> 5 then
      raise exception 'VERIFY(d): the start answered % (gold %, Storage shrimp %)', v - 'envelope', (select gold from public.account_wallet where user_id = v_u),
        (select qty from public.account_bank where user_id = v_u and item_id = 'shrimp'); end if;
    if (select count(*) from public.player_ledger where user_id = v_u and meta->>'reason' = 'trade_fee' and meta->>'recipe' = 'meal_b0') <> 1
       or (select count(*) from public.player_ledger where user_id = v_u and meta->>'reason' = 'trade_in' and qty = -v_cap) <> 1 then
      raise exception 'VERIFY(d): the start''s journal is %', (select jsonb_agg(meta) from public.player_ledger where user_id = v_u and intent like 'trade\_job:%'); end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_trade_job_start(0, 'meal_b0', v_cap::int, (q->>'fee')::bigint, '000000c0-0000-4000-a000-00000c107310');
    if coalesce(v->>'replayed', '') <> 'true' or (select count(*) from public.trade_jobs where user_id = v_u) <> 1
       or (select gold from public.account_wallet where user_id = v_u) <> v_g - (q->>'fee')::bigint then
      raise exception 'VERIFY(d): the key pressed again answered % or moved something', v; end if;
    begin
      update public.player_state set active_kind = 'combat', active_id = 'mill_cellar' where user_id = v_u and slot = 0;
      raise exception 'VERIFY(d): the pointer left idle under an open job';
    exception when sqlstate 'HRJ01' then null;
    end;
    delete from public.hr_rate_counters where user_id = v_u;
    if public.hr_trade_job_end(0, false, gen_random_uuid())->>'error' is distinct from 'not_due' then
      raise exception 'VERIFY(d): a collect before the end answered otherwise'; end if;
    select * into v_job from public.trade_jobs where user_id = v_u and settled_at is null;
    v_ms := floor(extract(epoch from (v_job.ends_at - v_job.started_at)) * 1000)::bigint;
    update public.trade_jobs set started_at = started_at - v_ms * interval '1 millisecond' - interval '1 minute',
                                 ends_at = ends_at - v_ms * interval '1 millisecond' - interval '1 minute' where id = v_job.id;
    select * into v_job from public.trade_jobs where id = v_job.id;
    v_roll := public.hr_trade_roll(v_job.kind, v_job.rung, v_job.level, false, 0, 1000, v_job.count, v_ms, v_job.seed);
    q := public.hr_work_fold(null, 0, v_job.started_at, v_job.started_at + v_ms * interval '1 millisecond',
                             (public.hr_work_state(v_u, 0)->>'base_ms')::bigint, (public.hr_work_state(v_u, 0)->>'extra_ms')::bigint,
                             (now() at time zone 'utc')::date);
    v := public.hr_trade_jobs_sweep(50, v_u);
    if (v->>'settled')::int < 1 or exists (select 1 from public.trade_jobs where user_id = v_u and settled_at is null) then
      raise exception 'VERIFY(d): the sweep did not collect the job: %', v; end if;
    v_plain := coalesce((select qty from public.account_bank where user_id = v_u and item_id = 'cooked_shrimp'), 0);
    v_fine := coalesce((select qty from public.company_stock where user_id = v_u and item_id = 'cooked_shrimp' and quality = 1), 0);
    v_master := coalesce((select qty from public.company_stock where user_id = v_u and item_id = 'cooked_shrimp' and quality = 2), 0);
    if v_plain <> (v_roll->>'plain')::bigint or v_fine <> (v_roll->>'fine')::bigint or v_master <> (v_roll->>'master')::bigint
       or (v_roll->>'attempts')::bigint <> v_cap
       or (select xp from public.company_trade_xp where user_id = v_u and trade_id = 'cooking') <> (v_roll->>'xp')::bigint
       or (select end_reason from public.trade_jobs where id = v_job.id) <> 'done'
       or (select work_ms from public.player_state where user_id = v_u and slot = 0) <> (q->>'used_ms')::bigint
       or (select work_day from public.player_state where user_id = v_u and slot = 0) <> (q->>'day')::date then
      raise exception 'VERIFY(d): the collect landed plain % fine % master % (roll %), XP %, end %, work %', v_plain, v_fine, v_master, v_roll,
        (select xp from public.company_trade_xp where user_id = v_u and trade_id = 'cooking'), (select end_reason from public.trade_jobs where id = v_job.id),
        (select work_ms from public.player_state where user_id = v_u and slot = 0); end if;
    if (select count(*) from public.player_ledger where user_id = v_u and meta->>'job' = v_job.id::text and meta->>'reason' in ('trade_out', 'trade_xp')) <> 2 then
      raise exception 'VERIFY(d): the collect''s journal is %', (select jsonb_agg(meta) from public.player_ledger where user_id = v_u and meta->>'job' = v_job.id::text); end if;
    delete from public.hr_rate_counters where user_id = v_u;
    if (public.hr_trade_jobs_sweep(50, v_u)->>'settled')::int <> 0 or public.hr_trade_job_end(0, false, gen_random_uuid())->>'error' is distinct from 'no_job' then
      raise exception 'VERIFY(d): a collected job was collected again'; end if;

    -- (e) a stop at once: nothing made, every set back to Storage and the WHOLE FEE back (09 4.11 row 5: no set was attempted), the
    --     seed spent; the done job of (d) attempted every set and had no fee back
    if exists (select 1 from public.player_ledger where user_id = v_u and meta->>'reason' = 'trade_fee_refund') then
      raise exception 'VERIFY(e): a job that attempted every set had its fee refunded'; end if;
    update public.player_state set work_day = null, work_ms = 0 where user_id = v_u and slot = 0;
    v_stock := (select qty from public.account_bank where user_id = v_u and item_id = 'shrimp');
    q := public.hr_trade_job_quote(v_u, 0, 'meal_b0', 3);
    v_g := (select gold from public.account_wallet where user_id = v_u);
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_trade_job_start(0, 'meal_b0', 3, (q->>'fee')::bigint, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(e): a second job answered %', v - 'envelope'; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_trade_job_end(0, true, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or v->>'end' is distinct from 'stop' or (v->>'refunded')::int <> 3 or (v->>'attempts')::int <> 0
       or (select qty from public.account_bank where user_id = v_u and item_id = 'shrimp') <> v_stock
       or (select count(*) from public.player_ledger where user_id = v_u and meta->>'reason' = 'trade_refund' and qty = 3) <> 1 then
      raise exception 'VERIFY(e): the stop answered %', v - 'envelope'; end if;
    if (v->>'fee_refund')::bigint is distinct from (q->>'fee')::bigint or (select gold from public.account_wallet where user_id = v_u) <> v_g
       or (select count(*) from public.player_ledger where user_id = v_u and meta->>'reason' = 'trade_fee_refund' and gold = (q->>'fee')::bigint) <> 1 then
      raise exception 'VERIFY(e): the stop gave back % of the fee % (purse % from %)', v->>'fee_refund', q->>'fee',
        (select gold from public.account_wallet where user_id = v_u), v_g; end if;

    -- (f) THE STANDING WORK RULE BUYS FOR A RUNNING JOB (09 4.11 row 7): no job, not_working; a whole day's job with half the rule's lead
    --     of the day's work left. Which answer is right is the server's one clock (now() is one instant here), read the two ways the
    --     functions read it: the job's midnight as hr_trade_work_stop counts it (whole ms from the start), and the block's room as
    --     hr_work_block_quote counts it (day_ending is what is left plus a block past the room)
    insert into public.hero_time_rules (user_id, slot, kind, up_to, max_price) values (v_u, 0, 'work', 1, null)
      on conflict (user_id, slot, kind) do update set up_to = 1, max_price = null;
    if public.hr_time_auto_buy(v_u, 0, 'work')->>'why' is distinct from 'not_working' then
      raise exception 'VERIFY(f): a hero with no job answered %', public.hr_time_auto_buy(v_u, 0, 'work'); end if;
    v_ms := (select lead_min::bigint * 60000 from public.hr_time_blocks where kind = 'work');
    v_blk := (select block_min::bigint * 60000 from public.hr_time_blocks where kind = 'work');
    update public.player_state set work_day = (now() at time zone 'utc')::date,
           work_ms = (public.hr_work_state(v_u, 0)->>'base_ms')::bigint - v_ms / 2 where user_id = v_u and slot = 0;
    if (public.hr_work_state(v_u, 0)->>'extra_ms')::bigint <> 0 then
      raise exception 'VERIFY(f)-harness: the probe holds bought work before its job: %', public.hr_work_state(v_u, 0); end if;
    v_left := v_ms / 2;
    v_now := floor(extract(epoch from now()) * 1000)::bigint;
    v_room := (v_now / 86400000 + 1) * 86400000 - v_now;
    q := public.hr_trade_job_quote(v_u, 0, 'meal_b0', 1);
    insert into public.account_bank as b (user_id, item_id, qty) values (v_u, 'shrimp', (q->>'count_cap')::bigint)
      on conflict (user_id, item_id) do update set qty = b.qty + excluded.qty;
    q := public.hr_trade_job_quote(v_u, 0, 'meal_b0', (q->>'count_cap')::int);
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_trade_job_start(0, 'meal_b0', (q->>'count')::int, (q->>'fee')::bigint, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(f): a whole day''s job on the day''s last minutes answered %', v - 'envelope'; end if;
    v_t := (select ends_at from public.trade_jobs where user_id = v_u and slot = 0 and settled_at is null);
    if v_left < v_room then
      -- its work ends before midnight, so the day's cap would stop it with sets left: it wants a block
      if not public.hr_trade_job_wants_block(v_u, 0) then
        raise exception 'VERIFY(f): a job whose work ends % ms before midnight wants no block (ends %)', v_room - v_left, v_t; end if;
      v := public.hr_time_auto_buy(v_u, 0, 'work');
      if v_left + v_blk <= floor(extract(epoch from (public.hr_utc_day_start(now()) + interval '1 day' - now())) * 1000)::bigint then
        if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(f): the rule did not buy for the running job: %', v; end if;
        q := public.hr_trade_job_close(v_u, 0, now(), false);
        if q->>'error' is distinct from 'not_due' or (select ends_at from public.trade_jobs where user_id = v_u and slot = 0 and settled_at is null) <= v_t then
          raise exception 'VERIFY(f): the bought block did not move the job''s end past % (close %, work %)', v_t, q, public.hr_work_state(v_u, 0); end if;
      elsif v->>'why' is distinct from 'day_ending' then raise exception 'VERIFY(f): % ms before midnight the rule answered %', v_room, v; end if;
    else
      -- midnight comes first: the job runs on into the next UTC day's fresh cap with its whole count, so no block is wanted
      if public.hr_trade_job_wants_block(v_u, 0) or v_t <= public.hr_utc_day_start(now()) + interval '1 day'
         or public.hr_time_auto_buy(v_u, 0, 'work')->>'why' is distinct from 'not_working' then
        raise exception 'VERIFY(f): % ms before midnight a whole day''s job wants a block % (ends %, the rule %)', v_room,
          public.hr_trade_job_wants_block(v_u, 0), v_t, public.hr_time_auto_buy(v_u, 0, 'work'); end if;
    end if;

    -- (g) A JOB'S OWN DAY: a stop from yesterday, read today, counts yesterday's bought block (a probe row of the ledger's own shape),
    --     where yesterday's cap ends the work and where the block carries it past midnight into today's cap
    v_y := public.hr_utc_day_start(now()) - interval '1 day';
    v_base := (public.hr_work_state(v_u, 0)->>'base_ms')::bigint;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta, at)
      values (v_u, 0, 'shop', 'time_buy:work:1', 0, jsonb_build_object('reason', 'time_buy', 'kind', 'work', 'n', 1, 'probe', '1073 §9 (g)'),
              v_y + interval '1 hour');
    update public.player_state set work_day = v_y::date, work_ms = v_base - 3600000 where user_id = v_u and slot = 0;
    v_t := public.hr_trade_work_stop(v_u, 0, v_y + interval '1 hour');
    if v_t is distinct from v_y + interval '2 hours' + v_blk * interval '1 millisecond' then
      raise exception 'VERIFY(g): yesterday''s last hour and its bought block, read today, stop at % (want %)', v_t, v_y + interval '2 hours' + v_blk * interval '1 millisecond'; end if;
    update public.player_state set work_day = v_y::date, work_ms = 0 where user_id = v_u and slot = 0;
    v_t := public.hr_trade_work_stop(v_u, 0, v_y + interval '1 day' - (v_base + v_blk / 2) * interval '1 millisecond');
    if v_t is distinct from v_y + interval '1 day' + (v_base + (public.hr_work_state(v_u, 0)->>'extra_ms')::bigint) * interval '1 millisecond' then
      raise exception 'VERIFY(g): yesterday''s block carrying the work past midnight, read today, stops at % (want today''s whole cap)', v_t; end if;

    raise exception using errcode = 'HRF73', message = 'k1-job-slice §9 complete - rolling back';
  exception when sqlstate 'HRF73' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.trade_jobs where user_id = v_u)
     or exists (select 1 from public.company_trade_xp where user_id = v_u) then
    raise exception 'VERIFY(a): §9 LEAKED a probe row'; end if;
  if (select enabled from public.hr_flags where key = 'trade_jobs') is distinct from (to_regprocedure('public.hr_hearth_fuel_of(text)') is not null) then
    raise exception 'VERIFY(a): the probe moved the trade_jobs switch'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'k1-job-slice: a job starts on the server''s quote, refuses in order, settles from its seed on the sweep and on a collect, stops with its sets back; all green';
end $$;
