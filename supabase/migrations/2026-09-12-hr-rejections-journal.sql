-- 2026-09-12-hr-rejections-journal.sql
--
-- STAGED - REVIEW ONLY, NOT AUTO-APPLIED.
-- The Coordinator applies this by hand (tools/apply-migration.mjs, one file,
-- one txn) AFTER a Security GO. It moves no player row, changes no price, no
-- payout and no verdict: every edit it makes to a live body wraps an ALREADY
-- COMPUTED refusal envelope in a pass-through recorder and returns it
-- unchanged. It is an OBSERVABILITY change on a security surface, which is
-- exactly the combination that has to be reviewed rather than assumed.
--
-- Ships with: tests/rejections-journal.mjs (PGlite chain replay + mutations)
--             tools/vitals.mjs  (the `refused` column, and --refusals)
--
-- RESTATEMENT-DEBT-ACK: this file adds anchored patches to hr_farm_plant (chain
--   4 deep) and hr_worker_hire (2 deep), and it does NOT restate either body.
--   The rule patch-chain-guard enforces exists because a new anchor normally
--   depends on the string the PREVIOUS patcher happened to leave behind, and
--   such an anchor eventually matches nothing and no-ops in silence. Neither
--   condition holds here, and both halves are ASSERTED rather than argued:
--     (1) THE ANCHORS ARE SHAPE-UNIVERSAL, NOT HISTORICAL. They are
--         `return jsonb_build_object('ok', false, ...);` and the intent_mismatch
--         early return - the plpgsql the ORIGINAL author wrote, present in every
--         one of these bodies since birth, not text a patcher introduced.
--     (2) A SILENT NO-OP IS IMPOSSIBLE. Section 7 refuses to install a body
--         unless the sweep left ZERO undecorated refusal sites, the patched text
--         is the original plus exactly N insertions of known length, and the SET
--         of error codes the body can emit is byte-identical before and after.
--         Section 8(j) then re-reads the installed bodies and raises on any
--         survivor. A patch that matched nothing fails the file.
--   RESTATING INSTEAD WOULD BE THE WORSE TRADE. hr_farm_plant is a 12-refusal-
--   site farming body; copying it into an observability migration makes this
--   file the last toucher of farming and silently reverts whatever
--   2026-08-22-server-farming-complete.sql learns next - the data double-copy
--   this codebase is organised against (src/main.js:36-50). The debt is real and
--   it belongs to cleanup slice 7, which should restate these seven bodies ONCE,
--   in their own files, with the seam included.
--
-- ==========================================================================
-- WHAT IS ALREADY TRUE, MEASURED, BEFORE THIS FILE - READ THIS FIRST
-- ==========================================================================
-- The brief for this lane said "refusals with a reason are not journalled yet".
-- That is HALF true and the half that is false matters, so it is written down
-- here rather than rediscovered by the next person:
--
--   public.hr_rejections HAS EXISTED SINCE 2026-08-11-player-state.sql (6b-ii).
--   Measured on nezapsylztqbbwuwembx 2026-09-11: 163 rows, 790 occurrences,
--   2026-08-11 .. 2026-09-11, fourteen distinct codes. version_conflict alone
--   is 68 rows / 315 occurrences. RLS on, zero policies, zero client grants,
--   pruned nightly by hr-rejections-prune (35 4 * * *).
--
-- So the journal exists and the writer seam - hr_record_rejection - exists. The
-- board item is real anyway, for THREE separate measured reasons:
--
--   D1. THE VERB IS ERASED. The aggregate key is (user_id, slot, day, code) and
--       `intent` is a last-writer-wins column. Paione's row for 2026-09-11 reads
--           version_conflict | intent='accrue' | n=10 | 07:19 -> 17:34
--       He also reported needing 4-8 taps to equip a staff that afternoon and
--       stop-combat snapping back into the fight. Those refusals are IN that
--       n=10 - and they are unreadable, because `equip:weapon` and
--       `set_activity:combat` collapse into the same row as `accrue` and the
--       last one to arrive overwrites the label. The count survived; the
--       question "which verb is being refused" did not.
--
--   D2. MOST REFUSALS NEVER REACH THE SEAM AT ALL. Measured by asking the
--       database (pg_get_functiondef, 2026-09-11): 137 SECURITY DEFINER
--       functions in `public` return an `'ok', false` envelope; the ones that
--       call hr_record_rejection are hr_apply, the market verbs, and about ten
--       others. Every gated wrapper's DOMAIN refusal - i.e. everything the inner
--       body decides - is invisible, and so is every refusal from the seven
--       self-gating player verbs:
--           hr_farm_plant (12 refusal sites, 0 records), hr_farm_water (9/0),
--           hr_farm_harvest (7/0), hr_farm_upgrade_plot (8/0),
--           hr_bank_move (11/0), hr_worker_hire (4/0), hr_worker_assign (8/0).
--       Farming sat at zero from 2026-08-27 to 2026-09-06 and nobody could see
--       it. Those are the exact seven bodies whose refusals were unobservable.
--
--   D3. NOTHING READS IT. tools/vitals.mjs's `refused` column reads
--       player_intents with `result->>'ok' <> 'true'`, and player_intents holds
--       955 rows of which ZERO are non-ok (measured 2026-09-11) because every
--       refusal returns BEFORE the intent row is claimed. The column is
--       structurally always 0. A control nobody can observe firing is not a
--       control - the same sentence 2026-08-11-player-state.sql wrote when it
--       created this table.
--
-- ==========================================================================
-- WHAT THIS FILE DOES NOT DO, AND WHY
-- ==========================================================================
-- IT DOES NOT ADD A ROW-PER-REJECTION TABLE. The brief asked for one. The
-- existing table's own header refuses it, in this codebase's most expensive
-- lesson: game_events reached 1.6M rows / 229 MB from SIX players in four days
-- by logging every event. `version_conflict` is a NORMAL outcome of optimistic
-- concurrency - two tabs, a retry, a slow network - and at 240 applies/min/
-- player a row per refusal rebuilds game_events inside the security table. The
-- aggregate stays. What this file adds is the RESOLUTION the aggregate was
-- missing, at ZERO extra rows: a bounded `verbs` map inside the row that
-- already exists (D1), plus the coverage that was never there (D2), plus a
-- reader (D3).
--
--   Rows at 100x players, worst case, with this change: unchanged.
--     players x slots x days x codes. 600 players x 3 slots x ~14 codes x 365
--     = 9.2M rows/YEAR if every player trips every code on every character
--     every day; realistically three orders of magnitude less (today: 163 rows
--     from a month of six players). Pruned at 180 days. The verbs map adds at
--     most 25 keys x ~32 bytes = under 1 KB per row and CANNOT add a row.
--   Writes: at most ONE per client request (S5 below), where today an RPC whose
--     inner body records and whose wrapper also records would write twice.
--
-- IT DOES NOT ADD A CLIENT-READABLE SURFACE. The brief asked for "a player may
-- read their own rows". Declined, and the reasoning is recorded rather than
-- silently dropped: the player already receives the refusal, by machine code,
-- in the envelope of the call they just made - that is the product surface. The
-- consumer of the JOURNAL is ops (vitals, incident review), which reads through
-- the management endpoint as postgres. Granting `authenticated` a read on the
-- table the anomaly detector writes buys a player nothing and hands an attacker
-- a live view of which of their probes are being recorded and at what severity.
-- hr_rejections therefore stays RLS-on / zero-policy / zero-grant, and this file
-- ASSERTS that rather than trusting it.
--
-- IT CHANGES NO EDGE FUNCTION AND NEEDS NO CLIENT HALF. The refusal shapes
-- (`{ok:false, error:<code>}`) are untouched; hr_note_rejection returns its
-- argument. supabase/functions/** does not move; no ?v= bump is required for
-- this file.
--
-- ==========================================================================
-- THE SHAPE - ONE SEAM, TWO MECHANICAL FAMILIES
-- ==========================================================================
--   S1  hr_rejection_verb(text) -> a BOUNDED verb token. First two colon
--       segments, lowercased, character-filtered, 24 chars each. So
--       'set_activity:combat:goblin' -> 'set_activity:combat' and
--       'unlock_buy:farm_land.2:2'  -> 'unlock_buy:farm_land.2'.
--   S2  hr_verb_bump(jsonb, verb, weight, cap) -> the same map with the verb
--       incremented, or with '(other)' incremented once the map is full. The
--       map can never exceed cap+1 keys REGARDLESS of what the caller passes,
--       which is what makes S1's output safe to key on even though part of it
--       can originate in a client string.
--   S3  hr_detail_bound(jsonb) -> the detail, or {"truncated":true} past 1000
--       characters. last_detail had no size bound at all.
--   S4  hr_record_rejection is PATCHED (three anchors, no restatement) to
--       maintain `verbs` and to bound `last_detail`. Patched rather than
--       restated so that the incident/escalating catalogues stay in ONE file -
--       copying them here is the data double-copy this codebase is organised
--       against (src/main.js:36-50), and it would silently revert whatever
--       player-state.sql learns next.
--   S5  hr_note_rejection(verb, slot, result) is the DECORATOR and the single
--       new writer path: if `result.ok` is false and auth.uid() is known and
--       nothing has been recorded in THIS transaction yet, record it. Then
--       return `result` unchanged, always, including on its own failure. One
--       client request is one transaction, so "at most one record per request"
--       is the rate bound, enforced at the root instead of by a counter.
--   S6  Every GATED WRAPPER (a function with a `__ungated` twin, discovered by
--       shape, 49 live today) gets its single `return public.X__ungated(...)`
--       wrapped in the decorator. Their `rate_limited` return is left alone -
--       hr_rpc_gate already records it, and S5's per-transaction rule keeps the
--       two from double-counting.
--   S7  The seven self-gating player verbs get every literal refusal return -
--       and the intent_mismatch early return - wrapped in the decorator, by
--       regex, with an assertion that ZERO unpatched refusal sites remain and
--       that the SET OF ERROR CODES the body can emit is byte-identical before
--       and after. That last assertion is what makes a regex acceptable on a
--       body that moves gold.
--
-- ==========================================================================
-- THE FOOTGUN, NAMED (b484-b487 class)
-- ==========================================================================
-- This file is a PATCHER of 56 bodies it does not own. A later migration that
-- restates any of them from a template silently deletes the seam. The pin is
-- NOT this comment: tests/rejections-journal.mjs replays the WHOLE chain (no
-- upTo) and fails the build if any gated wrapper or any of the seven reaches
-- CHAIN END without the seam. Re-applying this file after such a migration is
-- safe and is the fix - it is idempotent (it skips a body that already carries
-- the seam, and discovers wrappers that did not exist when it was written only
-- on a re-run, which is precisely why the guard replays at chain end).
-- ==========================================================================

-- ========================================================================
-- 0.  PRECONDITIONS - fail closed
-- ========================================================================
do $$
begin
  if to_regclass('public.hr_rejections') is null then
    raise exception 'hr_rejections is absent - apply 2026-08-11-player-state.sql first';
  end if;
  if to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 'hr_record_rejection(uuid,int,text,text,jsonb,bigint) is absent - '
                    'apply 2026-08-11-player-state.sql (revision 4) first';
  end if;
  if to_regprocedure('public.hr_rejections_prune(interval)') is null then
    raise exception 'hr_rejections_prune is absent - the retention half of this journal does not exist';
  end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'hr_rpc_gate is absent - apply 2026-08-11-authenticated-surface-lockdown.sql first';
  end if;
end $$;

-- ========================================================================
-- 1.  S1 - THE BOUNDED VERB TOKEN
-- ========================================================================
-- Part of a written intent label can originate in a client string (hr_apply
-- reads `p_delta #>> '{journal,intent}'`, and the Edge engine builds that label
-- from ids it has not necessarily validated yet at the moment a version check
-- refuses). A verb that is used as a MAP KEY must therefore be bounded by
-- construction, not by trust:
--   - at most two colon segments survive (the verb and its family);
--   - each segment is lowercased, filtered to [a-z0-9_.-] and cut at 24 chars;
--   - an empty or unusable label becomes a literal, never a caller string.
-- Bounding the CHARACTER SET matters as much as the length: the key ends up in
-- jsonb that an operator reads in a terminal, and a label carrying control
-- characters or quotes is a log-injection surface.
create or replace function public.hr_rejection_verb(p_intent text)
returns text language sql immutable set search_path = public, pg_catalog as $$
  select case
    when v = '' then '(none)'
    else v
  end
  from (
    select coalesce(nullif(
      array_to_string(
        array(
          select nullif(left(regexp_replace(lower(s), '[^a-z0-9_.-]', '', 'g'), 24), '')
            from unnest(string_to_array(coalesce(p_intent, ''), ':')) with ordinality t(s, i)
           where i <= 2
        ), ':'), ''), '') as v
  ) q
$$;
revoke execute on function public.hr_rejection_verb(text)
  from public, anon, authenticated, service_role;

-- ========================================================================
-- 2.  S2 - THE KEY-CAPPED COUNTER MAP
-- ========================================================================
-- THE PROPERTY, stated as the thing an attacker cannot do: however many
-- distinct verbs a caller manages to get refused in a day, this map holds at
-- most p_cap + 1 keys, and `n` (the row's total) stays exact because the
-- overflow is COUNTED under '(other)' rather than dropped. The row count is
-- untouched either way - this is the difference between "bounded" and "does not
-- grow", and it is the reason the aggregate shape survived this change.
create or replace function public.hr_verb_bump(p_verbs jsonb, p_verb text, p_w bigint, p_cap int)
returns jsonb language sql immutable set search_path = public, pg_catalog as $$
  select case
    when v is null or v = '' then coalesce(p_verbs, '{}'::jsonb)
    when coalesce(p_verbs, '{}'::jsonb) ? v
      then jsonb_set(coalesce(p_verbs, '{}'::jsonb), array[v],
             to_jsonb(coalesce((p_verbs ->> v)::bigint, 0) + w))
    when (select count(*) from jsonb_object_keys(coalesce(p_verbs, '{}'::jsonb))) < greatest(1, p_cap)
      then coalesce(p_verbs, '{}'::jsonb) || jsonb_build_object(v, w)
    else jsonb_set(coalesce(p_verbs, '{}'::jsonb), array['(other)'],
           to_jsonb(coalesce((p_verbs ->> '(other)')::bigint, 0) + w))
  end
  from (select left(coalesce(p_verb, ''), 49) as v, greatest(1, coalesce(p_w, 1)) as w) q
$$;
revoke execute on function public.hr_verb_bump(jsonb, text, bigint, int)
  from public, anon, authenticated, service_role;

-- ========================================================================
-- 3.  S3 - THE DETAIL BOUND
-- ========================================================================
-- last_detail is written from caller-shaped jsonb and had no size bound. It is
-- a diagnostic, not evidence of a value movement, so the honest failure mode is
-- to record that it was too big rather than to store it.
create or replace function public.hr_detail_bound(p_detail jsonb)
returns jsonb language sql immutable set search_path = public, pg_catalog as $$
  select case
    when p_detail is null then '{}'::jsonb
    when length(p_detail::text) > 1000 then jsonb_build_object('truncated', length(p_detail::text))
    else p_detail
  end
$$;
revoke execute on function public.hr_detail_bound(jsonb)
  from public, anon, authenticated, service_role;

-- ========================================================================
-- 4.  S5 - THE DECORATOR. THE ONLY NEW WRITER PATH.
-- ========================================================================
-- Contract, in the imperative, because every caller is on a path that answers a
-- player:
--   - it RETURNS p_result, byte-identical, on every path including its own
--     failure. A journal that can change a verdict is not a journal;
--   - it writes nothing unless p_result.ok is exactly false;
--   - it writes nothing when auth.uid() is null (an unauthenticated refusal is
--     not attributable, and inventing a user_id is worse than losing a row);
--   - it writes AT MOST ONCE PER TRANSACTION. hr_record_rejection sets a
--     transaction-local flag (S4); a body that already recorded its own, more
--     specific rejection therefore wins, and a wrapper cannot double-count it.
--     PostgREST gives each client call its own transaction, so this is also the
--     rate bound: one request can add at most one occurrence.
-- It takes NO user argument. A recorder that accepts a victim is a recorder
-- that can be pointed at one; auth.uid() is read here and nowhere else.
create or replace function public.hr_note_rejection(p_verb text, p_slot int, p_result jsonb)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  v_uid uuid;
begin
  if p_result is null or coalesce(p_result ->> 'ok', 'true') <> 'false' then
    return p_result;
  end if;
  if coalesce(current_setting('hearthrise.rejection_noted', true), '') = '1' then
    return p_result;
  end if;
  v_uid := auth.uid();
  if v_uid is null then return p_result; end if;
  perform public.hr_record_rejection(
    v_uid, coalesce(p_slot, 0), left(coalesce(p_verb, ''), 64),
    coalesce(nullif(p_result ->> 'error', ''), 'unlabelled_refusal'),
    jsonb_strip_nulls(jsonb_build_object(
      'outcome', p_result ->> 'outcome',
      'detail',  p_result -> 'detail')),
    1);
  return p_result;
exception when others then
  -- Same posture hr_record_rejection already takes: losing one observation is
  -- acceptable, turning a clean refusal into a 500 is not.
  return p_result;
end $$;
revoke execute on function public.hr_note_rejection(text, int, jsonb)
  from public, anon, authenticated, service_role;

-- ========================================================================
-- 5.  THE COLUMN, AND S4 - PATCH hr_record_rejection (three anchors)
-- ========================================================================
alter table public.hr_rejections
  add column if not exists verbs jsonb not null default '{}'::jsonb;

do $$
declare
  v_src  text;
  v_new  text;
  c_cap  constant text := '24';
  -- The anchors. All ASCII, all taken from the INSTALLED body (which is the
  -- committed text of 2026-08-11-player-state.sql 6b-ii). CR is stripped first:
  -- the migrations are checked in with CRLF and the apply path posts file bytes,
  -- so prosrc on production carries CR that a LF-written anchor never matches.
  c_a1   constant text := '  if p_user is null or p_code is null then return; end if;';
  c_a2   constant text := '    (user_id, slot, day, code, severity, intent, n, last_detail)';
  c_a3   constant text := '          coalesce(p_detail, ''{}''::jsonb))';
  c_a4   constant text := '        last_at = now(), last_detail = excluded.last_detail,';
  v_hits int;
begin
  v_src := replace(pg_get_functiondef(
             'public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)'::regprocedure), chr(13), '');

  if position('hr_verb_bump' in v_src) > 0 then
    raise notice 'hr-rejections-journal: hr_record_rejection already carries the verbs maintenance - skipping';
    return;
  end if;

  foreach v_new in array array[c_a1, c_a2, c_a3, c_a4] loop
    v_hits := (length(v_src) - length(replace(v_src, v_new, ''))) / length(v_new);
    if v_hits <> 1 then
      raise exception 'hr-rejections-journal: anchor matched % times (need exactly 1) in '
                      'hr_record_rejection: %', v_hits, left(v_new, 60);
    end if;
  end loop;

  v_new := v_src;
  -- (1) the transaction-local "already recorded" flag, set before the write so
  --     that a body which records its own specific code wins over a wrapper.
  v_new := replace(v_new, c_a1,
    c_a1 || chr(10) || '  perform set_config(''hearthrise.rejection_noted'', ''1'', true);');
  -- (2) the new column in the insert target list
  v_new := replace(v_new, c_a2,
    '    (user_id, slot, day, code, severity, intent, n, last_detail, verbs)');
  -- (3) the bounded detail + the first verb, in the VALUES list
  v_new := replace(v_new, c_a3,
    '          public.hr_detail_bound(p_detail),' || chr(10)
    || '          public.hr_verb_bump(''{}''::jsonb, public.hr_rejection_verb(p_intent),'
    || ' greatest(1, coalesce(p_count, 1)), ' || c_cap || '))');
  -- (4) maintain the map on the conflict path. excluded.intent is already the
  --     left(...,64) form the insert list built, so the verb derives from the
  --     same expression on both paths.
  v_new := replace(v_new, c_a4,
    c_a4 || chr(10)
    || '        verbs = public.hr_verb_bump(r.verbs, public.hr_rejection_verb(excluded.intent),'
    || ' greatest(1, coalesce(p_count, 1)), ' || c_cap || '),');

  execute v_new;
  raise notice 'hr-rejections-journal: hr_record_rejection patched (verbs + bounded detail + once-flag)';
end $$;

-- ========================================================================
-- 6.  S6 - EVERY GATED WRAPPER
-- ========================================================================
-- Discovered by SHAPE, never from a list: a function in `public` that has a
-- `<name>__ungated` twin is a gate wrapper by construction
-- (2026-08-11-authenticated-surface-lockdown.sql 4b), and a list would go stale
-- the next time a verb is wrapped. 49 live on nezapsylztqbbwuwembx 2026-09-11.
--
-- The edit is ONE regex on a 400-byte generated body:
--     return public.X__ungated($1, $2);
--  -> return public.hr_note_rejection('X', <slot>, public.X__ungated($1, $2));
-- and it must match exactly once or the file refuses to apply. <slot> is the
-- wrapper's own `p_slot` parameter when it has one (PostgREST resolves on the
-- names, which the wrapper preserves verbatim) and 0 when it does not - an
-- account-scoped verb has no character. `p_slot_id` (hr_buy_hero_slot) is NOT
-- p_slot and the pattern says so.
do $$
declare
  r          record;
  v_src      text;
  v_new      text;
  v_slot     text;
  v_pat      text;
  v_hits     int;
  v_patched  int := 0;
  v_already  int := 0;
begin
  for r in
    select p.oid, p.proname,
           pg_get_function_arguments(p.oid) as args,
           coalesce((select string_agg(format_type(a.t, null), ',' order by a.o)
                       from unnest(p.proargtypes) with ordinality a(t, o)), '') as types
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and exists (select 1 from pg_proc q join pg_namespace m on m.oid = q.pronamespace
                    where m.nspname = 'public' and q.proname = p.proname || '__ungated')
     order by p.proname
  loop
    v_src := replace(pg_get_functiondef(r.oid), chr(13), '');
    if position('hr_note_rejection' in v_src) > 0 then
      v_already := v_already + 1;
      continue;
    end if;

    v_pat  := 'return public\.' || r.proname || '__ungated\(([^;]*)\);';
    v_hits := (select count(*) from regexp_matches(v_src, v_pat, 'g'));
    if v_hits <> 1 then
      raise exception 'hr-rejections-journal: wrapper %(%) has % inner-call sites (need exactly 1) - '
                      'it is not the generated wrapper shape, refusing to patch',
                      r.proname, r.types, v_hits;
    end if;

    v_slot := case when r.args ~ '(^|, )p_slot integer' then 'p_slot' else '0' end;
    v_new  := regexp_replace(v_src, v_pat,
                'return public.hr_note_rejection(' || quote_literal(r.proname) || ', ' || v_slot
                || ', public.' || r.proname || '__ungated(\1));', 'g');

    -- The ONLY change is the insertion: same body, same length plus the exact
    -- bytes of the wrapper text. Arithmetic, not faith.
    if length(v_new) <> length(v_src)
       + length('public.hr_note_rejection(' || quote_literal(r.proname) || ', ' || v_slot || ', ') + 1 then
      raise exception 'hr-rejections-journal: patched body of % is not the original plus one insertion '
                      '(% -> %) - refusing', r.proname, length(v_src), length(v_new);
    end if;

    execute v_new;
    v_patched := v_patched + 1;
  end loop;

  if v_patched + v_already = 0 then
    raise exception 'hr-rejections-journal: found NO gated wrappers - the discovery query is wrong, '
                    'and a coverage change that covers nothing must not report success';
  end if;
  raise notice 'hr-rejections-journal: % gated wrapper(s) decorated, % already carried the seam',
    v_patched, v_already;
end $$;

-- ========================================================================
-- 7.  S7 - THE SEVEN SELF-GATING PLAYER VERBS
-- ========================================================================
-- These have no `__ungated` twin: they call hr_rpc_gate inside their own body,
-- so there is no seam to decorate and the refusal sites have to be wrapped
-- where they are. Rename-and-wrap was considered and rejected: it would move a
-- money verb's ACL and its last-toucher identity for an observability change,
-- and hr_assert_grant_hygiene requires a client-executable SECURITY DEFINER
-- function to reference a gate, which a journal-only wrapper does not (calling
-- the gate twice would halve every one of these verbs' real rate limit).
--
-- A regex on a body that moves gold is only acceptable with a proof, so there
-- are three, all executed here:
--   (a) after the patch, ZERO literal `return jsonb_build_object('ok', false`
--       sites remain - i.e. the sweep is complete, not partial;
--   (b) the SET of error codes the body can emit is byte-identical before and
--       after - i.e. no verdict moved;
--   (c) the body compiles (create or replace parses it) and the patched text is
--       the original plus exactly N insertions of known length.
-- p_slot is parameter 1 of all seven (measured), so the slot is attributable.
do $$
declare
  c_targets constant text[] := array[
    'public.hr_bank_move(int,text,bigint,text,uuid)',
    'public.hr_farm_harvest(int,int,uuid)',
    'public.hr_farm_plant(int,int,text,uuid)',
    'public.hr_farm_upgrade_plot(int,uuid)',
    'public.hr_farm_water(int,int,uuid)',
    'public.hr_worker_assign(int,text,text,text,uuid)',
    'public.hr_worker_hire(int,uuid)'];
  c_verbs   constant text[] := array[
    'bank_move', 'farm_harvest', 'farm_plant', 'farm_upgrade_plot',
    'farm_water', 'worker_assign', 'worker_hire'];
  v_i        int;
  v_oid      oid;
  v_src      text;
  v_new      text;
  v_prefix   text;
  v_n_lit    int;
  v_n_mis    int;
  v_before   text[];
  v_after    text[];
  v_patched  int := 0;
  v_already  int := 0;
begin
  for v_i in 1 .. array_length(c_targets, 1) loop
    v_oid := to_regprocedure(c_targets[v_i]);
    if v_oid is null then
      raise exception 'hr-rejections-journal: % is not installed - this file names the seven verbs '
                      'whose refusals were invisible and refuses to half-cover them', c_targets[v_i];
    end if;
    v_src := replace(pg_get_functiondef(v_oid), chr(13), '');
    if position('hr_note_rejection' in v_src) > 0 then
      v_already := v_already + 1;
      continue;
    end if;

    -- the codes this body can answer with, BEFORE
    v_before := array(select m[1] from regexp_matches(v_src,
                  'jsonb_build_object\(''ok'', false, ''error'', ''([a-z0-9_]+)''', 'g') m
                 order by 1);

    v_prefix := 'public.hr_note_rejection(' || quote_literal(c_verbs[v_i]) || ', p_slot, ';
    v_n_lit  := (select count(*) from regexp_matches(v_src,
                   'return (jsonb_build_object\(''ok'', false,[^;]*)\);', 'g'));
    -- the intent_mismatch early return (2026-09-03-intent-mismatch-class.sql)
    -- is a refusal that arrives as a VARIABLE, so the literal sweep cannot see
    -- it. Missing it would leave the single most likely automated-retry refusal
    -- of a money verb unjournalled while the assertion below still read green.
    v_n_mis  := (select count(*) from regexp_matches(v_src,
                   'if (v_[a-z_]+) ->> ''error'' = ''intent_mismatch'' then return \1; end if;', 'g'));
    if v_n_lit = 0 then
      raise exception 'hr-rejections-journal: % has no literal refusal site - the installed body is '
                      'not the one this patch was measured against', c_targets[v_i];
    end if;

    -- Greedy `[^;]*` stops before the LAST `)` of the statement, so group 1 is
    -- `jsonb_build_object('ok', false, ...` WITHOUT its own closing paren: the
    -- replacement has to supply two - one for jsonb_build_object, one for the
    -- decorator. Getting this wrong produced a body one paren short, and the
    -- length arithmetic below is what refused it rather than a syntax error at
    -- some later hour. That is the reason the arithmetic exists.
    v_new := regexp_replace(v_src,
               'return (jsonb_build_object\(''ok'', false,[^;]*)\);',
               'return ' || v_prefix || '\1));', 'g');
    v_new := regexp_replace(v_new,
               'if (v_[a-z_]+) ->> ''error'' = ''intent_mismatch'' then return \1; end if;',
               'if \1 ->> ''error'' = ''intent_mismatch'' then return ' || v_prefix || '\1); end if;', 'g');

    -- (c) arithmetic: original + (n_lit + n_mis) insertions of (prefix + one ')')
    if length(v_new) <> length(v_src) + (v_n_lit + v_n_mis) * (length(v_prefix) + 1) then
      raise exception 'hr-rejections-journal: patched % is not the original plus % insertions '
                      '(% -> %) - refusing to install a body I cannot account for',
                      c_targets[v_i], v_n_lit + v_n_mis, length(v_src), length(v_new);
    end if;
    -- (a) the sweep is complete
    if v_new ~ 'return jsonb_build_object\(''ok'', false' then
      raise exception 'hr-rejections-journal: % still has an UNDECORATED refusal site after the patch',
                      c_targets[v_i];
    end if;
    -- (b) no verdict moved
    v_after := array(select m[1] from regexp_matches(v_new,
                 'jsonb_build_object\(''ok'', false, ''error'', ''([a-z0-9_]+)''', 'g') m
               order by 1);
    if v_before is distinct from v_after then
      raise exception 'hr-rejections-journal: the error codes of % CHANGED across the patch (% -> %)',
                      c_targets[v_i], array_to_string(v_before, ','), array_to_string(v_after, ',');
    end if;

    execute v_new;
    v_patched := v_patched + 1;
  end loop;

  if v_patched + v_already <> array_length(c_targets, 1) then
    raise exception 'hr-rejections-journal: decorated % of % self-gating verbs',
      v_patched + v_already, array_length(c_targets, 1);
  end if;
  raise notice 'hr-rejections-journal: % self-gating verb(s) decorated, % already carried the seam',
    v_patched, v_already;
end $$;

-- ========================================================================
-- 8.  SECTION 4 SELF-CHECK - properties asserted by EXECUTING SQL
-- ========================================================================
-- Every probe below either runs against synthetic uuids in a sub-block that is
-- rolled back, or reads the catalogue. NOTHING fabricates a player row: a real
-- character is never seeded, healed, granted or reset to test something
-- (CLAUDE.md 2). The end-to-end behaviour - a refused RPC writes exactly one
-- row with the right code, an accepted one writes none - is proven on a
-- replayed chain by tests/rejections-journal.mjs, where fabricating a player is
-- legitimate because the database is disposable.
do $$
declare
  v_uid      uuid := '00000000-0000-4000-8000-0000000d0001';
  v_n        bigint;
  v_row      public.hr_rejections%rowtype;
  v_j        jsonb;
  v_src      text;
  v_bad      text;
  v_i        int;
  v_keys     int;
  v_sum      bigint;
  c_seven    constant text[] := array[
    'public.hr_bank_move(int,text,bigint,text,uuid)',
    'public.hr_farm_harvest(int,int,uuid)',
    'public.hr_farm_plant(int,int,text,uuid)',
    'public.hr_farm_upgrade_plot(int,uuid)',
    'public.hr_farm_water(int,int,uuid)',
    'public.hr_worker_assign(int,text,text,text,uuid)',
    'public.hr_worker_hire(int,uuid)'];
begin
  -- (a) THE OBJECTS EXIST AND ARE NOT CLIENT-REACHABLE ---------------------
  if to_regprocedure('public.hr_note_rejection(text,int,jsonb)') is null
  or to_regprocedure('public.hr_rejection_verb(text)') is null
  or to_regprocedure('public.hr_verb_bump(jsonb,text,bigint,int)') is null
  or to_regprocedure('public.hr_detail_bound(jsonb)') is null then
    raise exception 'GATE(a): a function this file creates is missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hr_rejections'
                    and column_name = 'verbs' and data_type = 'jsonb') then
    raise exception 'GATE(a): hr_rejections.verbs is absent';
  end if;
  foreach v_bad in array array['public.hr_note_rejection(text,int,jsonb)',
                               'public.hr_rejection_verb(text)',
                               'public.hr_verb_bump(jsonb,text,bigint,int)',
                               'public.hr_detail_bound(jsonb)'] loop
    if has_function_privilege('anon', v_bad, 'execute')
    or has_function_privilege('authenticated', v_bad, 'execute')
    or has_function_privilege('service_role', v_bad, 'execute') then
      raise exception 'GATE(a): % is client-executable - the recorder must not be callable '
                      'by anything that can choose what it records', v_bad;
    end if;
  end loop;

  -- (b) THE DECORATOR IS A PASS-THROUGH -----------------------------------
  --     The whole design rests on "a journal cannot change a verdict".
  --     The identity claim is cleared TRANSACTION-LOCALLY first, both spellings,
  --     so the probes are deterministic and provably write nothing: a session
  --     that happened to carry a JWT subject (a replay harness does) would
  --     otherwise make hr_note_rejection attribute these probes to a real user
  --     and leave three fabricated rows behind. A self-check must not depend on
  --     who is running it.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if auth.uid() is not null then
    raise exception 'GATE(b): the identity claim could not be cleared, so the pass-through probes '
                    'would write rows attributed to a real player';
  end if;
  select count(*) into v_n from public.hr_rejections;
  if public.hr_note_rejection('probe', 0, '{"ok":true,"gold":7}'::jsonb)
       is distinct from '{"ok":true,"gold":7}'::jsonb then
    raise exception 'GATE(b): the decorator altered an ACCEPTED envelope';
  end if;
  if public.hr_note_rejection('probe', 0, '{"ok":false,"error":"insufficient_gold","need":9}'::jsonb)
       is distinct from '{"ok":false,"error":"insufficient_gold","need":9}'::jsonb then
    raise exception 'GATE(b): the decorator altered a REFUSAL envelope';
  end if;
  if public.hr_note_rejection('probe', 0, null) is not null then
    raise exception 'GATE(b): the decorator invented an envelope out of null';
  end if;
  -- An unattributable refusal must be LOST, never filed under an invented id.
  if (select count(*) from public.hr_rejections) <> v_n then
    raise exception 'GATE(b): a refusal with no auth.uid() was recorded anyway - the recorder '
                    'invented a user_id, which is the one thing worse than losing an observation';
  end if;

  -- (c) THE VERB TOKEN IS BOUNDED -----------------------------------------
  if public.hr_rejection_verb('set_activity:combat:goblin') <> 'set_activity:combat' then
    raise exception 'GATE(c): set_activity:combat:goblin -> %',
      public.hr_rejection_verb('set_activity:combat:goblin');
  end if;
  if public.hr_rejection_verb('farm_water') <> 'farm_water' then
    raise exception 'GATE(c): a single-segment label did not survive';
  end if;
  if public.hr_rejection_verb(null) <> '(none)' or public.hr_rejection_verb('') <> '(none)' then
    raise exception 'GATE(c): an absent label did not become the literal (none)';
  end if;
  if public.hr_rejection_verb(repeat('A', 400) || ':' || repeat('B', 400)) <> repeat('a', 24) || ':' || repeat('b', 24) then
    raise exception 'GATE(c): a 800-character label was not cut to 24+24';
  end if;
  -- The property is the CHARACTER SET, not a particular string: whatever a
  -- caller sends, what reaches a jsonb key (and therefore an operator's
  -- terminal) is [a-z0-9_.:-] and nothing else. Asserted both ways so the
  -- filter cannot be widened without this line going red.
  if public.hr_rejection_verb(e'drop:me\n\t"'' -- x') !~ '^[a-z0-9_.:-]+$' then
    raise exception 'GATE(c): control characters or quotes survived into a map key: %',
      public.hr_rejection_verb(e'drop:me\n\t"'' -- x');
  end if;
  if public.hr_rejection_verb(e'DROP:me\n\t"'' -- x') <> 'drop:me--x' then
    raise exception 'GATE(c): the filter stopped being the measured one (got %)',
      public.hr_rejection_verb(e'DROP:me\n\t"'' -- x');
  end if;

  -- (d) THE MAP CAP BITES --------------------------------------------------
  v_j := '{}'::jsonb;
  for v_i in 1 .. 200 loop
    v_j := public.hr_verb_bump(v_j, 'verb' || v_i::text, 1, 24);
  end loop;
  select count(*) into v_keys from jsonb_object_keys(v_j);
  if v_keys > 25 then
    raise exception 'GATE(d): 200 distinct verbs produced % keys - the cap does not bite', v_keys;
  end if;
  if not (v_j ? '(other)') then
    raise exception 'GATE(d): the overflow was DROPPED instead of counted under (other)';
  end if;
  select sum(value::bigint) into v_sum from jsonb_each_text(v_j);
  if v_sum <> 200 then
    raise exception 'GATE(d): the map totals % of 200 bumps - overflow lost count', v_sum;
  end if;

  -- (e) THE DETAIL IS BOUNDED ---------------------------------------------
  if length(public.hr_detail_bound(jsonb_build_object('x', repeat('z', 5000)))::text) > 60 then
    raise exception 'GATE(e): a 5 KB detail was stored whole';
  end if;
  if public.hr_detail_bound('{"version":8696}'::jsonb) <> '{"version":8696}'::jsonb then
    raise exception 'GATE(e): an ordinary detail was mangled by the bound';
  end if;

  -- (f) THE AGGREGATE STILL AGGREGATES, AND NOW RESOLVES THE VERB ----------
  --     This is D1 - Paione's row - reproduced and then fixed, on synthetic
  --     uuids, inside a sub-block that is rolled back.
  begin
    perform public.hr_record_rejection(v_uid, 0, 'accrue', 'version_conflict', '{"version":8696}'::jsonb, 6);
    perform set_config('hearthrise.rejection_noted', '', true);
    perform public.hr_record_rejection(v_uid, 0, 'equip:weapon', 'version_conflict', '{"version":8697}'::jsonb, 4);
    select count(*) into v_n from public.hr_rejections where user_id = v_uid;
    if v_n <> 1 then
      raise exception using errcode = 'HR840',
        message = format('GATE(f): two verbs of one code produced %s rows - the aggregate shape is gone '
                         'and this is game_events again', v_n);
    end if;
    select * into v_row from public.hr_rejections where user_id = v_uid;
    if v_row.n <> 10 then
      raise exception using errcode = 'HR840',
        message = format('GATE(f): n is %s, expected 10 - the counter stopped being exact', v_row.n);
    end if;
    if coalesce((v_row.verbs ->> 'accrue')::bigint, 0) <> 6
    or coalesce((v_row.verbs ->> 'equip:weapon')::bigint, 0) <> 4 then
      raise exception using errcode = 'HR840',
        message = format('GATE(f): the verbs map is %s - D1 (the erased verb) is NOT fixed', v_row.verbs);
    end if;

    -- (g) ONE REQUEST, ONE OCCURRENCE. The flag set by the inner body must
    --     suppress the wrapper's duplicate in the same transaction.
    perform set_config('hearthrise.rejection_noted', '', true);
    perform public.hr_record_rejection(v_uid, 0, 'farm_water', 'still_watered', '{}'::jsonb, 1);
    perform public.hr_record_rejection(v_uid, 0, 'farm_water', 'still_watered', '{}'::jsonb, 1);
    select n into v_n from public.hr_rejections where user_id = v_uid and code = 'still_watered';
    if v_n <> 2 then
      raise exception using errcode = 'HR840',
        message = format('GATE(g): hr_record_rejection stopped counting direct calls (n=%s, expected 2) '
                         '- the once-flag must gate hr_note_rejection, never the recorder itself', v_n);
    end if;
    if coalesce(current_setting('hearthrise.rejection_noted', true), '') <> '1' then
      raise exception using errcode = 'HR840',
        message = 'GATE(g): the transaction-local flag was not set, so a wrapper would double-count '
               || 'every refusal an inner body already recorded';
    end if;
    if public.hr_note_rejection('farm_water', 0, '{"ok":false,"error":"still_watered"}'::jsonb)
         is distinct from '{"ok":false,"error":"still_watered"}'::jsonb then
      raise exception using errcode = 'HR840', message = 'GATE(g): the decorator altered a suppressed envelope';
    end if;
    select n into v_n from public.hr_rejections where user_id = v_uid and code = 'still_watered';
    if v_n <> 2 then
      raise exception using errcode = 'HR840',
        message = format('GATE(g): the decorator double-counted a refusal the body had already '
                         'recorded (n=%s, expected 2)', v_n);
    end if;

    raise exception using errcode = 'HR841', message = 'hr-rejections-journal self-check complete - rolling back';
  exception
    when sqlstate 'HR840' then raise;
    when sqlstate 'HR841' then null;
  end;
  perform set_config('hearthrise.rejection_noted', '', true);

  -- (h) THE PROBES LEFT NOTHING BEHIND ------------------------------------
  if exists (select 1 from public.hr_rejections where user_id = v_uid) then
    raise exception 'GATE(h): the self-check LEAKED a synthetic rejection row';
  end if;

  -- (i) COVERAGE - every gated wrapper carries the seam, exactly once ------
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and exists (select 1 from pg_proc q join pg_namespace m on m.oid = q.pronamespace
                  where m.nspname = 'public' and q.proname = p.proname || '__ungated')
     and (select count(*) from regexp_matches(p.prosrc, 'hr_note_rejection\(', 'g')) <> 1;
  if v_bad is not null then
    raise exception 'GATE(i): gated wrapper(s) without exactly one seam: %', v_bad;
  end if;
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and exists (select 1 from pg_proc q join pg_namespace m on m.oid = q.pronamespace
                  where m.nspname = 'public' and q.proname = p.proname || '__ungated');
  if v_n < 40 then
    raise exception 'GATE(i): only % gated wrappers were found - 49 were measured on 2026-09-11, so '
                    'either discovery is broken or the client surface shrank unnoticed', v_n;
  end if;

  -- (j) COVERAGE - the seven, with ZERO undecorated refusal sites ----------
  foreach v_bad in array c_seven loop
    v_src := replace(pg_get_functiondef(v_bad::regprocedure), chr(13), '');
    if position('hr_note_rejection' in v_src) = 0 then
      raise exception 'GATE(j): % carries no seam', v_bad;
    end if;
    if v_src ~ 'return jsonb_build_object\(''ok'', false' then
      raise exception 'GATE(j): % still returns a refusal that nothing records', v_bad;
    end if;
    -- ONLY the intent_mismatch early return. `if v_cached is not null then
    -- return v_cached; end if;` two lines above it is the REPLAY path - an
    -- accepted envelope being served again - and decorating that would journal
    -- a success as a refusal.
    if v_src ~ '''intent_mismatch'' then return v_[a-z_]+;' then
      raise exception 'GATE(j): the intent_mismatch early return of % is undecorated - the single '
                      'most likely automated-retry refusal of a money verb would stay invisible', v_bad;
    end if;
  end loop;

  -- (k) THE TABLE IS STILL UNREACHABLE FROM A CLIENT ----------------------
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'hr_rejections' and c.relrowsecurity) then
    raise exception 'GATE(k): RLS is OFF on hr_rejections';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_rejections') then
    raise exception 'GATE(k): a POLICY exists on hr_rejections - this table is ops-only by design '
                    'and a policy is the first half of a client read';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name = 'hr_rejections'
                and grantee in ('anon', 'authenticated', 'PUBLIC')) then
    raise exception 'GATE(k): a client grant exists on hr_rejections';
  end if;

  -- (l) RETENTION STILL EXISTS AND STILL HAS A FLOOR ----------------------
  if to_regprocedure('public.hr_rejections_prune(interval)') is null then
    raise exception 'GATE(l): the prune function vanished';
  end if;
  if has_function_privilege('authenticated', 'public.hr_rejections_prune(interval)', 'execute')
  or has_function_privilege('anon', 'public.hr_rejections_prune(interval)', 'execute') then
    raise exception 'GATE(l): the prune is client-executable - a player could delete the record of '
                    'their own refusals';
  end if;

  raise notice 'hr-rejections-journal: decorator is a pass-through, verb token bounded and filtered, '
               'map capped at 25 keys with an exact total, detail bounded, one row for two verbs of one '
               'code with both counted, one occurrence per transaction, every gated wrapper and all '
               'seven self-gating verbs decorated with zero undecorated refusal sites, RLS on with no '
               'policy and no client grant, retention intact - all green';
end $$;
