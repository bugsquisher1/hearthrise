-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — MARKET v2. THE FIRST TRUE CROSS-PLAYER VALUE MOVEMENT.
--
-- Companion contract: docs/design/market-v2-contract.md
-- SUPERSEDES supabase/migrations/2026-08-11-market-v2.sql, which is DELETED in
-- the same commit. Read the supersession note below before anything else.
--
-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  WHY THIS IS A RE-DERIVATION AND NOT A PATCH                         ║
-- ║                                                                      ║
-- ║  The 2026-08-11 file was written five days and eleven migrations ago,║
-- ║  against an architecture that did not yet exist. It is not stale in  ║
-- ║  its DETAIL — every one of its seventeen review findings is carried  ║
-- ║  forward below, by name — it is stale in its SHAPE. Four properties  ║
-- ║  of that file are now defects rather than choices:                   ║
-- ║                                                                      ║
-- ║   1. IT GRANTED market_list/cancel/buy TO `authenticated`. Since     ║
-- ║      2026-08-15 every value verb reaches the database through the    ║
-- ║      Edge Function as `hr_engine`, behind hr_rate_gate, through ONE  ║
-- ║      transport with ONE prediction lifecycle. A browser-callable     ║
-- ║      market RPC is a SECOND door into the same tables with its own   ║
-- ║      rate namespace, its own key namespace and no gate — i.e. a      ║
-- ║      second concurrency story for the one surface that moves value   ║
-- ║      between two people.                                             ║
-- ║   2. ITS IDEMPOTENCY WAS WEAKER THAN THE REGISTRY IT SHARED A TABLE  ║
-- ║      WITH. `hr_intent_claim` wrote public.player_intents with NO     ║
-- ║      intent-name comparison and NO slot comparison — the exact hole  ║
-- ║      2026-08-15-intent-key-hygiene.sql closed for hr_apply (b346     ║
-- ║      C3). Two writers of one key namespace with different rules is   ║
-- ║      not idempotency; it is a key that means different things to     ║
-- ║      different callers. Worse in one direction: a market call        ║
-- ║      presenting a key hr_apply had already stored would have been    ║
-- ║      answered with hr_apply's stored RESULT and `replayed:true` — a  ║
-- ║      listing that reports success and never happened.                ║
-- ║   3. IT TOOK NO VERSION AND RETURNED NO ENVELOPE. Every other writer ║
-- ║      takes p_version, answers `version_conflict`, and RELEASES the   ║
-- ║      key on that answer (b346 C1). The client's whole reconciliation ║
-- ║      model — absolute envelope in, prediction retired — needs        ║
-- ║      hr_state_of back. `{ok:true, listing_id}` cannot settle a       ║
-- ║      prediction, so every market gesture would have stayed an        ║
-- ║      immortal local offset (the F1 defect, from the other side).     ║
-- ║   4. IT HAD NO PER-DAY CLAMP ON THE GOLD FLOWS AT ALL. The per-call  ║
-- ║      overflow guard was the only fuse on a cross-player transfer.    ║
-- ║                                                                      ║
-- ║  Patching those four means rewriting the identity seam, the          ║
-- ║  idempotency block, the return value and the clamp set of all three  ║
-- ║  functions — which is the whole of each function. So the file is     ║
-- ║  re-derived on today's patterns, and the OLD FILE'S FINDINGS ARE     ║
-- ║  CARRIED AS A CHECKLIST (§0a) rather than left behind in a file      ║
-- ║  nobody will diff against.                                          ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- ── THE SPLIT, AND WHY IT FALLS THIS WAY ────────────────────────────────
-- The 2026-08-15 architecture decision: RULES are JavaScript in the Edge
-- Function computing a delta for hr_apply; BOOKKEEPING is a database function.
--
-- A market trade is bookkeeping in every dimension. There is no game rule in
-- it: no yield curve, no level gate, no drop table, no simulation. What there
-- IS, is a listing, an escrow, a price the seller already fixed, a fee rate,
-- and TWO characters' rows moving in one transaction. That last clause is
-- decisive and it is why `market_buy` cannot be an hr_apply delta at all:
-- hr_apply is single-character BY CONSTRUCTION — one advisory lock, one
-- version, one state row, one journal target. A delta shape that could move a
-- second player's gold would be the most dangerous key in the engine's
-- vocabulary. So market gets the hr_unlock_buy treatment, one step further:
-- SECURITY DEFINER functions, ENGINE-ONLY, that take NAMES and COUNTS and
-- decide everything else for themselves.
--
--   the Edge Function        validates shape, spends the rate budget, reads
--                            the envelope, names a listing / an item / a count
--   the database function    takes the locks, re-validates every invariant,
--                            moves the value, journals both sides, returns
--                            hr_state_of
--
-- ── WHAT THE CLIENT MAY SAY, AND THE ONE UNCOMFORTABLE FIELD ────────────
-- list:   item id, count, ASK PRICE      cancel: listing id
-- buy:    listing id, count
--
-- ⚠ `p_ask_each` IS A CLIENT-SUPPLIED PRICE AND THAT IS NOT A VIOLATION OF
--   "never trust a client value that crosses to another player" — but it is
--   the one place in this program where the two sentences have to be told
--   apart, so it is argued rather than assumed:
--     · A market EXISTS to let a seller name a price. There is no server-side
--       answer to "what is this worth" that is not a price control.
--     · The price is authored about the seller's OWN goods, and the moment it
--       is accepted it becomes SERVER STATE. The BUYER never supplies a price:
--       market_buy reads ask_each off the locked listing row and the buyer's
--       request has no field for it. So no client value crosses to another
--       player — the seller's number crosses to the SERVER, and the server's
--       copy is what the buyer transacts against.
--     · It cannot mint. Gold is conserved by the transaction (buyer -gross,
--       seller +net, tax burned) and the buyer's balance is checked under the
--       lock, so an absurd ask can only move gold somebody actually earned.
--     · It is BOUNDED anyway (1 .. 1e9 per unit, and a per-trade gross
--       ceiling), because an unbounded number that reaches a multiply is an
--       overflow, and an overflow inside a value transfer is a 500 in the
--       middle of one.
--   No price cap beyond that is included as a security control. A cap is a
--   design/UX decision and belongs to the Game Designer; smuggling one in here
--   as "anti-exploit" would be a balance change wearing a security badge.
--
-- ── WHAT REPLACED "COLLECT PROCEEDS" ────────────────────────────────────
-- Nothing, and that is the answer. The v1 market paid the seller through a
-- `collected` flag the SELLER could PATCH, guarded by a one-way policy and
-- two nightly cron jobs that were disarmed for destroying escrow. Under v2 the
-- seller is PAID INTO player_state.gold AT SALE TIME, online or not, so:
--   · there is no `collected` column (asserted, §11(d))
--   · there is no second credit path to double-collect from
--   · there is no client UPDATE policy or grant on either table (§11(a),(b))
-- "The escrow cannot be double-collected" is therefore a STRUCTURAL claim, not
-- a check that has to hold — and the one remaining place two paths could both
-- return one escrow (cancel racing expire) is arbitrated by making THE DELETE
-- ITSELF the arbiter: both do `delete … returning *`, and the loser gets zero
-- rows and does nothing. See §6 and §8.
--
-- ⚠ THIS FILE DROPS AND RECREATES market_listings / market_sales, behind a GUC
--   gate (§0b). Only safe because the beta is wiped at cutover.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0a. THE INHERITED FINDINGS — the 2026-08-11 file's review, carried ───
-- Every finding below was raised against the superseded file. This is where
-- they live now; a finding that only exists in a deleted file has been lost,
-- not fixed. Each names WHERE it is answered here.
--
--   S3  bop allowlist FAILED OPEN without the catalogue      → §0 refuses to
--       install without hr_items, and the tradeable check is unconditional (§5)
--   S6  market_expire was anon-callable write amplification  → §8: no client
--       grant at all, batch capped at 200, cron-owner only
--   S7  hr_display_name_of was a public name oracle          → §4: no grant to
--       any role, including hr_engine
--   S9  the engine capability list belongs in ONE place      → §10: the three
--       new engine grants are recorded in hr_assert_grant_hygiene's
--       c_engine_allow, derived not retyped
--   S11 seller credit ignored row_count → gold destroyed     → §7(g): the
--       credit's row_count is checked and a missing seller row REFUSES
--   S15 cancel/expire moved inventory without bumping version → §6, §8 both bump
--   S16 buy locked buyer then seller, in call order → deadlock → §7(1):
--       canonical (user_id, slot) ordering, both advisory locks
--   S17 market_sales was world-readable, publishing two auth UUIDs → §2:
--       participants-only, with a names-free price view for the chart
--   N2  qty*ask*tax_bp overflowed bigint before the affordability check → §7(e):
--       numeric arithmetic + an explicit gross ceiling
--   N3  the intent claim raced its own primary key → §5/§6/§7: hr_apply's
--       `on conflict do nothing` + `intent_in_flight`, statement for statement
--   R1/R2 the cron reconciliation must be asserted, not commented → §11(h)
--   R4  a rejection must outlive player_intents' 24h prune → all three RPCs
--       call hr_record_rejection outside the protected block
--   R6/R7 one lock order for the whole file                  → §4c
--   RL3 market_sales had no retention policy                 → §8a
--   RL6 a prose warning is not a wipe interlock              → §0b (GUC)
--   C-c the cron disarm must precede the column that arms it → §0c, asserted
--       by a session marker read in §11(h-0)
--   C2  a rate-limited caller must leave a durable trace     → all three RPCs
--       record before returning, SAMPLED (S6's sampler)
--
-- ── 0. PRECONDITIONS + REFUSE-TO-INSTALL — FAIL CLOSED ───────────────────
-- This file installs THREE new writers of player state, one of which writes a
-- SECOND player's row. The worst way to ship that is against a database whose
-- first writer does not have the properties these assume. So the assumptions
-- are asserted against the LIVE hr_apply body, with a positive and a negative
-- control, so a blind prosrc scan cannot report a clean bill.
do $$
declare
  v_src   text;
  v_n     int;
  v_row   text[];
  c_terms constant text[][] := array[
    ['b346 C3: the slot comparison',           '\mv_prev_slot\M'],
    ['b346 C3: the intent_mismatch branch',    'intent_mismatch'],
    ['b346: the version_conflict key release', 'delete from public.player_intents'],
    ['C5/X3: the daily budget is enforced',    'hr_day_budget_check']
  ];
begin
  -- (a) THE FOUNDATION.
  if to_regclass('public.player_state') is null
     or to_regclass('public.player_inventory') is null
     or to_regclass('public.player_intents') is null
     or to_regclass('public.player_ledger') is null then
    raise exception 'the player-state foundation is missing — apply 2026-08-11-player-state.sql first';
  end if;

  -- (b) THE CATALOGUE, AND IT MAY NOT BE VACUOUS. S3: the tradeable allowlist
  --     is the only thing stopping a bind-on-pickup item being listed, and an
  --     allowlist that excludes nothing excludes nothing.
  if to_regclass('public.hr_items') is null then
    raise exception 'catalogue_missing — run: node tools/gen-catalogues.mjs, then apply '
                    '2026-08-11-catalogue.generated.sql. Without it the tradeable allowlist in §5 '
                    'has nothing to check against.';
  end if;
  if (select count(*) from public.hr_items where not tradeable) = 0 then
    raise exception 'the catalogue has no untradeable items — the bop allowlist would be vacuous, '
                    'refusing to install (S3)';
  end if;

  -- (c) THE PRIMITIVES these functions are built out of.
  if to_regprocedure('public.hr_reject(text,jsonb)') is null then
    raise exception 'hr_reject is missing — apply 2026-08-11-apply-engine.sql first';
  end if;
  if to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 're-run 2026-08-11-player-state.sql — the market RPCs record their rejections';
  end if;
  if to_regprocedure('public.hr_rate_sample_weight(bigint)') is null
     or to_regprocedure('public.hr_rate_over(uuid,text)') is null
     or to_regprocedure('public.hr_rate_ok(uuid,text,integer,interval)') is null then
    raise exception 're-run 2026-08-11-player-state.sql — the rate-limit sampler is missing (S6)';
  end if;
  if to_regprocedure('public.hr_state_of(uuid,integer)') is null then
    raise exception 'hr_state_of is missing — these RPCs return its envelope verbatim';
  end if;
  if to_regprocedure('public.hr_utc_day_key(timestamptz)') is null then
    raise exception 'hr_utc_day_key is missing — apply 2026-08-08-clan-seat.sql first. The per-day '
                    'clamps read it; this file deliberately defines no second day-key function.';
  end if;
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise exception 'pg_cron is required — §0c replaces a live cron job that would otherwise '
                    'destroy escrowed goods';
  end if;
  if to_regprocedure('public.hr_cron_ensure(text,text,text)') is null
     or to_regprocedure('public.hr_cron_drop(text)') is null then
    raise exception 're-run 2026-08-11-player-state.sql — §0c/§8b need the idempotent cron helpers';
  end if;
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'hr_assert_grant_hygiene is missing — apply 2026-08-11-grant-hygiene.sql. §10 '
                    'takes over its body to record three reviewed engine grants; without it '
                    'NOTHING pins the engine''s EXECUTE surface (S9).';
  end if;
  if to_regclass('public.hr_client_write_baseline') is null then
    raise exception 'hr_client_write_baseline is missing — apply '
                    '2026-08-16-client-write-grant-sweep.sql first. §10 derives its detector body '
                    'from that file''s, and a derivation whose base is not installed installs a '
                    'detector that has never seen the widened check (4).';
  end if;

  -- (d) THE LIVE hr_apply, WITH CONTROLS. This file does NOT replace hr_apply —
  --     2026-08-15-gem-daily-budget.sql remains the last file that may — so its
  --     terms are ASSERTED instead. These three functions copy hr_apply's
  --     idempotency block statement for statement; installed against an older
  --     body, the key namespace would have two sets of rules in it.
  select p.prosrc into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply'
   limit 1;
  if v_src is null then
    raise exception 'hr_apply is missing — apply 2026-08-11-apply-engine.sql first';
  end if;
  -- POSITIVE control: a term any hr_apply worth the name contains.
  if v_src !~ 'player_state' then
    raise exception 'THE hr_apply SOURCE SCAN IS BLIND — the positive control (player_state) did '
                    'not match, so the scans below would report a clean bill about nothing';
  end if;
  -- NEGATIVE control: a term no hr_apply contains.
  if v_src ~ 'hr__market_scan_control_must_not_match' then
    raise exception 'THE hr_apply SOURCE SCAN IS DEGENERATE — the negative control matched';
  end if;
  foreach v_row slice 1 in array c_terms loop
    if v_src !~ v_row[2] then
      raise exception 'hr_apply is missing "%" (/%/). This file''s three RPCs copy hr_apply''s '
                      'idempotency and version rules statement for statement; against a body that '
                      'does not have them, one key namespace would carry two sets of rules. Apply '
                      'the hr_apply chain through 2026-08-15-gem-daily-budget.sql first.',
                      v_row[1], v_row[2];
    end if;
  end loop;

  raise notice 'market v2 §0 PASSED: catalogue loaded (% untradeable items), hr_apply carries all % '
               'asserted properties, both controls fired correctly.',
               (select count(*) from public.hr_items where not tradeable), array_length(c_terms, 1);
end $$;

-- ── 0c. DISARM THE ESCROW-DESTROYING CRON JOBS — FIRST, BEFORE §1 ────────
-- ⚠⚠ THIS BLOCK MUST STAY AHEAD OF §1. READ WHY BEFORE MOVING IT. ⚠⚠
--
-- A live pg_cron job, `trim-expired-listings`, runs nightly at 03:30:
--
--     delete from public.market_listings where expires_at < now()
--
-- Under market v1 that was harmless: a listing was a POINTER and the goods
-- stayed in the seller's client-side inventory. Under v2 A LISTING **IS** THE
-- ESCROW — market_list DELETEs the items out of player_inventory and the
-- listing row is the only record they exist. That statement bypasses
-- hr_market_expire() and ANNIHILATES THE SELLER'S GOODS.
--
-- AND THE MIGRATION IS WHAT ARMS IT: market_listings has no `expires_at`
-- column today, so the job has been failing every night since 2026-08-09. §1
-- adds the column, which REPAIRS the destructive job and points it at escrow.
--
-- ORDERING (C-c). Every transactional apply is fine. A NON-transactional apply
-- — psql without -1, a tool that splits on ';', an apply that dies halfway —
-- leaves a window in which the column exists and the job is still scheduled.
-- If that window straddles 03:30 the escrow is gone. Documenting an ordering
-- dependency is strictly worse than not having one, so the disarm happens
-- before the arming, always, and the two cannot be separated by a crash. The
-- REARM lives in §8b because it references functions defined later; the window
-- that split creates is a window with NO expiry job, which costs a listing a
-- few minutes in limbo and destroys nothing.
do $$
declare v_dropped boolean; v_armed int;
begin
  -- THE ORDERING ASSERTION, at the only moment order is observable: a bare
  -- `delete from market_listings` job must never coexist with an expires_at
  -- column. First apply: the column does not exist → passes. Re-apply: the jobs
  -- are gone → passes. It fails exactly when someone moved this block below §1.
  select count(*) into v_armed
    from cron.job
   where command ~* 'delete\s+from\s+(public\.)?market_listings'
     and exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'market_listings'
                    and column_name = 'expires_at');
  if v_armed > 0 then
    raise exception
      'ORDERING VIOLATION: % cron job(s) DELETE from market_listings directly while an expires_at '
      'column exists. Under market v2 that job destroys escrowed goods at its next run. This '
      'disarm block MUST execute before §1 creates the table. Do not move it.', v_armed;
  end if;

  -- REMOVE, do not repair. The correct behaviour is not a delete at all; it is
  -- hr_market_expire(), which returns the escrow, bumps the seller's version
  -- and journals the return. §8b schedules that replacement.
  v_dropped := public.hr_cron_drop('trim-expired-listings');
  if v_dropped then
    raise warning 'unscheduled trim-expired-listings — it would have DESTROYED escrowed goods';
  end if;
  v_dropped := public.hr_cron_drop('trim-market-sales');
  if v_dropped then
    raise warning 'unscheduled trim-market-sales — it filtered on sold_at, which has never existed';
  end if;

  -- A marker §11 asserts on, so DELETING this block fails the migration instead
  -- of silently removing the interlock. Session-scoped on purpose: it proves
  -- THIS run did the disarm, not that some earlier run did.
  perform set_config('hearthrise.market_cron_disarmed', 'yes', false);
end $$;

-- ── 0b. THE WIPE GATE — a prose comment is not a safety interlock (RL6) ──
-- The next two statements DROP … CASCADE two live tables. The superseded
-- file's first revision protected them with a paragraph at the top of the
-- file; every destructive migration that has ever gone wrong was run by
-- someone who did not read that paragraph, or read it three files ago.
--
--     set hearthrise.market_wipe_ok = 'yes';
--     \i supabase/migrations/2026-08-17-market-v2.sql
--
-- ⚠ RE-RUNNABILITY DEPENDS ON THE DROPS. The `create table` statements below
--   are NOT `if not exists`; the drops are what make this file safe to re-run.
--   Removing them requires adding `if not exists` to both creates in the same
--   edit. The two facts are coupled and are stated here together on purpose.
--
-- CASCADE dependents are ENUMERATED before the drop rather than discovered
-- after: cascade silently removes views and foreign keys this file does not
-- recreate.
do $$
declare v_l bigint := 0; v_s bigint := 0; v_dep text;
begin
  if to_regclass('public.market_listings') is not null then
    execute 'select count(*) from public.market_listings' into v_l;
  end if;
  if to_regclass('public.market_sales') is not null then
    execute 'select count(*) from public.market_sales' into v_s;
  end if;

  select string_agg(distinct c.relname, ', ') into v_dep
    from pg_depend d
    join pg_rewrite r on r.oid = d.objid
    join pg_class c on c.oid = r.ev_class
   where d.refobjid in (coalesce(to_regclass('public.market_listings'), 0::oid),
                        coalesce(to_regclass('public.market_sales'), 0::oid))
     and c.relname not in ('market_listings','market_sales');
  if v_dep is not null then
    raise warning 'CASCADE will also drop these dependents, which this file does NOT recreate: %', v_dep;
  end if;

  if (v_l > 0 or v_s > 0)
     and coalesce(current_setting('hearthrise.market_wipe_ok', true), '') <> 'yes' then
    raise exception
      'REFUSING TO WIPE THE MARKET: % listing row(s) and % sale row(s) would be destroyed. This '
      'file drops and recreates market_listings/market_sales — there is no in-place upgrade path. '
      'If that is intended (the beta wipe at cutover), run  set hearthrise.market_wipe_ok = ''yes'';  '
      'in the SAME session first.', v_l, v_s;
  end if;
  if v_l > 0 or v_s > 0 then
    raise warning 'market_wipe_ok is set — destroying % listing row(s) and % sale row(s)', v_l, v_s;
  end if;
end $$;

-- ── 1. TABLES ────────────────────────────────────────────────────────────
drop table if exists public.market_listings cascade;
drop table if exists public.market_sales    cascade;

-- THE ESCROW. A row here IS the goods: hr_market_list DELETEd them out of
-- player_inventory and nothing else records that they exist.
create table public.market_listings (
  id             uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references auth.users(id) on delete cascade,
  seller_slot    int  not null default 0,
  -- Denormalised for the listing grid and written by the SERVER from
  -- profiles.display_name. NEVER accepted from a client — that was the
  -- impersonation hole. Stale after a rename, deliberately: the alternative is
  -- a join to profiles on every grid read, and a listing is a historical
  -- statement about who posted it.
  seller_name    text not null,
  item_id        text not null,
  qty            bigint not null check (qty > 0),
  ask_each       bigint not null check (ask_each > 0 and ask_each <= 1000000000),
  posted_at      timestamptz not null default now(),
  expires_at     timestamptz not null
);
create index market_listings_item_idx   on public.market_listings (item_id, ask_each);
create index market_listings_seller_idx on public.market_listings (seller_user_id, seller_slot);
create index market_listings_expiry_idx on public.market_listings (expires_at);

-- THE RECEIPT. Append-only. No `collected` column: the seller was paid at sale
-- time, so there is nothing to collect and no flag to flip twice.
create table public.market_sales (
  id             bigserial primary key,
  listing_id     uuid not null,
  seller_user_id uuid not null,
  seller_slot    int  not null,
  buyer_user_id  uuid not null,
  buyer_slot     int  not null,
  item_id        text not null,
  qty            bigint not null check (qty > 0),
  gold_gross     bigint not null check (gold_gross >= 0),
  tax            bigint not null check (tax >= 0),
  gold_net       bigint not null check (gold_net >= 0),
  at             timestamptz not null default now(),
  -- CONSERVATION, AS A CONSTRAINT. gross = net + tax is the property that makes
  -- the audit arithmetic work, and the database is where it belongs: a future
  -- edit to §7's arithmetic that broke it would otherwise be found by a human
  -- reading a spreadsheet.
  constraint market_sales_conserved check (gold_gross = gold_net + tax)
);
create index market_sales_item_idx   on public.market_sales (item_id, at desc);
create index market_sales_seller_idx on public.market_sales (seller_user_id, at desc);
create index market_sales_buyer_idx  on public.market_sales (buyer_user_id, at desc);

-- ── 1b. THE LISTING IS IMMUTABLE IN THREE COLUMNS — BY CONSTRUCTION (M4) ──
-- §4c and §7 both depend on seller_user_id, seller_slot and ask_each never
-- changing after insert: the UNLOCKED routing read uses the first two to derive
-- the advisory key before taking any lock, and the buy intent name is price-free
-- precisely because ask_each cannot move under a live listing. §11(j) asserts no
-- function in THIS file updates them — but a regex over four function bodies is a
-- commit-time HINT, not a guarantee: it misses an unqualified `update
-- market_listings`, an alias, a CTE, a future function outside this file, and a
-- hand `psql` UPDATE during an incident. The GUARANTEE is this trigger, which
-- refuses the change whoever attempts it and however it is spelled. qty (a
-- partial buy) and every other column stay mutable; only the three the routing
-- read trusts are frozen.
create or replace function public.hr_market_listing_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.seller_user_id is distinct from old.seller_user_id
     or new.seller_slot is distinct from old.seller_slot
     or new.ask_each   is distinct from old.ask_each then
    raise exception 'market_listings.% is immutable after insert — §4c''s unlocked routing read and '
                    '§7''s price-free buy intent both depend on it never changing',
      (case when new.seller_user_id is distinct from old.seller_user_id then 'seller_user_id'
            when new.seller_slot    is distinct from old.seller_slot    then 'seller_slot'
            else 'ask_each' end)
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.hr_market_listing_immutable() from public;
revoke execute on function public.hr_market_listing_immutable()
  from anon, authenticated, service_role, hr_engine;
drop trigger if exists trg_market_listing_immutable on public.market_listings;
create trigger trg_market_listing_immutable
  before update on public.market_listings
  for each row execute function public.hr_market_listing_immutable();

-- ── 2. RLS + GRANTS ──────────────────────────────────────────────────────
-- Listings are public (it is a market) and writable by nobody.
--
-- SALES ARE NOT PUBLIC (S17). The superseded revision 1 used
-- `for select using (true)` on a table carrying seller_user_id AND
-- buyer_user_id — publishing every player's auth UUID and complete trade
-- history to anyone with the anon key. The price chart needs PRICES, not
-- IDENTITIES, so the chart reads the names-free view below.
alter table public.market_listings enable row level security;
alter table public.market_sales    enable row level security;

drop policy if exists "listings readable" on public.market_listings;
create policy "listings readable" on public.market_listings for select using (true);

drop policy if exists "sales readable"     on public.market_sales;
drop policy if exists "own sales readable" on public.market_sales;
create policy "own sales readable" on public.market_sales
  for select using (auth.uid() = seller_user_id or auth.uid() = buyer_user_id);

-- REVOKE BEFORE GRANT, and note hr_engine is in the revoke list and NOT in the
-- grant list: the engine holds ZERO table privileges across all schemas and
-- this file does not become the exception. It reaches these tables only
-- through the three SECURITY DEFINER functions below.
revoke all on public.market_listings from public, anon, authenticated, service_role, hr_engine;
revoke all on public.market_sales    from public, anon, authenticated, service_role, hr_engine;
grant select on public.market_listings to anon, authenticated, service_role;
grant select on public.market_sales    to authenticated, service_role;
revoke all on sequence public.market_sales_id_seq
  from public, anon, authenticated, service_role, hr_engine;

-- The public price history: what a chart needs and nothing a scammer does.
--
-- ⚠ ACCEPTED ADVISOR EXCEPTION. get_advisors --security flags this with
--   `security_definer_view` (ERROR), the same lint that already fires on five
--   leaderboard views in production. That is CORRECT and INTENDED: the point is
--   to expose aggregate prices while the receipt stays participants-only, and a
--   security_invoker view would return each caller only their own trades — an
--   empty chart. The mitigation is that this view selects NO identity column at
--   all and is bounded to 30 days. If the column list ever changes, re-read
--   this comment before adding one.
--
-- ⚠ WASH TRADES ARE EXCLUDED FROM THE CHART (Security M3). A seller who buys
--   their own goods through a second character (same auth account, different
--   slot) settles a real sale — gold is conserved, the tax is paid — but the
--   PRICE is fictional: it is a number one person paid themselves to plant a
--   floor or a spike. `seller_user_id <> buyer_user_id` drops every such row
--   from the public price history, so a chart a stranger reads cannot be moved
--   by an account trading with itself. It is a DISPLAY control only — the sale
--   itself is legal and journalled (both meta rows carry `self_trade`); Security
--   ruled a price CAP out of scope, so this filters the deception rather than
--   preventing the trade. Same-account cross-slot is the whole wash surface: the
--   own_listing guard already refuses same (user, slot), so the account is the
--   only granularity a wash can hide behind, and the account is what is compared.
--   The compared columns are still NOT selected — the view exposes no identity.
drop view if exists public.market_price_history;
create view public.market_price_history
  with (security_invoker = false) as
  select item_id,
         qty,
         gold_gross,
         (gold_gross / greatest(qty, 1)) as each,
         at
    from public.market_sales
   where at > now() - interval '30 days'
     and seller_user_id <> buyer_user_id;
revoke all on public.market_price_history from public, anon, authenticated, service_role, hr_engine;
grant select on public.market_price_history to anon, authenticated, service_role;

-- ── 3. CONFIG — tunable without a code deploy, readable by nobody who matters ─
create table if not exists public.hr_market_config (
  only_row      boolean primary key default true check (only_row),
  house_tax_bp  int    not null default 150     check (house_tax_bp between 0 and 2000),
  listing_ttl_h int    not null default 48      check (listing_ttl_h between 1 and 720),
  max_listings  int    not null default 12      check (max_listings between 1 and 500),
  max_qty       bigint not null default 1000000 check (max_qty > 0)
);
insert into public.hr_market_config (only_row) values (true) on conflict do nothing;

-- THE PER-TRADE GROSS CEILING. New in this revision, and it is what makes the
-- overflow argument in §7(e) a bound rather than a hope: qty and ask_each are
-- each bounded, but their PRODUCT is what a value transfer is made of, and
-- 1e6 x 1e9 = 1e15 is a legal listing under the two separate bounds. A ceiling
-- on the product is the only place that can be said. Added separately and
-- idempotently because the table above is `create table if not exists`.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='hr_market_config'
                    and column_name='max_gross') then
    alter table public.hr_market_config
      add column max_gross bigint not null default 100000000;
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.hr_market_config'::regclass
                    and conname = 'hr_market_config_max_qty_ceiling') then
    update public.hr_market_config set max_qty = least(max_qty, 100000000);
    alter table public.hr_market_config
      add constraint hr_market_config_max_qty_ceiling check (max_qty <= 100000000);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.hr_market_config'::regclass
                    and conname = 'hr_market_config_max_gross_ceiling') then
    update public.hr_market_config set max_gross = least(max_gross, 1000000000000);
    alter table public.hr_market_config
      add constraint hr_market_config_max_gross_ceiling
      check (max_gross > 0 and max_gross <= 1000000000000);
  end if;
end $$;

alter table public.hr_market_config enable row level security;
drop policy if exists "market config readable" on public.hr_market_config;
create policy "market config readable" on public.hr_market_config for select using (true);
revoke all on public.hr_market_config from public, anon, authenticated, service_role, hr_engine;
grant select on public.hr_market_config to anon, authenticated, service_role;

-- ── 4. THE DISPLAY NAME, DERIVED (S7) ────────────────────────────────────
-- Not callable by ANY role, hr_engine included. The superseded revision 1 left
-- it on PUBLIC EXECUTE, which made it an anonymous "give me the display name
-- for this UUID" endpoint. It is only ever called from inside a SECURITY
-- DEFINER function in this file, so it needs no grant at all.
create or replace function public.hr_display_name_of(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select display_name from public.profiles where id = p_user), 'Adventurer')
$$;
revoke execute on function public.hr_display_name_of(uuid) from public;
revoke execute on function public.hr_display_name_of(uuid)
  from anon, authenticated, service_role, hr_engine;

-- ── 4c. THE LOCK ORDER, STATED ONCE FOR THE WHOLE FILE (R6/R7) ───────────
--   1. the ACTING characters' advisory locks, in CANONICAL (user_id, slot)
--      ascending order — one for list/cancel, TWO for buy
--   2. the market_listings row                       select … for update
--   3. player_state rows                             ascending (user_id, slot)
--   4. player_inventory rows
--
-- hr_apply takes 3 then 4 and never touches 2, so it is consistent by
-- construction; hr_unlock_buy likewise. The advisory key is hr_apply's exactly
-- (`hashtextextended(user:slot, 0)`) — a DIFFERENT key would let a purchase and
-- an accrual run concurrently on one character, which is the read-modify-write
-- this architecture exists to prevent.
--
-- WHY market_buy TAKES THE SELLER'S LOCK TOO, AND WHY IT CANNOT DEADLOCK: the
-- pair is always taken in canonical order, so two players buying from each
-- other simultaneously request the SAME two locks in the SAME order and one
-- simply waits. It also means the seller's lock serialises every trade against
-- that seller — which is what makes the listing row lock (step 2) reachable
-- only by holders of it, so no cycle through step 2 exists either.
--
-- THE ONE WRINKLE, in cancel and buy: the advisory key depends on the SELLER's
-- (user, slot), which lives on the listing. So both read the listing UNLOCKED
-- to derive the key, take the locks, then re-read FOR UPDATE and re-validate
-- everything. That is safe because seller_user_id and seller_slot are IMMUTABLE
-- after insert — no statement in this file ever updates them (asserted, §11(j)).
-- The unlocked read is used for ROUTING only; every decision is under the lock.

-- Old signatures from the superseded file, dropped so a client-callable
-- overload cannot survive alongside the engine-only ones. `drop function` on an
-- absent function with `if exists` is a no-op, so this is safe on a fresh
-- database and load-bearing on one that ever ran the 2026-08-11 file.
drop function if exists public.market_list(int, text, bigint, bigint);
drop function if exists public.market_list(int, text, bigint, bigint, uuid);
drop function if exists public.market_cancel(uuid);
drop function if exists public.market_cancel(uuid, uuid);
drop function if exists public.market_buy(int, uuid, bigint);
drop function if exists public.market_buy(int, uuid, bigint, uuid);
drop function if exists public.market_expire(int);
drop function if exists public.hr_intent_claim(uuid, uuid, int, text);
drop function if exists public.hr_intent_record(uuid, uuid, jsonb);

-- ── 5. hr_market_list — ESCROW OUT OF THE REAL INVENTORY ─────────────────
-- The sequence is hr_apply's, statement for statement where the two do the
-- same job: identity → shape → rate → advisory lock → idempotency claim →
-- protected block (row lock, version, validate, write) → journal → record the
-- decision → release the key on version_conflict.
--
-- THE POSSESSION CHECK IS THE ESCROW. There is nothing else to check: the items
-- are DELETEd out of player_inventory, so you cannot list what you do not have,
-- and you cannot list the same stack twice.
create or replace function public.hr_market_list(
  p_user uuid, p_slot int, p_version bigint, p_intent_id uuid,
  p_item_id text, p_qty bigint, p_ask_each bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  -- BLAST RADIUS, not balance (the clan_deposit rule). max_listings already
  -- bounds how many can be OPEN; this bounds the CHURN, which is the dimension
  -- a concurrent cap does not touch — list/cancel/list is otherwise a free
  -- unbounded loop through the escrow path.
  c_max_lists_per_day constant int := 200;
  -- ⚠ AND A SECOND DIMENSION THE COUNT DOES NOT BOUND (Security M2). A count of
  --   listings is not a bound on an ITEM DRAIN: 200 listings of 1e8 units each is
  --   2e10 units of a tradeable item pushed into escrow in a day, under the count
  --   cap, and market gold moves the moment a buyer settles them. This clamps the
  --   escrowed QUANTITY per (character, day), ledger-derived from the same
  --   append-only rows the churn count reads — the clan_deposit shape, one dimension
  --   over. It is a blast-radius fuse, not balance: max_gross already bounds one
  --   listing; this bounds the day. The buyer/seller gold flows have their own
  --   per-day clamps in hr_market_buy; this is the ITEM half of the same fuse.
  c_max_escrow_qty_per_day constant bigint := 10000000000;

  v_uid   uuid;
  v_role  text;
  v_slot  int := coalesce(p_slot, 0);
  v_cfg   public.hr_market_config%rowtype;
  v_st    public.player_state%rowtype;
  v_have  bigint;
  v_open  int;
  v_today int;
  v_esc_today bigint;
  v_day   text;
  v_id    uuid;
  v_prev  jsonb; v_prev_intent text; v_prev_slot int;
  v_claimed boolean := false;
  v_intent text;
  v_out   jsonb;
  v_msg text; v_det text; v_sqlstate text;
begin
  -- (0) THE IDENTITY SEAM — hr_unlock_buy's, verbatim in effect. The engine may
  --     act for a user it names because it has already verified that user's JWT
  --     and holds no table privilege of its own. Nobody else may name a user.
  --     current_user is the OWNER inside a definer function, so the ROLE GUC is
  --     what is read.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role = 'hr_engine' then
    v_uid := coalesce(p_user, auth.uid());
  else
    v_uid := auth.uid();
    if p_user is not null and p_user is distinct from v_uid then
      perform public.hr_record_rejection(v_uid, v_slot, 'market_list', 'forbidden_impersonation',
        jsonb_build_object('claimed_user', p_user, 'role', v_role));
      return jsonb_build_object('ok', false, 'error', 'forbidden_impersonation');
    end if;
  end if;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_intent_id is null then return jsonb_build_object('ok', false, 'error', 'missing_intent_id'); end if;

  -- (1) SHAPE + CATALOGUE, BEFORE ANY LOCK. A refusal that is a fact about the
  --     REQUEST or the CATALOGUE needs no character and no lock, so a client
  --     looping on garbage cannot contend on a real player's state row.
  select * into v_cfg from public.hr_market_config;
  if p_qty is null or p_qty <= 0 or p_qty > v_cfg.max_qty then
    return jsonb_build_object('ok', false, 'error', 'bad_qty',
             'detail', jsonb_build_object('max', v_cfg.max_qty));
  end if;
  if p_ask_each is null or p_ask_each <= 0 or p_ask_each > 1000000000 then
    return jsonb_build_object('ok', false, 'error', 'bad_price');
  end if;
  -- The PRODUCT bound, which neither of the two bounds above can state. Numeric
  -- so the comparison itself cannot overflow (N2).
  if p_qty::numeric * p_ask_each::numeric > v_cfg.max_gross::numeric then
    return jsonb_build_object('ok', false, 'error', 'listing_too_large',
             'detail', jsonb_build_object('max_gross', v_cfg.max_gross));
  end if;
  -- THE TRADEABLE ALLOWLIST, UNCONDITIONAL (S3). hr_items is GENERATED from
  -- src/data/items.js, so bind-on-pickup is authored in exactly one place.
  if p_item_id is null or not exists (select 1 from public.hr_items
                                       where item_id = p_item_id and tradeable) then
    return jsonb_build_object('ok', false, 'error', 'not_tradeable',
             'detail', jsonb_build_object('item_id', p_item_id));
  end if;

  -- (2) RATE — the `apply` budget, deliberately NOT a new namespace: a second
  --     writer with its own allowance would raise a compromised engine's total
  --     reachable write rate. Outside the protected block, so spamming refusals
  --     is not free. (C2) recorded before the return, (S6) sampled.
  if not public.hr_rate_ok(v_uid, 'apply', 240, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'market_list', 'rate_limited',
        jsonb_build_object('limit', 240, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- (3) SERIALISE THIS CHARACTER — hr_apply's key.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- (4) IDEMPOTENCY — hr_apply's rules, on hr_apply's table. The intent NAME
  --     carries everything that changes what the write DOES, because
  --     `intent_mismatch` compares exactly this string: reusing a key for a
  --     different item, count or price is a different intent and is refused.
  v_intent := 'market_list:' || p_item_id || ':' || p_qty::text || ':' || p_ask_each::text;
  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents
   where user_id = v_uid and intent_id = p_intent_id;
  if found then
    if v_prev_intent is distinct from v_intent or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_intent,
                           'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then
      return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
    end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || (v_prev - 'ok') || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;
  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_intent_id, v_slot, v_intent)
  on conflict (user_id, intent_id) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
  end if;
  v_claimed := true;

  -- ══ THE PROTECTED BLOCK ═══════════════════════════════════════════════
  begin
    select * into v_st from public.player_state
      where user_id = v_uid and slot = v_slot for update;
    if not found then perform public.hr_reject('no_character'); end if;

    -- (a) OPTIMISTIC CONCURRENCY — MANDATORY. A missing version IS a conflict.
    if p_version is null or p_version <> v_st.version then
      perform public.hr_reject('version_conflict', jsonb_build_object('version', v_st.version));
    end if;

    -- (b) THE PER-DAY CHURN CLAMP, read from the APPEND-ONLY LEDGER rather than
    --     from a counter this function maintains — the clan_deposit pattern. A
    --     counter is a second source of truth with a reset button; the ledger is
    --     the record the audit reads anyway.
    v_day := public.hr_utc_day_key(now());
    select count(*) into v_today from public.player_ledger
     where user_id = v_uid and slot = v_slot
       and kind = 'trade' and intent like 'market\_list:%'
       and public.hr_utc_day_key(at) = v_day;
    if v_today >= c_max_lists_per_day then
      perform public.hr_reject('market_list_daily_cap',
        jsonb_build_object('used', v_today, 'limit', c_max_lists_per_day, 'day', v_day));
    end if;

    -- (b2) THE PER-DAY ESCROWED-QUANTITY CLAMP (Security M2). Sum the QUANTITY
    --     escrowed by this character today from the same append-only ledger the
    --     count above reads — `qty` is negative on a market_list row (items left
    --     the bag), so `sum(-qty)` is the day's escrowed total. A count of
    --     listings is not a bound on an item drain; this is.
    select coalesce(sum(-qty), 0) into v_esc_today from public.player_ledger
     where user_id = v_uid and slot = v_slot
       and kind = 'trade' and intent like 'market\_list:%'
       and public.hr_utc_day_key(at) = v_day;
    if v_esc_today + p_qty > c_max_escrow_qty_per_day then
      perform public.hr_reject('market_escrow_daily_cap',
        jsonb_build_object('used', v_esc_today, 'need', p_qty,
                           'limit', c_max_escrow_qty_per_day, 'day', v_day));
    end if;

    -- (c) THE OPEN-LISTING CAP. Bounded: the question is "at the cap?", never
    --     "how many exactly?" — a count(*) over a seller with 10,000 rows is
    --     work proportional to their history on every list.
    select count(*) into v_open from (
      select 1 from public.market_listings
       where seller_user_id = v_uid and seller_slot = v_slot
       limit v_cfg.max_listings) s;
    if v_open >= v_cfg.max_listings then
      perform public.hr_reject('too_many_listings', jsonb_build_object('limit', v_cfg.max_listings));
    end if;

    -- (d) THE ESCROW. This IS the possession check.
    select qty into v_have from public.player_inventory
     where user_id = v_uid and slot = v_slot and item_id = p_item_id for update;
    v_have := coalesce(v_have, 0);
    if v_have < p_qty then
      perform public.hr_reject('insufficient_item',
        jsonb_build_object('item_id', p_item_id, 'have', v_have, 'need', p_qty));
    end if;
    if v_have = p_qty then
      delete from public.player_inventory
       where user_id = v_uid and slot = v_slot and item_id = p_item_id;
    else
      update public.player_inventory set qty = v_have - p_qty
       where user_id = v_uid and slot = v_slot and item_id = p_item_id;
    end if;

    -- (e) THE LISTING. seller_name is DERIVED; posted_at and expires_at come
    --     from now(). Not one of the three is a caller value.
    insert into public.market_listings
      (seller_user_id, seller_slot, seller_name, item_id, qty, ask_each, expires_at)
    values
      (v_uid, v_slot, public.hr_display_name_of(v_uid), p_item_id, p_qty, p_ask_each,
       now() + make_interval(hours => v_cfg.listing_ttl_h))
    returning id into v_id;

    -- (f) THE VERSION (S15). The inventory changed, so any delta a client is
    --     still computing against the old inventory must now be refused.
    --     ⚠ accrued_to IS NOT TOUCHED: listing is not an activity change, so the
    --       unpaid accrual window survives it (intents.js rule 3).
    update public.player_state set version = version + 1, updated_at = now()
     where user_id = v_uid and slot = v_slot;

    -- (g) THE JOURNAL. ONE row. `qty` is negative — the items left the bag.
    --     gold_in/xp_in/qty_in/gems_in are ZERO and EXPLICIT: NULL there means
    --     "not written by hr_apply", and this row WAS written by an engine RPC
    --     that minted nothing. Escrow is a move, not an inflow.
    insert into public.player_ledger
      (user_id, slot, kind, intent, item_id, qty, gold_in, xp_in, qty_in, gems_in, meta)
    values
      (v_uid, v_slot, 'trade', v_intent, p_item_id, -p_qty, 0, 0, 0, 0,
       jsonb_build_object('listing', v_id, 'ask_each', p_ask_each, 'escrow', true));

    v_out := public.hr_state_of(v_uid, v_slot)
             || jsonb_build_object('listed', jsonb_build_object(
                  'listing_id', v_id, 'item_id', p_item_id,
                  'qty', p_qty, 'ask_each', p_ask_each));

  exception
    when sqlstate 'HR000' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
      v_out := jsonb_build_object('ok', false, 'error', v_msg)
               || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
    when invalid_text_representation or numeric_value_out_of_range
      or check_violation or not_null_violation or foreign_key_violation
      or unique_violation or datatype_mismatch then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_msg = message_text;
      v_out := jsonb_build_object('ok', false, 'error', 'bad_market_write',
                                  'sqlstate', v_sqlstate, 'detail', v_msg);
  end;

  -- (5) RECORD THE DECISION, outside the protected block so it survives a
  --     rejection — and RELEASE the key on a version conflict (b346's rule):
  --     that answer is a statement about the CALLER'S READ, it rolled back in
  --     full, and the defined recovery is "re-read and retry". Storing it turns
  --     an ordinary concurrency outcome into a 25-hour lockout for that key.
  --     `v_claimed` narrows it to keys THIS call inserted, so a mismatch against
  --     somebody's stored SUCCESS can never free it.
  if v_claimed
     and coalesce(v_out->>'ok', 'false') <> 'true'
     and v_out->>'error' = 'version_conflict' then
    delete from public.player_intents where user_id = v_uid and intent_id = p_intent_id;
  else
    update public.player_intents
       set result = case when coalesce(v_out->>'ok','false') = 'true'
                         then jsonb_build_object('ok', true, 'listed', v_out->'listed')
                         else v_out end
     where user_id = v_uid and intent_id = p_intent_id;
  end if;

  if coalesce(v_out->>'ok', 'false') <> 'true' then
    perform public.hr_record_rejection(v_uid, v_slot, v_intent, v_out->>'error',
                                       v_out - 'ok' - 'error');
  end if;
  return v_out;
end $$;

-- ── 6. hr_market_cancel — THE ESCROW COMES BACK, EXACTLY ONCE ────────────
-- ⚠ THE DELETE IS THE ARBITER. `delete … returning *` under the seller's
--   advisory lock: whoever's DELETE returns a row owns the escrow. hr_market_
--   expire does the same. Two paths can therefore both TRY to return one
--   listing's goods and exactly one can succeed, without either needing to know
--   the other exists — which is the property "escrow cannot be double-
--   collected" reduces to once there is no collect step.
create or replace function public.hr_market_cancel(
  p_user uuid, p_slot int, p_version bigint, p_intent_id uuid, p_listing_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid;
  v_role text;
  v_slot int := coalesce(p_slot, 0);
  v_route public.market_listings%rowtype;
  v_row  public.market_listings%rowtype;
  v_st   public.player_state%rowtype;
  v_stacks int;
  v_prev jsonb; v_prev_intent text; v_prev_slot int;
  v_claimed boolean := false;
  v_intent text;
  v_out  jsonb;
  v_msg text; v_det text; v_sqlstate text;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role = 'hr_engine' then
    v_uid := coalesce(p_user, auth.uid());
  else
    v_uid := auth.uid();
    if p_user is not null and p_user is distinct from v_uid then
      perform public.hr_record_rejection(v_uid, v_slot, 'market_cancel', 'forbidden_impersonation',
        jsonb_build_object('claimed_user', p_user, 'role', v_role));
      return jsonb_build_object('ok', false, 'error', 'forbidden_impersonation');
    end if;
  end if;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_intent_id is null then return jsonb_build_object('ok', false, 'error', 'missing_intent_id'); end if;
  if p_listing_id is null then return jsonb_build_object('ok', false, 'error', 'gone'); end if;

  if not public.hr_rate_ok(v_uid, 'apply', 240, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'market_cancel', 'rate_limited',
        jsonb_build_object('limit', 240, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- ⚠ (R) THE REPLAY PRE-CHECK MUST PRECEDE THE ROUTING READ. FOUND BY
  --   tests/market-v2.mjs M6, ON THE FIRST RUN OF THIS FILE, and it is the
  --   subtlest defect in the whole design:
  --
  --   A successful cancel DELETES the listing. So a retry of that exact intent
  --   — the honest shape of a lost response — reached the routing read first,
  --   found nothing, and answered `gone`. That is not idempotency: the client
  --   asked "did my cancel land?" and was told "there is no such listing",
  --   which is indistinguishable from "it expired" or "you already sold it".
  --   The identical defect sat in hr_market_buy for a fully-consumed listing.
  --   Everything downstream was correct — nothing was applied twice — and the
  --   ANSWER was still wrong, which is the half a conservation check cannot see.
  --
  --   The pre-check is UNLOCKED and that is safe, because it only short-circuits
  --   on an intent that has ALREADY BEEN DECIDED (a stored result). It never
  --   claims; the claim stays under the lock below, where a concurrent claim of
  --   the same key is still answered `intent_in_flight`. The intent NAME is
  --   derivable from the request alone, so this needs no listing row.
  v_intent := 'market_cancel:' || p_listing_id::text;
  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents
   where user_id = v_uid and intent_id = p_intent_id;
  if found then
    if v_prev_intent is distinct from v_intent or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_intent,
                           'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then
      return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
    end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || (v_prev - 'ok') || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;

  -- ROUTING READ, UNLOCKED (§4c). Used ONLY to fail fast and to confirm this
  -- caller is the seller before taking a lock; every decision is re-made under
  -- the lock below. Safe because seller_user_id/seller_slot are immutable.
  select * into v_route from public.market_listings where id = p_listing_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
  if v_route.seller_user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'not_yours');
  end if;
  -- ⚠ THE SLOT IS THE LISTING'S, NOT THE REQUEST'S. A seller on slot 2 must not
  --   be able to cancel a slot-0 listing into slot 2's bag: the escrow came out
  --   of the slot that listed it and it goes back there. So the request's slot
  --   must AGREE, and a disagreement is a named refusal rather than a silent
  --   redirection of goods between two characters of the same account.
  if v_route.seller_slot <> v_slot then
    return jsonb_build_object('ok', false, 'error', 'wrong_slot',
             'detail', jsonb_build_object('listing_slot', v_route.seller_slot, 'sent_slot', v_slot));
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- THE CLAIM, under the lock. The branches above are repeated because the
  -- pre-check was unlocked: another call may have claimed this key in between,
  -- and the answer to that is `intent_in_flight`, not a second cancel.
  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents
   where user_id = v_uid and intent_id = p_intent_id;
  if found then
    if v_prev_intent is distinct from v_intent or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_intent,
                           'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then
      return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
    end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || (v_prev - 'ok') || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;
  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_intent_id, v_slot, v_intent)
  on conflict (user_id, intent_id) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
  end if;
  v_claimed := true;

  begin
    select * into v_st from public.player_state
      where user_id = v_uid and slot = v_slot for update;
    if not found then perform public.hr_reject('no_character'); end if;
    if p_version is null or p_version <> v_st.version then
      perform public.hr_reject('version_conflict', jsonb_build_object('version', v_st.version));
    end if;

    -- THE ARBITER. Not "read then delete" — the DELETE is the read. If it
    -- returns nothing, hr_market_expire (or a racing retry) already took this
    -- listing and returned its goods, and there is nothing left to give back.
    delete from public.market_listings
     where id = p_listing_id and seller_user_id = v_uid and seller_slot = v_slot
    returning * into v_row;
    if not found then perform public.hr_reject('gone'); end if;

    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (v_uid, v_slot, v_row.item_id, v_row.qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;

    -- The returning stack can push the seller over the bank cap. The superseded
    -- revision 1 let it, quietly making the cap advisory for anyone who listed
    -- at cap. Bounded scan: cap+1 rows, never the whole bag.
    select count(*) into v_stacks from (
      select 1 from public.player_inventory
       where user_id = v_uid and slot = v_slot
       limit coalesce(v_st.bank_cap, 100) + 1) s;
    if v_stacks > coalesce(v_st.bank_cap, 100) then
      perform public.hr_reject('bank_full',
        jsonb_build_object('stacks', v_stacks, 'cap', v_st.bank_cap));
    end if;

    update public.player_state set version = version + 1, updated_at = now()
     where user_id = v_uid and slot = v_slot;

    insert into public.player_ledger
      (user_id, slot, kind, intent, item_id, qty, gold_in, xp_in, qty_in, gems_in, meta)
    values
      (v_uid, v_slot, 'trade', v_intent, v_row.item_id, v_row.qty, 0, 0, 0, 0,
       jsonb_build_object('listing', p_listing_id, 'escrow_return', true));

    v_out := public.hr_state_of(v_uid, v_slot)
             || jsonb_build_object('cancelled', jsonb_build_object(
                  'listing_id', p_listing_id, 'item_id', v_row.item_id, 'qty', v_row.qty));

  exception
    when sqlstate 'HR000' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
      v_out := jsonb_build_object('ok', false, 'error', v_msg)
               || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
    when invalid_text_representation or numeric_value_out_of_range
      or check_violation or not_null_violation or foreign_key_violation
      or unique_violation or datatype_mismatch then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_msg = message_text;
      v_out := jsonb_build_object('ok', false, 'error', 'bad_market_write',
                                  'sqlstate', v_sqlstate, 'detail', v_msg);
  end;

  if v_claimed
     and coalesce(v_out->>'ok', 'false') <> 'true'
     and v_out->>'error' = 'version_conflict' then
    delete from public.player_intents where user_id = v_uid and intent_id = p_intent_id;
  else
    update public.player_intents
       set result = case when coalesce(v_out->>'ok','false') = 'true'
                         then jsonb_build_object('ok', true, 'cancelled', v_out->'cancelled')
                         else v_out end
     where user_id = v_uid and intent_id = p_intent_id;
  end if;

  if coalesce(v_out->>'ok', 'false') <> 'true' then
    perform public.hr_record_rejection(v_uid, v_slot, v_intent, v_out->>'error',
                                       v_out - 'ok' - 'error');
  end if;
  return v_out;
end $$;

-- ── 7. hr_market_buy — THE WHOLE TRADE, IN ONE TRANSACTION ───────────────
-- THIS IS THE FIRST FUNCTION IN HEARTHRISE THAT MOVES VALUE BETWEEN TWO
-- PLAYERS. Everything about it is written for that:
--   · both advisory locks, in canonical order, so the cycle is unconstructible
--   · the price comes off the LOCKED LISTING ROW, never from the caller
--   · the seller is credited and the credit's row_count is CHECKED (S11) — a
--     sale to a seller with no state row must REFUSE, not destroy the gold
--   · per-day clamps on BOTH sides of the transfer, from the append-only ledger
--   · TWO journal rows, one per party, both stamped `transfer`
create or replace function public.hr_market_buy(
  p_user uuid, p_slot int, p_version bigint, p_intent_id uuid,
  p_listing_id uuid, p_qty bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  -- ⚠ BLAST RADIUS, NOT BALANCE — and these are NOT hr_day_budget_check.
  --   That ceiling exists to bound a compromised engine MINTING gold, and it is
  --   deliberately not consulted here, for a reason that would otherwise be a
  --   live griefing vector: market gold is CONSERVED (buyer -gross, seller +net,
  --   tax burned), so charging a sale against the seller's daily INFLOW budget
  --   would let a stranger buy a seller's cheap listings and lock them out of
  --   their own accrual for the rest of the day. Transfers get their own
  --   dimension, on both sides, so that a runaway loop is still bounded without
  --   one player's spending being able to consume another's mint budget.
  c_max_spend_per_day    constant bigint := 1000000000;   -- gold a buyer may send
  c_max_proceeds_per_day constant bigint := 1000000000;   -- gold a seller may receive

  v_uid   uuid;
  v_role  text;
  v_slot  int := coalesce(p_slot, 0);
  v_route public.market_listings%rowtype;
  v_row   public.market_listings%rowtype;
  v_cfg   public.hr_market_config%rowtype;
  v_st    public.player_state%rowtype;
  v_gross_n numeric;
  v_gross bigint; v_tax bigint; v_net bigint;
  v_stacks int; v_rows int;
  v_day   text; v_spent bigint; v_recv bigint;
  v_prev  jsonb; v_prev_intent text; v_prev_slot int;
  v_claimed boolean := false;
  v_intent text;
  v_out   jsonb;
  v_msg text; v_det text; v_sqlstate text;
begin
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role = 'hr_engine' then
    v_uid := coalesce(p_user, auth.uid());
  else
    v_uid := auth.uid();
    if p_user is not null and p_user is distinct from v_uid then
      perform public.hr_record_rejection(v_uid, v_slot, 'market_buy', 'forbidden_impersonation',
        jsonb_build_object('claimed_user', p_user, 'role', v_role));
      return jsonb_build_object('ok', false, 'error', 'forbidden_impersonation');
    end if;
  end if;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_intent_id is null then return jsonb_build_object('ok', false, 'error', 'missing_intent_id'); end if;
  if p_listing_id is null then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
  if p_qty is null or p_qty <= 0 then return jsonb_build_object('ok', false, 'error', 'bad_qty'); end if;

  select * into v_cfg from public.hr_market_config;

  if not public.hr_rate_ok(v_uid, 'apply', 240, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'market_buy', 'rate_limited',
        jsonb_build_object('limit', 240, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- ⚠ (R) THE REPLAY PRE-CHECK, AHEAD OF THE ROUTING READ. See the long note in
  --   §6: a buy that consumed the whole listing DELETES it, so a retry of that
  --   exact intent reached the routing read first and answered `gone` — the
  --   client asking "did my purchase land?" and being told "somebody else bought
  --   it". Nothing was applied twice and the ANSWER was still wrong, which is
  --   the half a conservation check cannot see. Found by tests/market-v2.mjs M6.
  --   Unlocked and safe: it short-circuits only on an ALREADY-DECIDED intent and
  --   never claims. The intent name is derivable from the request alone.
  v_intent := 'market_buy:' || p_listing_id::text || ':' || p_qty::text;
  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents
   where user_id = v_uid and intent_id = p_intent_id;
  if found then
    if v_prev_intent is distinct from v_intent or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_intent,
                           'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then
      return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
    end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || (v_prev - 'ok') || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;

  -- ROUTING READ, UNLOCKED (§4c) — it exists only to learn WHOSE advisory lock
  -- to take second. Everything is re-read under the locks.
  select * into v_route from public.market_listings where id = p_listing_id;
  if not found then
    -- (M9) A SILENT REFUSAL LEAVES NO TRACE. `gone` is ordinary contention —
    --   someone bought the listing out from under this caller — so it is SAMPLED,
    --   the rate-limit branch's mechanism reused: hr_record_rejection aggregates
    --   one row per (character, code, day), but the UPDATE still costs a row lock,
    --   and a hot market makes `gone` frequent. hr_rate_sample_weight fires only
    --   at the caller's 1st, 10th, 50th, 1,000th… apply-bucket call this window
    --   (the gate already bumped it above), carrying a weight so the aggregate `n`
    --   still counts real events. Enough to see a pattern, cheap enough not to
    --   amplify (the game_events 1.6M-row lesson).
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply')) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'gone',
        jsonb_build_object('listing', p_listing_id, 'stage', 'routing'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply')));
    end if;
    return jsonb_build_object('ok', false, 'error', 'gone');
  end if;
  if v_route.seller_user_id = v_uid and v_route.seller_slot = v_slot then
    -- (S9) JOURNALLED. Buying your own listing is refused, but a refusal that
    -- leaves no trace is a refusal nobody can investigate: repeated
    -- `own_listing` is the wash-trading signature — someone establishing a fake
    -- price history, or probing whether the self-trade guard can be raced into
    -- paying the house tax to themselves. Aggregated per (character, code, day).
    perform public.hr_record_rejection(v_uid, v_slot, 'market_buy', 'own_listing',
      jsonb_build_object('listing', p_listing_id, 'item', v_route.item_id,
                         'qty', p_qty, 'ask_each', v_route.ask_each));
    return jsonb_build_object('ok', false, 'error', 'own_listing');
  end if;

  -- (1) BOTH ADVISORY LOCKS, IN CANONICAL ORDER (S16), AS TWO EXPLICIT CALLS
  --     UNDER AN EXPLICIT BRANCH (Security M8). Ordered by (user_id::text, slot)
  --     ascending so two players buying from each other request the SAME two locks
  --     in the SAME order and one waits instead of deadlocking.
  --     ⚠ WHY NOT AN ORDERED SUBQUERY. The first revision acquired both locks in
  --       one `perform pg_advisory_xact_lock(k) from (… order by u, s)`. That
  --       relies on the planner acquiring the lock function in the SORTED order —
  --       i.e. on volatile-function postponement past the Sort — which is planner
  --       behaviour, not a guarantee: a plan that evaluated the lock before the
  --       sort would take them in scan order, and two buyers crossing would then
  --       deadlock (40P01), an unhandled 500 in the MIDDLE of a value transfer.
  --       The comparison is spelled out and the two locks are separate statements
  --       so the order is the code's, not the optimiser's.
  --     ⚠ SAME-USER, DIFFERENT-SLOT is a real case (a player's slot 0 buying
  --       from their own slot 2) and it is allowed: they are different characters
  --       with different bags. The pair is DISTINCT by construction because the
  --       self-trade guard above rejected the equal (user, slot) case, so exactly
  --       one branch runs and two distinct keys are taken.
  if (v_uid::text, v_slot) < (v_route.seller_user_id::text, v_route.seller_slot) then
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));
    perform pg_advisory_xact_lock(
      hashtextextended(v_route.seller_user_id::text || ':' || v_route.seller_slot::text, 0));
  else
    perform pg_advisory_xact_lock(
      hashtextextended(v_route.seller_user_id::text || ':' || v_route.seller_slot::text, 0));
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));
  end if;

  -- (2) THE LISTING, UNDER THE LOCKS. Everything from here is the row's, not
  --     the routing read's — including ask_each, which is the price the buyer
  --     is charged and the one number the caller most wants to author.
  select * into v_row from public.market_listings where id = p_listing_id for update;
  if not found then
    -- (M9) sampled — see the routing `gone` above for the mechanism and why.
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply')) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'gone',
        jsonb_build_object('listing', p_listing_id, 'stage', 'locked'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply')));
    end if;
    return jsonb_build_object('ok', false, 'error', 'gone');
  end if;
  if v_row.seller_user_id <> v_route.seller_user_id
     or v_row.seller_slot <> v_route.seller_slot then
    -- Unreachable: the columns are immutable (§1b trigger + §11(j)). Refused
    -- rather than asserted, because the failure mode of trusting it is a trade
    -- settled under one player's lock and credited to another's row. (M9) It is
    -- ALSO recorded UNCONDITIONALLY, not sampled: unlike `gone`/`expired`/
    -- `not_enough` this is not ordinary contention — reaching it means the
    -- immutability trigger was somehow bypassed, which is an incident.
    perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'listing_moved',
      jsonb_build_object('listing', p_listing_id,
                         'route', jsonb_build_object('u', v_route.seller_user_id, 's', v_route.seller_slot),
                         'locked', jsonb_build_object('u', v_row.seller_user_id, 's', v_row.seller_slot)));
    return jsonb_build_object('ok', false, 'error', 'listing_moved');
  end if;
  if v_row.expires_at <= now() then
    -- (M9) sampled — expiry racing a buy is ordinary contention.
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply')) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'expired',
        jsonb_build_object('listing', p_listing_id),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply')));
    end if;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if v_row.qty < p_qty then
    -- (M9) sampled — a partial-buy race that leaves fewer than asked is contention.
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply')) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'not_enough',
        jsonb_build_object('listing', p_listing_id, 'available', v_row.qty, 'need', p_qty),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply')));
    end if;
    return jsonb_build_object('ok', false, 'error', 'not_enough',
             'detail', jsonb_build_object('available', v_row.qty));
  end if;

  -- (3) THE CLAIM, under both locks. The intent name carries the LISTING and the
  --     COUNT — but NOT the price, deliberately: the price is a property of the
  --     listing id and cannot change while the row exists (no statement updates
  --     ask_each, §11(j)), so including it would only create a spurious mismatch
  --     class. The branches are repeated from the (R) pre-check because that one
  --     was unlocked: another call may have claimed this key in between, and the
  --     answer to that is `intent_in_flight`, not a second trade.
  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents
   where user_id = v_uid and intent_id = p_intent_id;
  if found then
    if v_prev_intent is distinct from v_intent or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_intent,
                           'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then
      return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
    end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || (v_prev - 'ok') || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;
  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_intent_id, v_slot, v_intent)
  on conflict (user_id, intent_id) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
  end if;
  v_claimed := true;

  begin
    -- (4) BOTH player_state ROWS, in canonical order, in ONE statement. The
    --     LockRows node sits above the Sort, so the rows really are locked in
    --     the sorted order rather than in whatever order the scan produced them.
    perform 1 from public.player_state
      where (user_id, slot) in ((v_uid, v_slot), (v_row.seller_user_id, v_row.seller_slot))
      order by user_id, slot
      for update;

    select * into v_st from public.player_state
     where user_id = v_uid and slot = v_slot;
    if not found then perform public.hr_reject('no_character'); end if;
    if p_version is null or p_version <> v_st.version then
      perform public.hr_reject('version_conflict', jsonb_build_object('version', v_st.version));
    end if;

    -- (5) THE ARITHMETIC (N2). In NUMERIC, which cannot overflow at all, and
    --     bounded against the config's gross ceiling BEFORE any cast to bigint.
    --     The superseded revision computed `v_gross * house_tax_bp` in bigint:
    --     at the config's own legal ceiling that is 1.5e19, past bigint's
    --     9.22e18, raising 22003 as an unhandled 500 for the BUYER — so any
    --     seller could craft a listing that 500s everyone who touched it.
    v_gross_n := p_qty::numeric * v_row.ask_each::numeric;
    if v_gross_n > v_cfg.max_gross::numeric then
      perform public.hr_reject('trade_too_large',
        jsonb_build_object('gross', v_gross_n, 'max_gross', v_cfg.max_gross));
    end if;
    v_gross := v_gross_n::bigint;
    -- THE GOLD SINK, ROUNDED UP (Game Designer ruling on Security cond. 12). ceil,
    -- not trunc: trunc lets a whole-number split to zero (sixty 1-gold buys paid 0
    -- tax; ceil makes them pay 60), and rounding in the SINK's favour is correct
    -- for an anti-inflation drain. NO max(1,…) floor — ceil(0)=0 keeps a disabled
    -- tax (house_tax_bp=0) disabled, which a floor would wrongly override. The §7(5)
    -- overflow guard is unaffected: ceil adds at most 1 to an already-bounded product.
    v_tax   := ceil(v_gross_n * v_cfg.house_tax_bp::numeric / 10000)::bigint;
    v_net   := v_gross - v_tax;

    -- (6) THE PER-DAY TRANSFER CLAMPS, both from the append-only ledger.
    v_day := public.hr_utc_day_key(now());
    select coalesce(sum(-gold), 0) into v_spent from public.player_ledger
     where user_id = v_uid and slot = v_slot
       and kind = 'trade' and intent like 'market\_buy:%'
       and public.hr_utc_day_key(at) = v_day;
    if v_spent + v_gross > c_max_spend_per_day then
      perform public.hr_reject('market_spend_daily_cap',
        jsonb_build_object('used', v_spent, 'need', v_gross,
                           'limit', c_max_spend_per_day, 'day', v_day));
    end if;
    select coalesce(sum(gold), 0) into v_recv from public.player_ledger
     where user_id = v_row.seller_user_id and slot = v_row.seller_slot
       and kind = 'trade' and intent like 'market\_sold:%'
       and public.hr_utc_day_key(at) = v_day;
    if v_recv + v_net > c_max_proceeds_per_day then
      -- ⚠ THE BUYER IS TOLD, because the buyer is the caller. Named distinctly
      --   from the spend cap so a support ticket can tell "you have spent
      --   enough today" from "this seller has been paid enough today".
      perform public.hr_reject('market_proceeds_daily_cap',
        jsonb_build_object('seller_used', v_recv, 'need', v_net,
                           'limit', c_max_proceeds_per_day, 'day', v_day));
    end if;

    -- (7) BUYER: funds, checked under the lock against the server's own row —
    --     the check v1's buy_listing never made, because it had nothing
    --     authoritative to check against.
    if v_st.gold < v_gross then
      perform public.hr_reject('insufficient_gold',
        jsonb_build_object('have', v_st.gold, 'need', v_gross));
    end if;

    update public.player_state set gold = gold - v_gross, version = version + 1, updated_at = now()
     where user_id = v_uid and slot = v_slot;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (v_uid, v_slot, v_row.item_id, p_qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;

    select count(*) into v_stacks from (
      select 1 from public.player_inventory
       where user_id = v_uid and slot = v_slot
       limit coalesce(v_st.bank_cap, 100) + 1) s;
    if v_stacks > coalesce(v_st.bank_cap, 100) then
      perform public.hr_reject('bank_full',
        jsonb_build_object('stacks', v_stacks, 'cap', v_st.bank_cap));
    end if;

    -- (8) SELLER: PAID NOW, online or not. No collect step, so no collect
    --     exploit. row_count IS CHECKED (S11): if the seller has no state row
    --     for that slot the superseded revision 1 silently DESTROYED the gold —
    --     buyer debited, nobody credited. Money must not evaporate; the trade
    --     is refused instead, and the whole block rolls back.
    update public.player_state set gold = gold + v_net, version = version + 1, updated_at = now()
     where user_id = v_row.seller_user_id and slot = v_row.seller_slot;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      perform public.hr_reject('seller_unavailable',
        jsonb_build_object('listing', p_listing_id, 'rows', v_rows));
    end if;

    -- (9) CONSUME THE LISTING under the lock already held.
    if v_row.qty = p_qty then
      delete from public.market_listings where id = p_listing_id;
    else
      update public.market_listings set qty = qty - p_qty where id = p_listing_id;
    end if;

    insert into public.market_sales
      (listing_id, seller_user_id, seller_slot, buyer_user_id, buyer_slot,
       item_id, qty, gold_gross, tax, gold_net)
    values
      (p_listing_id, v_row.seller_user_id, v_row.seller_slot, v_uid, v_slot,
       v_row.item_id, p_qty, v_gross, v_tax, v_net);

    -- (10) TWO JOURNAL ROWS, ONE PER PARTY. gold_in is ZERO on BOTH — see the
    --      clamp note at the top of this function: a transfer mints nothing, and
    --      stamping the seller's side as inflow would spend their mint budget on
    --      somebody else's purchase. `transfer:true` in meta is what lets the
    --      audit tell conserved gold from minted gold without reading intents.
    -- ⚠ `self_trade` STAMPS BOTH ROWS (Security M3). A buyer whose auth account
    --   is the seller's (a same-account, cross-slot wash — the own_listing guard
    --   already refused same (user, slot)) settles a real, conserved sale, but the
    --   price is fictional. The boolean is the audit's handle on that: it is the
    --   condition market_price_history filters on, and it lets an investigation
    --   count a character's wash volume without re-joining seller to buyer. It is
    --   the ACCOUNT comparison, not the slot, because the account is the only
    --   granularity a wash can hide behind.
    insert into public.player_ledger
      (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, gems_in, meta)
    values
      (v_uid, v_slot, 'trade', v_intent, v_row.item_id, p_qty, -v_gross, 0, 0, 0, 0,
       jsonb_build_object('listing', p_listing_id, 'each', v_row.ask_each,
                          'counterparty', v_row.seller_user_id, 'transfer', true,
                          'self_trade', v_row.seller_user_id = v_uid)),
      (v_row.seller_user_id, v_row.seller_slot, 'trade',
       'market_sold:' || p_listing_id::text || ':' || p_qty::text,
       v_row.item_id, -p_qty, v_net, 0, 0, 0, 0,
       jsonb_build_object('listing', p_listing_id, 'each', v_row.ask_each, 'tax', v_tax,
                          'counterparty', v_uid, 'transfer', true,
                          'self_trade', v_row.seller_user_id = v_uid));

    -- (11) THE RECEIPT, STATED BY THE SERVER (C4's rule, applied here). The
    --      Edge Function renders it and must not build one out of its own
    --      numbers: the copy the player SEES would then be the copy nobody
    --      re-validates. Everything below came out of the locked listing row and
    --      the arithmetic that actually charged.
    v_out := public.hr_state_of(v_uid, v_slot)
             || jsonb_build_object('bought', jsonb_build_object(
                  'listing_id', p_listing_id,
                  'item_id', v_row.item_id,
                  'qty', p_qty,
                  'each', v_row.ask_each,
                  'gold_gross', v_gross,
                  'tax', v_tax,
                  'seller_name', v_row.seller_name));

  exception
    when sqlstate 'HR000' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
      v_out := jsonb_build_object('ok', false, 'error', v_msg)
               || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
    when invalid_text_representation or numeric_value_out_of_range
      or check_violation or not_null_violation or foreign_key_violation
      or unique_violation or datatype_mismatch then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_msg = message_text;
      v_out := jsonb_build_object('ok', false, 'error', 'bad_market_write',
                                  'sqlstate', v_sqlstate, 'detail', v_msg);
  end;

  if v_claimed
     and coalesce(v_out->>'ok', 'false') <> 'true'
     and v_out->>'error' = 'version_conflict' then
    delete from public.player_intents where user_id = v_uid and intent_id = p_intent_id;
  else
    update public.player_intents
       set result = case when coalesce(v_out->>'ok','false') = 'true'
                         then jsonb_build_object('ok', true, 'bought', v_out->'bought')
                         else v_out end
     where user_id = v_uid and intent_id = p_intent_id;
  end if;

  if coalesce(v_out->>'ok', 'false') <> 'true' then
    perform public.hr_record_rejection(v_uid, v_slot, v_intent, v_out->>'error',
                                       v_out - 'ok' - 'error');
  end if;
  return v_out;
end $$;

-- ── 8. hr_market_expire — RETURN ESCROW ON EXPIRED LISTINGS ──────────────
-- NOT CALLABLE BY ANY CLIENT ROLE, AND NOT BY THE ENGINE EITHER (S6). The
-- superseded revision granted it to `authenticated` with PUBLIC EXECUTE left in
-- place and p_limit up to 5000 — one anonymous request could force 5,000
-- deletes, 5,000 upserts and 5,000 ledger inserts. It is now callable only by
-- the OWNER, which is how pg_cron runs it (§8b), so it needs no grant at all
-- and adds nothing to the engine's capability list.
--
-- ⚠ IT USES THE SAME DELETE-AS-ARBITER RULE AS CANCEL. `for update skip locked`
--   avoids queueing behind a live trade; the `delete … returning` is what makes
--   the escrow return exactly-once even if a cancel lands in between.
--
-- ⚠ AND IT TAKES THE SELLER'S ADVISORY LOCK BEFORE THE DELETE (Security M1). The
--   `for update skip locked` on the LISTING row is not the seller's serialising
--   key — hr_market_list/cancel/buy serialise on hashtextextended(seller:slot),
--   NOT on the listing row lock, and hr_market_list on a first-of-its-kind item
--   (no existing stack) never touches the listing being expired at all. So a
--   sweep and a concurrent hr_apply/hr_market_list on the SAME (seller, slot)
--   could interleave their player_inventory upserts with no shared lock — the
--   escrow-return upsert here racing the seller's own write, corrupting the row
--   this function is mid-returning. `pg_try_advisory_xact_lock` (TRY, not the
--   blocking form) is the fix: if the seller's character is busy this instant,
--   the sweep SKIPS this listing and the next 5-minute sweep collects it — a few
--   minutes in limbo, never a corrupted bag. Blocking here would let one busy
--   character stall the whole batch.
create or replace function public.hr_market_expire(p_limit int default 200)
returns int language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_row public.market_listings%rowtype; v_n int := 0;
begin
  for v_id in
    select id from public.market_listings where expires_at <= now()
     order by expires_at limit greatest(1, least(200, coalesce(p_limit, 200)))
     for update skip locked
  loop
    -- SERIALISE AGAINST THE SELLER'S CHARACTER — hr_apply's / hr_market_*'s key,
    -- so the escrow-return upsert below cannot interleave with a concurrent write
    -- on the same (seller, slot). Read the seller off the routing row first; TRY,
    -- so a busy character defers to the next sweep instead of stalling the batch.
    select * into v_row from public.market_listings where id = v_id;
    if not found then continue; end if;   -- a cancel or a buy took it first
    if not pg_try_advisory_xact_lock(
         hashtextextended(v_row.seller_user_id::text || ':' || v_row.seller_slot::text, 0)) then
      continue;   -- the seller is mid-transaction; the next 5-minute sweep gets it
    end if;
    delete from public.market_listings where id = v_id returning * into v_row;
    if not found then continue; end if;   -- a cancel or a buy took it first

    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (v_row.seller_user_id, v_row.seller_slot, v_row.item_id, v_row.qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
    -- (S15) The seller's inventory changed under them, so any in-flight delta
    -- computed against the old inventory is stale and must be refused.
    -- ⚠ NO BANK-CAP CHECK HERE, and that is deliberate rather than forgotten:
    --   refusing would mean DESTROYING the escrow of a seller whose bag filled
    --   up while their listing sat. Over-cap by returned escrow is a state the
    --   client already tolerates (it blocks new pickups, it does not delete);
    --   an unreturnable escrow is permanent loss. Cancel CAN refuse because the
    --   seller is present and can retry after making room.
    update public.player_state set version = version + 1, updated_at = now()
     where user_id = v_row.seller_user_id and slot = v_row.seller_slot;
    insert into public.player_ledger
      (user_id, slot, kind, intent, item_id, qty, gold_in, xp_in, qty_in, gems_in, meta)
    values
      (v_row.seller_user_id, v_row.seller_slot, 'trade',
       'market_expire:' || v_row.id::text, v_row.item_id, v_row.qty, 0, 0, 0, 0,
       jsonb_build_object('listing', v_row.id, 'escrow_return', true));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.hr_market_expire(int) from public;
revoke execute on function public.hr_market_expire(int)
  from anon, authenticated, service_role, hr_engine;

-- ── 8a. market_sales RETENTION (RL3) ─────────────────────────────────────
-- The receipt table is append-only in intent and a growth table in practice:
-- one row per trade, forever. The policy ships HERE, with the table, or it does
-- not exist. 180 days is well past the 30-day window market_price_history
-- reads, so pruning can never empty the public price chart.
create or replace function public.market_sales_prune(p_older interval default interval '180 days')
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  delete from public.market_sales
   where at < now() - greatest(interval '31 days', coalesce(p_older, interval '180 days'));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.market_sales_prune(interval) from public;
revoke execute on function public.market_sales_prune(interval)
  from anon, authenticated, service_role, hr_engine;

-- ── 8b. THE CRON REPLACEMENTS ────────────────────────────────────────────
-- The DANGEROUS half — unscheduling the two jobs that would destroy escrow — is
-- in §0c, deliberately ahead of §1. Do not move it back here.
do $$
begin
  -- Every 5 minutes, batched at 200. Frequent because an expired listing is a
  -- player's property sitting in limbo, and nightly is a 24-hour worst case.
  perform public.hr_cron_ensure('hr-market-expire', '*/5 * * * *',
    'select public.hr_market_expire(200)');
  perform public.hr_cron_ensure('hr-market-sales-prune', '45 3 * * *',
    'select public.market_sales_prune()');
end $$;

-- ── 9. GRANTS — REVOKE FROM PUBLIC FIRST, THEN GRANT ─────────────────────
-- Postgres grants EXECUTE to PUBLIC on every new function and Supabase's
-- default ACL adds anon/authenticated/service_role. `create or replace`
-- PRESERVES an existing ACL, so these are restated unconditionally.
--
-- ⚠ IF THE BROWSER COULD CALL hr_market_buy, THE BROWSER COULD SETTLE ANOTHER
--   PLAYER'S TRADE. Not because it could name a price — it cannot — but because
--   the whole transfer would be one call it makes for itself, with p_user its
--   own id, and the only gate would be the gold check. The client sends an
--   INTENT to the Edge Function; the Edge Function is the only caller here.
revoke execute on function public.hr_market_list(uuid, int, bigint, uuid, text, bigint, bigint) from public;
revoke execute on function public.hr_market_list(uuid, int, bigint, uuid, text, bigint, bigint)
  from anon, authenticated, service_role;
grant execute on function public.hr_market_list(uuid, int, bigint, uuid, text, bigint, bigint) to hr_engine;

revoke execute on function public.hr_market_cancel(uuid, int, bigint, uuid, uuid) from public;
revoke execute on function public.hr_market_cancel(uuid, int, bigint, uuid, uuid)
  from anon, authenticated, service_role;
grant execute on function public.hr_market_cancel(uuid, int, bigint, uuid, uuid) to hr_engine;

revoke execute on function public.hr_market_buy(uuid, int, bigint, uuid, uuid, bigint) from public;
revoke execute on function public.hr_market_buy(uuid, int, bigint, uuid, uuid, bigint)
  from anon, authenticated, service_role;
grant execute on function public.hr_market_buy(uuid, int, bigint, uuid, uuid, bigint) to hr_engine;

-- ── 10. THE ENGINE ALLOWLIST — DERIVED, NOT RETYPED ──────────────────────
-- This file TAKES OVER from 2026-08-16-client-write-grant-sweep.sql as the last
-- file that may `create or replace` hr_assert_grant_hygiene. Three reviewed
-- engine grants have to be recorded in check (7)'s c_engine_allow or the
-- nightly pg_cron detector raises on them every night from tomorrow.
--
-- The body below is client-write-grant-sweep's, EXTRACTED programmatically by
-- tools/derive-grant-hygiene.mjs (LINKS[3]) and patched at ONE anchor — an
-- INSERTION at the head of c_engine_allow, so PART 1f-ii grades this link with
-- an EMPTY declared-removals list. Do not hand-edit the block between the
-- markers; run `node tools/derive-grant-hygiene.mjs --write`.
--
-- The detector grants nothing and is revoked from every client role. Restated
-- unconditionally because `create or replace` PRESERVES an existing ACL, so a
-- file that restates a body and forgets this block leaves whatever the previous
-- ACL was — which is the one thing the grant lints are a static defence against.
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

-- ⟦DERIVED hr_assert_grant_hygiene — tools/derive-grant-hygiene.mjs, do not hand-edit⟧
create or replace function public.hr_assert_grant_hygiene(p_strict boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_public_exec   jsonb;   -- D1 + D3: PUBLIC holds EXECUTE (functions AND procedures)
  v_unapproved    jsonb;   -- D2: client-executable but not in the baseline
  v_lost          jsonb;   -- baseline rows whose function is gone (reported)
  v_client_trunc  jsonb;   -- TRUNCATE/REFERENCES/TRIGGER on any relation
  v_defacl_open   jsonb;   -- D4: owners with no fail-closed GLOBAL default ACL
  v_platform      jsonb;   -- residual, reported only
  v_engine_extra  jsonb;   -- S9: hr_engine EXECUTE outside its allowlist
  v_engine_tables jsonb;   -- S9: hr_engine holding any table privilege
  v_ungated       jsonb;   -- A9: client-callable SECURITY DEFINER with no rate gate
  v_report jsonb;

  -- ══════════════════════════════════════════════════════════════════════
  -- S9 — THE hr_engine CAPABILITY PIN, MOVED HERE (Security, 2026-08-11)
  -- ──────────────────────────────────────────────────────────────────────
  -- It used to live in 2026-08-11-market-v2.sql §9(i), which is three defects
  -- at once and the reason it is now here:
  --
  --   1. IT DOES NOT RUN. market-v2 is UNAPPLIED and cannot be applied until
  --      the server owns gold and inventory. A pin inside an unapplied
  --      migration is a comment. hr_assert_grant_hygiene runs at every apply
  --      AND nightly via pg_cron, and its failures surface as maintenance_alerts.
  --   2. IT MATCHED ON `proname`. `p.proname <> all (array[...])` accepts ANY
  --      overload of an approved name — `hr_seed(text)` added next to
  --      `hr_seed(uuid,int,text)` would pass silently. Keyed on
  --      `p.oid::regprocedure::text` an overload is a different string and is
  --      therefore a finding, which is the correct answer.
  --   3. IT FILTERED `prokind = 'f'`. A PROCEDURE was invisible to it — exactly
  --      defect D1 that this file's own rewrite was written to fix, reproduced
  --      one section later.
  --
  -- ⚠ EVERY ENTRY CARRIES A ONE-LINE JUSTIFICATION. In the old list only entry
  --   8 did, which meant the first seven were "bounded and fine" by tradition.
  --   Adding an entry is a CLAIM: read-only or self-validating, and it accepts
  --   no target the caller is not already authorised for. Re-derive that for
  --   the whole list every time it changes.
  c_engine_allow constant text[] := array[
    -- ── ADDED 2026-08-17 — THE THREE MARKET WRITERS ─────────────────────
    -- At the HEAD, an insertion, for the same reason as links 1 and 2: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ THE LARGEST SINGLE WIDENING SINCE hr_apply: three writers at once, and
    -- ONE OF THEM MOVES VALUE BETWEEN TWO PLAYERS. The c_engine_allow claim is
    -- "read-only or SELF-VALIDATING, and it accepts no target the caller is not
    -- already authorised for". None of these is read-only, so the whole claim
    -- rests on the other two clauses, re-derived rather than asserted:
    --
    --   SELF-VALIDATING. The entire caller-supplied surface of the three is a
    --   character slot, an idempotency uuid, a version, and then: an ITEM ID +
    --   COUNT + ASK (list), a LISTING ID (cancel), a LISTING ID + COUNT (buy).
    --   No price crosses on a buy — ask_each is read off the listing row under
    --   its own lock — no timestamp, no name, no fee rate, no counterparty. The
    --   item must be `tradeable` in the generated, client-unwritable hr_items;
    --   the tax rate and every ceiling come from hr_market_config; the seller
    --   name is derived from profiles; every clock is now(). Each function
    --   re-reads its listing FOR UPDATE and re-validates under hr_apply's own
    --   advisory lock, refuses a stale version, and is clamped per call (a gross
    --   ceiling) AND per DAY (list churn; gold sent; gold received) from the
    --   append-only ledger — the dimension a rate limit does not bound.
    --
    --   THE TARGET CLAUSE, STATED HONESTLY (Security M2). The earlier draft
    --   claimed "the engine cannot select a victim". That is FALSE and is the
    --   correction: the engine holds hr_market_list(p_user, …) for ANY user, so a
    --   compromised engine can open a listing FOR a victim it names and then
    --   settle it to itself with hr_market_buy — it can choose both sides of a
    --   trade. What admits these three is therefore NOT "no victim" but BOUNDED
    --   BLAST RADIUS: every path is a CONSERVED transfer of TRADEABLE items
    --   (buyer -gross, seller +net, tax burned — nothing minted, nothing an
    --   honest player did not already own), the item must be `tradeable` in the
    --   client-unwritable hr_items, BOTH SIDES ARE JOURNALLED (transfer +
    --   self_trade in meta), and the flows are CLAMPED PER DAY off the
    --   append-only ledger on three dimensions the engine cannot widen: escrowed
    --   item quantity (list), gold sent (buy) and gold received (buy).
    --   ⚠ THOSE CLAMPS ARE THE MARKET'S OWN, NOT hr_day_budget_check. A market
    --   transfer is conserved, so it is deliberately absent from the mint
    --   budget's qty dimension — charging a sale to the seller's daily inflow
    --   would let a stranger drain their accrual (the griefing vector in
    --   hr_market_buy's header). So the item-drain and gold-move ceilings live
    --   here and only here. p_user is the parameter the engine already passes to
    --   hr_apply.
    --
    --   WHY THE ENGINE NEEDS THEM: hr_apply is single-character by construction
    --   — one lock, one version, one journal target — so a delta shape that
    --   could move a second player's gold would be the most dangerous key in the
    --   engine's vocabulary. Without these three, the only writer of a
    --   cross-player transfer is the client, which is the hole this whole
    --   program was opened to close.
    'hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)',
    'hr_market_cancel(uuid,integer,bigint,uuid,uuid)',
    'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)',
    -- ── ADDED 2026-08-16 — THE FIRST WRITER ADDED SINCE hr_apply ────────
    -- At the HEAD again, and for the same reason as the link above: an
    -- insertion removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim is made on the OTHER clause. It writes
    -- one player_progress unlock row, one player_state gold/version update and
    -- one player_ledger row. SELF-VALIDATING is what admits it, and concretely:
    -- its whole caller-supplied surface is ONE OFFER ID (a primary key in the
    -- generated, client-unwritable hr_unlock_offers) — no price, no quantity,
    -- no item, no rung, no timestamp; every number it writes comes from that
    -- table or from the character's own row read under the SAME advisory lock
    -- hr_apply takes; the row it writes is independently policed by the
    -- player_progress_unlock_guard trigger, which refuses an off-ladder rung, a
    -- regression and a mis-filed kind whatever this function proposes; and it
    -- is clamped per call (one rung) and per DAY (20 unlocks, counted from the
    -- append-only ledger), which is the dimension a rate limit does not bound.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT: hr_apply structurally
    -- cannot write a level ('unlock' is deliberately absent from its delta
    -- allowlist), so without this the only writer of a permanent capability is
    -- the client.
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-08-16 — TWO REVIEWED ENGINE READS ────────────────────
    -- At the HEAD, not appended: this array is DERIVED from
    -- 2026-08-11-grant-hygiene.sql by tools/derive-grant-hygiene.mjs, and an
    -- append would have to rewrite the previous last entry to add a comma —
    -- a MODIFIED line. An insertion removes nothing, which is why this chain's
    -- declared-removals list in PART 1f-ii is empty. Position carries no
    -- meaning here: check (7) tests membership with `<> all (...)`.
    --
    -- read-only (STABLE, and 2026-08-16-claim-reward.sql §4 asserts the
    -- declaration rather than trusting it) claim lookup for ONE character.
    -- SELF-VALIDATING in the dimension that matters: the period keys it reads
    -- are the server's own hr_utc_day_key(now()), never an argument, so the
    -- row set is structurally bounded to '' + today + yesterday and no call
    -- can widen it into a history scan. It adds NO TARGET the engine could
    -- not already reach — the engine already holds hr_apply(uuid,…) and
    -- hr_state_of(uuid,int), both of which take the same p_user — so this is
    -- strictly a narrower read of data hr_state_of's envelope is the peer of.
    'hr_claim_lookup(uuid,integer,text,text)',
    -- read-only permanent-capability read for one character: rooms, plots,
    -- property tier and unlocked recipes. Writes nothing and calls nothing
    -- that writes. On the list for the same reason hr_offline_cap_ms is —
    -- a perk multiplies a whole night's grant, so the engine must be TOLD its
    -- capabilities rather than compute them. Same target argument as above:
    -- p_user is a parameter the engine already passes to hr_apply.
    'hr_perks_of(uuid,integer)',
    -- the only writer; bounded by its own re-validation, which is the design
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    -- returns the post-write envelope for one character the engine was told to act for
    'hr_state_of(uuid,integer)',
    -- the accrual PRNG seed; returns a hash, never the 256-bit server secret
    'hr_seed(uuid,integer,text)',
    -- derived leaderboard value; read-only, one character
    'hr_total_level(uuid,integer)',
    -- pure function of its argument
    'hr_level_from_xp(bigint)',
    -- pure function of its argument
    'hr_xp_for_level(integer)',
    -- read-only, one integer, bounded at 24h by its own ceiling; on the list because
    -- capMs multiplies a whole night's grant, so the engine must not own its own cap
    'hr_offline_cap_ms(uuid,integer)',
    -- writes one UNLOGGED counter row for the user it was handed; on the list because
    -- the alternative, granting hr_rate_ok, lets the caller name its own limit
    'hr_rate_gate(uuid,integer,text)'
  ];
begin
  -- (1) PUBLIC=EXECUTE, asked directly.
  --     `proacl is null` is NOT "no grants" — it means the ACL is the hardwired
  --     acldefault('f', owner), which contains PUBLIC=X. That is the exact
  --     state a `create function` with no revoke lands in, so it is the single
  --     most important row of this whole function.
  select coalesce(jsonb_agg(format('%s(%s)', p.proname,
                                   pg_get_function_identity_arguments(p.oid))
                            order by p.proname), '[]'::jsonb)
    into v_public_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p')
     and (p.proacl is null or p.proacl::text ~ '(\{|,)=[a-zA-Z*]*X');

  -- (2) Client-executable and NOT approved. Covers anon and authenticated, and
  --     covers procedures, and covers a new overload of an approved name.
  select coalesce(jsonb_agg(format('%s(%s) → %s', x.proname, x.identity_args, x.grantee)
                            order by x.proname, x.grantee), '[]'::jsonb)
    into v_unapproved
    from (
      select p.proname, pg_get_function_identity_arguments(p.oid) as identity_args, g.grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated')) g(grantee)
       where n.nspname = 'public' and p.prokind in ('f','p')
         and has_function_privilege(g.grantee, p.oid, 'execute')
    ) x
   where not exists (select 1 from public.hr_client_rpc_baseline b
                      where b.proname = x.proname and b.identity_args = x.identity_args
                        and b.grantee = x.grantee);

  -- (3) An approved RPC that is no longer reachable. Not a security failure —
  --     a BROKEN FEATURE — so it is reported, loudly, and never fatal.
  select coalesce(jsonb_agg(format('%s(%s) → %s', b.proname, b.identity_args, b.grantee)
                            order by b.proname), '[]'::jsonb)
    into v_lost
    from public.hr_client_rpc_baseline b
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = b.proname
        and pg_get_function_identity_arguments(p.oid) = b.identity_args
        and has_function_privilege(b.grantee, p.oid, 'execute'));

  -- (4) TRUNCATE bypasses row-level security entirely, so RLS is not a backstop
  --     for it. No client ever needs TRUNCATE, REFERENCES or TRIGGER.
  --     b354 (Security C3) — WIDENED, and the second half is the interesting
  --     one. A client WRITE grant on a table that has RLS ON and NO WRITE
  --     POLICY AT ALL is a grant nothing intends to use: the only thing between
  --     it and the table is row-level security, and one `create policy` — or
  --     one `alter table ... disable row level security` typed during an
  --     incident — turns it into a client-writable table. Security found six of
  --     them live (hr_castle_*, hr_hunt_*): pure content catalogues carrying
  --     anon/authenticated INSERT/UPDATE/DELETE.
  --     WHY IT IS A BASELINE AND NOT A BAN: 21 further tables were in this class
  --     when the check was written (clan_*, world_event_*, raid_*, maintenance_*,
  --     display_names, leaderboard_meta) — all written only by SECURITY DEFINER
  --     RPCs, all dead grants, and none of them safe to sweep in the same change
  --     that introduced the detector. They are RECORDED in
  --     hr_client_write_baseline, which makes each one a claim somebody has to
  --     justify, and makes anything NEW fatal.
  --     service_role is deliberately NOT in the grantee list: Supabase's platform
  --     default grants it every privilege on every table in public, so including
  --     it would report all 40-odd tables and the check could never be strict.
  --     That is a platform posture and a separate program; stated here so its
  --     absence is a decision rather than an oversight.
  select coalesce(jsonb_agg(distinct x.g order by x.g), '[]'::jsonb) into v_client_trunc from (
    select table_name as g
      from information_schema.role_table_grants
     where table_schema = 'public' and grantee in ('anon','authenticated','PUBLIC')
       and privilege_type in ('TRUNCATE','REFERENCES','TRIGGER')
    union all
    select g.table_name || ':' || g.grantee || ':' || g.privilege_type
      from information_schema.role_table_grants g
      join pg_class c on c.relname = g.table_name
                     and c.relnamespace = 'public'::regnamespace
     where g.table_schema = 'public' and g.grantee in ('anon','authenticated','PUBLIC')
       and g.privilege_type in ('INSERT','UPDATE','DELETE')
       and c.relrowsecurity
       and not exists (select 1 from pg_policies p
                        where p.schemaname = 'public' and p.tablename = g.table_name
                          and p.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       and not exists (select 1 from public.hr_client_write_baseline b
                        where b.table_name = g.table_name and b.grantee = g.grantee)
  ) x;

  -- (5) D4 — THE POSITIVE ASSERTION. For every role that owns a function in
  --     public there must be a GLOBAL default-ACL row (defaclnamespace = 0)
  --     for functions, and it must grant EXECUTE to none of PUBLIC / anon /
  --     authenticated. Only a GLOBAL row replaces acldefault(); a schema-scoped
  --     one can only ADD to it, which is why the 2026-08-10 attempt at this
  --     changed nothing. Absence of the row IS the finding.
  select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb)
    into v_defacl_open
    from (select distinct p.proowner from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind in ('f','p')) o
    join pg_roles r on r.oid = o.proowner
   where not exists (
     select 1 from pg_default_acl d
      where d.defaclrole = o.proowner
        and d.defaclnamespace = 0
        and d.defaclobjtype = 'f'
        and not exists (
          select 1 from aclexplode(d.defaclacl) a
          left join pg_roles rr on rr.oid = a.grantee   -- grantee 0 = PUBLIC
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or rr.rolname in ('anon','authenticated'))));

  -- (6) Residual: platform-owned SCHEMA default ACLs we genuinely cannot edit
  --     (supabase_admin). Reported so the residual stays visible. This is the
  --     check revision 1 mistook for the real one — kept, demoted, labelled.
  select coalesce(jsonb_agg(d.defaclrole::regrole::text || ':' || n.nspname
                            order by d.defaclrole::regrole::text), '[]'::jsonb)
    into v_platform
    from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and d.defaclobjtype = 'f'
     and d.defaclacl::text ~ '(anon|authenticated)=[a-zA-Z*]*X';

  -- (7) S9 — hr_engine's EXECUTE surface, keyed on the FULL SIGNATURE and with
  --     no prokind filter, so an overload and a procedure are both visible.
  --     Skipped silently if the role does not exist: this file must stand alone
  --     on a database that has not had the server-authority bundle applied.
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
      into v_engine_extra
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and has_function_privilege('hr_engine', p.oid, 'execute')
       and p.oid::regprocedure::text <> all (c_engine_allow);
    -- "Zero table privileges" is the other half of the capability claim, and
    -- column grants are invisible to role_table_grants, so both are asked.
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_engine_tables from (
      select table_name || ':' || privilege_type as g
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'hr_engine'
      union all
      select table_name || '.' || column_name || ':' || privilege_type
        from information_schema.role_column_grants
       where table_schema = 'public' and grantee = 'hr_engine') x;
  else
    v_engine_extra  := '[]'::jsonb;
    v_engine_tables := '[]'::jsonb;
  end if;

  -- (8) A9 — every client-callable SECURITY DEFINER function must reference a
  --     rate gate. This is the RUNTIME twin of the static lint in
  --     tests/run-sql-tests.mjs, and it exists for one specific reason: the A9
  --     retrofit in 2026-08-11-authenticated-surface-lockdown.sql installs thin
  --     wrappers over renamed `__ungated` bodies, so RE-APPLYING an older
  --     migration that `create or replace`s a wrapped name would silently
  --     replace the wrapper with the ungated body and delete the gate. A repo
  --     lint cannot see that; this can, within a day.
  --     Matching on prosrc is deliberately crude — it proves the gate is
  --     MENTIONED, not that it is reached. It catches the whole class this is
  --     written for (a body that has never heard of a gate) and nothing subtler.
  select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
    into v_ungated
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p') and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
     and p.prosrc !~ 'hr_rpc_gate|hr_rate_gate|hr_rate_ok';

  v_report := jsonb_build_object(
    'public_execute_functions',        v_public_exec,
    'unapproved_client_rpcs',          v_unapproved,
    'baseline_rows_no_longer_live',    v_lost,
    'client_truncate_grants',          v_client_trunc,
    'owners_without_failclosed_defacl',v_defacl_open,
    'platform_schema_defacls_open',    v_platform,
    'engine_execute_outside_allowlist',v_engine_extra,
    'engine_table_privileges',         v_engine_tables,
    'ungated_client_rpcs',             v_ungated);

  if jsonb_array_length(v_lost) > 0 then
    raise warning 'GRANT HYGIENE: % approved client RPC(s) are no longer reachable — %',
      jsonb_array_length(v_lost), v_lost::text;
  end if;

  if p_strict and (jsonb_array_length(v_public_exec) > 0
                or jsonb_array_length(v_unapproved) > 0
                or jsonb_array_length(v_client_trunc) > 0
                or jsonb_array_length(v_defacl_open) > 0
                or jsonb_array_length(v_engine_extra) > 0
                or jsonb_array_length(v_engine_tables) > 0
                or jsonb_array_length(v_ungated) > 0) then
    raise exception 'GRANT HYGIENE FAILED: %', v_report::text;
  end if;
  return v_report;
end $$;
-- ⟦/DERIVED hr_assert_grant_hygiene⟧

-- ── 11. SELF-VERIFICATION ────────────────────────────────────────────────
do $$
declare v_bad int; v_fn text; v_txt text;
begin
  if to_regclass('public.market_listings') is null then raise exception 'market_listings missing'; end if;
  if to_regclass('public.market_sales')    is null then raise exception 'market_sales missing';    end if;

  -- (a) NO CLIENT WRITE POLICY on any market table. The RPCs are the only
  --     writers, and a policy is how that stops being true.
  select count(*) into v_bad from pg_policies
   where schemaname = 'public'
     and tablename in ('market_listings','market_sales','hr_market_config')
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_bad > 0 then
    raise exception '% client write policies on market tables — the RPCs must be the only writers', v_bad;
  end if;

  -- (b) …and NO client write GRANT either, TRUNCATE included — and hr_engine is
  --     in the grantee list, because the engine holding a table privilege here
  --     would make every argument in this file's header false.
  select count(*) into v_bad from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('market_listings','market_sales','hr_market_config','market_price_history')
     and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
     and privilege_type <> 'SELECT';
  if v_bad > 0 then raise exception '% client write grants on market tables', v_bad; end if;
  if has_table_privilege('hr_engine', 'public.market_listings', 'select') then
    raise exception 'hr_engine can read market_listings directly — it must reach these tables only '
                    'through the three SECURITY DEFINER functions';
  end if;

  -- (c) market_sales must NOT be world-readable: it carries two auth UUIDs (S17).
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='market_sales'
                and cmd='SELECT' and coalesce(qual,'') = 'true') then
    raise exception 'market_sales is world-readable — it publishes buyer and seller UUIDs';
  end if;
  if has_table_privilege('anon', 'public.market_sales', 'select') then
    raise exception 'anon can read market_sales directly';
  end if;
  if not has_table_privilege('anon', 'public.market_price_history', 'select') then
    raise exception 'the names-free price view is not readable by anon — the chart will be empty';
  end if;

  -- (d) NO `collected` COLUMN. Its existence would mean the collect-and-PATCH
  --     model came back, and with it the double-collect surface.
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='market_sales' and column_name='collected') then
    raise exception 'market_sales.collected is back — the seller is paid at sale time now, so a '
                    'collect step is a second credit path';
  end if;

  -- (e) NOT ONE market function may be reachable by a client role, and the three
  --     RPCs must be reachable by hr_engine.
  foreach v_fn in array array['hr_market_list','hr_market_cancel','hr_market_buy','hr_market_expire',
                              'market_sales_prune','hr_display_name_of'] loop
    select count(*) into v_bad
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn
       and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute')
         or has_function_privilege('service_role', p.oid, 'execute'));
    if v_bad > 0 then raise exception 'function %() is client-executable', v_fn; end if;
  end loop;
  if not has_function_privilege('hr_engine',
        'public.hr_market_list(uuid,int,bigint,uuid,text,bigint,bigint)', 'execute')
     or not has_function_privilege('hr_engine',
        'public.hr_market_cancel(uuid,int,bigint,uuid,uuid)', 'execute')
     or not has_function_privilege('hr_engine',
        'public.hr_market_buy(uuid,int,bigint,uuid,uuid,bigint)', 'execute') then
    raise exception 'the engine cannot execute one of the three market verbs — the market would be '
                    'installed and unreachable';
  end if;
  if has_function_privilege('hr_engine', 'public.hr_market_expire(int)', 'execute') then
    raise exception 'hr_engine can execute hr_market_expire — it is a cron job, not an engine '
                    'capability, and granting it widens the engine for nothing';
  end if;
  if has_function_privilege('hr_engine', 'public.hr_display_name_of(uuid)', 'execute') then
    raise exception 'hr_engine can execute hr_display_name_of — free name enumeration for a '
                    'compromised engine, and it is only ever called from inside a definer function';
  end if;

  -- (f) THE SUPERSEDED CLIENT-CALLABLE OVERLOADS ARE GONE. This is the check
  --     that makes §4c's drops load-bearing: an old market_buy(int,uuid,bigint,
  --     uuid) left behind is a browser-callable market with none of this file's
  --     rules, sitting under a different name in the same schema.
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('market_list','market_cancel','market_buy',
                                                'market_expire','hr_intent_claim','hr_intent_record');
  if v_bad > 0 then
    raise exception '% function(s) from the superseded 2026-08-11 market file still exist — they are '
                    'client-callable and have none of this file''s rules', v_bad;
  end if;

  -- (g) THE TRADEABLE ALLOWLIST IS LIVE AND EXCLUDES SOMETHING (S3).
  if (select count(*) from public.hr_items where not tradeable) = 0 then
    raise exception 'no untradeable items in the catalogue — the bop allowlist is vacuous';
  end if;

  -- (h) THE CRON RECONCILIATION HELD (R1/R2).
  --     (h-0) …AND THE ORDER HELD (C-c). The end-state checks below cannot tell
  --     "disarmed before the column existed" from "disarmed 600 lines after it
  --     did", and only the first is safe under a non-transactional apply.
  if coalesce(current_setting('hearthrise.market_cron_disarmed', true), '') <> 'yes' then
    raise exception
      'the §0c cron disarm did not run in this session. It must execute BEFORE §1 creates '
      'market_listings.expires_at, otherwise a non-transactional apply leaves the nightly '
      '"delete from market_listings" job armed against live escrow. Do not "fix" this by setting '
      'the GUC by hand — restore §0c.';
  end if;
  if exists (select 1 from cron.job where jobname in ('trim-expired-listings','trim-market-sales')) then
    raise exception 'a superseded market cron job is STILL SCHEDULED';
  end if;
  select count(*) into v_bad from cron.job
   where command ~* 'delete\s+from\s+(public\.)?market_listings';
  if v_bad > 0 then
    raise exception '% cron job(s) DELETE from market_listings directly — escrow must only be '
                    'released by hr_market_expire()', v_bad;
  end if;
  foreach v_fn in array array['hr-market-expire','hr-market-sales-prune'] loop
    if not exists (select 1 from cron.job where jobname = v_fn and active) then
      raise exception 'job % is not scheduled — expiry and retention must ship with the table', v_fn;
    end if;
  end loop;

  -- (i) THE THREE RPCs CARRY THE INVARIANTS THEY CLAIM TO. A source scan, with
  --     a positive and a negative control so it cannot report a clean bill about
  --     nothing. This is the check that survives a future edit which "tidies"
  --     one of the three and loses the version check or the key release.
  foreach v_fn in array array['hr_market_list','hr_market_cancel','hr_market_buy'] loop
    select p.prosrc into v_txt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_fn limit 1;
    if v_txt is null then raise exception '%() did not install', v_fn; end if;
    if v_txt !~ 'player_intents' then
      raise exception 'THE %() SOURCE SCAN IS BLIND — the positive control did not match', v_fn;
    end if;
    if v_txt ~ 'hr__market_scan_control_must_not_match' then
      raise exception 'THE %() SOURCE SCAN IS DEGENERATE — the negative control matched', v_fn;
    end if;
    if v_txt !~ 'version_conflict' then
      raise exception '%() has no version_conflict branch — a stale caller could land a write '
                      'computed against state that has since moved', v_fn;
    end if;
    if v_txt !~ 'intent_mismatch' then
      raise exception '%() has no intent_mismatch branch — one key would mean two things in a '
                      'namespace hr_apply also writes', v_fn;
    end if;
    if v_txt !~ 'delete from public\.player_intents' then
      raise exception '%() never releases the key on a version conflict (b346) — an ordinary '
                      'concurrency outcome would become a 25-hour lockout for that key', v_fn;
    end if;
    if v_txt !~ 'pg_advisory_xact_lock' then
      raise exception '%() takes no advisory lock — it would run concurrently with hr_apply on the '
                      'same character', v_fn;
    end if;
    if v_txt !~ 'hr_state_of' then
      raise exception '%() does not return the state envelope — the client could not retire its '
                      'prediction, which is how a local offset becomes permanent', v_fn;
    end if;
  end loop;

  -- (i-2) TWO INVARIANTS THAT ONLY A RACE COULD BREAK, ASSERTED STATICALLY.
  --       Both were mutations in tests/market-v2.mjs that the harness could NOT
  --       catch, and the honest answer to "this guard cannot see that defect" is
  --       a different guard, not a weaker test. PGlite is one backend, so
  --       neither of these is reachable by executing anything — but both are
  --       exactly stateable about the SOURCE, which is where they live now.
  --
  --       (1) THE CHARGE MUST COME FROM THE LOCKED ROW. `v_route` is the
  --           unlocked routing read (§4c) and exists only to learn whose
  --           advisory lock to take. Pricing from it would mean the one decision
  --           that moves money was made outside the lock every other decision is
  --           made inside — and single-threaded, the two reads agree, so no test
  --           on one backend can tell them apart.
  select p.prosrc into v_txt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_market_buy' limit 1;
  --           Stated POSITIVELY, against the one line that computes the charge,
  --           rather than as "v_route must not appear": the self-trade REFUSAL
  --           legitimately journals v_route.item_id and v_route.ask_each (it
  --           moves nothing and never reaches a lock), and a blanket ban would
  --           have to be relaxed the first time someone added a second refusal —
  --           at which point it stops being a rule.
  if v_txt !~ 'v_gross_n := p_qty::numeric \* v_row\.ask_each::numeric;' then
    raise exception 'hr_market_buy does not compute the charge from v_row.ask_each — the LOCKED '
                    'listing row. v_route is the unlocked routing read (§4c) and may only supply '
                    'seller_user_id and seller_slot, to derive the advisory key; the one decision '
                    'that moves money must be made under the lock every other decision is made '
                    'under. Single-threaded the two reads agree, so no test on one backend can '
                    'tell them apart — which is why this is asserted here.';
  end if;
  --       (1b) THE TWO ADVISORY LOCKS ARE ACQUIRED UNDER AN EXPLICIT ORDER
  --           BRANCH (Security M8). The first revision acquired both in one
  --           `pg_advisory_xact_lock(k) from (… order by u, s)`, which relies on
  --           the planner postponing the volatile lock function past the Sort —
  --           planner behaviour, not a guarantee. A plan that took them in scan
  --           order would let two buyers crossing deadlock (40P01) — an unhandled
  --           500 mid-transfer. Asserted positively against the explicit tuple
  --           comparison, because single-backend PGlite can never make two
  --           transactions contend to surface the deadlock by execution.
  if v_txt !~ 'if \(v_uid::text, v_slot\) < \(v_route\.seller_user_id::text, v_route\.seller_slot\) then' then
    raise exception 'hr_market_buy does not order its two advisory locks with an explicit '
                    'if (v_uid, v_slot) < (seller, seller_slot) branch. An ordered subquery relies on '
                    'planner volatile-postponement, not a guarantee; two buyers crossing could then '
                    'take the locks in opposite order and deadlock (40P01) in the middle of a value '
                    'transfer. The order must be the code''s, not the optimiser''s.';
  end if;
  --       (2) THE DELETE MUST BE THE ARBITER in the expiry sweep. `select then
  --           delete` returns an escrow that a concurrent cancel already
  --           returned — one stack in the bag twice — and again, sequentially
  --           the row is simply gone and the loop never sees it, so no
  --           single-backend test can reach it.
  select p.prosrc into v_txt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_market_expire' limit 1;
  if v_txt !~ 'delete from public\.market_listings where id = v_id returning \* into v_row' then
    raise exception 'hr_market_expire does not use DELETE … RETURNING as the arbiter. A read '
                    'followed by a delete lets a sweep return an escrow a concurrent cancel has '
                    'already returned — the same stack in the bag twice.';
  end if;
  --       (3) THE EXPIRY SWEEP MUST TAKE THE SELLER'S ADVISORY LOCK (Security M1).
  --           hr_market_expire was the one market writer taking NO advisory lock:
  --           its `for update skip locked` locks the LISTING row, not the seller's
  --           serialising key (hashtextextended(seller:slot)), so its escrow-return
  --           upsert into player_inventory could interleave with a concurrent
  --           hr_apply or hr_market_list on the SAME (seller, slot) — the one such
  --           list, on a first-of-its-kind item with no existing stack, never
  --           touches the listing being expired, so the row lock is no barrier at
  --           all. Asserted here because PGlite cannot race it: a single-backend
  --           test runs the sweep and the seller's write sequentially and never
  --           sees the interleave.
  if v_txt !~ 'pg_try_advisory_xact_lock' then
    raise exception 'hr_market_expire takes no per-seller advisory lock. Its `for update skip '
                    'locked` locks the LISTING row, not hashtextextended(seller:slot) — the key '
                    'hr_apply/hr_market_list/cancel/buy serialise a character on. A concurrent '
                    'hr_market_list for a first-of-its-kind item never touches the expiring listing, '
                    'so nothing stops its escrow-return upsert into player_inventory from '
                    'interleaving with the seller''s own write and overwriting the row it is '
                    'mid-returning. It must pg_try_advisory_xact_lock the seller before the delete.';
  end if;

  -- (j) THE IMMUTABILITY THE UNLOCKED ROUTING READ DEPENDS ON. §4c says
  --     seller_user_id, seller_slot and ask_each are never updated after
  --     insert; that is what makes reading the listing without a lock safe for
  --     routing and makes the buy intent name price-free. Asserted against the
  --     source of every function in this file rather than trusted.
  select string_agg(p.proname, ', ') into v_txt
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_market_list','hr_market_cancel','hr_market_buy','hr_market_expire')
     and p.prosrc ~ 'update\s+public\.market_listings\s+set\s+[^;]*(seller_user_id|seller_slot|ask_each)';
  if v_txt is not null then
    raise exception 'these functions UPDATE an immutable listing column: %. §4c''s unlocked routing '
                    'read and §7''s price-free intent name both depend on those three never '
                    'changing after insert.', v_txt;
  end if;
  -- (j-2) THE IMMUTABILITY GUARANTEE — the TRIGGER, not the regex (M4). The scan
  --       above is a commit-time hint that misses unqualified / alias / CTE forms
  --       and anything outside this file. The trigger refuses the change whoever
  --       attempts it, so its ATTACHMENT is what §4c actually rests on.
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'market_listings' and not t.tgisinternal
                    and t.tgname = 'trg_market_listing_immutable') then
    raise exception 'trg_market_listing_immutable is not attached to market_listings — the §11(j) '
                    'regex is only a hint; without the trigger, an UPDATE to seller_user_id, '
                    'seller_slot or ask_each in any form the regex misses would corrupt the routing '
                    'read''s trust and the buy intent''s price-free name.';
  end if;

  -- (k) THE ENGINE'S CAPABILITY LIST — DELEGATED, NOT INLINED (S9). The
  --     detector owns the list; this file records its three entries in §10 and
  --     then makes the detector prove the FINISHED surface is clean. Adding a
  --     fourth entry still fails a migration rather than passing a review.
  perform public.hr_assert_grant_hygiene(true);

  raise notice 'MARKET v2 OK — escrow is real, the seller is paid at sale time, both sides are '
               'journalled, no client role can reach any of it, and the escrow-destroying cron job '
               'is gone.';
end $$;
