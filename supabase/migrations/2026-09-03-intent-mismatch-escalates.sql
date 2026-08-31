-- 2026-09-03-intent-mismatch-escalates.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED BY TOOLING. ✅ APPLIED TO PRODUCTION 2026-08-30 (one ordered txn with its siblings; hr_intent_replay live at md5 97f6c74e…, all twelve patched bodies verified live-vs-replay by tests/live-hash-drift.mjs 2026-08-31). ⚠⚠⚠
--   Detector-only. It changes NO payout, NO grant, NO client-callable surface and
--   NO control path: the only thing that moves is the `severity` a rejection row
--   is recorded under, and only after the FIFTIETH occurrence in one
--   (user, slot, day).
--
--   APPLY AFTER 2026-09-03-intent-mismatch-class.sql. §0 fails closed without it,
--   because escalating a code that nothing can emit outside `hr_apply` is a
--   detector for a population of one verb — and the whole reason this ruling
--   exists is that twelve more can now emit it.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE RULING (Security, on the b493/b494 finding #7 sign-off)
-- ══════════════════════════════════════════════════════════════════════════
-- The sibling migration makes twelve RPCs answer `intent_mismatch` where they
-- previously served another intent's cached envelope. `hr_record_rejection`
-- classifies every code it records into one of two arrays:
--
--   c_incident   — "a caller proposed something an honest game loop cannot
--                   propose". Fires on the FIRST occurrence.
--   c_escalating — ordinary on its own, a signature when SUSTAINED. Promoted to
--                   'incident' at `c_escalate_at` (50) occurrences in one
--                   (user, slot, day). Today: `rate_limited`, `own_listing`.
--
-- `intent_mismatch` has the SECOND profile, and the distinction is not
-- cosmetic — it is the difference between a dashboard that cries wolf and one
-- worth reading:
--
--   · ONE mismatch is a stale retry. A client that reloads mid-gesture, a tab
--     restored from bfcache, a queued request replayed after a slot switch —
--     all of these can present yesterday's key to today's verb exactly once.
--     Recording that as an incident would make the first honest reconnect look
--     like an attack.
--   · FIFTY in a day is a signature an honest client cannot produce. Every
--     client site mints a fresh uuid per gesture (crypto.randomUUID), so
--     sustained reuse means something is generating keys deliberately — which
--     is precisely the case the ledger exists to make visible.
--
-- Left alone, `intent_mismatch` stays severity 'normal' FOREVER, at any n. The
-- detector would faithfully count a thousand of them and never say a word.
--
-- ⚠ NOT `c_incident`. That was considered and REJECTED by the same ruling; the
--   reasoning is recorded here rather than left to be re-litigated: an
--   incident-on-first-occurrence classification for a code whose benign cause is
--   "a retry arrived late" produces a permanent low-grade alarm, and a
--   permanently-alarming detector is a muted one. The escalation preserves both
--   halves — the row is always written, the SEVERITY is earned.
--
-- ══════════════════════════════════════════════════════════════════════════
-- HOW
-- ══════════════════════════════════════════════════════════════════════════
-- ANCHORED, EXACTLY-ONCE PATCH ON THE LIVE BODY — never a restatement.
-- `hr_record_rejection` is 40 lines of classification logic that this file did
-- not author, and restating a body to change one array element is how the
-- b484–b487 wave happened. The anchor is the WHOLE `c_escalating` declaration,
-- so a body whose array has moved on refuses to be patched blind rather than
-- being silently overwritten with a stale copy.
--
-- Idempotent: a body that already carries the code is skipped with a notice.
-- The ACL is captured before the replace and asserted byte-identical after —
-- `create or replace` preserves `proacl`, and this function is granted to
-- `postgres` alone (it writes `hr_rejections` for an arbitrary user id).
--
-- ══════════════════════════════════════════════════════════════════════════
-- REVERSIBILITY / COST
-- ══════════════════════════════════════════════════════════════════════════
-- Reverse: re-apply the migration that last authored `hr_record_rejection`, or
-- run the same anchored patch with the two arrays swapped back. No table, no
-- column, no row, no grant, no schedule.
-- Cost: zero. `hr_rejections` is already upserted on (user_id, slot, day, code)
-- — one row per user per day per code, pruned at 180 days by
-- `hr-rejections-prune`. This changes a string in a CASE expression on a write
-- that already happens; it adds no row, no index and no query at any player
-- count.
-- ══════════════════════════════════════════════════════════════════════════


-- ── §0. FAIL CLOSED ────────────────────────────────────────────────────────
do $$
declare v_src text;
begin
  if to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 'hr_record_rejection(uuid,int,text,text,jsonb,bigint) is absent — apply '
                    '2026-08-11-apply-engine.sql first.';
  end if;
  if to_regprocedure('public.hr_intent_replay(uuid,int,uuid,text)') is null then
    raise exception 'hr_intent_replay is absent — apply 2026-09-03-intent-mismatch-class.sql '
                    'FIRST. Escalating a code that only hr_apply can emit is a detector for one '
                    'verb; the twelve RPCs that file hardens are the population this ruling is '
                    'about, and shipping the classification without them measures nothing.';
  end if;
  -- The classification arrays must still be where the ruling assumes they are.
  select replace(pg_get_functiondef(
    'public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)'::regprocedure), chr(13), '')
    into v_src;
  if position('c_escalate_at' in v_src) = 0 or position('c_escalating' in v_src) = 0 then
    raise exception 'hr_record_rejection no longer carries the c_escalating / c_escalate_at '
                    'mechanism — the ruling this file implements does not apply to that body.';
  end if;
end $$;


-- ── §1. THE PATCH ─────────────────────────────────────────────────────────
do $do$
declare
  c_sig constant text := 'public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)';
  c_anchor constant text :=
    '  c_escalating constant text[] := array[''rate_limited'',''own_listing''];';
  c_repl constant text :=
    '  -- ''intent_mismatch'' (2026-09-03, Security ruling on finding #7). ONE is a' || chr(10) ||
    '  -- stale retry — a reload mid-gesture, a bfcache restore, a queued request' || chr(10) ||
    '  -- replayed after a slot switch. FIFTY in a day is a signature an honest' || chr(10) ||
    '  -- client cannot produce, because every client site mints a fresh uuid per' || chr(10) ||
    '  -- gesture. That is this array''s profile exactly, and NOT c_incident''s,' || chr(10) ||
    '  -- which fires on the first occurrence and would make every late retry an' || chr(10) ||
    '  -- alarm. The row was always written; now the severity is earned.' || chr(10) ||
    '  c_escalating constant text[] := array[''rate_limited'',''own_listing'',''intent_mismatch''];';
  v_src text; v_new text; v_hits int;
  v_acl_before text; v_acl_after text;
begin
  v_src := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');

  if position('''intent_mismatch''' in v_src) > 0 then
    raise notice 'hr_record_rejection already classifies intent_mismatch — patch skipped';
    return;
  end if;

  v_hits := (length(v_src) - length(replace(v_src, c_anchor, ''))) / length(c_anchor);
  if v_hits <> 1 then
    raise exception 'ANCHOR DRIFT on hr_record_rejection: the c_escalating declaration matched % '
                    'times, expected exactly 1. Refusing to patch blind — re-apply the migration '
                    'that last authored this body, then this one.', v_hits;
  end if;

  v_new := replace(v_src, c_anchor, c_repl);
  select coalesce(proacl::text, '') into v_acl_before from pg_proc where oid = c_sig::regprocedure;
  execute v_new;
  select coalesce(proacl::text, '') into v_acl_after  from pg_proc where oid = c_sig::regprocedure;
  if v_acl_after is distinct from v_acl_before then
    raise exception 'ACL MOVED on hr_record_rejection (% -> %) — a body replace must never change '
                    'who may call it.', v_acl_before, v_acl_after;
  end if;
  raise notice 'hr_record_rejection: intent_mismatch now ESCALATES (sustained -> incident)';
end $do$;


-- ── §2. SELF-VERIFICATION ─────────────────────────────────────────────────
do $do$
declare
  c_sig constant text := 'public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)';
  v_src text; v_esc text; v_inc text; v_acl aclitem[];
begin
  v_src := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');

  -- (a) IT IS IN c_escalating…
  v_esc := substring(v_src from 'c_escalating constant text\[\] := array\[([^\]]*)\]');
  if v_esc is null or position('''intent_mismatch''' in v_esc) = 0 then
    raise exception 'intent_mismatch is not in c_escalating after the patch (found: %)',
      coalesce(v_esc, '<no array>');
  end if;

  -- (b) …AND NOT IN c_incident. The two arrays are different rulings and the
  --     difference is the whole point: c_incident fires on the FIRST occurrence.
  v_inc := substring(v_src from 'c_incident constant text\[\] := array\[([^\]]*)\]');
  if v_inc is not null and position('''intent_mismatch''' in v_inc) > 0 then
    raise exception 'intent_mismatch reached c_incident — that classification was considered and '
                    'REJECTED (a late retry would alarm on its first occurrence).';
  end if;

  -- (c) The ACL is still postgres-only. It writes hr_rejections for an ARBITRARY
  --     user id, so a client grant here is a way to forge another player's
  --     abuse record.
  if has_function_privilege('anon', c_sig, 'execute')
     or has_function_privilege('authenticated', c_sig, 'execute')
     or has_function_privilege('service_role', c_sig, 'execute') then
    raise exception 'hr_record_rejection is executable by a client role';
  end if;
  select proacl into v_acl from pg_proc where oid = c_sig::regprocedure;
  if v_acl is null then
    raise exception 'hr_record_rejection carries the DEFAULT acl (PUBLIC=EXECUTE)';
  end if;
  if exists (select 1 from aclexplode(v_acl) a where a.grantee = 0) then
    raise exception 'hr_record_rejection still carries a PUBLIC execute grant (acl %)', v_acl::text;
  end if;

  raise notice 'intent_mismatch: escalating, not incident, ACL unchanged';
end $do$;


-- ── §3. AND IT ACTUALLY ESCALATES — PROVEN, IN A ROLLED-BACK BLOCK ────────
-- A classification is a claim about behaviour, so execute it rather than read
-- it. Every write below is discarded by the HR822 sentinel.
--
-- THE CONTROL IS THE POINT: one occurrence must stay 'normal' (a late retry is
-- not an incident) and the fiftieth must flip. A test that only checked the flip
-- would pass identically if the code had been put in c_incident by mistake —
-- which is the one classification this ruling rejected.
do $$
declare
  v_uid constant uuid := '00000000-0000-0000-0000-0000000009f5';   -- synthetic; hr_rejections has no FK
  v_sev_one text; v_sev_many text; v_n bigint;
begin
  begin
    delete from public.hr_rejections where user_id = v_uid;

    perform public.hr_record_rejection(v_uid, 0, 'probe', 'intent_mismatch', '{}'::jsonb, 1);
    select severity into v_sev_one from public.hr_rejections
     where user_id = v_uid and slot = 0 and day = current_date and code = 'intent_mismatch';
    if v_sev_one is distinct from 'normal' then
      raise exception 'ONE mismatch was recorded as "%" — a single stale retry must not be an '
                      'incident, or the detector alarms on every late reconnect.', v_sev_one;
    end if;

    -- The 50th occurrence, delivered as one weighted call the way the sampler
    -- does (p_count is "how many real events this call represents").
    perform public.hr_record_rejection(v_uid, 0, 'probe', 'intent_mismatch', '{}'::jsonb, 49);
    select severity, n into v_sev_many, v_n from public.hr_rejections
     where user_id = v_uid and slot = 0 and day = current_date and code = 'intent_mismatch';
    if v_n < 50 then
      raise exception 'the probe only reached n=% — the fixture cannot test the threshold', v_n;
    end if;
    if v_sev_many is distinct from 'incident' then
      raise exception 'SUSTAINED mismatch (n=%) is still "%" — the escalation is not wired.',
        v_n, v_sev_many;
    end if;

    raise exception using errcode = 'HR822', message = 'probe complete — rolling back';
  exception
    when sqlstate 'HR822' then
      raise notice 'intent_mismatch escalation proven: 1 -> normal, 50 -> incident, probe rolled back';
  end;
end $$;
