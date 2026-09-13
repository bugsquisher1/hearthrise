-- 2026-09-13-rejections-verb-map-3.sql
--
-- STAGED — REVIEW ONLY, NOT AUTO-APPLIED.
-- The Coordinator applies this by hand (tools/apply-migration.mjs, one file,
-- one txn) AFTER a Security diff. It moves no player row, changes no price, no
-- payout and no verdict, creates no table, no column, no policy and no grant.
-- It is THIRTY-TWO BYTES of behaviour: one new code in hr_record_rejection's
-- c_incident array and one new entry in the code→verb map.
--
-- Ships with: tests/rejections-journal.mjs (arm P20 + the shape_never_incident
--             mutation). No client half, no edge half, no ?v= bump.
--
-- ==========================================================================
-- WHY — CLOSING F3, WHICH THIS LANE FILED AND DID NOT BUILD
-- ==========================================================================
-- 2026-09-13-rejections-verb-map-2.sql added the `whys` breakdown so an operator
-- could tell `bad_buff_item`'s three situations apart — why=forbidden_key (a
-- delta NAMING a buff's magnitude, type or expiry: a forgery an honest client
-- cannot emit), why=not-an-object (a client bug), and no why (an item that
-- simply carries no buff: a Trout, a bronze sword). That is the observability
-- half and it landed.
--
-- The SEVERITY half could not land in a map, and the reason is the shape of the
-- table: `severity` is derived from the CODE, and the aggregate key is
-- (user, slot, day, code). So a forgery that must alarm on occurrence ONE shared
-- its row — and its 'normal' severity — with a player clicking a Trout. Raising
-- severity on the code would have flagged the Trout; not raising it left the
-- forgery silent. That was F3 in .claude/coordination/DISCOVERIES.md, and the
-- fix belonged to the owner of hr_apply rather than to a third patcher of a
-- 36-deep chain.
--
-- They shipped it: 2026-09-13-buff-shape-code.sql raises the forbidden-key arm
-- as its own code, `bad_buff_shape`, leaving the other two arms on
-- `bad_buff_item`. This file is the other half of that split — the CLASSIFICATION
-- — and it is a separate file on purpose: a migration that both invents a code
-- and decides what alarm it rings has nobody reviewing the second decision.
--
-- ── bad_buff_shape -> c_incident (ALARM ON OCCURRENCE ONE) ──────────────────
-- This is the FIRST-OCCURRENCE profile, and the reasoning is the unknown_unlock
-- reasoning rather than the rate_limited one:
--   · NO HONEST CLIENT CAN PRODUCE IT. The only emitter refuses a `buff_apply`
--     object carrying any key other than `item`. No code path in src/** or
--     supabase/functions/** builds that shape — there is no buff_apply emitter
--     at all yet — so one occurrence is a hand-built request, not a stale tab, a
--     retry, or a client shipped ahead of the server.
--   · THE ATTEMPT IS THE EVENT. What it attempts is to author a buff's MAGNITUDE
--     and EXPIRY from the client, i.e. the single thing the whole buff program
--     exists to make impossible. The coupling and segment rules refuse it, so
--     nothing is lost on call one — but "somebody is hand-building buff deltas"
--     is worth knowing the morning it starts, not on the fiftieth try.
--   · A THRESHOLD WOULD NOT FIRE. c_escalate_at counts PER (user, slot, day). A
--     prober who sends five forged shapes, learns they are refused, and moves on
--     never reaches fifty — which is exactly the behaviour an escalating code is
--     blind to, and the same argument that put unknown_unlock in c_incident.
--   · IT IS NOT A NOISY DETECTOR. The steady state is ZERO: the honest arms kept
--     `bad_buff_item`, so a player eating a Trout cannot reach this code. That
--     is the property that makes a first-occurrence alarm readable, and §5(d)
--     asserts the split from BOTH sides rather than trusting it.
-- ⚠ NOT c_escalating, and not BOTH. Severity is `incident` if the code is in
--   c_incident, so adding it to both lists would be dead text implying a
--   threshold that never runs; §5(c) asserts its ABSENCE from c_escalating so the
--   ruling cannot be read two ways later.
--
-- ── bad_buff_shape -> buff_apply in the code→verb map ───────────────────────
-- Same argument as the rest of the buff family in verb-map-2: the code is
-- reachable only through the `buff_apply` delta key, and hr_apply labels a delta
-- with no `journal.intent` as 'apply' — the RPC's name, not the gesture. The map
-- is FALLBACK-ONLY (it fires only on 'apply' / '(none)'), so a real label still
-- wins; §5(b) asserts both directions and the single-emitter domain rule.
--
-- ==========================================================================
-- PATCHED, NOT RESTATED — AND WHY THAT IS THE RIGHT WAY ROUND THIS TIME
-- ==========================================================================
-- 2026-09-13-rejections-verb-map-2.sql RESTATED hr_record_rejection and took its
-- patch chain to ZERO (tests/patch-chain-guard.mjs --report). This file adds ONE
-- anchored, exactly-once edit, which leaves it at depth 1 — BELOW the audit's
-- floor of 2, so no RESTATEMENT-DEBT-ACK is needed and the next toucher still
-- has a budget before a restatement is owed.
--
-- Restating again was considered and rejected for a reason about REVIEW, not
-- about effort: the body carries a 120-line severity catalogue of five Security
-- rulings, and copying all of it to add two tokens produces a 400-line diff in
-- which the two load-bearing lines are invisible. This file's diff on that body
-- is the two lines. The protection restating bought is KEPT rather than dropped:
-- §0 still reads the installed arrays into a session GUC and §5(a) still fails
-- the apply unless both catalogues are a strict superset afterwards, so a patch
-- that corrupted the array aborts the transaction exactly as a bad restatement
-- would.
--
-- hr_rejection_verb_for IS restated in full — it has no chain (verb-map-2 is its
-- only author), it is twenty lines, and the map it holds should be readable in
-- one file rather than assembled from a patch. That is the division this tree
-- should use generally: restate the small owned thing, patch the big shared one.
--
-- ==========================================================================
-- ORDER, AND WHAT HAPPENS IF IT IS WRONG
-- ==========================================================================
-- AFTER 2026-09-13-buff-shape-code.sql, and §0 FAILS CLOSED without it. A
-- severity ruling on a code that nothing emits is not harmless-but-inert: it is
-- a rule that LOOKS enforced, passes every static read, and alarms on nothing,
-- and the only moment anyone would notice is the incident it was supposed to
-- catch. Requiring the emitter makes the dependency executable instead of
-- written down.
-- ⚠ REVERSIBILITY — AND THE THING THAT MEASUREMENT CORRECTED. The obvious
-- reversal, "re-apply 2026-09-13-rejections-verb-map-2.sql", DOES NOT WORK, and
-- the first run of tests/rejections-journal.mjs after this file landed is how
-- that was found rather than assumed:
--     GATE(a): the restated c_incident DROPPED bad_buff_shape
-- verb-map-2 RESTATES the recorder from its own text, so re-running it would
-- silently revert this ruling — and its own §5(a) superset guard refuses,
-- aborting the transaction and changing nothing. That refusal is the guard
-- WORKING (it is the b484-b487 protection), and it is now asserted from both
-- sides by P8: the LAST toucher of the body re-applies as a byte-identical
-- no-op, an EARLIER restatement fails loudly and moves nothing.
-- THE GENERAL LESSON, worth more than this file: A RESTATEMENT IS ONLY
-- RE-APPLIABLE UNTIL THE NEXT MIGRATION ADDS TO THE BODY. The chain guard's rule
-- ("restate rather than patch a deep chain") buys a readable body and costs the
-- ability to re-run that file as a repair step; both are true and the trade is
-- still right, but the repair file is the LAST toucher, not the restater.
-- SO THE REAL REVERSAL of this file is either (a) re-apply verb-map-2 and THEN
-- verb-map-3 in that order, which restores today's state rather than reversing
-- it, or (b) a new one-anchor migration that removes the entry — which is what
-- an actual revocation of a Security ruling should look like anyway: its own
-- file, with its own review. Nothing here destroys data: an existing
-- hr_rejections row keeps its severity, because severity only ever ratchets UP,
-- so a reversal changes what FUTURE refusals are classified as and nothing else.
-- AFTER APPLY: hr_record_rejection and (newly) hr_rejection_verb_for are
-- live-hash-tracked — re-seed with `node tests/live-hash-drift.mjs --live --write`
-- and write the whys from --codediff.

-- ========================================================================
-- 0.  PRECONDITIONS — fail closed, and capture the catalogues BEFORE patching
-- ========================================================================
do $$
declare
  v_src text;
  v_inc text;
  v_esc text;
begin
  if to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null
     or to_regprocedure('public.hr_rejection_verb_for(text,text)') is null
     or to_regprocedure('public.hr_rejection_why(jsonb)') is null then
    raise exception 'hr_record_rejection / hr_rejection_verb_for / hr_rejection_why missing — apply '
                    '2026-09-13-rejections-verb-map-2.sql first; this file classifies a code inside '
                    'the body that file restated';
  end if;
  -- THE EMITTER. See the order note: a classification with no emitter is a rule
  -- that looks enforced and alarms on nothing.
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null then
    raise exception 'hr_apply is absent — this file classifies one of its refusal codes';
  end if;
  if position('bad_buff_shape' in replace(pg_get_functiondef(
       'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '')) = 0 then
    raise exception 'the installed hr_apply does not raise bad_buff_shape — apply '
                    '2026-09-13-buff-shape-code.sql FIRST. Classifying a code nothing emits produces '
                    'a rule that passes every static read and alarms on nothing, and the only moment '
                    'anyone finds out is the incident it was meant to catch.';
  end if;

  v_src := replace(pg_get_functiondef(
             'public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)'::regprocedure), chr(13), '');
  v_inc := substring(v_src from 'c_incident constant text\[\] := array\[([^\]]*)\]');
  v_esc := substring(v_src from 'c_escalating constant text\[\] := array\[([^\]]*)\]');
  if v_inc is null or v_esc is null then
    raise exception 'could not read c_incident / c_escalating out of the installed '
                    'hr_record_rejection — this file edits one of them and CANNOT prove it preserved '
                    'the other four rulings without them. Refusing to patch blind.';
  end if;
  perform set_config('hearthrise.rvm3_incident_before', v_inc, false);
  perform set_config('hearthrise.rvm3_escalating_before', v_esc, false);
end $$;

-- ========================================================================
-- 1.  THE CODE→VERB MAP, RESTATED IN FULL (no chain; see the header)
-- ========================================================================
-- Identical to 2026-09-13-rejections-verb-map-2.sql §2 plus one line. The
-- comments there are the contract and are carried forward verbatim, because this
-- file is now the last toucher and the next reader will read THIS text.
--
-- THE RULE IS FALLBACK-ONLY, AND THAT IS THE LOAD-BEARING PART. An override
-- would be a regression: `no_character` is answered by a dozen verbs and
-- `forbidden_field` would lose nothing today but would lose everything the day a
-- second verb grows a deny-list. So the map fires only when the caller's label
-- is one of the two UNATTRIBUTABLE ones — '(none)' (no label at all) and 'apply'
-- (hr_apply's own fallback). A real verb always wins.
--
-- THE MAP IS A LIST, WHICH IS A LIABILITY, SO IT IS SHORT AND EVERY ENTRY PAYS:
--   bad_buff_item / bad_buff_shape / buff_at_max / buff_not_paid -> buff_apply
--       All four are raised ONLY inside hr_apply's `buff_apply` block (measured
--       from the installed body), so the code implies the gesture with no
--       ambiguity whatsoever.
--   bad_zone       ->  hr_town_of     (the only emitter; belt-and-braces, since
--                                      the wrapper already supplies the label)
--   forbidden_field->  hr_put_client_state   (likewise — the only deny-list)
-- A code reachable from two verbs must NEVER be added here. §5(b) asserts the
-- map's domain against that rule by executing a single-emitter count.
create or replace function public.hr_rejection_verb_for(p_code text, p_intent text)
returns text language sql immutable set search_path = public, pg_catalog as $$
  select case
    when v in ('(none)', 'apply') then coalesce(
      case lower(coalesce(p_code, ''))
        when 'bad_buff_item'   then 'buff_apply'
        when 'bad_buff_shape'  then 'buff_apply'
        when 'buff_at_max'     then 'buff_apply'
        when 'buff_not_paid'   then 'buff_apply'
        when 'bad_zone'        then 'hr_town_of'
        when 'forbidden_field' then 'hr_put_client_state'
        else null
      end, v)
    else v
  end
  from (select public.hr_rejection_verb(p_intent) as v) q
$$;
revoke execute on function public.hr_rejection_verb_for(text, text)
  from public, anon, authenticated, service_role;

-- ========================================================================
-- 2.  c_incident — ONE ANCHORED, EXACTLY-ONCE EDIT (chain 0 -> 1)
-- ========================================================================
-- The anchor is the array TERMINATOR as 2026-09-13-rejections-verb-map-2.sql
-- wrote it — four spaces, the last entry, `];`. It is not a string some earlier
-- patcher happened to leave behind (the chain is zero deep), it is asserted to
-- match exactly once, and the block is re-entrant: a second apply sees the code
-- already present and skips.
do $$
declare
  v_src  text;
  c_anc  constant text := '    ''unknown_unlock''];';
  v_hits int;
begin
  v_src := replace(pg_get_functiondef(
             'public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)'::regprocedure), chr(13), '');
  if position('bad_buff_shape' in v_src) > 0 then
    raise notice 'rejections-verb-map-3: hr_record_rejection already classifies bad_buff_shape — '
                 'skipping (re-apply)';
    return;
  end if;
  v_hits := (length(v_src) - length(replace(v_src, c_anc, ''))) / length(c_anc);
  if v_hits <> 1 then
    raise exception 'rejections-verb-map-3: the c_incident terminator anchor matched % times (need '
                    'exactly 1) — hr_record_rejection has been re-authored and this file must be '
                    're-read, not applied blind. Anchor: %', v_hits, c_anc;
  end if;

  v_src := replace(v_src, c_anc,
    '    ''unknown_unlock'',' || chr(10)
    || '    -- bad_buff_shape (2026-09-13, Security, closing F3 of the refusal-journal lane).' || chr(10)
    || '    -- hr_apply raises this ONLY for a buff_apply object carrying a key other than' || chr(10)
    || '    -- `item` - i.e. a delta that NAMES a buff''s magnitude, type or expiry, which is' || chr(10)
    || '    -- the one thing the whole buff program exists to make impossible. No code path in' || chr(10)
    || '    -- src/** or supabase/functions/** builds that shape (there is no buff_apply' || chr(10)
    || '    -- emitter at all yet), so ONE occurrence is a hand-built request and not a stale' || chr(10)
    || '    -- tab, a retry, or a client shipped ahead of the server. FIRST-OCCURRENCE, the' || chr(10)
    || '    -- unknown_unlock profile and NOT the rate_limited one: the counter is per (user,' || chr(10)
    || '    -- slot, day), so a prober who sends five forged shapes and moves on never reaches' || chr(10)
    || '    -- fifty - exactly what a threshold is blind to. It is a readable alarm because the' || chr(10)
    || '    -- steady state is ZERO: 2026-09-13-buff-shape-code.sql left the two HONEST arms' || chr(10)
    || '    -- (not-an-object, and an item that simply carries no buff) on bad_buff_item, so a' || chr(10)
    || '    -- player eating a Trout cannot reach this code.' || chr(10)
    || '    ''bad_buff_shape''];');

  execute v_src;
  raise notice 'rejections-verb-map-3: hr_record_rejection patched — bad_buff_shape is an INCIDENT on '
               'its first occurrence';
end $$;
-- create-or-replace preserves an ACL; re-state it anyway. This function writes
-- hr_rejections for an ARBITRARY user id, so a client grant is a way to forge
-- another player's abuse record.
revoke execute on function public.hr_record_rejection(uuid, int, text, text, jsonb, bigint)
  from public, anon, authenticated, service_role;

-- ========================================================================
-- 3.  SELF-VERIFYING COMMIT GATE (CLAUDE.md §4)
-- ========================================================================
-- Properties proven by EXECUTING SQL. The apply is atomic, so a raise here
-- reverts §1–§2. The row-writing probe lives in a subtransaction discarded by a
-- sentinel raise (HR814), so this block is net-zero on production — asserted
-- after the rollback.
do $$
declare
  v_src        text;
  v_missing    text;
  v_bad        text;
  v_inc        text;
  v_esc        text;
  v_row        record;
  v_n          int;
  v_uid   constant uuid := '000000ce-0000-0000-0000-0000000000c1';
  v_other constant uuid := '000000ce-0000-0000-0000-0000000000c2';
begin
  v_src := replace(pg_get_functiondef(
             'public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)'::regprocedure), chr(13), '');
  v_inc := substring(v_src from 'c_incident constant text\[\] := array\[([^\]]*)\]');
  v_esc := substring(v_src from 'c_escalating constant text\[\] := array\[([^\]]*)\]');

  -- ── (a) THE PATCH IS PURELY ADDITIVE TO BOTH CATALOGUES ────────────────
  -- Same guarantee the restatement in verb-map-2 had to prove, kept here so that
  -- "a patch is safer than a restatement" is not an argument but a checked fact.
  -- Five Security rulings live in these two arrays; a regex that ate one would
  -- abort the transaction.
  if coalesce(current_setting('hearthrise.rvm3_incident_before', true), '') = ''
     or coalesce(current_setting('hearthrise.rvm3_escalating_before', true), '') = '' then
    raise exception 'GATE(a): §0 did not capture the severity catalogues — this file EDITS one of them '
                    'and cannot prove it preserved the rest, so it refuses to claim it';
  end if;
  select string_agg(c, ', ' order by c) into v_missing from (
    select m[1] as c from regexp_matches(
      current_setting('hearthrise.rvm3_incident_before', true), '''([a-z0-9_]+)''', 'g') m
     except
    select m[1] from regexp_matches(v_inc, '''([a-z0-9_]+)''', 'g') m) q;
  if v_missing is not null then
    raise exception 'GATE(a): the patched c_incident DROPPED % — each of those is a Security ruling '
                    '(the b484-b487 class on the severity catalogue)', v_missing;
  end if;
  select string_agg(c, ', ' order by c) into v_missing from (
    select m[1] as c from regexp_matches(
      current_setting('hearthrise.rvm3_escalating_before', true), '''([a-z0-9_]+)''', 'g') m
     except
    select m[1] from regexp_matches(v_esc, '''([a-z0-9_]+)''', 'g') m) q;
  if v_missing is not null then
    raise exception 'GATE(a): the patched c_escalating DROPPED %', v_missing;
  end if;
  -- ...and the body kept every property verb-map-2 installed. A regex on a
  -- 120-line body is only acceptable with this check behind it.
  for v_bad in select unnest(array['hearthrise.rejection_noted', 'hr_detail_bound',
                                   'hr_rejection_verb_for', 'hr_rejection_why', 'c_escalate_at']) loop
    if position(v_bad in v_src) = 0 then
      raise exception 'GATE(a): the patched recorder LOST % — the edit was not the one-line insertion '
                      'it claims to be', v_bad;
    end if;
  end loop;

  -- ── (b) THE RULING, READ OFF THE INSTALLED BODY, BOTH DIRECTIONS ───────
  if position('''bad_buff_shape''' in v_inc) = 0 then
    raise exception 'GATE(b): bad_buff_shape is not in c_incident after the patch — the whole point of '
                    'this file';
  end if;
  if position('''bad_buff_shape''' in v_esc) > 0 then
    raise exception 'GATE(b): bad_buff_shape reached c_escalating as well. Severity is ''incident'' the '
                    'moment the code is in c_incident, so the threshold would be dead text implying a '
                    'rule that never runs, and the ruling could be read two ways later.';
  end if;
  -- The honest arms must NOT have followed it. This is the property that makes a
  -- first-occurrence alarm readable instead of noise, and it is owned by another
  -- file, so it is measured rather than assumed.
  if position('''bad_buff_item''' in v_inc) > 0 or position('''bad_buff_item''' in v_esc) > 0 then
    raise exception 'GATE(b): bad_buff_item acquired a severity too — a player who ate a Trout now '
                    'raises the same alarm as a forged delta, which is the defect the split fixed';
  end if;
  -- The map: fallback-only, and the new entry resolves.
  if public.hr_rejection_verb_for('bad_buff_shape', 'apply') <> 'buff_apply'
     or public.hr_rejection_verb_for('bad_buff_shape', null) <> 'buff_apply' then
    raise exception 'GATE(b): bad_buff_shape under an unattributable label did not resolve to '
                    'buff_apply (got %)', public.hr_rejection_verb_for('bad_buff_shape', 'apply');
  end if;
  if public.hr_rejection_verb_for('bad_buff_shape', 'eat:roast_pie') <> 'eat:roast_pie'
     or public.hr_rejection_verb_for('no_character', 'apply') <> 'apply'
     or public.hr_rejection_verb_for('bad_zone', 'hr_town_of') <> 'hr_town_of' then
    raise exception 'GATE(b): the restated map OVERRODE a real label or invented a verb — it must be '
                    'fallback-only, or it destroys the resolution the verbs column was added for';
  end if;
  -- THE DOMAIN RULE, executed: every mapped code must be emitted by exactly ONE
  -- body. The journal's own machinery is excluded by name (the recorder carries
  -- these codes in its arrays and the resolver carries them as map keys).
  select string_agg(x.code || '=' || x.n::text, ', ' order by x.code) into v_bad
    from (select c as code, (select count(*) from pg_proc p join pg_namespace ns
                              on ns.oid = p.pronamespace
                             where ns.nspname = 'public' and p.prokind = 'f'
                               and p.proname not in ('hr_record_rejection', 'hr_rejection_verb_for')
                               and p.prosrc like '%''' || c || '''%') as n
            from unnest(array['bad_buff_item','bad_buff_shape','buff_at_max','buff_not_paid',
                              'bad_zone','forbidden_field']) c) x
   where x.n <> 1;
  if v_bad is not null then
    raise exception 'GATE(b): a mapped code does not have exactly ONE emitting body (%) — a code->verb '
                    'fallback is only sound while the code has one emitter', v_bad;
  end if;

  -- ── (c) NOTHING HERE IS CLIENT-REACHABLE ───────────────────────────────
  for v_bad in select unnest(array[
      'public.hr_record_rejection(uuid,integer,text,text,jsonb,bigint)',
      'public.hr_rejection_verb_for(text,text)']) loop
    select string_agg(r, ',') into v_missing
      from unnest(array['anon', 'authenticated', 'service_role', 'hr_engine']) r
     where has_function_privilege(r, v_bad, 'execute');
    if v_missing is not null then
      raise exception 'GATE(c): % is executable by % — a recorder a client can call is a recorder a '
                      'client can point at a victim', v_bad, v_missing;
    end if;
    if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                where p.oid = to_regprocedure(v_bad)
                  and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'GATE(c): PUBLIC holds EXECUTE on %', v_bad; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_rejections') then
    raise exception 'GATE(c): a policy appeared on hr_rejections — the journal is ops-only by design';
  end if;

  -- ── (d) EXECUTED: ONE REFUSAL, INCIDENT ON CALL ONE, VERB buff_apply ───
  begin
    insert into auth.users (id) values (v_uid), (v_other) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_uid, 'ShapeOne'), (v_other, 'ShapeTwo')
      on conflict (id) do update set display_name = excluded.display_name;

    perform set_config('hearthrise.rejection_noted', '', true);
    perform public.hr_record_rejection(v_uid, 0, 'apply', 'bad_buff_shape',
      jsonb_build_object('why', 'forbidden_key',
                         'keys', jsonb_build_array('magnitude', 'until')), 1);
    select * into v_row from public.hr_rejections
     where user_id = v_uid and code = 'bad_buff_shape';
    if not found then
      raise exception 'GATE(d): a bad_buff_shape refusal journalled NOTHING';
    end if;
    if v_row.n <> 1 then
      raise exception 'GATE(d): one refusal counted %', v_row.n; end if;
    if v_row.severity <> 'incident' then
      raise exception 'GATE(d): the FIRST bad_buff_shape is severity % — a hand-built buff delta is the '
                      'one thing the buff program exists to make impossible, and a prober who sends '
                      'five and moves on never reaches the escalation threshold', v_row.severity;
    end if;
    if not (v_row.verbs ? 'buff_apply') then
      raise exception 'GATE(d): the row names % instead of the gesture — hr_apply''s "apply" label is '
                      'the RPC, not what the caller did', v_row.verbs;
    end if;
    if coalesce((v_row.whys ->> 'forbidden_key')::bigint, 0) <> 1 then
      raise exception 'GATE(d): the whys breakdown reads % — bad_buff_shape keeps why=forbidden_key for '
                      'continuity with the code it split from', v_row.whys;
    end if;
    -- THE CONTROL, and the reason a first-occurrence alarm is readable here: the
    -- HONEST sibling must still be ordinary on its first hit. If this ever goes
    -- red, the split collapsed and every Trout is an incident.
    perform set_config('hearthrise.rejection_noted', '', true);
    perform public.hr_record_rejection(v_uid, 0, 'apply', 'bad_buff_item',
      jsonb_build_object('item', 'trout'), 1);
    select * into v_row from public.hr_rejections
     where user_id = v_uid and code = 'bad_buff_item';
    if v_row.severity <> 'normal' then
      raise exception 'GATE(d): eating an item that carries no buff is severity % — the honest arm '
                      'followed the forgery into c_incident and the alarm is now noise', v_row.severity;
    end if;
    if not (v_row.verbs ? 'buff_apply') then
      raise exception 'GATE(d): the bad_buff_item row lost its gesture (%)', v_row.verbs; end if;
    -- two codes, two rows: the split is real in the table, not only in the array
    select count(*) into v_n from public.hr_rejections where user_id = v_uid;
    if v_n <> 2 then
      raise exception 'GATE(d): the two codes produced % row(s) — they must NOT share an aggregate, '
                      'which is the entire reason the code was split', v_n;
    end if;
    if exists (select 1 from public.hr_rejections where user_id = v_other) then
      raise exception 'GATE(d): one account''s refusals were filed against another';
    end if;

    raise exception using errcode = 'HR814',
      message = 'rejections-verb-map-3 §3 complete — rolling back the probes';
  exception when sqlstate 'HR814' then null;
  end;

  if exists (select 1 from public.hr_rejections where user_id in (v_uid, v_other))
     or exists (select 1 from public.profiles where id in (v_uid, v_other))
     or exists (select 1 from auth.users where id in (v_uid, v_other)) then
    raise exception 'GATE: §3 LEAKED a probe row';
  end if;

  raise notice 'rejections-verb-map-3: bad_buff_shape is in c_incident and absent from c_escalating, '
               'both catalogues are a strict superset of the installed ones, the recorder kept the '
               'once-flag / detail bound / both resolvers, the code->verb map resolves it to '
               'buff_apply under an unattributable label while a real label still wins and every '
               'mapped code has exactly one emitter, nothing is client-reachable and no policy '
               'appeared, and EXECUTED: the FIRST bad_buff_shape is an INCIDENT naming buff_apply with '
               'why=forbidden_key while the honest bad_buff_item sibling stays NORMAL in its own row, '
               'no other account was touched and no probe row survived — all green';
end $$;
