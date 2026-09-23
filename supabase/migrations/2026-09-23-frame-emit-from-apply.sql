-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-23-frame-emit-from-apply.sql
-- STAGED, NOT APPLIED. Security reviewed this file 2026-09-23 and ruled
-- MIGRATION apply GO-WITH-CHANGES (SEC_PUSH_CHANNEL_M5_2026-09-23.md, section
-- "Security review — frame-emit-from-apply"). F1 blocked the apply and is
-- landed (f10a); F2/F3 blocked the FLIP and are landed in §6; F4–F8 were LOW,
-- "ride this file's next touch", and this is that touch — f7b/f7c/f7d (F4),
-- f11d (F5), the four-entry live-hash note (F6), §0's lock_timeout (F7) and
-- f1f/f1g (F8). The Coordinator applies (CLAUDE.md §2, lane C); agents never
-- do.
--
-- THE FRAME IS EMITTED FROM THE ENVELOPE hr_apply ALREADY COMPUTED.
-- One projection per accepted write. No trigger-side hr_state_of.
--
-- ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
-- 2026-09-22-frame-push-channel.sql APPLIED 2026-09-23 08:01 UTC with
-- `frame_push = false`. Its emitter is an AFTER UPDATE trigger on player_state
-- that calls public.hr_state_of A SECOND TIME, inside hr_apply's per-character
-- row lock. The Coordinator measured that, flipped, at
--
--     TOTAL p95 10.078 / 9.918 / 10.153 ms   (three quiet-hour samples)
--     hr_state_of alone p95 9.4 – 9.7 ms     (= ~94% of the added work)
--
-- against a ≤ 10 ms line. SEC_PUSH_CHANNEL_M5_2026-09-23.md §2.2 ruled
-- CONDITION 8b NOT MET — it gates `update hr_tick_config set frame_push = true`
-- and nothing else — and accepted exactly ONE design change to clear it: emit
-- the frame from the envelope hr_apply has already built, so the second
-- projection disappears and what is left inside the lock is a one-row config
-- read, a key fold and one realtime.send.
--
-- ⚠ THE FLIP IS STILL NOT CLEARED BY THIS FILE. 8b also needs the re-measured
--   numbers (§6 below is the block that takes them, at BOTH hours), and
--   Reliability's W1–W3 gate the same flip. THIS FILE FLIPS NOTHING:
--   `frame_push` is not written anywhere outside the rolled-back self-check.
--
-- ── WHAT MOVES, AND WHAT DELIBERATELY DOES NOT ─────────────────────────────
--   ·  NEW  public.hr_frame_payload(jsonb, text[])  — PURE. The whole message,
--          `{t:'delta', frame:<env.version>, patch:<whole top-level keys>}`,
--          built from an envelope that is handed to it. The frame_keys fold is
--          byte-for-byte the loop the trigger ran; the topic is unchanged; the
--          WORLD_TICK_DESIGN.md §7.2 "whole keys, never paths" rule is unchanged. Being pure is what
--          lets the self-check EXECUTE the payload-identity property (§7 f1)
--          instead of arguing it from both callers naming hr_state_of.
--   ·  NEW  public.hr_frame_send(uuid, int, jsonb)  — the emitter. Reads the
--          kill switch, folds, sends, and SWALLOWS. Takes the envelope as an
--          ARGUMENT: it has no projection to make and no row to re-read.
--   · PATCHED  public.hr_apply — ONE anchored insertion, immediately before its
--          final `return v_out;`, i.e. AFTER the value is written, after the
--          idempotency decision is recorded and after the rejection is filed.
--   · REMOVED  the trigger hr_frame_push and the trigger function
--          hr_frame_emit(). Not disarmed — REMOVED, because a disarmed emitter
--          that still holds a projection is one flag away from paying the
--          9.4 ms again, and two armed emitters on one event is a double frame.
--   · UNCHANGED  hr_frame_topic, hr_tick_config.frame_push / .frame_keys, the
--          receive-only RLS policy on realtime.messages, the publication, every
--          grant. This file adds NO grant to any role a request can arrive as.
--
-- ── WHY THE CALL SITE IS IN hr_apply AND NOT IN ITS CALLERS ────────────────
-- The trigger's best argument was that it CATCHES BOTH PRODUCERS (the edge's
-- intents and the world tick), because both reach player_state.version through
-- hr_apply. That argument survives intact — hr_apply is the narrower waist, not
-- the wider one. Emitting from hr_tick_settle and from the edge instead would
-- be two call sites, two chances to miss a producer and two chances to emit
-- twice for one write. There is one write path, so there is one emit site.
--
-- ── THE TRIGGER'S `WHEN` CLAUSE, PRESERVED EXACTLY ─────────────────────────
-- `when (new.version is distinct from old.version)` is what made "a frame" and
-- "an accepted write" the same event. At the call site that spells as
--
--     coalesce(v_out->>'ok','false') = 'true'
--     and (v_out->>'version')::bigint is distinct from p_version
--
-- and it is EXACT, not an approximation: hr_apply's step (4) refuses with
-- `version_conflict` whenever `p_version is null or p_version <> v_st.version`,
-- so on every path that reaches the call site p_version IS the row's pre-write
-- version. A housekeeping write that moves no version emits no frame, a refusal
-- emits no frame, and a REPLAY emits no frame — a replayed intent returns from
-- step (3) and never reaches the call site at all.
--
-- ── THE ONE PROPERTY THAT IS STILL NON-NEGOTIABLE ──────────────────────────
-- A PUSH FAILURE MAY NEVER FAIL A PAYMENT. It is now defended TWICE, because
-- the emit moved from an AFTER trigger (which could only ever have rolled back
-- the statement) into the function body itself: hr_frame_send wraps its own
-- body in `exception when others then raise warning`, AND hr_apply's call site
-- wraps the call in a second one. Either alone would do; neither is trusted
-- alone. §7 f3 EXECUTES it — a deliberately throwing emitter, and the gold and
-- the version must still be committed.
--
-- ── RESTATEMENT DEBT ───────────────────────────────────────────────────────
-- RESTATEMENT-DEBT-ACK: adds 1 anchored patch to hr_apply (chain depth 5 since the 2026-09-14 restatement). Same trade the three files above it in this set state in full: the spliced text is 14 lines, the anchor is asserted to match EXACTLY ONCE and RAISES otherwise so it cannot no-op in silence, and a body that already carries the call is recognised so a re-apply is byte-identical. A restatement was considered and is the WRONG trade HERE specifically: this is a latency fix with a measured number behind it, and copying 2,400 lines of the money function into it would put an unreviewed rewrite of every payment path behind a performance change - the diff no reviewer can read. The joint hr_apply/hr_state_of restatement that 2026-09-22-hunt-stance-stop.sql already names as owed is now overdue on BOTH bodies and is carried into this lane's report as debt for the Coordinator to schedule before the next patch on either.
--
-- ⚠ AFTER APPLYING, `node tests/live-hash-drift.mjs` IS RED WITH **FOUR**
--   PROBLEMS, NOT ONE (Security 2026-09-23, F6). Measured on this branch,
--   credential-free, exit 1:
--
--     RED  untracked      hr_frame_send        §2 — new, and the sweep tracks it
--     RED  untracked      hr_frame_payload     §1 — new, and the sweep tracks it
--     RED  replay         hr_apply(p_user uuid, p_slot integer, p_version bigint,
--                                  p_intent_id uuid, p_delta jsonb)
--                         repo a416d576… (142871 ch.) vs baseline d4fa5a6b… (141609)
--     RED  replay-missing hr_frame_emit()      §4 — dropped here, production has it
--
--   All four are this file and all four are deliberate. The Coordinator
--   re-seeds tests/live-hash-drift.baseline.json with `--live --write` and
--   writes FOUR whys from `--codediff` (CLAUDE.md §2 — agents never touch that
--   file); `touched_by` for hr_apply also gains this filename. A note that
--   named ONE entry against a guard that wants four is how a re-seed ends up
--   with three unexplained rows.
--   Also: re-pin restore-census (no new table, so it should be a no-op) and
--   flip this file's apply-order note to APPLIED.
--
-- ── REVERSIBLE ─────────────────────────────────────────────────────────────
--   `update public.hr_tick_config set frame_push = false;` stops every frame
--   dead, with no deploy, exactly as before. A full undo is: re-apply
--   2026-09-22-frame-push-channel.sql (it recreates hr_frame_emit and the
--   trigger) and re-apply 2026-09-14-hr-apply-restatement.sql (it restates
--   hr_apply whole, dropping this file's insertion). Re-applying THIS file is
--   a no-op — §5 recognises a body it has already patched and stands down.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PREFLIGHT — fail closed if what this builds on is absent ─────────────
-- ⚠ THE FIRST STATEMENT IS A lock_timeout, AND DELIBERATELY NOT A
--   statement_timeout (Security 2026-09-23, F7). §4's `drop trigger` takes
--   ACCESS EXCLUSIVE on public.player_state, and because tools/apply-migration.mjs
--   POSTs this file as ONE implicit transaction it is HELD TO COMMIT — across
--   §5 and the whole of §7 (measured 114.2 ms in PGlite with f10b skipped;
--   production is strictly more, because f10b runs there and hr_apply is the
--   real 142 KB body). Every player READ and WRITE of player_state queues
--   behind it, hr_state_of included, and worse than the stall is the queue:
--   while `drop trigger` waits on an in-flight writer, every new query on that
--   table waits on the waiting `drop trigger`.
--
--   Three seconds converts a game-wide freeze into a clean, atomic failure.
--   WHAT THE OPERATOR DOES ON A LOCK TIMEOUT: nothing landed — the file is one
--   transaction, so a 55P03 (`lock_timeout`) means the DDL could not TAKE its
--   lock, never that a property failed. Re-run the same command in a quieter
--   minute (not 00:00–00:10 UTC, not 22:00 UTC). If it times out repeatedly,
--   find the long-running player_state transaction first —
--   `select pid, state, query_start, left(query,120) from pg_stat_activity
--     where wait_event_type is distinct from 'Client' order by query_start;` —
--   rather than raising this number.
--
--   NOT a short statement_timeout: §7 legitimately runs for hundreds of
--   milliseconds to seconds, so a short one would abort the SELF-CHECK, which
--   is the opposite trade. `set local` is legal here — CLAUDE.md §2 forbids
--   `begin`/`commit` inside a migration, not a transaction-scoped GUC — and it
--   expires with the transaction whichever way the apply ends.
set local lock_timeout = '3s';

do $$
begin
  if to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null then
    raise exception 'run 2026-09-14-hr-apply-restatement.sql first — hr_apply is missing';
  end if;
  if to_regprocedure('public.hr_state_of(uuid,integer)') is null then
    raise exception 'hr_state_of is missing — the frame has no payload to carry';
  end if;
  if to_regprocedure('public.hr_frame_topic(uuid,integer)') is null then
    raise exception 'run 2026-09-22-frame-push-channel.sql first — hr_frame_topic is the '
                    'one spelling of the topic and this file does not restate it';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hr_tick_config'
                    and column_name = 'frame_push') then
    raise exception 'run 2026-09-22-frame-push-channel.sql first — hr_tick_config.frame_push '
                    'is the kill switch this emitter reads';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hr_tick_config'
                    and column_name = 'frame_keys') then
    raise exception 'run 2026-09-22-frame-push-channel.sql first — hr_tick_config.frame_keys '
                    'is the fold this emitter applies';
  end if;
end $$;

-- ── §1 THE PAYLOAD, PURE ────────────────────────────────────────────────────
-- Everything about a frame that does not touch the world: which keys it states,
-- what number it carries, and what it looks like on the wire. It is IMMUTABLE
-- and it reads nothing, so the self-check can run it on two envelopes and
-- compare the bytes (§7 f1) rather than reasoning that both callers name the
-- same projection — which is precisely the argument Security refused.
--
-- `frame` IS the envelope's own `version`, which hr_state_of projects straight
-- off the player_state row hr_apply just wrote, under hr_apply's lock. Never
-- incremented, never defaulted, never drawn from a sequence, never taken from a
-- request. A NULL or unparsable version yields NULL — no message at all, rather
-- than a frame the database did not stamp.
create or replace function public.hr_frame_payload(p_env jsonb, p_keys text[])
returns jsonb language plpgsql immutable set search_path = public as $fn$
declare
  v_patch jsonb := '{}'::jsonb;
  v_key   text;
  v_frame bigint;
begin
  if p_env is null or coalesce(p_env->>'ok', 'false') <> 'true' then return null; end if;
  begin
    v_frame := (p_env->>'version')::bigint;
  exception when others then
    return null;
  end;
  if v_frame is null then return null; end if;
  -- WHOLE TOP-LEVEL KEYS, NEVER PATHS (WORLD_TICK_DESIGN.md §7.2). Byte-for-byte the fold
  -- hr_frame_emit ran; a path-addressed patch makes a missed frame
  -- undetectable, and a key-level replace is what lets the client drop one.
  foreach v_key in array coalesce(p_keys, array[]::text[]) loop
    if p_env ? v_key then v_patch := v_patch || jsonb_build_object(v_key, p_env->v_key); end if;
  end loop;
  return jsonb_build_object('t', 'delta', 'frame', v_frame, 'patch', v_patch);
end $fn$;

-- ── §2 THE EMITTER ──────────────────────────────────────────────────────────
-- It is handed the envelope. It has no projection to make, no row to re-read
-- and no lock to lengthen beyond the one-row config read it needs for the kill
-- switch. That is the whole of condition 8b's design change.
create or replace function public.hr_frame_send(p_user uuid, p_slot int, p_env jsonb)
returns void language plpgsql volatile security definer set search_path = public as $fn$
declare
  v_cfg public.hr_tick_config%rowtype;
  v_msg jsonb;
begin
  /* ⚠ THE WHOLE BODY IS INSIDE ONE exception BLOCK, AND THAT IS THE POINT.
     hr_apply has already computed, clamped and journalled the value by the time
     this is called; the frame is a COPY of a fact the database already holds.
     Realtime absent, a payload over the broadcast limit, a permission change, a
     partition that is not there — each degrades to "no frame", which WORLD_TICK_DESIGN.md §7.2's
     key-level replace heals on the next frame and which the 90 s poll heals
     regardless. It may never degrade to a rolled-back payment. */
  begin
    -- FAIL CLOSED. A missing row, an unreadable table or a NULL reads as "off".
    select * into v_cfg from public.hr_tick_config where id limit 1;
    if not found or not coalesce(v_cfg.frame_push, false) then return; end if;

    -- NO REALTIME, NO FRAME. Absent in the repo's PGlite replay and possibly on
    -- a restored database; neither is an error here.
    if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then return; end if;

    v_msg := public.hr_frame_payload(p_env, v_cfg.frame_keys);
    if v_msg is null then return; end if;

    perform realtime.send(v_msg, 'frame', public.hr_frame_topic(p_user, p_slot), true);
  exception when others then
    raise warning 'hr_frame_send: frame % for %/% not sent (%) — the write is committed anyway',
      p_env->>'version', p_user, p_slot, sqlerrm;
  end;
end $fn$;

-- ── §3 GRANTS — revoke from PUBLIC first (CLAUDE.md §2) ─────────────────────
-- PostgreSQL grants EXECUTE to PUBLIC by default on a new function, and a
-- SECURITY DEFINER function left public is the exploit rather than the
-- oversight. hr_apply calls hr_frame_send from inside its own definer context,
-- i.e. as the OWNER, which needs no grant: revoking from every role a request
-- can arrive as leaves the call site working and installs no door.
revoke execute on function public.hr_frame_send(uuid, int, jsonb) from public;
revoke execute on function public.hr_frame_send(uuid, int, jsonb)
  from anon, authenticated, service_role;
revoke execute on function public.hr_frame_payload(jsonb, text[]) from public;
revoke execute on function public.hr_frame_payload(jsonb, text[])
  from anon, authenticated, service_role;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    execute 'revoke execute on function public.hr_frame_send(uuid, int, jsonb) from hr_engine';
    execute 'revoke execute on function public.hr_frame_payload(jsonb, text[]) from hr_engine';
  end if;
  if exists (select 1 from pg_roles where rolname = 'hr_tick') then
    execute 'revoke execute on function public.hr_frame_send(uuid, int, jsonb) from hr_tick';
    execute 'revoke execute on function public.hr_frame_payload(jsonb, text[]) from hr_tick';
  end if;
end $$;

-- ── §4 THE TRIGGER PATH IS REMOVED, NOT DISARMED ────────────────────────────
-- Order matters: the trigger first, then the function it names. Dropping the
-- function is deliberate and is the anti-double-emit property — a disarmed
-- trigger function that still holds an hr_state_of call is one `create trigger`
-- away from charging the lock 9.4 ms again and from delivering two frames for
-- one write, and neither is visible from the call site. §7 f0 asserts both are
-- gone by reading the catalog, and §7 f7 counts the sends.
drop trigger if exists hr_frame_push on public.player_state;
drop function if exists public.hr_frame_emit();

-- ── §5 THE CALL SITE — ONE ANCHORED INSERTION INTO hr_apply ─────────────────
-- Anchored on the rejection-record block that closes the function, which is the
-- LAST thing hr_apply does before `return v_out;`. The anchor is asserted to
-- match EXACTLY ONCE and the patch raises rather than patching blind. A body
-- that already carries the call is recognised and left alone, so a second apply
-- is byte-identical (tests/schema-drift.mjs replays the chain twice).
do $$
declare
  c_anchor constant text := $a$  if coalesce(v_out->>'ok', 'false') <> 'true' then
    perform public.hr_record_rejection(
      v_uid, v_slot, coalesce(p_delta #>> '{journal,intent}', 'apply'),
      v_out->>'error', v_out - 'ok' - 'error');
  end if;
$a$;
  c_add    constant text := $a$
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
$a$;
  v_def  text;
  v_hits int;
begin
  v_def := replace(pg_get_functiondef(
    'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');

  if position('public.hr_frame_send(' in v_def) > 0 then
    raise notice 'frame-emit-from-apply: hr_apply already carries the frame call — §5 is a no-op';
    return;
  end if;

  v_hits := (length(v_def) - length(replace(v_def, c_anchor, ''))) / length(c_anchor);
  if v_hits <> 1 then
    raise exception '§5: the hr_apply anchor matched % time(s), not once. A patch that no-ops '
                    'in silence is how a body comes to differ from the file that claims to '
                    'describe it — re-cut the anchor against the installed text '
                    '(pg_get_functiondef) before re-running.', v_hits;
  end if;

  v_def := replace(v_def, c_anchor, c_anchor || c_add);
  execute v_def;

  v_def := replace(pg_get_functiondef(
    'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if position('public.hr_frame_send(' in v_def) = 0 then
    raise exception '§5: the patch executed but the installed body does not carry the call';
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- §6 OPERATOR SECTION — THE MEASUREMENT THE COORDINATOR RUNS AFTER THE APPLY
--
-- ⚠ NOT RUN BY THIS FILE. It is a procedure, written here because the number it
--   produces is the only thing standing between this design change and
--   CONDITION 8b, and a procedure that lives in a review document is a
--   procedure nobody re-runs. NOTHING BELOW IS EXECUTED BY THE APPLY.
--
-- WHAT IT MUST SHOW (SEC_PUSH_CHANNEL_M5_2026-09-23.md §2.2, proof 5):
--   · THREE samples at a quiet hour AND THREE at the measured peak, 22:00 UTC.
--     One sample is not a verdict and the quiet hour already straddled the line.
--   · ALL THREE PEAK samples must read TOTAL p95 ≤ 10 ms. Expected ≪ 1 ms:
--     what is left inside the lock is one single-row config read, the
--     frame_keys fold and one realtime.send.
--   · AND `TOTAL` IS `WRAPPER p95 + ARMED-LOOP p95` — NOT THE ARMED LOOP ALONE
--     (Security 2026-09-23, F2). The armed loop times the payload and the send.
--     The SHIPPED seam is
--     `begin perform public.hr_frame_send(…); exception … end`, and
--     hr_frame_send opens a second `begin … exception` of its own, so four
--     costs sit between the two and inside the row lock on EVERY accepted
--     write: the call site's subtransaction, the emitter's own subtransaction,
--     the SECURITY DEFINER call (role switch + plan cache) and
--     to_regprocedure('realtime.send(jsonb,text,text,boolean)') — plus a whole
--     hr_tick_config%rowtype read where the armed loop reads one column. Loop
--     (2a) below times exactly those. Each is expected to be small; NONE of
--     them is asserted to be, because a number nobody has seen is not a number.
--     The config read is counted in BOTH loops, so TOTAL over-states the seam —
--     deliberately, and in the safe direction.
--   · hr_state_of's own p95 is reported SEPARATELY as the CONTROL — the charge
--     this change removes. It is no longer part of TOTAL, and the pair of
--     numbers is what proves it left rather than moved.
--   · p99 ≤ 25 ms, max ≤ 250 ms, added load = p95 × writes_per_sec ÷ 1000
--     ≤ 0.05, payload_max_bytes ≤ 64 KB — unchanged from §4.1.
--   · THEN restate LIVE_COUNTERS_PUSH.md §3.6 and WORLD_TICK_DESIGN.md from the
--     measurement (proof 6). §3.6 still charges an UNMEASURED 3.23 ms for the
--     thing that measured 9.4–9.7 ms.
--
-- Find the peak first — it is also the writes_per_sec the load line needs.
--
-- ⚠ A 7-DAY PEAK DOES NOT COME FROM player_intents (Security 2026-09-23, F3).
--   That table holds 24 HOURS: hr_intents_prune(interval)
--   (2026-08-11-player-state.sql) deletes `where at < now() - greatest(interval
--   '1 hour', coalesce(p_older, interval '24 hours'))`. A 7-day window on it
--   returns a ONE-DAY peak wearing a seven-day label, and proof 5's "three
--   samples at the measured peak" is only ever as good as the peak.
--
--   SO THE 7-DAY PEAK COMES FROM player_ledger, which is append-only and
--   retains. Every accepted write that MOVED A VALUE journals a row there, and
--   that is the write class this seam's cost is paid on:
--
--   select date_trunc('hour', at) as hour,
--          count(*)                as value_moving_writes,
--          round(count(*)/3600.0, 3) as writes_per_sec
--     from public.player_ledger
--    where at > now() - interval '7 days'
--    group by 1 order by 2 desc limit 5;
--
--   Then cross-check the LAST 24 HOURS — and only those — against the journal
--   of accepted intents, which counts accepted writes exactly (a write that
--   moved no value is journalled there and not in the ledger, so it is the
--   upper bound and the ledger is the lower one):
--
--   select date_trunc('hour', at) as hour, count(*) as accepted_writes
--     from public.player_intents
--    where at > now() - interval '24 hours'
--    group by 1 order by 2 desc limit 5;
--
--   The Coordinator's `node tools/vitals.mjs` reports the same series per DAY
--   for the last 7 days (and `--refusals` the hr_rejections aggregate) and is
--   the third reading if the two above disagree. Today all of them land on
--   22:00 UTC, which is the hour already measured — the practical damage of
--   the old query was nil and the standing damage was that whoever re-ran it
--   next month would not have known.
--
-- Then, IN THAT HOUR, one psql session. It ends in ROLLBACK: no player state is
-- written (CLAUDE.md §2) and the realtime.messages rows realtime.send inserts
-- disappear with it. Substitute the QA account, never a live player picked at
-- random. Do NOT run it under a statement_timeout short enough to be tripped by
-- the hr_tick_config row lock the live tick driver also takes.
--
--   begin;
--   set local hr8.user = '<QA-ACCOUNT-UUID>';
--   set local hr8.slot = '0';
--
--   -- (1) the lock hr_apply holds while the emit happens.
--   select version from public.player_state
--    where user_id = current_setting('hr8.user')::uuid
--      and slot    = current_setting('hr8.slot')::int
--    for update;
--
--   -- (2) the ARMED LOOP: the payload and the send, inside that lock, 100
--   --     samples. NOT the whole seam on its own — see (2a). The
--   --     envelope is projected ONCE outside the timed section because that
--   --     is exactly what the change buys: hr_apply had already paid for it.
--   do $m$
--   declare
--     v_u   uuid := current_setting('hr8.user')::uuid;
--     v_s   int  := current_setting('hr8.slot')::int;
--     v_env jsonb; v_keys text[]; v_msg jsonb;
--     t0 timestamptz; i int;
--     all_ms numeric[] := '{}'; env_ms numeric[] := '{}';
--     wrap_ms numeric[] := '{}'; bytes int := 0;
--   begin
--     v_env := public.hr_state_of(v_u, v_s);          -- pre-existing, NOT added
--     for i in 1..100 loop
--       t0 := clock_timestamp();
--       select frame_keys into v_keys from public.hr_tick_config where id limit 1;
--       v_msg := public.hr_frame_payload(v_env, v_keys);
--       perform realtime.send(v_msg, 'frame', public.hr_frame_topic(v_u, v_s), true);
--       all_ms := all_ms || round(extract(epoch from clock_timestamp() - t0) * 1000, 3);
--       bytes  := greatest(bytes, octet_length((v_msg->'patch')::text));
--     end loop;
--     -- (2a) ★ THE WRAPPER — THE SEAM THAT ACTUALLY SHIPS ★ (Security F2).
--     --      The loop above times `payload + send`; hr_apply calls
--     --      `begin perform public.hr_frame_send(v_uid, v_slot, v_out);
--     --       exception … end`, and hr_frame_send opens a second
--     --      `begin … exception` inside that. This times the two
--     --      subtransactions, the SECURITY DEFINER call and the whole-row
--     --      hr_tick_config read — everything the emitter pays on every
--     --      accepted write WHETHER OR NOT the channel is armed.
--     --
--     --      RUN AS SHIPPED, i.e. with frame_push FALSE: the emitter returns
--     --      at the kill switch and takes NO row lock on the hr_tick_config
--     --      singleton. ⚠ DO NOT FLIP frame_push INSIDE THIS TRANSACTION to
--     --      get the armed path through the wrapper. That row-locks the
--     --      singleton the live tick driver also writes, for the length of the
--     --      run, at peak — and this block ends in ROLLBACK, so the flip would
--     --      be held and then discarded with every tick queued behind it.
--     for i in 1..100 loop
--       t0 := clock_timestamp();
--       begin perform public.hr_frame_send(v_u, v_s, v_env); exception when others then null; end;
--       wrap_ms := wrap_ms || round(extract(epoch from clock_timestamp() - t0) * 1000, 3);
--     end loop;
--     -- THE CONTROL: the charge this file removes from the lock, timed the same
--     -- way and reported separately. It must NOT appear in TOTAL above.
--     for i in 1..100 loop
--       t0 := clock_timestamp();
--       perform public.hr_state_of(v_u, v_s);
--       env_ms := env_ms || round(extract(epoch from clock_timestamp() - t0) * 1000, 3);
--     end loop;
--     raise warning 'condition8b n=% | ARMED p50=% p95=% p99=% max=% | WRAPPER p95=% | TOTAL p95 (=WRAPPER+ARMED)=% | hr_state_of(REMOVED) p95=% | payload_max_bytes=%',
--       array_length(all_ms, 1),
--       (select percentile_disc(0.50) within group (order by x) from unnest(all_ms) x),
--       (select percentile_disc(0.95) within group (order by x) from unnest(all_ms) x),
--       (select percentile_disc(0.99) within group (order by x) from unnest(all_ms) x),
--       (select max(x) from unnest(all_ms) x),
--       (select percentile_disc(0.95) within group (order by x) from unnest(wrap_ms) x),
--       (select percentile_disc(0.95) within group (order by x) from unnest(wrap_ms) x)
--       + (select percentile_disc(0.95) within group (order by x) from unnest(all_ms) x),
--       (select percentile_disc(0.95) within group (order by x) from unnest(env_ms) x),
--       bytes;
--     -- ⚠ 8b IS GRADED ON THE `TOTAL p95` COLUMN — the sum. The ARMED figure
--     --   alone is not the seam, and p99/max are reported on the armed loop
--     --   because that is where the send's tail lives.
--   end $m$;
--   rollback;
--
-- Two honest limits, unchanged from §4.1: it measures ONE session, so it bounds
-- per-write latency and CPU and says nothing about Realtime tenant behaviour at
-- concurrency; and realtime.send inside a rolled-back transaction exercises the
-- insert but not the delivery path.
--
-- AND THE FLIP IS STILL NOT THIS FILE'S TO TAKE. Even with all six numbers in
-- hand, `update public.hr_tick_config set frame_push = true` waits on
-- Reliability's W1 (a partition old enough to have been dropped, after
-- 2026-09-27), W2 (the 14 GB/day-at-scale figure signed against
-- max_slot_wal_keep_size = 512 MB, with a lag budget and a named detector for a
-- silently-stopped slot) and W3 (a worst-case slot-lag observation, not an idle
-- one).
-- ════════════════════════════════════════════════════════════════════════

-- ── §7 SELF-CHECK — EXECUTED (CLAUDE.md §4) ─────────────────────────────────
-- PROBE ROWS ONLY. Every row this block touches is one it inserted itself,
-- under a uuid gen_random_uuid() cannot mint, and every predicate binds `v_u` —
-- a variable this block declared (tests/selfcheck-no-global-dml.mjs). The whole
-- block is rolled back regardless of outcome.
--
-- SIX PROOFS ARE OWED (SEC §2.2). Mapped to the arms that execute them:
--   1 the payload is unchanged, byte-identical, on a non-empty character  → f1
--     …the key set hr_apply adds is outside the fold (Security F8)        → f1f
--     …and the same bytes on the branch where v_hf_out is NOT null        → f1g
--   2 exactly ONE projection per accepted write, COUNTED by execution     → f2
--   3 a push failure still cannot fail a payment                          → f3
--   4 the frame gate is unmoved — frame is hr_apply's post-write version  → f4
--   5 re-measure at both hours                                → §6, Coordinator
--   6 restate the documents from the measurement              → §6, Coordinator
-- and the four the brief and the review add: a shadow settle emits nothing
-- (f5), a refused intent emits nothing (f6), a REPLAYED intent emits nothing
-- and moves nothing (f7b/f7c/f7d — Security F4: it was the one gate case this
-- file argued rather than executed), and the trigger path cannot double-emit
-- (f0, f7).
--
-- ⚠ TWO PROBES REPLACE A LIVE FUNCTION FOR THE LENGTH OF THIS BLOCK, and both
--   are RESTORED EXPLICITLY before the sentinel raise rather than left to the
--   rollback — then asserted byte-identical to what they were (f11). A
--   rollback that did not take would therefore still leave the real bodies
--   installed. Both probes are additionally INERT for anyone but the probe
--   uuid: the hr_state_of stand-in DELEGATES for every other caller, and the
--   hr_frame_send stand-in returns without sending, which is the fail-safe
--   direction.
--   ⚠ AND SO ARE THE THREE hr_tick_config BOOLEANS THIS BLOCK WRITES —
--     enabled and shadow (f5) and frame_push (f10b). Captured before the first
--     write, restored and read back at f11d, for the same reason and to the
--     same standard (Security 2026-09-23, F5).
do $$
declare
  v_u      uuid := '00000000-0000-4000-8000-00000000fb3e';
  v_o      uuid := '00000000-0000-4000-8000-00000000fb51';
  v_n      int;
  v_v      bigint;
  v_g      bigint;
  v_v2     bigint;
  v_g2     bigint;
  v_txt    text;
  v_keys   text[];
  v_env    jsonb;
  v_r      jsonb;
  v_d      jsonb;
  v_rp     jsonb;      -- f7b: the envelope a REPLAYED intent answers with
  v_pa     jsonb;      -- f1: the payload built from hr_apply's own envelope
  v_pf     jsonb;      -- f1: the payload built from a fresh projection
  v_fresh  jsonb;      -- f1/f1f: that fresh projection itself, kept for f1f
  v_hf_i   text;       -- f1g: a real (item, source_kind, source_id) triple from
  v_hf_k   text;       --      the hearthfind catalogue, so the probe can DRIVE
  v_hf_s   text;       --      hr_apply's v_hf_out branch instead of skipping it
  v_sodef  text;       -- the real hr_state_of, captured and restored
  v_snddef text;       -- the real hr_frame_send, captured and restored
  v_cfg_e  boolean;    -- f11d: hr_tick_config.enabled    as this block found it
  v_cfg_s  boolean;    -- f11d: hr_tick_config.shadow     as this block found it
  v_cfg_f  boolean;    -- f11d: hr_tick_config.frame_push as this block found it
  v_chk_e  boolean;    -- f11d: …and as it reads back after the restore
  v_chk_s  boolean;
  v_chk_f  boolean;
  v_tf     timestamptz;
  v_tt     timestamptz;
begin
  begin
    -- ── f0: ★ THE TRIGGER PATH IS GONE ★. Read off the catalog, not off this
    --        file's own source. A trigger left behind would deliver a SECOND
    --        frame for every accepted write AND charge the lock the 9.4 ms this
    --        whole file exists to remove — and the call site cannot see it.
    if exists (select 1 from pg_trigger t
                join pg_class c on c.oid = t.tgrelid
                join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relname = 'player_state'
                 and t.tgname = 'hr_frame_push' and not t.tgisinternal) then
      raise exception 'f0: the trigger hr_frame_push is still on player_state — every accepted '
                      'write would emit twice and pay for two projections';
    end if;
    if to_regprocedure('public.hr_frame_emit()') is not null then
      raise exception 'f0b: hr_frame_emit() still exists. It holds an hr_state_of call inside '
                      'the lock and is one `create trigger` away from being armed again';
    end if;

    -- ── f0c: …AND THE CALL SITE IS INSTALLED. f0 above is a pair of absences,
    --         and two absences are also what a file that did nothing at all
    --         produces. This is the presence that makes them mean something.
    v_txt := replace(pg_get_functiondef(
      'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
    if position('public.hr_frame_send(' in v_txt) = 0 then
      raise exception 'f0c: hr_apply does not call hr_frame_send. The trigger is gone and '
                      'nothing replaced it, so NO frame is ever emitted';
    end if;
    if (length(v_txt) - length(replace(v_txt, 'public.hr_frame_send(', '')))
       / length('public.hr_frame_send(') <> 1 then
      raise exception 'f0d: hr_apply calls hr_frame_send more than once — one accepted write, '
                      'two frames, and the second is a duplicate the client must drop';
    end if;

    -- ── f8: THE CALL SITE SWALLOWS, AND THE HANDLER WRAPS THE CALL. In
    --        PL/pgSQL a handler belongs to the `begin` it TRAILS, so "wraps"
    --        spells as "comes after" in the source. A handler placed before the
    --        call would catch nothing it can throw and would read, to anyone
    --        skimming, exactly like one that does.
    if position('perform public.hr_frame_send(' in v_txt) = 0 then
      raise exception 'f8: hr_apply''s frame call is not the plain `perform public.hr_frame_send(` '
                      'the patch installs — re-read the body before trusting f8b';
    end if;
    -- ⚠ MEASURED FROM THE CALL FORWARD, not from the top of the body. hr_apply
    --   carries a dozen `exception when others then` handlers of its own, so
    --   "the first handler comes after the call" is false in a body where the
    --   call IS wrapped, and a first draft of this arm that compared two
    --   absolute positions would have gone red on the correct function.
    if position('exception when others then' in
                lower(substr(v_txt, position('perform public.hr_frame_send(' in v_txt)))) = 0 then
      raise exception 'f8b: hr_apply has no exception handler AFTER its hr_frame_send call, so a '
                      'transport failure the emitter could not swallow would roll back a '
                      'payment that is already journalled';
    end if;

    -- ── f8c: …AND SO DOES THE EMITTER ITSELF. Both, because either alone is a
    --         half-proof and the trigger-shaped defence (an AFTER trigger can
    --         only fail the statement) is gone.
    v_txt := replace(pg_get_functiondef(
      'public.hr_frame_send(uuid,integer,jsonb)'::regprocedure), chr(13), '');
    if v_txt !~* 'exception\s+when\s+others\s+then' or v_txt !~* 'raise\s+warning' then
      raise exception 'f8c: hr_frame_send has no `exception when others then raise warning` '
                      'handler';
    end if;
    if position('realtime.send' in v_txt) = 0 then
      raise exception 'f8d: hr_frame_send no longer calls realtime.send — it emits nothing';
    end if;
    if position('exception when others then' in
                lower(substr(v_txt, position('realtime.send' in v_txt)))) = 0 then
      raise exception 'f8e: hr_frame_send''s handler comes BEFORE the realtime.send call, so it '
                      'cannot be wrapping it — in PL/pgSQL a handler belongs to the `begin` it '
                      'TRAILS, and one placed first catches nothing the send can throw';
    end if;

    -- ── f9: THE FRAME IS NEVER SYNTHESISED. It is the envelope's own
    --        `version`, which hr_state_of projects straight off the row
    --        hr_apply wrote. A synthesised frame is a floor the client raises to
    --        a number the database never stamped, after which the REAL frame at
    --        that version is a duplicate.
    v_txt := replace(pg_get_functiondef(
      'public.hr_frame_payload(jsonb,text[])'::regprocedure), chr(13), '');
    if v_txt !~ 'p_env->>''version''' then
      raise exception 'f9: hr_frame_payload no longer takes the frame from the envelope''s own '
                      'version — a frame the database did not stamp does not exist';
    end if;
    if v_txt ~* 'nextval|v_frame\s*\+|version''\)::bigint\s*\+' then
      raise exception 'f9b: hr_frame_payload derives the frame number instead of reporting it: %',
        substring(v_txt from 1 for 400);
    end if;

    -- ── f10: FAIL CLOSED ON THE FLAG AND ON A MISSING ROW. The switch half is
    --         executed at f10b below where realtime exists; this is the row
    --         half, read from the emitter's own source rather than by deleting
    --         the singleton — which would be global DML on a table every
    --         character's tick reads.
    v_txt := replace(pg_get_functiondef(
      'public.hr_frame_send(uuid,integer,jsonb)'::regprocedure), chr(13), '');
    if v_txt !~* 'if\s+not\s+found\s+or\s+not\s+coalesce' then
      raise exception 'f10: hr_frame_send no longer fails closed on a missing or NULL config '
                      'row. A gate that treats "no answer" as "on" is the wrong direction';
    end if;

    -- ── f4c: NO ROLE A REQUEST CAN ARRIVE AS MAY EXECUTE EITHER FUNCTION.
    --         `public` included, because that is the default a new function
    --         ships with and the one an author forgets.
    foreach v_txt in array array['public','anon','authenticated','service_role'] loop
      if has_function_privilege(v_txt, 'public.hr_frame_send(uuid,integer,jsonb)', 'EXECUTE') then
        raise exception 'f4c: % can EXECUTE hr_frame_send — it would let a caller hand the push '
                        'channel an envelope of its own choosing', v_txt;
      end if;
      if has_function_privilege(v_txt, 'public.hr_frame_payload(jsonb,text[])', 'EXECUTE') then
        raise exception 'f4d: % can EXECUTE hr_frame_payload', v_txt;
      end if;
    end loop;

    -- ── THE PROBE CHARACTER, AND IT IS NOT EMPTY. Security's proof 1 asks for
    --    the comparison on a real, non-empty character rather than on a bare
    --    row: an empty projection makes two empty patches equal for the wrong
    --    reason. It gets skills and inventory of its own, and f1 asserts the
    --    patch it produces is substantial rather than trusting that it is.
    insert into auth.users (id) values (v_u) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to)
    values (v_u, 0, 1000, 5, 37, 40, 41, now() - interval '1 hour');
    insert into public.player_skills (user_id, slot, skill_id, xp) values
      (v_u, 0, 'mining', 128000), (v_u, 0, 'woodcutting', 64000),
      (v_u, 0, 'attack', 33000),  (v_u, 0, 'cooking', 9000);
    insert into public.player_inventory (user_id, slot, item_id, qty) values
      (v_u, 0, 'copper_ore', 240), (v_u, 0, 'logs', 91);

    -- ⚠ AND THE THREE BOOLEANS THIS BLOCK WILL WRITE ARE CAPTURED HERE,
    --   BEFORE THE FIRST WRITE (Security 2026-09-23, F5). f5 below sets
    --   enabled/shadow and f10b sets frame_push. The subtransaction rollback
    --   would unwind all three — but frame_push is PRECISELY the flag
    --   Security's veto is gating, and a residue would be the push channel
    --   ARMED in production with condition 8b not met. So they are restored
    --   EXPLICITLY at f11d and asserted, exactly as the two probe functions
    --   are at f11, and a rollback that did not take is harmless either way.
    select frame_keys, enabled, shadow, frame_push
      into v_keys, v_cfg_e, v_cfg_s, v_cfg_f
      from public.hr_tick_config where id limit 1;
    if v_keys is null or array_length(v_keys, 1) is null then
      raise exception 'f1a: hr_tick_config carries no frame_keys, so every patch below would be '
                      'empty and every comparison would be vacuous';
    end if;

    -- ════════════════════════════════════════════════════════════════════
    -- THE PROBES. From here to f11 two live bodies are stood in for, and both
    -- are restored explicitly at f11 before the sentinel raise.
    -- ════════════════════════════════════════════════════════════════════

    -- (i) THE PROJECTION COUNTER (Security proof 2: "counted by execution — a
    --     call counter on hr_state_of, not a grep and not a comment"). The real
    --     body is copied under a probe name and the real NAME becomes a
    --     delegating wrapper that counts only the probe's own calls. For every
    --     other caller the wrapper is a pass-through, so even a rollback that
    --     did not take could not change what any player's projection returns.
    v_sodef := pg_get_functiondef('public.hr_state_of(uuid,integer)'::regprocedure);
    execute replace(v_sodef, 'public.hr_state_of(', 'public.hr923_state_of_real(');
    if to_regprocedure('public.hr923_state_of_real(uuid,integer)') is null then
      raise exception 'f2a: the probe copy of hr_state_of was not created, so the counter below '
                      'would be installed over a body that no longer answers. The name '
                      'substitution matched nothing — re-cut it against pg_get_functiondef.';
    end if;
    execute $f$
      create or replace function public.hr_state_of(p_user uuid, p_slot integer)
      returns jsonb language plpgsql security definer set search_path = public as $b$
      begin
        if p_user = '00000000-0000-4000-8000-00000000fb3e'::uuid then
          perform set_config('hr923.projections',
            (coalesce(current_setting('hr923.projections', true), '0')::int + 1)::text, true);
        end if;
        return public.hr923_state_of_real(p_user, p_slot);
      end $b$;
    $f$;

    -- f2b: ★ THE POSITIVE CONTROL, BEFORE ANY COUNT IS BELIEVED ★. A wrapper
    --      that returned garbage would make every count below meaningless in
    --      the same direction as a wrapper that works. It must answer exactly
    --      what the real body answers, and the counter must move when it does.
    perform set_config('hr923.projections', '0', true);
    v_env := public.hr_state_of(v_u, 0);
    if coalesce(current_setting('hr923.projections', true), '0')::int <> 1 then
      raise exception 'f2b: the projection counter did not move on a direct call (% calls) — '
                      'every count below would be measuring nothing',
                      coalesce(current_setting('hr923.projections', true), '0');
    end if;
    if coalesce(v_env->>'ok', 'false') <> 'true' then
      raise exception 'f2c: the counting stand-in did not project the probe character (%) — it '
                      'is not a faithful delegate and f1 would compare two nulls', v_env;
    end if;

    -- (ii) THE EMIT CAPTURE. The real emitter is stood in for by one that
    --      counts, records the frame it was handed, and can be made to throw on
    --      demand (f3). It is INERT for anyone but the probe: a residue would
    --      stop frames, never forge one.
    v_snddef := pg_get_functiondef('public.hr_frame_send(uuid,integer,jsonb)'::regprocedure);
    execute $f$
      create or replace function public.hr_frame_send(p_user uuid, p_slot int, p_env jsonb)
      returns void language plpgsql volatile security definer set search_path = public as $b$
      begin
        if p_user <> '00000000-0000-4000-8000-00000000fb3e'::uuid then return; end if;
        perform set_config('hr923.sends',
          (coalesce(current_setting('hr923.sends', true), '0')::int + 1)::text, true);
        perform set_config('hr923.frame', coalesce(p_env->>'version', 'NULL'), true);
        if coalesce(current_setting('hr923.throw', true), '0') = '1' then
          raise exception 'HR923_DELIBERATE_PUSH_FAILURE';
        end if;
      end $b$;
    $f$;

    -- ════════════════════════════════════════════════════════════════════
    -- ONE ACCEPTED WRITE, THROUGH hr_apply'S OWN DOOR.
    --   ⚠ AS hr_engine, or hr_apply's impersonation seam
    --     (2026-09-14-hr-apply-restatement.sql) answers forbidden_impersonation:
    --     it reads `role`, which survives the definer boundary. Called as the
    --     apply's own role NOTHING is written, no frame is emitted, and every
    --     zero below would be the seam's rather than the property's — a check
    --     that passes both when it holds and when the thing it calls refused
    --     it. The role is held across the call only.
    -- ════════════════════════════════════════════════════════════════════
    select version, gold into v_v, v_g from public.player_state where user_id = v_u and slot = 0;
    v_d := jsonb_build_object('gold', 13,
             'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
               'meta', jsonb_build_object('src', 'selfcheck', 'qty', 1)));
    perform set_config('hr923.projections', '0', true);
    perform set_config('hr923.sends', '0', true);
    perform set_config('hr923.throw', '0', true);
    set local role hr_engine;
    v_r := public.hr_apply(v_u, 0, v_v, '00000000-0000-4000-8000-00000000fb01'::uuid, v_d);
    reset role;

    -- f2d: ★ THE POSITIVE CONTROL AGAIN ★. Every assertion that follows is a
    --      count or an equality, and a REFUSED apply produces the tidy version
    --      of all of them: one projection, no frame, nothing moved. The write
    --      must actually have been accepted or this block has measured a
    --      refusal and called it a property.
    if coalesce((v_r->>'ok')::boolean, false) is not true then
      raise exception 'f2d: the probe apply was refused (%) — a refusal writes nothing and emits '
                      'nothing, so every count below would pass on a write that never happened',
                      v_r;
    end if;

    -- ── f2: ★ EXACTLY ONE PROJECTION PER ACCEPTED WRITE ★. This is the
    --        property the whole file buys. Before this change the count was
    --        TWO — hr_apply's own, plus the trigger's re-read inside the row
    --        lock, at a measured 9.4–9.7 ms p95.
    if coalesce(current_setting('hr923.projections', true), '0')::int <> 1 then
      raise exception 'f2: one accepted write made % hr_state_of call(s), not 1. The second '
                      'projection is 94%% of the 10.1 ms CONDITION 8b refused, and it is paid '
                      'inside hr_apply''s per-character row lock on every write.',
                      coalesce(current_setting('hr923.projections', true), '0');
    end if;

    -- ── f7: …AND EXACTLY ONE FRAME. The anti-double-emit half of f0: a trigger
    --        left armed beside the call site is two frames for one write, and
    --        the second raises no floor and drops as a duplicate.
    if coalesce(current_setting('hr923.sends', true), '0')::int <> 1 then
      raise exception 'f7: one accepted write emitted % frame(s), not 1',
                      coalesce(current_setting('hr923.sends', true), '0');
    end if;

    -- ── f4: ★ THE FRAME IS hr_apply'S POST-WRITE VERSION ★. Three things must
    --        be the same integer: the row hr_apply wrote, the envelope it
    --        returned, and the number the emitter was handed. The frame gate in
    --        src/net/accrue.js compares exactly this against its floor.
    select version, gold into v_v2, v_g2 from public.player_state where user_id = v_u and slot = 0;
    if v_v2 <> v_v + 1 then
      raise exception 'f4a: the accepted write moved version % → %, expected one bump', v_v, v_v2;
    end if;
    if (v_r->>'version')::bigint <> v_v2 then
      raise exception 'f4b: hr_apply returned version % while the row holds % — the envelope the '
                      'client applies is not the row it was projected from',
                      v_r->>'version', v_v2;
    end if;
    if coalesce(current_setting('hr923.frame', true), 'NULL') <> v_v2::text then
      raise exception 'f4: the emitter was handed frame % for a row at version %. A frame the '
                      'database did not stamp does not exist, and a floor raised to one drops '
                      'the real frame at that version as a duplicate.',
                      coalesce(current_setting('hr923.frame', true), 'NULL'), v_v2;
    end if;

    -- ── f7b: ★ A REPLAYED INTENT EMITS NOTHING — EXECUTED, NOT ARGUED ★
    --         (Security 2026-09-23, F4). This file's header reasons it
    --         correctly — step (3) short-circuits on an intent_id it has
    --         already answered and returns `hr_state_of(…) || {replayed:true}`
    --         without ever reaching the patched return — and that is exactly
    --         the kind of reasoning proof 2 refused everywhere else. A future
    --         patch that hoisted the emit above that early return, or that let
    --         the replay branch fall through, would push a DUPLICATE frame at a
    --         version the client has already applied, and NO arm in this file
    --         would have seen it.
    --
    --         The same intent_id as the accepted write above, with the same
    --         intent name and slot — a different one answers `intent_mismatch`,
    --         which is a REFUSAL wearing a replay's clothes and would make the
    --         zero below f6's property a second time rather than this one. And
    --         the CURRENT version, so that if the short-circuit ever went away
    --         this would be an ordinary ACCEPTED write and both assertions
    --         would fire rather than passing quietly. It sits after f4 because
    --         it needs f4's post-write version to say "the row did not move".
    perform set_config('hr923.sends', '0', true);
    set local role hr_engine;
    v_rp := public.hr_apply(v_u, 0, v_v2,
              '00000000-0000-4000-8000-00000000fb01'::uuid, v_d);
    reset role;
    if coalesce((v_rp->>'ok')::boolean, false) is not true
       or coalesce((v_rp->>'replayed')::boolean, false) is not true then
      raise exception 'f7c: the second call on the same intent_id was not answered as a REPLAY '
                      '(%) — the zero below would be a property nothing measured', v_rp;
    end if;
    if coalesce(current_setting('hr923.sends', true), '0')::int <> 0 then
      raise exception 'f7b: a REPLAYED intent emitted % frame(s). The client has already '
                      'applied that version, so the duplicate raises no floor, drops — and the '
                      'REAL frame at that version drops with it.',
                      coalesce(current_setting('hr923.sends', true), '0');
    end if;
    select version, gold into v_v, v_g from public.player_state where user_id = v_u and slot = 0;
    if v_v <> v_v2 or v_g <> v_g2 then
      raise exception 'f7d: a replayed intent moved player_state (version % → %, gold % → %) — '
                      'it was not a replay at all, it was a second payment',
                      v_v2, v_v, v_g2, v_g;
    end if;

    -- ── f1: ★ THE PAYLOAD IS UNCHANGED, BYTE-IDENTICAL ★ (Security proof 1).
    --        Not argued from the fact that both sides name hr_state_of — RUN.
    --        The patch built from the envelope hr_apply returned, against the
    --        patch the trigger would have built from a fresh projection at the
    --        same version, through the same fold, compared as text.
    v_pa := public.hr_frame_payload(v_r, v_keys);
    v_fresh := public.hr_state_of(v_u, 0);
    v_pf := public.hr_frame_payload(v_fresh, v_keys);
    if v_pa is null or v_pf is null then
      raise exception 'f1b: a payload came back NULL (apply=%, fresh=%) — the comparison below '
                      'would be two nulls agreeing', v_pa is null, v_pf is null;
    end if;
    if v_pa::text <> v_pf::text then
      raise exception 'f1: the payload built from hr_apply''s envelope is NOT the payload the '
                      'trigger built from a fresh projection. apply=% fresh=%',
                      left(v_pa::text, 900), left(v_pf::text, 900);
    end if;
    -- …AND IT IS NOT AN EMPTY PROBE. Two empty patches are equal for the wrong
    -- reason, so the character is required to have projected something.
    foreach v_txt in array v_keys loop
      if not (v_pa->'patch') ? v_txt then
        raise exception 'f1c: frame key `%` is missing from the payload — the emitter would send '
                        'a delta the client assembles from two frames', v_txt;
      end if;
    end loop;
    if octet_length((v_pa->'patch')::text) < 256 then
      raise exception 'f1d: the probe''s patch is only % bytes. Security asked for a NON-EMPTY '
                      'character precisely so that byte-identity is a statement about content',
                      octet_length((v_pa->'patch')::text);
    end if;
    if (v_pa->>'frame')::bigint <> v_v2 or v_pa->>'t' <> 'delta' then
      raise exception 'f1e: the message envelope moved (t=%, frame=%, row=%)',
                      v_pa->>'t', v_pa->>'frame', v_v2;
    end if;
    -- ── f1f: ★ NO KEY hr_apply ADDS TO THE ENVELOPE IS INSIDE THE FOLD ★
    --         (Security 2026-09-23, F8; f1g below walks the branch itself).
    --         f1 above compares two payloads built at the same version — but
    --         `v_out` is NOT always `hr_state_of(…)`. hr_apply's
    --         protected block ends
    --
    --             v_out := public.hr_state_of(v_uid, v_slot);
    --             if v_hf_out is not null then
    --               v_out := jsonb_set(v_out, '{hearthfind}', v_hf_out);
    --             end if;
    --
    --         so a hearthfind apply carries a TOP-LEVEL key the projection
    --         never put there, and this probe's delta never takes that branch.
    --         There is no drift today ONLY because
    --         hr_tick_config_frame_keys_known admits no such key — and that
    --         constraint lives in 2026-09-22-frame-push-channel.sql, which this
    --         file does not restate, so a widening of it would sail through f1.
    --         Pin the DEPENDENCY instead of the symptom, which is also cheaper
    --         than a second probe apply: every top-level key hr_apply adds to
    --         the envelope must be OUTSIDE the fold. If one is ever inside it,
    --         the two payloads agree only on the branch this probe walked.
    select count(*) into v_n
      from (select jsonb_object_keys(v_r)
            except
            select jsonb_object_keys(v_fresh)) x(k)
     where x.k = any (v_keys);
    if v_n <> 0 then
      raise exception 'f1f: hr_apply adds % top-level key(s) to its envelope that hr_state_of '
                      'does not, and frame_keys FOLDS them (apply-only keys: %). f1''s '
                      'byte-identity then holds only where v_hf_out is null — widen '
                      'hr_tick_config_frame_keys_known and this file stops being true.',
                      v_n,
                      (select string_agg(x.k, ', ')
                         from (select jsonb_object_keys(v_r)
                               except
                               select jsonb_object_keys(v_fresh)) x(k)
                        where x.k = any (v_keys));
    end if;

    -- ── f1g: ★ AND BYTE-IDENTITY ON THE BRANCH WHERE v_hf_out IS NOT NULL ★
    --         (Security 2026-09-23, F8). f1 above compares two payloads on a
    --         write that took the ORDINARY path, where `v_out` simply IS
    --         `hr_state_of(v_uid, v_slot)`. hr_apply's protected block does not
    --         always end there:
    --
    --             v_out := public.hr_state_of(v_uid, v_slot);
    --             if v_hf_out is not null then
    --               v_out := jsonb_set(v_out, '{hearthfind}', v_hf_out);
    --             end if;
    --
    --         so on a hearthfind apply the envelope the emitter is handed has
    --         been edited after the projection was taken. f1 never walked that
    --         branch, and "there is no drift today" rested on a constraint in
    --         ANOTHER file. So drive the branch and re-run the comparison on it
    --         — the whole of it, bytes included, not just the key set that f1f
    --         pins. f1g0 refuses to grade unless the branch was actually taken.
    select s.source_kind, s.source_id, s.item_id
      into v_hf_k, v_hf_s, v_hf_i
      from public.hr_hearthfind_sources s
      join public.hr_hearthfind_items  i on i.item_id = s.item_id
     order by s.source_kind, s.source_id, s.item_id
     limit 1;
    if v_hf_i is null then
      raise exception 'f1g0: the hearthfind catalogue is empty, so hr_apply''s v_hf_out branch '
                      'could not be driven and f1 would stay proved only where v_out IS '
                      'hr_state_of(...)';
    end if;
    set local role hr_engine;
    v_rp := public.hr_apply(v_u, 0, v_v2, '00000000-0000-4000-8000-00000000fb05'::uuid,
              jsonb_build_object(
                'hearthfind', jsonb_build_object('item', v_hf_i,
                  'source_kind', v_hf_k, 'source_id', v_hf_s),
                'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                  'meta', jsonb_build_object('src', 'selfcheck-hf'))));
    reset role;
    if coalesce((v_rp->>'ok')::boolean, false) is not true then
      raise exception 'f1g0: the hearthfind probe apply was REFUSED (%) — the branch this arm '
                      'exists to walk was never taken', v_rp;
    end if;
    if not (v_rp ? 'hearthfind') then
      raise exception 'f1g0: the hearthfind apply returned no top-level `hearthfind` key, so '
                      'v_hf_out was null and this arm just graded the branch f1 already did';
    end if;
    select version, gold into v_v2, v_g2 from public.player_state where user_id = v_u and slot = 0;
    if (v_rp->>'version')::bigint <> v_v2 then
      raise exception 'f1g0: the hearthfind apply returned version % while the row holds % — the '
                      'comparison below would be across two different rows',
                      v_rp->>'version', v_v2;
    end if;
    v_fresh := public.hr_state_of(v_u, 0);
    v_pa := public.hr_frame_payload(v_rp, v_keys);
    v_pf := public.hr_frame_payload(v_fresh, v_keys);
    if v_pa is null or v_pf is null then
      raise exception 'f1g1: a payload came back NULL on the hearthfind branch (apply=%, '
                      'fresh=%)', v_pa is null, v_pf is null;
    end if;
    if v_pa::text <> v_pf::text then
      raise exception 'f1g: on a HEARTHFIND apply the payload built from hr_apply''s envelope is '
                      'NOT the payload a fresh projection builds at the same version. The '
                      'receipt hr_apply folds in after the projection has reached a key the '
                      'frame carries, so a player who finds a trophy is pushed a frame that is '
                      'not their row. apply=% fresh=%',
                      left(v_pa::text, 700), left(v_pf::text, 700);
    end if;
    -- …and the key-set pin of f1f, re-run where it has content: `hearthfind`
    -- IS an apply-only top-level key here, and it must be OUTSIDE the fold.
    select count(*) into v_n
      from (select jsonb_object_keys(v_rp)
            except
            select jsonb_object_keys(v_fresh)) x(k)
     where x.k = any (v_keys);
    if v_n <> 0 then
      raise exception 'f1g2: on a hearthfind apply, % of hr_apply''s apply-only top-level '
                      'key(s) are inside frame_keys (%). hr_tick_config_frame_keys_known has '
                      'widened past what hr_state_of projects and this file''s byte-identity '
                      'is no longer true.', v_n,
                      (select string_agg(x.k, ', ')
                         from (select jsonb_object_keys(v_rp)
                               except
                               select jsonb_object_keys(v_fresh)) x(k)
                        where x.k = any (v_keys));
    end if;

    -- ── f6: ★ A REFUSED INTENT EMITS NOTHING ★. A stale version is the refusal
    --        every client meets. It writes nothing, so it must push nothing:
    --        a frame for a payment that was not made raises the client's floor
    --        past the real frame at that version.
    perform set_config('hr923.sends', '0', true);
    set local role hr_engine;
    v_r := public.hr_apply(v_u, 0, v_v2 - 5,
             '00000000-0000-4000-8000-00000000fb02'::uuid, v_d);
    reset role;
    if coalesce((v_r->>'ok')::boolean, true) is not false
       or v_r->>'error' <> 'version_conflict' then
      raise exception 'f6a: the stale-version probe was not refused with version_conflict (%) — '
                      'the zero below would be a property nothing measured', v_r;
    end if;
    if coalesce(current_setting('hr923.sends', true), '0')::int <> 0 then
      raise exception 'f6: a REFUSED intent emitted % frame(s)',
                      coalesce(current_setting('hr923.sends', true), '0');
    end if;
    select version, gold into v_v, v_g from public.player_state where user_id = v_u and slot = 0;
    if v_v <> v_v2 or v_g <> v_g2 then
      raise exception 'f6b: a refused apply moved player_state (version % → %, gold % → %)',
                      v_v2, v_v, v_g2, v_g;
    end if;

    -- ── f3: ★ A PUSH FAILURE MAY NEVER FAIL A PAYMENT ★ (Security proof 3).
    --        The emitter is made to throw the way the real one cannot be made
    --        to from here, and the gold and the version must still be
    --        committed. This is the arm that justifies moving the emit off an
    --        AFTER trigger and into the money function's own body.
    perform set_config('hr923.sends', '0', true);
    perform set_config('hr923.throw', '1', true);
    set local role hr_engine;
    v_r := public.hr_apply(v_u, 0, v_v2, '00000000-0000-4000-8000-00000000fb03'::uuid, v_d);
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true then
      raise exception 'f3: a THROWING emitter failed the apply (%). hr_apply had already '
                      'computed, clamped and journalled the value; a push failure may never '
                      'roll back a payment.', v_r;
    end if;
    select version, gold into v_v, v_g from public.player_state where user_id = v_u and slot = 0;
    if v_v <> v_v2 + 1 or v_g <> v_g2 + 13 then
      raise exception 'f3b: a THROWING emitter rolled back the payment (version % expected %, '
                      'gold % expected %)', v_v, v_v2 + 1, v_g, v_g2 + 13;
    end if;
    /* ── f3c: ★ THE CONTROL, AND IT CANNOT BE A COUNTER ★ ───────────────
       f3 above is "the payment survived", which is also exactly what an
       emitter that was never called produces. The obvious control — count the
       probe's fires — DOES NOT WORK HERE and the reason is worth writing
       down: set_config(..., is_local => true) is TRANSACTIONAL, the call site
       wraps the emit in its own `begin … exception` subtransaction, and the
       probe's raise therefore rolls back its own increment. Measured: the
       counter read 0 on a probe that had fired and thrown.
       So the control is split across two facts that are each already proved:
       f7 established that an accepted write DOES call hr_frame_send, and this
       calls the armed emitter directly and requires it to throw. An emitter
       that is called and that throws, with the gold, the version and the
       ledger row all committed, is the property. */
    begin
      perform public.hr_frame_send(v_u, 0, v_r);
      raise exception 'f3c: the armed probe emitter did NOT throw, so f3 above proved that a '
                      'payment survives an emitter that cannot fail';
    exception when others then
      if sqlerrm <> 'HR923_DELIBERATE_PUSH_FAILURE' then raise; end if;
    end;
    perform set_config('hr923.throw', '0', true);     -- disarmed, control spent
    -- …and the ledger row is there, which is what "the payment committed"
    -- actually means: the value moved AND it is journalled.
    select count(*) into v_n from public.player_ledger
     where user_id = v_u and intent = 'accrue';
    if v_n < 1 then
      raise exception 'f3d: the payment that survived the push failure was never journalled '
                      '(% ledger rows for the probe)', v_n;
    end if;
    select version, gold into v_v2, v_g2 from public.player_state where user_id = v_u and slot = 0;

    -- ── f5: ★ A SHADOW SETTLE EMITS NOTHING — EXECUTED ★. True before this
    --        file because the trigger hung on a table the shadow branch never
    --        writes; it has to be re-proved now that the emitter hangs off
    --        hr_apply instead, because the shadow branch RETURNS BEFORE
    --        hr_apply and nothing about that is visible from the call site.
    --        A dry-run tick that pushed a frame would raise the client's floor
    --        to a payment that was never made.
    select count(*) into v_n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'hr_tick_settle';
    if v_n = 0 then
      raise exception 'f5c: no public.hr_tick_settle is installed, so f5 graded nothing at all. '
                      'An arm that homes on no function is decoration, not a guard.';
    end if;
    update public.player_state
       set active_kind = 'gather',
           active_id = coalesce((select activity_id from public.hr_activities
                                  where kind = 'gather' limit 1), 'hr923-probe-gather')
     where user_id = v_u and slot = 0;                    -- version UNCHANGED
    insert into public.hr_tick_ownership
      (user_id, slot, channel, owned, lease_holder, lease_until)
    values (v_u, 0, 'gather', true, 'hr923-selfcheck', now() + interval '5 minutes');
    update public.hr_tick_config set enabled = true, shadow = true where id;
    v_tf := now() - interval '10 minutes';
    v_tt := now() - interval '5 minutes';
    perform set_config('hr923.sends', '0', true);
    perform set_config('hr923.projections', '0', true);
    set local role hr_engine;
    v_r := public.hr_tick_settle('hr923-selfcheck', v_u, 0, 'gather', v_v2, v_tf, v_tt,
             '00000000-0000-4000-8000-00000000fb04',
             jsonb_build_object('gold', 100, 'accrued_to', to_jsonb(v_tt),
               'journal', jsonb_build_object('kind', 'gather', 'intent', 'accrue',
                 'meta', jsonb_build_object('src', 'tick', 'qty', 7, 'ticks', 3))));
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) is not true or v_r->>'mode' <> 'shadow' then
      raise exception 'f5a: the probe shadow settle did not run (%) — a refused settle writes '
                      'nothing and emits nothing, so the two assertions below would pass on a '
                      'tick that never happened', v_r;
    end if;
    if coalesce(current_setting('hr923.sends', true), '0')::int <> 0 then
      raise exception 'f5: a SHADOW settle emitted % frame(s). A dry run pushed a frame, so the '
                      'client raises its floor to a version for a payment that was never made '
                      'and drops the real frame at that version as a duplicate.',
                      coalesce(current_setting('hr923.sends', true), '0');
    end if;
    select version, gold into v_v, v_g from public.player_state where user_id = v_u and slot = 0;
    if v_v <> v_v2 or v_g <> v_g2 then
      raise exception 'f5b: a SHADOW settle moved player_state (version % → %, gold % → %). '
                      'The shadow branch reached hr_apply, so a dry run paid.',
                      v_v2, v_v, v_g2, v_g;
    end if;
    update public.player_state set active_kind = 'idle', active_id = null
     where user_id = v_u and slot = 0;                    -- version UNCHANGED

    -- ════════════════════════════════════════════════════════════════════
    -- f11: THE PROBES COME OUT, EXPLICITLY, AND THE REAL BODIES ARE PROVED
    --      BYTE-IDENTICAL. The rollback would do this anyway; doing it here as
    --      well is what makes a rollback that did not take harmless.
    -- ════════════════════════════════════════════════════════════════════
    execute v_sodef;
    execute v_snddef;
    drop function if exists public.hr923_state_of_real(uuid, integer);
    if pg_get_functiondef('public.hr_state_of(uuid,integer)'::regprocedure) <> v_sodef then
      raise exception 'f11: hr_state_of was NOT restored to the body this block stood in for';
    end if;
    if pg_get_functiondef('public.hr_frame_send(uuid,integer,jsonb)'::regprocedure) <> v_snddef then
      raise exception 'f11b: hr_frame_send was NOT restored to the body this block stood in for';
    end if;
    if to_regprocedure('public.hr923_state_of_real(uuid,integer)') is not null then
      raise exception 'f11c: the probe copy of hr_state_of is still installed';
    end if;

    -- ── f10b: ★ THE REAL EMITTER, FAIL-CLOSED AND THEN ARMED ★. Everything
    --         above ran against a stand-in, so the real one is exercised here
    --         end to end: with the shipped `frame_push = false` it must write
    --         NO realtime.messages row, and with the switch on it must write
    --         exactly one, on the probe's own topic. Skipped with a notice
    --         where the realtime schema is absent (the PGlite replay); it runs
    --         on the apply that counts.
    if to_regclass('realtime.messages') is not null
       and to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
      begin
        -- ── f10a: ★ THE TRANSPORT IS PROVED BEFORE IT IS USED AS AN
        --         INSTRUMENT ★ (Security 2026-09-23, F1 — CONFIRMED BY
        --         EXECUTION, and it blocks the apply without this control).
        --
        --         f10b/f10c/f10d are the FIRST arms in this whole chain that
        --         require the LIVE realtime.send — its partition routing, its
        --         payload limit, its signature — to land a row and be counted
        --         back. The sibling file never did: 2026-09-22-frame-push-
        --         channel.sql's s5/s5b/s6 counted probe TRIGGER fires and its
        --         e2 seeded its probe row by a direct insert.
        --
        --         And hr_frame_send SWALLOWS a transport error BY DESIGN, so an
        --         absent transport never reaches this block's handler below: it
        --         arrives as ZERO ROWS, and f10c says `expected exactly 1`.
        --         A missing realtime.messages daily partition (check_violation),
        --         a payload over the broadcast limit, a changed send signature,
        --         an RLS visibility failure on the count-back — every one of
        --         them would abort a MONEY-PATH migration with a message that
        --         reads like the emitter is broken. Security reproduced exactly
        --         that (H1) on this branch.
        --
        --         e2 one file back already draws this distinction and skips.
        --         This is that standard, restored to the arm that lost it, in
        --         this file's own f2b/f2d doctrine: a positive control BEFORE
        --         any count is believed. One direct send on a throwaway topic,
        --         counted back in its own begin … exception. If it does not
        --         round-trip, THIS ARM STOPS GRADING — it does not stop the
        --         migration.
        --
        --         ⚠ AND THIS IS NOT A LOOSENING OF f10c. A WORKING transport
        --           still has to honour the kill switch and still has to send
        --           exactly once: the control has a topic of its own, and a
        --           transport that round-trips the control while dropping the
        --           emitter's frame fails f10c exactly as it always did
        --           (tests/schema-drift.mjs mutation
        --           `frame_control_transport_lies`, caught via replay).
        v_txt := 'hr923-control:' || v_u::text;
        begin
          perform realtime.send(jsonb_build_object('t', 'hr923-control'),
                                'hr923-control', v_txt, true);
          select count(*) into v_n from realtime.messages where topic = v_txt;
        exception when others then
          v_n := -1;
        end;
        if v_n <> 1 then
          raise notice 'f10b SKIPPED: realtime.messages does not round-trip from this session '
                       '(the control send counted back % row(s)) — f10b/f10c/f10d would grade '
                       'an ABSENT transport as a broken emitter and fail this apply', v_n;
        else
        select count(*) into v_n from realtime.messages
         where topic = public.hr_frame_topic(v_u, 0);
        if v_n <> 0 then
          raise notice 'f10b SKIPPED: the probe topic already carries % row(s)', v_n;
        else
          v_env := public.hr_state_of(v_u, 0);
          perform public.hr_frame_send(v_u, 0, v_env);      -- frame_push is FALSE
          select count(*) into v_n from realtime.messages
           where topic = public.hr_frame_topic(v_u, 0);
          if v_n <> 0 then
            raise exception 'f10b: the emitter sent % frame(s) with frame_push FALSE. The kill '
                            'switch is the whole of this channel''s reversibility.', v_n;
          end if;
          update public.hr_tick_config set frame_push = true where id;
          perform public.hr_frame_send(v_u, 0, v_env);
          select count(*) into v_n from realtime.messages
           where topic = public.hr_frame_topic(v_u, 0);
          if v_n <> 1 then
            raise exception 'f10c: the emitter armed sent % frame(s), expected exactly 1 — and '
                            'f10a proved the transport round-trips from this session, so this '
                            'is the EMITTER, not the environment', v_n;
          end if;
          -- …ON THE PROBE'S OWN TOPIC AND NOBODY ELSE'S. The topic is what the
          -- receive policy reads; a frame on the wrong one is another player's
          -- whole envelope.
          select count(*) into v_n from realtime.messages
           where topic = public.hr_frame_topic(v_o, 0);
          if v_n <> 0 then
            raise exception 'f10d: % frame(s) landed on another character''s topic', v_n;
          end if;
        end if;
        end if;
      exception
        when insufficient_privilege or undefined_table or undefined_function then
          raise notice 'f10b SKIPPED: realtime.messages is not writable from here (%)', sqlerrm;
      end;
    else
      raise notice 'f10b SKIPPED: the realtime schema is absent in this database';
    end if;

    -- ════════════════════════════════════════════════════════════════════
    -- f11d: AND THE CONFIG SINGLETON GOES BACK THE SAME WAY THE PROBES DID
    --       (Security 2026-09-23, F5). f5 wrote enabled and shadow; f10b just
    --       wrote frame_push. The subtransaction rollback below would unwind
    --       all three and it is reliable PL/pgSQL — but f11's own stated
    --       doctrine is that a rollback which did not take must be HARMLESS,
    --       and frame_push left true is not harmless: it is this channel ARMED
    --       in production with condition 8b not met, which is the one thing
    --       Security's veto is gating. So it is unwound explicitly, from the
    --       values captured before the first write, and read back.
    -- ════════════════════════════════════════════════════════════════════
    update public.hr_tick_config
       set enabled = v_cfg_e, shadow = v_cfg_s, frame_push = v_cfg_f
     where id;
    select enabled, shadow, frame_push into v_chk_e, v_chk_s, v_chk_f
      from public.hr_tick_config where id limit 1;
    if v_chk_e is distinct from v_cfg_e
       or v_chk_s is distinct from v_cfg_s
       or v_chk_f is distinct from v_cfg_f then
      raise exception 'f11d: hr_tick_config was NOT restored to what this block found '
                      '(enabled % → %, shadow % → %, frame_push % → %). A frame_push left '
                      'true is the push channel armed in production with 8b not met.',
                      v_cfg_e, v_chk_e, v_cfg_s, v_chk_s, v_cfg_f, v_chk_f;
    end if;

    raise exception 'HR923_ROLLBACK_OK';
  exception
    when others then
      if sqlerrm <> 'HR923_ROLLBACK_OK' then raise; end if;
  end;
  raise notice 'frame-emit-from-apply self-check PASSED (f0-f11d = SEC §2.2 proofs 1-4, plus the '
               'shadow, refusal, REPLAY, HEARTHFIND-branch and double-emit arms, f10a''s '
               'transport control and '
               'f11d''s explicit hr_tick_config restore; proofs 5-6 are the live re-measurement '
               'in §6 and are the Coordinator''s); probe rows rolled back';
end $$;
