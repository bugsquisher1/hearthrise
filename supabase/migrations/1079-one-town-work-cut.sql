-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1079-one-town-work-cut.sql — ONE TOWN WORK: THE OLD BENCH, ITS TAX, ITS RECIPES AND THE OLD TRADE SKILLS LEAVE
--   THE SERVER, AND THE LAST STATEMENT LIGHTS `trade_jobs` (lane/bench-cut-server, backend architect, 2026-11-28;
--   docs/design/redesign/09-crafting.md 4.11 row 1, 4.12 (the contract), 4.13 to 4.16 (the fates), 4.17 (the plan: this is its
--   server lane; data, edge and client land in the same merge)).
--
-- STATUS: supabase/migration-notes/1079-one-town-work-cut.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after every file on set/v0.2.144, after 1073-k1-job-slice.sql (the
--   switch, company_trade_xp, hr_trade_level_of), 1075-work-blocks-midnight.sql (hr_apply's chain end, PINNED), 1059-company-trades.sql
--   (the work day) and the data lane's regenerated 1065-named-pieces-items-catalogue.generated.sql
--   (hr_activities keeps only the Great Hearth's fuel_* runs, hr_skills only the combat skills and Inner Flame). Applied as ONE
--   transaction by the apply tool; never begin/commit here. Ends with its §8 self-check, then §9 lights trade_jobs.
-- EDGE: EDGE FIRST (release-plan: after; the release has one edge point, right after 1054). hr-accrue moves in the same merge (09 4.17,
--   the edge lane). ASSUMED, NOT PROVEN HERE (that edge is not built): between the edge point and this apply a hero still holds a gather
--   or bench pointer on the old hr_apply. The old bench tax refuses a TAXED bench window with no `bench_tax` key (bench_tax_missing), and
--   hr_require_settled refuses a write while a pointer's window is unpaid, so the edge lane MUST prove such a hero can be settled or
--   idled (start a hunt, take a job) before this file runs. A hearth run is untaxed (hr_bench_tax_due_mg 0), so it settles either way.
-- CLIENT: the envelope loses `bench_tax` (section), `work_day.trades` and `unlocked_recipes` (1032 amended in place, below); the Skills
--   window reads the company's trades from `trade_jobs.trades`; the Work window is the Jobs list, the work blocks and the hearth.
--
-- ── THE RULE (09 4.11 row 1, ruled by the designer) ─────────────────────────
-- The job slice IS the town work. The live bench is cut in the release that lights `trade_jobs`, and nothing converts: every
-- company starts every trade at Level 1 on 09's table (company_trade_xp, seconds of work). One artisan run survives as a bridge, the
-- Great Hearth's fuel run (09 4.13 row 3): it trains Inner Flame, a combat skill, and F1's lighting (lane/f1-inner-flame) retires it,
-- its fuel_* rows, `bench_run` and hr_apply's town-window path together.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- §0 PRECONDITIONS AND THE PINS (each body restated here is the image it was derived from, or this file's own: a retried apply), and
--    NOTHING STRANDED on a shared surface: a clan store holding an item the catalogue no longer has refuses the apply (a human decides).
-- §1 INTERNAL hr_hearth_fuel_of(activity) -> text: the item a Great Hearth fuel run burns (`fuel_<item>`, one a run), null for any
--    other id. The one rule hr_apply's Storage take and hr_bench_makes read. Owner only.
-- §2 RESTATED: hr_bench_makes (the hearth run's count, from hr_hearth_fuel_of; was hr_bench_inputs()) and hr_apply WHOLE from the chain
--    end (1075's image, pg_get_functiondef): the BENCH-TAX branch, its `bench_tax` delta key, the purse floor it set, its two state
--    columns, its `bt` journal key and its release code leave; the SKILLS-FROM-STORAGE take serves the hearth run (hr_hearth_fuel_of).
--    tests/run-sql-tests.mjs HR_APPLY_CHAIN walks it from 1040's body; its declared removals are tests/chain-removals/1079-one-town-work-cut.mjs.
-- §3 NOT RESTATED HERE: hr_tick_town_state and hr_work_day_view lose `bench_tax` and `trades` in place (AMENDED IN PLACE, below).
-- §4 THE FARM IS THE COMPANY'S FARMING (09 4.11 row 1): hr_farm_harvest credits company_trade_xp 'farming' hr_trade_levers.crop_xp (252,
--    src/core/trades.js cropXp) a crop harvested, journalled in the harvest's own ledger row (meta trade_xp: no hero's xp_in); a plant
--    and a watering pay no XP (the unit is the crop); every farm gate (plant, plot upgrade, the tend plan and view) reads
--    hr_trade_level_of(account, 'farming'). The crops' and plot tiers' req Levels are the data lane's, on the job ladder's rungs.
-- §5 RESTATED READERS: hr_market_eligible (the maker's door reads the company's making trades), hr_lb_skills (the eight old trades out).
--    NOT restated, read and left: hr_hunt_after_job, hr_hunt_resume, hr_resume_plan, hr_activity_left, hr_town_station_for,
--    hr_hearth_errand and hr_players_online* key on hr_activities rows and pointer kinds, so the data lane's catalogue cuts them;
--    hr_unlock_buy's req_skill block is inert (no offer names a skill); hr_daily_task_set_for and hr_daily_harvest_ready are gone.
-- §6 THE OLD TRADES' SKILL ROWS leave, journalled (one `admin` player_ledger row an account, intent one_town_work_cut, the XP by hero and
--    skill; 4.12's server row: nothing converts). Every gather pointer, and every artisan pointer that is no hearth run, goes to idle
--    with its errand and last-activity notes. NO ITEM AND NO LISTING IS DELETED: §0 refuses (STRANDED) while any bag, Storage, worn
--    slot, hunt bag, company stock, market listing or clan store holds an item the catalogue no longer has, as 1032 did.
-- §7 DROPPED: the bench tax (hr_bench_tax_settle / _view / _keep / _due_mg / _mg, the view hr_bench_tax_fees, the table
--    hr_bench_tax_rates, the `bench_tax` section; its two player_state columns stay inert until 1040 is applied: §7 (a)); hr_bench_inputs(); the recipe
--    verbs (hr_recipe_learn, hr_recipe_learn__ungated, hr_recipes_of, their baseline and GM wall rows). The company's old trades
--    (company_trades, hr_trade_row_sync, hr_trade_lock, hr_trade_is) need no drop: they were 1059's and never shipped.
-- §8 SELF-CHECK, executed and rolled back. §9 THE SWITCH: `trade_jobs` lit, the file's last statement.
-- AMENDED IN PLACE (each staged, never applied, so the release never ships what the cut removes): 1032-approved-cuts.sql's
--   hr_state_of without `unlocked_recipes` (no hr_unlocks row is a recipe since the cookbook cut, so the key was always {});
--   1048-narrow-town-read.sql's and 1059-company-trades.sql's town read without `bench_tax`; 1059 without its company-trades half
--   (company_trades, its fold, hr_trade_row_sync, hr_trade_lock, hr_trade_is, the work_day section's `trades`), its self-check on a
--   level-1 town job of either kind; 1073-k1-job-slice.sql's §9 reads the switch lit once this file has run (a retried apply).
--   RETRY PINS: 1040-rested-bank-cut.sql accepts this file's hr_apply, 1017-tend-the-field.sql this file's three farm verbs.
-- ERROR TAXONOMY: no new code. A stale engine's `bench_tax` is unknown_delta_key; `bench_tax_bad` and `bench_tax_purse` are never answered again.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- hr_apply's lock order is unchanged (the hero -> the depot -> bag rows -> Storage rows -> the purse, last); the take now names one
--   fuel or nothing. The farm harvest keeps hr_farm_lock and writes the company_trade_xp row LAST (`xp = xp + n`, never read-modify-
--   write), 1073's order, so a harvest and a job crediting one account's trades serialise on the row and neither is lost. §6 runs once
--   in the apply's transaction; a retried apply finds nothing left to remove and writes no ledger row (each insert is guarded by a
--   non-empty removal). The switch's update is idempotent.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- Removed: one client verb (hr_recipe_learn), one gold-moving branch of hr_apply (the bench tax, a gold DEBIT the engine counted and
--   the server priced), one envelope section, one engine delta key. Added: no verb, no grant, no table. The farm's XP is now company
--   XP, still server-priced (the catalogue lever, never the client) and per crop harvested; a plant or a watering pays none (a fuse
--   on the old curve's XP is no longer needed, so the harvest's day budget counts items only). The hearth's Storage take is narrower
--   than the bench's (one item, named by the server's pointer). LIGHTING trade_jobs opens 1073's two verbs and its sweep, ON THE
--   PRE-EA SECURITY LIST (13-security-list.md S-10, S-27, S-28, S-33 and S-34, the cut's row).
--
-- ── COST: LIGHTING trade_jobs RAISES IT, AND IT IS AN OPEN BLOCKER (rule 10; MEASURED 2026-11-28 on PGlite) ───────────────────────
-- 1073's section quotes every recipe (129) in every envelope. A new company's hr_state_of: 22.4 ms dark, 65.2 ms lit. tests/per-player-cost
--   town_hour_bench: 1,596 ms of settle CPU a hero-hour on the base, 3,594 here, past the ratchet (3,097): RED, its baseline not raised.
--   (Moving the section's feed read behind an ok quote, byte-equal on 72 hero states, saved 8%.) The fix is the section's contract: quote
--   on the Work window's ask, not in every envelope (1073 with its client reader), before this file applies. Statements, rows and ledger
--   rows a settle do not move. The bench tax's and the 160-bench jsonb's reads leave; a harvest writes one company row. §6 is one pass.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Not reversible as a whole (a cut, CLAUDE.md section 1): the removed skills and items are in the ledger rows of §6 by account, so a
--   human can read what left. The bodies: re-apply 1075's hr_apply, 2027-04-24's
--   hr_bench_makes and each farm file's image; the dropped objects return only with their files (2027-02-19-bench-tax.sql, the last
--   bench-inputs catalogue, 2026-09-14-recipe-learn.sql). Turn the switch off to close the jobs.
-- ════════════════════════════════════════════════════════════════════════


-- ── §0 PRECONDITIONS, THE PINS, AND NOTHING STRANDED ON A SHARED SURFACE ─────────────────────────────────────────────────────
do $mig$
declare v_md5 text; v_n bigint; v_t text; v_ids text;
begin
  if to_regclass('public.company_trade_xp') is null or to_regclass('public.trade_jobs') is null or to_regclass('public.hr_trade_kinds') is null
     or to_regprocedure('public.hr_trade_level_of(uuid,text)') is null or to_regprocedure('public.hr_trade_level(bigint)') is null
     or to_regprocedure('public.hr_trade_jobs_view(uuid,integer)') is null
     or not exists (select 1 from public.hr_flags where key = 'trade_jobs')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_trade_levers' and column_name = 'crop_xp') then
    raise exception 'PRECONDITION: the job slice and its catalogue first (1073-k1-job-slice.sql, 1063-trade-formulas-catalogue.generated.sql)'; end if;
  if to_regprocedure('public.hr_materials_take(uuid,integer,jsonb,boolean)') is null or to_regprocedure('public.hr_purse_move(uuid,bigint,bigint)') is null
     or to_regprocedure('public.hr_work_state(uuid,integer)') is null or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regclass('public.hr_gm_wall_allow') is null or to_regclass('public.player_ledger') is null then
    raise exception 'PRECONDITION: a helper or table this file reads is missing (1059-company-trades.sql, 2027-03-13-gm-tools.sql first)'; end if;
  -- THE PINS: each body this file restates is the image it was derived from, or this file's own (a retried apply)
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure;
  if v_md5 is distinct from '10bfc07dd1c5bc243d847824bc7ca149' and v_md5 is distinct from '1fa68e8369dfa6ae73d105f8815932a9' then
    raise exception 'PIN: hr_apply is neither 1075-work-blocks-midnight.sql''s image nor this file''s own (md5 %): another file moved it; re-derive', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_bench_makes(uuid,integer,text)'::regprocedure;
  if v_md5 is distinct from '78249866d00329972367a1738314291d' and v_md5 is distinct from 'f3b0ced04c523a54bb67ebe7f7c6b0b6' then
    raise exception 'PIN: hr_bench_makes is neither 2027-04-24-bench-resume.sql''s image nor this file''s own (md5 %): another file moved it; re-derive', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_market_eligible(uuid)'::regprocedure;
  if v_md5 is distinct from 'ec91fcd8549546e21e89bf8c4c273982' and v_md5 is distinct from 'cba0337f134dd5cecf915941713c5d19' then
    raise exception 'PIN: hr_market_eligible is neither 2027-03-03-market-bench-gate.sql''s image nor this file''s own (md5 %): another file moved it; re-derive', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_lb_skills()'::regprocedure;
  if v_md5 is distinct from '5464110938910727ed3237cb6f575dce' and v_md5 is distinct from '5c264678ce96fe894bf8dedc9fd59725' then
    raise exception 'PIN: hr_lb_skills is neither 2027-01-31-total-level-flame.sql''s image nor this file''s own (md5 %): another file moved it; re-derive', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_farm_harvest(integer,integer,uuid)'::regprocedure;
  if v_md5 is distinct from '6eecf24a7b44ed6b21b21c24678fce0a' and v_md5 is distinct from '04175e3159395fccf049cf459aa4e942' then
    raise exception 'PIN: hr_farm_harvest is neither 2027-03-22-dead-plot-deed.sql''s image nor this file''s own (md5 %): another file moved it; re-derive', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_farm_plant(integer,integer,text,uuid)'::regprocedure;
  if v_md5 is distinct from '3afdde2f463aee5da658a819389a22ac' and v_md5 is distinct from 'aad5413dcf1f4d4640fb3e7bc8f7adc4' then
    raise exception 'PIN: hr_farm_plant is neither 2027-01-24-skills-from-storage.sql''s image nor this file''s own (md5 %): another file moved it; re-derive', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_farm_water(integer,integer,uuid)'::regprocedure;
  if v_md5 is distinct from '68c370148c33add05e756ddaa2f45b60' and v_md5 is distinct from '434c2d700812436e2eb9d2d07eb6bf2a' then
    raise exception 'PIN: hr_farm_water is neither 2026-12-14-shared-farm.sql''s image nor this file''s own (md5 %): another file moved it; re-derive', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_farm_upgrade_plot(integer,uuid,integer)'::regprocedure;
  if v_md5 is distinct from '48880707ce62e4983addb9c2860063d9' and v_md5 is distinct from '12a12e4397595e7308273365bbe35125' then
    raise exception 'PIN: hr_farm_upgrade_plot is neither 2027-03-22-dead-plot-deed.sql''s image nor this file''s own (md5 %): another file moved it; re-derive', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_farm_tend_plan(uuid,integer,text,bigint)'::regprocedure;
  if v_md5 is distinct from '6fef09833bb86aef739f6911dd7a6023' and v_md5 is distinct from '28c71002f97f85c6782789a30235142f' then
    raise exception 'PIN: hr_farm_tend_plan is neither 1017-tend-the-field.sql''s image nor this file''s own (md5 %): another file moved it; re-derive', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_farm_tend_view(uuid,integer)'::regprocedure;
  if v_md5 is distinct from '9900fb185cc4883e3687cf14719443b2' and v_md5 is distinct from '186d6d2878c6f4576defaf839fdb7a96' then
    raise exception 'PIN: hr_farm_tend_view is neither 1017-tend-the-field.sql''s image nor this file''s own (md5 %): another file moved it; re-derive', v_md5; end if;
  -- NOTHING STRANDED (1032-approved-cuts.sql's rule). Nothing rules what a held good of a removed item becomes, and "not in hr_items"
  -- would also match a catalogue mistake, so this file deletes no player's item and no listing: it refuses, naming the place and the
  -- items, and a human decides. The whole file rolls back with it (the bench stays, trade_jobs stays dark).
  for v_t in select x.t from unnest(array['player_inventory', 'account_bank', 'player_equipment', 'hunt_bag', 'company_stock',
                                          'market_listings', 'clan_stores']) as x(t) loop
    if to_regclass('public.' || v_t) is not null then
      execute format('select count(*), string_agg(distinct h.item_id, '', '') from public.%I h
                       where not exists (select 1 from public.hr_items i where i.item_id = h.item_id)', v_t) into v_n, v_ids;
      if v_n <> 0 then raise exception 'STRANDED: % row(s) of public.% hold an item the catalogue no longer has (%): a human decides', v_n, v_t, left(v_ids, 300); end if;
    end if;
  end loop;
end $mig$;


-- ── §1 THE HEARTH'S BRIDGE: THE ITEM A FUEL RUN BURNS ────────────────────────────────────────────────────────────────────────
create or replace function public.hr_hearth_fuel_of(p_activity text)
returns text language sql stable set search_path = public, pg_catalog as $fn$
  -- ONE-TOWN-WORK-CUT (1079-one-town-work-cut.sql): THE HEARTH'S BRIDGE (09 4.13 row 3, 4.17). The one artisan run the cut keeps is a
  -- Great Hearth fuel run, `fuel_<item>` (src/data/hearth.js fuelRecipeId), and each run burns one <item>. Null for any other id: no
  -- bench is left to name. F1's lighting (lane/f1-inner-flame) retires the fuel rows, this rule and the artisan channel together.
  select substr(p_activity, 6)
   where p_activity like 'fuel\_%'
     and exists (select 1 from public.hr_activities a where a.kind = 'artisan' and a.activity_id = p_activity)
     and exists (select 1 from public.hr_items i where i.item_id = substr(p_activity, 6))
$fn$;
revoke all on function public.hr_hearth_fuel_of(text) from public, anon, authenticated, service_role;

-- ── §2 THE HEARTH RUN'S COUNT, AND THE ENGINE'S ONE APPLIER WITHOUT THE BENCH ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hr_bench_makes(p_user uuid, p_slot integer, p_bench text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  -- BENCH-RESUME (2027-04-24-bench-resume.sql): how many runs the hero's bag plus the account's Storage hold inputs for, now.
  -- ONE-TOWN-WORK-CUT (1079-one-town-work-cut.sql): the bench is cut, so the one artisan run left is a Great Hearth fuel run, one fuel a run (hr_hearth_fuel_of,
  -- the rule hr_apply takes it by). NULL for anything else: no stock bounds it. F1's lighting retires it with the fuel rows.
  select coalesce((select v.qty from public.player_inventory v where v.user_id = p_user and v.slot = p_slot and v.item_id = f.fuel), 0)
       + coalesce((select b.qty from public.account_bank b where b.user_id = p_user and b.item_id = f.fuel), 0)
    from (select public.hr_hearth_fuel_of(p_bench) as fuel) f
   where f.fuel is not null
$function$;

CREATE OR REPLACE FUNCTION public.hr_apply(p_user uuid, p_slot integer, p_version bigint, p_intent_id uuid, p_delta jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- hr_apply restated 2026-09-14 (2026-09-14-hr-apply-restatement.sql) — chain depth 0.
-- Restated again 2026-11-21 (1040-rested-bank-cut.sql): the chain end read back with pg_get_functiondef, minus the
-- rested bank (its two delta keys and its two SET lines). Chain depth 0 again: the 18 splices since 2026-10-27 live here.
-- Restated again 2026-11-27 (1075-work-blocks-midnight.sql): the chain end read back with pg_get_functiondef (1040's body plus
-- 1059-company-trades' four WORK-DAY edits and 1072-piece-verbs' PIECE-VERBS edit), with ONE change: the work fold's call passes
-- the work bought on each earlier UTC day its window touches. Chain depth 0 again.
-- Restated again 2026-11-28 (1079-one-town-work-cut.sql): the chain end read back with pg_get_functiondef (1075's image), with the
-- bench out (09 4.17): the bench tax's branch, delta key, purse floor, state columns, journal key and release code go, and the
-- Storage take serves the one artisan run left, the Great Hearth's fuel run (hr_hearth_fuel_of). Chain depth 0 again.
-- This body is AUTHORED HERE. Do not add an anchored programmatic patch to it:
-- tests/patch-chain-guard.mjs refuses a third one, and the two before that are
-- how a body that moves gold came to exist in no file at all.
declare
  -- BLAST-RADIUS CLAMPS. NOT balance, NOT player-facing. They are the blast
  -- radius if an Edge Function is ever wrong or compromised, exactly as the
  -- clamps in clan_deposit (2026-08-08-clan-seat.sql:530) are. Set far above
  -- honest play.
  --
  -- ── WHAT THESE CLAMPS ACTUALLY BUY, STATED HONESTLY (Security, 2026-08-11) ──
  --    introduced by 2026-08-11-apply-engine.sql
  -- The flattering version of this control is "one compromised call cannot max
  -- a skill from zero". That is TRUE at 5,000,000 and at 12,000,000 and it is
  -- nearly WORTHLESS, because nothing limits a compromised engine to one call:
  -- hr_rate_gate allows 30 accrues/minute, so the reachable rate is 150M XP/min
  -- at 5M and 360M XP/min at 12M. Against an attacker with the engine, the
  -- per-call clamp is a speed bump measured in seconds either way.
  --
  -- What it DOES buy, and the reason it is worth having:
  --   1. It stops a single bad delta from an HONEST-BUT-BUGGY engine. The
  --      `interval_ms` class is the live example: one request field taken from
  --      the client turns a 12h absence into ~43.2M ticks instead of ~18,000 —
  --      a ~2400x mint that proposes roughly 6.8 BILLION XP. That is refused
  --      identically at 5M and at 12M. Almost every real defect looks like
  --      this: not "slightly too much", but three orders of magnitude too much.
  --   2. It keeps ledger rows small-grained, so anomaly detection has something
  --      to detect. A clamp is also a bucket size.
  --
  -- ⚠ A clamp rejection is therefore NOT automatically an incident. Before the
  --   degrade ladder in hr-accrue/index.ts it was closer to one — a rejection
  --   rolled back the watermark with the payment and bricked accrual. It is now
  --   recoverable, and honest play at maximum gear over a 24h cap can approach
  --   these numbers on its own. Read a rejection as EITHER an incident OR a
  --   balance change that outgrew its blast radius, and check
  --   tests/accrual-engine.mjs' clamp-headroom report before assuming which.
  --
  -- c_max_xp_delta: 5,000,000 -> 12,000,000 on 2026-08-11 (Security ruling).
  --   At 5M the worst honest case measured by clampGuard was inside the 60%
  --   HEADROOM line but close enough that a single balance change would fire
  --   it; at 12M the same worst case is ~23.6%. HEADROOM stays at 0.60 in
  --   tests/accrual-engine.mjs — moving BOTH the clamp and the line is how you
  --   arrive at a guard that structurally cannot fire. Only this one clamp
  --   moved; gold, items, kinds and progress all have real margin already.
  --   The surviving property is asserted, not documented: clampGuard requires
  --   c_max_xp_delta < 13,034,431 = xpForLevel(99), i.e. one call can still
  --   never carry a skill from 0 to the level cap.
  c_max_gold_delta   constant bigint := 50000000;   -- per call
  c_max_gem_delta    constant bigint := 100000;     -- per call  (review S5)
  c_max_item_delta   constant bigint := 1000000;    -- per item per call
  c_max_xp_delta     constant bigint := 12000000;   -- per skill per call (see above)
  c_max_item_kinds   constant int    := 200;
  c_max_equip_kinds  constant int    := 32;
  c_max_progress_ops constant int    := 64;
  c_max_progress_add constant bigint := 1000000;
  -- BENCH-COUNT (2026-12-01-bench-count.sql): the run's count this apply writes.
  v_bench_left int;
  -- JOB-COUNTS (1026-job-counts.sql): the statement's whole count and THEN, and the end of a job the engine counted out.
  v_job_count int; v_job_next text; v_job_end jsonb; v_job_left int;
  -- WORK-DAY (1059-company-trades.sql): what this window spends of the hero's work day, and where its work ended.
  v_work jsonb; v_work_end timestamptz; v_work_left bigint;
  c_delta_keys constant text[] := array[
    'gold','gems','hp','items','xp','equip','activity','accrued_to',
    -- BENCH-COUNT: the engine's lowered count of a "make N" run (2026-12-01-bench-count.sql).
    'active_left',
    -- THE CARRIED XP REMAINDER (2026-10-09-xp-frac-carry.sql): an ABSOLUTE
    -- per-skill map of numbers in [0,1), the tool_carry shape. Engine output,
    -- never client input; validated and written after the XP loop.
    'xp_frac',
    -- THE PET'S CARRIED XP REMAINDER (2026-10-12-companion-xp-frac.sql): an
    -- ABSOLUTE map {<equipped companion id>: [0,1)}, the xp_frac shape. Engine
    -- output, never client input; written after the progress loop.
    'companion_xp_frac',
    -- CONSUMABLE BUFFS (2026-09-13): an OBJECT carrying ONE field, `item`. AT
    -- MOST ONE PER APPLY. The type, the magnitude, the duration and the expiry
    -- are resolved at (4a-b) from hr_item_buffs and now(); an object carrying any
    -- other key is REFUSED BY NAME, so there is no representation in which a
    -- client authors a buff's strength or its end. Nothing here moves a
    -- tradeable, rankable or contributable value.
    'buff_apply',
    -- THE HEARTHFIND (Feature Slate §2). An OBJECT: {item, source_kind,
    -- source_id, dropped?}. AT MOST ONE PER APPLY; `dropped` is the COUNT the
    -- engine had to throw away in the same span and grants nothing at all - it
    -- exists so a discarded find is journalled instead of vanishing. Everything
    -- else about the find - the
    -- odds, the trophy's legitimacy, the pairing, the day count, the broadcast
    -- window and the instant - is re-derived server-side at (4a-h)/(4z-h).
    -- There is no quantity field: a find is exactly one trophy, always.
    'hearthfind',
    -- THE LEVEL XP (2026-10-27 core rebuild, CORE_MODEL.md §2): a whole number
    -- >= 0 credited to player_state.level_xp. Level comes from KILLS only, so it
    -- is accepted only inside the hunt settle (hr_hunt_apply_member sets
    -- hr.hunt_session and bounds it by the journalled kills); any other caller is
    -- refused level_xp_outside_hunt.
    'level_xp',
    -- THE DEATH LEDGER. An ARRAY of at most ONE server-derived death record (a
    -- death ends the hunt), written as one player_ledger row at (4z). Engine output.
    -- It moves NO VALUE - it is audit only - which is why it is not part of any
    -- conservation sum and why its rows carry no gold_in/xp_in/qty_in stamp.
    'deaths',
    -- SHARED-FARM (2026-12-14-shared-farm.sql): no `farm` key; the field is the account's,
    -- written only by the hr_farm_* verbs. A delta naming it is refused unknown_delta_key.
    'progress','progress_claim','journal',
    -- b348: the deterministic gathering tool carry. See the block at (4a-ii).
    'tool_carry',
    -- Phase 0 (docs/design/live-settlement.md): the IN-FLIGHT FIGHT. Engine
    -- output, never client input, and an ABSOLUTE like tool_carry. Validated
    -- at (4a-iii) and VOIDED unconditionally by an activity change.
    'fight',
    -- ELEMENTS/ENCHANTING v1: the server-owned weapon enchant. hr_apply resolves
    -- the rune it carries to an ELEMENT via hr_runes and stores THAT.
    'enchant',
    -- worker-settlement slice: the PARALLEL hired-crew accrual. `workers` is a
    -- per-worker xp sub-delta ({ uid: { xp:+n } }); `workers_accrued_to` is the
    -- crew's own watermark, advanced from now(). Worker OUTPUT rides `items`.
    'workers', 'workers_accrued_to',
    -- WORK-DAY (1059-company-trades.sql): the instant a window's work ended (engine output, never client input), beside its accrual.
    -- The work day spends up to it, never past the window's own watermark (for a window that ends the job, now()).
    'work_to'];
  -- The carry is a FRACTION of one item per skill, so its whole legal range is
  -- [0,1). A ceiling on the number of skills is a ceiling on the row size.
  c_max_carry_skills constant int := 32;
  -- A blast radius on the carried kill counter, not a balance number. It drives
  -- nothing in the simulation today (resolveKill increments it, nothing reads
  -- it) and is carried so the streak readout survives the cutover; the clamp is
  -- here so an engine bug cannot store a counter nobody can explain.
  c_max_fight_kills constant bigint := 1000000;
  -- A crew is at most a handful of workers; this is a blast radius on the
  -- worker xp sub-delta, not a balance number.
  c_max_worker_ops constant int := 16;
  -- The per-worker fractional carry (leftover ms of a partial tick) is < the
  -- largest perTickMs = max(node.ms)/min(eff) = 13000/0.10 = 130,000 ms. This is
  -- the blast radius; acc_ms is REFUSED (never clamped) outside [0, this).
  -- Mirrors WORKER_MAX_ACC_MS in supabase/functions/hr-accrue/accrual.js.
  c_max_worker_acc constant double precision := 900000;
  -- ⚠ THE INTENT KEYS A REJECTION MUST RELEASE (Security F3, 2026-08-16).
  --   Step (5) releases a claimed key on `version_conflict` because the accrual
  --   engine DERIVES its key from (user, slot, watermark, version, salt) and a
  --   rejection moves neither watermark nor version — so an honest retry
  --   re-derives a byte-identical key and replays the stored rejection until
  --   hr_intents_prune, up to 25 hours later.
  --
  --   The `fight` codes have exactly that shape, and the trigger is a ROUTINE
  --   OPERATION rather than an attack: change a monster's hp in
  --   src/data/monsters.js and deploy the Edge payload BEFORE re-applying
  --   2026-08-11-catalogue.generated.sql, and every honest checkpoint for that
  --   monster proposes an hp above the stale ceiling. Refused, key bricked,
  --   every player on that monster frozen for a day — and re-applying the
  --   catalogue would NOT unfreeze them, because the replay never re-evaluates.
  --
  --   THE RULE, STATED AS A PROPERTY RATHER THAN AS A LIST: release a claimed
  --   key when the refusal is a function of SERVER STATE THAT CAN CHANGE
  --   UNDERNEATH AN UNCHANGED DELTA — the row version, or the catalogue the
  --   clamp is re-derived from. Everything else is a decision about the delta
  --   itself and deserves the same answer on the same key. Nothing is released
  --   that EXECUTED anything: a rejection rolled the protected block back, so a
  --   re-run is a first run.
  --   ⚠ THE LIST ROTTED IN ONE DAY, exactly as predicted (b361 incident):
  --   Stonemason shipped to clients minutes before its hr_skills row landed,
  --   `unknown_skill` fired for two LIVE players, stored itself against their
  --   accrue keys, and "Try again" replayed the stored refusal after the
  --   catalogue was fixed — the F3 brick, second instance, severity incident.
  --   `unknown_skill` / `unknown_item` / `unknown_activity` are all functions
  --   of catalogue state (hr_skills / hr_items / hr_activities) and were
  --   always in the property's scope; they are now in the list. If you add a
  --   catalogue-validated refusal code to hr_apply, IT GOES HERE TOO.
  --   ⚠ b366 — THE EQUIP BLOCK JOINS THE LIST, AND IT IS THE SAME LESSON A
  --   SECOND TIME. Until b366 nothing could reach hr_apply's equip block
  --   through a player gesture (there was no equip verb anywhere in src/net,
  --   which is the root of the b362 dupe class), so its refusals were
  --   unreachable and none of them was ever considered here. The equip verb
  --   makes all five reachable, and FOUR of them are functions of a GENERATED
  --   catalogue — hr_equip_slots, hr_items, hr_item_slots — i.e. exactly the
  --   "server state that can change underneath an unchanged delta" the property
  --   above names. The routine operation that trips it is a deploy-order slip:
  --   add an item to src/data/items.js, deploy the Edge payload BEFORE
  --   re-applying 2026-08-11-catalogue.generated.sql, and every equip of that
  --   item is unknown_item — and STAYS unknown_item for that key even after the
  --   catalogue lands, because a replay never re-evaluates.
  --   `requirement_not_met` is here for the same reason with a different table:
  --   it is derived from player_skills through hr_level_from_xp, and an XP
  --   grant that lands between two attempts changes the answer to an unchanged
  --   delta.
  --   `bad_equip` is a SHAPE refusal and is here only because hr_apply raises
  --   it for a delta whose shape depends on nothing but itself — releasing it
  --   is harmless (the block rolled back) and keeping it off the list would
  --   brick a key on a client bug that a redeploy fixes.
  --   ⚠ `insufficient_item` IS DELIBERATELY ABSENT. "You do not own one" is a
  --   fact about the PLAYER'S OWN ROW, not about a catalogue, and it is the
  --   ownership check that makes equipping a conserving transfer. Releasing it
  --   would hand a client an unlimited number of free re-attempts on one key
  --   against a moving inventory — which is the retry loop a dupe wants.
  c_release_codes constant text[] := array[
    'bad_buff_item', 'bad_buff_shape', 'buff_at_max', 'buff_not_paid',
    'bad_hearthfind',
    'version_conflict', 'bad_level_xp', 'bad_deaths',
    'bad_fight', 'bad_fight_hp', 'bad_fight_kills', 'unknown_monster',
    'unknown_skill', 'unknown_item', 'unknown_activity',
    'bad_equip', 'unknown_equip_slot', 'wrong_slot', 'requirement_not_met',
    'too_many_equip_ops', 'bad_enchant',
    -- 2026-09-28-settle-before-mutate.sql: a statement about the READ (the
    -- window is still unpaid), not the delta — the same key works once the
    -- settle lands, exactly like version_conflict. party_hunt_running is its
    -- partied twin (the key works once the hunt stops and the settle lands).
    'settle_first', 'party_hunt_running'];
  c_ledger_kinds constant text[] := array[
    'accrue','craft','gather','combat','farm','trade','shop',
    'quest','equip','admin','iap','clan','raid','enchant','worker',
    -- ACCOUNT GOLD (2026-12-15-account-gold.sql): the loot filter's sale journals as a hunt gold move.
    'hunt'];

  v_uid   uuid;
  v_role  text;
  v_prev_intent text;
  v_this_intent text;
  -- b346. The slot a key was CLAIMED on, and whether THIS call is the one that
  -- claimed it. The first lets step (3) refuse a cross-slot reuse; the second
  -- lets step (5) release a key it claimed itself. Both are explained at their
  -- use sites — this is only where they live.
  v_prev_slot   int;
  v_claimed     boolean := false;
  v_slot  int  := coalesce(p_slot, 0);
  v_st    public.player_state%rowtype;
  v_j     jsonb;
  v_out   jsonb;
  v_prev  jsonb;
  v_kind  text;
  v_msg   text; v_det text; v_sqlstate text;
  k text; v_n bigint; v_have bigint; v_stacks int;
  -- BAG-OVER-CAP (2027-02-11-bag-over-cap.sql): the bag's stacks before this delta wrote anything.
  v_stacks_before int;
  v_eq    jsonb; v_item text; v_cur text;
  v_enchant_el text;   -- ELEMENTS v1: the element hr_runes resolves a rune to
  v_prog jsonb;
  -- DEAD-WRITES (2027-03-30-dead-writes.sql): is the collection counter stored for this account? Read once an apply, on its first loot op.
  v_collect boolean;
  -- 2026-10-12-companion-xp-frac.sql. THE COMPANION XP CAP, ON THE SERVER:
  -- companionXpToReach(COMPANION_MAX_LEVEL) in src/core/companion-perk.js,
  -- pinned equal by tests/companion-xp-frac.mjs. Until this file the cap lived
  -- only in the edge. v_cxp_clamp collects the clamps this apply made, for the
  -- ledger row; v_cxp_have is the row's value before the op.
  c_companion_xp_cap constant bigint := 792783;
  v_cxp_have  bigint;
  v_cxp_credit bigint;
  v_cxp_clamp jsonb;
  -- SKILLS-FROM-STORAGE (2027-01-24-skills-from-storage.sql): the fuel a hearth run's settle takes (bag, then the account's
  -- Storage) before the item loop, and what hr_materials_take answered for it (ONE-TOWN-WORK-CUT (1079-one-town-work-cut.sql): the bench is cut).
  v_skill_cost jsonb;
  v_skill_take jsonb;
  v_new_gold bigint; v_new_gems bigint; v_wallet jsonb;
  v_act   jsonb; v_accrued timestamptz; v_rows int;
  v_meta  jsonb;
  v_carry jsonb;
  -- Phase 0. The proposed in-flight fight, and the ceiling its HP is re-derived
  -- against. `v_fight_max` comes out of hr_activities — the GENERATED
  -- catalogue — so the clamp is a fact about src/data/monsters.js rather than a
  -- number somebody typed into SQL and stopped maintaining.
  -- The death row's loop variable and its ceiling: a death ends the hunt, so a
  -- settle carries at most one (2026-10-27 core rebuild).
  v_death jsonb;
  c_max_death_rows constant int := 1;
  -- THE HEARTHFIND. v_hf_* are all SERVER-DERIVED: the only values that
  -- come from the delta are the item id and the (kind,id) pair, and each of
  -- those is used ONLY as a lookup key against a generated catalogue.
  v_hf        jsonb;
  v_hf_item   text;
  v_hf_kind   text;
  v_hf_src    text;
  v_hf_one    bigint;
  v_hf_today  bigint;
  v_hf_last   timestamptz;
  v_hf_have   bigint;
  v_hf_out    jsonb;
  -- THE BAND, IN THE UNIT IT IS RULED IN. Read from the catalogue beside the
  -- odds so the runtime check and the migration-time self-check assert the same
  -- column, never two numbers that can drift.
  v_hf_hours     numeric;
  -- THE COSMETICS, ALL READ FROM THE CATALOGUE. No string literal for a title
  -- code or the plinth appears anywhere in this body: hand-typing them here
  -- would be the src/main.js unifyObject data double-copy, with the copy on the
  -- side that GRANTS.
  v_hf_title     text;
  v_hf_titlename text;
  v_hf_set       int;      -- distinct trophies this character has found, after this one
  v_hf_setneed   int;      -- how many distinct trophies the full set is
  v_hf_settitle  text;
  v_hf_setname   text;
  v_hf_plinth    text;
  v_hf_cosm      jsonb;    -- the cosmetics UNLOCKED BY THIS FIND, for the receipt
  -- THE GLOBAL ORDINAL - "the 4th ever found in Hearthrise". Counted across ALL
  -- characters from the append-only journal under this character's lock. It is
  -- NOT counted from world_finds: the broadcast clamp suppresses public rows, so
  -- a world_finds count would drift below the truth and the chat line would
  -- claim an ordinal that had already been used.
  v_hf_nth    bigint;
  -- THE DISCARD COUNT. Advisory only: it is journalled and never read by any
  -- arithmetic that grants, so a forged value costs the player nothing and buys
  -- the forger nothing but a rejection row against their own character.
  v_hf_drop   int;
  -- AT MOST ONE FIND PER APPLY. The engine's own roll cannot produce two in one
  -- action, and a window that legitimately contained two is settled as two
  -- applies. Accepting an array would make the daily clamp a per-array clamp.
  -- (No constant: the `hearthfind` key is an OBJECT, so the body structurally
  --  cannot see two. c_max_hf_per_apply was declared by 2026-09-08-hearthfind.sql
  --  and read by nothing; §0 proves it before this file removes it.)
  -- THREE PER CHARACTER PER UTC DAY (Feature Slate §2). An anti-automation
  -- ceiling, not a balance number: at 1-in-6,000 to 1-in-40,000 a fourth find in
  -- one day is not reachable by playing.
  c_max_hf_per_day   constant int := 3;
  -- ONE BROADCAST PER 30 s PER CHARACTER (Designer ruling 2026-09-08 §9; the
  -- 60 s form was REJECTED). Suppresses the world_finds ROW ONLY; the trophy,
  -- the ledger row, the cosmetic unlocks and the receipt are unaffected, so a
  -- suppressed broadcast never costs value -- only a duplicate chat line. At the
  -- ruled cadence (~2 finds per realm-week) the clamp exists solely to stop a
  -- pathological retry storm from spamming global chat; halving it costs
  -- nothing and keeps a genuine back-to-back double find visible.
  c_hf_broadcast     constant interval := interval '30 seconds';
  -- CONSUMABLE BUFFS (2026-09-13). Resolved from hr_item_buffs under the
  -- character lock at (4a-b); written in the SET clause. No client value reaches
  -- any of them except the ITEM ID, which is looked up rather than trusted.
  c_buff_max_ms constant bigint  := 3600000;   -- the expiry cap AND the blast radius
  c_buff_scale  constant numeric := 1;         -- the BASE multiplier, before any perk
  -- ⚠ THE FUSE ON THE PERK STACK (2026-09-13 step 3). The Cellar's top rung sells
  --   +100%, so this binds on nothing that exists today — which is exactly when a
  --   ceiling should be written. It bounds anything a future perk (a clan bonus, a
  --   Feast Mastery) can add to a duration WITHOUT this body being re-reviewed,
  --   and it is applied before the 60-minute expiry cap rather than instead of it.
  c_buff_scale_max constant numeric := 2;      -- no perk stack may more than double a buff
  v_buff_rung   int;
  v_buff_bonus  numeric;
  v_buff_scale  numeric;
  -- ⚠ THE MINIMUM GAIN, and it is the whole reason buff_at_max is REACHABLE.
  --   The cap is `now() + c_buff_max_ms`, so it MOVES with the clock: once a queue
  --   sits on the ceiling, the next consume a second later still buys one second
  --   and `base >= cap` is never true again. That is "eat the item for nothing"
  --   with extra steps — the exact outcome the designer's ruling forbids — and it
  --   was measured, not reasoned about: the first draft refused only on
  --   `base >= cap`, the migration's own §4 passed (a migration applies inside ONE
  --   transaction, where now() is FROZEN, so the equality really does hold there)
  --   and tests/buff-queue.mjs, which calls hr_apply in separate transactions like
  --   production does, went 200 consumes without a single refusal.
  --   So the rule is stated as the ruling means it: a consume must buy a
  --   MEANINGFUL share of what it promises, or it is refused and the food is not
  --   spent. A FRACTION rather than a fixed number of seconds, so it scales with a
  --   two-minute Roasted Carrot and a ten-minute Feast alike.
  c_buff_min_gain_frac constant numeric := 0.10;
  v_buff_gain   bigint;
  v_buff_need   bigint;
  v_buff_item   text;
  v_buff_type   text;
  v_buff_mag    numeric;
  v_buff_newmag numeric;
  v_buff_dur    bigint;
  v_buff_now    timestamptz;
  v_buff_base   timestamptz;
  v_buff_until  timestamptz;
  v_buff_cap    timestamptz;
  -- (No v_buff_old: 2026-09-13-buff-segments.sql replaced the max()-merge that
  --  read it with per-segment stacking and said so — "keeps its declare and stops
  --  being read". §0 proves it before this file removes it.)
  -- Per-segment stacking (2026-09-13). c_buff_max_segments is a COST fuse, not a
  -- balance number: without it the entry count is bounded only by (60 min / the
  -- shortest food) x the type vocabulary = 270 entries ~ 25 KB of jsonb on every
  -- hr_state_of, and that envelope is read on every boot, settle and switch.
  c_buff_max_segments constant int := 8;
  v_buff_segs   int;
  v_buff_same   jsonb;
  v_buffs_new   jsonb;
  v_fight jsonb;
  v_fight_max int;
  -- THE DAILY BUDGET (C5/X3). Gross inflow proposed by THIS delta, per
  -- dimension. Computed here from the delta, never accepted from the caller —
  -- there is no delta key for them and the ledger has no client write grant, so
  -- a compromised engine cannot understate its own consumption.
  -- See supabase/migrations/2026-08-11-daily-budget.sql for the whole design.
  v_gold_in bigint := 0; v_xp_in bigint := 0; v_qty_in bigint := 0;
  -- b351 — THE FOURTH DIMENSION. Gems had a per-call clamp (100,000) and NO
  -- daily ceiling, so a compromised engine could mint 100,000 gems per call at
  -- 240 applies/minute. Security measured it: 1.2M gems in 12 calls, zero
  -- refusals, while the IDENTICAL gold loop was refused at call 6. Same
  -- provenance rule as the three above: computed here from the delta, never
  -- accepted from the caller.
  v_gems_in bigint := 0;
  v_bud   jsonb;
  -- Slice 3 (docs/design/live-settlement.md): the daily settle STREAK. Advanced
  -- ONLY here, from now(), on any ACCRUAL delta (one that carries accrued_to) —
  -- never a client value, and there is no present:true field. Computed just
  -- before the state UPDATE.
  v_new_streak int;
  v_streak_day text;
begin
  -- ── (0) THE IDENTITY SEAM (review S1) ──────────────────────────────────
  --    introduced by 2026-08-11-apply-engine.sql
  -- hr_apply is granted to exactly one role. `hr_engine` may act for a user it
  -- names, because it has already verified that user's JWT and it holds no
  -- table privilege of its own. Nobody else may name a user at all.
  --
  -- ⚠ current_user IS NOT THE CALLER HERE. Inside a SECURITY DEFINER function
  --   current_user is the function's OWNER (postgres), so a `current_user =
  --   'hr_engine'` test can never be true — verified on the database, not
  --   assumed. The GUC set by PostgREST's `SET LOCAL ROLE <jwt.role>` does
  --   survive the definer boundary, and that is what is read below.
  --
  --   The GUC is a SECONDARY check. The PRIMARY control is the GRANT: hr_apply
  --   is executable by hr_engine and by nothing else a request can arrive as,
  --   so reaching this line at all already means the caller is the engine (or
  --   the owner, running a migration or a test). The GUC test exists so that
  --   an owner-context call — a psql session, a future admin script — cannot
  --   silently act as an arbitrary user without saying so.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role = 'hr_engine' then
    v_uid := coalesce(p_user, auth.uid());
  else
    v_uid := auth.uid();
    if p_user is not null and p_user is distinct from v_uid then
      -- Recorded even though it never reaches the protected block: this is the
      -- single most interesting thing anyone can do to this function. (R4.)
      perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'forbidden_impersonation',
        jsonb_build_object('claimed_user', p_user, 'role', v_role));
      return jsonb_build_object('ok', false, 'error', 'forbidden_impersonation');
    end if;
  end if;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  if p_delta is null or jsonb_typeof(p_delta) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_delta');
  end if;
  if p_intent_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_intent_id');
  end if;
  -- Unknown top-level keys are an error, not a shrug. A delta key that this
  -- function does not implement must never look like it worked.
  if exists (select 1 from jsonb_object_keys(p_delta) as t(dk)
              where dk <> all (c_delta_keys)) then
    v_out := jsonb_build_object('ok', false, 'error', 'unknown_delta_key',
      'keys', (select jsonb_agg(dk) from jsonb_object_keys(p_delta) as t(dk)
                where dk <> all (c_delta_keys)));
    -- An unknown key means the Edge Function and this contract have diverged,
    -- or someone is probing for one that is not implemented. Both are worth
    -- knowing about tomorrow, not just for the next 24 hours. (R4.)
    perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'unknown_delta_key',
      jsonb_build_object('keys', v_out->'keys'));
    return v_out;
  end if;

  -- ── (1) Rate limit. OUTSIDE the protected block on purpose: a rejected call
  --    introduced by 2026-08-11-apply-engine.sql
  --        must still consume budget, otherwise "spam invalid deltas" is a free
  --        denial of service against the engine.
  if not public.hr_rate_ok(v_uid, 'apply', 240, interval '1 minute') then
    -- (C2) Recorded BEFORE the return, and before the intent claim, because
    -- otherwise a rate-limited caller leaves no durable trace anywhere: the
    -- early return happens ahead of player_intents, and player_intents is
    -- pruned after 24h regardless. Sustained rate limiting is the loudest
    -- automation signal this server produces and it was being discarded.
    -- hr_record_rejection aggregates per (character, code, day) and promotes
    -- the row to severity 'incident' past its daily threshold, so this costs
    -- one row per player per day, not one row per rejected call.
    --
    -- (S6) …but still one WRITE per rejected call, which under the retry storm
    -- this exists to detect is a row lock plus a WAL record per request, all
    -- serialised on one tuple. So it is SAMPLED: the 1st, 10th and 50th
    -- rejection in the window, then every 1000th, each carrying the gap it
    -- stands for so `n` and the 'incident' escalation are unchanged.
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'rate_limited',
        jsonb_build_object('limit', 240, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- ── (2) Serialise this character. hashtextextended over user+slot; the lock
  --    introduced by 2026-08-11-apply-engine.sql
  --        is transaction-scoped so it always releases, exception included.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- ── (3) IDEMPOTENCY (review S8). Under the lock, so the check and the claim
  --    introduced by 2026-08-11-apply-engine.sql
  --        cannot interleave. A replay returns the FIRST answer — success or
  --        rejection — because "same key, same answer" is the contract that
  --        makes a client retry safe.
  --
  --        WHAT IS STORED IS THE DECISION, NOT THE ENVELOPE (review R5).
  --        Revision 2 stored the ENTIRE hr_state_of envelope — inventory,
  --        fifteen skills, farm plots, progress — in player_intents.result, per
  --        intent, at up to 240 applies/min/player. That is a full state
  --        snapshot roughly every quarter second per player, retained 24 hours:
  --        ~2 KB × 240 × 60 × 24 = 690 MB PER PLAYER PER DAY at the rate limit,
  --        and this repo already has the receipt for what an unbounded journal
  --        does here (game_events: 1.6M rows / 229 MB, six players, 3.45 days).
  --        Now only `{ok}` (plus the error and its detail on a rejection) is
  --        stored — tens of bytes — and a REPLAY OF A SUCCESS RE-DERIVES the
  --        current state. That is strictly better for the caller too: a retry
  --        gets fresh state and a fresh version instead of a stale snapshot it
  --        would then have to discard. The contract is unchanged and is the one
  --        that matters: the same key applies the effect exactly once.
  --
  --        ── ONE NAMESPACE, TWO KINDS OF KEY (review S6) ──────────────────
  --    introduced by 2026-08-11-apply-engine.sql
  --        `player_intents` is keyed on (user_id, intent_id) and NOTHING else,
  --        so a client-supplied uuid (market_list / market_cancel / market_buy
  --        all take p_intent_id straight from the browser) shares a namespace
  --        with keys the SERVER derives — the accrual engine's key is
  --        sha256(user, slot, watermark, …), and `accrued_to` is a value
  --        hr_load hands the client so it can render a countdown.
  --
  --        Left alone, that is a self-denial-of-service with a nasty shape: a
  --        player computes their own next accrual key, burns it with a market
  --        call, and every accrual from then on returns `replayed: true`,
  --        applies nothing, and never advances the watermark — silently, with
  --        ok:true, until hr_intents_prune deletes the row 24 hours later.
  --
  --        The fix is to notice that a replay must be a replay OF THE SAME
  --        THING. `player_intents.intent` already records what the key was
  --        claimed for; if the incoming call names a different one, this is not
  --        a retry, it is a collision — deliberate or accidental — and the
  --        honest answer is to refuse rather than to hand back someone else's
  --        decision. One comparison, and it hardens every intent in the system,
  --        not just accrual. (The accrual key is ALSO salted with hr_seed's
  --        server secret now, so it cannot be computed in the first place; these
  --        are two independent locks and the cheap one lives here.)
  v_this_intent := p_delta #>> '{journal,intent}';
  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents
   where user_id = v_uid and intent_id = p_intent_id;
  if found then
    --        ── AND A REPLAY MUST BE A REPLAY ON THE SAME CHARACTER (b346) ──
    --    introduced by 2026-08-15-intent-key-hygiene.sql
    --        The intent NAME cannot carry the slot: it is also
    --        player_ledger.intent, which the rollup groups on, so a slot number
    --        in it would make one declaration read as two different things.
    --        Which leaves 'set_activity:combat:goblin' meaning the same thing on
    --        slot 0 and slot 1 — and 'set_activity:idle', which EVERY stop a
    --        player makes shares, meaning the same thing everywhere.
    --
    --        Measured on this database 2026-08-15 and rolled back: one key
    --        applied on slot 0 and then presented on slot 1 answered
    --        ok:true, replayed:true and APPLIED NOTHING (slot 1 gold 500 -> 500)
    --        while a control with a fresh key applied (500 -> 507). Silent, with
    --        ok:true, on the character the player is looking at.
    --
    --        The column was already on the table and simply never read. One
    --        comparison, here, covers all nine intents; the alternative is nine
    --        Edge Functions each remembering to disambiguate a key they did not
    --        choose.
    if v_prev_intent is distinct from v_this_intent
       or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(v_uid, v_slot, coalesce(v_this_intent, 'apply'),
        'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_this_intent,
                           'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then
      return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
    end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;
  -- (N3) The advisory lock above is keyed on user:SLOT, but the intent PK is
  -- (user_id, intent_id) — no slot. Two slots replaying the same intent_id
  -- concurrently therefore both miss the select and both insert, and the loser
  -- gets an unhandled unique_violation (a 500) instead of an answer. Exotic
  -- today (one character is active at a time) but it is a race, and a race
  -- closed by `on conflict do nothing` costs nothing. The key stays
  -- user-global rather than slot-scoped on purpose: a client-generated uuid
  -- that means two different things on two slots is a worse contract than one
  -- that is simply already taken.
  -- b346: "already taken" is now SAID OUT LOUD. The branch above answers
  -- intent_mismatch on a cross-slot reuse instead of handing back the other
  -- character's decision, which is what "a worse contract" was always going to
  -- feel like in practice.
  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_intent_id, v_slot, v_this_intent)
  on conflict (user_id, intent_id) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
  end if;
  -- THIS call owns the row. Nothing else may release it (see step (5)): a
  -- rejection returned from the branch above belongs to whoever claimed the key
  -- first, and deleting it there would free a key that is recording a SUCCESS.
  v_claimed := true;

  -- ══ THE PROTECTED BLOCK ═══════════════════════════════════════════════
  --    introduced by 2026-08-11-apply-engine.sql
  -- Everything from here to the handler is all-or-nothing. Every rejection is
  -- hr_reject(), which raises; the handler below undoes the block. (Review S2.)
  begin
    select * into v_st from public.player_state
      where user_id = v_uid and slot = v_slot for update;
    if not found then perform public.hr_reject('no_character'); end if;

    --    introduced by 2026-08-11-apply-engine.sql
    -- (4) OPTIMISTIC CONCURRENCY — MANDATORY (review S9). Revision 1 skipped
    -- the check when p_version was null, which meant the caller chose whether
    -- concurrency control applied. A missing version IS a conflict.
    if p_version is null or p_version <> v_st.version then
      perform public.hr_reject('version_conflict',
                               jsonb_build_object('version', v_st.version));
    end if;

    -- ── SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql, F2) ────
    -- The settle and the window-closing verbs carry accrued_to / activity /
    -- equip / enchant; the crew's own settle carries workers_accrued_to. Any
    -- OTHER delta that adds a priced input — a buff, or a positive item (a
    -- tool, food, ammo, a material) — must not land while the pointer's window
    -- is unpaid, or the settle prices the whole absence at it.
    if not (p_delta ?| array['accrued_to', 'activity', 'equip', 'enchant', 'workers_accrued_to'])
       and (p_delta ? 'buff_apply'
            or (jsonb_typeof(p_delta->'items') = 'object'
                and exists (select 1 from jsonb_each_text(p_delta->'items') as t(k, v)
                             where t.v ~ '^\s*\+?0*[1-9][0-9]*\s*$'))) then
      perform public.hr_require_settled(v_uid, v_slot);
    end if;

    -- BAG-OVER-CAP (2027-02-11-bag-over-cap.sql): counted before ANY write to the bag (the bench take below is the first).
    if (p_delta ? 'items') or (p_delta ? 'equip') then
      select count(*) into v_stacks_before from public.player_inventory
       where user_id = v_uid and slot = v_slot;
    end if;

    -- ── SKILLS-FROM-STORAGE (2027-01-24-skills-from-storage.sql; Tyler 2026-10-25, a universal truth) ──
    -- A TOWN RUN'S INPUTS COME FROM THE HERO'S BAG FIRST, THEN THE ACCOUNT'S STORAGE. On an artisan settle (journal
    -- kind 'craft', a window: accrued_to) of a hero whose SERVER pointer is the one artisan run the cut keeps, a Great
    -- Hearth fuel run, its spent fuel (ONE-TOWN-WORK-CUT (1079-one-town-work-cut.sql): hr_hearth_fuel_of: the bench and its generated input list are gone) is taken HERE, whole, by
    -- hr_materials_take (the ONE material take, all or nothing) and skipped by the item loop below; the journal
    -- row says what Storage paid (`st`). It runs BEFORE the purse, so the one lock order holds: the hero -> the
    -- account DEPOT -> the bag rows -> the Storage rows -> the purse, last. Every other spent line, and every
    -- other delta, keeps the bag only.
    v_skill_cost := null;
    v_skill_take := null;
    if p_delta ? 'accrued_to' and p_delta #>> '{journal,kind}' = 'craft'
       and jsonb_typeof(p_delta->'items') = 'object'
       and v_st.active_kind = 'artisan' and v_st.active_id is not null then
      select jsonb_object_agg(t.k, -(t.v::bigint)) into v_skill_cost
        from (select e.key as k, case when e.value ~ '^\s*-[0-9]{1,18}\s*$' then e.value end as v
                from jsonb_each_text(p_delta->'items') as e) t
       where t.v is not null and t.v::bigint < 0
         and t.k = public.hr_hearth_fuel_of(v_st.active_id);
      if v_skill_cost is not null then
        v_skill_take := public.hr_materials_take(v_uid, v_slot, v_skill_cost, true);
        if coalesce(v_skill_take->>'ok', 'false') <> 'true' then
          perform public.hr_reject(coalesce(v_skill_take->>'error', 'insufficient_item'), v_skill_take - 'ok' - 'error');
        end if;
      end if;
    end if;

    -- ── GOLD ─────────────────────────────────────────────────────────────
    --    introduced by 2026-08-11-apply-engine.sql
    -- ACCOUNT GOLD (2026-12-15-account-gold.sql): gold is ONE purse per account
    -- (public.account_wallet.gold), shared by every hero. The move lands HERE, under
    -- the purse's row lock (hr_purse_move), held to commit; a debit never takes the
    -- purse below 0. v_new_gold is the purse AFTER it (this apply's ledger `purse`).
    v_new_gold := null;
    if p_delta ? 'gold' then
      v_n := coalesce((p_delta->>'gold')::bigint, 0);
      if abs(v_n) > c_max_gold_delta then
        perform public.hr_reject('gold_clamp', jsonb_build_object('limit', c_max_gold_delta));
      end if;
      if v_n <> 0 then
        v_new_gold := public.hr_purse_move(v_uid, v_n);
        if v_new_gold is null then
          perform public.hr_reject('insufficient_gold',
                                   jsonb_build_object('have', public.hr_purse_of(v_uid), 'need', -v_n));
        end if;
      end if;
    end if;

    -- ── GEMS (review S5) ─────────────────────────────────────────────────
    --    introduced by 2026-08-11-apply-engine.sql
    -- Revision 1 wrote `greatest(0, gems + delta)` with no clamp and no error:
    -- spending 10 gems while holding 3 succeeded and silently cost 3. Gems are
    -- a premium currency; a silent partial spend is a support ticket at best.
    -- ACCOUNT WALLET (2026-10-19-account-wallet.sql). Gems are the ACCOUNT's,
    -- in public.account_wallet, so v_new_gems is now the CREDIT this apply asks
    -- the wallet for: paid AFTER the ledger row by hr_wallet_credit under the
    -- account grant key 'apply:<journal.intent>' (once per account, the
    -- account's day cap). The engine never SPENDS gems — a spend is an RPC with
    -- its own catalogue — so a negative gem delta is refused.
    v_new_gems := 0;
    if p_delta ? 'gems' then
      v_n := coalesce((p_delta->>'gems')::bigint, 0);
      if abs(v_n) > c_max_gem_delta then
        perform public.hr_reject('gem_clamp', jsonb_build_object('limit', c_max_gem_delta));
      end if;
      if v_n < 0 then
        perform public.hr_reject('bad_delta', jsonb_build_object(
          'field', 'gems', 'why', 'the engine never spends gems'));
      end if;
      if v_n > 0 and coalesce(p_delta #>> '{journal,intent}', '') = '' then
        perform public.hr_reject('bad_delta', jsonb_build_object(
          'field', 'gems', 'why', 'a gem credit needs journal.intent, its account grant key'));
      end if;
      v_new_gems := v_n;
    end if;

    -- ── ITEMS ─ the delta is signed; a spend and a gain are the same code ─
    --    introduced by 2026-08-11-apply-engine.sql
    if p_delta ? 'items' then
      if jsonb_typeof(p_delta->'items') <> 'object' then
        perform public.hr_reject('bad_items');
      end if;
      if (select count(*) from jsonb_object_keys(p_delta->'items')) > c_max_item_kinds then
        perform public.hr_reject('too_many_item_kinds');
      end if;
      for k, v_n in select key, coalesce(nullif(value,'')::bigint, 0)
                      from jsonb_each_text(p_delta->'items') loop
        if v_n = 0 then continue; end if;
        if abs(v_n) > c_max_item_delta then
          perform public.hr_reject('item_clamp', jsonb_build_object('item_id', k));
        end if;
        -- Unknown ids are refused unconditionally now. hr_items is GENERATED
        -- from src/data/items.js; if it is missing this function errors, which
        -- is the correct direction to fail. (Review S3.)
        if not exists (select 1 from public.hr_items where item_id = k) then
          perform public.hr_reject('unknown_item', jsonb_build_object('item_id', k));
        end if;
        -- SKILLS-FROM-STORAGE: hearth fuel the block above already took (the bag first, then Storage).
        if v_skill_cost ? k then continue; end if;
        select qty into v_have from public.player_inventory
          where user_id = v_uid and slot = v_slot and item_id = k for update;
        v_have := coalesce(v_have, 0);
        if v_have + v_n < 0 then
          perform public.hr_reject('insufficient_item',
            jsonb_build_object('item_id', k, 'have', v_have, 'need', -v_n));
        end if;
        -- A LOCKED ITEM IS NEVER SOLD TO THE NPC (hook: hr_item_locked, 2026-10-25-bag-rules.sql).
        if v_n < 0 and coalesce(v_this_intent, '') ~ '^vendor_sell(_many)?(:|$)' and public.hr_item_locked(v_uid, v_slot, k) then
          perform public.hr_reject('item_locked', jsonb_build_object('item_id', k));
        end if;
        if v_have + v_n = 0 then
          delete from public.player_inventory
            where user_id = v_uid and slot = v_slot and item_id = k;
        else
          insert into public.player_inventory as pi (user_id, slot, item_id, qty)
            values (v_uid, v_slot, k, v_have + v_n)
            on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
        end if;
      end loop;
    end if;

    -- ── XP ─ monotonic. A negative XP delta is a caller bug, and accepting one
    --    introduced by 2026-08-11-apply-engine.sql
    --        would make a rollback indistinguishable from an exploit.
    if p_delta ? 'xp' then
      if jsonb_typeof(p_delta->'xp') <> 'object' then perform public.hr_reject('bad_xp'); end if;
      for k, v_n in select key, coalesce(nullif(value,'')::bigint, 0)
                      from jsonb_each_text(p_delta->'xp') loop
        if v_n <= 0 then continue; end if;
        if v_n > c_max_xp_delta then
          perform public.hr_reject('xp_clamp', jsonb_build_object('skill_id', k));
        end if;
        -- ⚠ A MISSING ROW IS A ROW TO CREATE, NOT A REFUSAL (b370, and the
        --   incident that named it). This was an UPDATE plus
        --   `if v_rows <> 1 then hr_reject('unknown_skill')`, which conflated
        --   two unrelated facts: "that skill is not in the catalogue" (a real
        --   deploy bug) and "this character has no row for a real skill" (server
        --   bookkeeping). The per-skill rows are seeded ONCE, at character
        --   creation (2026-08-14-character-bootstrap.sql), and the catalogue
        --   grows afterwards — so every character older than a skill was missing
        --   its row, and hr_apply answered a legitimate grant with a refusal.
        --   When Stonemason shipped, that refusal STORED itself against the
        --   intent key (so "Try again" replayed it) and, because hr_reject rolls
        --   the protected block back WHOLE, it took the player's ore, gold and
        --   every other skill's XP down with it. 51 rejections in one night.
        --
        -- ⚠ THE HAND BACKFILL IS NOT THE FIX. Production was backfilled that
        --   night (all user/slot × hr_skills pairs now exist), which removes the
        --   symptom and leaves the defect: the NEXT skill added to
        --   src/data/skills.js re-creates it for every existing character. The
        --   bootstrap seed cannot fix it either — it runs once. The grant is the
        --   only place that is correct for a backfilled database AND a fresh one,
        --   so the fix is here.
        --
        -- ⚠ THE CATALOGUE CHECK IS THE VALIDATION; THE UPSERT IS NOT. There is
        --   NO foreign key from player_skills.skill_id to hr_skills (the FK is to
        --   player_state(user_id, slot)), so a bare upsert would happily mint a
        --   skill row named by a client string. Checking hr_skills FIRST is what
        --   keeps `unknown_skill` meaning what its name says — and it is raised
        --   STRICTLY MORE NARROWLY than before, so no delta this body used to
        --   accept can start being refused.
        if not exists (select 1 from public.hr_skills where skill_id = k) then
          perform public.hr_reject('unknown_skill', jsonb_build_object('skill_id', k));
        end if;
        insert into public.player_skills (user_id, slot, skill_id, xp)
          values (v_uid, v_slot, k, v_n)
          on conflict (user_id, slot, skill_id)
          do update set xp = player_skills.xp + v_n;
      end loop;
    end if;

    -- ── LEVEL XP (2026-10-27 core rebuild) ─ monotonic, kills only, the hunt settle only.
    --    The value bound (the journalled kills x the catalogue's per-kill XP) is
    --    hr_hunt_apply_member's, which wraps this call and sets hr.hunt_session.
    if p_delta ? 'level_xp' then
      if jsonb_typeof(p_delta->'level_xp') <> 'number' or (p_delta->>'level_xp') !~ '^[0-9]{1,15}$' then
        perform public.hr_reject('bad_level_xp', jsonb_build_object('type', jsonb_typeof(p_delta->'level_xp')));
      end if;
      if coalesce(current_setting('hr.hunt_session', true), '') = '' then
        perform public.hr_reject('level_xp_outside_hunt');
      end if;
      v_n := (p_delta->>'level_xp')::bigint;
      if v_n > c_max_xp_delta then
        perform public.hr_reject('xp_clamp', jsonb_build_object('skill_id', 'level'));
      end if;
      update public.player_state set level_xp = level_xp + v_n where user_id = v_uid and slot = v_slot;
    end if;

    -- ── XP REMAINDER (2026-10-09-xp-frac-carry.sql) ─ ABSOLUTE, per skill.
    --    grantXp credits floor(remainder + grant) and carries the rest; this
    --    stores the rest. REFUSED, never clamped, exactly as tool_carry: a
    --    remainder outside [0,1) has no honest source, and 900 would be a
    --    900-XP mint on the next grant. Written AFTER the XP loop so a skill
    --    row the loop just created is updated, not duplicated.
    if p_delta ? 'xp_frac' then
      if jsonb_typeof(p_delta->'xp_frac') <> 'object' then
        perform public.hr_reject('bad_xp_frac',
          jsonb_build_object('type', jsonb_typeof(p_delta->'xp_frac')));
      end if;
      if (select count(*) from jsonb_object_keys(p_delta->'xp_frac')) > c_max_carry_skills then
        perform public.hr_reject('too_many_xp_frac_skills',
          jsonb_build_object('n', (select count(*) from jsonb_object_keys(p_delta->'xp_frac'))));
      end if;
      for k in select key from jsonb_each(p_delta->'xp_frac') loop
        if length(k) not between 1 and 32
           or not exists (select 1 from public.hr_skills where skill_id = k) then
          perform public.hr_reject('unknown_skill', jsonb_build_object('skill_id', k));
        end if;
        if jsonb_typeof(p_delta->'xp_frac'->k) <> 'number'
           or (p_delta->'xp_frac'->>k)::numeric < 0 or (p_delta->'xp_frac'->>k)::numeric >= 1 then
          perform public.hr_reject('bad_xp_frac',
            jsonb_build_object('skill', k, 'value', p_delta->'xp_frac'->k));
        end if;
        -- trunc, never round: round(0.9999996, 6) is 1, which the CHECK refuses.
        insert into public.player_skills (user_id, slot, skill_id, xp, xp_frac)
          values (v_uid, v_slot, k, 0, trunc((p_delta->'xp_frac'->>k)::numeric, 6))
          on conflict (user_id, slot, skill_id)
          do update set xp_frac = excluded.xp_frac;
      end loop;
    end if;

    -- ── EQUIPMENT (review S4) ────────────────────────────────────────────
    --    introduced by 2026-08-11-apply-engine.sql
    -- Equipping is a TRANSFER, not a flag. One unit leaves player_inventory
    -- and one unit comes back on unequip or swap, so the total the player owns
    -- is conserved and the equip/unequip duplication is arithmetically
    -- impossible rather than merely unimplemented.
    --
    -- Four gates, all against the SERVER's data:
    --   • the equip slot exists                 (hr_equip_slots)
    --   • the item exists                       (hr_items)
    --   • the item fits that slot               (hr_item_slots — 'ring' is
    --     expanded to ring1/ring2 by the generator, in JS, next to the data)
    --   • the player meets reqSkill/reqLv       (player_skills, derived level)
    if p_delta ? 'equip' then
      if jsonb_typeof(p_delta->'equip') <> 'object' then perform public.hr_reject('bad_equip'); end if;
      if (select count(*) from jsonb_object_keys(p_delta->'equip')) > c_max_equip_kinds then
        perform public.hr_reject('too_many_equip_ops');
      end if;
      for k, v_eq in select key, value from jsonb_each(p_delta->'equip') loop
        if not exists (select 1 from public.hr_equip_slots where equip_slot = k) then
          perform public.hr_reject('unknown_equip_slot', jsonb_build_object('equip_slot', k));
        end if;

        select item_id into v_cur from public.player_equipment
         where user_id = v_uid and slot = v_slot and equip_slot = k for update;

        -- PIECE-VERBS (1072-piece-verbs.sql): A TRAIT PIECE IS ITS OWN UNIT. A piece worn in this slot (a trait_pieces row, never a bag
        -- stack) goes back to the account's free pieces when the slot changes, and its base NEVER reaches the bag: no unequip or swap can
        -- leave a plain copy beside the piece (b362's class) or strip its Traits. An op {"piece": <id>} wears one of the account's pieces;
        -- the row is the unit, so nothing is debited from the bag. A plain item in the slot moves exactly as before.
        declare
          v_was public.trait_pieces%rowtype;   -- the piece this hero wears in slot k now, if any
          v_put public.trait_pieces%rowtype;   -- the piece this op puts on, if it names one
        begin
          if jsonb_typeof(v_eq) = 'object' then
            if (select count(*) from jsonb_object_keys(v_eq)) <> 1 or jsonb_typeof(v_eq->'piece') is distinct from 'string'
               or (v_eq->>'piece') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
              perform public.hr_reject('bad_equip', jsonb_build_object('equip_slot', k));
            end if;
            if not public.hr_flag_on('trait_pieces') then perform public.hr_reject('pieces_dark'); end if;
            -- THE PIECE FIRST: its row lock before the worn one's, so a piece worn elsewhere is refused holding no other piece
            select * into v_put from public.trait_pieces
             where id = (v_eq->>'piece')::uuid and user_id = v_uid for update;
            if v_put.id is null then perform public.hr_reject('unknown_piece', jsonb_build_object('piece', v_eq->'piece')); end if;
            if v_put.escrow is not null then
              perform public.hr_reject('piece_escrowed', jsonb_build_object('piece', v_put.id, 'escrow', v_put.escrow));
            end if;
            if v_put.worn_slot is not null and (v_put.worn_slot <> v_slot or v_put.worn_equip_slot <> k) then
              perform public.hr_reject('piece_worn', jsonb_build_object('piece', v_put.id,
                'worn', jsonb_build_object('slot', v_put.worn_slot, 'equip_slot', v_put.worn_equip_slot)));
            end if;
          elsif jsonb_typeof(v_eq) not in ('null', 'string') then
            perform public.hr_reject('bad_equip', jsonb_build_object('equip_slot', k));
          end if;
          select * into v_was from public.trait_pieces
           where user_id = v_uid and worn_slot = v_slot and worn_equip_slot = k for update;

          if jsonb_typeof(v_eq) = 'null' then
            -- UNEQUIP: return the unit to the bank; a worn piece to the account's free pieces, its base never to the bag.
            if v_was.id is not null then
              update public.trait_pieces set worn_slot = null, worn_equip_slot = null, worn_at = null where id = v_was.id;
            end if;
            if v_cur is not null then
              delete from public.player_equipment
               where user_id = v_uid and slot = v_slot and equip_slot = k;
              if v_was.id is null or v_was.base is distinct from v_cur then
                insert into public.player_inventory as pi (user_id, slot, item_id, qty)
                  values (v_uid, v_slot, v_cur, 1)
                  on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;
              end if;
            end if;
            continue;
          end if;

          if v_put.id is not null then
            v_item := v_put.base;
            if v_was.id = v_put.id and v_cur is not distinct from v_item then continue; end if;   -- worn here already: no-op
          else
            v_item := v_eq #>> '{}';
            -- no-op; a worn piece whose base is named stays on (a setup that names its base keeps the piece)
            if v_cur is not null and v_cur = v_item then continue; end if;
          end if;

          if not exists (select 1 from public.hr_items where item_id = v_item) then
            perform public.hr_reject('unknown_item', jsonb_build_object('item_id', v_item));
          end if;
          if not exists (select 1 from public.hr_item_slots
                          where item_id = v_item and equip_slot = k) then
            perform public.hr_reject('wrong_slot',
              jsonb_build_object('item_id', v_item, 'equip_slot', k));
          end if;
          -- The requirement is re-checked here even though the Edge Function
          -- already checked it. "The caller checked" is not a control.
          -- GEAR-BY-LEVEL (2027-01-14-gear-by-level.sql, Tyler 2026-10-24): the catalogue row's requirement,
          -- read by hr_item_requirement_unmet: the hero's Level for every piece of gear, a skill for ammo.
          -- The refusal says what it read (req, need, have): the screen states the server's own numbers.
          if public.hr_item_requirement_unmet(v_uid, v_slot, v_item) is not null then
            perform public.hr_reject('requirement_not_met', jsonb_build_object('item_id', v_item)
                                     || public.hr_item_requirement_unmet(v_uid, v_slot, v_item));
          end if;

          if v_put.id is null then
            -- DEBIT one from the bank. This is the ownership check; there is
            -- nothing else to check. (A piece is its own row: nothing to debit.)
            select qty into v_have from public.player_inventory
             where user_id = v_uid and slot = v_slot and item_id = v_item for update;
            if coalesce(v_have, 0) < 1 then
              perform public.hr_reject('insufficient_item',
                jsonb_build_object('item_id', v_item, 'have', coalesce(v_have, 0), 'need', 1));
            end if;
            if v_have = 1 then
              delete from public.player_inventory
               where user_id = v_uid and slot = v_slot and item_id = v_item;
            else
              update public.player_inventory set qty = qty - 1
               where user_id = v_uid and slot = v_slot and item_id = v_item;
            end if;
          end if;

          -- CREDIT back whatever was in the slot: a worn piece to the account's free pieces, a plain item to the bank.
          if v_was.id is not null then
            update public.trait_pieces set worn_slot = null, worn_equip_slot = null, worn_at = null where id = v_was.id;
          end if;
          if v_cur is not null and (v_was.id is null or v_was.base is distinct from v_cur) then
            insert into public.player_inventory as pi (user_id, slot, item_id, qty)
              values (v_uid, v_slot, v_cur, 1)
              on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;
          end if;

          insert into public.player_equipment as pe (user_id, slot, equip_slot, item_id)
            values (v_uid, v_slot, k, v_item)
            on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
          if v_put.id is not null then
            update public.trait_pieces set worn_slot = v_slot, worn_equip_slot = k, worn_at = now() where id = v_put.id;
          end if;
        end;
      end loop;
      -- TWO HANDS (Tyler 2026-10-19: Healer = staff): judged on the worn set AFTER
      -- the loop, so one delta may swap a spellbook out and a staff in (either order).
      if exists (select 1 from public.player_equipment pe join public.hr_items i on i.item_id = pe.item_id
                  where pe.user_id = v_uid and pe.slot = v_slot and pe.equip_slot = 'weapon' and i.two_handed)
         and exists (select 1 from public.player_equipment pe
                      where pe.user_id = v_uid and pe.slot = v_slot and pe.equip_slot = 'shield') then
        perform public.hr_reject('two_handed', jsonb_build_object('equip_slot', 'shield'));
      end if;
    end if;

    -- ── ENCHANTING (ELEMENTS v1) ─────────────────────────────────────────
    --    introduced by 2026-08-18-enchant.sql
    -- Applying a rune to the weapon MIRRORS the equip TRANSFER above: one rune
    -- leaves player_inventory (the debit IS the ownership check) and the
    -- server-owned player_state.enchant[<slot>] becomes the rune's ELEMENT,
    -- RESOLVED from the SERVER catalogue hr_runes — never an element the Edge
    -- Function proposed. Re-validated here under the row lock; the Edge answer is
    -- only an earlier, named refusal. v1 enchants the WEAPON slot only, and only
    -- when it currently holds a weapon.
    --   • the enchant slot is a real equip slot and is the weapon slot (v1)
    --   • the rune resolves to an element              (hr_runes)
    --   • that slot currently holds a WEAPON           (player_equipment + hr_items.kind)
    --   • the player owns >=1 of the rune — the debit is the check
    if p_delta ? 'enchant' then
      if jsonb_typeof(p_delta->'enchant') <> 'object' then perform public.hr_reject('bad_enchant'); end if;
      -- v1 is ONE slot per call; more than one is a shape error, not a partial
      -- apply. (equip allows a loadout map; an enchant is a single gesture.)
      if (select count(*) from jsonb_object_keys(p_delta->'enchant')) <> 1 then
        perform public.hr_reject('bad_enchant', jsonb_build_object('why', 'one slot per enchant'));
      end if;
      for k, v_eq in select key, value from jsonb_each(p_delta->'enchant') loop
        if not exists (select 1 from public.hr_equip_slots where equip_slot = k) then
          perform public.hr_reject('unknown_equip_slot', jsonb_build_object('equip_slot', k));
        end if;
        -- v1: WEAPON ONLY. A real slot that is not the weapon slot is wrong_slot,
        -- the same code a slot that holds no weapon gets below — "this cannot be
        -- enchanted" is one fact.
        if k <> 'weapon' then
          perform public.hr_reject('wrong_slot', jsonb_build_object('equip_slot', k));
        end if;
        if jsonb_typeof(v_eq) <> 'string' then
          perform public.hr_reject('bad_enchant', jsonb_build_object('equip_slot', k));
        end if;
        v_item := v_eq #>> '{}';                       -- the RUNE id
        -- RESOLVE rune -> element from the catalogue. Unknown => not a rune.
        select element into v_enchant_el from public.hr_runes where rune_id = v_item;
        if v_enchant_el is null then
          perform public.hr_reject('unknown_item', jsonb_build_object('item_id', v_item));
        end if;
        -- The target slot must currently hold a WEAPON. The server reads its OWN
        -- equipment, never the client's claim.
        select item_id into v_cur from public.player_equipment
         where user_id = v_uid and slot = v_slot and equip_slot = k for update;
        if v_cur is null
           or not exists (select 1 from public.hr_items where item_id = v_cur and kind = 'weapon') then
          perform public.hr_reject('wrong_slot', jsonb_build_object('equip_slot', k, 'held', v_cur));
        end if;
        -- DEBIT one rune. This is the ownership check; there is nothing else to
        -- check, exactly as with the equip debit above. insufficient_item is
        -- DELIBERATELY off c_release_codes for the same reason equip's is.
        select qty into v_have from public.player_inventory
         where user_id = v_uid and slot = v_slot and item_id = v_item for update;
        if coalesce(v_have, 0) < 1 then
          perform public.hr_reject('insufficient_item',
            jsonb_build_object('item_id', v_item, 'have', coalesce(v_have, 0), 'need', 1));
        end if;
        if v_have = 1 then
          delete from public.player_inventory
           where user_id = v_uid and slot = v_slot and item_id = v_item;
        else
          update public.player_inventory set qty = qty - 1
           where user_id = v_uid and slot = v_slot and item_id = v_item;
        end if;
        -- SET the server-owned enchant state to the resolved ELEMENT. jsonb
        -- merge so any future ELEMENTS v2 slot survives a single-slot enchant.
        update public.player_state
           set enchant = coalesce(enchant, '{}'::jsonb) || jsonb_build_object(k, v_enchant_el)
         where user_id = v_uid and slot = v_slot;
      end loop;
    end if;

    -- ── BANK CAP ─ counted once, AFTER items and equipment, because both can
    --    introduced by 2026-08-11-apply-engine.sql
    --   create a stack. Revision 1 checked it mid-way through the item loop and
    --   then returned, committing the items it had already written.
    --   A NEW stack is what costs space, so a player at cap can still gain more
    --   of what they already hold.
    --   BAG-OVER-CAP (2027-02-11-bag-over-cap.sql): refused only when THIS delta made an over-cap bag bigger. A bag
    --   can sit above its cap (a hunt's bag comes home unchecked, hr_hunt_close): it may shrink or hold, never grow,
    --   and a hero who holds 101 stacks still burns, sells and gains more of what it holds. One row per catalogue
    --   item, so an exact count is a short PK range; a saturating count could not see 102 > 101.
    if (p_delta ? 'items') or (p_delta ? 'equip') then
      select count(*) into v_stacks from public.player_inventory
       where user_id = v_uid and slot = v_slot;
      -- HUNT-LOOT-PAST-CAP (2027-02-11-hunt-loot-past-bag-cap.sql): no hunt stops or forfeits for a full bag
      -- (hr.hunt_session is hr_hunt_apply_member's own stamp); every other delta stops at the cap.
      if coalesce(current_setting('hr.hunt_session', true), '') = '' and v_stacks > v_st.bank_cap and v_stacks > v_stacks_before then
        perform public.hr_reject('bank_full',
          jsonb_build_object('stacks', v_stacks, 'cap', v_st.bank_cap));
      end if;
    end if;

    -- ── FARM ─ SHARED-FARM (2026-12-14-shared-farm.sql): the engine's per-hero farm ops are
    --    gone. The field is the ACCOUNT's (account_farm_plots), written only by the hr_farm_*
    --    verbs under the account farm lock; no engine path plants, waters or clears a plot.

    -- ── PROGRESS (review S13) ────────────────────────────────────────────
    --    introduced by 2026-08-11-apply-engine.sql
    -- Revision 1 inserted whatever `kind` and `state` the delta named, with an
    -- unbounded `add`. `kind` typos became a parallel universe of rows; `state`
    -- accepted 'claimed', which is the one value that gates a payout.
    -- Here: `kind` is checked, `add` is clamped and non-negative, and 'claimed'
    -- is unreachable — the separate claim block below is the only route.
    if p_delta ? 'progress' then
      if jsonb_typeof(p_delta->'progress') <> 'array' then perform public.hr_reject('bad_progress'); end if;
      if jsonb_array_length(p_delta->'progress') > c_max_progress_ops then
        perform public.hr_reject('too_many_progress_ops');
      end if;
      for v_prog in select value from jsonb_array_elements(p_delta->'progress') loop
        if coalesce(v_prog->>'kind','') not in
             ('quest','daily','bounty','stat','collection','flag') then
          perform public.hr_reject('bad_progress_kind', jsonb_build_object('kind', v_prog->>'kind'));
        end if;
        if length(coalesce(v_prog->>'key','')) not between 1 and 64
           or length(coalesce(v_prog->>'period','')) > 16 then
          perform public.hr_reject('bad_progress_key');
        end if;
        if coalesce(v_prog->>'state','active') not in ('active','done') then
          perform public.hr_reject('bad_progress_state',
            jsonb_build_object('state', v_prog->>'state'));
        end if;
        v_n := coalesce((v_prog->>'add')::bigint, 0);
        if v_n < 0 or v_n > c_max_progress_add then
          perform public.hr_reject('progress_clamp', jsonb_build_object('add', v_n));
        end if;
        -- ── COMPANION XP (2026-10-12-companion-xp-frac.sql) ─────────────────
        --    An EXACT prefix, never `like` (`_` would match any character), and
        --    hr_state_of projects companions with the same prefix (§3).
        --    (1) ONLY THE EQUIPPED PET earns: the engine credits exactly
        --        player_state.companion_equipped (version-bumped by
        --        hr_companion_equip, so its read and this check see one pet);
        --        an op for any other id has no honest source. REFUSED, as the
        --        companion_xp_frac key is (Security, 2026-10-13 #2).
        --    (2) THE CAP: CLAMPED, not refused, and journalled: the engine
        --        clamps to the same headroom, so an honest op never reaches
        --        this, and refusing a whole settle over the pet's last few XP
        --        would cost the player the window's loot. A row already over
        --        the cap is never reduced here. The journal ACCUMULATES per key
        --        (proposed and credited summed, the first clamp's `had` kept):
        --        a folded chain can cross the cap on its second op of the same
        --        key, and a per-op overwrite would journal only the last
        --        (Security, 2026-10-13 #1).
        if v_prog->>'kind' = 'stat' and left(v_prog->>'key', 13) = 'companion_xp:' then
          if substring(v_prog->>'key' from 14) is distinct from v_st.companion_equipped then
            perform public.hr_reject('companion_not_equipped',
              jsonb_build_object('companion_id', left(substring(v_prog->>'key' from 14), 64)));
          end if;
          v_cxp_have := null;
          select pp.value into v_cxp_have from public.player_progress pp
           where pp.user_id = v_uid and pp.slot = v_slot and pp.kind = 'stat'
             and pp.key = v_prog->>'key' and pp.period_key = coalesce(v_prog->>'period', '');
          v_cxp_have := coalesce(v_cxp_have, 0);
          if v_cxp_have + v_n > c_companion_xp_cap then
            v_cxp_credit := greatest(0, c_companion_xp_cap - v_cxp_have);
            v_cxp_clamp := coalesce(v_cxp_clamp, '{}'::jsonb) || jsonb_build_object(v_prog->>'key',
              case when coalesce(v_cxp_clamp ? (v_prog->>'key'), false) then
                jsonb_build_object(
                  'proposed', (v_cxp_clamp #>> array[v_prog->>'key', 'proposed'])::bigint + v_n,
                  'had',      v_cxp_clamp #>  array[v_prog->>'key', 'had'],
                  'credited', (v_cxp_clamp #>> array[v_prog->>'key', 'credited'])::bigint + v_cxp_credit)
              else
                jsonb_build_object('proposed', v_n, 'had', v_cxp_have, 'credited', v_cxp_credit)
              end);
            v_n := v_cxp_credit;
          end if;
        end if;
        -- DEAD-WRITES: the collection counter (`ev:loot:<item>`, src/core/goals.js) is stored only while the `collection_log`
        -- feature switch is on for the account. Off, the op was checked above like every other and is not written: nothing
        -- reads these rows today, and the switch brings the counter back with no deploy.
        if v_prog->>'kind' = 'stat' and left(v_prog->>'key', 8) = 'ev:loot:' then
          if v_collect is null then v_collect := public.hr_feature_on('collection_log', v_uid); end if;
          if not v_collect then continue; end if;
        end if;
        insert into public.player_progress as pp
          (user_id, slot, kind, key, period_key, value, state, updated_at)
        values (v_uid, v_slot, v_prog->>'kind', v_prog->>'key',
                coalesce(v_prog->>'period',''), v_n, v_prog->>'state', now())
        on conflict (user_id, slot, kind, key, period_key) do update
          set value = pp.value + v_n,
              -- A row already 'claimed' is terminal until its period rolls.
              state = case when pp.state = 'claimed' then pp.state
                           else coalesce(v_prog->>'state', pp.state) end,
              updated_at = now();
      end loop;
    end if;

    -- ── THE PET'S XP REMAINDER (2026-10-12-companion-xp-frac.sql) ─ ABSOLUTE.
    --    companionSpanGrant credits floor(remainder + 0.5 x actions) and
    --    carries the rest; this stores the rest on the pet's own row. Every
    --    key must be the EQUIPPED companion — the only pet a settle credits —
    --    and every value a number in [0,1): REFUSED, never clamped, exactly as
    --    xp_frac. An OVERWRITE: the engine proposes the absolute remainder.
    if p_delta ? 'companion_xp_frac' then
      if jsonb_typeof(p_delta->'companion_xp_frac') <> 'object' then
        perform public.hr_reject('bad_companion_xp_frac',
          jsonb_build_object('type', jsonb_typeof(p_delta->'companion_xp_frac')));
      end if;
      for k in select key from jsonb_each(p_delta->'companion_xp_frac') loop
        if k is distinct from v_st.companion_equipped then
          perform public.hr_reject('companion_not_equipped',
            jsonb_build_object('companion_id', left(k, 64)));
        end if;
        if jsonb_typeof(p_delta->'companion_xp_frac'->k) <> 'number'
           or (p_delta->'companion_xp_frac'->>k)::numeric < 0
           or (p_delta->'companion_xp_frac'->>k)::numeric >= 1 then
          perform public.hr_reject('bad_companion_xp_frac',
            jsonb_build_object('companion_id', k, 'value', p_delta->'companion_xp_frac'->k));
        end if;
        -- trunc, never round: round(0.9999996, 6) is 1, which the CHECK refuses.
        insert into public.player_progress as pp
          (user_id, slot, kind, key, period_key, value, state, xp_frac, updated_at)
        values (v_uid, v_slot, 'stat', 'companion_xp:' || k, '', 0, 'active',
                trunc((p_delta->'companion_xp_frac'->>k)::numeric, 6), now())
        on conflict (user_id, slot, kind, key, period_key) do update
          set xp_frac = excluded.xp_frac, updated_at = now();
      end loop;
    end if;

    -- ── PROGRESS CLAIM ─ the only path to 'claimed', and it requires the row
    --    introduced by 2026-08-11-apply-engine.sql
    --   to already be 'done'. `row_count` is the check: a claim that changes
    --   nothing is a claim of something that was not earned, or a double claim.
    if p_delta ? 'progress_claim' then
      if jsonb_typeof(p_delta->'progress_claim') <> 'array' then
        perform public.hr_reject('bad_progress_claim');
      end if;
      for v_prog in select value from jsonb_array_elements(p_delta->'progress_claim') loop
        update public.player_progress
           set state = 'claimed', updated_at = now()
         where user_id = v_uid and slot = v_slot
           and kind = v_prog->>'kind' and key = v_prog->>'key'
           and period_key = coalesce(v_prog->>'period','')
           and state = 'done';
        get diagnostics v_rows = row_count;
        if v_rows <> 1 then
          perform public.hr_reject('not_claimable',
            jsonb_build_object('kind', v_prog->>'kind', 'key', v_prog->>'key'));
        end if;
        -- THE LOGIN CLAIM IS RE-PRICED HERE (2026-10-16-login-reward.sql):
        -- under this apply's character lock, the period must be today, the
        -- claimed row must hold the server's streak and the delta's gold, gems
        -- and items must equal hr_login_price. Edge proposes; this disposes.
        if v_prog->>'kind' = 'daily' and v_prog->>'key' = 'login' then
          perform public.hr_login_claim_verify(v_uid, v_slot, coalesce(v_prog->>'period', ''), p_delta);
        end if;
      end loop;
    end if;

    -- ── ACTIVITY ─────────────────────────────────────────────────────────
    --    introduced by 2026-08-11-apply-engine.sql
    -- (Review R11.) Revision 2 gated the whole block on `v_act ? 'kind'`, so
    -- `{"activity":{"restart":true}}` skipped EVERY check and still reached the
    -- UPDATE, where `restart` resets active_since to now(). A caller could
    -- therefore restamp the activity clock — the input to accrual — without
    -- naming an activity, without a catalogue lookup and without the skill
    -- gate. `{"activity":{}}` was likewise accepted and did nothing, which is
    -- the "silently dropped effect" this contract explicitly refuses elsewhere.
    -- Now: an `activity` key means a complete, validated activity statement.
    v_act := p_delta->'activity';
    if p_delta ? 'activity' then
      if jsonb_typeof(v_act) <> 'object' then perform public.hr_reject('bad_activity'); end if;
      if not (v_act ? 'kind') then
        perform public.hr_reject('bad_activity',
          jsonb_build_object('why', 'activity requires kind; restart alone is not an activity'));
      end if;
      -- The activity statement is an ALLOWLIST (stances and stop rules left with
      -- the away model, 2026-10-22-hunt-sessions-delete-away.sql).
      if exists (select 1 from jsonb_object_keys(v_act) as t(ak)
                  where ak <> all (array['kind','id','restart','count','next'])) then
        perform public.hr_reject('bad_activity', jsonb_build_object('why', 'unknown activity key'));
      end if;
      if (v_act ? 'restart') and jsonb_typeof(v_act->'restart') <> 'boolean' then
        perform public.hr_reject('bad_activity', jsonb_build_object('why', 'restart must be boolean'));
      end if;
      -- The (kind ⇔ id) invariant is a table CHECK, and hitting a CHECK yields
      -- an opaque 23514. Answer it here so a caller bug reads as a caller bug.
      if (v_act->>'kind' = 'idle') <> (nullif(v_act->>'id','') is null) then
        perform public.hr_reject('bad_activity');
      end if;
      if v_act->>'kind' <> 'idle' then
        -- NAMED HUNT (2026-10-20-hunts-start-gate.sql): a combat id that is a hunt
        -- is admitted iff the SERVER combat level reaches its band floor.
        if v_act->>'kind' = 'combat'
           and exists (select 1 from public.hr_hunts h where h.hunt_id = v_act->>'id') then
          perform public.hr_hunt_gate(v_uid, v_slot, v_act->>'id');
        elsif not exists (select 1 from public.hr_activities
                        where kind = v_act->>'kind' and activity_id = v_act->>'id') then
          perform public.hr_reject('unknown_activity',
            jsonb_build_object('kind', v_act->>'kind', 'id', v_act->>'id'));
        end if;
        -- Re-check the skill gate against SERVER xp. A forged local level buys
        -- nothing, including the right to start a level-90 node.
        if exists (
          select 1 from public.hr_activities a
           where a.kind = v_act->>'kind' and a.activity_id = v_act->>'id'
             and a.req_skill is not null and a.req_lv is not null
             and coalesce((select public.hr_skill_level(a.req_skill, s.xp) from public.player_skills s
                            where s.user_id = v_uid and s.slot = v_slot
                              and s.skill_id = a.req_skill), 1) < a.req_lv)
        then
          perform public.hr_reject('activity_locked', jsonb_build_object('id', v_act->>'id'));
        end if;
      end if;
    end if;

    -- ── JOB-COUNTS (1026-job-counts.sql; "make N" 2026-12-01-bench-count.sql) ─────────────────
    -- `count` rides a gathering job or a bench run's statement (a whole number 1..100000), `next` (wait) only beside
    -- a count; a statement without them clears the job's count and THEN. No THEN starts a hunt (D-11: 27b). `active_left` is the engine's countdown, only on
    -- an accrual (accrued_to), of a stored gathering job or bench run that has a count: alone, a whole number at least 1
    -- and below the stored one (it can only shorten a job); BESIDE an `activity: idle` (the engine ending the job), what
    -- the job left, 0 .. the stored count, where 0 is the count reached: the job's end.
    if p_delta ? 'activity' and v_act ? 'count' then
      if coalesce(v_act->>'kind', '') not in ('artisan', 'gather') or jsonb_typeof(v_act->'count') <> 'number'
         or (v_act->>'count')::numeric <> trunc((v_act->>'count')::numeric)
         or (v_act->>'count')::numeric < 1 or (v_act->>'count')::numeric > 100000 then
        perform public.hr_reject('bad_activity',
          jsonb_build_object('why', 'count is a whole number 1..100000 on a gathering job or a bench run'));
      end if;
      v_bench_left := (v_act->>'count')::int;
      v_job_count := v_bench_left;
    end if;
    if p_delta ? 'activity' and v_act ? 'next' then
      if not (v_act ? 'count') or jsonb_typeof(v_act->'next') <> 'string' or coalesce(v_act->>'next', '') not in ('wait') then
        perform public.hr_reject('bad_activity', jsonb_build_object('why', 'next is wait, beside a count'));
      end if;
      v_job_next := v_act->>'next';
    end if;
    if p_delta ? 'active_left' then
      if not (p_delta ? 'accrued_to')
         or jsonb_typeof(p_delta->'active_left') <> 'number'
         or (p_delta->>'active_left')::numeric <> trunc((p_delta->>'active_left')::numeric)
         or coalesce(v_st.active_kind, '') not in ('artisan', 'gather') or v_st.active_left is null
         or (p_delta ? 'activity' and (v_act->>'kind' is distinct from 'idle' or v_act ? 'count'))
         or (p_delta->>'active_left')::numeric < (case when p_delta ? 'activity' then 0 else 1 end)
         or (p_delta->>'active_left')::numeric > v_st.active_left
         or (not (p_delta ? 'activity') and (p_delta->>'active_left')::numeric >= v_st.active_left) then
        perform public.hr_reject('bad_delta',
          jsonb_build_object('why', 'active_left only counts a stored job down, or says what an ending job left', 'stored', v_st.active_left));
      end if;
      if p_delta ? 'activity' then
        -- THE JOB ENDED on this accrual (its pointer goes idle, so it keeps no count). A Hearth errand is a visit, not a job:
        -- hr_town_errand gives the interrupted job back and nothing is said.
        v_job_left := (p_delta->>'active_left')::int;
        if not public.hr_hearth_errand(v_st.active_kind, v_st.active_id, v_st.active_left) then
          v_job_end := jsonb_build_object('kind', v_st.active_kind, 'id', v_st.active_id,
                         'count', greatest(coalesce(v_st.active_count, v_st.active_left), v_st.active_left), 'left', v_job_left,
                         'done', greatest(coalesce(v_st.active_count, v_st.active_left), v_st.active_left) - v_job_left,
                         'next', coalesce(v_st.active_next, 'wait'),
                         'end', case when v_job_left = 0 then 'count' else 'stopped' end, 'at', now())
            || case when v_job_left > 0 then '{}'::jsonb else jsonb_build_object('next_state', 'waited') end;
        end if;
      else
        v_bench_left := (p_delta->>'active_left')::int;
      end if;
    end if;

    -- ── (4a-ii) THE GATHERING TOOL CARRY (b348) ──────────────────────────
    --    introduced by 2026-08-15-tool-carry.sql
    -- src/core/tools.js `advanceToolCarry` banks `qty x toolDouble` into a
    -- per-skill FRACTION and pays out whole units as they accrue, so a 10%
    -- tool pays exactly one bonus every ten actions instead of rolling for it.
    -- That determinism is the whole reason an away replay is byte-identical
    -- run to run, and it only survives across sessions if the remainder is
    -- stored. legacy.js:3841 renamed it out of `G._toolCarry` for exactly this
    -- column.
    --
    -- ⚠ IT IS AN ABSOLUTE, NOT A DELTA, and it is the only key here that is.
    --   Every other value in this contract is signed and added; a carry cannot
    --   be, because the engine computes the RESULTING remainder from a starting
    --   one it was handed, and adding two remainders would be arithmetic
    --   nobody defined. Stated here rather than inferred from the code.
    --
    -- ⚠ THE RANGE IS THE WHOLE CONTROL. A carry of 0.9 is legal; a carry of 900
    --   would be a 900-item mint on the first action of the next span, because
    --   `advanceToolCarry` floors it straight into a payout. So each value must
    --   be a number in [0,1) — refused, never clamped: there is no honest way
    --   for a carry to be out of range, and silently repairing an impossible
    --   value is how a compromised engine's bug becomes the server's opinion.
    if p_delta ? 'tool_carry' then
      v_carry := p_delta->'tool_carry';
      if jsonb_typeof(v_carry) <> 'object' then
        perform public.hr_reject('bad_tool_carry', jsonb_build_object('type', jsonb_typeof(v_carry)));
      end if;
      if (select count(*) from jsonb_object_keys(v_carry)) > c_max_carry_skills then
        perform public.hr_reject('too_many_carry_skills',
          jsonb_build_object('n', (select count(*) from jsonb_object_keys(v_carry))));
      end if;
      for k in select key from jsonb_each(v_carry) loop
        if length(k) not between 1 and 32
           or not exists (select 1 from public.hr_skills where skill_id = k) then
          perform public.hr_reject('unknown_skill', jsonb_build_object('skill_id', k));
        end if;
        if jsonb_typeof(v_carry->k) <> 'number'
           or (v_carry->>k)::numeric < 0 or (v_carry->>k)::numeric >= 1 then
          perform public.hr_reject('bad_tool_carry',
            jsonb_build_object('skill', k, 'value', v_carry->k));
        end if;
      end loop;
    end if;

    -- ── (4a-iii) THE IN-FLIGHT FIGHT (Phase 0) ───────────────────────────
    --    introduced by 2026-08-17-fight-carry.sql
    -- Carrying a partial fight across accrual windows is what stops a monster
    -- whose time-to-kill exceeds the window from paying ZERO forever. Measured
    -- (tools/probe-live-settle.mjs P3): a 520 HP dragon against mediocre
    -- offence takes ~488 ticks — about 20 minutes — for one kill. One 60-minute
    -- window pays 1 kill / 575 gold; sixty 60-second windows paid 0 kills /
    -- 0 gold / 0 XP, at every cadence, indefinitely.
    --
    -- ⚠ THE PROPOSAL IS CHECKED, NOT TRUSTED, and this is the whole reason the
    --   key exists in the delta contract rather than being written by the Edge
    --   Function directly. `hp` is re-clamped against the ACTUAL monster's HP
    --   re-derived from hr_activities here, in SQL, under the row lock — not
    --   against a maximum the engine sent alongside it. A forged `fight` is
    --   worth a mint otherwise: name the highest-value boss, claim 1 HP, and
    --   every window kills it on the first swing.
    --
    -- ⚠ REFUSED, NEVER CLAMPED. There is no honest way for the engine to
    --   propose 9,999 HP on a 520 HP dragon, and silently repairing an
    --   impossible value is how a compromised engine's bug becomes the server's
    --   opinion — the same posture as bad_tool_carry, and the same cost
    --   (`bad_fight*` is not on index.ts's DEGRADABLE list, so it 409s the
    --   window rather than shortening it).
    if p_delta ? 'fight' then
      v_fight := p_delta->'fight';
      if jsonb_typeof(v_fight) <> 'object' then
        perform public.hr_reject('bad_fight', jsonb_build_object('type', jsonb_typeof(v_fight)));
      end if;
      -- '{}' is the explicit VOID and is always legal — it is how the engine
      -- says "the fight ended", which a death, a stop and a monster on exactly
      -- 0 HP all are.
      if v_fight <> '{}'::jsonb then
        if exists (select 1 from jsonb_object_keys(v_fight) as t(fk)
                    where fk not in ('monster','hp','kills')) then
          perform public.hr_reject('bad_fight', jsonb_build_object('why', 'unknown key'));
        end if;
        -- ⚠ PRESENCE BEFORE TYPE, AND IT IS NOT BELT-AND-BRACES. Security
        --   F2, 2026-08-16: `jsonb_typeof(v_fight->'hp')` of an ABSENT key is
        --   SQL NULL, `NULL <> 'number'` is NULL, and `NULL or NULL or NULL`
        --   is NULL — so the type gate below never fired for a key that simply
        --   was not there. `{"monster":"dragon","kills":0}` was ACCEPTED, and
        --   because `(v_fight->>'hp')::numeric` is likewise NULL, every
        --   comparison in the CEILING CHECK was NULL too: the clamp was skipped
        --   entirely and a checkpoint with no HP at all was stored. It was an
        --   under-payment rather than a mint only because normaliseFight
        --   independently refuses a missing hp — i.e. the database's gate was
        --   decorative and the Edge Function was the only thing holding, which
        --   is the exact inversion of this file's whole posture.
        --   Three-valued logic is why a gate must test PRESENCE explicitly.
        if not (v_fight ? 'monster' and v_fight ? 'hp' and v_fight ? 'kills') then
          perform public.hr_reject('bad_fight', jsonb_build_object('why', 'missing key',
            'keys', (select coalesce(jsonb_agg(fk order by fk), '[]'::jsonb)
                       from jsonb_object_keys(v_fight) as t(fk))));
        end if;
        if jsonb_typeof(v_fight->'monster') <> 'string'
           or jsonb_typeof(v_fight->'hp') <> 'number'
           or jsonb_typeof(v_fight->'kills') <> 'number' then
          perform public.hr_reject('bad_fight', jsonb_build_object('why', 'shape'));
        end if;
        -- THE CEILING, RE-DERIVED. A non-combat activity id has a NULL max_hp
        -- by construction (the generator asserts both directions), so this same
        -- lookup also refuses a fight that names a tree or a recipe.
        select max_hp into v_fight_max from public.hr_activities
         where kind = 'combat' and activity_id = v_fight->>'monster';
        if v_fight_max is null then
          perform public.hr_reject('unknown_monster',
            jsonb_build_object('id', v_fight->>'monster'));
        end if;
        if (v_fight->>'hp')::numeric <> trunc((v_fight->>'hp')::numeric)
           or (v_fight->>'hp')::numeric < 1
           or (v_fight->>'hp')::numeric > v_fight_max then
          perform public.hr_reject('bad_fight_hp', jsonb_build_object(
            'id', v_fight->>'monster', 'hp', v_fight->'hp', 'max_hp', v_fight_max));
        end if;
        if (v_fight->>'kills')::numeric <> trunc((v_fight->>'kills')::numeric)
           or (v_fight->>'kills')::numeric < 0
           or (v_fight->>'kills')::numeric > c_max_fight_kills then
          perform public.hr_reject('bad_fight_kills',
            jsonb_build_object('kills', v_fight->'kills'));
        end if;
      end if;
    end if;

    -- ── (4a-iv) HIRED-WORKER PRODUCTION (worker-settlement slice) ─────────
    --    introduced by 2026-08-25-workers.sql
    -- A crew (player_workers) is server-owned — no client write policy — and
    -- gathers in PARALLEL to the active pointer on its OWN watermark. The engine
    -- proposes a `workers` sub-delta of PER-WORKER xp keyed by uid; each uid is
    -- re-validated HERE against the CALLER'S OWN crew, so a forged uid that names
    -- another player's worker (or one that does not exist) is refused, never
    -- silently credited. Worker xp is NEVER player xp and NEVER a player_skills
    -- row. The produced ITEMS ride the signed `items` map above, so the day
    -- budget already counted them; this block is xp only. The character row is
    -- already locked (for update above), so the membership read is a check, not a
    -- second lock.
    --    the death ledger row (2026-10-27 core rebuild: a death ends the hunt; there is no recovery line)
    -- (4a-d) THE DEATH LEDGER (rev. 2, N3). SHAPE ONLY, and refused rather than
    -- truncated: more than one death row means the engine proposed something the
    -- core model cannot produce (a death ends the hunt), and quietly writing the
    -- first of it would turn an engine bug into a plausible-looking audit trail. Every FIELD is
    -- re-derived server-side at (4z) from this array's own values, and the
    -- rows move no value, so there is nothing here to clamp - only to refuse.
    if p_delta ? 'deaths' then
      if jsonb_typeof(p_delta->'deaths') <> 'array' then
        perform public.hr_reject('bad_deaths', jsonb_build_object('type', jsonb_typeof(p_delta->'deaths')));
      end if;
      if jsonb_array_length(p_delta->'deaths') > c_max_death_rows then
        perform public.hr_reject('bad_deaths',
          jsonb_build_object('why', 'too many', 'n', jsonb_array_length(p_delta->'deaths'),
                             'limit', c_max_death_rows));
      end if;
      for v_death in select value from jsonb_array_elements(p_delta->'deaths') loop
        if jsonb_typeof(v_death) <> 'object' then
          perform public.hr_reject('bad_deaths', jsonb_build_object('why', 'not an object'));
        end if;
        if length(coalesce(v_death->>'monster', '')) > 64 then
          perform public.hr_reject('bad_deaths', jsonb_build_object('why', 'monster id too long'));
        end if;
      end loop;
    end if;

    --    introduced by 2026-09-08-hearthfind.sql
    -- (4a-h) THE HEARTHFIND. Shape first, then the catalogue, then the pair.
    if p_delta ? 'hearthfind' then
      v_hf := p_delta->'hearthfind';
      if jsonb_typeof(v_hf) <> 'object' then
        perform public.hr_reject('bad_hearthfind',
          jsonb_build_object('why', 'not an object', 'type', jsonb_typeof(v_hf)));
      end if;
      -- Unknown sub-keys are an error, not a shrug - the same rule the top-level
      -- delta follows. A field this arm does not implement must never look like
      -- it worked (there is deliberately no `one_in`, no `qty` and no `at`:
      -- the odds come from the catalogue and the instant comes from now()).
      if exists (select 1 from jsonb_object_keys(v_hf) as t(hk)
                  where hk <> all (array['item','source_kind','source_id','dropped'])) then
        perform public.hr_reject('bad_hearthfind',
          jsonb_build_object('why', 'unknown key',
            'keys', (select jsonb_agg(hk) from jsonb_object_keys(v_hf) as t(hk)
                      where hk <> all (array['item','source_kind','source_id','dropped']))));
      end if;
      -- `dropped` - THE DISCARD COUNT, VALIDATED LIKE ANY OTHER CLIENT NUMBER
      -- even though it can buy nothing. A second find inside ONE settled span is
      -- thrown away by the engine (hr_apply takes one find per apply and
      -- re-derives it); before this key the discard was SILENT, which is exactly
      -- the shape of a bug nobody can see. It is journalled at (4z-h) as a
      -- rejection row - aggregated per character/code/day by
      -- hr_record_rejection, never one row per event (the game_events lesson).
      if v_hf ? 'dropped' then
        if jsonb_typeof(v_hf->'dropped') <> 'number'
           or (v_hf->>'dropped') !~ '^[0-9]+$'
           or (v_hf->>'dropped')::bigint > 99 then
          perform public.hr_reject('bad_hearthfind',
            jsonb_build_object('why', 'dropped must be a non-negative integer <= 99',
                               'dropped', v_hf->'dropped'));
        end if;
        v_hf_drop := (v_hf->>'dropped')::int;
      else
        v_hf_drop := 0;
      end if;
      v_hf_item := v_hf->>'item';
      v_hf_kind := v_hf->>'source_kind';
      v_hf_src  := v_hf->>'source_id';
      if v_hf_item is null or v_hf_kind is null or v_hf_src is null then
        perform public.hr_reject('bad_hearthfind', jsonb_build_object('why', 'missing field'));
      end if;
      -- Bounded before they are used as lookup keys, so a megabyte string can
      -- never reach an index scan or a rejection payload.
      if length(v_hf_item) > 64 or length(v_hf_kind) > 16 or length(v_hf_src) > 64 then
        perform public.hr_reject('bad_hearthfind', jsonb_build_object('why', 'field too long'));
      end if;
      -- THE PAIR, THE TROPHY AND THE ODDS, ALL IN ONE LOOKUP. A source that does
      -- not exist, a trophy that is not a trophy, and a source paying the WRONG
      -- trophy are one refusal, because they are one question: is this find a
      -- thing the catalogue says can happen?
      select s.one_in, s.expected_hours, i.title_code, i.title_name
        into v_hf_one, v_hf_hours, v_hf_title, v_hf_titlename
        from public.hr_hearthfind_sources s
        join public.hr_hearthfind_items  i on i.item_id = s.item_id
       where s.source_kind = v_hf_kind and s.source_id = v_hf_src and s.item_id = v_hf_item;
      if v_hf_one is null then
        perform public.hr_reject('bad_hearthfind',
          jsonb_build_object('why', 'no such source/item pair',
                             'source_kind', v_hf_kind, 'source_id', v_hf_src, 'item', v_hf_item));
      end if;
      -- THE BAND, re-asserted at RUNTIME and not only at migration time, and
      -- STATED IN HOURS because that is the unit the Designer ruled in: oneIn is
      -- per roll and roll rates span >12x across the shipped sources, so a
      -- per-roll floor said nothing comparable (it is what let the staged goblin
      -- row become the best hearthfind farm in the game). §4(a) proves the
      -- stored rows are in band today; this proves it for THE ROW BEING PAID, so
      -- an out-of-band row that somehow reached the table pays nothing instead
      -- of paying a common trophy.
      if v_hf_hours is null or v_hf_hours < 100 or v_hf_hours > 400 then
        perform public.hr_reject('bad_hearthfind',
          jsonb_build_object('why', 'expected_hours outside the 100-400 band',
                             'expected_hours', v_hf_hours, 'one_in', v_hf_one));
      end if;
    end if;

    --    introduced by 2026-09-08-hearthfind.sql
    -- (4a-h2) THE ONE DOOR. A hearthfind trophy may NOT be minted through the
    -- ordinary `items` delta - not by this engine, not by any future one. The
    -- hearthfind arm is the only path that creates one, and it is the path that
    -- journals and broadcasts, so "broadcast what the ledger journalled" is true
    -- by construction. (A NEGATIVE items delta is untouched: a player may still
    -- spend or lose a trophy through whatever consumes it later.)
    if p_delta ? 'items' and jsonb_typeof(p_delta->'items') = 'object' then
      if exists (
        select 1 from jsonb_each_text(p_delta->'items') as t(ik, iv)
         where coalesce(nullif(iv,'')::bigint, 0) > 0
           and exists (select 1 from public.hr_hearthfind_items h where h.item_id = t.ik)) then
        perform public.hr_reject('bad_hearthfind',
          jsonb_build_object('why', 'a hearthfind trophy cannot be minted through items'));
      end if;
    end if;

    -- ── (4a-b) CONSUMABLE BUFFS ─────────────────────────────────────────
    --    introduced by 2026-09-13-consumable-buffs.sql
    -- The client/engine names an ITEM. Everything else is server-derived:
    --   type, magnitude, duration ← hr_item_buffs (generated from src/data)
    --   until                     ← now() + duration × c_buff_scale, capped
    -- and the merge is by TYPE, never a replace, so a weaker dish cannot dilute a
    -- Feast and a second helping EXTENDS the tail instead of restarting it.
    if p_delta ? 'buff_apply' then
      if jsonb_typeof(p_delta->'buff_apply') <> 'object' then
        perform public.hr_reject('bad_buff_item',
          jsonb_build_object('why', 'not an object',
                             'type', jsonb_typeof(p_delta->'buff_apply')));
      end if;
      -- ⚠ THE FORGERY REFUSAL, BY NAME. A `buff_apply` carrying `until`,
      --   `magnitude`, `type`, `duration_ms` or anything else is REFUSED — not
      --   silently ignored. "Ignored today" is one careless future edit away from
      --   "read tomorrow"; refused by name is a property a reviewer can see and a
      --   test can fire. This is the line that makes the buff clock unforgeable.
      if exists (select 1 from jsonb_object_keys(p_delta->'buff_apply') as t(bk)
                  where t.bk <> 'item') then
        -- bad_buff_shape (Security, 2026-09-13): its OWN code, so the rejections
        -- journal can classify "a caller invented a field" as an INCIDENT without
        -- also flagging every player who ate a Trout. `why` stays for continuity
        -- and the key list stays with it — the same refusal, named honestly.
        perform public.hr_reject('bad_buff_shape',
          jsonb_build_object('why', 'forbidden_key',
            'keys', (select jsonb_agg(t.bk) from jsonb_object_keys(p_delta->'buff_apply') as t(bk)
                      where t.bk <> 'item')));
      end if;
      if jsonb_typeof(p_delta->'buff_apply'->'item') <> 'string' then
        perform public.hr_reject('bad_buff_item',
          jsonb_build_object('why', 'item is not a string',
                             'type', jsonb_typeof(p_delta->'buff_apply'->'item')));
      end if;
      v_buff_item := p_delta->'buff_apply'->>'item';
      select b.type, b.magnitude, b.duration_ms
        into v_buff_type, v_buff_mag, v_buff_dur
        from public.hr_item_buffs b where b.item_id = v_buff_item;
      if not found then
        -- An unknown item id, OR a real item that carries no buff (a Trout, a
        -- bronze sword). One code for both: from the server's side they are the
        -- same statement — "there is no buff to apply for that".
        perform public.hr_reject('bad_buff_item', jsonb_build_object('item', v_buff_item));
      end if;

      -- ── (4a-b2) THE BUFF MUST BE PAID FOR (F3, Security 2026-09-13) ──────
      --    introduced by 2026-09-13-buff-apply-coupling.sql
      -- The SAME delta must spend exactly one of the item. The `items` block above
      -- is the possession check — it takes `for update` on the inventory row and
      -- refuses `insufficient_item` when the stack cannot cover the debit — so this
      -- is a COUPLING, not a second check: the buff and its cost are inseparable
      -- because hr_apply is all-or-nothing.
      --
      -- WHY NOT "does the player own one": a bare existence read is TOCTOU-prone
      -- AND makes the buff free (you would buff off a stack you keep). The debit is
      -- the only form of the question that is both locked and honest.
      --
      -- EXACTLY -1: a buff is one serving. `-2` would mean either a second buff the
      -- merge rules never saw or a double debit; "eat three at once" is a design
      -- change and must arrive as one. coalesce() on every jsonb_typeof because
      -- `null <> 'object'` is NULL, and an `if NULL then` does NOT refuse — the
      -- shape of a check that passes everything while reading like a control.
      if coalesce(jsonb_typeof(p_delta->'items'), '') <> 'object'
         or coalesce(jsonb_typeof(p_delta->'items'->v_buff_item), '') <> 'number'
         or (p_delta->'items'->>v_buff_item)::numeric <> -1 then
        perform public.hr_reject('buff_not_paid',
          jsonb_build_object('item', v_buff_item, 'need', -1,
                             'got', p_delta->'items'->v_buff_item));
      end if;

      v_buff_now := now();                                    -- SERVER CLOCK, always
      v_buff_cap := v_buff_now + make_interval(secs => c_buff_max_ms / 1000.0);
      -- The LIVE entry of this type on the locked row, if any. `until > now()` so
      -- an expired entry cannot extend anything: a buff that ran out yesterday
      -- must not make today's pie last two hours.
      -- PER-SEGMENT STACKING (2026-09-13). The new segment starts at the latest
      -- expiry among live segments of this type that are AT LEAST AS STRONG — so a
      -- weaker dish waits its turn behind the Feast, and a stronger one starts NOW.
      -- `until > v_buff_now` throughout: an expired segment can never extend
      -- anything, or a buff that ran out yesterday would make today's pie last two
      -- hours.
      select max((e.v->>'until')::timestamptz) into v_buff_base
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
       where e.v->>'type' = v_buff_type
         and (e.v->>'until')::timestamptz > v_buff_now
         and (e.v->>'magnitude')::numeric >= v_buff_mag;
      v_buff_base := greatest(v_buff_now, coalesce(v_buff_base, v_buff_now));

      -- THE SEGMENT BUDGET (cost fuse). Counted over LIVE segments of this type
      -- only, so an expired stack costs nothing. A REFUSAL, never a silent drop:
      -- spending food for nothing is the outcome the ruling forbids by name.
      select count(*) into v_buff_segs
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
       where e.v->>'type' = v_buff_type
         and (e.v->>'until')::timestamptz > v_buff_now;
      if v_buff_segs >= c_buff_max_segments then
        perform public.hr_reject('buff_at_max',
          jsonb_build_object('type', v_buff_type, 'why', 'segment_budget',
                             'segments', v_buff_segs, 'limit', c_buff_max_segments));
      end if;

      -- THE TWIN: the segment this one would be contiguous with AND identical to.
      -- A same-magnitude re-eat is ONE longer segment, not two — otherwise a
      -- player topping up the same dish would fill the budget with duplicates of
      -- the same number.
      select e.v into v_buff_same
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
       where e.v->>'type' = v_buff_type
         and (e.v->>'magnitude')::numeric = v_buff_mag
         and (e.v->>'until')::timestamptz = v_buff_base
       limit 1;
      -- ⚠ buff_at_max (game-designer, 2026-09-13). If the cap would swallow (all
      --   but a token sliver of) the duration there is nothing worth buying, so
      --   REFUSE the consume instead of eating the item for nothing. A PARTIAL
      --   clamp still applies — a consume that fits most of the way still buys the
      --   minutes that fit; only one that would buy less than
      --   c_buff_min_gain_frac of what it promises is refused. See the declare
      --   block for why this is a FRACTION and not `base >= cap` (that form is
      --   unreachable outside a single transaction, and it was MEASURED as such).
      -- ── THE CELLAR (2026-09-13 step 3) ───────────────────────────────────
      --    introduced by 2026-09-13-buff-cellar-scale.sql
      -- The duration multiplier this character has EARNED, read here, inside the
      -- lock, from the server's own rows. There is no delta key for it: the shape
      -- check above admits `item` and nothing else, so a caller that invents
      -- `scale` is refused bad_buff_shape before this line is reached.
      --
      -- hr_unlock_levels is the SAME source hr_perks_of builds its `rooms` key
      -- from, so this is not a third truth about what a character owns; it is read
      -- directly rather than through hr_perks_of because that function also
      -- aggregates renown and the recipe gate, none of which is a buff duration,
      -- and this runs on the write path with the row locked.
      select coalesce(max(u.level), 0) into v_buff_rung
        from public.hr_unlock_levels(v_uid, v_slot) u
       where u.unlock_id = 'room:cellar';
      -- `level <= the rung owned`, max: a rung payload REPLACES the rung below it,
      -- the catalogue proves the cellar ladder is contiguous and non-decreasing,
      -- and this form CLAMPS a stored rung above the ladder instead of raising on
      -- the write path. No row, no cellar, no bonus — 0, never null.
      select coalesce(max((rp.perks->>'buffDuration')::numeric), 0) into v_buff_bonus
        from public.hr_room_perks rp
       where rp.room_id = 'cellar' and rp.level <= v_buff_rung;
      -- The fuse, and the floor: a perk may only ever LENGTHEN a buff, so a
      -- negative or absent bonus can never shorten one below the catalogue value.
      v_buff_scale := least(greatest(c_buff_scale * (1 + coalesce(v_buff_bonus, 0)),
                                     c_buff_scale), c_buff_scale_max);
      v_buff_gain := greatest(0, floor(extract(epoch from (v_buff_cap - v_buff_base)) * 1000))::bigint;
      v_buff_need := ceil((v_buff_dur * v_buff_scale) * c_buff_min_gain_frac)::bigint;
      if v_buff_gain < v_buff_need then
        perform public.hr_reject('buff_at_max',
          jsonb_build_object('type', v_buff_type, 'until', v_buff_base,
                             'cap', v_buff_cap, 'max_ms', c_buff_max_ms,
                             'gain_ms', v_buff_gain, 'need_ms', v_buff_need));
      end if;
      -- THE SCALED EXPIRY. The 60-minute ceiling is applied AFTER the scale and is
      -- unchanged by it: a perk lengthens what a consume BUYS, it never raises the
      -- ceiling a queue may stand on.
      v_buff_until := least(v_buff_base
                              + make_interval(secs => (v_buff_dur * v_buff_scale) / 1000.0),
                            v_buff_cap);
      -- THE NEW MAGNITUDE IS THE FOOD'S OWN, and that is the whole ruling:
      -- `max(old, new)` let a 12-gold Roasted Carrot extend a 2,600-gold elixir's
      -- +5% by its own two minutes. A cheap food can now only ever write a cheap
      -- segment.
      v_buff_newmag := v_buff_mag;
      -- THE REBUILT QUEUE — one pass, and the WHERE clause IS the ruling:
      --   · another type                        -> kept if still live, untouched
      --   · this type, magnitude >= the new one  -> kept (the new one is behind it)
      --   · this type, weaker, expiring AFTER the new segment -> kept, it resumes
      --   · this type, weaker, covered by the new segment -> DROPPED (wall-clock:
      --     its time passed while the stronger effect ran)
      --   · the twin from 2b (same magnitude, contiguous) -> dropped here and
      --     re-added below as one EXTENDED segment
      -- ⚠ THIS PREDICATE IS THE ONE PRODUCTION APPLIED, and it stays that way.
      --   A later edit made the second branch re-test the type; the file
      --   early-returns on re-apply, so the edit never reached the database and the
      --   repo stopped matching production (live-hash --codediff: 35 chars). The
      --   applied file's payload must stay byte-honest, so the rewrite lives in
      --   2026-09-13-buff-segments-predicate.sql instead. The two predicates are
      --   EQUIVALENT — proven by execution over the full cross-product in that
      --   file's §4 — so this is a readability/robustness convergence, not a
      --   behaviour change.
      select coalesce(jsonb_agg(e.v order by (e.v->>'until')::timestamptz), '[]'::jsonb)
        into v_buffs_new
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
       where (e.v->>'until')::timestamptz > v_buff_now
         and (((e.v->>'type') <> v_buff_type)
              -- THE SECOND BRANCH RE-TESTS THE TYPE. Logically redundant — the first
              -- disjunct already covers every other-type row, and §4(b) proves the two
              -- forms select identically over the whole cross-product — but the old
              -- form's conditions read as if they applied to EVERY row, so an edit to
              -- the first branch changed other-type handling silently. That is not
              -- hypothetical: tests/buff-queue.mjs's merge_replaces_other_types
              -- mutation was INVISIBLE under the old form and bites under this one.
              or ((e.v->>'type') = v_buff_type
                  and not (v_buff_same is not null and e.v = v_buff_same)
                  and ((e.v->>'magnitude')::numeric >= v_buff_mag
                       or (e.v->>'until')::timestamptz > v_buff_until)));
      -- `scale` is carried on the segment so the player can be TOLD why their buff
      -- is long ("+100% from the Cellar") instead of having to trust a number they
      -- cannot see. It is DISPLAY ONLY: the duration it bought is already inside
      -- `until`, src/core/buffs.js ignores unknown fields, and nothing multiplies
      -- by it — doing so would pay the Cellar twice.
      v_buffs_new := v_buffs_new || jsonb_build_array(jsonb_build_object(
        'type', v_buff_type,
        'magnitude', v_buff_newmag,
        'until', to_jsonb(v_buff_until),
        'scale', to_jsonb(v_buff_scale),
        -- THE SEGMENT'S START (2026-09-28-buff-segment-from.sql, Security F3). The
        -- engine pays a segment only from here on: without it a Feast eaten at the
        -- instant of return priced the whole absence. A same-magnitude re-eat that
        -- extends its twin keeps the twin's start (the segment it lengthens began
        -- then); a twin written before this key existed starts at v_buff_now,
        -- which under-pays at most the settle-first residue, never over-pays.
        'from', to_jsonb(case when v_buff_same is not null
                              then least(v_buff_base,
                                         coalesce((v_buff_same->>'from')::timestamptz, v_buff_now))
                              else v_buff_base end)));
      -- CANONICAL ORDER: the stored array is sorted by expiry, always. Nothing
      -- DEPENDS on it (hr_state_of sorts its own projection and src/core/buffs.js
      -- picks the soonest expiry), which is precisely why it is pinned here: a row
      -- a human reads out of order is a row the next reader indexes wrongly — §3(b3)
      -- below did exactly that on the first draft, because the append put a
      -- just-started stronger segment AFTER an older weaker one.
      select coalesce(jsonb_agg(e.v order by (e.v->>'until')::timestamptz), '[]'::jsonb)
        into v_buffs_new from jsonb_array_elements(v_buffs_new) as e(v);
    end if;

    if p_delta ? 'workers' then
      if jsonb_typeof(p_delta->'workers') <> 'object' then
        perform public.hr_reject('bad_workers', jsonb_build_object('type', jsonb_typeof(p_delta->'workers')));
      end if;
      if (select count(*) from jsonb_object_keys(p_delta->'workers')) > c_max_worker_ops then
        perform public.hr_reject('too_many_worker_ops');
      end if;
      for k, v_eq in select key, value from jsonb_each(p_delta->'workers') loop
        if not exists (select 1 from public.player_workers
                        where user_id = v_uid and slot = v_slot and uid = k) then
          perform public.hr_reject('unknown_worker', jsonb_build_object('uid', k));
        end if;
        -- Each entry is { xp?:int, acc_ms?:number }: an xp DELTA (optional) and
        -- the per-worker fractional carry (an ABSOLUTE, like tool_carry). At least
        -- one must be present or the entry is meaningless.
        if jsonb_typeof(v_eq) <> 'object' or not (v_eq ? 'xp' or v_eq ? 'acc_ms') then
          perform public.hr_reject('bad_workers', jsonb_build_object('uid', k));
        end if;
        v_n := coalesce((v_eq->>'xp')::bigint, 0);
        -- Monotonic and clamped, exactly like a player-skill xp op.
        if v_n < 0 or v_n > c_max_xp_delta then
          perform public.hr_reject('xp_clamp', jsonb_build_object('uid', k));
        end if;
        -- THE CARRY IS RANGE-REFUSED, NEVER CLAMPED. A legit carry is < one
        -- perTickMs (< 130 s); anything at/above c_max_worker_acc is corruption,
        -- and silently repairing an impossible value is how a compromised engine's
        -- bug becomes the server's opinion (the bad_tool_carry / bad_fight posture).
        if v_eq ? 'acc_ms' then
          if jsonb_typeof(v_eq->'acc_ms') <> 'number'
             or (v_eq->>'acc_ms')::double precision < 0
             or (v_eq->>'acc_ms')::double precision >= c_max_worker_acc then
            perform public.hr_reject('bad_worker_carry',
              jsonb_build_object('uid', k, 'acc_ms', v_eq->'acc_ms'));
          end if;
        end if;
        -- xp is a DELTA (added); acc_ms is an ABSOLUTE (set). Absent acc_ms leaves
        -- the stored carry untouched.
        update public.player_workers
           set xp = xp + v_n,
               acc_ms = case when v_eq ? 'acc_ms'
                             then (v_eq->>'acc_ms')::double precision else acc_ms end
         where user_id = v_uid and slot = v_slot and uid = k;
      end loop;
    end if;

    -- ── (4b) THE LEDGER-DERIVED DAILY BUDGET (C5 / X3) ───────────────────
    --    introduced by 2026-08-11-apply-engine.sql
    -- The per-call clamps below are a blast radius for ONE call. Nothing
    -- restricts a compromised engine to one call — hr_rate_gate allows 30
    -- accrues/minute — so without a per-DAY ceiling the reachable rate is
    -- 518 BILLION XP/day, i.e. every skill in the game to 99 every two seconds.
    -- This is the ceiling. Design, numbers and the composition argument against
    -- the b307 per-absence cap: supabase/migrations/2026-08-11-daily-budget.sql.
    --
    -- WHERE IT SITS, AND WHY EXACTLY HERE:
    --   • AFTER the advisory lock and the `for update` above, so the sum and
    --     the row it will insert are inside one serialised critical section for
    --     this character. Two concurrent applies cannot both read a
    --     pre-insert world (hr_day_budget_used is VOLATILE — see its header).
    --   • AFTER the version check, so a stale caller pays `version_conflict`
    --     without a ledger scan.
    --   • AFTER the per-call clamps, and that ordering was decided by a test
    --     rather than by taste. With the budget checked first, the conservation
    --     fuzz's `gold_clamp` op — a deliberate 6.8e9-class delta — came back
    --     `daily_budget`, because the day's gold ceiling (25,000,000) is BELOW
    --     the per-call gold clamp (50,000,000). c_max_gold_delta would have
    --     become unreachable: a control that reads as a control in review and
    --     can never fire. Clamps answer "this ONE delta is insane"; the budget
    --     answers "you have had enough today". The specific diagnosis wins.
    --   • STILL INSIDE the protected block, before the state UPDATE and before
    --     the ledger row, so a breach rolls back everything the earlier blocks
    --     wrote through the same hr_reject/HR000 path as any other rejection.
    --     `daily_budget` never half-applies; the fuzz asserts that by
    --     reconciling after it.
    --   • GROSS inflow only. Netting a spend against a mint would give the
    --     budget a free reset button (mint 25M, buy something, mint again).
    --   • UNCONDITIONAL on journal.kind. `kind` is chosen by the caller; a
    --     budget that only counted kind='accrue' would be evaded by writing
    --     kind='trade'. Real transfers do not pass through hr_apply — market_buy
    --     credits gold itself and leaves gold_in NULL — so honest trading is
    --     not charged for this either.
    v_gold_in := greatest(0, coalesce((p_delta->>'gold')::bigint, 0));
    -- b351. GROSS gem inflow. `greatest(0, …)` is not decoration: a gem SPEND
    -- must not buy back budget, or "mint 5,000, spend them, mint again" is a
    -- reset button on the ceiling. Same reason gold is gross — daily-budget.sql,
    -- "GROSS INFLOW, NOT NET".
    v_gems_in := greatest(0, coalesce((p_delta->>'gems')::bigint, 0));
    -- The typeof guards keep a malformed delta reaching its OWN error below
    -- (bad_xp / bad_items) instead of erroring out of jsonb_each_text here with
    -- an sqlstate the handler does not cover.
    if jsonb_typeof(p_delta->'xp') = 'object' then
      select coalesce(sum(greatest(0, coalesce(nullif(value,'')::bigint, 0))), 0)
        into v_xp_in from jsonb_each_text(p_delta->'xp');
    end if;
    if jsonb_typeof(p_delta->'items') = 'object' then
      select coalesce(sum(greatest(0, coalesce(nullif(value,'')::bigint, 0))), 0)
        into v_qty_in from jsonb_each_text(p_delta->'items');
    end if;
    -- b351. GEMS IS APPENDED LAST rather than inserted next to gold, on
    -- purpose: every existing argument keeps its position, so a stale 5-argument
    -- call site fails LOUDLY with "function does not exist" instead of silently
    -- passing a gem count where an xp count is expected. The 5-argument overload
    -- is dropped in §8 for the same reason — an overload that skips a dimension
    -- is a ceiling somebody can call their way around.
    v_bud := public.hr_day_budget_check(v_uid, v_slot, v_gold_in, v_xp_in, v_qty_in, v_gems_in);
    if v_bud is not null then
      -- The detail carries used / add / limit / dim / day, so a fired fuse is
      -- diagnosable from the response alone. `daily_budget` is on the degrade
      -- ladder's DEGRADABLE list in hr-accrue/index.ts for the same reason
      -- bank_full is: halving the span reduces the proposed inflow, so an
      -- honest accrual that lands on the ceiling costs part of an absence
      -- rather than bricking the watermark.
      perform public.hr_reject('daily_budget', v_bud);
    end if;

    -- ── ACCRUAL WATERMARK (review S19) ───────────────────────────────────
    --    introduced by 2026-08-11-apply-engine.sql
    -- Revision 1 set accrued_to = now() AT APPLY TIME while the ticks had been
    -- computed from the READ time, so every round trip silently confiscated the
    -- elapsed milliseconds between the two — a few hundred per collect, forever.
    -- The caller now states the watermark it actually paid up to, and the server
    -- CLAMPS it into [old, now()]: it can never move backwards (which would pay
    -- the same seconds twice) and never into the future (which would pay for
    -- time that has not happened). "now" remains accepted as shorthand.
    v_accrued := v_st.accrued_to;
    if p_delta ? 'accrued_to' then
      if p_delta->>'accrued_to' = 'now' then
        v_accrued := now();
      else
        v_accrued := (p_delta->>'accrued_to')::timestamptz;
      end if;
      v_accrued := least(now(), greatest(v_st.accrued_to, v_accrued));
    end if;

    -- ── S5 (HALF) — AN EQUIPMENT OR ACTIVITY CHANGE CLOSES THE WINDOW ────
    --    introduced by 2026-08-11-apply-engine.sql
    -- docs/design/server-authority.md §3 "⚠ Under-payment is the only direction
    -- we are wrong in — THAT IS NOT TRUE": the accrual engine prices an absence
    -- with the equipment read at COLLECT time, so logging off naked and putting
    -- on best-in-slot before collecting is paid for the whole night at
    -- best-in-slot rates. Measured on an identical seed and window: 12.8x gold
    -- and 20x XP.
    --
    -- The close is structural rather than a rule the engine has to remember: any
    -- apply that changes equipment or the activity pointer ALSO stamps
    -- accrued_to = now(), so after an equip there is no unpaid window left for
    -- the new gear to be applied to. The exploit is not "detected", it is
    -- arithmetically empty.
    --
    -- ⚠ THE OTHER HALF IS NOT HERE, AND IT IS NOT MINE. This closes the
    --   OVER-payment. It creates a matching UNDER-payment if the engine changes
    --   equipment without collecting first — the elapsed time since the last
    --   watermark is forfeited. The intent surface must therefore COLLECT
    --   BEFORE IT EQUIPS, exactly as start_activity already collects the
    --   previous activity first (design §2, "Where each one runs"). That is a
    --   change in supabase/functions/hr-accrue, not in this file. It is safe to
    --   ship this half alone today ONLY because no client-reachable path can
    --   equip or start an activity yet; it must not stay alone past the first
    --   one that can.
    --
    --   Also still open: the fail-closed `active_since` rule (an activity with a
    --   NULL active_since must not be priced), which lives in accrual.js's
    --   preconditions and is likewise not this file's to make.
    if p_delta ? 'equip' or p_delta ? 'activity' or p_delta ? 'enchant' then
      v_accrued := now();
    end if;

    -- ── (4c) THE DAILY SETTLE STREAK (Slice 3) ───────────────────────────
    --    introduced by 2026-08-21-streak-state.sql
    -- Advanced from now() on any ACCRUAL delta — one that moves the watermark,
    -- i.e. carries `accrued_to`. A live settle, an away collect and a
    -- set_activity collect all carry it; a bare equip / enchant / market intent
    -- does not, and must not bump the streak. NEVER a client value: `d` is
    -- hr_utc_day_key(now()), and the "consecutive?" test compares the STORED day
    -- to hr_utc_day_key(now() - 1 day). There is no `present` field to forge.
    --   · first ever (streak_day_key null/'')  -> 1
    --   · same UTC day as the stored key        -> unchanged (idempotent)
    --   · stored key == yesterday's key         -> +1
    --   · any larger gap                        -> reset to 1
    v_new_streak := v_st.streak_days;
    v_streak_day := v_st.streak_day_key;
    if p_delta ? 'accrued_to' then
      v_streak_day := public.hr_utc_day_key(now());
      if v_st.streak_day_key is null or v_st.streak_day_key = '' then
        v_new_streak := 1;
      elsif v_st.streak_day_key = v_streak_day then
        v_new_streak := v_st.streak_days;
      elsif v_st.streak_day_key = public.hr_utc_day_key(now() - interval '1 day') then
        v_new_streak := v_st.streak_days + 1;
      else
        v_new_streak := 1;
      end if;
    end if;

    -- ── WORK-DAY (1059-company-trades.sql; Tyler 2026-11-22 CR-Q3 b: each hero's town work is capped each day) ────────────────
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
      -- WORK-BLOCKS-MIDNIGHT (1075-work-blocks-midnight.sql): each UTC day's cap is its own. Today's bought work is hr_work_extra_ms;
      -- an earlier day's (a hero still inside yesterday's block at midnight) is hr_work_bought from the window's start, the old watermark.
      v_work := public.hr_work_fold(v_st.work_day, v_st.work_ms, v_st.accrued_to, v_work_end,
                  public.hr_work_base_ms(v_uid, v_slot), public.hr_work_extra_ms(v_uid, v_slot), (now() at time zone 'utc')::date,
                  public.hr_work_bought(v_uid, v_slot, v_st.accrued_to));
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
           -- CONSUMABLE BUFFS (2026-09-13): the queue rebuilt at (4a-b) from the
           -- LOCKED row + the server clock. Absent key = untouched; present = set.
           -- NOT voided by an `activity` key (see 3e).
           buffs = case when p_delta ? 'buff_apply' then v_buffs_new else buffs end,
           hp   = case when p_delta ? 'hp'
                       then greatest(0, least((public.hr_vitals_of(v_uid, v_slot)->>'max_hp')::int, coalesce((p_delta->>'hp')::int, hp)))
                       else hp end,
           active_kind  = coalesce(v_act->>'kind', active_kind),
           active_id    = case when v_act ? 'kind'
                               then nullif(v_act->>'id','') else active_id end,
           -- SECURITY F1 - THE ACTIVITY SWITCH STAMP. `active_since` is the
           -- instant this character started what it is doing NOW, and the
           -- not-in-combat end-cap in hr_credit_kills__ungated /
           -- hr_credit_combat_xp__ungated reads it as the moment a character
           -- STOPPED fighting. It used to move only on the client's `restart`
           -- flag, which the SERVER's own auto-stops do not send: accrual.js
           -- emits delta.activity = {kind:'idle', id:null} for an exhausted
           -- node, a knockout and a refused fight, so the pointer went idle
           -- while active_since stayed at the start of the fight. 12 of 36 live
           -- characters carried active_since < accrued_to on 2026-09-06, and
           -- against the end-cap that under-pays every attended credit until
           -- the next client declare.
           --   Stamp whenever the APPLIED pointer differs from the STORED one
           --   in EITHER field, from ANY caller. Both applied expressions are
           --   copied from this same UPDATE's active_kind / active_id
           --   assignments so the test cannot drift from what is written; a
           --   bare column reference in a SET list reads the OLD row, which is
           --   exactly the comparison wanted. `is distinct from` (not <>)
           --   because active_id is nullable and combat->idle is a transition
           --   TO null. `restart` stays as the first disjunct and keeps its
           --   meaning: re-stamp a SAME-activity restart, which no difference
           --   test can see. Server clock only.
           active_since = case when coalesce((v_act->>'restart')::boolean, false)
                                 or coalesce(v_act->>'kind', active_kind) is distinct from active_kind
                                 or (case when v_act ? 'kind'
                                          then nullif(v_act->>'id','') else active_id end)
                                    is distinct from active_id
                               then now() else active_since end,
           -- ATTENDED-XP SPAN STAMP (2026-09-17). THE SETTLE STATES WHAT IT
           -- JUST PRICED, so hr_credit_combat_xp can top the same span up to the
           -- attended rate ONCE instead of leaving it at the away rate. Three
           -- SERVER values: the OLD watermark (v_st.accrued_to, read under this
           -- function's own `for update`), the NEW one (v_accrued, already
           -- clamped into [old, now()] above), and the COMBAT XP THIS VERY DELTA
           -- IS APPLYING - i.e. what the away simulation paid. Nothing here is
           -- client-supplied: p_delta->'xp' is the ENGINE's proposal, and it is
           -- read only to be SUBTRACTED later, so inflating it can only make the
           -- top-up SMALLER.
           --   Bounds: only a span LONGER than the 180 s settle-first threshold
           --   (a shorter one never produced the refusal this exists to
           --   complete) and NO LONGER THAN ONE HOUR (beyond that the player
           --   genuinely was away and the away price is the right one) is
           --   stamped. EVERY other delta - an equip, a market intent, a short
           --   settle, a settle that moved nothing - sets this to NULL, so a
           --   span cannot outlive the round trip that made it.
           combat_settle_span = case
             when p_delta ? 'accrued_to'
              and v_accrued > v_st.accrued_to
              and floor(extract(epoch from (v_accrued - v_st.accrued_to)) * 1000)::bigint > 180000
              and floor(extract(epoch from (v_accrued - v_st.accrued_to)) * 1000)::bigint <= 3600000
             then jsonb_build_object(
                    'from', v_st.accrued_to,
                    'to',   v_accrued,
                    'sim_xp', (select coalesce(sum(greatest(0, coalesce(nullif(value,'')::bigint, 0))), 0)
                                 from jsonb_each_text(case when jsonb_typeof(p_delta->'xp') = 'object'
                                                           then p_delta->'xp' else '{}'::jsonb end)
                                where key = any(array(select k.skill_id from public.hr_skills k where k.cat = 'combat'))))
             else null end,
           accrued_to   = v_accrued,
           -- WORK-DAY (1059-company-trades.sql): the day this window's work ended in, and the ms of town work done that day.
           work_day     = coalesce((v_work->>'day')::date, work_day),
           work_ms      = coalesce((v_work->>'used_ms')::bigint, work_ms),
           -- worker-settlement slice: the crew's own watermark. Advanced to
           -- now() whenever the delta carries it (the engine sends 'now'); the
           -- value is not trusted — now() is the server clock. Absent = untouched.
           workers_accrued_to = case when p_delta ? 'workers_accrued_to'
                                     then now() else workers_accrued_to end,
           -- Slice 3: the daily settle streak, advanced above from now() on an
           -- accrual delta only. A non-accrual delta leaves both columns as-is.
           streak_days    = case when p_delta ? 'accrued_to' then v_new_streak else streak_days end,
           streak_day_key = case when p_delta ? 'accrued_to' then v_streak_day else streak_day_key end,
           -- b348: an ABSOLUTE, validated at (4a-ii). Absent key = untouched.
           -- BENCH-COUNT: an activity statement sets the run's count (NULL = until
           -- the bag runs out); `active_left` alone counts it down.
           active_left  = case when p_delta ? 'activity' or p_delta ? 'active_left'
                               then v_bench_left else active_left end,
           -- JOB-COUNTS: every activity statement sets the job's whole count and THEN (NULL without); a job the engine ended
           -- leaves its end (hr_work_job_note keeps the three consistent with the pointer).
           active_count = case when p_delta ? 'activity' then v_job_count else active_count end,
           active_next  = case when p_delta ? 'activity' then v_job_next else active_next end,
           job_end      = coalesce(v_job_end, job_end),
           tool_carry   = case when p_delta ? 'tool_carry'
                               then v_carry else tool_carry end,
           -- Phase 0: an ABSOLUTE, validated at (4a-iii). Absent key =
           -- untouched.
           -- ⚠ THE `activity` ARM IS FIRST AND IT IS UNCONDITIONAL. A delta
           --   that changes the activity VOIDS the fight even if it also
           --   carries a `fight` key, so the two cannot be combined into
           --   "switch away and keep the boss". This is the answer to the
           --   exploit question the design names: a player banks a nearly-dead
           --   dragon, switches to slimes, switches back — and the dragon is at
           --   full HP, because the switch that collected the partial also
           --   discarded it. It costs the honest player at most one partial
           --   fight per deliberate re-target.
           fight        = case when p_delta ? 'activity' then '{}'::jsonb
                               when p_delta ? 'fight'    then v_fight
                               else fight end,
           version      = version + 1,
           updated_at   = now()
     where user_id = v_uid and slot = v_slot;

    -- ── THE VOID (Phase 0) — the SECOND, INDEPENDENT half of the rule ────
    --    introduced by 2026-08-17-fight-carry.sql
    -- The CASE above is a statement about the DELTA. This is a statement about
    -- the ROW AS IT NOW STANDS, and it holds no matter which key wrote what: a
    -- fight may survive only while the character is still in combat AND still
    -- facing the same monster. It closes the case the delta arm cannot see —
    -- an activity that was changed by an earlier call, a row left inconsistent
    -- by an admin fix, a future delta key that moves the pointer without using
    -- 'activity'. Two mechanisms, neither load-bearing alone; a reviewer trying
    -- to bank a boss has to defeat both.
    --
    -- It can only ever REMOVE value, so it is safe to run unconditionally. No
    -- version bump: the row is already locked and the UPDATE above bumped it,
    -- and hr_state_of is read AFTER this, so the envelope reflects the void.
    update public.player_state
       set fight = '{}'::jsonb
     where user_id = v_uid and slot = v_slot
       and fight <> '{}'::jsonb
       and (active_kind is distinct from 'combat'
            or (active_id is distinct from (fight->>'monster')
                -- NAMED HUNT: the checkpoint may be on any of THIS hunt's spawns.
                and not exists (select 1 from public.hr_hunt_spawns hs
                                 where hs.hunt_id = player_state.active_id
                                   and hs.monster_id = player_state.fight->>'monster')));

    -- ── JOURNAL ─ ONE row per apply. Per-item rows would multiply the write
    --    introduced by 2026-08-11-apply-engine.sql
    --   volume of an idle game for detail `meta` already carries — and this
    --   repo has the receipt: game_events, 1.6M rows / 229 MB, six players,
    --   four days. A very large delta is summarised rather than stored whole,
    --   so one pathological call cannot write a megabyte.
    --
    --   AND ONE ROW IS NOT ENOUGH IF THE ROW IS HUGE (reliability RL2(b)).
    --   Revision 2 stored `p_delta - 'journal'` — the WHOLE proposed delta, up
    --   to 200 item keys plus farm ops plus progress ops — as meta. Measured
    --   projection: ~2.5× a game_events row, ×2 indexes, 600 MB/day at 600
    --   players. Rebuilding game_events under a new name is exactly the mistake
    --   this comment block was written to prevent.
    --
    --   What is kept is what a ledger is FOR: the value that moved. Gold, gems,
    --   items, xp and equipment transfers are recorded (they are the audit
    --   trail, and they are small — a real accrual apply touches 1-5 item
    --   kinds). Everything else is recorded as a KEY NAME only, because the
    --   authoritative record of it is the row it wrote: farm state is in
    --   player_farm, progress is in player_progress, the activity pointer and
    --   accrued_to are in player_state, and all of them are reachable from this
    --   row's timestamp. `k` is the list of those keys, so the ledger still
    --   says what kind of thing happened.
    v_j    := coalesce(p_delta->'journal', '{}'::jsonb);
    v_kind := coalesce(v_j->>'kind', 'admin');
    if v_kind <> all (c_ledger_kinds) then v_kind := 'admin'; end if;
    v_meta := jsonb_strip_nulls(jsonb_build_object(
      'g',  nullif(coalesce((p_delta->>'gold')::bigint, 0), 0),
      'm',  nullif(coalesce((p_delta->>'gems')::bigint, 0), 0),
      'i',  case when p_delta ? 'items'
                 and (select count(*) from jsonb_object_keys(p_delta->'items')) <= 24
                 then p_delta->'items' end,
      'x',  case when p_delta ? 'xp' then p_delta->'xp' end,
      -- THE LEVEL XP this apply credited (2026-10-27): the hunt fold's Level tally.
      'lx', case when p_delta ? 'level_xp' then p_delta->'level_xp' end,
      'e',  case when p_delta ? 'equip' then p_delta->'equip' end,
      -- THE BUFF SCALE THAT WAS USED, and only when a perk actually moved it
      -- (jsonb_strip_nulls drops the 1.0 case). NOT a new ledger row: one row per
      -- eaten pie is the game_events mistake — 1.6M rows / 229 MB, six players,
      -- four days — repeated at ledger scale. This makes "why was that buff long"
      -- answerable from the append-only journal for ~10 bytes on the applies that
      -- used a perk, and zero on the ones that did not.
      'bs', case when p_delta ? 'buff_apply' and coalesce(v_buff_scale, 1) <> 1
                 then to_jsonb(v_buff_scale) end,
      'k',  (select jsonb_agg(dk order by dk) from jsonb_object_keys(p_delta) as t(dk)
              where dk <> all (array['gold','gems','items','xp','level_xp','equip','journal']))
    ));
    -- If items were too numerous to itemise, say so with an aggregate rather
    -- than dropping the fact that a large transfer happened.
    if p_delta ? 'items' and not (v_meta ? 'i') then
      v_meta := v_meta || jsonb_build_object('i_n',
        (select count(*) from jsonb_object_keys(p_delta->'items')),
        'i_sum', (select sum(coalesce(nullif(value,'')::bigint, 0))
                    from jsonb_each_text(p_delta->'items')));
    end if;
    -- Backstop. Nothing above should be able to reach this, which is why it is
    -- 2 KB and not 8 KB: if it ever fires, the shape has regressed.
    if pg_column_size(v_meta) > 2000 then
      v_meta := jsonb_build_object('summary', true, 'bytes', pg_column_size(p_delta),
        'k', (select jsonb_agg(dk order by dk) from jsonb_object_keys(p_delta) as t(dk)));
    end if;
    -- THE COMPANION XP CAP CLAMPS this apply made (2026-10-12-companion-xp-frac.sql):
    -- an honest edge never reaches the cap clamp, so a `cxc` here is evidence.
    if v_cxp_clamp is not null then
      v_meta := v_meta || jsonb_build_object('cxc', v_cxp_clamp);
    end if;
    -- SKILLS-FROM-STORAGE: what the account's Storage paid of this settle's hearth fuel (the rest left the bag).
    if coalesce(v_skill_take #> '{from,storage}', '{}'::jsonb) <> '{}'::jsonb then
      v_meta := v_meta || jsonb_build_object('st', v_skill_take #> '{from,storage}');
    end if;
    --
    --   THE THREE STAMP COLUMNS ARE THE DAILY BUDGET'S ONLY INPUT. They are
    --   written UNCONDITIONALLY, on every row hr_apply writes, from the same
    --   three variables the check at (4b) was made against — so what was
    --   checked and what is charged cannot disagree. NULL in these columns
    --   means "not written by hr_apply", which is exactly the set of rows
    --   (market_buy's seller credit, market_list's escrow) that must not
    --   consume progression budget.
    insert into public.player_ledger
      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, purse, meta)
    values
      (v_uid, v_slot, v_kind, v_j->>'intent',
       coalesce((p_delta->>'gold')::bigint, 0),
       v_gold_in, v_xp_in, v_qty_in, 0, v_new_gold,
       jsonb_build_object('delta', v_meta) || coalesce(v_j->'meta', '{}'::jsonb));
    -- ACCOUNT WALLET: the credit, journalled by the wallet as its OWN kind='wallet'
    -- row. gems_in lives THERE (0 above), so the account's day budget counts a
    -- gem once; v_gems_in still pre-checked it at (4b).
    if v_new_gems > 0 then
      v_wallet := public.hr_wallet_credit(v_uid, v_slot, v_new_gems,
                    'apply:' || (p_delta #>> '{journal,intent}'), now() + interval '8 days');
    end if;

    if p_delta ? 'deaths' then
      for v_death in select value from jsonb_array_elements(p_delta->'deaths') loop
        insert into public.player_ledger
          (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta)
        values
          (v_uid, v_slot, 'combat', 'death', 0, 0, 0, 0,
           jsonb_build_object(
             'monster',          left(coalesce(v_death->>'monster', ''), 64),
             'deaths_today',     coalesce((v_death->>'deaths_today')::bigint, 0),
             'deaths_lifetime',  coalesce((v_death->>'deaths_lifetime')::bigint, 0),
             'food_in_bag',      coalesce((v_death->>'food_in_bag')::boolean, false)));
      end loop;
    end if;

    if p_delta ? 'hearthfind' then
      --    introduced by 2026-09-08-hearthfind.sql
      -- (0) THE DISCARD, JOURNALLED. If the engine rolled more than one find in
      --     the span it settled, it proposes the first and reports the rest
      --     here. Recorded BEFORE the clamp and unconditionally, because the
      --     question "did a player ever lose a find to the one-per-apply rule?"
      --     must be answerable from the database rather than from an argument
      --     about probability. One aggregated row per character/code/day.
      if coalesce(v_hf_drop, 0) > 0 then
        perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'hearthfind_span_discard',
          jsonb_build_object('dropped', v_hf_drop, 'kept_item', v_hf_item,
                             'kept_source_kind', v_hf_kind, 'kept_source_id', v_hf_src));
      end if;
      -- (i) THE DAILY CLAMP, counted from the append-only journal - the only
      --     durable record - under the character lock. NOTE `now() at time zone
      --     'utc'`: the UTC day, matching the accrual engine's day key, never
      --     the server's local zone and never a client's.
      select count(*) into v_hf_today
        from public.player_ledger
       where user_id = v_uid and slot = v_slot and kind = 'hearthfind'
         and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
      if v_hf_today >= c_max_hf_per_day then
        -- DROPPED, NOT REFUSED. Refusing the apply would cost the player the
        -- whole window's accrual because they got lucky a fourth time. Recorded
        -- so a real ceiling breach is visible tomorrow, not just for a minute.
        perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'hearthfind_daily_cap',
          jsonb_build_object('today', v_hf_today, 'limit', c_max_hf_per_day,
                             'item', v_hf_item, 'source_kind', v_hf_kind, 'source_id', v_hf_src));
      else
        -- (ii) THE TROPHY. One unit, always: there is no quantity anywhere in
        --      this arm to inflate. Same upsert shape as the items delta.
        select qty into v_hf_have from public.player_inventory
          where user_id = v_uid and slot = v_slot and item_id = v_hf_item for update;
        insert into public.player_inventory as pi (user_id, slot, item_id, qty)
          values (v_uid, v_slot, v_hf_item, coalesce(v_hf_have, 0) + 1)
          on conflict (user_id, slot, item_id) do update set qty = excluded.qty;

        -- (ii-b) THE GLOBAL ORDINAL, and it is computed BEFORE the journal row
        --        is written so that "Nth ever found" counts the finds that came
        --        BEFORE this one, plus one. Counting after the insert would make
        --        the same expression mean something different depending on
        --        statement order - the kind of off-by-one a player screenshots.
        --        One index probe on player_ledger_hearthfind_item_idx; the whole
        --        index holds a handful of rows per realm-week.
        -- LIFETIME FACTS OFF THE LEDGER (2026-09-19) - fact 2, the GLOBAL
        -- ORDINAL. ALLOCATED, not counted: `insert ... on conflict do update
        -- ... returning` holds the counter row's lock across the read and the
        -- write, so two characters finding the same trophy in the same instant
        -- cannot both be told they were the Nth. The old body counted
        -- player_ledger, which (i) races and (ii) RESTARTS at the 90-day prune.
        -- Still computed BEFORE the journal row below, so "Nth ever" counts the
        -- finds that came before this one, plus one - the meaning has not moved.
        insert into public.hearthfind_ordinal as o (item_id, found_total, updated_at)
          values (v_hf_item, 1, now())
          on conflict (item_id) do update
            set found_total = o.found_total + 1, updated_at = now()
          returning o.found_total into v_hf_nth;

        -- THE DURABLE FIND ROW. Append-only and never pruned; `unique (item_id,
        -- nth_ever)` makes a duplicate ordinal a constraint violation rather
        -- than a shared bragging moment. This is also fact 1's storage.
        insert into public.hearthfind_log (user_id, slot, item_id, nth_ever)
          values (v_uid, v_slot, v_hf_item, v_hf_nth);

        -- (iii) THE JOURNAL. qty_in = 1 so the trophy enters the daily item
        --       budget like any other granted unit; gold_in/xp_in are ZERO and
        --       stay zero, because a find moves no gold and no XP - which is
        --       what tests/hearthfind-mint-guard.mjs asserts.
        insert into public.player_ledger
          (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, meta)
        values
          (v_uid, v_slot, 'hearthfind', 'hearthfind', v_hf_item, 1, 0, 0, 0, 1,
           jsonb_build_object('item', v_hf_item, 'source_kind', v_hf_kind,
                              'source_id', v_hf_src, 'one_in', v_hf_one,
                              'expected_hours', v_hf_hours,
                              'nth_ever', v_hf_nth,
                              'nth_today', v_hf_today + 1));

        -- (iv) THE BROADCAST, at most one row per 30 s per character. The
        --      trophy and the journal above are already written; only the public
        --      line is suppressed, so a suppressed broadcast never costs value.
        select max(found_at) into v_hf_last from public.world_finds
         where user_id = v_uid and slot = v_slot;
        if v_hf_last is null or v_hf_last < now() - c_hf_broadcast then
          insert into public.world_finds (user_id, slot, item_id, source_kind, source_id, one_in)
            values (v_uid, v_slot, v_hf_item, v_hf_kind, v_hf_src, v_hf_one);
        end if;

        -- (iv-b) THE COSMETICS. THE ONLY THING A FIND PAYS BESIDES THE TROPHY,
        --        and they are cosmetic by construction: player_cosmetics has no
        --        numeric column, nothing joins it to a rate, and no RPC reads it
        --        to decide an outcome. Ruling §6 - "pays a moment and nothing
        --        else": no gold, no XP, no renown, no gems, no stat.
        --
        --        WRITTEN HERE AND ONLY HERE, under the character lock, from the
        --        catalogue lookup above - never from the delta. A duplicate find
        --        re-broadcasts and pays nothing, which is exactly what the
        --        ON CONFLICT DO NOTHING expresses: the unlock is idempotent, so
        --        a replayed apply cannot double-grant and a second Emberheart
        --        cannot re-unlock Emberborn.
        select value into v_hf_plinth   from public.hr_hearthfind_meta where key = 'plinth_code';
        select value into v_hf_settitle from public.hr_hearthfind_meta where key = 'set_title_code';
        select value into v_hf_setname  from public.hr_hearthfind_meta where key = 'set_title_name';
        v_hf_cosm := '[]'::jsonb;

        insert into public.player_cosmetics (user_id, slot, kind, code, name)
          values (v_uid, v_slot, 'title', v_hf_title, v_hf_titlename)
          on conflict (user_id, slot, kind, code) do nothing;
        if found then
          v_hf_cosm := v_hf_cosm || jsonb_build_object('kind','title','code',v_hf_title,'name',v_hf_titlename);
        end if;

        -- THE PLINTH, on the character's FIRST find of any trophy. A flag, not a
        -- count: it unlocks the homestead display, and what stands on it is
        -- derived from the trophies the character holds.
        insert into public.player_cosmetics (user_id, slot, kind, code, name)
          values (v_uid, v_slot, 'plinth', v_hf_plinth, 'Hearth Plinth')
          on conflict (user_id, slot, kind, code) do nothing;
        if found then
          v_hf_cosm := v_hf_cosm || jsonb_build_object('kind','plinth','code',v_hf_plinth,'name','Hearth Plinth');
        end if;

        -- THE FULL SET. Counted as DISTINCT trophies from the append-only
        -- journal (including the row just written) against the catalogue's own
        -- trophy count - never a stored counter, which would be a second copy of
        -- a fact the ledger already holds and would drift on any prune.
        -- LIFETIME FACTS OFF THE LEDGER (2026-09-19) - fact 1, THE SET.
        -- Counted from hearthfind_log, which is not prunable. The old body
        -- counted player_ledger and its comment claimed a stored counter "would
        -- drift on any prune"; the read that drifts is the LEDGER one, and it
        -- would have made the full set unreachable for exactly the veterans who
        -- earned it. This is not a second copy of a fact: it is the FIRST
        -- durable copy, and the ledger keeps journalling beside it.
        select count(distinct item_id) into v_hf_set
          from public.hearthfind_log
         where user_id = v_uid and slot = v_slot;
        select count(*) into v_hf_setneed from public.hr_hearthfind_items;
        if v_hf_set >= v_hf_setneed then
          insert into public.player_cosmetics (user_id, slot, kind, code, name)
            values (v_uid, v_slot, 'title', v_hf_settitle, v_hf_setname)
            on conflict (user_id, slot, kind, code) do nothing;
          if found then
            v_hf_cosm := v_hf_cosm || jsonb_build_object('kind','title','code',v_hf_settitle,'name',v_hf_setname,'set',true);
          end if;
        end if;

        -- (v) THE RECEIPT. Attached to the apply's return value below, so an
        --     AWAY find comes back on the settle receipt and the client can
        --     reveal it on return without a second round trip. Server-authored
        --     in full: every field here was looked up or derived above.
        v_hf_out := jsonb_build_object(
          'item', v_hf_item, 'source_kind', v_hf_kind, 'source_id', v_hf_src,
          'one_in', v_hf_one, 'expected_hours', v_hf_hours,
          'nth_ever', v_hf_nth, 'nth_today', v_hf_today + 1,
          -- WHAT THIS FIND UNLOCKED, so the reveal can say it without a second
          -- round trip and without the client deciding what a find is worth.
          'unlocked', v_hf_cosm,
          'set_complete', (v_hf_set >= v_hf_setneed),
          'broadcast', (v_hf_last is null or v_hf_last < now() - c_hf_broadcast),
          'at', now());
      end if;
    end if;

    -- ── RENOWN: NO RATCHET AND NO JOURNAL ROW (DEAD-WRITES, 2027-03-30-dead-writes.sql) ──
    --    The 2026-09-12 block here raised player_state.renown_high on every apply and journalled each raise, as the audit
    --    trail of the rank claim. That claim was cut on 2026-12-02 and nothing reads the mark or its rows, so neither is
    --    written. The column keeps its last journalled value. A renown that returns is a new design with its own journal.

    -- SETTLE-COST (2027-02-02-settle-cost.sql): inside an instance settle (hr.frame_defer = 'instance', set only by
    -- hr_hunt_apply_instance around its member loop) the caller reads ok / error / replayed of this answer and sends
    -- every member's frame itself from the committed state, so the envelope is not built: { ok, version } instead.
    v_out := case when current_setting('hr.frame_defer', true) = 'instance'
                  then jsonb_build_object('ok', true, 'version', (select ps.version from public.player_state ps
                                                                     where ps.user_id = v_uid and ps.slot = v_slot))
                  else public.hr_state_of(v_uid, v_slot) end;
    -- What the wallet ACTUALLY paid (0 when another hero of the account already
    -- took this grant key), so no receipt can claim gems that did not land.
    if v_wallet is not null then
      v_out := v_out || jsonb_build_object('gems_paid', (v_wallet ->> 'paid')::bigint);
    end if;
    if v_hf_out is not null then
      v_out := jsonb_set(v_out, '{hearthfind}', v_hf_out);
    end if;

  exception
    -- Our own rejections. The block is rolled back; the envelope is built from
    -- the machine code and its detail payload.
    when sqlstate 'HR000' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
      v_out := jsonb_build_object('ok', false, 'error', v_msg)
               || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
    -- A malformed delta that reaches a cast or a constraint. Rolled back and
    -- reported rather than surfacing as a 500 — but NEVER silently: the
    -- sqlstate is returned so a caller bug is diagnosable from the response.
    when invalid_text_representation or invalid_datetime_format
      or numeric_value_out_of_range or division_by_zero
      or check_violation or not_null_violation or foreign_key_violation
      or unique_violation or datatype_mismatch then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_msg = message_text;
      v_out := jsonb_build_object('ok', false, 'error', 'bad_delta',
                                  'sqlstate', v_sqlstate, 'detail', v_msg);
  end;

  -- ── (5) Record the DECISION under the idempotency key. This statement is
  --    introduced by 2026-08-11-apply-engine.sql
  --        OUTSIDE the protected block, so it survives a rejection: a replay of
  --        a rejected intent returns the same rejection instead of re-running
  --        it. Only the decision is stored, never the state envelope (R5, and
  --        the reasoning is at step (3)) — on a success that is literally
  --        `{"ok": true}`.
  --
  --        ── ONE EXCEPTION: A VERSION CONFLICT RELEASES THE KEY (b346) ──────
  --    introduced by 2026-08-15-intent-key-hygiene.sql
  --        "Same key, same answer" is the right contract for a decision about
  --        the DELTA — a clamp, an insufficiency, an unknown id. The caller must
  --        change something, and changing the key is how it says "this is a new
  --        attempt". `version_conflict` is not that. It is a statement about the
  --        caller's READ: nothing was applied, the protected block rolled back
  --        in full, and the DEFINED recovery is "re-read and try again".
  --
  --        Storing it turns an ordinary concurrency outcome into a lockout for
  --        any caller whose key cannot change. Measured on this database
  --        2026-08-15, rolled back:
  --            (1) apply, stale version      -> {ok:false, version_conflict}
  --            (2) retry SAME key, CORRECT   -> {ok:false, version_conflict,
  --                                              replayed:true}
  --            (3) control, NEW key, CORRECT -> {ok:true}
  --        Same delta, same correct version; only the key differed. The accrual
  --        engine's key is DERIVED from (user, slot, watermark, version, salt)
  --        and a rejection does not move the watermark, so before this it could
  --        re-derive a byte-identical, permanently-refused key — for up to 25
  --        hours (hr_intents_prune, 17 * * * *, 24h window). The Edge side
  --        additionally puts `version` in that derivation; this is the half that
  --        also covers the CLIENT-chosen keys, which cannot re-derive anything.
  --
  --        NARROW ON PURPOSE. `v_claimed` means this call inserted the row, so a
  --        rejection returned from step (3) — including an intent_mismatch
  --        against a row recording somebody's SUCCESS — never reaches here and
  --        can never free that row. And only `version_conflict` is released:
  --        every other code is a decision about the delta and deserves the same
  --        answer on the same key.
  if v_claimed
     and coalesce(v_out->>'ok', 'false') <> 'true'
     and (v_out->>'error' = any (c_release_codes)
          -- SKILLS-FROM-STORAGE: a bench-input shortfall counted across the account's SHARED Storage (`storage` in
          -- the detail: only the take above says it) is a statement about the engine's READ, like version_conflict:
          -- another hero moved Storage after it, and this hero's version did not move. Stored, the re-derived key
          -- would replay it for a day; released, the next settle re-reads and pays what is left.
          or (v_out->>'error' = 'insufficient_item' and v_out ? 'storage')) then
    delete from public.player_intents
     where user_id = v_uid and intent_id = p_intent_id;
  else
    update public.player_intents
       set result = case when coalesce(v_out->>'ok','false') = 'true'
                         then jsonb_build_object('ok', true)
                         else v_out end
     where user_id = v_uid and intent_id = p_intent_id;
  end if;

  -- ── (6) THE REJECTION RECORD (review R4). Also outside the protected block,
  --    introduced by 2026-08-11-apply-engine.sql
  --        and that is the entire point: the ledger insert that revision 2
  --        relied on for an audit trail sits INSIDE the block, so a rejection
  --        rolled it back and the only trace of a fired clamp was
  --        player_intents.result — which hr_intents_prune deletes after 24
  --        hours. The design says "treat any rejection as an incident"; an
  --        incident nobody can see the next morning is not one.
  --
  --        hr_record_rejection aggregates per (character, code, day) and
  --        classifies incident vs normal itself, so this is a bounded write —
  --        one UPSERT, not a row per rejection. See player-state.sql §6b-ii for
  --        why that shape and not a log.
  if coalesce(v_out->>'ok', 'false') <> 'true' then
    perform public.hr_record_rejection(
      v_uid, v_slot, coalesce(p_delta #>> '{journal,intent}', 'apply'),
      v_out->>'error', v_out - 'ok' - 'error');
  end if;

  -- ── (7) THE FRAME, FROM THE ENVELOPE THIS CALL ALREADY COMPUTED ────────
  --    introduced by 2026-09-23-frame-emit-from-apply.sql
  --        v_out IS the projection the client applies, built once at the end of
  --        the protected block. The push layer is handed it; it makes no second
  --        projection and re-reads no row, which is the whole of condition 8b.
  --
  --        THE GATE IS THE TRIGGER'S OLD `when` CLAUSE, EXACTLY. Step (4)
  --        refuses unless p_version equals the row's pre-write version, so
  --        `version is distinct from p_version` here is `new.version is
  --        distinct from old.version` there: a refusal, a replay and a write
  --        that moves no version all emit nothing.
  --
  --        AND A PUSH FAILURE MAY NEVER FAIL A PAYMENT. The value is written,
  --        journalled and recorded by the time this runs. hr_frame_send
  --        swallows its own failures; this second handler is what stands
  --        between a raise it could not swallow and a rolled-back payment.
  if coalesce(v_out->>'ok', 'false') = 'true'
     and (v_out->>'version')::bigint is distinct from p_version then
    begin
      perform public.hr_frame_send(v_uid, v_slot, v_out);
    exception when others then
      raise warning 'hr_apply: frame % for %/% not sent (%) — the write is committed anyway',
        v_out->>'version', v_uid, v_slot, sqlerrm;
    end;
  end if;

  return v_out;
end $function$;

-- ── §3 THE TOWN READ AND THE WORK DAY: no restatement here. Both were staged, never applied, so the bench tax's key and the old
--    trades came out of them in place (1048-narrow-town-read.sql, 1059-company-trades.sql: the header's AMENDED IN PLACE)

-- ── §4 THE FARM: THE COMPANY'S FARMING, ON 09'S TABLE ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hr_farm_harvest(p_slot integer, p_plot_idx integer, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- hr_farm_harvest restated WHOLE by 2026-12-14-shared-farm.sql (SHARED-FARM) from the
-- 2026-12-03-daily-claims-cut.sql image: the plot is the ACCOUNT's; the crop, the XP
-- and the day budget are the acting hero's; the roll is the PLANT's; an extra plot
-- (index >= the account's cap) is gone after its harvest.
-- restated WHOLE again by 2027-03-22-dead-plot-deed.sql: the Scarecrow's term leaves the
-- farmYield perk (the plot buildings are cut: nothing could ever grant one, and its
-- catalogue row is gone). The Garden and the companion terms are unchanged.
declare
  v_uid    uuid := auth.uid();
  v_plot   public.account_farm_plots%rowtype;
  v_crop   public.hr_crops%rowtype;
  v_state  public.player_state%rowtype;
  v_grown_h numeric;
  v_seed   bigint;
  v_span   int;
  v_base   bigint;
  v_bonus  bigint;
  v_qty    bigint;
  v_xp     bigint;
  v_withered boolean := false;
  v_regrew   boolean := false;
  v_extra    boolean;
  v_new_count int;
  v_garden_lv int;
  v_cached jsonb;
  v_budget jsonb;
begin
  -- SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql, Security F2). An
  -- unpaid window is priced at the state that existed during it, so nothing that
  -- moves a priced input lands while one is open. Refuses before anything else
  -- and writes nothing to the character. (A nested block, not an exception
  -- block: no subtransaction on the accepted path.)
  declare v_settle jsonb := public.hr_settle_first_noted('farm_harvest', auth.uid(), p_slot);
  begin
    if v_settle is not null then return v_settle; end if;
  end;
  if v_uid is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY (hr_intent_replay).
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_harvest') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_harvest', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_harvest') then
    return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited'));
  end if;

  -- THE ACTING HERO'S ROW LOCK, THEN THE ACCOUNT FARM LOCK: two heroes harvesting one
  -- plot serialise here, and the second reads the plot after the first emptied it.
  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  perform public.hr_farm_lock(v_uid);

  select * into v_plot from public.account_farm_plots
    where user_id = v_uid and plot_idx = p_plot_idx;
  if v_plot.crop_id is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'empty_plot')); end if;
  select * into v_crop from public.hr_crops where crop_id = v_plot.crop_id;
  if v_crop.crop_id is null then return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_crop')); end if;

  -- READINESS: server clock, WATERED growth model. Effective growth can never
  -- exceed 2x elapsed, so watering accelerates but cannot mint.
  v_grown_h := public.hr_farm_growth_hours(v_plot.planted_at, v_plot.waterings, now());
  if v_grown_h < v_crop.base_hours then
    return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'not_ready',
      'ready_at', now() + make_interval(secs => (v_crop.base_hours - v_grown_h) * 3600)));
  end if;

  -- SEEDED base yield roll, tied to this PLANT (its planter, its plot, its plant
  -- instant): which hero harvests cannot re-roll it, a regrow is a fresh roll, a
  -- harvest replay is identical. NOT Math.random.
  v_span := greatest(1, v_crop.yield_max - v_crop.yield_min + 1);
  v_seed := public.hr_seed(v_uid, v_plot.planted_by,
    'farm_harvest:' || p_plot_idx::text || ':' || (extract(epoch from v_plot.planted_at))::bigint::text);
  v_base := v_crop.yield_min + ((v_seed % v_span) + v_span) % v_span;

  -- FLAT farmYield PERK from the SERVER-owned stack: Garden rung (the account's) +
  -- the acting hero's equipped companion, priced from hr_farm_yield_perk. Whole
  -- crops; under-pay only.
  select coalesce(max(level) filter (where unlock_id = 'room:garden'), 0)::int
    into v_garden_lv from public.hr_unlock_levels(v_uid, p_slot);
  v_bonus :=
      coalesce((select farm_yield from public.hr_farm_yield_perk
                 where perk_key = 'garden:' || greatest(0, v_garden_lv)::text), 0)
    + coalesce((select farm_yield from public.hr_farm_yield_perk
                 where v_state.companion_equipped is not null
                   and perk_key = 'companion:' || v_state.companion_equipped), 0);

  v_qty := v_base + greatest(0, v_bonus);
  -- ONE-TOWN-WORK-CUT (1079-one-town-work-cut.sql): Farming is the company's trade on 09's table: one raw unit of work a crop harvested (hr_trade_levers.crop_xp,
  -- src/core/trades.js cropXp), credited to company_trade_xp. It is no hero's XP, so the day budget counts none of it.
  v_xp  := (select l.crop_xp from public.hr_trade_levers l where l.id)::bigint * v_qty;

  -- Daily economy ceiling (NULL = within budget), the acting hero's. Perk is inside the clamp.
  v_budget := public.hr_day_budget_check(v_uid, p_slot, 0, 0, v_qty, 0);
  if v_budget is not null then
    return public.hr_note_rejection('farm_harvest', p_slot, jsonb_build_object('ok', false, 'error', 'day_budget', 'detail', v_budget));
  end if;

  insert into public.player_inventory as inv (user_id, slot, item_id, qty)
    values (v_uid, p_slot, v_crop.prod_item, v_qty)
    on conflict (user_id, slot, item_id) do update set qty = inv.qty + excluded.qty;
  -- the company's XP row last (1073's lock order: ... the purse -> company_trade_xp rows), never read-modify-write
  insert into public.company_trade_xp as x (user_id, trade_id, xp) values (v_uid, 'farming', v_xp)
    on conflict (user_id, trade_id) do update set xp = x.xp + excluded.xp;

  -- AN EXTRA PLOT (past the account's cap: the 2026-12-14 fold kept every crop) is
  -- gone after its harvest. Otherwise the FINITE-PERENNIAL rule: regrow_limit =
  -- regrows one seed buys, regrow_limit+1 total harvests, 0 = no limit.
  v_extra := p_plot_idx >= public.hr_farm_plot_cap(v_uid);
  if v_extra then
    delete from public.account_farm_plots where user_id = v_uid and plot_idx = p_plot_idx;
  elsif v_crop.regrows then
    v_new_count := v_plot.regrow_count + 1;
    if v_crop.regrow_limit > 0 and v_new_count > v_crop.regrow_limit then
      delete from public.account_farm_plots where user_id = v_uid and plot_idx = p_plot_idx;
      v_withered := true;
    else
      update public.account_farm_plots
        set planted_at = now(), waterings = '{}', regrow_count = v_new_count
        where user_id = v_uid and plot_idx = p_plot_idx;
      v_regrew := true;
    end if;
  else
    delete from public.account_farm_plots where user_id = v_uid and plot_idx = p_plot_idx;
  end if;

  -- THE LIFETIME HARVEST COUNT, the acting hero's.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
    values (v_uid, p_slot, 'stat', 'ev:harvest', v_qty, '', 'active')
    on conflict (user_id, slot, kind, key, period_key)
      do update set value = public.player_progress.value + excluded.value,
                    state = 'active', updated_at = now();

  update public.player_state set version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  insert into public.player_ledger
    (user_id, slot, kind, intent, item_id, qty, skill_id, xp, qty_in, xp_in, meta)
    values (v_uid, p_slot, 'farm', 'farm_harvest', v_crop.prod_item, v_qty, null, null,
            v_qty, null, jsonb_build_object('crop', v_plot.crop_id, 'plot', p_plot_idx, 'trade', 'farming', 'trade_xp', v_xp,
                                            'base', v_base, 'perk', v_bonus,
                                            'regrew', v_regrew, 'withered', v_withered,
                                            'regrow_count', v_plot.regrow_count,
                                            'planted_by', v_plot.planted_by, 'extra', v_extra,
                                            'field', 'account'));

  v_cached := jsonb_build_object('ok', true, 'plot', p_plot_idx, 'crop', v_plot.crop_id,
    'produce', v_crop.prod_item, 'qty', v_qty, 'base', v_base, 'perk', v_bonus, 'xp', v_xp,
    'regrew', v_regrew, 'withered', v_withered, 'planted_by', v_plot.planted_by, 'extra', v_extra,
    'regrows_left', case when v_crop.regrows and v_crop.regrow_limit > 0 and not v_extra
                         then greatest(0, v_crop.regrow_limit - (v_plot.regrow_count + 1))
                         else null end);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_harvest', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $function$;

CREATE OR REPLACE FUNCTION public.hr_farm_plant(p_slot integer, p_plot_idx integer, p_crop text, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- hr_farm_plant restated WHOLE by 2026-12-14-shared-farm.sql (SHARED-FARM) from the
-- 2026-12-03-daily-claims-cut.sql image: the plot is the ACCOUNT's (account_farm_plots,
-- under the account farm lock); the seed, the XP and the day budget are the acting hero's.
-- SKILLS-FROM-STORAGE (2027-01-24-skills-from-storage.sql): the seed comes from the hero's
-- bag first, then the account's Storage (hr_materials_take), and the hero's advisory lock
-- is taken first (hr_materials_take's order; after the row lock it would invert hr_apply's).
declare
  c_max_plots constant int := 128;  -- the table's index fuse; the account's cap is finer
  c_plant_xp  constant int := 0;    -- ONE-TOWN-WORK-CUT (1079-one-town-work-cut.sql): a plant pays no XP (the company's Farming is paid a crop harvested)
  v_uid   uuid := auth.uid();
  v_crop  public.hr_crops%rowtype;
  v_state public.player_state%rowtype;
  v_farm_lv int;
  v_have  bigint;
  v_budget jsonb;
  v_cached jsonb;
  v_crop_tier int;
  v_plot_cap  int;
  v_plot_level int;
  v_by    int;
  v_take  jsonb;
begin
  if v_uid is null then return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY (hr_intent_replay is the one
  -- copy of the rule). A NULL answer means "no cached decision".
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_plant') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_plant', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_plant') then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited'));
  end if;

  if p_plot_idx is null or p_plot_idx < 0 or p_plot_idx >= c_max_plots then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'bad_plot'));
  end if;
  select * into v_crop from public.hr_crops where crop_id = p_crop;
  if v_crop.crop_id is null then return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_crop')); end if;

  -- THE LOCK ORDER (one order for every write an account shares): the acting HERO (its
  -- advisory key, then its row) -> the account FARM key -> (hr_materials_take) the account
  -- DEPOT key -> the bag row -> the Storage row. No purse here.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_slot::text, 0));
  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  perform public.hr_farm_lock(v_uid);

  -- THE ACCOUNT'S FIELD SIZE: the property ladder plus the Garden's beds.
  v_plot_cap := public.hr_farm_plot_cap(v_uid);
  if p_plot_idx >= v_plot_cap then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'plot_cap', 'cap', v_plot_cap));
  end if;

  -- Farming LEVEL gate, the acting hero's, re-derived from server XP.
  v_farm_lv := public.hr_trade_level_of(v_uid, 'farming');   -- ONE-TOWN-WORK-CUT (1079-one-town-work-cut.sql): the company's Farming on 09's table
  if v_farm_lv < v_crop.req_lv then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'level_too_low', 'req_lv', v_crop.req_lv));
  end if;

  -- CROP PLOT-TIER gate: crop.plot_tier must be <= the ACCOUNT's plot tier.
  select plot_tier into v_crop_tier from public.hr_crop_plot_tier where crop_id = p_crop;
  if v_crop_tier is null then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'crop_untiered'));
  end if;
  v_plot_level := public.hr_farm_plot_level(v_uid);
  if v_crop_tier > v_plot_level then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'plot_tier_locked',
      'need_plot_level', v_crop_tier, 'have_plot_level', v_plot_level));
  end if;

  select planted_by into v_by from public.account_farm_plots where user_id = v_uid and plot_idx = p_plot_idx;
  if found then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'plot_occupied', 'by', v_by));
  end if;

  -- Day-budget clamp on the plant XP (same ceiling the accrual engine answers to).
  v_budget := public.hr_day_budget_check(v_uid, p_slot, 0, c_plant_xp::bigint, 0, 0);
  if v_budget is not null then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'day_budget', 'detail', v_budget));
  end if;

  -- ONE SEED: the ACTING hero's bag first, then the account's Storage (hr_materials_take: decided
  -- whole before it writes; a stack that reaches 0 is deleted). Refused having written nothing.
  v_take := public.hr_materials_take(v_uid, p_slot, jsonb_build_object(v_crop.seed_item, 1), true);
  if coalesce(v_take ->> 'ok', '') <> 'true' then
    return public.hr_note_rejection('farm_plant', p_slot, jsonb_build_object('ok', false, 'error', 'insufficient_seed', 'seed', v_crop.seed_item)
      || jsonb_build_object('have', coalesce((v_take ->> 'have')::bigint, 0), 'need', 1,
                            'bag', coalesce((v_take ->> 'bag')::bigint, 0), 'storage', coalesce((v_take ->> 'storage')::bigint, 0)));
  end if;

  -- Fresh plant on the account's field: DRY, not a regrow. A plain insert behind the
  -- occupied check under the farm lock: a lock defect fails loud, never overwrites a crop.
  insert into public.account_farm_plots (user_id, plot_idx, crop_id, planted_at, waterings, regrow_count, planted_by)
    values (v_uid, p_plot_idx, p_crop, now(), '{}', 0, p_slot);

  -- The LIFETIME plant count (kind 'stat', period ''), the acting hero's.
  insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
    values (v_uid, p_slot, 'stat', 'ev:planted', 1, '', 'active')
    on conflict (user_id, slot, kind, key, period_key)
      do update set value = public.player_progress.value + excluded.value,
                    state = 'active', updated_at = now();

  update public.player_state set version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, skill_id, xp, xp_in, meta)
    values (v_uid, p_slot, 'farm', 'farm_plant', v_crop.seed_item, -1, null, null, null,
            jsonb_build_object('crop', p_crop, 'plot', p_plot_idx, 'field', 'account', 'from', v_take -> 'from'));

  v_cached := jsonb_build_object('ok', true, 'plot', p_plot_idx, 'crop', p_crop,
    'planted_at', now(), 'ready_at', now() + make_interval(secs => v_crop.base_hours * 3600),
    'seed_spent', v_crop.seed_item, 'plant_xp', c_plant_xp, 'from', v_take -> 'from');
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_plant', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $function$;

CREATE OR REPLACE FUNCTION public.hr_farm_water(p_slot integer, p_plot_idx integer, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- hr_farm_water restated WHOLE by 2026-12-14-shared-farm.sql (SHARED-FARM) from the
-- 2026-09-12 image: the plot is the ACCOUNT's; the watering XP is the acting hero's.
declare
  c_max_waterings constant int := 8;
  c_window_secs   constant numeric := 2 * 3600;
  v_uid    uuid := auth.uid();
  v_plot   public.account_farm_plots%rowtype;
  v_crop   public.hr_crops%rowtype;
  v_state  public.player_state%rowtype;
  v_last   timestamptz;
  v_water_xp bigint;
  v_budget jsonb;
  v_cached jsonb;
begin
  if v_uid is null then return public.hr_note_rejection('farm_water', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY (hr_intent_replay).
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_water') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_water', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_water') then
    return public.hr_note_rejection('farm_water', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited'));
  end if;

  -- THE ACTING HERO'S ROW LOCK, THEN THE ACCOUNT FARM LOCK.
  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('farm_water', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  perform public.hr_farm_lock(v_uid);

  select * into v_plot from public.account_farm_plots
    where user_id = v_uid and plot_idx = p_plot_idx;
  if v_plot.crop_id is null then return public.hr_note_rejection('farm_water', p_slot, jsonb_build_object('ok', false, 'error', 'empty_plot')); end if;
  select * into v_crop from public.hr_crops where crop_id = v_plot.crop_id;
  if v_crop.crop_id is null then return public.hr_note_rejection('farm_water', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_crop')); end if;

  if public.hr_farm_growth_hours(v_plot.planted_at, v_plot.waterings, now()) >= v_crop.base_hours then
    return public.hr_note_rejection('farm_water', p_slot, jsonb_build_object('ok', false, 'error', 'already_ready'));
  end if;
  if coalesce(array_length(v_plot.waterings, 1), 0) >= c_max_waterings then
    return public.hr_note_rejection('farm_water', p_slot, jsonb_build_object('ok', false, 'error', 'water_capped'));
  end if;
  select max(w) into v_last from unnest(coalesce(v_plot.waterings, '{}'::timestamptz[])) as w;
  if v_last is not null and v_last + make_interval(secs => c_window_secs) > now() then
    return public.hr_note_rejection('farm_water', p_slot, jsonb_build_object('ok', false, 'error', 'still_watered',
      'ready_at', v_last + make_interval(secs => c_window_secs)));
  end if;

  v_water_xp := 0;   -- ONE-TOWN-WORK-CUT (1079-one-town-work-cut.sql): watering pays no XP (the company's Farming is paid a crop harvested); it still speeds the crop
  v_budget := public.hr_day_budget_check(v_uid, p_slot, 0, v_water_xp, 0, 0);
  if v_budget is not null then
    return public.hr_note_rejection('farm_water', p_slot, jsonb_build_object('ok', false, 'error', 'day_budget', 'detail', v_budget));
  end if;

  update public.account_farm_plots
    set waterings = array_append(waterings, now())
    where user_id = v_uid and plot_idx = p_plot_idx;

  update public.player_state set version = version + 1, updated_at = now()
    where user_id = v_uid and slot = p_slot;

  insert into public.player_ledger (user_id, slot, kind, intent, skill_id, xp, xp_in, meta)
    values (v_uid, p_slot, 'farm', 'farm_water', null, null, null,
            jsonb_build_object('crop', v_plot.crop_id, 'plot', p_plot_idx, 'planted_by', v_plot.planted_by, 'field', 'account'));

  v_cached := jsonb_build_object('ok', true, 'plot', p_plot_idx, 'crop', v_plot.crop_id,
    'watered_at', now(), 'water_xp', v_water_xp,
    'window_closes', now() + make_interval(secs => c_window_secs));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_water', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $function$;

CREATE OR REPLACE FUNCTION public.hr_farm_upgrade_plot(p_slot integer, p_idem uuid, p_expect_level integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- hr_farm_upgrade_plot restated WHOLE by 2026-12-14-shared-farm.sql (SHARED-FARM) from
-- the 2026-10-04-expected-level-idempotency.sql image: the tier is the ACCOUNT's
-- (account_farm, under the account farm lock); the Farming gate and the deeds are the
-- acting hero's; the gold is hr_farm_purse_pay's.
-- restated WHOLE again by 2027-03-22-dead-plot-deed.sql: GOLD ONLY. The Farmer's Deed left
-- the catalogue with every source it had (2026-10-23), so its fallback payment, its debit,
-- its refusal fields and its journal arm are cut, and the tier's price is read without the
-- deed column the farm catalogue drops. Every gate, lock, refusal and the idempotency are
-- unchanged.
declare
  v_uid   uuid := auth.uid();
  v_state public.player_state%rowtype;
  v_level int;
  v_next  int;
  v_gold  bigint;
  v_reqlv int;
  v_farmlv int;
  v_xp    bigint;
  v_purse jsonb;
  v_cached jsonb;
begin
  if v_uid is null then return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY — and it is checked
  -- BEFORE the expected level: a retry of a gesture that already landed must
  -- get its own cached answer back, not a stale_level for the rung it bought.
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_upgrade_plot') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_upgrade_plot', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_plant') then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited'));
  end if;

  -- THE EXPECTED RUNG IS REQUIRED. Before the lock: a call that cannot be
  -- judged must not first serialise the character behind it.
  if p_expect_level is null then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'missing_expect'));
  end if;

  -- THE ACTING HERO'S ROW LOCK, THEN THE ACCOUNT FARM LOCK.
  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  perform public.hr_farm_lock(v_uid);

  -- A SECOND INTENT FOR THE SAME RUNG IS STALE (2026-10-04), from ANY hero of the
  -- account: read under the farm lock, so the first of two concurrent intents lands
  -- and the second sees its write. `plot_level` is the account's CURRENT tier.
  v_level := public.hr_farm_plot_level(v_uid);
  if p_expect_level <> v_level + 1 then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'stale_level',
      'plot_level', v_level, 'expect_level', p_expect_level));
  end if;

  v_next := v_level + 1;
  select gold_cost, req_farm_level into v_gold, v_reqlv
    from public.hr_plot_tier where plot_level = v_next;
  if not found then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'max_plot_level', 'plot_level', v_level));
  end if;
  -- FAIL CLOSED ON AN UNPRICED RUNG (a rung above the first that costs no gold is a
  -- mistake, never an offer).
  if v_next > 1 and coalesce(v_gold, 0) = 0 then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'tier_unpriced', 'plot_level', v_next));
  end if;

  -- THE PACING GATE. The acting hero's Farming level, from the server's own XP.
  v_farmlv := public.hr_trade_level_of(v_uid, 'farming');   -- ONE-TOWN-WORK-CUT (1079-one-town-work-cut.sql): the company's Farming on 09's table
  if v_farmlv < coalesce(v_reqlv, 1) then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'farm_level_too_low',
      'need', v_reqlv, 'have', v_farmlv, 'plot_level', v_next));
  end if;

  -- THE PAYMENT: the tier's gold, through the farm's one purse, which debits it
  -- atomically or refuses and moves nothing.
  v_purse := public.hr_farm_purse_pay(v_uid, p_slot, coalesce(v_gold, 0));
  if coalesce(v_purse ->> 'ok', '') <> 'true' then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'cannot_afford',
      'need_gold', coalesce(v_gold, 0), 'have_gold', (v_purse ->> 'gold')::bigint, 'plot_level', v_next));
  end if;

  -- THE ACCOUNT'S TIER moves one rung, predicated on the rung read under the lock.
  insert into public.account_farm as a (user_id, plot_level, updated_at)
    values (v_uid, v_next, now())
    on conflict (user_id) do update set plot_level = excluded.plot_level, updated_at = now()
      where a.plot_level = v_level;
  if not found then
    raise exception 'hr_farm_upgrade_plot: the account tier moved under the farm lock (expected %)', v_level; end if;

  update public.player_state set version = version + 1, updated_at = now()
   where user_id = v_uid and slot = p_slot;

  -- THE JOURNAL. One row per upgrade on the acting hero; the gold spent, negative.
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, meta)
    values (v_uid, p_slot, 'farm', 'farm_upgrade_plot', null, 0, -coalesce(v_gold, 0),
            jsonb_build_object('plot_level', v_next, 'paid_with', 'gold',
                               'farm_level', v_farmlv, 'purse', v_purse ->> 'purse', 'field', 'account'));

  v_cached := jsonb_build_object('ok', true, 'plot_level', v_next,
    'paid_with', 'gold',
    'gold_spent', coalesce(v_gold, 0),
    'gold', (v_purse ->> 'gold')::bigint);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_upgrade_plot', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $function$;

CREATE OR REPLACE FUNCTION public.hr_farm_tend_plan(p_user uuid, p_slot integer, p_crop text, p_purse bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
-- hr_farm_tend_plan (1017-tend-the-field.sql): what "Tend the field" does on p_user's field for hero p_slot NOW, by the
-- server clock, read only. Every rule is the farm verbs' own: readiness and watering are hr_farm_harvest's and
-- hr_farm_water's tests, a regrow is the harvest's rule, the gates are hr_farm_plant's, the seed comes from the bag, then
-- Storage, then the Shop's lowest `seed` row while the account purse covers it. See the file header for the answer.
declare
  c_window_s      constant numeric := 2 * 3600;   -- hr_farm_water's window
  c_max_waterings constant int := 8;              -- hr_farm_water's cap
  v_cap     int;
  v_plot_lv int;
  v_farm_lv int;
  v_left    bigint;                 -- the account purse, less what this plan has priced so far
  v_pick    public.hr_crops%rowtype;
  v_c       public.hr_crops%rowtype;
  v_tier    int;
  r         record;
  k         int;
  v_harvest int[] := '{}';
  v_water   int[] := '{}';
  v_sow_i   int[] := '{}';
  v_sow_c   text[] := '{}';
  v_plant   jsonb := '[]'::jsonb;
  v_empty   jsonb := '[]'::jsonb;
  v_lines   jsonb := '{}'::jsonb;   -- seed -> its line, made on first use
  v_l       jsonb;
  v_price   bigint;
begin
  if p_user is null or p_slot is null then return jsonb_build_object('ok', false, 'error', 'bad_args'); end if;
  if not exists (select 1 from public.player_state where user_id = p_user and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  v_cap     := public.hr_farm_plot_cap(p_user);
  v_plot_lv := public.hr_farm_plot_level(p_user);
  v_farm_lv := public.hr_trade_level_of(p_user, 'farming');   -- ONE-TOWN-WORK-CUT (1079-one-town-work-cut.sql): the company's Farming on 09's table
  v_left    := coalesce(p_purse, 0);      -- the purse as the caller read it (§1)

  -- THE PLAYER'S CHOSEN CROP: a catalogue crop this hero can plant now, or the plan refuses whole.
  if p_crop is not null then
    select * into v_pick from public.hr_crops where crop_id = p_crop;
    if v_pick.crop_id is null then return jsonb_build_object('ok', false, 'error', 'unknown_crop'); end if;
    if v_farm_lv < v_pick.req_lv then
      return jsonb_build_object('ok', false, 'error', 'level_too_low', 'req_lv', v_pick.req_lv); end if;
    select t.plot_tier into v_tier from public.hr_crop_plot_tier t where t.crop_id = p_crop;
    if v_tier is null then return jsonb_build_object('ok', false, 'error', 'crop_untiered'); end if;
    if v_tier > v_plot_lv then
      return jsonb_build_object('ok', false, 'error', 'plot_tier_locked', 'need_plot_level', v_tier, 'have_plot_level', v_plot_lv); end if;
  end if;

  -- (1) EVERY PLANTED PLOT, in index order.
  for r in
    select f.plot_idx as i, f.crop_id as crop, f.regrow_count, c.regrows, c.regrow_limit,
           c.base_hours - public.hr_farm_growth_hours(f.planted_at, f.waterings, now()) as rem_h,
           coalesce(array_length(f.waterings, 1), 0) as n_w,
           (select max(w) from unnest(f.waterings) w) as last_w
      from public.account_farm_plots f
      join public.hr_crops c on c.crop_id = f.crop_id
     where f.user_id = p_user
     order by f.plot_idx
  loop
    if r.rem_h <= 0 then
      v_harvest := v_harvest || r.i;
      if r.i >= v_cap then
        null;                                     -- an extra plot is gone after its harvest
      elsif r.regrows and (r.regrow_limit = 0 or r.regrow_count + 1 <= r.regrow_limit) then
        v_water := v_water || r.i;                -- the vine stays: the harvest set it growing again, dry
      else
        v_sow_i := v_sow_i || r.i;                -- emptied by the harvest (a vine on its last harvest withers)
        v_sow_c := v_sow_c || coalesce(p_crop, r.crop);
      end if;
    elsif r.n_w < c_max_waterings and (r.last_w is null or r.last_w + make_interval(secs => c_window_s) <= now()) then
      v_water := v_water || r.i;
    end if;
  end loop;

  -- (2) EVERY EMPTY PLOT INSIDE THE FIELD: the chosen crop goes in; with none chosen there is nothing to remember.
  for k in select g from generate_series(0, v_cap - 1) g
            where not exists (select 1 from public.account_farm_plots f where f.user_id = p_user and f.plot_idx = g)
            order by g
  loop
    if p_crop is not null then
      v_sow_i := v_sow_i || k; v_sow_c := v_sow_c || p_crop;
    else
      v_empty := v_empty || jsonb_build_object('i', k, 'crop', null, 'why', 'unplanted');
    end if;
  end loop;

  -- (3) EACH PLOT TO PLANT, in index order: the hero's gates, then one seed (bag, Storage, then bought while the purse covers it).
  for r in select s.i, s.crop from unnest(v_sow_i, v_sow_c) as s(i, crop) order by s.i loop
    select * into v_c from public.hr_crops where crop_id = r.crop;
    select t.plot_tier into v_tier from public.hr_crop_plot_tier t where t.crop_id = r.crop;
    if v_farm_lv < v_c.req_lv then
      v_empty := v_empty || jsonb_build_object('i', r.i, 'crop', r.crop, 'why', 'level_too_low', 'need', v_c.req_lv);
      continue; end if;
    if v_tier is null or v_tier > v_plot_lv then
      v_empty := v_empty || jsonb_build_object('i', r.i, 'crop', r.crop, 'why', 'plot_tier_locked', 'need', v_tier);
      continue; end if;
    v_l := v_lines -> v_c.seed_item;
    if v_l is null then
      v_l := jsonb_build_object('seed', v_c.seed_item, 'crop', r.crop, 'use', 0, 'bag', 0, 'storage', 0, 'buy', 0, 'gold', 0,
        'price', (select o.price from public.hr_shop_supply_offers o
                   where o.kind = 'seed' and o.item_id = v_c.seed_item order by o.price, o.offer_id limit 1),
        'bag_held', coalesce((select i.qty from public.player_inventory i
                               where i.user_id = p_user and i.slot = p_slot and i.item_id = v_c.seed_item), 0),
        'storage_held', coalesce((select b.qty from public.account_bank b
                                   where b.user_id = p_user and b.item_id = v_c.seed_item), 0));
    end if;
    v_price := (v_l ->> 'price')::bigint;
    if (v_l ->> 'bag')::bigint < (v_l ->> 'bag_held')::bigint then
      v_l := v_l || jsonb_build_object('bag', (v_l ->> 'bag')::bigint + 1);
    elsif (v_l ->> 'storage')::bigint < (v_l ->> 'storage_held')::bigint then
      v_l := v_l || jsonb_build_object('storage', (v_l ->> 'storage')::bigint + 1);
    elsif coalesce(v_price, 0) <= 0 then
      v_empty := v_empty || jsonb_build_object('i', r.i, 'crop', r.crop, 'why', 'no_seed_for_sale', 'seed', v_c.seed_item);
      v_lines := v_lines || jsonb_build_object(v_c.seed_item, v_l);
      continue;
    elsif v_left >= v_price then
      v_l := v_l || jsonb_build_object('buy', (v_l ->> 'buy')::bigint + 1, 'gold', (v_l ->> 'gold')::bigint + v_price);
      v_left := v_left - v_price;
    else
      v_empty := v_empty || jsonb_build_object('i', r.i, 'crop', r.crop, 'why', 'cannot_afford', 'seed', v_c.seed_item, 'price', v_price);
      v_lines := v_lines || jsonb_build_object(v_c.seed_item, v_l);
      continue;
    end if;
    v_l := v_l || jsonb_build_object('use', (v_l ->> 'use')::bigint + 1);
    v_lines := v_lines || jsonb_build_object(v_c.seed_item, v_l);
    v_plant := v_plant || jsonb_build_object('i', r.i, 'crop', r.crop);
    v_water := v_water || r.i;                    -- a fresh planting is dry
  end loop;

  return jsonb_build_object('ok', true, 'crop', p_crop,
    'harvest', to_jsonb(v_harvest),
    'plant', v_plant,
    'water', (select coalesce(jsonb_agg(w order by w), '[]'::jsonb) from unnest(v_water) w),
    'empty', (select coalesce(jsonb_agg(e order by (e ->> 'i')::int), '[]'::jsonb) from jsonb_array_elements(v_empty) e),
    'seeds', (select coalesce(jsonb_agg(x.l - 'bag_held' - 'storage_held' order by x.k), '[]'::jsonb)
                from jsonb_each(v_lines) as x(k, l) where (x.l ->> 'use')::int > 0),
    'gold', (select coalesce(sum((x.l ->> 'gold')::bigint), 0) from jsonb_each(v_lines) as x(k, l)));
end $function$;

CREATE OR REPLACE FUNCTION public.hr_farm_tend_view(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
-- hr_farm_tend_view (1017-tend-the-field.sql): the `farm_tend` section. The plan with no crop chosen, and one compact
-- bill per crop this hero can plant now, priced only when the default plants a plot or leaves one empty.
declare
  v jsonb;
  p jsonb;
  r record;
  v_choices jsonb := '[]'::jsonb;
  v_farm_lv int;
  v_plot_lv int;
  -- the account purse, read ONCE an envelope (as hr_state_of reads it) and handed to every plan priced below (§1)
  v_purse   bigint := coalesce((select w.gold from public.account_wallet w where w.user_id = p_user), 0);
begin
  v := public.hr_farm_tend_plan(p_user, p_slot, null, v_purse);
  if v is null or coalesce(v ->> 'ok', '') <> 'true' then return null; end if;
  if jsonb_array_length(v -> 'plant') + jsonb_array_length(v -> 'empty') > 0 then
    v_farm_lv := public.hr_trade_level_of(p_user, 'farming');   -- ONE-TOWN-WORK-CUT (1079-one-town-work-cut.sql): the company's Farming on 09's table
    v_plot_lv := public.hr_farm_plot_level(p_user);
    for r in select c.crop_id, c.seed_item from public.hr_crops c join public.hr_crop_plot_tier t on t.crop_id = c.crop_id
              where c.req_lv <= v_farm_lv and t.plot_tier <= v_plot_lv
              order by c.req_lv, c.crop_id
    loop
      p := public.hr_farm_tend_plan(p_user, p_slot, r.crop_id, v_purse);
      continue when coalesce(p ->> 'ok', '') <> 'true';
      v_choices := v_choices || jsonb_build_object('crop', r.crop_id,
        'plant', jsonb_array_length(p -> 'plant'), 'water', jsonb_array_length(p -> 'water'),
        'bag', (select coalesce(sum((l ->> 'bag')::bigint), 0) from jsonb_array_elements(p -> 'seeds') l),
        'storage', (select coalesce(sum((l ->> 'storage')::bigint), 0) from jsonb_array_elements(p -> 'seeds') l),
        'buy', (select coalesce(sum((l ->> 'buy')::bigint), 0) from jsonb_array_elements(p -> 'seeds') l),
        'gold', (p ->> 'gold')::bigint,
        'price', (select o.price from public.hr_shop_supply_offers o
                   where o.kind = 'seed' and o.item_id = r.seed_item order by o.price, o.offer_id limit 1),
        'empty', (select coalesce(jsonb_agg(e -> 'i' order by (e ->> 'i')::int), '[]'::jsonb) from jsonb_array_elements(p -> 'empty') e),
        'why', p -> 'empty' -> 0 ->> 'why');
    end loop;
  end if;
  return (v - 'ok' - 'crop') || jsonb_build_object('choices', v_choices);
end $function$;

-- ── §5 THE READERS OF THE OLD TRADES ─────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hr_market_eligible(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select exists (select 1 from public.player_state ps cross join public.hr_market_config c
                  where ps.user_id = p_user and public.hr_char_level(ps.level_xp) >= c.min_level)
      -- ONE-TOWN-WORK-CUT (1079-one-town-work-cut.sql): the maker's door reads the company's making trades (a trade with a refine or make kind) on 09's table
      or exists (select 1 from public.company_trade_xp x cross join public.hr_market_config c
                  where x.user_id = p_user and public.hr_trade_level(x.xp) >= c.min_skill_level
                    and exists (select 1 from public.hr_trade_kinds k where k.trade = x.trade_id and k.stage <> 'gather'))
$function$;

CREATE OR REPLACE FUNCTION public.hr_lb_skills()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select array[
    -- ONE-TOWN-WORK-CUT (1079-one-town-work-cut.sql): the eight old trades leave (trade Levels are the company's, on 09's table: the trade_jobs section)
    'melee','ranged','magic','defense','inner_flame','stonemason','bountyHunter'
  ]
$function$;


-- ── §6 THE OLD TRADES' SKILL ROWS, JOURNALLED, AND THE POINTERS (nothing converts: 09 4.11 row 1, 4.12 server row) ─────────────
-- Every player_skills row whose skill hr_skills no longer has leaves, one `admin` ledger row an account (intent one_town_work_cut, the
-- XP removed by skill). Refused while ANY catalogue skill a hero still needs is missing: the combat skills and Inner Flame must be there,
-- so an empty or broken hr_skills can never read as "every skill left". A retried apply finds nothing and writes nothing.
do $mig$
declare r record; v_skills jsonb; v_slot int; v_accts int := 0;
begin
  if (select count(*) from public.hr_skills k where k.skill_id in ('melee', 'ranged', 'magic', 'defense', 'inner_flame')) <> 5 then
    raise exception 'PRECONDITION: hr_skills lacks a combat skill or Inner Flame; refusing to read it as the list of skills that left'; end if;
  for r in select distinct s.user_id from public.player_skills s
            where s.skill_id in ('mining', 'woodcutting', 'fishing', 'farming', 'cooking', 'crafting', 'smithing', 'runecrafting')
              and not exists (select 1 from public.hr_skills k where k.skill_id = s.skill_id) loop
    with gone as (delete from public.player_skills s
                   where s.user_id = r.user_id
                     and s.skill_id in ('mining', 'woodcutting', 'fishing', 'farming', 'cooking', 'crafting', 'smithing', 'runecrafting')
                     and not exists (select 1 from public.hr_skills k where k.skill_id = s.skill_id)
               returning s.slot, s.skill_id, s.xp)
    select jsonb_object_agg(g.slot::text || ':' || g.skill_id, g.xp), min(g.slot) into v_skills, v_slot from gone g;
    insert into public.player_ledger (user_id, slot, kind, intent, meta)
      values (r.user_id, v_slot, 'admin', 'one_town_work_cut', jsonb_build_object('skills', v_skills,
              'why', '09-crafting.md 4.11 row 1: the job slice is the town work; the old trades leave, nothing converts'));
    v_accts := v_accts + 1;
  end loop;
  raise notice 'one-town-work cut: % account(s) held old trade rows, each journalled', v_accts;
end $mig$;

-- THE POINTERS. A gather pointer, and an artisan pointer that is no hearth run, go to idle (the work since its last settle is the
-- bench's, and the bench is gone); then the errand stash and the last-activity note that name one. Each changed hero's version moves.
update public.player_state
   set active_kind = 'idle', active_id = null, active_left = null, version = version + 1, updated_at = now()
 where active_kind = 'gather' or (active_kind = 'artisan' and public.hr_hearth_fuel_of(active_id) is null);
update public.player_state
   set errand_kind = null, errand_id = null, errand_left = null, errand_count = null, errand_next = null, version = version + 1, updated_at = now()
 where errand_kind = 'gather' or (errand_kind = 'artisan' and public.hr_hearth_fuel_of(errand_id) is null);
update public.player_state
   set last_activity_kind = null, last_activity_id = null, last_activity_left = null, last_activity_stopped_at = null,
       version = version + 1, updated_at = now()
 where last_activity_kind = 'gather' or (last_activity_kind = 'artisan' and public.hr_hearth_fuel_of(last_activity_id) is null);


-- ── §7 THE BENCH, ITS TAX, ITS RECIPES AND THE COMPANY'S OLD TRADES LEAVE ────────────────────────────────────────────────────
-- (a) the bench tax (2027-02-19-bench-tax.sql and its rate catalogues): nothing calls it once §2 restated hr_apply and §3 the town read
delete from public.hr_state_sections where key = 'bench_tax';
drop function if exists public.hr_bench_tax_view(uuid, integer);
drop function if exists public.hr_bench_tax_settle(uuid, integer, public.player_state, jsonb, jsonb);
drop function if exists public.hr_bench_tax_keep(uuid, integer);
drop function if exists public.hr_bench_tax_due_mg(uuid, integer, text);
drop view if exists public.hr_bench_tax_fees;
drop function if exists public.hr_bench_tax_mg(text);
drop table if exists public.hr_bench_tax_rates;
--     KEPT, inert: player_state.bench_tax_carry_mg and bench_tax_run. No body this file leaves writes them, but 1040-rested-bank-cut.sql's
--     hr_apply image (staged) still sets them, and a retried apply replays that image before this file restates it. Once 1040 is APPLIED
--     (out of the staged tail) the next whole restatement of hr_apply drops both columns.
-- (b) what one action of each bench consumed (the last of 15 generated files, 2027-05-22-cookbook-cut-bench-inputs.generated.sql):
--     hr_apply and hr_bench_makes read hr_hearth_fuel_of now, and tools/gen-catalogues.mjs writes no bench-inputs file any more
drop function if exists public.hr_bench_inputs();
-- (c) the recipe verbs (2026-09-14-recipe-learn.sql): no hr_unlocks row is a recipe since the cookbook cut, and 1032's envelope reads none
delete from public.hr_client_rpc_baseline where proname in ('hr_recipe_learn', 'hr_recipe_learn__ungated');
delete from public.hr_gm_wall_allow where rpc in ('hr_recipe_learn', 'hr_recipe_learn__ungated');
drop function if exists public.hr_recipe_learn(text, integer, uuid);
drop function if exists public.hr_recipe_learn__ungated(text, integer, uuid);
drop function if exists public.hr_recipes_of(uuid, integer);
-- (d) the company's old trades: nothing to drop. company_trades, hr_trade_row_sync, hr_trade_lock and hr_trade_is were 1059's, staged and
--     never applied, so they came out of 1059 in place (company_trade_xp, 1073, is the one store); §8 (a) proves none exists.


-- ── §8 SELF-CHECK: the properties, by executing them (rolled back) ──────────────────────────────────────────────────────────
do $$
declare
  v_u    constant uuid := '000000c0-0000-4000-a000-0000c0107900';
  v      jsonb;
  v_fuel text;
  v_item text;
  v_n    bigint;
  v_x    bigint;
  v_qty  bigint;
  t      text;
begin
  -- (a) THE BENCH IS GONE: no function, table, view, column, section, baseline or GM wall row of it
  foreach t in array array['hr_bench_inputs', 'hr_bench_tax_settle', 'hr_bench_tax_view', 'hr_bench_tax_keep', 'hr_bench_tax_due_mg',
                           'hr_bench_tax_mg', 'hr_recipe_learn', 'hr_recipe_learn__ungated', 'hr_recipes_of', 'hr_trade_row_sync',
                           'hr_trade_lock', 'hr_trade_is'] loop
    if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = t) then
      raise exception 'VERIFY(a): % is still a function', t; end if;
  end loop;
  if to_regclass('public.hr_bench_tax_rates') is not null or to_regclass('public.hr_bench_tax_fees') is not null
     or to_regclass('public.company_trades') is not null then raise exception 'VERIFY(a): a bench or old-trade relation survived'; end if;
  -- the two bench tax columns stay, inert (§7 (a)): no body this file leaves reads or writes them
  if exists (select 1 from pg_proc p where p.oid in ('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure, 'public.hr_state_of(uuid,integer)'::regprocedure)
              and p.prosrc ~ 'bench_tax_(carry_mg|run)') then raise exception 'VERIFY(a): a body still reads a bench tax column'; end if;
  if exists (select 1 from pg_trigger where tgname = 'hr_trade_row_sync') then raise exception 'VERIFY(a): the old trades'' trigger survived'; end if;
  foreach t in array array['hr_tick_town_state', 'hr_work_day_view'] loop
    if (select string_agg(prosrc, ' ') from pg_proc where pronamespace = 'public'::regnamespace and proname = t) ~ '(hr_bench_tax|hr_trade_is|''trades'')' then
      raise exception 'VERIFY(a): % still reads the bench tax or the old trades', t; end if;
  end loop;
  if exists (select 1 from public.hr_state_sections where key = 'bench_tax')
     or not exists (select 1 from public.hr_state_sections where key = 'bench_run' and fn = 'hr_bench_run_view')
     or not exists (select 1 from public.hr_state_sections where key = 'trade_jobs' and fn = 'hr_trade_jobs_view') then
    raise exception 'VERIFY(a): the sections are not bench_run (the hearth run) and trade_jobs without bench_tax'; end if;
  if exists (select 1 from public.hr_client_rpc_baseline where proname like 'hr\_recipe%')
     or exists (select 1 from public.hr_gm_wall_allow where rpc like 'hr\_recipe%') then
    raise exception 'VERIFY(a): a recipe verb is still on the client surface'; end if;
  -- no restated body still reads a dropped object, and each carries this file's mark
  foreach t in array array['hr_apply', 'hr_bench_makes', 'hr_farm_harvest', 'hr_farm_plant',
                           'hr_farm_water', 'hr_farm_upgrade_plot', 'hr_farm_tend_plan', 'hr_farm_tend_view', 'hr_market_eligible', 'hr_lb_skills'] loop
    select string_agg(prosrc, ' ') into v_item from pg_proc where pronamespace = 'public'::regnamespace and proname = t;
    if v_item is null or position('ONE-TOWN-WORK-CUT (1079' in v_item) = 0
       or v_item ~ '(hr_bench_inputs|hr_bench_tax|hr_trade_is|company_trades\M|''bench_tax''|v_tax)' then
      raise exception 'VERIFY(a): % is not this file''s image, or still names the bench', t; end if;
  end loop;
  if exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc ~ 'player_skills'
              and p.proname in ('hr_farm_harvest', 'hr_farm_plant', 'hr_farm_water', 'hr_farm_upgrade_plot', 'hr_farm_tend_plan', 'hr_farm_tend_view')) then
    raise exception 'VERIFY(a): a farm body still reads or writes a hero''s Farming'; end if;
  if (select array_length(public.hr_lb_skills(), 1)) <> 7 or 'mining' = any (public.hr_lb_skills()) then
    raise exception 'VERIFY(a): the boards still list an old trade: %', public.hr_lb_skills(); end if;

  -- (b) THE HELD STATE: no hero row names a skill or an item the catalogue no longer has, and no pointer names the bench
  if exists (select 1 from public.player_skills s where s.skill_id in ('mining', 'woodcutting', 'fishing', 'farming', 'cooking', 'crafting', 'smithing', 'runecrafting')
                and not exists (select 1 from public.hr_skills k where k.skill_id = s.skill_id))
     or exists (select 1 from public.player_inventory i where not exists (select 1 from public.hr_items x where x.item_id = i.item_id))
     or exists (select 1 from public.account_bank b where not exists (select 1 from public.hr_items x where x.item_id = b.item_id))
     or exists (select 1 from public.player_equipment e where not exists (select 1 from public.hr_items x where x.item_id = e.item_id))
     or exists (select 1 from public.hunt_bag h where not exists (select 1 from public.hr_items x where x.item_id = h.item_id))
     or exists (select 1 from public.company_stock c where not exists (select 1 from public.hr_items x where x.item_id = c.item_id))
     or exists (select 1 from public.market_listings m where not exists (select 1 from public.hr_items x where x.item_id = m.item_id)) then
    raise exception 'VERIFY(b): a held row names a skill or an item the catalogue no longer has'; end if;
  if exists (select 1 from public.player_state where active_kind = 'gather' or errand_kind = 'gather' or last_activity_kind = 'gather'
               or (active_kind = 'artisan' and public.hr_hearth_fuel_of(active_id) is null)
               or (errand_kind = 'artisan' and public.hr_hearth_fuel_of(errand_id) is null)
               or (last_activity_kind = 'artisan' and public.hr_hearth_fuel_of(last_activity_id) is null)) then
    raise exception 'VERIFY(b): a hero''s pointer, errand or last activity still names a gathering job or a bench'; end if;

  -- (c) THE GRANTS: the bridge is the owner's; nothing new reaches a client; the engine keeps its applier and its town read
  if has_function_privilege('anon', 'public.hr_hearth_fuel_of(text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hearth_fuel_of(text)', 'execute')
     or has_function_privilege('service_role', 'public.hr_hearth_fuel_of(text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_bench_makes(uuid,integer,text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_tick_town_state(uuid,integer)', 'execute') then
    raise exception 'VERIFY(c): a privileged body is executable by a client role'; end if;
  if exists (select 1 from pg_roles where rolname = 'hr_engine')
     and (not has_function_privilege('hr_engine', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute')
          or not has_function_privilege('hr_engine', 'public.hr_tick_town_state(uuid,integer)', 'execute')) then
    raise exception 'VERIFY(c): the engine lost hr_apply or the town read'; end if;
  if not has_function_privilege('authenticated', 'public.hr_farm_harvest(integer,integer,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_farm_plant(integer,integer,text,uuid)', 'execute') then
    raise exception 'VERIFY(c): a farm verb lost its signed-in grant'; end if;

  -- (d) THE PROBE: a hero's town read and work day, the hearth's bridge, and a harvest on the company's Farming
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'one-town-work-cut §8 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d)-harness: hr_create_character refused: %', v; end if;

    v := public.hr_tick_town_state(v_u, 0);
    if coalesce(v->>'ok', 'true') = 'false' or v ? 'bench_tax' or not (v ? 'bench_run') or not (v ? 'work_day') then
      raise exception 'VERIFY(d): the town read is not the cut''s (bench_run and work_day, no bench_tax): %', left(v::text, 300); end if;
    v := public.hr_work_day_view(v_u, 0);
    if v is null or v ? 'trades' or not (v ? 'left_ms') then raise exception 'VERIFY(d): the work day still lists the old trades: %', v; end if;

    -- the bridge: a fuel run burns its one fuel, counted in the bag and Storage; any other id names nothing
    select a.activity_id into v_fuel from public.hr_activities a
     where a.kind = 'artisan' and a.activity_id like 'fuel\_%' and exists (select 1 from public.hr_items i where i.item_id = substr(a.activity_id, 6))
     order by a.activity_id limit 1;
    if public.hr_hearth_fuel_of('cook_shrimp') is not null or public.hr_hearth_fuel_of(null) is not null
       or public.hr_hearth_fuel_of('fuel_not_an_item') is not null then
      raise exception 'VERIFY(d): the bridge names a fuel for a run that is no hearth run'; end if;
    if v_fuel is not null then
      v_item := substr(v_fuel, 6);
      if public.hr_hearth_fuel_of(v_fuel) is distinct from v_item then raise exception 'VERIFY(d): % burns %, not %', v_fuel, public.hr_hearth_fuel_of(v_fuel), v_item; end if;
      delete from public.player_inventory where user_id = v_u and item_id = v_item;
      delete from public.account_bank where user_id = v_u and item_id = v_item;
      insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_item, 2);
      insert into public.account_bank (user_id, item_id, qty) values (v_u, v_item, 3);
      if public.hr_bench_makes(v_u, 0, v_fuel) is distinct from 5 then
        raise exception 'VERIFY(d): 2 % in the bag and 3 in Storage make % runs, not 5', v_item, public.hr_bench_makes(v_u, 0, v_fuel); end if;
    end if;
    if public.hr_bench_makes(v_u, 0, 'cook_shrimp') is not null then raise exception 'VERIFY(d): a bench still counts runs'; end if;

    -- a harvest: the company's Farming gains crop_xp a crop, no hero's skill moves, the ledger row carries it in meta
    delete from public.account_farm_plots where user_id = v_u;
    insert into public.account_farm_plots (user_id, plot_idx, crop_id, planted_at, waterings, regrow_count, planted_by)
      select v_u, 0, c.crop_id, now() - interval '200 hours', '{}', 0, 0 from public.hr_crops c order by c.req_lv, c.crop_id limit 1;
    v_x := coalesce((select x.xp from public.company_trade_xp x where x.user_id = v_u and x.trade_id = 'farming'), 0);
    v := public.hr_farm_harvest(0, 0, '000000c0-0000-4000-a000-0000c0107901');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d): the probe harvest refused: %', v; end if;
    v_qty := (v->>'qty')::bigint;
    if (select x.xp from public.company_trade_xp x where x.user_id = v_u and x.trade_id = 'farming')
         is distinct from v_x + v_qty * (select l.crop_xp from public.hr_trade_levers l where l.id) then
      raise exception 'VERIFY(d): % crops credited % to the company''s Farming, not % a crop', v_qty,
        (select x.xp from public.company_trade_xp x where x.user_id = v_u and x.trade_id = 'farming'), (select l.crop_xp from public.hr_trade_levers l where l.id); end if;
    if exists (select 1 from public.player_skills where user_id = v_u and skill_id = 'farming' and xp > 0)
       or not exists (select 1 from public.player_ledger where user_id = v_u and intent = 'farm_harvest' and skill_id is null and xp_in is null
                       and (meta->>'trade_xp')::bigint = v_qty * (select l.crop_xp from public.hr_trade_levers l where l.id)) then
      raise exception 'VERIFY(d): the harvest wrote a hero''s Farming, or its journal row does not carry the company''s XP'; end if;
    if public.hr_trade_level_of(v_u, 'farming') < 1 then raise exception 'VERIFY(d): the company''s Farming reads no Level'; end if;

    raise exception using errcode = 'HRF79', message = 'one-town-work-cut §8 complete - rolling back';
  exception when sqlstate 'HRF79' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.company_trade_xp where user_id = v_u)
     or exists (select 1 from public.account_farm_plots where user_id = v_u) then
    raise exception 'VERIFY(d): §8 LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'one-town-work-cut: the bench, its tax, its recipes and the old trades are gone; the hearth keeps its run; the farm pays the company; all green';
end $$;

-- ── §9 THE SWITCH: the job slice is the town work from this instant (09 4.11 row 1). THE LAST STATEMENT ─────────────────────
update public.hr_flags set enabled = true where key = 'trade_jobs';
