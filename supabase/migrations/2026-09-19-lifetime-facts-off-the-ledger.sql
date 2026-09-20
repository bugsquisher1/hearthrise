-- ============================================================================
-- 2026-09-19-lifetime-facts-off-the-ledger.sql
-- A LIFETIME FACT MAY NOT LIVE IN A TABLE WITH A 90-DAY RETENTION.
--
-- STATUS: STAGED, NOT APPLIED - REVIEW ONLY. The Coordinator applies after a
-- FRESH Security GO (fact 2 is a RANKED/bragging surface that crosses players,
-- and Section 6 was rewritten after the 2026-09-20 refusal below). It
-- must be applied AFTER 2026-09-08-hearthfind.sql, 2026-08-29-bounty-first-
-- contract.sql, 2026-09-11-bounty-hunter-xp.sql and 2026-09-14-hr-apply-
-- restatement.sql; Section 0 fails closed on each and tests/schema-apply-
-- order.json places it last.
--
-- -- THE FINDING (Security S-LR-3, 2026-09-19) --------------------------------
-- THREE server functions answer LIFETIME questions by counting rows in
-- public.player_ledger, which has a 90-DAY RETENTION. player_ledger_rollup is
-- keyed (user, slot, month, kind) - it carries no `intent` and no `item_id` - so
-- it cannot answer any of the three. From the first real prune (~2026-11-21)
-- they do not fail; they SILENTLY ANSWER WRONG:
--
--   1. hr_apply, hearthfind arm (iv-b): the TROPHY SET completion check counted
--      `distinct item_id` of kind='hearthfind' rows. After a prune a veteran's
--      early trophies are gone, so the set can never complete for exactly the
--      players who earned it. (Its own comment claimed a stored counter "would
--      drift on any prune". It is the ledger read that drifts.)
--   2. hr_apply, hearthfind arm (ii-b): the GLOBAL "Nth ever found" ordinal was
--      `count(*) + 1` over kind='hearthfind' rows for that item. After a prune
--      the count RESTARTS, so two players are told they were the same Nth
--      finder - a forged-free but WRONG value that crosses between players on a
--      shareable, bragging surface. It is also, today, a RACE: two concurrent
--      applies both read N and both write N+1.
--   3. hr_bounty_first_contract: "has this character ever turned in a bounty?"
--      counted kind='bounty', intent like 'bounty_turnin:%'. After a prune a
--      veteran REGAINS the beginner first-contract floor (the 15-25 kill range
--      instead of their tier's), i.e. a repeating gold/XP discount.
--
-- TODAY: 0 hearthfind rows exist and the prune has never run, so nothing is
-- wrong YET and the backfill below is exact. After the first prune the facts are
-- unreconstructible. This is the cheapest hour this work will ever cost.
--
-- -- WHAT THIS FILE DOES ------------------------------------------------------
-- It gives each fact a DURABLE, SERVER-OWNED HOME that no retention policy
-- touches, backfills it from today's ledger, and restates the three readers to
-- read the home instead of the journal. The ledger keeps journalling - it is
-- still the audit trail - it simply stops being the AUTHORITY for a fact that
-- outlives it.
--
--   FACT 1 + 2  public.hearthfind_log - APPEND-ONLY, one row per find ever:
--               (user_id, slot, item_id, nth_ever, found_at, src_ledger_id).
--               The per-character found SET is `distinct item_id` over the
--               character's own rows. Retention: NONE, by construction - a
--               hearthfind is capped at 3 per character per UTC day and is a
--               1-in-millions roll, so at 100x today's players this table is
--               hundreds of rows a year, not millions.
--   FACT 2's N  public.hearthfind_ordinal - (item_id, found_total), the global
--               monotonic counter. N is ALLOCATED by a single
--               `insert ... on conflict do update ... returning`, which takes
--               the row lock for the duration: two concurrent finders SERIALISE
--               and get distinct N. Belt and braces: hearthfind_log carries
--               `unique (item_id, nth_ever)`, so even a future body that
--               allocated N by counting could not COMMIT a duplicate - it would
--               take a constraint violation instead of handing two players the
--               same trophy moment. GATE(b) proves both halves.
--   FACT 3      player_progress (kind='stat', key='bounty_turnins',
--               period_key=''), i.e. the table's own PERMANENT population,
--               which 2026-08-11-player-state.sql documents as "lifetime stats,
--               kept forever". No new table, no new row shape.
--
-- WHY NOT world_finds (the reliability audit's suggestion): world_finds is the
-- public BROADCAST board - readable by anon by design - and it is RATE-LIMITED
-- to one row per 30 s per character, so it is already an INCOMPLETE record of
-- finds. Using it for fact 1 would (a) publish every player's trophy set to
-- every other player and (b) lose a find that was broadcast-suppressed. It stays
-- exactly what it is; hearthfind_log is the complete, per-user-readable record
-- beside it.
--
-- -- RESTATEMENT-DEBT-ACK ----------------------------------------------------
-- This file adds TWO anchored patches to hr_apply (chain depth 2 since the
-- 2026-09-14 restatement: 2026-09-17's span stamp, then these) and ONE to
-- hr_claim_bounty__ungated. tests/patch-chain-guard.mjs is right to ask for a
-- restatement and this is not the file to pay it in, for the reason 2026-09-09
-- gave and 2026-09-14 proved: the LIVE body is not readable from an agent's
-- seat, so a restatement authored here would install the REPO's replay over
-- production's and silently revert whatever the two differ by - on the body that
-- moves gold. That is the b484 class.
--   WHAT IS DONE INSTEAD, so the debt is bounded rather than deferred: every
--   anchor is asserted to match EXACTLY ONCE and the migration RAISES on any
--   other count (the "patch that no-ops in silence" mode), and Section 6
--   re-reads the INSTALLED text and names, by the string each earlier file
--   asserted on, the advisory lock, the watermark clamp, the 2026-09-17 span
--   stamp, the hearthfind daily clamp, the broadcast clamp, the cosmetics
--   ON CONFLICT DO NOTHING and the Bounty-Hunter XP upsert - so a silent revert
--   fails HERE, on apply, not on production.
--   THE PAYDOWN is the Coordinator-side hr_apply restatement authored FROM the
--   live body; it is a lane of its own.
--
-- hr_bounty_first_contract is NOT patched - it is a 5-line `language sql`
-- function on NO chain, so it is restated whole, which is the correct treatment
-- for a body that fits on a screen.
--
-- -- JOURNAL (rule 6) --------------------------------------------------------
-- ONE row per find (a 1-in-millions event, already journalled once) and ZERO
-- rows per bounty turn-in (an UPSERT on a row player_progress already holds for
-- other stats). Nothing is journalled per tick. At 100x today's players:
-- hearthfind_log ~ hundreds of rows/year (~80 bytes each), hearthfind_ordinal is
-- one row per trophy in the catalogue, forever. The two ledger indexes that
-- existed only to serve these reads (player_ledger_hearthfind_item_idx) are left
-- in place deliberately - they still serve the daily clamp and the audit - and
-- dropping them is a separate, reversible decision.
--
-- REVERSIBILITY: re-apply 2026-09-14-hr-apply-restatement.sql then
-- 2026-09-17-attended-xp-on-settle.sql to restore hr_apply, re-apply
-- 2026-09-11-bounty-hunter-xp.sql for the claim body, and re-apply
-- 2026-08-29-bounty-first-contract.sql for the reader. The two tables may be
-- left in place (unread) or dropped. NO player data is destroyed by the revert:
-- the ledger rows the facts were derived from are untouched, and nothing this
-- file writes is the only copy of a value transfer.
--
-- EDGE: unchanged. The accrual engine proposes a hearthfind; it does not count
-- one. No redeploy. CLIENT: unchanged - hr_state_of is not touched and no
-- projection moves.
--
-- -- THE 2026-09-20 REFUSAL, AND WHAT SECTION 6 NOW DOES --------------------
-- The first apply attempt FAILED and rolled back atomically, with no damage:
--   ERROR 23514  player_ledger row is inside the 90 day retention window and
--                cannot be deleted
--   CONTEXT      hr_ledger_immutable() ... "delete from public.player_ledger
--                where at < now() - interval '1 day'" ... inline_code_block:177
-- Section 6's step "(a) THE PRUNE" simulated the 90-day retention by deleting
-- EVERY row in player_ledger older than one day. On the PGlite replay chain the
-- journal holds nothing but the probe rows the block itself writes, so the
-- statement looked scoped and schema-drift never saw it; on production it is a
-- blanket delete over every player's money history. TWO defects, not one:
--   1. it cannot run where hr_ledger_immutable is armed and real rows exist -
--      the trigger correctly refuses a delete inside the retention window; and
--   2. far worse, a self-check must not touch a row it did not create, rolled
--      back or not. The trigger refusing is LUCK, not design: every fixture row
--      was dated 120-200 days back, i.e. OUTSIDE the window and therefore
--      deletable, so a production ledger that had reached its first prune date
--      would have had its aged tail silently deleted by a passing self-check.
-- Section 6 now: derives the cut from hr_ledger_config (the policy in force,
-- not a hard-coded interval), proves hr_ledger_immutable is ARMED before it
-- prunes anything, prunes ONLY `user_id in (v_uid, v_uid2)`, and carries a
-- BYSTANDER CANARY - the count of prunable rows belonging to anyone else, taken
-- before and re-read after - so the scope is asserted rather than believed.
-- The standing guard is tests/selfcheck-no-global-dml.mjs, which reads the
-- whole chain for this class; tests/schema-drift.mjs now seeds the replay with
-- real-looking bystander rows and requires them to survive, so the replay can
-- see what it could not see on 2026-09-19.
-- ============================================================================

-- -- 0. PRECONDITIONS - fail closed ------------------------------------------
do $$
declare v_def text;
begin
  if to_regclass('public.player_ledger') is null or to_regclass('public.player_progress') is null then
    raise exception 'PRECONDITION: player_ledger/player_progress are absent - run the player-state chain first';
  end if;
  if to_regclass('public.world_finds') is null then
    raise exception 'PRECONDITION: world_finds is absent - apply 2026-09-08-hearthfind.sql FIRST';
  end if;
  if to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null then
    raise exception 'PRECONDITION: hr_apply(uuid,integer,bigint,uuid,jsonb) is absent - apply 2026-09-14-hr-apply-restatement.sql FIRST';
  end if;
  if to_regprocedure('public.hr_bounty_first_contract(uuid,int)') is null then
    raise exception 'PRECONDITION: hr_bounty_first_contract is absent - apply 2026-08-29-bounty-first-contract.sql FIRST';
  end if;
  if to_regprocedure('public.hr_claim_bounty__ungated(int)') is null then
    raise exception 'PRECONDITION: hr_claim_bounty__ungated is absent - apply 2026-08-23-bounty.sql FIRST';
  end if;

  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'hearthfind') = 0 then
    raise exception 'PRECONDITION: the installed hr_apply carries no hearthfind arm - apply 2026-09-08-hearthfind.sql and 2026-09-14-hr-apply-restatement.sql FIRST';
  end if;
  if strpos(v_def, 'ATTENDED-XP SPAN STAMP (2026-09-17)') = 0 then
    raise exception 'PRECONDITION: the installed hr_apply does not carry the 2026-09-17 span stamp - apply 2026-09-17-attended-xp-on-settle.sql FIRST. Applying over a pre-2026-09-17 body would be correct here, but the apply ORDER recorded in tests/schema-apply-order.json would then be a lie, and the next re-apply of that file would anchor on text this file moved.';
  end if;

  v_def := replace(pg_get_functiondef('public.hr_claim_bounty__ungated(int)'::regprocedure), chr(13), '');
  if strpos(v_def, 'bountyHunter') = 0 then
    raise exception 'PRECONDITION: the installed hr_claim_bounty__ungated does not credit Bounty-Hunter XP - apply 2026-09-11-bounty-hunter-xp.sql FIRST';
  end if;
end $$;

-- -- 1. THE DURABLE HOMES ----------------------------------------------------
-- APPEND-ONLY. One row per find that has ever happened, for as long as the realm
-- exists. `src_ledger_id` is the backfill's idempotency key and is NULL for
-- every find written from here on (there is nothing to deduplicate: hr_apply
-- writes it exactly once, inside the transaction that grants the trophy).
create table if not exists public.hearthfind_log (
  id            bigserial primary key,
  user_id       uuid        not null,
  slot          int         not null,
  item_id       text        not null,
  nth_ever      bigint      not null check (nth_ever > 0),
  found_at      timestamptz not null default now(),
  src_ledger_id bigint,
  -- THE PROPERTY THAT CROSSES PLAYERS: no two finds of one trophy may carry the
  -- same ordinal. This is a CONSTRAINT and not a convention, so a future body
  -- that allocated N by counting anything - prunable or not - takes a violation
  -- instead of telling two players they were both the 3rd ever finder.
  constraint hearthfind_log_nth_uq unique (item_id, nth_ever),
  -- The backfill's idempotency, enforced by the database rather than by the
  -- backfill remembering to check.
  constraint hearthfind_log_src_uq unique (src_ledger_id)
);
create index if not exists hearthfind_log_char_idx on public.hearthfind_log (user_id, slot, item_id);

comment on table public.hearthfind_log is
  'LIFETIME FACT (2026-09-19). Append-only record of every hearthfind ever made: the per-character trophy SET (fact 1) and the global "Nth ever" ordinal (fact 2). NOT PRUNABLE - it replaces two reads of player_ledger, which has a 90-day retention that would silently reset both facts. Written only by hr_apply (SECURITY DEFINER); no client write grant; readable by its owner only.';

-- THE GLOBAL COUNTER. One row per trophy in the catalogue, forever. Allocation
-- is a single statement (`insert ... on conflict do update ... returning`) which
-- holds the row lock across the read and the write, so concurrent finders
-- serialise. found_total is raise-only by construction (+1) and is never read by
-- the client.
create table if not exists public.hearthfind_ordinal (
  item_id     text        primary key,
  found_total bigint      not null default 0 check (found_total >= 0),
  updated_at  timestamptz not null default now()
);

comment on table public.hearthfind_ordinal is
  'LIFETIME FACT (2026-09-19). The global monotonic "how many of this trophy have ever been found" counter, from which hr_apply ALLOCATES each find''s nth_ever under the row lock. NOT PRUNABLE. Server-only: no client role holds any privilege on it.';

-- -- 1b. RLS AND GRANTS - revoke BEFORE grant (house rule 3) -----------------
alter table public.hearthfind_log     enable row level security;
alter table public.hearthfind_ordinal enable row level security;

revoke all on public.hearthfind_log     from public, anon, authenticated;
revoke all on public.hearthfind_ordinal from public, anon, authenticated;

-- READ: the OWNER only. A trophy set is a private collection until its owner
-- broadcasts a find; world_finds is the public surface and it stays the only
-- one. (GATE(d) proves a second player reads zero rows.)
grant select on public.hearthfind_log to authenticated;
drop policy if exists hearthfind_log_read_own on public.hearthfind_log;
create policy hearthfind_log_read_own on public.hearthfind_log
  for select to authenticated using (user_id = auth.uid());

-- WRITE: nothing. No policy for INSERT/UPDATE/DELETE exists for any client role,
-- and no privilege is granted. hr_apply is SECURITY DEFINER and owns the table.
-- hearthfind_ordinal is not readable either: N is delivered in the find receipt.

-- -- 2. THE BACKFILL - a function, so the migration and GATE(a)/(c) run the
-- --    SAME code rather than two drafts of it ---------------------------------
create or replace function public.hr_backfill_lifetime_facts(p_user uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_finds  bigint := 0;
  v_ord    bigint := 0;
  v_bounty bigint := 0;
begin
  -- (0) THE WINDOW IS CLOSED ONCE LIVE ALLOCATION HAS BEGUN. (Security review
  --     2026-09-19, finding S-LF-1, CONFIRMED.) The header claims this function
  --     is idempotent and safe to re-run. It is - but ONLY while every row in
  --     hearthfind_log came from the backfill. The moment hr_apply grants one
  --     find (src_ledger_id NULL, nth_ever ALLOCATED from hearthfind_ordinal) a
  --     re-run re-derives that same find's ordinal from the LEDGER row it also
  --     wrote, by `row_number()`, and inserts it again: `on conflict on
  --     constraint hearthfind_log_src_uq` does not cover hearthfind_log_nth_uq,
  --     so the re-run takes an UNCAUGHT unique_violation and aborts. Worse, if
  --     the nth constraint were ever relaxed it would DOUBLE-NUMBER a live
  --     trophy. Both modes are closed by refusing rather than by hoping the
  --     operator remembers: the backfill exists for exactly one moment, the
  --     apply, and after that the durable home IS the authority.
  if exists (select 1 from public.hearthfind_log where src_ledger_id is null) then
    raise exception 'hr_backfill_lifetime_facts: REFUSING - hearthfind_log already holds % live '
                    'find row(s) allocated by hr_apply. The backfill window closed at apply time; '
                    're-running it would re-derive their ordinals from the (prunable) ledger and '
                    'either abort on hearthfind_log_nth_uq or double-number a live trophy.',
                    (select count(*) from public.hearthfind_log where src_ledger_id is null);
  end if;

  -- (1) THE FINDS. Ordered by (at, id) - the ledger's own primary key order - so
  --     the ordinal a veteran is backfilled with is the one they were told at
  --     the time, and a re-run produces the same numbering.
  --     GUARDED ON src_ledger_id, not on "is the table empty": a ledger row that
  --     has already been backfilled cannot be backfilled twice, and a find made
  --     AFTER the backfill (src_ledger_id NULL) is never touched by it.
  with src as (
    select l.id, l.user_id, l.slot, l.item_id, l.at,
           row_number() over (partition by l.item_id order by l.at, l.id) as rn
      from public.player_ledger l
     where l.kind = 'hearthfind' and l.item_id is not null
  ), ins as (
    -- p_user SCOPES THE WRITE, never the ordinal. (Security review 2026-09-20,
    -- finding S-LF-1.) `src` stays global so row_number() still numbers a find
    -- by its place among EVERY finder - the ordinal is a cross-player fact and
    -- a scoped call must not renumber it - while only the named character's
    -- rows are inserted. A self-check may then exercise the real code without
    -- touching a row it did not create.
    insert into public.hearthfind_log (user_id, slot, item_id, nth_ever, found_at, src_ledger_id)
    select s.user_id, s.slot, s.item_id,
           -- Prefer the ordinal the player was SHOWN, if the journal recorded
           -- one; fall back to position. coalesce, never overwrite: a receipt a
           -- player screenshotted is the authority over a recomputation.
           coalesce((select (m.meta->>'nth_ever')::bigint
                       from public.player_ledger m
                      where m.id = s.id and m.at = s.at
                        and (m.meta->>'nth_ever') is not null limit 1), s.rn),
           s.at, s.id
      from src s
     where p_user is null or s.user_id = p_user
    on conflict on constraint hearthfind_log_src_uq do nothing
    returning 1
  )
  select count(*) into v_finds from ins;

  -- (2) THE COUNTER. Raise-only: a re-run can only carry it forward, never back,
  --     so a backfill executed after the first prune cannot renumber anybody.
  with upd as (
    insert into public.hearthfind_ordinal (item_id, found_total, updated_at)
    select item_id, max(nth_ever), now() from public.hearthfind_log
     where p_user is null or user_id = p_user
     group by item_id
    on conflict (item_id) do update
      set found_total = greatest(public.hearthfind_ordinal.found_total, excluded.found_total),
          updated_at  = now()
    returning 1
  )
  select count(*) into v_ord from upd;

  -- (3) THE FIRST-CONTRACT COUNTER. greatest(), for the same reason: after a
  --     prune the ledger count is SMALLER than the truth, and a re-run must not
  --     hand a veteran the beginner floor back. `exists` on player_state because
  --     player_progress is FK'd to it.
  with upd2 as (
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, updated_at)
    select l.user_id, l.slot, 'stat', 'bounty_turnins', count(*), '', now()
      from public.player_ledger l
     where l.kind = 'bounty' and l.intent like 'bounty_turnin:%'
       and (p_user is null or l.user_id = p_user)
       and exists (select 1 from public.player_state ps
                    where ps.user_id = l.user_id and ps.slot = l.slot)
     group by l.user_id, l.slot
    on conflict (user_id, slot, kind, key, period_key) do update
      set value = greatest(public.player_progress.value, excluded.value), updated_at = now()
    returning 1
  )
  select count(*) into v_bounty from upd2;

  return jsonb_build_object('finds', v_finds, 'ordinals', v_ord, 'characters', v_bounty);
end $$;

revoke execute on function public.hr_backfill_lifetime_facts(uuid)
  from public, anon, authenticated, service_role;

do $$
declare v jsonb;
begin
  v := public.hr_backfill_lifetime_facts();
  raise notice 'lifetime-facts backfill: % finds, % trophy counters, % characters', v->>'finds', v->>'ordinals', v->>'characters';
end $$;

-- -- 3. PATCH A - hr_apply reads the durable homes ----------------------------
-- TWO anchors, both inside the hearthfind arm the 2026-09-14 restatement owns.
-- No declare is added: v_hf_nth and v_hf_set already exist.
do $miga$
declare
  v_def text;
  v_a1 constant text :=
       '        select count(*) + 1 into v_hf_nth' || chr(10)
    || '          from public.player_ledger' || chr(10)
    || '         where kind = ''hearthfind'' and item_id = v_hf_item;';
  v_a2 constant text :=
       '        select count(distinct item_id) into v_hf_set' || chr(10)
    || '          from public.player_ledger' || chr(10)
    || '         where user_id = v_uid and slot = v_slot and kind = ''hearthfind'';';
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');

  if strpos(v_def, 'LIFETIME FACTS OFF THE LEDGER (2026-09-19)') > 0 then
    raise notice 'hr_apply already reads the durable lifetime-fact homes - skipping (idempotent no-op)';
  else
    if (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1) <> 1 then
      raise exception 'ANCHOR A1 (the ledger-counted global ordinal) matched % times, expected 1',
        (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1);
    end if;
    if (length(v_def) - length(replace(v_def, v_a2, ''))) / length(v_a2) <> 1 then
      raise exception 'ANCHOR A2 (the ledger-counted trophy set) matched % times, expected 1',
        (length(v_def) - length(replace(v_def, v_a2, ''))) / length(v_a2);
    end if;

    -- A1. ALLOCATE the ordinal instead of COUNTING it. One statement, so the
    --     read and the write are inside one row lock: two concurrent finders
    --     serialise on hearthfind_ordinal's row and get DISTINCT N. The old
    --     count(*) had two defects at once - it restarted after a prune, and two
    --     applies racing on the same item both read the same count.
    v_def := replace(v_def, v_a1,
      $anc$        -- LIFETIME FACTS OFF THE LEDGER (2026-09-19) - fact 2, the GLOBAL
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
          values (v_uid, v_slot, v_hf_item, v_hf_nth);$anc$);

    -- A2. THE SET, from the same durable rows. The row written at A1 is already
    --     there, so the find being granted counts towards its own set - exactly
    --     as it did when the journal row was written before this count.
    v_def := replace(v_def, v_a2,
      $anc$        -- LIFETIME FACTS OFF THE LEDGER (2026-09-19) - fact 1, THE SET.
        -- Counted from hearthfind_log, which is not prunable. The old body
        -- counted player_ledger and its comment claimed a stored counter "would
        -- drift on any prune"; the read that drifts is the LEDGER one, and it
        -- would have made the full set unreachable for exactly the veterans who
        -- earned it. This is not a second copy of a fact: it is the FIRST
        -- durable copy, and the ledger keeps journalling beside it.
        select count(distinct item_id) into v_hf_set
          from public.hearthfind_log
         where user_id = v_uid and slot = v_slot;$anc$);

    execute v_def;
    raise notice 'hr_apply patched: the hearthfind ordinal and set read durable storage';
  end if;
end $miga$;

-- create-or-replace preserves an ACL and the signature is unchanged; the
-- explicit restatement is what GATE(a) asserts. hr_apply is ENGINE-ONLY.
revoke execute on function public.hr_apply(uuid,integer,bigint,uuid,jsonb)
  from public, anon, authenticated;

-- -- 4. PATCH B - the turn-in counts itself -----------------------------------
do $migb$
declare
  v_def text;
  v_b1 constant text := '  insert into public.player_ledger' || chr(10);
begin
  v_def := replace(pg_get_functiondef('public.hr_claim_bounty__ungated(int)'::regprocedure), chr(13), '');

  if strpos(v_def, 'LIFETIME FACTS OFF THE LEDGER (2026-09-19)') > 0 then
    raise notice 'hr_claim_bounty__ungated already counts turn-ins durably - skipping (idempotent no-op)';
  else
    if (length(v_def) - length(replace(v_def, v_b1, ''))) / length(v_b1) <> 1 then
      raise exception 'ANCHOR B1 (the turn-in ledger insert) matched % times, expected 1',
        (length(v_def) - length(replace(v_def, v_b1, ''))) / length(v_b1);
    end if;

    -- The counter is incremented in the SAME transaction as the credit and the
    -- journal row, from the SAME server-owned active_bounty row, immediately
    -- before the journal write it mirrors. No client value reaches it (the verb
    -- takes only p_slot), and it is an UPSERT because player_progress carries no
    -- row for a character who has never turned one in - which is precisely the
    -- population the grace exists for.
    v_def := replace(v_def, v_b1,
      $anc$  -- LIFETIME FACTS OFF THE LEDGER (2026-09-19) - fact 3. THE DURABLE
  -- TURN-IN COUNT. hr_bounty_first_contract used to ask this of player_ledger,
  -- which is pruned at 90 days, so a veteran REGAINED the beginner first-
  -- contract kill floor (15-25 instead of their tier's) - a repeating discount
  -- on a gold-and-XP reward. ZERO new rows: this is an upsert on the PERMANENT
  -- (period_key = '') population of a table the character already uses.
  insert into public.player_progress as pp (user_id, slot, kind, key, value, period_key, updated_at)
    values (auth.uid(), v_slot, 'stat', 'bounty_turnins', 1, '', now())
    on conflict (user_id, slot, kind, key, period_key) do update
      set value = pp.value + 1, updated_at = now();

  insert into public.player_ledger
$anc$);

    execute v_def;
    raise notice 'hr_claim_bounty__ungated patched: the turn-in increments a durable counter';
  end if;
end $migb$;

revoke execute on function public.hr_claim_bounty__ungated(int)
  from public, anon, authenticated, service_role;

-- -- 5. THE READER, RESTATED WHOLE --------------------------------------------
-- Five lines on no chain: restated, not patched. The `limit 3` trick the ledger
-- version needed (stop the scan at three) is gone with the scan - this is a
-- single-row primary-key lookup on player_progress.
create or replace function public.hr_bounty_first_contract(p_user uuid, p_slot int)
returns boolean language sql stable security definer
set search_path = public, pg_catalog as $$
  -- LIFETIME FACTS OFF THE LEDGER (2026-09-19). The count is read from the
  -- durable counter, never from player_ledger (90-day retention). A character
  -- with no row has never turned one in, which is the honest default and the
  -- SAFE one: the grace is a SMALLER kill requirement, so the fail-open
  -- direction here is "beginner", and it is reached only by a character with no
  -- recorded turn-in at all.
  select coalesce((select pp.value from public.player_progress pp
                    where pp.user_id = p_user and pp.slot = p_slot
                      and pp.kind = 'stat' and pp.key = 'bounty_turnins'
                      and pp.period_key = ''), 0) < 3;
$$;

revoke execute on function public.hr_bounty_first_contract(uuid, int)
  from public, anon, authenticated, service_role;

-- -- 6. SECTION 4 SELF-CHECK - properties asserted by EXECUTING SQL -----------
do $$
declare
  v_def     text;
  v_bdef    text;
  v_uid     constant uuid := '000001f0-0000-0000-0000-0000000001f0';
  v_uid2    constant uuid := '000001f0-0000-0000-0000-0000000001f1';
  v_slot    constant int  := 0;
  v_set0    bigint; v_set1 bigint;
  v_nth0    bigint; v_nth1 bigint;
  v_fc0     boolean; v_fc1 boolean;
  v_led_set bigint; v_led_nth bigint; v_led_fc boolean;
  v_keep    int;    v_cut timestamptz;
  v_byst0   bigint; v_byst1 bigint; v_armed boolean;
  v_rows0   bigint; v_rows1 bigint;
  v_n1      bigint; v_n2 bigint;
  v_dup     boolean := false;
  v_seen    bigint;
  v_bf      jsonb;
begin
  v_def  := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  v_bdef := replace(pg_get_functiondef('public.hr_claim_bounty__ungated(int)'::regprocedure), chr(13), '');

  -- (a) THE PRIVILEGE LINE. A privileged RPC left executable by a client role is
  --     the whole game (house rule 3).
  if has_function_privilege('authenticated','public.hr_apply(uuid,integer,bigint,uuid,jsonb)','execute')
     or has_function_privilege('anon','public.hr_apply(uuid,integer,bigint,uuid,jsonb)','execute') then
    raise exception 'GATE(a): hr_apply is client-executable';
  end if;
  if has_function_privilege('authenticated','public.hr_bounty_first_contract(uuid,integer)','execute')
     or has_function_privilege('anon','public.hr_bounty_first_contract(uuid,integer)','execute') then
    raise exception 'GATE(a): hr_bounty_first_contract is client-executable - a client could probe another character''s history';
  end if;
  if has_function_privilege('authenticated','public.hr_backfill_lifetime_facts(uuid)','execute')
     or has_function_privilege('anon','public.hr_backfill_lifetime_facts(uuid)','execute') then
    raise exception 'GATE(a): the backfill is client-executable';
  end if;
  if has_function_privilege('authenticated','public.hr_claim_bounty__ungated(integer)','execute') then
    raise exception 'GATE(a): hr_claim_bounty__ungated is client-executable - the gate is decoration';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.hr_bounty_first_contract(uuid,integer)'::regprocedure) then
    raise exception 'GATE(a): hr_bounty_first_contract lost SECURITY DEFINER';
  end if;

  -- (b0) NO CLIENT WRITE SURFACE on either new table, and RLS is ON. SELECT is
  --      the only privilege any client role may hold, on hearthfind_log alone.
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name in ('hearthfind_log','hearthfind_ordinal')
                and grantee in ('anon','authenticated','PUBLIC')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(b0): a client write grant exists on a lifetime-fact table';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='hearthfind_ordinal'
                and grantee in ('anon','authenticated','PUBLIC')) then
    raise exception 'GATE(b0): a client role holds a privilege on hearthfind_ordinal - the global counter is server-only';
  end if;
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename in ('hearthfind_log','hearthfind_ordinal')
                and cmd in ('UPDATE','INSERT','DELETE','ALL')) then
    raise exception 'GATE(b0): a write policy exists on a lifetime-fact table';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.hearthfind_log'::regclass)
     or not (select relrowsecurity from pg_class where oid='public.hearthfind_ordinal'::regclass) then
    raise exception 'GATE(b0): RLS is not enabled on a lifetime-fact table';
  end if;

  -- (R) NOTHING WAS REVERTED. Both patched bodies are named by the strings the
  --     files before this one asserted on (the b484 class), and no ledger-
  --     derived lifetime read survives.
  if strpos(v_def, 'LIFETIME FACTS OFF THE LEDGER (2026-09-19)') = 0 then
    raise exception 'GATE(R0): section 3 no-oped - hr_apply still reads the ledger for a lifetime fact';
  end if;
  if strpos(v_bdef, 'LIFETIME FACTS OFF THE LEDGER (2026-09-19)') = 0 then
    raise exception 'GATE(R0b): section 4 no-oped - the turn-in writes no durable counter';
  end if;
  if strpos(v_def, 'select count(*) + 1 into v_hf_nth') > 0
     or strpos(v_def, 'select count(distinct item_id) into v_hf_set' || chr(10)
                   || '          from public.player_ledger') > 0 then
    raise exception 'GATE(R0c): a ledger-counted lifetime read survives in hr_apply';
  end if;
  -- (R0d) THE ALLOCATION MUST PRECEDE THE SET COUNT. (Security review
  --       2026-09-19, finding S-LF-2.) Fact 1 is now `count(distinct item_id)`
  --       over hearthfind_log, and it is correct ONLY because A1 has already
  --       inserted THIS find's row when A2 runs - which is the meaning the
  --       ledger version had (its journal row was written first too). If a
  --       future restatement ever reorders the arm, the set silently reads one
  --       LOW and the full-set title is withheld from the player who just
  --       completed it - a wrong answer on a bragging surface, with no error.
  --       The two anchors are exactly-once, so strpos is an exact ordering test.
  if strpos(v_def, 'insert into public.hearthfind_log (user_id, slot, item_id, nth_ever)')
       >= strpos(v_def, 'select count(distinct item_id) into v_hf_set')
     or strpos(v_def, 'select count(distinct item_id) into v_hf_set') = 0 then
    raise exception 'GATE(R0d): the durable find row is not written BEFORE the trophy-set count - the set reads one low and the full-set title is withheld from the player who earned it';
  end if;
  if strpos(v_def, 'hr_apply restated 2026-09-14') = 0 then
    raise exception 'GATE(R1): hr_apply lost the 2026-09-14 restatement banner';
  end if;
  if strpos(v_def, 'ATTENDED-XP SPAN STAMP (2026-09-17)') = 0 then
    raise exception 'GATE(R2): hr_apply lost the 2026-09-17 span stamp - this file reverted it';
  end if;
  if strpos(v_def, 'pg_advisory_xact_lock') = 0 then
    raise exception 'GATE(R3): hr_apply lost the per-character advisory lock';
  end if;
  if strpos(v_def, 'v_accrued := least(now(), greatest(v_st.accrued_to, v_accrued));') = 0 then
    raise exception 'GATE(R4): hr_apply lost the watermark clamp';
  end if;
  if strpos(v_def, 'hearthfind_daily_cap') = 0 or strpos(v_def, 'c_max_hf_per_day') = 0 then
    raise exception 'GATE(R5): hr_apply lost the hearthfind daily clamp';
  end if;
  if strpos(v_def, 'c_hf_broadcast') = 0 or strpos(v_def, 'insert into public.world_finds') = 0 then
    raise exception 'GATE(R6): hr_apply lost the world_finds broadcast or its clamp';
  end if;
  if strpos(v_def, 'insert into public.player_cosmetics') = 0
     or strpos(v_def, 'on conflict (user_id, slot, kind, code) do nothing') = 0 then
    raise exception 'GATE(R7): hr_apply lost the idempotent cosmetics unlock';
  end if;
  if strpos(v_bdef, 'bountyHunter') = 0 then
    raise exception 'GATE(R8): hr_claim_bounty__ungated lost the Bounty-Hunter XP credit';
  end if;
  if strpos(v_bdef, 'insert into public.player_ledger') = 0 then
    raise exception 'GATE(R9): hr_claim_bounty__ungated lost its journal row';
  end if;

  -- == THE BEHAVIOURAL GATES. Real rows, real calls, rolled back. ===========
  begin
    insert into auth.users (id) values (v_uid), (v_uid2) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 0, 0, 0), (v_uid2, v_slot, 0, 0, 0)
      on conflict (user_id, slot) do nothing;

    -- THE RETENTION POLICY IN FORCE, READ RATHER THAN ASSUMED. hr_ledger_prune
    -- derives its cut from hr_ledger_config.retain_days and hr_ledger_immutable
    -- refuses a delete on the wrong side of the SAME number, so a fixture dated
    -- by a hard-coded '200 days' silently moves INSIDE the window the day
    -- retention is raised past 200 - and this block then fails on the trigger
    -- rather than on a defect. The extra second matches the slack
    -- hr_ledger_prune already takes so the two never argue about the boundary.
    select retain_days into v_keep from public.hr_ledger_config;
    v_cut := now() - make_interval(days => coalesce(v_keep, 90)) - interval '1 second';

    -- THE BYSTANDER CANARY, TAKEN FIRST. Every row this block is ABOUT belongs
    -- to v_uid/v_uid2. Every other prunable row in player_ledger belongs to a
    -- real player and is their money history. This is the count the prune below
    -- may not move; (a5) re-reads it. Bounded to the rows a delete could
    -- actually reach - the retention tail - so it is a PK range scan on
    -- (at, id) and not a full count of the journal.
    -- `is distinct from`, not `not in`: `user_id not in (…)` is NULL for a row
    -- with a NULL owner, which excludes it from BOTH counts and would let such
    -- a row be deleted with the canary reporting no change (Security review
    -- 2026-09-20, finding S-LR-2). player_ledger.user_id is NOT NULL today, so
    -- this is one column default away from mattering and costs nothing now.
    select count(*) into v_byst0 from public.player_ledger
      where at < v_cut
        and user_id is distinct from v_uid and user_id is distinct from v_uid2;

    -- A VETERAN'S HISTORY, entirely older than the retention window in force:
    -- two distinct trophies (one of them found twice) and three bounty turn-ins.
    insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, meta, at) values
      (v_uid, v_slot, 'hearthfind', 'hearthfind', 'probe_trophy_a', 1, 0, '{}'::jsonb, v_cut - interval '40 days'),
      (v_uid, v_slot, 'hearthfind', 'hearthfind', 'probe_trophy_b', 1, 0, '{}'::jsonb, v_cut - interval '30 days'),
      (v_uid, v_slot, 'hearthfind', 'hearthfind', 'probe_trophy_a', 1, 0, '{}'::jsonb, v_cut - interval '20 days');
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta, at) values
      (v_uid, v_slot, 'bounty', 'bounty_turnin:p1', 0, '{}'::jsonb, v_cut - interval '40 days'),
      (v_uid, v_slot, 'bounty', 'bounty_turnin:p2', 0, '{}'::jsonb, v_cut - interval '35 days'),
      (v_uid, v_slot, 'bounty', 'bounty_turnin:p3', 0, '{}'::jsonb, v_cut - interval '30 days');
    -- A SECOND CHARACTER WITH A TURN-IN, so "the scoped call reached only v_uid"
    -- is a statement that can be FALSE. Without it the backfill returns one
    -- character row on a fresh replay whether it is scoped or not, and GATE(a6)
    -- below would be a gate that can never be red (CLAUDE.md section 4).
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta, at) values
      (v_uid2, v_slot, 'bounty', 'bounty_turnin:q1', 0, '{}'::jsonb, v_cut - interval '40 days');

    -- SCOPED (Security review 2026-09-20, finding S-LF-1). The unscoped call is
    -- the file's WORK in section 2 and commits once; a SELF-CHECK may not touch
    -- a row it did not create, rolled back or not, and the unscoped body upserts
    -- player_progress for every character that has ever turned in a bounty.
    v_bf := public.hr_backfill_lifetime_facts(v_uid);
    if coalesce((v_bf->>'finds')::bigint, 0) < 3 then
      raise exception 'GATE(backfill): the backfill carried % of 3 fixture finds', v_bf->>'finds';
    end if;

    -- (a6) THE REACH. The function reports how many rows each step wrote, so
    --      the scope is MEASURED rather than trusted: v_uid2 also has a turn-in
    --      and must not appear. Remove `p_user` from any step and this is red
    --      on the replay, not only on a production journal.
    if coalesce((v_bf->>'characters')::bigint, 0) <> 1 then
      raise exception 'GATE(a6): the scoped backfill wrote % turn-in counter row(s), expected 1 (the probe alone) - it reached past the character it was given',
        v_bf->>'characters';
    end if;
    if coalesce((v_bf->>'ordinals')::bigint, 0) <> 2 then
      raise exception 'GATE(a6): the scoped backfill wrote % trophy counter row(s), expected 2 (probe_trophy_a/_b) - it reached past the character it was given',
        v_bf->>'ordinals';
    end if;

    -- (c) IDEMPOTENT. A second run moves nothing.
    --     BOTH COUNTS ARE SCOPED (Security review 2026-09-20, section (d)): a
    --     global count(*) is dominated by real rows on production, so the
    --     equality would also be satisfied by a backfill that added and removed
    --     the same number of rows. The unscoped re-run is not exercised here -
    --     it is proved to REFUSE by GATE(c2) below, and by
    --     tests/lifetime-facts-reapply.mjs.
    select count(*) into v_rows0 from public.hearthfind_log
      where user_id in (v_uid, v_uid2);
    v_bf := public.hr_backfill_lifetime_facts(v_uid);
    select count(*) into v_rows1 from public.hearthfind_log
      where user_id in (v_uid, v_uid2);
    if v_rows1 <> v_rows0 or coalesce((v_bf->>'finds')::bigint, -1) <> 0 then
      raise exception 'GATE(c): the backfill is NOT idempotent - a second run added % rows (reported %)',
        v_rows1 - v_rows0, v_bf->>'finds';
    end if;
    if (select value from public.player_progress
         where user_id=v_uid and slot=v_slot and kind='stat' and key='bounty_turnins' and period_key='') <> 3 then
      raise exception 'GATE(c): the second backfill run moved the turn-in counter';
    end if;

    -- THE THREE FACTS, MEASURED BEFORE THE PRUNE, from the durable homes.
    select count(distinct item_id) into v_set0 from public.hearthfind_log
      where user_id = v_uid and slot = v_slot;
    select found_total into v_nth0 from public.hearthfind_ordinal where item_id = 'probe_trophy_a';
    v_fc0 := public.hr_bounty_first_contract(v_uid, v_slot);

    -- ...and the OLD, ledger-derived answers, so the gate proves the two agree
    -- TODAY (the backfill lost nothing) before it proves only one survives.
    select count(distinct item_id) into v_led_set from public.player_ledger
      where user_id = v_uid and slot = v_slot and kind = 'hearthfind';
    select count(*) into v_led_nth from public.player_ledger
      where kind = 'hearthfind' and item_id = 'probe_trophy_a';
    if v_set0 <> v_led_set or v_nth0 <> v_led_nth or v_fc0 <> false then
      raise exception 'GATE(a0): the durable homes disagree with the ledger BEFORE any prune (set %/%, nth %/%, first_contract %) - the backfill lost or invented a fact',
        v_set0, v_led_set, v_nth0, v_led_nth, v_fc0;
    end if;

    -- (a-pre) THE TRIGGER IS ARMED WHILE THIS RUNS. hr_ledger_immutable is what
    --     makes the scoped delete below safe: it permits a row only OUTSIDE the
    --     retention window, which is the same permission hr_ledger_prune's own
    --     delete relies on. If a future body ever drops or widens it, (a) would
    --     quietly become an unguarded delete, so it is proved here, on a probe
    --     row inside the window, before anything is pruned. The refusal is the
    --     mutation proof; `v_armed` false is the defect.
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta, at)
      values (v_uid, v_slot, 'shop', 'probe_in_window', 0, '{}'::jsonb, now() - interval '1 hour');
    v_armed := false;
    begin
      delete from public.player_ledger
       where user_id = v_uid and slot = v_slot and intent = 'probe_in_window';
    exception when check_violation then v_armed := true;
    end;
    if not v_armed then
      raise exception 'GATE(a-pre): an IN-WINDOW ledger row was DELETABLE - hr_ledger_immutable is not armed, so the prune below proves nothing about a real retention prune';
    end if;

    -- (a) THE PRUNE, SCOPED TO THE PROBE CHARACTERS AND TO NOTHING ELSE. What
    --     the retention prune will do on ~2026-11-21, applied to the rows this
    --     block created. Three properties hold at once:
    --       - the predicate names v_uid/v_uid2, so no real player's ledger row
    --         is deleted, committed or rolled back (the 2026-09-20 defect);
    --       - the cut is the POLICY's own (v_cut, from hr_ledger_config), so
    --         the probe is pruned by the rule in force rather than by an
    --         interval that can drift away from it; and
    --       - hr_ledger_immutable stays ARMED for the statement, proved by
    --         (a-pre). These rows are permitted for exactly the reason
    --         hr_ledger_prune's rows are: they are outside the window.
    --     hr_ledger_prune() is NOT called here. Its predicate is `at < v_cut`
    --     with no owner column, so every call reaches every player's rows, and
    --     a self-check may not touch a row it did not create. The function's own
    --     conservation properties are proved in 2026-09-18-ledger-rollup-
    --     currencies.sql; what this gate needs is only that the journal stops
    --     answering, and a probe-scoped delete is that, exactly.
    delete from public.player_ledger
     where user_id in (v_uid, v_uid2) and at < v_cut;

    -- (a5) THE CANARY READS BACK. The assertion that would have caught the
    --      2026-09-20 blanket delete on the database it was aimed at.
    select count(*) into v_byst1 from public.player_ledger
      where at < v_cut
        and user_id is distinct from v_uid and user_id is distinct from v_uid2;
    if v_byst1 <> v_byst0 then
      raise exception 'GATE(a5): the prune deleted % ledger row(s) belonging to REAL players (% -> %) - a self-check may not touch the money journal',
        v_byst0 - v_byst1, v_byst0, v_byst1;
    end if;

    select count(distinct item_id) into v_set1 from public.hearthfind_log
      where user_id = v_uid and slot = v_slot;
    select found_total into v_nth1 from public.hearthfind_ordinal where item_id = 'probe_trophy_a';
    v_fc1 := public.hr_bounty_first_contract(v_uid, v_slot);

    if v_set1 <> v_set0 then
      raise exception 'GATE(a1): the trophy SET changed across the prune (% -> %)', v_set0, v_set1;
    end if;
    if v_nth1 <> v_nth0 then
      raise exception 'GATE(a2): the GLOBAL ordinal changed across the prune (% -> %)', v_nth0, v_nth1;
    end if;
    if v_fc1 is distinct from v_fc0 then
      raise exception 'GATE(a3): first-contract changed across the prune (% -> %) - a veteran regained the beginner floor', v_fc0, v_fc1;
    end if;

    -- (a4) THE CONTROL. The ledger-derived answers MUST have moved - otherwise
    --      the prune did not bite and gates (a1)-(a3) proved nothing.
    select count(distinct item_id) into v_led_set from public.player_ledger
      where user_id = v_uid and slot = v_slot and kind = 'hearthfind';
    select count(*) into v_led_nth from public.player_ledger
      where kind = 'hearthfind' and item_id = 'probe_trophy_a';
    select (select count(*) from (select 1 from public.player_ledger
              where user_id=v_uid and slot=v_slot and kind='bounty'
                and intent like 'bounty_turnin:%' limit 3) t) < 3 into v_led_fc;
    if v_led_set <> 0 or v_led_nth <> 0 or v_led_fc <> true then
      raise exception 'GATE(a4): the prune did not bite (ledger set %, nth %, first_contract %) - gates (a1)-(a3) are vacuous',
        v_led_set, v_led_nth, v_led_fc;
    end if;

    -- (b) TWO FINDERS CAN NEVER SHARE N.
    --   (b1) ALLOCATION. The same statement hr_apply now runs, twice: the second
    --        caller cannot observe the first's N.
    insert into public.hearthfind_ordinal as o (item_id, found_total, updated_at)
      values ('probe_trophy_race', 1, now())
      on conflict (item_id) do update set found_total = o.found_total + 1, updated_at = now()
      returning o.found_total into v_n1;
    insert into public.hearthfind_ordinal as o (item_id, found_total, updated_at)
      values ('probe_trophy_race', 1, now())
      on conflict (item_id) do update set found_total = o.found_total + 1, updated_at = now()
      returning o.found_total into v_n2;
    if v_n1 = v_n2 or v_n2 <> v_n1 + 1 then
      raise exception 'GATE(b1): two allocations returned % and % - the ordinal is not monotonic per call', v_n1, v_n2;
    end if;
    insert into public.hearthfind_log (user_id, slot, item_id, nth_ever) values
      (v_uid, v_slot, 'probe_trophy_race', v_n1), (v_uid2, v_slot, 'probe_trophy_race', v_n2);

    --   (b2) THE CONSTRAINT. A FORCED duplicate - the shape a future body that
    --        counted rows would produce under a race - must be REFUSED by the
    --        database, not merely avoided by convention.
    begin
      insert into public.hearthfind_log (user_id, slot, item_id, nth_ever)
        values (v_uid2, v_slot, 'probe_trophy_race', v_n1);
      v_dup := true;
    exception when unique_violation then v_dup := false;
    end;
    if v_dup then
      raise exception 'GATE(b2): a SECOND find was recorded as the same Nth of one trophy - two players can share a bragging moment';
    end if;

    -- (c2) THE BACKFILL WINDOW IS CLOSED. Two LIVE rows (src_ledger_id NULL)
    --      now exist from (b1), which is exactly the state a single real find
    --      produces. Before the S-LF-1 fix a re-run here re-derived their
    --      ordinals from the ledger and aborted on hearthfind_log_nth_uq - an
    --      uncaught unique_violation from a function the header advertises as
    --      idempotent. It must now refuse EXPLICITLY, and the refusal is the
    --      mutation proof that the guard bites.
    begin
      v_bf := public.hr_backfill_lifetime_facts();
      raise exception 'GATE(c2): the backfill RAN with live allocated find rows present - it would re-number a trophy already handed to a player';
    exception when others then
      if sqlerrm like 'GATE(c2)%' then raise; end if;
      if strpos(sqlerrm, 'REFUSING') = 0 then
        raise exception 'GATE(c2): the backfill failed with the WRONG error (%) - expected an explicit refusal, not a constraint violation', sqlerrm;
      end if;
    end;

    -- (d) A PLAYER CANNOT READ ANOTHER PLAYER'S FOUND SET.
    perform set_config('request.jwt.claim.sub', v_uid2::text, true);
    set local role authenticated;
    select count(*) into v_seen from public.hearthfind_log where user_id = v_uid;
    if v_seen <> 0 then
      raise exception 'GATE(d): a signed-in player read % of another character''s find rows', v_seen;
    end if;
    select count(*) into v_seen from public.hearthfind_log;
    if v_seen <> 1 then
      raise exception 'GATE(d): the reader sees % rows of its own (expected its single race find) - RLS is not per-user', v_seen;
    end if;
    begin
      insert into public.hearthfind_log (user_id, slot, item_id, nth_ever)
        values (v_uid2, v_slot, 'probe_forged', 9999);
      reset role;
      raise exception 'GATE(d2): a signed-in player INSERTED a find row - the ordinal is client-forgeable';
    exception when insufficient_privilege or check_violation then null;
    end;
    begin
      select count(*) into v_seen from public.hearthfind_ordinal;
      reset role;
      raise exception 'GATE(d3): a signed-in player READ the global counter table (% rows)', v_seen;
    exception when insufficient_privilege then null;
    end;
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);

    raise exception 'HR_ROLLBACK_SENTINEL';
  exception when others then
    begin reset role; exception when others then null; end;
    perform set_config('request.jwt.claim.sub', '', true);
    if sqlerrm <> 'HR_ROLLBACK_SENTINEL' then raise; end if;
  end;

  -- (z) THE LEAK CHECK - the fixture is gone, so every gate above ran inside the
  --     subtransaction that was rolled back.
  if exists (select 1 from public.hearthfind_log where user_id in (v_uid, v_uid2)) then
    raise exception 'GATE(z): fixture find rows survived the rollback';
  end if;
  if exists (select 1 from public.hearthfind_ordinal where item_id like 'probe_%') then
    raise exception 'GATE(z): fixture ordinal rows survived the rollback';
  end if;
  if exists (select 1 from public.player_ledger where user_id in (v_uid, v_uid2)) then
    raise exception 'GATE(z): fixture ledger rows survived the rollback';
  end if;
  -- The backfill writes fact 3 into player_progress, so the leak check has to
  -- name that table too - otherwise a probe character's lifetime turn-in
  -- counter is residue nothing looks for.
  if exists (select 1 from public.player_progress where user_id in (v_uid, v_uid2)) then
    raise exception 'GATE(z): fixture player_progress rows survived the rollback';
  end if;
  if exists (select 1 from public.player_state where user_id in (v_uid, v_uid2)) then
    raise exception 'GATE(z): the fixture characters survived the rollback';
  end if;
  if exists (select 1 from auth.users where id in (v_uid, v_uid2)) then
    raise exception 'GATE(z): the fixture auth users survived the rollback';
  end if;

  raise notice 'lifetime-facts-off-the-ledger: all gates passed';
end $$;
