-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-18-ledger-rollup-currencies.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. The Coordinator applies after a Security GO.
--
-- WHAT IS WRONG TODAY
-- public.player_ledger carries value in FOUR currencies — gold, xp, qty (items)
-- and gems_in — and public.player_ledger_rollup declares ONE of them
-- (n, gold_in, gold_out). hr_ledger_prune DELETES the detail rows and keeps only
-- that rollup, so the hour the prune first fires every pruned row's XP, item
-- quantity and gem movement ceases to exist with no aggregate behind it, while
-- gold survives. XP is a RANKED surface and gems are a PAID one.
--
-- This has never happened yet, which is the only reason it is still fixable
-- cheaply: measured read-only on production 2026-09-18, player_ledger_rollup = 0
-- rows and the oldest player_ledger row is 27 days old against
-- hr_ledger_config.retain_days = 90, so the first real prune is ~2026-11-21.
-- After that date this migration can no longer recover what it prevents —
-- the detail rows it would have summarised are gone. That is the whole urgency:
-- it is cheap now and impossible later.
--
-- Found by tests/ledger-rollup.mjs, which replays this chain, manufactures the
-- aged rows production will not have for two months, runs hr_ledger_prune
-- exactly as cron calls it, and asserts conservation / boundary / idempotency /
-- no-reader-moves. Its ROLLUP_SUMS map grows to the new columns in the same
-- commit, so the guard defends them from the moment this file is in the chain.
--
-- WHAT THIS FILE DOES
--   §1  Adds five columns to public.player_ledger_rollup, all NOT NULL DEFAULT 0
--       so every existing row (production: zero of them) is already correct and
--       no backfill is needed or possible.
--   §2  Restates hr_ledger_prune to carry them. The derivations mirror the gold
--       pair exactly: an `_in` is sum(greatest(v,0)), an `_out` is
--       sum(greatest(-v,0)).
--   §3  Self-check, executed.
--
-- ── SECURITY REVIEW 2026-09-18 (S-LR-1): xp GETS AN `_out` TWIN ─────────────
-- An earlier draft of this file summed xp with `greatest(xp, 0)` into xp_in
-- alone, on the stated ground that "xp and gems_in are non-negative by CHECK".
-- That is HALF TRUE and the false half is the dangerous one. Measured read-only
-- on production 2026-09-18, pg_constraint on public.player_ledger holds:
--   player_ledger_gems_in_nonneg  CHECK (coalesce(gems_in,0) >= 0)
--   player_ledger_inflow_nonneg   CHECK (coalesce(gold_in,0) >= 0
--                                    and coalesce(xp_in,0)  >= 0
--                                    and coalesce(qty_in,0) >= 0)
-- `xp_in` is constrained. **`xp` is not.** They are different columns, and it is
-- `xp` — the signed movement column — that this rollup summarises. Nothing in
-- the database stops a negative `xp` row from being written today; the only
-- reason none exists is that no writer has yet produced one (measured: zero rows
-- with xp < 0, against 329 rows with qty < 0, which is why qty correctly got its
-- pair). So `greatest(xp, 0)` is not a no-op justified by a constraint, it is an
-- unguarded CLAMP: the first XP debit this game ever issues — a respec, a
-- rollback, an anti-cheat clawback, a skill-reset — would be DELETED by the
-- prune with the only surviving record silently reading zero, on a RANKED
-- surface. By the file's own principle, a column that can only ever be zero is a
-- lie with a name; a column that is only PROBABLY zero is a worse one. xp is
-- signed in the schema, so it is conserved signed. gems_in keeps no twin because
-- its CHECK is real and was verified.
--
-- ── SECURITY REVIEW 2026-09-18 (S-LR-2): the column names are PROVENANCED ───
-- public.player_ledger carries BOTH a movement column and a same-named budget
-- column for gold, xp and qty (`gold`/`gold_in`, `xp`/`xp_in`, `qty`/`qty_in`),
-- and this rollup mixes the two conventions: rollup.xp_in derives from
-- ledger.xp, but rollup.gems_in derives from ledger.gems_in (there is no plain
-- `gems` column). That is consistent with the pre-existing gold pair and is NOT
-- changed here, because renaming the gold pair would move a shipped column. It
-- IS documented, in the database, by §1b — this aggregate is the ONLY thing that
-- outlives the detail, so the one reader it has is a human doing forensics years
-- later with no rows left to check the meaning against.
--
-- NOT A FAUCET AND NOT A READER CHANGE. This file adds four AGGREGATE columns to
-- a table no client role can reach and moves nothing a player can spend. No RPC
-- reads player_ledger_rollup except the 2026-09-07 farm backfill's
-- prune-detection guard (`count(*) … where kind='farm'`), which is unaffected.
-- No grant changes: the rollup has no client grant and hr_ledger_prune stays
-- revoked from public/anon/authenticated/service_role.
--
-- ORDER: after 2026-08-11-player-state.sql (creates both objects). It is the new
-- LAST TOUCHER of hr_ledger_prune; nothing else in the chain replaces it.
-- LIVE-HASH: this MOVES hr_ledger_prune. After applying run
--   node tests/live-hash-drift.mjs --live --write
-- REVERSIBILITY: re-apply 2026-08-11-player-state.sql to restore the previous
-- body; the four columns may be left in place (they are additive, defaulted and
-- read by nothing) or dropped with
--   alter table public.player_ledger_rollup
--     drop column xp_in, drop column xp_out, drop column qty_in, drop column qty_out,
--     drop column gems_in;
-- Re-applying this file is a no-op (add column if not exists + create or replace).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0. Fail closed on the objects this file assumes ─────────────────────
do $$
begin
  if to_regclass('public.player_ledger_rollup') is null then
    raise exception 'player_ledger_rollup is absent — apply 2026-08-11-player-state.sql first';
  end if;
  if to_regprocedure('public.hr_ledger_prune(int)') is null then
    raise exception 'hr_ledger_prune(int) is absent — apply 2026-08-11-player-state.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'player_ledger'
                    and column_name = 'gems_in') then
    raise exception 'player_ledger.gems_in is absent — apply 2026-08-15-gem-daily-budget.sql first';
  end if;
end $$;

-- ── §1. The missing currencies ───────────────────────────────────────────
-- NOT NULL DEFAULT 0 rather than nullable: a rollup row that says NULL for xp is
-- indistinguishable from one that says "no XP moved", and the whole point of an
-- aggregate that outlives its detail is that it can be read without caveats.
alter table public.player_ledger_rollup add column if not exists xp_in    bigint not null default 0;
alter table public.player_ledger_rollup add column if not exists xp_out   bigint not null default 0;
alter table public.player_ledger_rollup add column if not exists qty_in   bigint not null default 0;
alter table public.player_ledger_rollup add column if not exists qty_out  bigint not null default 0;
alter table public.player_ledger_rollup add column if not exists gems_in  bigint not null default 0;

-- ── §1b. PROVENANCE, in the database (Security S-LR-2) ───────────────────
-- Which player_ledger column each aggregate came from, readable by \d+ and by
-- any forensic query, forever — including after every detail row is gone. Set
-- unconditionally so a re-apply repairs a comment someone edited away.
comment on table  public.player_ledger_rollup is
  'Per (user, slot, month, kind) aggregate written by hr_ledger_prune as it deletes player_ledger detail older than hr_ledger_config.retain_days. After a prune this is the ONLY surviving record of those movements. Aggregates only: intent and item_id are NOT carried, so no question that discriminates by intent or item can be answered from here (see tests/ledger-rollup.mjs property 5).';
comment on column public.player_ledger_rollup.n        is 'count(*) of pruned player_ledger rows in this bucket.';
comment on column public.player_ledger_rollup.gold_in  is 'sum of the POSITIVE part of player_ledger.gold (the signed movement column, NOT player_ledger.gold_in, which is the per-day budget column).';
comment on column public.player_ledger_rollup.gold_out is 'sum of the NEGATIVE part of player_ledger.gold, as a positive number.';
comment on column public.player_ledger_rollup.xp_in    is 'sum of the POSITIVE part of player_ledger.xp (the signed movement column, NOT player_ledger.xp_in, which is the per-day budget column).';
comment on column public.player_ledger_rollup.xp_out   is 'sum of the NEGATIVE part of player_ledger.xp, as a positive number. player_ledger.xp carries NO non-negative CHECK, so this is conserved rather than clamped away.';
comment on column public.player_ledger_rollup.qty_in   is 'sum of the POSITIVE part of player_ledger.qty (items gained).';
comment on column public.player_ledger_rollup.qty_out  is 'sum of the NEGATIVE part of player_ledger.qty, as a positive number (items spent, escrowed or consumed).';
comment on column public.player_ledger_rollup.gems_in  is 'sum of player_ledger.gems_in (there is no plain `gems` column; this one IS the budget column and carries a non-negative CHECK, so it has no _out twin).';

-- ── §2. The prune, carrying all four ─────────────────────────────────────
-- Everything outside the aggregate list is BYTE-IDENTICAL to the 2026-08-11
-- body: the same batched `for update skip locked` doomed CTE, the same one-second
-- boundary slack, the same accumulate-on-conflict, the same single delete. The
-- only change is what is summarised on the way out.
create or replace function public.hr_ledger_prune(p_limit int default 20000)
returns int language plpgsql security definer set search_path = public as $$
declare v_keep int; v_cut timestamptz; v_n int;
begin
  select retain_days into v_keep from public.hr_ledger_config;
  -- One second of slack so the prune never argues with the trigger's own
  -- boundary check about which side of `now()` a row is on.
  v_cut := now() - make_interval(days => coalesce(v_keep, 90)) - interval '1 second';

  with doomed as (
    select id, at from public.player_ledger
     where at < v_cut
     order by at, id
     limit greatest(1, least(100000, coalesce(p_limit, 20000)))
     for update skip locked
  ),
  rolled as (
    insert into public.player_ledger_rollup as r
      (user_id, slot, month, kind, n, gold_in, gold_out, xp_in, xp_out, qty_in, qty_out, gems_in)
      select l.user_id, l.slot, date_trunc('month', l.at)::date, l.kind,
             count(*),
             sum(greatest(coalesce(l.gold, 0), 0)),
             sum(greatest(-coalesce(l.gold, 0), 0)),
             -- xp is SIGNED and carries NO non-negative CHECK (the constraint
             -- named player_ledger_inflow_nonneg guards xp_in, a DIFFERENT
             -- column). Clamping it here would delete the first XP debit this
             -- game ever issues off a ranked surface. Security S-LR-1.
             sum(greatest(coalesce(l.xp, 0), 0)),
             sum(greatest(-coalesce(l.xp, 0), 0)),
             -- qty is SIGNED: negative when items leave the bag (a market list,
             -- a craft consuming reagents). Both directions are real movement and
             -- both are kept, mirroring the gold pair.
             sum(greatest(coalesce(l.qty, 0), 0)),
             sum(greatest(-coalesce(l.qty, 0), 0)),
             sum(greatest(coalesce(l.gems_in, 0), 0))
        from public.player_ledger l join doomed d on d.id = l.id and d.at = l.at
       group by 1,2,3,4
    on conflict (user_id, slot, month, kind) do update
      set n        = r.n        + excluded.n,
          gold_in  = r.gold_in  + excluded.gold_in,
          gold_out = r.gold_out + excluded.gold_out,
          xp_in    = r.xp_in    + excluded.xp_in,
          xp_out   = r.xp_out   + excluded.xp_out,
          qty_in   = r.qty_in   + excluded.qty_in,
          qty_out  = r.qty_out  + excluded.qty_out,
          gems_in  = r.gems_in  + excluded.gems_in
    returning 1
  )
  delete from public.player_ledger l
   using doomed d where l.id = d.id and l.at = d.at;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.hr_ledger_prune(int)
  from public, anon, authenticated, service_role;

-- ── §3. SELF-CHECK — properties asserted by EXECUTING them ───────────────
-- Everything below runs inside a subtransaction that is ROLLED BACK, so the
-- probe rows never commit. Apply is atomic anyway; the rollback is so that a
-- SUCCESSFUL apply also leaves no residue in a table that holds player value.
do $$
declare
  v_u  uuid := '00000000-0000-4000-c000-00000000f18a';
  v_r  record;
  v_n  int;
  v_left int;
  v_keep0 int; v_byst0 int; v_byst1 int;
begin
  begin
    -- (a) the four columns exist, are bigint, and are NOT NULL DEFAULT 0
    select count(*) into v_n from information_schema.columns
     where table_schema = 'public' and table_name = 'player_ledger_rollup'
       and column_name in ('xp_in','xp_out','qty_in','qty_out','gems_in')
       and data_type = 'bigint' and is_nullable = 'NO' and column_default = '0';
    if v_n <> 5 then
      raise exception 'e1: expected 5 bigint NOT NULL DEFAULT 0 currency columns, found %', v_n;
    end if;

    -- (a2) THE PREMISE OF xp_out, ASSERTED RATHER THAN BELIEVED (Security
    --      S-LR-1). If someone later adds a non-negative CHECK to
    --      player_ledger.xp, xp_out becomes a provably-zero column and should
    --      be dropped — this is the assertion that will say so. It fails
    --      LOUDLY in that direction rather than leaving a dead column behind.
    if exists (select 1 from pg_constraint
                where conrelid = 'public.player_ledger'::regclass and contype = 'c'
                  and pg_get_constraintdef(oid) ~ 'coalesce\(xp,'
                  and pg_get_constraintdef(oid) ~ '>= 0') then
      raise exception 'e1b: player_ledger.xp has acquired a non-negative CHECK. '
        'xp_out can now only ever be 0 — re-review and drop it.';
    end if;

    -- (a3) PROVENANCE IS RECORDED (Security S-LR-2). The rollup outlives its
    --      detail, so a column whose source is not written down is unreadable
    --      the moment it matters.
    select count(*) into v_n from information_schema.columns c
      join pg_class t on t.relname = 'player_ledger_rollup'
     where c.table_schema = 'public' and c.table_name = 'player_ledger_rollup'
       and c.column_name in ('n','gold_in','gold_out','xp_in','xp_out','qty_in','qty_out','gems_in')
       and col_description(t.oid, c.ordinal_position::int) is not null;
    if v_n <> 8 then
      raise exception 'e1c: expected 8 documented rollup aggregate columns, found %', v_n;
    end if;

    -- (b0) THE PRUNE UNDER TEST IS GLOBAL BY CONSTRUCTION, SO ITS REACH IS
    --      NARROWED TO THE PROBE BEFORE IT IS CALLED. (Incident 2026-09-20:
    --      2026-09-19-lifetime-facts-off-the-ledger.sql was refused on
    --      production for running a blanket `delete from public.player_ledger`
    --      inside a self-check. This file has the same class in a subtler
    --      shape: hr_ledger_prune's predicate is `at < now() - retain_days`
    --      with no owner column, so on a production ledger that has reached its
    --      first prune date (~2026-11-21), `perform public.hr_ledger_prune(20000)`
    --      below deletes and rolls up REAL players' aged rows - rolled back,
    --      but a self-check may not touch a row it did not create. It would
    --      also have broken e11: an aged tail of more than 20,000 rows makes a
    --      second prune return non-zero and fails this apply for a reason that
    --      is not a defect.)
    --
    --      THE FIX, without weakening anything the gates prove: the retention
    --      window is WIDENED to the maximum hr_ledger_config allows (3650 days,
    --      its own CHECK ceiling) and the probe rows are dated beyond even
    --      that. hr_ledger_prune is then called FOR REAL and unmodified - only
    --      its reach is now provably the probe rows alone.
    --
    --      The UPDATE is on the config table, not on a player table, and rolls
    --      back with everything else. A concurrent hr_ledger_prune() cannot see
    --      it: that function reads retain_days with a plain SELECT, which under
    --      MVCC returns the committed value, and it takes no lock this
    --      statement would block on.
    select retain_days into v_keep0 from public.hr_ledger_config;

    -- THE BYSTANDER CANARY, taken at the retention cut ACTUALLY CONFIGURED -
    -- i.e. over exactly the rows a normally-configured prune could delete. It
    -- is what (c2) re-reads, and it is non-vacuous in the way a count at the
    -- WIDENED cut would not be: if the prune below ignored the widening and
    -- used the real cut, these are the rows it would take. Bounded to the
    -- retention tail, so it is a PK range scan on (at, id), not a full count.
    select count(*) into v_byst0 from public.player_ledger
     where at < now() - make_interval(days => coalesce(v_keep0, 90))
       and user_id is distinct from v_u;   -- not `<>`: NULL-blind, S-LR-2

    update public.hr_ledger_config set retain_days = 3650 where only_row;

    -- (e0) NOTHING REAL IS IN REACH OF THE WIDENED PRUNE. A database that holds
    --      a ten-year-old real ledger row refuses this apply rather than having
    --      that row pruned by a self-check.
    select count(*) into v_n from public.player_ledger
     where at < now() - interval '3650 days' and user_id <> v_u;
    if v_n <> 0 then
      raise exception 'e0: % real ledger row(s) predate the widened retention window. '
        'hr_ledger_prune would DELETE them inside this self-check; refusing.', v_n;
    end if;

    -- (b) CONSERVATION, end to end. Two aged rows in ONE (user,slot,month,kind)
    --     bucket carrying every currency in BOTH directions, pruned for real.
    --     Both timestamps are anchored to the START OF THE SAME MONTH rather
    --     than to two `now() - N days` offsets. The rollup key includes
    --     date_trunc('month', at), so two offsets that happen to straddle a
    --     month boundary would land in different buckets and n would be 1 twice
    --     instead of 2 once — leaving the accumulate-on-conflict path untested
    --     and the assertion below failing for a reason that is not a defect.
    --     Anchoring makes it true on every date this is ever applied. The month
    --     is ~3700 days back, so all three rows are outside the widened window
    --     (b0) opened - and, by (e0), nothing else in the database is.
    insert into public.player_ledger (user_id, slot, kind, intent, gold, xp, qty, gems_in,
                                      gold_in, xp_in, qty_in, at)
      values (v_u, 0, 'combat', 'probe_a',  700, 1234,  9, 5,  700, 1234,  9,
              date_trunc('month', now() - interval '3700 days') + interval '5 days'),
             (v_u, 0, 'combat', 'probe_b', -250,  766, -4, 3,    0,  766,  0,
              date_trunc('month', now() - interval '3700 days') + interval '7 days'),
             -- probe_c carries a NEGATIVE xp. It is insertable because
             -- player_ledger.xp has no non-negative CHECK (e1b proves that is
             -- still true), and it is the row that makes e6b non-vacuous: on the
             -- earlier draft of this file this movement was clamped to zero and
             -- deleted. Security S-LR-1.
             (v_u, 0, 'combat', 'probe_c',    0, -500,  0, 0,    0,    0,  0,
              date_trunc('month', now() - interval '3700 days') + interval '9 days');

    perform public.hr_ledger_prune(20000);

    select * into v_r from public.player_ledger_rollup
     where user_id = v_u and slot = 0 and kind = 'combat';
    if v_r is null then
      raise exception 'e2: the prune deleted the probe detail rows and wrote NO rollup row';
    end if;
    if v_r.n <> 3 then raise exception 'e3: rollup n = %, expected 3', v_r.n; end if;
    if v_r.gold_in  <> 700  then raise exception 'e4: gold_in = %, expected 700', v_r.gold_in; end if;
    if v_r.gold_out <> 250  then raise exception 'e5: gold_out = %, expected 250', v_r.gold_out; end if;
    -- THE POINT OF THE FILE: before it, all four of these were structurally 0.
    if v_r.xp_in    <> 2000 then raise exception 'e6: xp_in = %, expected 2000', v_r.xp_in; end if;
    -- e6b: THE XP DEBIT SURVIVED. Zero here means the prune clamped a negative
    --      xp away and deleted the detail row that proved it existed.
    if v_r.xp_out   <> 500  then raise exception 'e6b: xp_out = %, expected 500', v_r.xp_out; end if;
    if v_r.qty_in   <> 9    then raise exception 'e7: qty_in = %, expected 9', v_r.qty_in; end if;
    if v_r.qty_out  <> 4    then raise exception 'e8: qty_out = %, expected 4', v_r.qty_out; end if;
    if v_r.gems_in  <> 8    then raise exception 'e9: gems_in = %, expected 8', v_r.gems_in; end if;

    -- (c) the detail rows really are gone (a rollup that co-exists with its
    --     detail would make every number above provable without the prune)
    select count(*) into v_left from public.player_ledger where user_id = v_u;
    if v_left <> 0 then
      raise exception 'e10: % probe detail row(s) survived the prune', v_left;
    end if;

    -- (c2) THE BYSTANDER CANARY READS BACK. (b0)/(e0) proved nothing real was
    --      in reach; this proves the prune did not reach one anyway. The
    --      assertion the 2026-09-20 incident says every self-check that deletes
    --      from a player table owes: the scope is asserted, not believed.
    select count(*) into v_byst1 from public.player_ledger
     where at < now() - make_interval(days => coalesce(v_keep0, 90))
       and user_id is distinct from v_u;   -- not `<>`: NULL-blind, S-LR-2
    if v_byst1 <> v_byst0 then
      raise exception 'e10b: the prune deleted % ledger row(s) belonging to REAL '
        'players (% -> %) - a self-check may not touch the money journal',
        v_byst0 - v_byst1, v_byst0, v_byst1;
    end if;

    -- (d) A SECOND RUN IS A NO-OP. The job is hourly and the on-conflict clause
    --     ACCUMULATES, so this is the property that stops every total inflating
    --     forever once the coupling to the delete is broken.
    if public.hr_ledger_prune(20000) <> 0 then
      raise exception 'e11: a second prune deleted more rows';
    end if;
    select * into v_r from public.player_ledger_rollup
     where user_id = v_u and slot = 0 and kind = 'combat';
    if v_r.n <> 3 or v_r.xp_in <> 2000 or v_r.xp_out <> 500 or v_r.gems_in <> 8 then
      raise exception 'e12: a second prune MOVED the rollup (n=%, xp_in=%, xp_out=%, gems_in=%)',
        v_r.n, v_r.xp_in, v_r.xp_out, v_r.gems_in;
    end if;

    -- (e) a row INSIDE the retention window is untouched, and the immutability
    --     trigger still refuses to let it be deleted
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, at)
      values (v_u, 1, 'shop', 'probe_live', -10, 0, now() - interval '1 day');
    perform public.hr_ledger_prune(20000);
    if not exists (select 1 from public.player_ledger where user_id = v_u and slot = 1) then
      raise exception 'e13: the prune took a row that is one day old';
    end if;
    begin
      delete from public.player_ledger where user_id = v_u and slot = 1;
      raise exception 'e14: an in-window ledger row was DELETABLE — hr_ledger_immutable is not armed';
    exception when check_violation then null;
    end;

    -- (f) the function is still unreachable by every client role
    if exists (select 1 from information_schema.role_routine_grants
                where routine_schema = 'public' and routine_name = 'hr_ledger_prune'
                  and grantee in ('public','anon','authenticated','service_role')) then
      raise exception 'e15: hr_ledger_prune is executable by a client role';
    end if;

    raise exception 'HR918_ROLLBACK_OK';
  exception
    when others then
      if sqlerrm <> 'HR918_ROLLBACK_OK' then raise; end if;
  end;

  -- (z) THE ROLLBACK IS ASSERTED, NOT BELIEVED. (Security review 2026-09-20,
  --     section (c) and residual risk 5.) Everything above runs inside a
  --     subtransaction closed by the HR918_ROLLBACK_OK sentinel, so the probe's
  --     player_ledger rows, the player_ledger_rollup rows the prune wrote from
  --     them, and the widened retention window all disappear when it unwinds.
  --     That was TRUE and MEASURED, and nothing in this file said so - the
  --     notice below claimed "probe rows rolled back" with no statement behind
  --     it. 2026-09-19 proves its own rollback in its GATE(z); this one only
  --     believed it. Six lines, outside the subtransaction, so a sentinel that
  --     ever stops unwinding is a refusal rather than a committed probe row in
  --     the money journal.
  if exists (select 1 from public.player_ledger where user_id = v_u) then
    raise exception 'GATE(z): % probe ledger row(s) SURVIVED the rollback - the self-check left rows in the money journal',
      (select count(*) from public.player_ledger where user_id = v_u);
  end if;
  if exists (select 1 from public.player_ledger_rollup where user_id = v_u) then
    raise exception 'GATE(z): % probe rollup row(s) SURVIVED the rollback',
      (select count(*) from public.player_ledger_rollup where user_id = v_u);
  end if;
  if (select retain_days from public.hr_ledger_config) <> v_keep0 then
    raise exception 'GATE(z): hr_ledger_config.retain_days is %, not the % this file found - the (b0) widening was not unwound',
      (select retain_days from public.hr_ledger_config), v_keep0;
  end if;

  raise notice 'ledger-rollup-currencies self-check PASSED (e1-e15 incl. e1b/e1c/e6b); probe rows rolled back (GATE(z) asserted)';
end $$;
