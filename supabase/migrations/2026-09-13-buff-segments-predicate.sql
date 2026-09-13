-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-13-buff-segments-predicate.sql — CONVERGE THE REPO ON PRODUCTION FOR
--                                          THE SEGMENT-REBUILD PREDICATE.
--
-- ── WHAT HAPPENED, PLAINLY ─────────────────────────────────────────────────
-- 2026-09-13-buff-segments.sql applied at 06:02 UTC with one form of its §2c
-- rebuild predicate. Afterwards this lane rewrote that predicate IN THE FILE — but
-- the file early-returns when `c_buff_max_segments` is already installed, so a
-- re-apply is a notice and the rewrite could never reach the database. The repo
-- then carried a body production does not run: `live-hash --codediff` measured 35
-- characters of difference on hr_apply. That is an incident class on its own,
-- whatever the diff says, because the repo's belief about the deployed body is
-- what every later anchored patch is authored against.
--
-- So this file makes production match the repo, forward, with a patch that CAN
-- apply — and 2026-09-13-buff-segments.sql has been reverted to the exact text it
-- applied with, so that file's payload is byte-honest again.
--
-- ── THE TWO PREDICATES ARE EQUIVALENT. MEASURED, NOT ARGUED. ───────────────
--   OLD (production):  where until > now
--                        and ( type <> T
--                              or ( not twin and (mag >= M or until > new_end) ) )
--   NEW (this file):   where until > now
--                        and ( (type <> T)
--                              or ( type = T and not twin
--                                   and (mag >= M or until > new_end) ) )
--
-- For a row with `type <> T` the FIRST disjunct is true in both, so the second
-- cannot change the answer. For a row with `type = T` the added `type = T`
-- conjunct is true, so the second disjunct is unchanged. There is therefore NO row
-- on which they differ — and §4(b) below does not take that on trust: it runs BOTH
-- predicates over the full cross-product of every atom either one reads (type ∈
-- {T, other} × magnitude {<, =, >} × expiry {≤ end, > end}, plus the twin row) and
-- requires the two selections to be IDENTICAL. Measured here before writing this
-- file: 13 rows in, 10 selected, identical.
--
-- ⚠ SO THE EARLIER CHARACTERISATION WAS WRONG AND IS CORRECTED HERE. This lane
--   described the rewrite as fixing "other types surviving through the second
--   disjunct". That is NOT true of the applied body: no player's buff was ever
--   dropped or kept wrongly, and there is nothing to repair in production data.
--   What is true is narrower and still worth landing: the old second branch does
--   not CONSTRAIN the type, so its conditions are written as if they applied to
--   every row. An edit to the FIRST branch therefore changes other-type handling
--   silently — which is exactly what tests/buff-queue.mjs's
--   `merge_replaces_other_types` mutation does, and why that mutation was INVISIBLE
--   until the predicate was rewritten. This is a reviewability and
--   mutation-visibility change. Security's reading ("equivalent") is correct;
--   the value is that the next edit cannot be quietly wrong.
--
-- ── WHAT THIS FILE DOES NOT DO ─────────────────────────────────────────────
-- It changes no behaviour (§4(b) is the proof), moves no value, adds no table,
-- column, index, constraint, grant or ledger row, reads nothing from the client,
-- and touches no other block of hr_apply. It does not re-run any part of
-- 2026-09-13-buff-segments.sql.
--
-- RESTATEMENT-DEBT-ACK: a one-anchor replacement inside the LIVE hr_apply body,
--   which an agent cannot read (tools/apply-migration.mjs and
--   tests/live-hash-drift.baseline.json are Coordinator-only). The anchor is the
--   exact text THIS LANE applied at 06:02 UTC, so it is the one region of a
--   29-patch body this file can account for character by character; a restatement
--   would blind-overwrite everyone else's patches on the economy's single write
--   path (the b484-b487 class). Paydown stays the Coordinator's, scheduled.
--
-- ⚠ AFTER APPLYING: hr_apply is LIVE-HASH-TRACKED — re-seed with
--   `node tests/live-hash-drift.mjs --live --write` and write the why from
--   `--codediff`; the diff should then be EMPTY (that is the point of the file).
--   apply-migration reports the RAW prosrc md5, live-hash-drift the
--   whitespace-NORMALISED one (see the coupling file's note).
-- ⚠ APPLY ORDER: LAST, after 2026-09-13-buff-segments.sql. Re-entrant: §0 skips
--   the whole file if the new predicate is already installed.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED, AND RE-ENTRANT ─────────────────────────
do $mig$
declare
  v_apply text; v_n int;
  c_old constant text := $anc$       where (e.v->>'until')::timestamptz > v_buff_now
         and ((e.v->>'type') <> v_buff_type
              or (not (v_buff_same is not null and e.v = v_buff_same)
                  and ((e.v->>'magnitude')::numeric >= v_buff_mag
                       or (e.v->>'until')::timestamptz > v_buff_until)));$anc$;
begin
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null then
    raise exception 'hr_apply is missing — apply the apply-engine chain first'; end if;
  v_apply := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');

  if strpos(v_apply, 'c_buff_max_segments') = 0 then
    raise exception 'hr_apply does not carry the segment model — apply '
                    '2026-09-13-buff-segments.sql first; there is no predicate here to converge';
  end if;
  -- RE-ENTRANT: already converged is a notice, not a failure.
  if strpos(v_apply, $q$or ((e.v->>'type') = v_buff_type$q$) > 0 then
    raise notice 'hr_apply already carries the type-explicit predicate — nothing to converge';
    perform set_config('hearthrise.buff_predicate_done', 'yes', false);
    return;
  end if;
  v_n := (length(v_apply) - length(replace(v_apply, c_old, ''))) / length(c_old);
  if v_n <> 1 then
    raise exception 'the APPLIED rebuild predicate appears % time(s), expected exactly 1 — the live body '
                    'is not the one this file was derived against. Diff it against the repo chain before '
                    'patching; do NOT patch a body you cannot account for.', v_n;
  end if;
  perform set_config('hearthrise.buff_predicate_done', 'no', false);
end $mig$;

-- ── 1. THE PATCH ───────────────────────────────────────────────────────────
do $mig$
declare v_def text;
begin
  if current_setting('hearthrise.buff_predicate_done', true) = 'yes' then
    raise notice 'predicate already converged — patch skipped'; return; end if;
  v_def := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  v_def := replace(v_def,
    $anc$       where (e.v->>'until')::timestamptz > v_buff_now
         and ((e.v->>'type') <> v_buff_type
              or (not (v_buff_same is not null and e.v = v_buff_same)
                  and ((e.v->>'magnitude')::numeric >= v_buff_mag
                       or (e.v->>'until')::timestamptz > v_buff_until)));$anc$,
    $new$       where (e.v->>'until')::timestamptz > v_buff_now
         and (((e.v->>'type') <> v_buff_type)
              -- THE SECOND BRANCH RE-TESTS THE TYPE. Logically redundant — the first
              -- disjunct already covers every other-type row, and §4(b) proves the two
              -- forms select identically over the whole cross-product — but the old
              -- form's conditions read as if they applied to EVERY row, so an edit to
              -- the first branch changed other-type handling silently. That is not
              -- hypothetical: tests/buff-queue.mjs's merge_replaces_other_types
              -- mutation was INVISIBLE under the old form and bites under this one.
              or ((e.v->>'type') = v_buff_type
                  and not (v_buff_same is not null and e.v = v_buff_same)
                  and ((e.v->>'magnitude')::numeric >= v_buff_mag
                       or (e.v->>'until')::timestamptz > v_buff_until)));$new$);
  execute v_def;
  raise notice 'hr_apply patched: the segment-rebuild predicate is type-explicit in both branches';
end $mig$;
-- create-or-replace preserves an ACL; re-state it anyway.
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
grant  execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 2. SELF-CHECK (§4) ─────────────────────────────────────────────────────
do $mig$
declare
  v_apply text; v_old jsonb; v_new jsonb; v_rows jsonb; v_twin jsonb;
  v_r jsonb; v_ver bigint; v_q jsonb; v_item text; v_type text; v_mag numeric; v_dur bigint;
  v_uid  constant uuid := '000000b6-0000-0000-0000-0000000000b6';
  c_j    constant jsonb := '{"kind":"admin","intent":"buff-predicate:probe"}'::jsonb;
begin
  -- (a) THE PATCH LANDED, and nothing else in the buff block moved.
  v_apply := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_apply, $q$or ((e.v->>'type') = v_buff_type$q$) = 0 then
    raise exception 'predicate self-check (a): the type-explicit branch did not install'; end if;
  if strpos(v_apply, 'c_buff_max_segments constant int := 8;') = 0
     or strpos(v_apply, 'v_buff_gain < v_buff_need') = 0
     or strpos(v_apply, 'buff_not_paid') = 0
     or strpos(v_apply, 'bad_buff_shape') = 0
     or strpos(v_apply, 'v_out := public.hr_state_of(v_uid, v_slot);') = 0 then
    raise exception 'predicate self-check (a): a predecessor block is gone — the patch was not surgical';
  end if;
  -- The buff_at_max SHAPE PIN that 2026-09-13-rejections-verb-map-2.sql asserts
  -- must still hold, or that file raises on ITS next re-apply because of this one.
  if (select count(*) from regexp_matches(v_apply, 'hr_reject\(''buff_at_max''', 'g')) <> 2 then
    raise exception 'predicate self-check (a): hr_apply no longer raises buff_at_max from exactly 2 '
                    'sites — the rejections journal''s whys breakdown pins that shape';
  end if;
  if has_function_privilege('authenticated', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute') then
    raise exception 'predicate self-check (a): hr_apply is executable by a client role'; end if;

  -- ── (b) THE EQUIVALENCE PROOF, BY EXECUTION ───────────────────────────────
  -- Both predicates, run over the FULL cross-product of every atom either one
  -- reads: type ∈ {the applied type, another} × magnitude {below, equal, above} ×
  -- expiry {inside the new segment, beyond it}, plus the twin row itself. If the
  -- two selections are identical on all of it, the convergence changes no
  -- behaviour — which is the claim this whole file rests on, and the reason it is
  -- proven rather than asserted.
  v_twin := jsonb_build_object('type', 'T', 'magnitude', 5, 'until', '2026-01-01T00:10:00Z');
  select coalesce(jsonb_agg(jsonb_build_object('type', t, 'magnitude', m, 'until', u)), '[]'::jsonb)
    into v_rows
    from unnest(array['T','OTHER']) t,
         unnest(array[1,5,9]::numeric[]) m,
         unnest(array['2026-01-01T00:10:00Z','2026-01-01T00:30:00Z']) u;
  v_rows := v_rows || jsonb_build_array(v_twin);

  with q(v) as (select * from jsonb_array_elements(v_rows))
  select coalesce(jsonb_agg(q.v order by q.v::text), '[]'::jsonb) into v_old from q
   where (q.v->>'until')::timestamptz > '2026-01-01T00:00:00Z'::timestamptz
     and ((q.v->>'type') <> 'T'
          or (not (v_twin is not null and q.v = v_twin)
              and ((q.v->>'magnitude')::numeric >= 5
                   or (q.v->>'until')::timestamptz > '2026-01-01T00:20:00Z'::timestamptz)));

  with q(v) as (select * from jsonb_array_elements(v_rows))
  select coalesce(jsonb_agg(q.v order by q.v::text), '[]'::jsonb) into v_new from q
   where (q.v->>'until')::timestamptz > '2026-01-01T00:00:00Z'::timestamptz
     and (((q.v->>'type') <> 'T')
          or ((q.v->>'type') = 'T'
              and not (v_twin is not null and q.v = v_twin)
              and ((q.v->>'magnitude')::numeric >= 5
                   or (q.v->>'until')::timestamptz > '2026-01-01T00:20:00Z'::timestamptz)));

  if jsonb_array_length(v_old) = 0 or jsonb_array_length(v_old) = jsonb_array_length(v_rows) then
    raise exception 'predicate self-check (b): the fixture is DEGENERATE — the predicates select % of % '
                    'rows, so "identical" would prove nothing',
                    jsonb_array_length(v_old), jsonb_array_length(v_rows);
  end if;
  if v_old <> v_new then
    raise exception 'predicate self-check (b): THE TWO PREDICATES ARE NOT EQUIVALENT. old=% new=% — this '
                    'file claims to change no behaviour and it would be changing some.', v_old, v_new;
  end if;
  raise notice 'predicate self-check (b): the two forms select the SAME % of % rows across the whole '
               'cross-product — equivalent, proven by execution',
               jsonb_array_length(v_old), jsonb_array_length(v_rows);

  -- ── (c) THE BEHAVIOURAL CASES, ON THE PATCHED BODY ────────────────────────
  -- The two survival rules tests/buff-queue.mjs [16b] / [16c] own, plus the
  -- other-type rule its merge_replaces_other_types mutation exists for, driven
  -- through the real hr_apply so the patch is judged by what it does.
  begin
    select b.item_id, b.type, b.magnitude, b.duration_ms into v_item, v_type, v_mag, v_dur
      from public.hr_item_buffs b order by b.duration_ms desc, b.item_id limit 1;
    if v_item is null then raise exception 'predicate self-check (c): FIXTURE — no buff food'; end if;

    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to)
      values (v_uid, 0, 0, 0, 10, 10, 1, now())
      on conflict (user_id, slot) do update set version = 1, buffs = '[]'::jsonb;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, 0, v_item, 50)
      on conflict (user_id, slot, item_id) do update set qty = 50;

    -- (c1) A COVERED WEAKER SEGMENT IS DROPPED, and an OTHER-type segment SURVIVES
    --      the same apply. One fixture, both rules — the other-type row is the one
    --      the old predicate kept for the wrong reason.
    update public.player_state set buffs = jsonb_build_array(
        jsonb_build_object('type', v_type, 'magnitude', greatest(1, v_mag - 1),
                           'until', to_jsonb(now() + interval '60 seconds')),
        jsonb_build_object('type', 'gold_find', 'magnitude', 3,
                           'until', to_jsonb(now() + interval '45 minutes')))
      where user_id = v_uid and slot = 0;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                'items', jsonb_build_object(v_item, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'predicate self-check (c1): the consume was refused: %', v_r; end if;
    select buffs into v_q from public.player_state where user_id = v_uid and slot = 0;
    if (select count(*) from jsonb_array_elements(v_q) as e(v) where e.v->>'type' = 'gold_find') <> 1 then
      raise exception 'predicate self-check (c1): the OTHER type''s segment was dropped (%) — the '
                      'rebuild must never touch a type it was not applied to', v_q;
    end if;
    if (select count(*) from jsonb_array_elements(v_q) as e(v) where e.v->>'type' = v_type) <> 1 then
      raise exception 'predicate self-check (c1): the covered weaker same-type segment survived (%) — '
                      'wall-clock means its time passed while the stronger effect ran', v_q;
    end if;

    -- (c2) A WEAKER SEGMENT THAT OUTLIVES THE NEW ONE SURVIVES — the other half of
    --      the same branch, so (c1) cannot pass by dropping everything.
    update public.player_state set buffs = jsonb_build_array(
        jsonb_build_object('type', v_type, 'magnitude', greatest(1, v_mag - 1),
                           'until', to_jsonb(now() + make_interval(secs => (v_dur / 1000.0) + 600))))
      where user_id = v_uid and slot = 0;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                'items', jsonb_build_object(v_item, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'predicate self-check (c2): the consume was refused: %', v_r; end if;
    if (select count(*) from public.player_state ps, jsonb_array_elements(ps.buffs) as e(v)
         where ps.user_id = v_uid and ps.slot = 0 and e.v->>'type' = v_type) <> 2 then
      raise exception 'predicate self-check (c2): the OUTLIVING weaker segment was dropped — it must '
                      'resume after the stronger one';
    end if;

    raise exception using errcode = 'HR829', message = 'buff-segments-predicate §2 complete — rolling back';
  exception when sqlstate 'HR829' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'buff-segments-predicate: §2 LEAKED a probe row'; end if;

  raise notice 'buff-segments-predicate PASSED: the repo and production now carry the same predicate; '
               'the old and new forms select IDENTICALLY across the full cross-product (equivalent, '
               'proven by execution, so no behaviour changed); a covered weaker segment is still '
               'dropped while another type''s segment and an outliving weaker segment both survive; '
               'every predecessor block, the 2-site buff_at_max shape pin and the grant posture are '
               'intact';
end $mig$;
