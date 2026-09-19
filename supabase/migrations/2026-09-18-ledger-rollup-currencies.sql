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
--   §1  Adds four columns to public.player_ledger_rollup, all NOT NULL DEFAULT 0
--       so every existing row (production: zero of them) is already correct and
--       no backfill is needed or possible.
--   §2  Restates hr_ledger_prune to carry them. The derivations mirror the gold
--       pair exactly: an `_in` is sum(greatest(v,0)), an `_out` is
--       sum(greatest(-v,0)). xp and gems_in are non-negative by CHECK, so they
--       take a plain sum and do NOT get an `_out` twin — a column that can only
--       ever be zero is a lie with a name.
--   §3  Self-check, executed.
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
--     drop column xp_in, drop column qty_in, drop column qty_out, drop column gems_in;
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

-- ── §1. The four missing currencies ──────────────────────────────────────
-- NOT NULL DEFAULT 0 rather than nullable: a rollup row that says NULL for xp is
-- indistinguishable from one that says "no XP moved", and the whole point of an
-- aggregate that outlives its detail is that it can be read without caveats.
alter table public.player_ledger_rollup add column if not exists xp_in    bigint not null default 0;
alter table public.player_ledger_rollup add column if not exists qty_in   bigint not null default 0;
alter table public.player_ledger_rollup add column if not exists qty_out  bigint not null default 0;
alter table public.player_ledger_rollup add column if not exists gems_in  bigint not null default 0;

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
      (user_id, slot, month, kind, n, gold_in, gold_out, xp_in, qty_in, qty_out, gems_in)
      select l.user_id, l.slot, date_trunc('month', l.at)::date, l.kind,
             count(*),
             sum(greatest(coalesce(l.gold, 0), 0)),
             sum(greatest(-coalesce(l.gold, 0), 0)),
             -- xp and gems_in are non-negative by CHECK, so a plain sum is the
             -- whole truth and an `_out` twin would be a permanently-zero column.
             sum(greatest(coalesce(l.xp, 0), 0)),
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
begin
  begin
    -- (a) the four columns exist, are bigint, and are NOT NULL DEFAULT 0
    select count(*) into v_n from information_schema.columns
     where table_schema = 'public' and table_name = 'player_ledger_rollup'
       and column_name in ('xp_in','qty_in','qty_out','gems_in')
       and data_type = 'bigint' and is_nullable = 'NO' and column_default = '0';
    if v_n <> 4 then
      raise exception 'e1: expected 4 bigint NOT NULL DEFAULT 0 currency columns, found %', v_n;
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
    --     is ~200 days back, so both rows are far outside the 90-day window.
    insert into public.player_ledger (user_id, slot, kind, intent, gold, xp, qty, gems_in,
                                      gold_in, xp_in, qty_in, at)
      values (v_u, 0, 'combat', 'probe_a',  700, 1234,  9, 5,  700, 1234,  9,
              date_trunc('month', now() - interval '200 days') + interval '5 days'),
             (v_u, 0, 'combat', 'probe_b', -250,  766, -4, 3,    0,  766,  0,
              date_trunc('month', now() - interval '200 days') + interval '7 days');

    perform public.hr_ledger_prune(20000);

    select * into v_r from public.player_ledger_rollup
     where user_id = v_u and slot = 0 and kind = 'combat';
    if v_r is null then
      raise exception 'e2: the prune deleted the probe detail rows and wrote NO rollup row';
    end if;
    if v_r.n <> 2 then raise exception 'e3: rollup n = %, expected 2', v_r.n; end if;
    if v_r.gold_in  <> 700  then raise exception 'e4: gold_in = %, expected 700', v_r.gold_in; end if;
    if v_r.gold_out <> 250  then raise exception 'e5: gold_out = %, expected 250', v_r.gold_out; end if;
    -- THE POINT OF THE FILE: before it, all four of these were structurally 0.
    if v_r.xp_in    <> 2000 then raise exception 'e6: xp_in = %, expected 2000', v_r.xp_in; end if;
    if v_r.qty_in   <> 9    then raise exception 'e7: qty_in = %, expected 9', v_r.qty_in; end if;
    if v_r.qty_out  <> 4    then raise exception 'e8: qty_out = %, expected 4', v_r.qty_out; end if;
    if v_r.gems_in  <> 8    then raise exception 'e9: gems_in = %, expected 8', v_r.gems_in; end if;

    -- (c) the detail rows really are gone (a rollup that co-exists with its
    --     detail would make every number above provable without the prune)
    select count(*) into v_left from public.player_ledger where user_id = v_u;
    if v_left <> 0 then
      raise exception 'e10: % probe detail row(s) survived the prune', v_left;
    end if;

    -- (d) A SECOND RUN IS A NO-OP. The job is hourly and the on-conflict clause
    --     ACCUMULATES, so this is the property that stops every total inflating
    --     forever once the coupling to the delete is broken.
    if public.hr_ledger_prune(20000) <> 0 then
      raise exception 'e11: a second prune deleted more rows';
    end if;
    select * into v_r from public.player_ledger_rollup
     where user_id = v_u and slot = 0 and kind = 'combat';
    if v_r.n <> 2 or v_r.xp_in <> 2000 or v_r.gems_in <> 8 then
      raise exception 'e12: a second prune MOVED the rollup (n=%, xp_in=%, gems_in=%)',
        v_r.n, v_r.xp_in, v_r.gems_in;
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
  raise notice 'ledger-rollup-currencies self-check PASSED (e1-e15); probe rows rolled back';
end $$;
