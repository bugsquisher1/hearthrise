-- 2026-09-07-companion-codes-severity.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT YET APPLIED. The Coordinator applies. ⚠⚠⚠
--
--   Detector-only. It changes NO payout, NO grant, NO client-callable surface,
--   NO control path and NO rate limit: the only thing that moves is the
--   `severity` string two already-written hr_rejections rows are recorded
--   under. Every one of those rows was already being written before this file
--   and is still written after it — what changes is whether anyone is told.
--
--   APPLY AFTER 2026-09-06-companion-grant-hardening.sql (§0 fails closed by
--   name without it) and after 2026-09-03-intent-mismatch-escalates.sql (§0
--   fails closed by name without it too: the c_escalating line this file
--   anchors on is that file's output, and patching an array whose contents have
--   moved is the b484-b487 blind-restatement class).
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE RULING (Security, 2026-08-31, condition C6 on the companion-grant
--             hardening sign-off)
-- ══════════════════════════════════════════════════════════════════════════
-- 2026-09-06-companion-grant-hardening.sql gave hr_companion_grant two new
-- machine refusals and journalled both through public.hr_record_rejection. That
-- function grades severity from ITS OWN two arrays and neither code was in
-- either, so both landed 'normal' — forever, at any n. The hardening file said
-- so in its own header and left the classification OPEN as C6. This is C6.
--
--   c_incident   — "a caller proposed something an honest game loop cannot
--                   propose". Fires on the FIRST occurrence.
--   c_escalating — ordinary on its own, a signature when SUSTAINED. Promoted to
--                   'incident' at c_escalate_at (50) occurrences in one
--                   (user, slot, day). Today: rate_limited, own_listing,
--                   intent_mismatch.
--
-- ── unknown_unlock  ->  c_incident  (alarm on the FIRST occurrence) ────────
-- It is NEVER player behaviour, and no forgery can produce it. hr_companion_grant
-- emits it in exactly two places, both reached only when the `companion:<id>`
-- row is MISSING from public.hr_unlocks — a SERVER-side catalogue defect. One
-- occurrence means the unlock catalogue has been destroyed again: the b453
-- wholesale-delete class, which production actually sat in from 2026-08-23 to
-- 2026-08-30 while every player who earned a companion silently lost it and
-- nothing in the stack said a word.
--
-- The usual objection to a first-occurrence classification is that it produces
-- a permanently-alarming, therefore muted, detector. It does not apply here:
-- after the 2026-09-05 reseed the row set is COMPLETE (17 grantable companions,
-- 17 correctly-shaped hr_unlocks rows, asserted by the hardening file's own §0),
-- so the code cannot fire at all in normal operation. Its steady state is zero.
-- And the damage is front-loaded — the FIRST refused grant is already a player
-- losing a companion — so a detector that waits for fifty is a detector that
-- watches fifty players lose one before it speaks.
--
-- ⚠ NOT c_escalating. Considered and rejected: a threshold on a code whose
--   population is a server bug means the alarm arrives only if the bug is
--   POPULAR. A catalogue destroyed on a quiet Tuesday would never reach 50 in
--   one (user, slot, day) — the counter is PER PLAYER — and would go on being
--   invisible exactly as it did for that week.
--
-- ── missing_req_item  ->  c_escalating  (the existing 50/user/slot/day) ────
-- TODAY only a forged local inventory can produce it: `dragon_egg` is in no
-- catalogue, no drop table, no recipe and no shop, so no honest client can ask
-- to hatch one. That is an argument for c_incident only as long as it stays
-- true, and the hardening file wrote down the forward condition under which it
-- stops being true: the moment `dragon_egg` ships client-side ahead of
-- server-side, an HONEST client holding a local egg the server cannot see
-- produces this refusal on every hatch attempt. That is state divergence — our
-- content gap — and grading it 'incident' on the first occurrence would file an
-- abuse record against a player for a bug of ours.
--
-- Escalating is safe in BOTH worlds, which is the whole reason to choose it:
-- ONE is a stale client, FIFTY in a day is a signature an honest client cannot
-- produce. Identical reasoning to intent_mismatch (2026-09-03), and the row is
-- written either way — only the severity is earned.
--
-- ⚠ THE TWO ARE NOT THE SAME RULING AND MUST NOT DRIFT INTO ONE. §2 asserts
--   each code is in ITS array and NOT in the other; §3 proves the behaviour
--   with the controls that make the proof non-vacuous (see §3).
--
-- ══════════════════════════════════════════════════════════════════════════
-- HOW
-- ══════════════════════════════════════════════════════════════════════════
-- ANCHORED, EXACTLY-ONCE PATCH ON THE LIVE BODY — never a restatement.
-- hr_record_rejection is classification logic this file did not author, and
-- restating a body to change two array elements is how the b484-b487 wave
-- happened. Two anchors, each the WHOLE closing line of the array it edits, so
-- an array that has moved on refuses to be patched blind.
--
-- ── THE TWO SHAPES THE ANCHORS MUST MATCH ─────────────────────────────────
-- hr_record_rejection is one of the seven bodies where production and a repo
-- replay legitimately differ, and the difference is COMMENTS ONLY (verified
-- 2026-08-31 by `node tests/live-hash-drift.mjs --codediff`: CODE-IDENTICAL,
-- 1,639 code chars; 2026-08-11-player-state.sql expanded three comment blocks
-- after the apply). So the live body carries SHORT comment blocks above both
-- arrays and the replay carries LONG ones, and any anchor that included a
-- comment line would match on exactly one of the two databases this file has to
-- apply to.
--
-- Both anchors are therefore PURE CODE on ONE line, carrying their own
-- indentation and nothing else:
--     4 spaces + 'seller_unavailable','forbidden_impersonation'];
--     2 spaces + c_escalating constant text[] := array[... 'intent_mismatch'];
-- Those two lines are byte-identical on production (measured 2026-08-31 via
-- pg_get_functiondef) and in the repo replay, and they are the same idiom
-- 2026-09-03-intent-mismatch-escalates.sql used to solve this exact problem.
-- CR is stripped before matching, so a body applied from a CRLF working copy
-- matches too.
--
-- Idempotent: each half is skipped, independently, if the body already carries
-- that code — read from a COMMENT-STRIPPED copy, so the explanatory comment this
-- file injects can never stand in for the array element it explains.
--
-- §1 additionally asserts the element SETS: every code that was in an array
-- before the patch is still in it after, and exactly one was added. A patch that
-- ate a sibling would otherwise be invisible — the detector would simply stop
-- alarming on rate_limited and nobody would find out from a passing migration.
--
-- The ACL is captured before the replace and asserted byte-identical after.
-- `create or replace` preserves proacl, and this function is granted to
-- `postgres` alone: it writes hr_rejections for an ARBITRARY user id, so a
-- client grant here is a way to forge another player's abuse record.
--
-- ══════════════════════════════════════════════════════════════════════════
-- REVERSIBILITY / COST
-- ══════════════════════════════════════════════════════════════════════════
-- Reverse: run the same anchored patch with the two array literals swapped back
-- (drop 'unknown_unlock' from c_incident, drop 'missing_req_item' from
-- c_escalating). No table, no column, no row, no grant, no policy, no schedule.
--
-- ⚠ THE REVERT HAZARD, written down because it is silent: the LAST migration to
--   author public.hr_record_rejection wins. Re-applying
--   2026-08-11-player-state.sql alone reverts this file AND
--   2026-09-03-intent-mismatch-escalates.sql, without an error, because that
--   file's own self-checks were written for its own body and pass on it. THE
--   REPAIR, in order: re-apply 2026-09-03-intent-mismatch-escalates.sql, then
--   this file. tests/companion-codes-severity.mjs derives the writer list from
--   the apply manifest and requires this file to be last.
--
-- Cost at 100x players: ZERO new rows and zero new bytes. hr_rejections is
-- UPSERTED on (user_id, slot, day, code) — one row per player per day per code
-- no matter how many calls — and both codes were already being written. This
-- changes a string in a CASE expression on a write that already happens; it adds
-- no row, no index, no query and no schedule. Journal rule 6 is untouched:
-- nothing here logs per tick. `unknown_unlock`'s expected steady-state row count
-- is zero, because a complete catalogue cannot emit it.
--
-- EDGE REDEPLOY: none. No src/core, src/data or supabase/functions change, and
-- no client change — severity is an operator-facing column the client never
-- reads.
-- ══════════════════════════════════════════════════════════════════════════


-- ── §0. FAIL CLOSED, BY NAME ──────────────────────────────────────────────
do $$
declare
  c_rr constant text := 'public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)';
  c_cg constant text := 'public.hr_companion_grant(int,text,text,uuid)';
  v_src text;
  v_cg  text;
begin
  if to_regprocedure(c_rr) is null then
    raise exception 'hr_record_rejection(uuid,int,text,text,jsonb,bigint) is absent — apply '
                    '2026-08-11-player-state.sql first.';
  end if;

  -- THE VERB THAT EMITS THE TWO CODES MUST EXIST AND MUST EMIT THEM. Grading a
  -- code nothing can produce is a detector for a population of zero, and the
  -- hardening file is what creates the population. Named, so the failure says
  -- what to apply rather than what is missing.
  if to_regprocedure(c_cg) is null then
    raise exception 'hr_companion_grant(int,text,text,uuid) is absent — apply '
                    '2026-08-22-companion-grant.sql and then '
                    '2026-09-06-companion-grant-hardening.sql first.';
  end if;
  v_cg := replace(pg_get_functiondef(c_cg::regprocedure), chr(13), '');
  if position('''unknown_unlock''' in v_cg) = 0 or position('''missing_req_item''' in v_cg) = 0 then
    raise exception 'hr_companion_grant does not record unknown_unlock / missing_req_item — apply '
                    '2026-09-06-companion-grant-hardening.sql FIRST. Before that file the storage-'
                    'guard refusal was a PostgREST 500 and the req_item control granted anyway, so '
                    'neither code exists to classify. Shipping the severity ruling without the '
                    'codes it grades measures nothing.';
  end if;

  -- THE CLASSIFICATION MECHANISM MUST STILL BE WHERE THE RULING ASSUMES IT IS.
  v_src := replace(pg_get_functiondef(c_rr::regprocedure), chr(13), '');
  if position('c_incident' in v_src) = 0
     or position('c_escalating' in v_src) = 0
     or position('c_escalate_at' in v_src) = 0 then
    raise exception 'hr_record_rejection no longer carries the c_incident / c_escalating / '
                    'c_escalate_at mechanism — the ruling this file implements does not apply to '
                    'that body.';
  end if;

  -- …AND IT MUST BE THE POST-2026-09-03 BODY. The c_escalating anchor below is
  -- literally the line 2026-09-03-intent-mismatch-escalates.sql installed; on a
  -- chain where that file has not run, the anchor matches ZERO times and the
  -- patch would refuse with "ANCHOR DRIFT", which is true but does not say what
  -- to do. Say it here instead.
  if position('''intent_mismatch''' in v_src) = 0 then
    raise exception 'c_escalating does not carry intent_mismatch — apply '
                    '2026-09-03-intent-mismatch-escalates.sql FIRST. This file anchors on the exact '
                    'array line that migration installs, so applying it out of order patches a body '
                    'the ruling was not reviewed against.';
  end if;
end $$;


-- ── §1. THE PATCH ─────────────────────────────────────────────────────────
do $do$
declare
  c_sig constant text := 'public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)';

  -- The two declaration prefixes, used to read the element SETS back out.
  c_inc_decl constant text := 'c_incident constant text[] := array[';
  c_esc_decl constant text := 'c_escalating constant text[] := array[';

  -- ── ANCHOR 1: the closing line of c_incident. Pure code, one line, its own
  --    indentation — identical on production and on the repo replay (see the
  --    header: the two shapes differ only in the comment blocks around it).
  c_anchor_inc constant text :=
    '    ''seller_unavailable'',''forbidden_impersonation''];';
  c_repl_inc constant text :=
    '    ''seller_unavailable'',''forbidden_impersonation'',' || chr(10) ||
    '    -- unknown_unlock (2026-08-31, Security ruling C6 on the companion-grant' || chr(10) ||
    '    -- hardening sign-off). NEVER player behaviour, and no forgery can produce' || chr(10) ||
    '    -- it: hr_companion_grant emits this code only when the companion:<id> row' || chr(10) ||
    '    -- is MISSING from public.hr_unlocks, which is a SERVER catalogue defect.' || chr(10) ||
    '    -- One occurrence means the unlock catalogue has been destroyed again (the' || chr(10) ||
    '    -- b453 wholesale delete class, which production sat in from 2026-08-23 to' || chr(10) ||
    '    -- 2026-08-30 while players silently lost companions). After the reseed the' || chr(10) ||
    '    -- row set is COMPLETE, so the steady state is zero and a first-occurrence' || chr(10) ||
    '    -- alarm is not a noisy detector here. It is the only useful kind: the' || chr(10) ||
    '    -- damage lands on call ONE, so a threshold would watch fifty players lose' || chr(10) ||
    '    -- a companion before it spoke. NOT c_escalating: the counter is PER' || chr(10) ||
    '    -- PLAYER, so a catalogue destroyed on a quiet day never reaches fifty.' || chr(10) ||
    '    ''unknown_unlock''];';

  -- ── ANCHOR 2: the whole c_escalating declaration as
  --    2026-09-03-intent-mismatch-escalates.sql left it.
  c_anchor_esc constant text :=
    '  c_escalating constant text[] := array[''rate_limited'',''own_listing'',''intent_mismatch''];';
  c_repl_esc constant text :=
    '  -- missing_req_item (2026-08-31, Security ruling C6). TODAY only a forged' || chr(10) ||
    '  -- local inventory can produce it: dragon_egg is in no catalogue, no drop' || chr(10) ||
    '  -- table, no recipe and no shop, so no honest client can ask to hatch one.' || chr(10) ||
    '  -- That argues for c_incident only while it stays true. The moment dragon_egg' || chr(10) ||
    '  -- ships client-side ahead of server-side, an HONEST client holding a local' || chr(10) ||
    '  -- egg the server cannot see answers this on every hatch: state divergence,' || chr(10) ||
    '  -- our content gap, not abuse. Escalating is safe in BOTH worlds, which is' || chr(10) ||
    '  -- why it is chosen: ONE is a stale client, FIFTY in a day is a signature an' || chr(10) ||
    '  -- honest client cannot produce. Same reasoning as intent_mismatch above.' || chr(10) ||
    '  c_escalating constant text[] := array[''rate_limited'',''own_listing'',''intent_mismatch'',''missing_req_item''];';

  v_src text; v_new text; v_hits int;
  v_code_old text; v_code_new text;
  v_do_inc boolean; v_do_esc boolean;
  v_inc_before text[]; v_inc_after text[];
  v_esc_before text[]; v_esc_after text[];
  v_size_ok boolean;
  v_acl_before text; v_acl_after text;
  v_owner_before text; v_owner_after text;
begin
  v_src := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');

  /* COMMENT-STRIPPED, because this file INJECTS a comment that names each code.
     Reading the raw body would let the explanation stand in for the array
     element it explains — the patch could be reverted to a no-op and every
     presence check here would still pass. Backslash-free character class on
     purpose: '\s' and friends are parsed differently under PGlite and under
     production (measured 2026-08-29 by the kill-daily migration), and a class
     that silently eats letters is worse than one that fails. */
  v_code_old := regexp_replace(v_src, '--[^' || chr(10) || ']*', '', 'g');

  v_do_inc := position('''unknown_unlock''' in v_code_old) = 0;
  v_do_esc := position('''missing_req_item''' in v_code_old) = 0;

  if not v_do_inc and not v_do_esc then
    raise notice 'hr_record_rejection already classifies unknown_unlock and missing_req_item — '
                 'patch skipped';
    return;
  end if;
  if v_do_inc <> v_do_esc then
    raise notice 'PARTIAL PRE-STATE: only one of the two codes is classified (unknown_unlock '
                 'pending=%, missing_req_item pending=%). Patching the missing half only.',
                 v_do_inc, v_do_esc;
  end if;

  -- ── THE ELEMENT SETS BEFORE. Read from the comment-stripped body, so a code
  --    mentioned in prose is not counted as a member.
  select array_agg(btrim(t)) into v_inc_before
    from unnest(string_to_array(split_part(split_part(v_code_old, c_inc_decl, 2), ']', 1), ',')) t
   where btrim(t) <> '';
  select array_agg(btrim(t)) into v_esc_before
    from unnest(string_to_array(split_part(split_part(v_code_old, c_esc_decl, 2), ']', 1), ',')) t
   where btrim(t) <> '';
  if v_inc_before is null or v_esc_before is null then
    raise exception 'could not read the classification arrays out of the live body (c_incident=%, '
                    'c_escalating=%). Refusing to patch a body this file cannot parse.',
                    coalesce(array_length(v_inc_before, 1), -1),
                    coalesce(array_length(v_esc_before, 1), -1);
  end if;

  v_new := v_src;

  if v_do_inc then
    v_hits := (length(v_new) - length(replace(v_new, c_anchor_inc, ''))) / length(c_anchor_inc);
    if v_hits <> 1 then
      raise exception 'ANCHOR DRIFT on c_incident: its closing line matched % times, expected '
                      'exactly 1. Refusing to patch blind — re-apply the migration that last '
                      'authored hr_record_rejection, then this one.', v_hits;
    end if;
    v_new := replace(v_new, c_anchor_inc, c_repl_inc);
  end if;

  if v_do_esc then
    v_hits := (length(v_new) - length(replace(v_new, c_anchor_esc, ''))) / length(c_anchor_esc);
    if v_hits <> 1 then
      raise exception 'ANCHOR DRIFT on c_escalating: its declaration matched % times, expected '
                      'exactly 1. The array has moved on since '
                      '2026-09-03-intent-mismatch-escalates.sql — re-derive the anchor and '
                      're-review rather than overwriting it with a stale copy.', v_hits;
    end if;
    v_new := replace(v_new, c_anchor_esc, c_repl_esc);
  end if;

  -- ── THE ELEMENT SETS AFTER, still comment-stripped. This is the assertion
  --    that a text patch cannot make on its own: a replacement that DROPPED a
  --    sibling (rate_limited, own_listing, intent_mismatch, or any of the 22
  --    incident codes) leaves a body that compiles, installs cleanly and simply
  --    stops alarming. Nothing downstream would report that.
  v_code_new := regexp_replace(v_new, '--[^' || chr(10) || ']*', '', 'g');
  select array_agg(btrim(t)) into v_inc_after
    from unnest(string_to_array(split_part(split_part(v_code_new, c_inc_decl, 2), ']', 1), ',')) t
   where btrim(t) <> '';
  select array_agg(btrim(t)) into v_esc_after
    from unnest(string_to_array(split_part(split_part(v_code_new, c_esc_decl, 2), ']', 1), ',')) t
   where btrim(t) <> '';

  if not (v_inc_before <@ v_inc_after) then
    raise exception 'THE PATCH DROPPED A c_incident CODE. before=% after=% — a classification patch '
                    'that removes a code silently disarms a detector.',
                    array_to_string(v_inc_before, ','), array_to_string(v_inc_after, ',');
  end if;
  if not (v_esc_before <@ v_esc_after) then
    raise exception 'THE PATCH DROPPED A c_escalating CODE. before=% after=%',
                    array_to_string(v_esc_before, ','), array_to_string(v_esc_after, ',');
  end if;
  v_size_ok := array_length(v_inc_after, 1)
                 = array_length(v_inc_before, 1) + (case when v_do_inc then 1 else 0 end)
           and array_length(v_esc_after, 1)
                 = array_length(v_esc_before, 1) + (case when v_do_esc then 1 else 0 end);
  if not v_size_ok then
    raise exception 'THE PATCH CHANGED THE ARRAY SIZES BY THE WRONG AMOUNT: c_incident %->%, '
                    'c_escalating %->% (expected +% and +%).',
                    array_length(v_inc_before, 1), array_length(v_inc_after, 1),
                    array_length(v_esc_before, 1), array_length(v_esc_after, 1),
                    (case when v_do_inc then 1 else 0 end),
                    (case when v_do_esc then 1 else 0 end);
  end if;

  select coalesce(proacl::text, 'NULL'), proowner::regrole::text
    into v_acl_before, v_owner_before
    from pg_proc where oid = c_sig::regprocedure;

  execute v_new;

  select coalesce(proacl::text, 'NULL'), proowner::regrole::text
    into v_acl_after, v_owner_after
    from pg_proc where oid = c_sig::regprocedure;
  if v_acl_after is distinct from v_acl_before then
    raise exception 'ACL MOVED on hr_record_rejection (% -> %) — a body replace must never change '
                    'who may call it. It writes hr_rejections for an ARBITRARY user id.',
                    v_acl_before, v_acl_after;
  end if;
  if v_owner_after is distinct from v_owner_before then
    raise exception 'OWNER MOVED on hr_record_rejection (% -> %) — on a SECURITY DEFINER function '
                    'the owner IS the authority it runs as.', v_owner_before, v_owner_after;
  end if;

  raise notice 'hr_record_rejection: unknown_unlock is now an INCIDENT ON THE FIRST OCCURRENCE '
               '(c_incident %->% codes) and missing_req_item now ESCALATES (c_escalating %->% '
               'codes). ACL and owner unchanged (%).',
               array_length(v_inc_before, 1), array_length(v_inc_after, 1),
               array_length(v_esc_before, 1), array_length(v_esc_after, 1), v_acl_before;
end $do$;


-- ── §2. SELF-VERIFICATION — STRUCTURAL ────────────────────────────────────
do $do$
declare
  c_sig constant text := 'public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)';
  c_inc_decl constant text := 'c_incident constant text[] := array[';
  c_esc_decl constant text := 'c_escalating constant text[] := array[';
  v_src text; v_code text; v_inc text; v_esc text; v_acl aclitem[]; v_missing text;
begin
  v_src  := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');
  -- Comment-stripped, for the reason §1 gives: this file injects comments that
  -- NAME both codes, so a presence check on the raw body would pass on a body
  -- whose arrays never changed.
  v_code := regexp_replace(v_src, '--[^' || chr(10) || ']*', '', 'g');
  v_inc  := split_part(split_part(v_code, c_inc_decl, 2), ']', 1);
  v_esc  := split_part(split_part(v_code, c_esc_decl, 2), ']', 1);
  if v_inc = '' or v_esc = '' then
    raise exception '§2: could not read the classification arrays back out of the installed body';
  end if;

  -- (a) unknown_unlock IS c_incident and IS NOT c_escalating.
  if position('''unknown_unlock''' in v_inc) = 0 then
    raise exception '§2(a): unknown_unlock is not in c_incident after the patch (found: [%])', v_inc;
  end if;
  if position('''unknown_unlock''' in v_esc) > 0 then
    raise exception '§2(a): unknown_unlock reached c_escalating. That classification was considered '
                    'and REJECTED: the counter is per (user, slot, day), so a destroyed catalogue on '
                    'a quiet day would never reach the threshold and the alarm would arrive only if '
                    'the bug happened to be popular. Found: [%]', v_esc;
  end if;

  -- (b) missing_req_item IS c_escalating and IS NOT c_incident.
  if position('''missing_req_item''' in v_esc) = 0 then
    raise exception '§2(b): missing_req_item is not in c_escalating after the patch (found: [%])', v_esc;
  end if;
  if position('''missing_req_item''' in v_inc) > 0 then
    raise exception '§2(b): missing_req_item reached c_incident. That classification was considered '
                    'and REJECTED: the moment dragon_egg exists client-side ahead of server-side, an '
                    'HONEST client produces this refusal by state divergence, and a first-occurrence '
                    'incident would file an abuse record against a player for a content gap of ours. '
                    'Found: [%]', v_inc;
  end if;

  -- (c) THE INCUMBENTS SURVIVED. §1 asserts the element sets across its own
  --     replace; this asserts them against the INSTALLED body, so a later hand
  --     edit between §1 and here cannot pass.
  v_missing := '';
  if position('''rate_limited'''    in v_esc) = 0 then v_missing := v_missing || ' rate_limited'; end if;
  if position('''own_listing'''     in v_esc) = 0 then v_missing := v_missing || ' own_listing'; end if;
  if position('''intent_mismatch''' in v_esc) = 0 then v_missing := v_missing || ' intent_mismatch'; end if;
  if v_missing <> '' then
    raise exception '§2(c): c_escalating lost%. A classification patch that drops a sibling silently '
                    'disarms that detector; nothing downstream reports an alarm that stopped firing.',
                    v_missing;
  end if;
  if position('''gold_clamp''' in v_inc) = 0
     or position('''forbidden_impersonation''' in v_inc) = 0
     or position('''seller_unavailable''' in v_inc) = 0 then
    raise exception '§2(c): c_incident lost one of its bookend codes (gold_clamp / '
                    'seller_unavailable / forbidden_impersonation) — the patch overwrote more than '
                    'the closing element. Installed: [%]', v_inc;
  end if;

  -- (d) THE ACL IS STILL postgres-ONLY. hr_record_rejection writes hr_rejections
  --     for an ARBITRARY user id, so a client grant here is a way to forge
  --     another player's abuse record — and `create or replace` preserves an ACL,
  --     which means a silent one would survive this file untouched.
  if has_function_privilege('anon', c_sig, 'execute')
     or has_function_privilege('authenticated', c_sig, 'execute')
     or has_function_privilege('service_role', c_sig, 'execute') then
    raise exception '§2(d): hr_record_rejection is executable by a client role';
  end if;
  select proacl into v_acl from pg_proc where oid = c_sig::regprocedure;
  if v_acl is null then
    raise exception '§2(d): hr_record_rejection carries the DEFAULT acl (PUBLIC=EXECUTE)';
  end if;
  if exists (select 1 from aclexplode(v_acl) a where a.grantee = 0) then
    raise exception '§2(d): hr_record_rejection still carries a PUBLIC execute grant (acl %)',
                    v_acl::text;
  end if;

  -- (e) SECURITY DEFINER + a pinned search_path survived the replace.
  if (select prosecdef from pg_proc where oid = c_sig::regprocedure) is not true then
    raise exception '§2(e): hr_record_rejection is no longer SECURITY DEFINER';
  end if;
  if not exists (select 1 from pg_proc where oid = c_sig::regprocedure
                  and 'search_path=public' = any (coalesce(proconfig, array[]::text[]))) then
    raise exception '§2(e): hr_record_rejection lost its pinned search_path (proconfig = %)',
                    (select proconfig from pg_proc where oid = c_sig::regprocedure);
  end if;

  raise notice '§2 PASSED: unknown_unlock in c_incident only, missing_req_item in c_escalating only, '
               'every incumbent code intact, ACL postgres-only, SECURITY DEFINER with '
               'search_path=public.';
end $do$;


-- ── §3. AND IT ACTUALLY GRADES THAT WAY — PROVEN, IN A ROLLED-BACK BLOCK ──
-- A classification is a claim about BEHAVIOUR, so execute it rather than read
-- it. Every write below is discarded by the HR6C6 sentinel.
--
-- ⚠ THE CONTROLS ARE THE POINT, and each one exists because the obvious test
--   passes without it:
--
--   · c_escalating (missing_req_item): checking only that n=50 flips to
--     'incident' PASSES IDENTICALLY if the code had been mis-filed into
--     c_incident — where n=1 is already 'incident'. So n=1 must be asserted
--     'normal' as well, and that assertion is the whole difference between the
--     two rulings.
--   · c_incident (unknown_unlock): checking only that n=1 is 'incident' passes
--     identically if EVERY code were graded 'incident' (a broken CASE arm, an
--     always-true predicate). So a control code that is in NEITHER array must
--     stay 'normal' at n=1 AND at an n well past c_escalate_at — the "at any n"
--     half matters, because a control checked only at n=1 would pass if the
--     control code had been slipped into c_escalating.
--   · and the control code is asserted ABSENT from both arrays first, so it
--     cannot quietly become a member and turn the control vacuous.
--   · the threshold itself is READ from the body, never typed: it is a shared
--     constant this file does not own, and a fixture that hard-codes a value it
--     does not own turns its owner's legitimate retune into a failed rebuild.
--     Only a threshold low enough to COLLAPSE the escalating class into the
--     incident class is refused, because that voids the ruling.
do $$
declare
  c_sig constant text := 'public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)';
  -- Synthetic; hr_rejections has no FK to auth.users.
  v_uid constant uuid := '00000000-0000-0000-0000-00000000c6c6';
  -- A REAL hr_companion_grant refusal code that is in NEITHER array. Real, so
  -- the control speaks about the same verb the ruling is about.
  c_ctl constant text := 'not_grantable';
  -- THE THRESHOLD IS READ, NOT TYPED. c_escalate_at is a SHARED constant this
  -- file does not own (rate_limited, own_listing and intent_mismatch are graded
  -- on it too), so pinning the literal 50 here would make a legitimate retune by
  -- its actual owner fail a DISASTER-RECOVERY REBUILD of this migration — a
  -- fixture hard-coding a value it does not own, which is the rule TESTING.md
  -- names after four instances. What this file DOES own is the relationship: one
  -- is normal, one short of the threshold is normal, the threshold is an
  -- incident. Only a threshold so low that the escalating class collapses into
  -- the incident class is refused below, because that voids the ruling.
  v_at bigint;
  v_code text; v_inc text; v_esc text;
  -- ONE VARIABLE PER ARM, deliberately. Reusing a single `v_sev` would make the
  -- seven assertion lines below textually identical, and an assertion that
  -- cannot be named cannot be neutralised ON PURPOSE — which is how the
  -- mutation proof in tests/companion-codes-severity.mjs demonstrates that each
  -- one is load-bearing rather than decorative.
  v_sev_a text; v_sev_b1 text; v_sev_b49 text; v_sev_c text;
  v_sev_d1 text; v_sev_dn text; v_sev_e text;
  v_n bigint;
begin
  v_code := regexp_replace(
              replace(pg_get_functiondef(c_sig::regprocedure), chr(13), ''),
              '--[^' || chr(10) || ']*', '', 'g');
  v_inc := split_part(split_part(v_code, 'c_incident constant text[] := array[', 2), ']', 1);
  v_esc := split_part(split_part(v_code, 'c_escalating constant text[] := array[', 2), ']', 1);
  if position('''' || c_ctl || '''' in v_inc) > 0 or position('''' || c_ctl || '''' in v_esc) > 0 then
    raise exception '§3: the control code % is now IN one of the classification arrays, so the '
                    'control below proves nothing. Pick a code that is in neither, or this gate is '
                    'decoration.', c_ctl;
  end if;

  -- POSIX class, no backslash: '[0-9]' rather than a backslash-d, because the
  -- two runtimes disagree about backslash classes (measured 2026-08-29).
  v_at := nullif(substring(v_code from 'c_escalate_at constant bigint := ([0-9]+)'), '')::bigint;
  if v_at is null then
    raise exception '§3: could not read c_escalate_at out of the body. The escalation threshold is '
                    'READ rather than typed here, so a body it cannot be read from is a body this '
                    'gate cannot honestly grade.';
  end if;
  if v_at < 3 then
    raise exception '§3: c_escalate_at is %, which COLLAPSES the escalating class into the incident '
                    'class — the second occurrence of missing_req_item would already be an '
                    'incident, which is the classification this ruling REJECTED (an honest client '
                    'diverging from the server would be filed as an abuser). The C6 ruling is '
                    'written against a SUSTAINED threshold; it does not survive this value.', v_at;
  end if;

  begin
    delete from public.hr_rejections where user_id = v_uid;

    -- ══ (a) c_incident — THE FIRST OCCURRENCE IS AN INCIDENT ════════════════
    perform public.hr_record_rejection(v_uid, 0, 'companion_grant', 'unknown_unlock', '{}'::jsonb, 1);
    select severity, n into v_sev_a, v_n from public.hr_rejections
     where user_id = v_uid and slot = 0 and day = current_date and code = 'unknown_unlock';
    if v_n is null then
      raise exception '§3(a): hr_record_rejection wrote no row at all for unknown_unlock. Its '
                      'handler swallows every exception, so a broken body is SILENT — which is why '
                      'this is read back rather than assumed.';
    end if;
    if v_n <> 1 then
      raise exception '§3(a): the probe recorded n=% for one call — the fixture is wrong', v_n;
    end if;
    if v_sev_a is distinct from 'incident' then
      raise exception '§3(a): the FIRST unknown_unlock was recorded as "%" — a destroyed unlock '
                      'catalogue must alarm on occurrence one. Every later occurrence is another '
                      'player who has already lost a companion.', v_sev_a;
    end if;

    -- ══ (b) c_escalating — ONE IS NOT AN INCIDENT ═══════════════════════════
    perform public.hr_record_rejection(v_uid, 0, 'companion_grant', 'missing_req_item', '{}'::jsonb, 1);
    select severity, n into v_sev_b1, v_n from public.hr_rejections
     where user_id = v_uid and slot = 0 and day = current_date and code = 'missing_req_item';
    if v_n is distinct from 1 then
      raise exception '§3(b): the probe recorded n=% for one call — the fixture is wrong',
                      coalesce(v_n, -1);
    end if;
    if v_sev_b1 is distinct from 'normal' then
      raise exception '§3(b): ONE missing_req_item was recorded as "%". A single occurrence is a '
                      'stale client holding an item the server cannot see — state divergence, not '
                      'abuse. THIS IS THE ASSERTION THAT DISTINGUISHES THE TWO RULINGS: without it '
                      'a c_incident mis-filing passes every other check in this file.', v_sev_b1;
    end if;

    -- …and it is still 'normal' ONE SHORT of the threshold. Delivered as one
    -- weighted call the way the sampler does (p_count is "how many real events
    -- this call represents"). The step is derived from c_escalate_at, never
    -- typed — see the declaration block.
    perform public.hr_record_rejection(v_uid, 0, 'companion_grant', 'missing_req_item',
                                       '{}'::jsonb, v_at - 2);
    select severity, n into v_sev_b49, v_n from public.hr_rejections
     where user_id = v_uid and slot = 0 and day = current_date and code = 'missing_req_item';
    if v_n <> v_at - 1 then
      raise exception '§3(b): the weighted probe reached n=%, expected % — the fixture cannot test '
                      'the threshold edge', v_n, v_at - 1;
    end if;
    if v_sev_b49 is distinct from 'normal' then
      raise exception '§3(b): missing_req_item escalated at n=% ("%"), one short of the declared '
                      'threshold c_escalate_at=%. The threshold is not where the body says it is.',
                      v_n, v_sev_b49, v_at;
    end if;

    -- ══ (c) …AND AT THE THRESHOLD IT IS AN INCIDENT ═════════════════════════
    perform public.hr_record_rejection(v_uid, 0, 'companion_grant', 'missing_req_item', '{}'::jsonb, 1);
    select severity, n into v_sev_c, v_n from public.hr_rejections
     where user_id = v_uid and slot = 0 and day = current_date and code = 'missing_req_item';
    if v_n <> v_at then
      raise exception '§3(c): the probe reached n=%, expected exactly %', v_n, v_at;
    end if;
    if v_sev_c is distinct from 'incident' then
      raise exception '§3(c): SUSTAINED missing_req_item (n=%) is still "%" — the escalation is not '
                      'wired. % in one day is a signature an honest client cannot produce.',
                      v_n, v_sev_c, v_at;
    end if;

    -- ══ (d) THE CONTROL — A CODE IN NEITHER ARRAY STAYS 'normal' AT ANY n ═══
    perform public.hr_record_rejection(v_uid, 0, 'companion_grant', c_ctl, '{}'::jsonb, 1);
    select severity into v_sev_d1 from public.hr_rejections
     where user_id = v_uid and slot = 0 and day = current_date and code = c_ctl;
    if v_sev_d1 is distinct from 'normal' then
      raise exception '§3(d): the unclassified control code % was recorded as "%" at n=1. The '
                      'classifier is not discriminating — every assertion above would pass on a '
                      'body that graded EVERYTHING an incident.', c_ctl, v_sev_d1;
    end if;
    -- FOUR TIMES the threshold, derived: "at any n" has to mean well past the
    -- only n that could promote it, or the control is a control at n=1 twice.
    perform public.hr_record_rejection(v_uid, 0, 'companion_grant', c_ctl, '{}'::jsonb, v_at * 4);
    select severity, n into v_sev_dn, v_n from public.hr_rejections
     where user_id = v_uid and slot = 0 and day = current_date and code = c_ctl;
    if v_n <= v_at then
      raise exception '§3(d): the control only reached n=% against a threshold of % — it cannot '
                      'test "at any n"', v_n, v_at;
    end if;
    if v_sev_dn is distinct from 'normal' then
      raise exception '§3(d): the unclassified control code % escalated to "%" at n=%. It is in '
                      'NEITHER array, so it must never be promoted — if it can be, the escalation '
                      'assertions above are satisfied by the wrong mechanism.', c_ctl, v_sev_dn, v_n;
    end if;

    -- ══ (e) THE RATCHET STILL ONLY GOES UP ══════════════════════════════════
    perform public.hr_record_rejection(v_uid, 0, 'companion_grant', 'unknown_unlock', '{}'::jsonb, 1);
    select severity into v_sev_e from public.hr_rejections
     where user_id = v_uid and slot = 0 and day = current_date and code = 'unknown_unlock';
    if v_sev_e is distinct from 'incident' then
      raise exception '§3(e): a second unknown_unlock DOWNGRADED the row to "%". Severity ratchets '
                      'up and is never lowered by a later hit.', v_sev_e;
    end if;

    raise exception using errcode = 'HR6C6', message = 'probe complete — rolling back';
  exception
    when sqlstate 'HR6C6' then
      raise notice 'C6 proven against c_escalate_at=%: unknown_unlock 1 -> incident; '
                   'missing_req_item 1 -> normal, % -> normal, % -> incident; the unclassified '
                   'control % stays normal at n=1 and at n=%; the ratchet never downgrades. '
                   'Probe rolled back.', v_at, v_at - 1, v_at, c_ctl, v_at * 4 + 1;
  end;

  if exists (select 1 from public.hr_rejections where user_id = v_uid) then
    raise exception '§3 LEAKED a probe row';
  end if;
end $$;


do $$
begin
  raise notice 'companion-code severity (C6) INSTALLED — unknown_unlock is an INCIDENT on the first '
               'occurrence (a destroyed unlock catalogue, never player behaviour) and '
               'missing_req_item ESCALATES at 50/user/slot/day (a stale client once, a signature '
               'fifty times). ⚠ This file is now the LAST TOUCHER of public.hr_record_rejection '
               'together with 2026-09-03-intent-mismatch-escalates.sql: re-applying '
               '2026-08-11-player-state.sql alone reverts BOTH, silently. The repair, in order: '
               're-apply 2026-09-03-intent-mismatch-escalates.sql, then this file.';
end $$;
