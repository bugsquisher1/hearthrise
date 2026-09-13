-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-13-buff-segments.sql — SAME-TYPE BUFFS STACK AS SEGMENTS, EACH AT
--                                ITS OWN MAGNITUDE.
--
-- F2 from the 2026-09-13 Security review, on the game-designer's final ruling
-- (option A, per-segment). It replaces the merge this lane shipped two migrations
-- ago, which was `magnitude = max(old, new)` on a single entry per type.
--
-- ── THE LAUNDERING max() LEFT OPEN ─────────────────────────────────────────
-- Under max(), eating a 2-minute Roasted Carrot (12 gold) while a Moonbloom
-- Elixir (2,600 gold) ran EXTENDED the elixir's +5 % by two more minutes: the
-- cheap food carried the expensive magnitude. Thirty carrots bought an hour of
-- the elixir's effect. The magnitude was safe from dilution and the DURATION was
-- the faucet — the opposite of the mistake max() was guarding against.
--
-- ── THE RULE (game-designer, final, 2026-09-13) ────────────────────────────
-- A type's queue is a list of CONTIGUOUS SEGMENTS, each with its own absolute
-- `until` and its own magnitude. Segment n starts where segment n-1 ended, so no
-- start field is stored and the RUNNING segment is simply the one with the
-- soonest expiry — src/core/buffs.js `buffBonuses` groups by type and pays that
-- one. (It used to SUM same-type entries: measured 0.07 for a +5 % elixir beside a
-- +2 % trout, i.e. the cheap food ADDING to the expensive one. That is fixed in
-- the same commit as this file, and it is why the two halves are not safe in
-- either order for a character who already has segments.)
--
-- Applying a food of type T, magnitude M, duration D at the server instant N:
--   1. every segment of T that has already expired is DROPPED (pruning on write
--      keeps the column bounded with no sweeper job);
--   2. the new segment QUEUES BEHIND every live segment of T whose magnitude is
--      >= M:   start = max(N, latest until among those);
--   3. end = min(start + D × c_buff_scale, N + c_buff_max_ms);
--   4. every live segment of T that is WEAKER than M and expires at or before
--      `end` is DROPPED — the stronger effect COVERS it and, because the drain is
--      WALL-CLOCK, its time really did pass while the stronger one ran;
--   5. a weaker segment that expires AFTER `end` SURVIVES UNCHANGED and resumes
--      when the new one ends;
--   6. if step 2 landed exactly on a live segment of T whose magnitude is already
--      M, that segment is EXTENDED to `end` instead of a second entry being
--      written — a same-magnitude re-eat is one longer segment, not two.
-- Segments of OTHER types are never touched.
--
-- ⚠ THE ONE ASYMMETRY, STATED BECAUSE IT IS A RULING AND NOT AN ACCIDENT.
--   Stronger-then-weaker and weaker-then-stronger are NOT mirror images:
--     · elixir (+5 %, 8 min) then trout (+2 %, 3 min) → +5 % for 8 min, then +2 %
--       for 3. The trout waits its turn (step 2).
--     · trout (+2 %, 3 min) then elixir (+5 %, 8 min) → the ELIXIR STARTS NOW
--       (nothing live is >= 5), and the trout's remaining 3 minutes fall INSIDE
--       the elixir's 8, so they are GONE (step 4). Had the trout had 12 minutes
--       left it would resume at minute 8 with 4 minutes on it (step 5).
--   That asymmetry IS the wall-clock ruling (BUFF_DRAIN_RULE, src/core/buffs.js):
--   time passes for a buff whether or not it is the one being paid. The
--   alternative — pausing the weaker buff and pushing its whole remainder behind
--   the stronger one — would make a buff's clock stop, which is exactly what this
--   design removed when it replaced `remainingMs` with an absolute `until`.
--
-- ── WHY THIS CANNOT BE LAUNDERED ───────────────────────────────────────────
-- A cheap food can only ever write a segment at ITS OWN magnitude, so the
-- expensive magnitude is bounded by the expensive food's own duration for ever.
-- The 60-minute ceiling still bounds the STOCK: `end` is clamped to
-- N + c_buff_max_ms, so a type's last expiry can never be more than an hour out
-- however many are eaten.
--
-- ── THE TWO FUSES A SEGMENT LIST NEEDS ─────────────────────────────────────
--   · buff_at_max is now PER SEGMENT: the minimum-gain fuse measures
--     `cap - start` against 10 % of the food's duration, and `start` is the
--     SEGMENT's start, so a stacked tail near the ceiling refuses instead of
--     eating the food for a few seconds.
--   · c_buff_max_segments (8 per type) is NEW and it is a COST fuse, not balance.
--     Without it the entry count is bounded only by (60 min ÷ the shortest food)
--     × the type vocabulary = 30 × 9 = 270 entries ≈ 25 KB of jsonb on EVERY
--     hr_state_of — and the envelope is read on every boot, settle and activity
--     switch. Eight live segments of ONE type requires eating eight successively
--     weaker same-type foods inside an hour, which no honest player does. It is a
--     REFUSAL (`buff_at_max`, why=segment_budget) and never a silent drop, because
--     spending food for nothing is the outcome the designer's ruling forbids by
--     name. player_state_buffs_sane widens 64 -> 256 to match (8 × 9 = 72 worst
--     case, ~3.5× headroom, still a blast radius).
--
-- ── COST AT 100× PLAYERS ──────────────────────────────────────────────────
-- Typical queue 0–2 entries (~90 B); worst case 72 (~7 KB) and only for a
-- character that deliberately stacked eight segments of every type inside an hour.
-- No new table, column, index or row. The column is still rewritten only by an
-- apply carrying `buff_apply` — once per food eaten, inside an UPDATE that was
-- already happening — and the projection aggregates over ≤72 in-memory elements.
--
-- RESTATEMENT-DEBT-ACK: this replaces a block THIS LANE authored two migrations
--   ago inside a body an agent cannot read (tools/apply-migration.mjs and
--   tests/live-hash-drift.baseline.json are Coordinator-only). Every anchor below
--   is that block's own text, asserted EXACTLY ONCE, so it is the one region of a
--   27-patch hr_apply this file can account for line by line; a restatement would
--   blind-overwrite everyone else's patches on the economy's single write path
--   (the b484-b487 class). Paydown stays the Coordinator's, scheduled.
--
-- ⚠ AFTER APPLYING: hr_apply is LIVE-HASH-TRACKED and patched programmatically —
--   re-seed with `node tests/live-hash-drift.mjs --live --write`, whys from
--   `--codediff`. THE EDGE MUST BE REDEPLOYED AT THE SAME CUT (src/core/buffs.js
--   changes in the same commit).
-- ⚠ APPLY ORDER: after 2026-09-13-buff-apply-coupling.sql — §0 fails closed
--   without `buff_not_paid`, because segment rules an UNPAID buff can reach are
--   segment rules an engine bug hands out for free.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED, ANCHORS EXACTLY ONCE ───────────────────
do $mig$
declare
  v_apply text; v_state text; v_n int;
  c_a_decl  constant text := $anc$  v_buffs_new   jsonb;$anc$;
  c_a_base  constant text := $anc$      select e.v into v_buff_old$anc$;
  c_a_merge constant text := $anc$      -- MAGNITUDE = max(old, new).$anc$;
begin
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null then
    raise exception 'hr_apply is missing — apply the apply-engine chain first'; end if;
  v_apply := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  v_state := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');

  if strpos(v_apply, $q$if p_delta ? 'buff_apply' then$q$) = 0 then
    raise exception 'hr_apply does not handle buff_apply — apply 2026-09-13-consumable-buffs.sql first';
  end if;
  if strpos(v_apply, 'buff_not_paid') = 0 then
    raise exception 'hr_apply does not require the debit — apply 2026-09-13-buff-apply-coupling.sql '
                    'BEFORE this file (segment rules an unpaid buff can reach are free segments)';
  end if;
  if strpos(v_state, $q$'buffs', coalesce($q$) = 0 then
    raise exception 'hr_state_of does not project buffs — apply 2026-09-13-consumable-buffs.sql first';
  end if;
  if strpos(v_apply, 'v_buff_gain < v_buff_need') = 0 then
    raise exception 'hr_apply has no minimum-gain fuse — this file makes it PER SEGMENT and cannot '
                    'install a per-segment form of a fuse that is not there';
  end if;

  v_n := (length(v_apply) - length(replace(v_apply, c_a_decl, ''))) / length(c_a_decl);
  if v_n <> 1 then raise exception 'hr_apply: the declare anchor appears % time(s), expected exactly 1', v_n; end if;
  v_n := (length(v_apply) - length(replace(v_apply, c_a_base, ''))) / length(c_a_base);
  if v_n <> 1 then raise exception 'hr_apply: the live-entry anchor appears % time(s), expected exactly 1', v_n; end if;
  v_n := (length(v_apply) - length(replace(v_apply, c_a_merge, ''))) / length(c_a_merge);
  if v_n <> 1 then raise exception 'hr_apply: the merge anchor appears % time(s), expected exactly 1', v_n; end if;
end $mig$;

-- ── 1. THE COLUMN'S BLAST RADIUS, WIDENED FOR SEGMENTS ─────────────────────
-- 64 -> 256. Honest worst case is c_buff_max_segments × the type vocabulary
-- (8 × 9 = 72). Dropped and re-added rather than left alone: a CHECK that refuses
-- an honest eighth segment would turn a legal consume into a rolled-back settle.
do $mig$
begin
  alter table public.player_state drop constraint if exists player_state_buffs_sane;
  alter table public.player_state
    add constraint player_state_buffs_sane
    check (jsonb_typeof(buffs) = 'array' and jsonb_array_length(buffs) <= 256);
end $mig$;

-- ── 2. hr_apply — THE SEGMENT MODEL ────────────────────────────────────────
do $mig$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'c_buff_max_segments') > 0 then
    raise notice 'hr_apply already stacks buff segments — patch skipped'; return; end if;

  -- 2a. THE DECLARES.
  v_def := replace(v_def,
    $anc$  v_buffs_new   jsonb;$anc$,
    $anc$  -- Per-segment stacking (2026-09-13). c_buff_max_segments is a COST fuse, not a
  -- balance number: without it the entry count is bounded only by (60 min / the
  -- shortest food) x the type vocabulary = 270 entries ~ 25 KB of jsonb on every
  -- hr_state_of, and that envelope is read on every boot, settle and switch.
  c_buff_max_segments constant int := 8;
  v_buff_segs   int;
  v_buff_same   jsonb;
  v_buffs_new   jsonb;$anc$);

  -- 2b. THE SEGMENT'S START, THE BUDGET, AND THE SAME-MAGNITUDE TWIN.
  --     Replaces the single-entry lookup and the base assignment wholesale: the
  --     start is no longer "the type's tail" but "the tail of everything at least
  --     as STRONG", which is what makes a weaker food wait and a stronger one take
  --     over now. `v_buff_old` keeps its declare and stops being read.
  v_def := replace(v_def,
    $anc$      select e.v into v_buff_old
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
       where e.v->>'type' = v_buff_type
         and (e.v->>'until')::timestamptz > v_buff_now
       order by (e.v->>'until')::timestamptz desc
       limit 1;

      v_buff_base := greatest(v_buff_now,
                              coalesce((v_buff_old->>'until')::timestamptz, v_buff_now));$anc$,
    $anc$      -- PER-SEGMENT STACKING (2026-09-13). The new segment starts at the latest
      -- expiry among live segments of this type that are AT LEAST AS STRONG — so a
      -- weaker dish waits its turn behind the Feast, and a stronger one starts NOW.
      -- `until > v_buff_now` throughout: an expired segment can never extend
      -- anything, or a buff that ran out yesterday would make today's pie last two
      -- hours.
      select max((e.v->>'until')::timestamptz) into v_buff_base
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
       where e.v->>'type' = v_buff_type
         and (e.v->>'until')::timestamptz > v_buff_now
         and (e.v->>'magnitude')::numeric >= v_buff_mag;
      v_buff_base := greatest(v_buff_now, coalesce(v_buff_base, v_buff_now));

      -- THE SEGMENT BUDGET (cost fuse). Counted over LIVE segments of this type
      -- only, so an expired stack costs nothing. A REFUSAL, never a silent drop:
      -- spending food for nothing is the outcome the ruling forbids by name.
      select count(*) into v_buff_segs
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
       where e.v->>'type' = v_buff_type
         and (e.v->>'until')::timestamptz > v_buff_now;
      if v_buff_segs >= c_buff_max_segments then
        perform public.hr_reject('buff_at_max',
          jsonb_build_object('type', v_buff_type, 'why', 'segment_budget',
                             'segments', v_buff_segs, 'limit', c_buff_max_segments));
      end if;

      -- THE TWIN: the segment this one would be contiguous with AND identical to.
      -- A same-magnitude re-eat is ONE longer segment, not two — otherwise a
      -- player topping up the same dish would fill the budget with duplicates of
      -- the same number.
      select e.v into v_buff_same
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
       where e.v->>'type' = v_buff_type
         and (e.v->>'magnitude')::numeric = v_buff_mag
         and (e.v->>'until')::timestamptz = v_buff_base
       limit 1;$anc$);

  -- 2c. THE REBUILD, in ONE aggregate. Its WHERE clause is the whole ruling:
  --     another type -> kept if live; this type and at least as strong -> kept
  --     (the new segment queued behind it); this type, weaker, expiring AFTER the
  --     new segment -> kept, it resumes later; this type, weaker, covered by the
  --     new segment -> DROPPED (wall-clock: its time passed); the twin -> dropped
  --     here and re-added below as the EXTENDED segment.
  v_def := replace(v_def,
    $anc$      -- MAGNITUDE = max(old, new). Never a sum (two pies would be +4% forever)
      -- and never a replace (a Roasted Carrot must not dilute a Void Banquet).
      v_buff_newmag := greatest(v_buff_mag, coalesce((v_buff_old->>'magnitude')::numeric, 0));
      -- THE MERGED QUEUE: every OTHER type still running, plus this one. Expired
      -- entries of other types are dropped here — pruning on write is what keeps
      -- the column bounded without a sweeper job, and merge-by-type is what keeps
      -- it at one row per type.
      select coalesce(jsonb_agg(e.v order by (e.v->>'until')::timestamptz), '[]'::jsonb)
        into v_buffs_new
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
       where e.v->>'type' <> v_buff_type
         and (e.v->>'until')::timestamptz > v_buff_now;
      v_buffs_new := v_buffs_new || jsonb_build_array(jsonb_build_object(
        'type', v_buff_type,
        'magnitude', v_buff_newmag,
        'until', to_jsonb(v_buff_until)));$anc$,
    $anc$      -- THE NEW MAGNITUDE IS THE FOOD'S OWN, and that is the whole ruling:
      -- `max(old, new)` let a 12-gold Roasted Carrot extend a 2,600-gold elixir's
      -- +5% by its own two minutes. A cheap food can now only ever write a cheap
      -- segment.
      v_buff_newmag := v_buff_mag;
      -- THE REBUILT QUEUE — one pass, and the WHERE clause IS the ruling:
      --   · another type                        -> kept if still live, untouched
      --   · this type, magnitude >= the new one  -> kept (the new one is behind it)
      --   · this type, weaker, expiring AFTER the new segment -> kept, it resumes
      --   · this type, weaker, covered by the new segment -> DROPPED (wall-clock:
      --     its time passed while the stronger effect ran)
      --   · the twin from 2b (same magnitude, contiguous) -> dropped here and
      --     re-added below as one EXTENDED segment
      select coalesce(jsonb_agg(e.v order by (e.v->>'until')::timestamptz), '[]'::jsonb)
        into v_buffs_new
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
       where (e.v->>'until')::timestamptz > v_buff_now
         and (((e.v->>'type') <> v_buff_type)
              -- ⚠ THE SECOND BRANCH RE-TESTS THE TYPE, and it is not redundant.
              --   Without `type = v_buff_type` here, AND binding tighter than OR
              --   made this arm apply to EVERY row: another type's segment was kept
              --   by whichever of the two branches happened to be true, so the
              --   predicate did not say what its comment said and an edit to the
              --   first branch would have changed other-type handling silently.
              --   MEASURED: tests/buff-queue.mjs's merge_replaces_other_types
              --   mutation (drop every other type) STAYED GREEN, because the
              --   other types survived through this branch.
              or ((e.v->>'type') = v_buff_type
                  and not (v_buff_same is not null and e.v = v_buff_same)
                  and ((e.v->>'magnitude')::numeric >= v_buff_mag
                       or (e.v->>'until')::timestamptz > v_buff_until)));
      v_buffs_new := v_buffs_new || jsonb_build_array(jsonb_build_object(
        'type', v_buff_type,
        'magnitude', v_buff_newmag,
        'until', to_jsonb(v_buff_until)));
      -- CANONICAL ORDER: the stored array is sorted by expiry, always. Nothing
      -- DEPENDS on it (hr_state_of sorts its own projection and src/core/buffs.js
      -- picks the soonest expiry), which is precisely why it is pinned here: a row
      -- a human reads out of order is a row the next reader indexes wrongly — §3(b3)
      -- below did exactly that on the first draft, because the append put a
      -- just-started stronger segment AFTER an older weaker one.
      select coalesce(jsonb_agg(e.v order by (e.v->>'until')::timestamptz), '[]'::jsonb)
        into v_buffs_new from jsonb_array_elements(v_buffs_new) as e(v);$anc$);

  execute v_def;
  raise notice 'hr_apply patched: same-type buffs stack as segments at their own magnitudes';
end $mig$;
-- create-or-replace preserves an ACL; re-state it anyway.
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
grant  execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 3. SELF-CHECK (§4) — ALL FOUR ORDERINGS, BY EXECUTION ──────────────────
-- Every branch of the ruling is DRIVEN against a fabricated character inside a
-- subtransaction discarded by a sentinel raise (HR827), so this block is net-zero
-- on production. The magnitudes and durations are SEEDED rather than taken from
-- the catalogue: the four orderings need a strong-long and a weak-short pair with
-- a known relationship, and a balance change must never be able to make this
-- vacuous.
do $mig$
declare
  v_apply text; v_r jsonb; v_ver bigint; v_q jsonb; v_n int; v_item text; v_type text;
  v_mag numeric; v_dur bigint; v_until timestamptz; v_i int;
  v_uid  constant uuid := '000000b3-0000-0000-0000-0000000000b3';
  c_j    constant jsonb := '{"kind":"admin","intent":"buff-segments:probe"}'::jsonb;
begin
  v_apply := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  -- (a) THE TEXT THAT MUST BE GONE, and the text that must be there. max() is the
  --     laundering; its absence is the point of the file.
  if strpos(v_apply, 'v_buff_newmag := greatest(v_buff_mag') > 0 then
    raise exception 'segments self-check (a): the max() merge is still installed — a cheap food can '
                    'still carry an expensive magnitude';
  end if;
  if strpos(v_apply, 'c_buff_max_segments constant int := 8;') = 0
     or strpos(v_apply, 'segment_budget') = 0 then
    raise exception 'segments self-check (a): the segment budget is missing — the queue would be bounded '
                    'only by 60 min / the shortest food, i.e. ~270 entries on every envelope read';
  end if;
  if strpos(v_apply, $q$and (e.v->>'magnitude')::numeric >= v_buff_mag$q$) = 0 then
    raise exception 'segments self-check (a): the start is not derived from the stronger-or-equal '
                    'segments — a weaker food would not wait its turn';
  end if;
  if strpos(v_apply, 'v_buff_gain < v_buff_need') = 0 then
    raise exception 'segments self-check (a): the minimum-gain fuse is gone'; end if;
  -- …and the predecessors this file must not have eaten.
  if strpos(v_apply, 'buff_not_paid') = 0 or strpos(v_apply, $q$where t.bk <> 'item'$q$) = 0
     or strpos(v_apply, 'v_out := public.hr_state_of(v_uid, v_slot);') = 0 then
    raise exception 'segments self-check (a): the patch was not additive — a predecessor block is gone';
  end if;
  if has_function_privilege('authenticated', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute') then
    raise exception 'segments self-check (a): hr_apply is executable by a client role';
  end if;
  -- The widened CHECK admits 72 (the honest worst case) and refuses 257.
  declare v_expr text; v_ok boolean;
  begin
    select pg_get_expr(conbin, conrelid) into v_expr from pg_constraint
     where conrelid = 'public.player_state'::regclass and conname = 'player_state_buffs_sane';
    if v_expr is null then raise exception 'segments self-check (a): the CHECK is missing'; end if;
    execute format('select (%s)', replace(v_expr, 'buffs',
      $$(select jsonb_agg(jsonb_build_object('t', i)) from generate_series(1, 72) i)$$)) into v_ok;
    if v_ok is not true then
      raise exception 'segments self-check (a): the CHECK refuses the honest worst case of 72 segments '
                      '(8 per type x 9 types) — a legal consume would be a rolled-back settle';
    end if;
    execute format('select (%s)', replace(v_expr, 'buffs',
      $$(select jsonb_agg(jsonb_build_object('t', i)) from generate_series(1, 257) i)$$)) into v_ok;
    if v_ok is not false then
      raise exception 'segments self-check (a): the CHECK is no longer a blast radius'; end if;
  end;

  begin
    -- A REAL buff food, for the catalogue lookup and the debit; the SEGMENTS are
    -- then seeded directly so the four orderings are exact.
    select b.item_id, b.type, b.magnitude, b.duration_ms
      into v_item, v_type, v_mag, v_dur
      from public.hr_item_buffs b order by b.duration_ms desc, b.item_id limit 1;
    if v_item is null then raise exception 'segments self-check (b): FIXTURE — no buff food'; end if;

    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to)
      values (v_uid, 0, 0, 0, 10, 10, 1, now())
      on conflict (user_id, slot) do update set version = 1, buffs = '[]'::jsonb;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, 0, v_item, 500)
      on conflict (user_id, slot, item_id) do update set qty = 500;

    -- ── (b1) STRONGER-THEN-WEAKER: the new segment WAITS ─────────────────────
    -- A stronger segment of the same type is already running and ends well after
    -- the food's own duration would. The food must APPEND at its own magnitude,
    -- starting where the strong one ends.
    update public.player_state set buffs = jsonb_build_array(jsonb_build_object(
        'type', v_type, 'magnitude', v_mag + 10,
        'until', to_jsonb(now() + make_interval(secs => 300))))
      where user_id = v_uid and slot = 0;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                'items', jsonb_build_object(v_item, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'segments self-check (b1): a weaker same-type consume was refused: %', v_r; end if;
    select buffs into v_q from public.player_state where user_id = v_uid and slot = 0;
    if jsonb_array_length(v_q) <> 2 then
      raise exception 'segments self-check (b1): expected TWO segments, got %', v_q; end if;
    if (v_q->0->>'magnitude')::numeric <> v_mag + 10 or (v_q->1->>'magnitude')::numeric <> v_mag then
      raise exception 'segments self-check (b1): the segments carry the wrong magnitudes (%) — the cheap '
                      'food must NOT inherit the expensive one', v_q;
    end if;
    if (v_q->1->>'until')::timestamptz <= (v_q->0->>'until')::timestamptz then
      raise exception 'segments self-check (b1): the weaker segment does not START where the stronger '
                      'ends: %', v_q;
    end if;

    -- ── (b2) WEAKER-THEN-STRONGER: the stronger starts NOW and COVERS ────────
    -- A weak segment with 60 s left, then a strong long food: the strong one
    -- starts now, and the weak remainder falls inside it, so it is GONE.
    update public.player_state set buffs = jsonb_build_array(jsonb_build_object(
        'type', v_type, 'magnitude', greatest(1, v_mag - 1),
        'until', to_jsonb(now() + interval '60 seconds')))
      where user_id = v_uid and slot = 0;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                'items', jsonb_build_object(v_item, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'segments self-check (b2): a stronger same-type consume was refused: %', v_r; end if;
    select buffs into v_q from public.player_state where user_id = v_uid and slot = 0;
    if jsonb_array_length(v_q) <> 1 or (v_q->0->>'magnitude')::numeric <> v_mag then
      raise exception 'segments self-check (b2): the covered weaker segment survived (%) — wall-clock '
                      'means its time passed while the stronger effect ran', v_q;
    end if;
    if abs(extract(epoch from ((v_q->0->>'until')::timestamptz - now())) * 1000 - v_dur) > 5000 then
      raise exception 'segments self-check (b2): the stronger segment did not start NOW (%)', v_q; end if;

    -- ── (b3) WEAKER-THEN-STRONGER, BUT THE WEAK ONE OUTLIVES IT ─────────────
    -- Same shape, except the weak segment ends AFTER the strong one would. It must
    -- SURVIVE, unchanged, and resume when the strong segment ends.
    update public.player_state set buffs = jsonb_build_array(jsonb_build_object(
        'type', v_type, 'magnitude', greatest(1, v_mag - 1),
        'until', to_jsonb(now() + make_interval(secs => (v_dur / 1000.0) + 600))))
      where user_id = v_uid and slot = 0;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                'items', jsonb_build_object(v_item, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'segments self-check (b3): the consume was refused: %', v_r; end if;
    select buffs into v_q from public.player_state where user_id = v_uid and slot = 0;
    if jsonb_array_length(v_q) <> 2 then
      raise exception 'segments self-check (b3): the outliving weaker segment was DROPPED (%) — it ends '
                      'after the stronger one and must resume', v_q;
    end if;
    if (v_q->0->>'magnitude')::numeric <> v_mag
       or (v_q->1->>'magnitude')::numeric <> greatest(1, v_mag - 1) then
      raise exception 'segments self-check (b3): the surviving order is wrong — the STRONGER must run '
                      'first and the weaker resume after it: %', v_q;
    end if;

    -- ── (b4) SAME MAGNITUDE: ONE segment, EXTENDED ──────────────────────────
    update public.player_state set buffs = jsonb_build_array(jsonb_build_object(
        'type', v_type, 'magnitude', v_mag,
        'until', to_jsonb(now() + interval '60 seconds')))
      where user_id = v_uid and slot = 0;
    v_until := now() + interval '60 seconds';
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                'items', jsonb_build_object(v_item, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'segments self-check (b4): a same-magnitude re-eat was refused: %', v_r; end if;
    select buffs into v_q from public.player_state where user_id = v_uid and slot = 0;
    if jsonb_array_length(v_q) <> 1 then
      raise exception 'segments self-check (b4): a same-magnitude re-eat made % segments instead of '
                      'extending one — a player topping up one dish would fill the budget with '
                      'duplicates of the same number', v_q;
    end if;
    if (v_q->0->>'until')::timestamptz <= v_until then
      raise exception 'segments self-check (b4): the segment was not EXTENDED (%)', v_q; end if;

    -- ── (b5) THE SEGMENT BUDGET REFUSES, AND DEBITS NOTHING ────────────────
    -- Eight live segments of this type, then one more consume. Seeded, because
    -- reaching eight honestly needs eight successively weaker foods.
    update public.player_state set buffs = (
        select jsonb_agg(jsonb_build_object('type', v_type, 'magnitude', v_mag + 20 - i,
                 'until', to_jsonb(now() + make_interval(secs => 120 * i))))
          from generate_series(1, 8) i)
      where user_id = v_uid and slot = 0;
    select qty into v_n from public.player_inventory
     where user_id = v_uid and slot = 0 and item_id = v_item;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                'items', jsonb_build_object(v_item, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'true') <> 'false' or v_r->>'error' <> 'buff_at_max'
       or v_r->>'why' <> 'segment_budget' then
      raise exception 'segments self-check (b5): a ninth live segment was not refused as '
                      'buff_at_max/segment_budget: %', v_r;
    end if;
    if (select qty from public.player_inventory
         where user_id = v_uid and slot = 0 and item_id = v_item) <> v_n then
      raise exception 'segments self-check (b5): the budget refusal still ate the food'; end if;

    -- ── (b6) THE CAP STILL BOUNDS THE TYPE'S LAST EXPIRY ───────────────────
    -- Repeated same-magnitude consumes extend ONE segment onto the ceiling and are
    -- then refused; nothing can push a type's tail past now + c_buff_max_ms.
    update public.player_state set buffs = '[]'::jsonb where user_id = v_uid and slot = 0;
    for v_i in 1..200 loop
      select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
      v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
               jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                  'items', jsonb_build_object(v_item, -1), 'journal', c_j));
      exit when coalesce(v_r->>'ok', 'false') <> 'true';
      select max((e.v->>'until')::timestamptz) into v_until
        from public.player_state ps, jsonb_array_elements(ps.buffs) as e(v)
       where ps.user_id = v_uid and ps.slot = 0;
      if v_until > now() + make_interval(secs => 3600) + interval '5 seconds' then
        raise exception 'segments self-check (b6): the type''s last expiry ran PAST the 60-minute cap (%)',
                        v_until;
      end if;
    end loop;
    if coalesce(v_r->>'error', '') <> 'buff_at_max' then
      raise exception 'segments self-check (b6): repeated consumes never hit the ceiling (%)', v_r; end if;

    raise exception using errcode = 'HR827', message = 'buff-segments §3 complete — rolling back';
  exception when sqlstate 'HR827' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'segments self-check: §3 LEAKED a probe row'; end if;

  raise notice 'buff-segments self-check PASSED: max() is gone; a weaker same-type food APPENDS a '
               'segment at its own magnitude starting where the stronger one ends; a stronger one '
               'starts NOW and covers a weaker remainder that falls inside it, while one that outlives '
               'it survives and resumes after; a same-magnitude re-eat EXTENDS one segment; a ninth '
               'live segment is refused buff_at_max/segment_budget without eating the food; the '
               '60-minute ceiling still bounds the type''s last expiry; the widened CHECK admits 72 and '
               'refuses 257; no predecessor block was eaten and no client role can execute hr_apply';
end $mig$;
