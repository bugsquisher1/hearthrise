-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-20-market-wipe.sql — THE MARKET'S HALF OF A DECLARED WIPE: LISTINGS, SALES AND PRICE
--   HISTORY ARE EMPTIED, ONCE, WITH THE EXPIRY SWEEP PAUSED (lane/c-beta-server, backend-architect,
--   2026-11-01; Security market review change 3, threat model #12).
--
-- STATUS: STAGED. ⚠ APPLY ONLY ON TYLER'S WORD, AS PART OF A DECLARED WIPE. It is in
-- tests/schema-apply-order.json `excluded`, never replayed. tools/apply-migration.mjs, one file,
-- never inside begin/commit, never 00:00–00:10 UTC. IRREVERSIBLE except by the daily backup taken
-- before it: market_listings IS THE ESCROW, the only copy of every listed good.
--
-- THE PROCEDURE, IN THIS ORDER:
--   1. closed_mode ON (§0 refuses otherwise), and a pre-wipe backup exists.
--   2. 2027-02-14-market-off.sql            list and buy answer market_closed (§0 refuses otherwise).
--   3. THIS FILE                            the three tables empty, the sweep unscheduled.
--   4. the character wipe                   its own declared file. NONE EXISTS YET, and this is not it.
--   5. 2027-02-20-market-wipe-resume.sql    the sweep scheduled again.
--   6. 2027-02-14-market-on.sql             refuses (its §0) until step 5 ran.
--
-- WHY. A listing's goods left a bag or Storage when it was made, so a wipe of bags, Storage and purses
-- that leaves market_listings behind hands them back after it: a cancel or the five-minute sweep puts
-- pre-wipe goods into a post-wipe account (threat model #12). Sales and the daily rows carry the old
-- economy's prices into the new one's "typical price" and chips.
--
-- ── WHAT IT TOUCHES ─────────────────────────────────────────────────────────
--   TRUNCATE market_listings, market_sales, market_item_daily (RESTRICT: nothing references them;
--   CONTINUE IDENTITY) and hr_cron_drop('hr-market-expire'). One journal row in hr_wipe_log.
--   NOTHING ELSE. No character, bag, Storage, purse, ledger row or catalogue (tests/market-wipe.mjs). A listed good
--   is therefore GONE, not returned: that is the point, and why step 4 must follow. CLAUDE.md §2: no
--   admin reset of a real character outside a declared wipe.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   One transaction, lock_timeout 10 s. TRUNCATE's ACCESS EXCLUSIVE waits out a cancel or a sweep in
--   flight (their goods reach Storage first, and step 4 removes them) and blocks any that starts; a busy
--   table fails the apply fast and whole, retryable. After the commit a queued cancel finds no listing
--   and answers not_found; a queued sweep finds nothing to return. The pause and the empty tables commit
--   together. WHY THE SWEEP STAYS PAUSED PAST THIS FILE: with the job unscheduled nothing can write a
--   good into Storage from any path through step 4, whatever order an operator takes, and market-on's §0
--   refuses to open a market whose sweep is off, so a forgotten step 5 cannot strand a listing.
--
-- ── THE ONE-SHOT FENCE ──────────────────────────────────────────────────────
--   hr_wipe_log row 'market-first-wipe', written in the same transaction. A re-apply is a NO-OP that says
--   so, whatever has been listed since. A restore to a pre-wipe backup restores the row's absence, which
--   is correct. The NEXT wipe (the betas are each wiped) is a new file with a new key, or the character-
--   wipe procedure once it exists: it must name these three tables (tests/restore-census.baseline.json).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 + §1 + §2: ONE BLOCK, ONE TRANSACTION ────────────────────────────────
do $mig$
declare
  c_key    constant text   := 'market-first-wipe';
  c_tables constant text[] := array['market_listings', 'market_sales', 'market_item_daily'];
  c_kept   constant text[] := array['hr_market_items', 'hr_market_config'];
  v_removed jsonb := '{}';
  v_kept    jsonb := '{}';
  v_n       bigint;
  t         text;
begin
  -- THE FENCE FIRST: a re-apply answers before any precondition, so it stays a no-op with the market back on.
  if to_regclass('public.hr_wipe_log') is null then
    raise exception 'PRECONDITION: hr_wipe_log (2026-10-21-closed-rebuild-wipe.sql) is absent'; end if;
  if exists (select 1 from public.hr_wipe_log where wipe_key = c_key) then
    raise notice 'market wipe already ran at % — no-op', (select wiped_at from public.hr_wipe_log where wipe_key = c_key);
    return;
  end if;

  -- §0 PRECONDITIONS — FAIL CLOSED.
  if not coalesce((select enabled from public.hr_flags where key = 'closed_mode'), false) then
    raise exception 'PRECONDITION: closed_mode is not ON: a market wipe belongs to a declared wipe of a closed game'; end if;
  if (select enabled from public.hr_market_config) is distinct from false then
    raise exception 'PRECONDITION: the market is ON: apply 2027-02-14-market-off.sql first, or a listing can land during the wipe'; end if;
  foreach t in array c_tables loop
    if to_regclass('public.' || t) is null then raise exception 'PRECONDITION: public.% is absent', t; end if;
  end loop;

  -- §1 THE PAUSE AND THE EMPTY, TOGETHER. Fails fast and whole if a cancel or the sweep holds a table.
  set local lock_timeout = '10s';
  lock table public.market_listings, public.market_sales, public.market_item_daily in access exclusive mode;

  foreach t in array c_tables loop
    execute format('select count(*) from public.%I', t) into v_n;
    v_removed := v_removed || jsonb_build_object(t, v_n);
  end loop;
  foreach t in array c_kept loop
    execute format('select count(*) from public.%I', t) into v_n;
    v_kept := v_kept || jsonb_build_object(t, v_n);
  end loop;
  v_removed := v_removed || jsonb_build_object('sweep_paused',
    (select jsonb_build_object('jobname', jobname, 'schedule', schedule, 'command', command)
       from cron.job where jobname = 'hr-market-expire'));

  perform public.hr_cron_drop('hr-market-expire');
  truncate table public.market_listings, public.market_sales, public.market_item_daily continue identity restrict;
  insert into public.hr_wipe_log (wipe_key, removed, kept) values (c_key, v_removed, v_kept);

  -- §2 SELF-CHECK (CLAUDE.md §4): empty, paused, journalled. That no character, bag, Storage, purse or ledger row
  --    moved is proved by tests/market-wipe.mjs on the replayed chain: this block reads a live database, where the
  --    tick and allowlisted players may move those tables under it, and a false refusal mid-wipe helps nobody.
  foreach t in array c_tables loop
    execute format('select count(*) from public.%I', t) into v_n;
    if v_n <> 0 then raise exception 'market-wipe §2: public.% still holds % rows', t, v_n; end if;
  end loop;
  if exists (select 1 from cron.job where jobname = 'hr-market-expire') then
    raise exception 'market-wipe §2: the expiry sweep is still scheduled'; end if;
  if not exists (select 1 from public.hr_wipe_log where wipe_key = c_key) then
    raise exception 'market-wipe §2: the wipe is not journalled'; end if;
  if (select enabled from public.hr_market_config) is distinct from false then
    raise exception 'market-wipe §2: the switch moved'; end if;
  raise notice 'market-wipe: % emptied, hr-market-expire unscheduled; apply the character wipe, then 2027-02-20-market-wipe-resume.sql', v_removed;
end $mig$;
