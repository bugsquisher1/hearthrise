-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-12-worker-hired-at-projection.sql
--
-- PROJECT `player_workers.hired_at` IN hr_state_of. One key. No new column, no
-- new grant, no writer, no economy value moved by this file — it exposes a
-- timestamp the table has carried since 2026-08-25-workers.sql to the engine
-- that must read it.
--
-- ⚠ APPLY THIS BEFORE THE hr-accrue DEPLOY THAT DEPENDS ON IT. The engine half
--   (accrual.js `accrueWorkers`, same branch) FAILS CLOSED on a crew row with no
--   `hired_at`: it pays that worker nothing. Applied first, this file is inert
--   for the running engine (an extra key an older engine ignores) and the
--   deploy that follows is seamless. Deployed first, every crew under-pays
--   until this lands.
--
-- ── WHY (the P0 this closes) ────────────────────────────────────────────────
-- `player_state.workers_accrued_to` is a SHARED crew watermark, and index.ts
-- advances it ONLY on a settle that produced. A character with no crew never
-- produces, so the watermark sits where the character was created while the
-- calendar runs — and the first accrual after the first hire pays the whole
-- backlog, bounded only by the 24h WORKER_ACCRUE_CAP.
--
-- MEASURED LIVE (QA 0a47ba77-3a6d-495d-8a95-07480a9d90cf, slot 2,
-- 2026-09-09T03:06:57Z, b527, engine payload 50c6d492): one player_ledger
-- kind='gather' row, meta.ms = 440,102, meta.delta.i.copper_ore = 1,891 —
--     91 the player's own gathering (440,102 / 4,800 ms), and
--  1,800 a worker hired 384 seconds earlier, paid a full 24 hours
--        (86,400,000 / 48,000 ms at copper_rock).
-- The crew items ride the pointer's delta (index.ts `mergeWorkers`), which is
-- why the mint wore a `gather` label — and why that merge now also journals
-- `meta.crew`, so the crew's share of a merged row is readable instead of
-- reconstructed from arithmetic.
--
-- IT IS NOT A ONE-OFF, and it is not a "fire the crew and re-hire" exploit:
-- there is no dismiss RPC and no client write path (`hr_worker_hire` is the
-- only writer on player_workers). The repeat vectors are ORDINARY PLAY:
--   (a) EVERY character's first hire made 24h or more after the character was
--       created — the common case, and the one measured above;
--   (b) a hire into a FRESH SLOT on an older account — same arithmetic;
--   (c) the WHOLE crew left idle and then re-assigned; a single producing
--       member advances the shared watermark for the parked ones, so it takes
--       all of them. That third one is the `assigned_at` half, below.
-- The engine's fix is the honest floor — a worker's payable window opens at its
-- OWN `hired_at`, never at a shared watermark that predates it — and that floor
-- needs this key.
--
-- ── WHAT THIS FILE IS NOT ───────────────────────────────────────────────────
-- It does not repair the ore already minted (that is the Coordinator's call
-- with a ledger-driven claw-back, journalled, or a write-off), and it does not
-- close the SECOND half of the class: a worker hired long ago, left IDLE, then
-- ASSIGNED, is still paid from the shared watermark for time it spent idle,
-- because the table records no `assigned_at`. That is a separate lane-C item
-- (add `assigned_at`, stamp it in hr_worker_assign, floor on it too) and it is
-- a much smaller faucet — it needs a worker already owned and deliberately
-- parked. Named here so it cannot be mistaken for fixed.
--
-- RESTATEMENT-DEBT-ACK: hr_state_of is nine anchored patches deep since
-- 2026-08-26-marks-record.sql and this file makes it ten, which the patch-chain
-- guard is right to refuse. The debt is taken knowingly and it is not a
-- preference: a restatement must equal the LIVE body plus one key, an agent
-- cannot read the live body (apply-migration and the live-hash baseline are
-- Coordinator-only), and a restatement authored from the repo replay is exactly
-- the b484-b487 class where the restated body silently reverts whichever file
-- patched last — on the one function every screen reads. This file is a P0
-- economy fix on the critical path and adds a single key; trading a one-key
-- splice for a blind 150-line restatement of that body is the worse risk.
-- THE PAYDOWN, owned by the Coordinator and scheduled with this apply: restate
-- hr_state_of ONCE from pg_get_functiondef of the LIVE body (the only correct
-- source), re-pin live-hash-drift, and the chain resets to zero for everyone.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Additive to one projected object. To revert, re-apply the current last-toucher
-- of hr_state_of (2026-09-10-dungeon-scrip.sql's patch chain) — but do NOT do so
-- while the engine that fails closed on a missing hired_at is deployed.
--
-- ⚠ AFTER APPLYING: hr_state_of is a LIVE-HASH-TRACKED body
--   (tests/live-hash-drift.baseline.json). This file patches it PROGRAMMATICALLY,
--   so the Coordinator must re-seed with
--   `node tests/live-hash-drift.mjs --live --write` after the apply. It carries
--   no literal `create or replace function public.hr_state_of(` header and takes
--   over no last-toucher role.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_workers') is null then
    raise exception 'player_workers missing — apply 2026-08-25-workers.sql first'; end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_state_of is missing — apply the player-state chain first'; end if;
  -- The column this file projects must actually exist, and be NOT NULL: the
  -- engine treats a null/absent hire time as "pays nothing".
  if (select count(*) from information_schema.columns
       where table_schema='public' and table_name='player_workers'
         and column_name='hired_at' and is_nullable='NO') <> 1 then
    raise exception 'player_workers.hired_at is missing or nullable — the engine floor would '
                    'silently stop every crew';
  end if;
end $$;

-- ── 1. hr_state_of — PROJECT hired_at (programmatic, additive) ─────────────
-- pg_get_functiondef + a guarded exactly-once anchor replace (the
-- 2026-09-10-dungeon-scrip.sql idiom), so this file never restates a body it did
-- not author and cannot delete another file's projection.
do $$
declare
  v_def text;
  c_anchor constant text := $anc$'xp', xp, 'acc_ms', acc_ms)$anc$;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'hired_at', hired_at$q$) > 0 then
    raise notice 'hr_state_of already projects hired_at — patch skipped'; return; end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_state_of workers anchor did not match exactly once — its shape '
                    'is not the one this file was derived against. Do NOT patch a body you '
                    'cannot account for.';
  end if;
  v_def := replace(v_def, c_anchor,
    $new$'xp', xp, 'acc_ms', acc_ms,
                                          -- worker hire floor (2026-09-09 P0): the engine pays a
                                          -- worker only for time it has EXISTED. The shared
                                          -- workers_accrued_to watermark is stale by construction
                                          -- for a character who never had a crew, so without this
                                          -- the first hire collects a 24h backlog.
                                          'hired_at', hired_at)$new$);
  execute v_def;
  raise notice 'hr_state_of patched: the workers projection carries hired_at';
end $$;
-- create-or-replace preserves an ACL; be explicit anyway. No client executes it.
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 1b. player_workers — REVOKE THE DEAD CLIENT WRITE GRANT (C1) ───────────
-- 2026-08-16-client-write-grant-sweep-3.sql measured production's schema
-- DEFAULT ACL as `grant all on tables to anon, authenticated`
-- (pg_default_acl {anon=arwdm, authenticated=arwdm}), so every table created
-- after it — player_workers is 2026-08-25 — is BORN holding INSERT/UPDATE/
-- DELETE/TRUNCATE/REFERENCES/TRIGGER (and MAINTAIN on PG17+) for both browser
-- roles, and no migration in this repo has revoked them. RLS with no write
-- policy is what actually stops the write today, and it does; the grant is
-- dead weight. This file reads `hired_at` into an economy floor, so it takes
-- the grant away rather than relying on one layer. Sweep-3's idiom, table-
-- local: ENUMERATED (never `revoke all` — SELECT must survive, the client
-- reads its own crew) and MAINTAIN version-guarded, because an unguarded
-- `revoke maintain` is a SYNTAX error on PG16 and would fail this apply for a
-- privilege that server cannot name.
-- Idempotent by nature: a revoke of a privilege already absent is a no-op, so
-- this replays byte-identically on the drift harness and on production.
do $$
declare
  v_priv constant text := 'insert, update, delete, truncate, references, trigger'
    || case when current_setting('server_version_num')::int >= 170000
            then ', maintain' else '' end;
begin
  execute format('revoke %s on public.player_workers from public, anon, authenticated', v_priv);
  raise notice 'player_workers: client write grants revoked (%), select preserved', v_priv;
end $$;

-- ── 2. SELF-VERIFYING COMMIT GATE (§4) ─────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them. Apply is atomic, so a
-- raise reverts §1. The row-writing probe lives in a subtransaction discarded by
-- a sentinel raise (HR820), so this block is net-zero on production.
do $$
declare
  v_st    jsonb;
  v_def   text;
  v_bad   text;
  v_w     jsonb;
  v_uid   constant uuid := '000000d6-0000-0000-0000-0000000000d6';
  v_slot  constant int := 0;
  v_hired constant timestamptz := timestamptz '2026-09-09 03:00:33+00';
begin
  -- (a) THE PROJECTION IS IN THE BODY, and the anchor it spliced into survived.
  select prosrc into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_state_of';
  if position('''hired_at'', hired_at' in v_def) = 0 then
    raise exception 'GATE(a): hr_state_of does not project hired_at'; end if;
  if position('''acc_ms'', acc_ms' in v_def) = 0 then
    raise exception 'GATE(a): the splice DROPPED the acc_ms projection — the per-worker carry '
                    'would read as 0 on every settle and a slow worker would lose its remainder';
  end if;
  if position('''uid'', uid' in v_def) = 0 or position('''target_id'', target_id' in v_def) = 0 then
    raise exception 'GATE(a): the splice damaged the workers projection'; end if;

  -- (b) NO CLIENT WRITE on player_workers — the crew is RPC-written only, so a
  --     forged hire date cannot buy a backlog. anon and authenticated are the
  --     roles a browser can hold; service_role is a backend key that never
  --     reaches a client and is deliberately not asserted here (it holds the
  --     Supabase default write grant on every table in this schema).
  --
  --     ASSERTED ON THE REAL INVARIANT (C1, 2026-09-08 security review). The
  --     first draft of this gate raised on any non-SELECT entry in
  --     role_table_grants, which on PRODUCTION is expected to be non-empty for
  --     a reason that protects nothing and blocks nothing: the schema default
  --     ACL grants all to anon/authenticated at CREATE TABLE time (sweep-3).
  --     A dead grant is not a write path — RLS is — so the apply must not fail
  --     closed on it. §1b now revokes those grants, and this gate asserts the
  --     property that actually holds the line, in this order:
  --       (b1) RLS is ENABLED on the table, and
  --       (b2) there is NO policy other than SELECT reachable by anon /
  --            authenticated / public,
  --     which together mean a browser role cannot insert, update or delete a
  --     row no matter what the table-level ACL says. (b3) then re-checks the
  --     ACL as a POST-CONDITION OF §1b — by now it is true by construction, so
  --     a raise here means §1b did not run or something re-granted after it.
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'player_workers'
                    and c.relrowsecurity) then
    raise exception 'GATE(b1): RLS is OFF on player_workers — hired_at would be player-authored, '
                    'and the floor this file feeds would be forgeable';
  end if;

  select string_agg(polname || ':' || polcmd::text, ', ')
    into v_bad
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'player_workers'
     -- polcmd: 'r' select, 'a' insert, 'w' update, 'd' delete, '*' all
     and p.polcmd <> 'r'
     -- polroles = '{}' is PUBLIC (every role, including anon/authenticated)
     and (p.polroles = '{0}'::oid[]
          or p.polroles && (select coalesce(array_agg(oid), '{}'::oid[]) from pg_roles
                             where rolname in ('anon', 'authenticated', 'public')));
  if v_bad is not null then
    raise exception 'GATE(b2): a NON-SELECT RLS policy on player_workers is reachable by a browser '
                    'role (%) — the crew would no longer be RPC-written only and hired_at would be '
                    'player-authored', v_bad;
  end if;

  select string_agg(grantee || ':' || privilege_type, ', ')
    into v_bad
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'player_workers'
     and grantee in ('anon', 'authenticated', 'PUBLIC')
     and privilege_type <> 'SELECT';
  if v_bad is not null then
    raise exception 'GATE(b3): §1b was supposed to leave player_workers with SELECT only for the '
                    'browser roles, and did not (%). RLS still blocks the write, but this file no '
                    'longer knows what state it changed.', v_bad;
  end if;

  -- (c) EXECUTED — hr_state_of returns the hire time, verbatim, in a discarded
  --     subtransaction. A projection asserted only by string match is a marker,
  --     which is exactly what §4 forbids.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 0, 0, 1)
      on conflict (user_id, slot) do update set version = 1;
    insert into public.player_workers (user_id, slot, uid, name, skill, target_id, xp, hired_at)
      values (v_uid, v_slot, 'wgate', 'Gate', 'mining', 'copper_rock', 0, v_hired);
    v_st := public.hr_state_of(v_uid, v_slot);
    v_w  := (v_st->'workers')->0;   -- top-level, beside 'state' (not inside it)
    if v_w is null then
      raise exception 'GATE(c): hr_state_of returned no crew for a character that has one'; end if;
    if (v_w->>'hired_at')::timestamptz <> v_hired then
      raise exception 'GATE(c): projected hired_at = % (expected %)', v_w->>'hired_at', v_hired;
    end if;
    if (v_w->>'uid') <> 'wgate' or (v_w->>'target_id') <> 'copper_rock'
       or (v_w->>'acc_ms') is null then
      raise exception 'GATE(c): the rest of the worker row did not survive the splice: %', v_w;
    end if;
    raise exception using errcode = 'HR820', message = 'worker-hired-at §2 complete — rolling back';
  exception when sqlstate 'HR820' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_workers where user_id = v_uid)
     or exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §2 LEAKED a probe row'; end if;

  raise notice 'worker-hired-at: hr_state_of projects player_workers.hired_at, acc_ms and the '
               'rest of the crew row intact, no client write on player_workers — all green';
end $$;
