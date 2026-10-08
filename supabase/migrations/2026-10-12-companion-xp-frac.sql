-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-12-companion-xp-frac.sql — THE PET'S FRACTIONAL XP IS CARRIED, AND
--                                     ITS CAP IS THE SERVER'S.
--
-- STATUS: STAGED, NOT APPLIED - REVIEW ONLY. Moves companion XP (the value the
-- levelled companion perk is priced from), so it moves only on a Security GO
-- and the Coordinator applies it (one file, tools/apply-migration.mjs).
-- APPLY ORDER: after 2026-10-09-xp-frac-carry.sql (its §0 refuses otherwise).
-- EITHER ORDER WITH THE EDGE IS SAFE: the engine proposes `companion_xp_frac`
-- only when hr_state_of projects `companions.frac` (envelope.js presence of
-- key), which only this file makes it do — an edge deployed first proposes
-- nothing new, and this file applied first projects a key the old edge
-- ignores. The cap clamp (§2c) needs no edge at all.
--
-- ── THE TWO RESIDUALS (Security, accepted for b566, fix requested) ──────────
-- (a) A utility pet earns 0.5 companion XP an action, and the engine floored it
--     per SETTLE. On the world tick a settle is a 90 s window of 10 s polls, so
--     the QA sentinel's Fox on mithril — about one swing a window — earned
--     NOTHING from the tick, and across a tick chain a utility pet ran ~4% under
--     one span of the same actions. The xp_frac class exactly
--     (2026-10-09-xp-frac-carry.sql), so the xp_frac cure exactly: a
--     server-owned remainder in [0,1), REFUSED out of range (never clamped),
--     written only by hr_apply as an OVERWRITE, projected by hr_state_of, never
--     client-writable, folded per key by the tick (FOLD_CHAIN_KEYS,
--     ABSOLUTE_MAP). The engine reuses grantXp's fixed point
--     (src/core/companion-xp.js companionSpanGrant).
-- (b) COMPANION_XP_CAP (cumulative XP to companion level 30, 792,783) was
--     enforced ONLY by the edge (companionSpanGrant's headroom). hr_apply added
--     any `stat companion_xp:<id>` op up to c_max_progress_add per call, so a
--     forged or buggy edge could push a pet past the cap. Now hr_apply clamps
--     the add to the headroom and JOURNALS the clamp on the apply's ledger row
--     (meta.delta.cxc = {<key>: {proposed, credited, had}}).
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
--   §1 player_progress.xp_frac numeric NOT NULL DEFAULT 0 (catalogue-only), and
--      a CHECK: in [0,1), and non-zero ONLY on a permanent companion XP row
--      (kind 'stat', period '', key 'companion_xp:%'). Added NOT VALID then
--      VALIDATEd, so the scan holds SHARE UPDATE EXCLUSIVE, never blocking a
--      settle; with a constant default every row passes.
--   §2 hr_apply: (a) `companion_xp_frac` joins the delta-key allowlist;
--      (b) the declarations; (c) the cap clamp in the progress loop;
--      (d) the remainder block after the progress loop — an object whose every
--      key is the character's EQUIPPED companion (player_state.companion_equipped,
--      version-bumped by hr_companion_equip, so the engine's read and this check
--      see the same pet) and whose values are numbers in [0,1), upserted onto
--      the pet's own `stat companion_xp:<id>` row as an overwrite;
--      (e) the clamp journal on the ledger row.
--   §3 hr_state_of projects `companions.frac` = {<id>: remainder} (non-zero
--      remainders only; absent = 0) beside `companions.xp`.
--   §4 self-check by execution on a probe character.
--
-- ── NO CLIENT WRITE PATH ────────────────────────────────────────────────────
-- `authenticated` holds SELECT on player_progress (RLS per user) and no column
-- write; the column has exactly one writer, hr_apply (hr_engine-only), from the
-- engine's own delta. No function body but hr_apply's and hr_state_of's names
-- `xp_frac` (asserted in §4 by scanning pg_proc — the same scan
-- 2026-10-09-xp-frac-carry.sql §4(b) runs, which this file keeps true). The
-- client renders `companions.xp` and never reads or sends the remainder.
--
-- ── COST AT 100x PLAYERS ────────────────────────────────────────────────────
-- One numeric per player_progress row (a catalogue default, no rewrite); it is
-- non-zero on at most one row per owned pet. The clamp reads one PK row per
-- companion op (one op per settle); the remainder write rides the apply that
-- already writes the pet's XP.
--
-- RESTATEMENT-DEBT-ACK: hr_apply and hr_state_of are live-hash-tracked bodies
--   patched programmatically. Each anchor is asserted EXACTLY ONCE and each is
--   the smallest region this file can account for: the xp_frac delta-key line,
--   the v_plot/v_prog declaration, the progress_clamp refusal, the end of the
--   progress loop, the ledger backstop, and the companions.xp projection.
-- ⚠ AFTER APPLYING: re-seed `node tests/live-hash-drift.mjs --live --write`
--   (hr_apply, hr_state_of), whys from `--codediff`, re-pin restore-census
--   (Coordinator).
-- REVERSIBILITY: drop the patched regions by hand in a follow-up, drop the
--   CHECK, and `alter table public.player_progress drop column xp_frac`;
--   nothing else reads it.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED, ANCHORS EXACTLY ONCE ───────────────────
do $mig$
declare
  v_apply text; v_state text; v_n int; a text;
  c_anchors_apply constant text[] := array[
    $anc$    'xp_frac',
$anc$,
    $anc$  v_plot  jsonb; v_prog jsonb;$anc$,
    $anc$          perform public.hr_reject('progress_clamp', jsonb_build_object('add', v_n));
        end if;$anc$,
    $anc$              updated_at = now();
      end loop;
    end if;$anc$,
    $anc$        'k', (select jsonb_agg(dk order by dk) from jsonb_object_keys(p_delta) as t(dk)));
    end if;$anc$];
  c_s constant text := $anc$           and pp.key like 'companion_xp:%'), '{}'::jsonb)),$anc$;
begin
  if to_regclass('public.player_progress') is null then
    raise exception 'player_progress is missing — apply 2026-08-11-player-state.sql first'; end if;
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null
     or to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_apply / hr_state_of missing — apply the engine chain first'; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'player_state'
                    and column_name = 'companion_equipped') then
    raise exception 'player_state.companion_equipped is missing — apply 2026-08-20-companion-model.sql first'; end if;
  v_apply := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  v_state := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  -- The carry this file mirrors must be there: its key, its column, its CHECK.
  if strpos(v_apply, $q$p_delta ? 'xp_frac'$q$) = 0
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'player_skills'
                       and column_name = 'xp_frac') then
    raise exception 'the skill XP carry is missing — apply 2026-10-09-xp-frac-carry.sql first'; end if;
  if strpos(v_apply, $q$'companion_xp_frac'$q$) = 0 then
    foreach a in array c_anchors_apply loop
      v_n := (length(v_apply) - length(replace(v_apply, a, ''))) / length(a);
      if v_n <> 1 then
        raise exception 'hr_apply: anchor % appears % time(s), expected exactly 1', left(a, 60), v_n; end if;
    end loop;
  end if;
  if strpos(v_state, $q$'frac', coalesce(($q$) = 0 then
    v_n := (length(v_state) - length(replace(v_state, c_s, ''))) / length(c_s);
    if v_n <> 1 then
      raise exception 'hr_state_of: the companions.xp anchor appears % time(s), expected exactly 1', v_n; end if;
  end if;
end $mig$;

-- ── 1. THE COLUMN, AND WHERE IT MAY BE NON-ZERO ─────────────────────────────
alter table public.player_progress
  add column if not exists xp_frac numeric not null default 0;
do $mig$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'player_progress_xp_frac_ck'
                    and conrelid = 'public.player_progress'::regclass) then
    alter table public.player_progress
      add constraint player_progress_xp_frac_ck check (
        xp_frac >= 0 and xp_frac < 1
        and (xp_frac = 0
             or (kind = 'stat' and period_key = '' and key like 'companion_xp:%'))) not valid;
  end if;
end $mig$;
alter table public.player_progress validate constraint player_progress_xp_frac_ck;
comment on column public.player_progress.xp_frac is
  'A companion''s carried fractional XP remainder, [0,1), on its own permanent stat companion_xp:<id> '
  'row and zero everywhere else. Written only by hr_apply from the engine''s companion_xp_frac delta '
  '(2026-10-12-companion-xp-frac.sql); projected by hr_state_of as companions.frac.';

-- ── 2. hr_apply — THE KEY, THE CAP CLAMP, THE REMAINDER, THE JOURNAL ───────
do $mig$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'companion_xp_frac'$q$) > 0 then
    raise notice 'hr_apply already carries companion_xp_frac — patch skipped'; return; end if;

  -- (a) the delta-key allowlist
  v_def := replace(v_def,
    $anc$    'xp_frac',
$anc$,
    $anc$    'xp_frac',
    -- THE PET'S CARRIED XP REMAINDER (2026-10-12-companion-xp-frac.sql): an
    -- ABSOLUTE map {<equipped companion id>: [0,1)}, the xp_frac shape. Engine
    -- output, never client input; written after the progress loop.
    'companion_xp_frac',
$anc$);

  -- (b) the declarations
  v_def := replace(v_def,
    $anc$  v_plot  jsonb; v_prog jsonb;$anc$,
    $anc$  v_plot  jsonb; v_prog jsonb;
  -- 2026-10-12-companion-xp-frac.sql. THE COMPANION XP CAP, ON THE SERVER:
  -- companionXpToReach(COMPANION_MAX_LEVEL) in src/core/companion-perk.js,
  -- pinned equal by tests/companion-xp-frac.mjs. Until this file the cap lived
  -- only in the edge. v_cxp_clamp collects the clamps this apply made, for the
  -- ledger row; v_cxp_have is the row's value before the op.
  c_companion_xp_cap constant bigint := 792783;
  v_cxp_have  bigint;
  v_cxp_clamp jsonb;$anc$);

  -- (c) the cap clamp, per companion XP op, after the generic progress clamp
  v_def := replace(v_def,
    $anc$          perform public.hr_reject('progress_clamp', jsonb_build_object('add', v_n));
        end if;$anc$,
    $anc$          perform public.hr_reject('progress_clamp', jsonb_build_object('add', v_n));
        end if;
        -- ── THE COMPANION XP CAP (2026-10-12-companion-xp-frac.sql) ─────────
        --    CLAMPED, not refused, and journalled: the engine clamps to the
        --    same headroom, so an honest op never reaches this, and refusing a
        --    whole settle over the pet's last few XP would cost the player the
        --    window's loot. `like` matches every row hr_state_of projects as a
        --    companion's XP. A row already over the cap is never reduced here.
        if v_prog->>'kind' = 'stat' and (v_prog->>'key') like 'companion_xp:%' then
          v_cxp_have := null;
          select pp.value into v_cxp_have from public.player_progress pp
           where pp.user_id = v_uid and pp.slot = v_slot and pp.kind = 'stat'
             and pp.key = v_prog->>'key' and pp.period_key = coalesce(v_prog->>'period', '');
          v_cxp_have := coalesce(v_cxp_have, 0);
          if v_cxp_have + v_n > c_companion_xp_cap then
            v_cxp_clamp := coalesce(v_cxp_clamp, '{}'::jsonb) || jsonb_build_object(v_prog->>'key',
              jsonb_build_object('proposed', v_n, 'had', v_cxp_have,
                                 'credited', greatest(0, c_companion_xp_cap - v_cxp_have)));
            v_n := greatest(0, c_companion_xp_cap - v_cxp_have);
          end if;
        end if;$anc$);

  -- (d) the remainder, after the progress loop (so the op's row exists)
  v_def := replace(v_def,
    $anc$              updated_at = now();
      end loop;
    end if;$anc$,
    $anc$              updated_at = now();
      end loop;
    end if;

    -- ── THE PET'S XP REMAINDER (2026-10-12-companion-xp-frac.sql) ─ ABSOLUTE.
    --    companionSpanGrant credits floor(remainder + 0.5 x actions) and
    --    carries the rest; this stores the rest on the pet's own row. Every
    --    key must be the EQUIPPED companion — the only pet a settle credits —
    --    and every value a number in [0,1): REFUSED, never clamped, exactly as
    --    xp_frac. An OVERWRITE: the engine proposes the absolute remainder.
    if p_delta ? 'companion_xp_frac' then
      if jsonb_typeof(p_delta->'companion_xp_frac') <> 'object' then
        perform public.hr_reject('bad_companion_xp_frac',
          jsonb_build_object('type', jsonb_typeof(p_delta->'companion_xp_frac')));
      end if;
      for k in select key from jsonb_each(p_delta->'companion_xp_frac') loop
        if k is distinct from v_st.companion_equipped then
          perform public.hr_reject('companion_not_equipped',
            jsonb_build_object('companion_id', left(k, 64)));
        end if;
        if jsonb_typeof(p_delta->'companion_xp_frac'->k) <> 'number'
           or (p_delta->'companion_xp_frac'->>k)::numeric < 0
           or (p_delta->'companion_xp_frac'->>k)::numeric >= 1 then
          perform public.hr_reject('bad_companion_xp_frac',
            jsonb_build_object('companion_id', k, 'value', p_delta->'companion_xp_frac'->k));
        end if;
        -- trunc, never round: round(0.9999996, 6) is 1, which the CHECK refuses.
        insert into public.player_progress as pp
          (user_id, slot, kind, key, period_key, value, state, xp_frac, updated_at)
        values (v_uid, v_slot, 'stat', 'companion_xp:' || k, '', 0, 'active',
                trunc((p_delta->'companion_xp_frac'->>k)::numeric, 6), now())
        on conflict (user_id, slot, kind, key, period_key) do update
          set xp_frac = excluded.xp_frac, updated_at = now();
      end loop;
    end if;$anc$);

  -- (e) the clamp journal, AFTER the size backstop so it is never summarised away
  --     (bounded: at most c_max_progress_ops entries)
  v_def := replace(v_def,
    $anc$        'k', (select jsonb_agg(dk order by dk) from jsonb_object_keys(p_delta) as t(dk)));
    end if;$anc$,
    $anc$        'k', (select jsonb_agg(dk order by dk) from jsonb_object_keys(p_delta) as t(dk)));
    end if;
    -- THE COMPANION XP CAP CLAMPS this apply made (2026-10-12-companion-xp-frac.sql):
    -- an honest edge never reaches the cap clamp, so a `cxc` here is evidence.
    if v_cxp_clamp is not null then
      v_meta := v_meta || jsonb_build_object('cxc', v_cxp_clamp);
    end if;$anc$);

  execute v_def;
  raise notice 'hr_apply patched: companion XP is capped on the server and its remainder is stored';
end $mig$;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
grant  execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 3. hr_state_of — PROJECT `companions.frac` BESIDE `companions.xp` ──────
do $mig$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'frac', coalesce(($q$) > 0 then
    raise notice 'hr_state_of already projects companions.frac — patch skipped'; return; end if;
  v_def := replace(v_def,
    $anc$           and pp.key like 'companion_xp:%'), '{}'::jsonb)),$anc$,
    $anc$           and pp.key like 'companion_xp:%'), '{}'::jsonb),
      -- THE PET'S CARRIED XP REMAINDER (2026-10-12-companion-xp-frac.sql). The
      -- engine's input (envelope.js companionXpFrac); non-zero only, absent = 0.
      'frac', coalesce((
        select jsonb_object_agg(substring(pp.key from 14), pp.xp_frac)
          from public.player_progress pp
         where pp.user_id = p_user and pp.slot = v_st.slot
           and pp.kind = 'stat' and pp.period_key = ''
           and pp.key like 'companion_xp:%' and pp.xp_frac > 0), '{}'::jsonb)),$anc$);
  execute v_def;
  raise notice 'hr_state_of patched: companions project their carried remainder';
end $mig$;
revoke execute on function public.hr_state_of(uuid, int) from public;
revoke execute on function public.hr_state_of(uuid, int) from anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 4. SELF-CHECK (§4) — BY EXECUTION, ON A PROBE CHARACTER ────────────────
-- Every arm drives a REAL hr_apply / hr_state_of against a fabricated character
-- inside a subtransaction discarded by a sentinel raise (HR947), so the block is
-- net-zero; a leak check runs after it.
do $mig$
declare
  v_r jsonb; v_ver bigint; v_ver2 bigint; v_env jsonb; v_got numeric; v_val bigint;
  v_names text; v_meta jsonb;
  v_uid constant uuid := '00000000-0000-4000-c000-00000c0f7ac1';
  c_cap constant bigint := 792783;
begin
  -- (a) THE COLUMN, ITS RANGE AND ITS SCOPE, by catalogue.
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'player_progress'
                    and column_name = 'xp_frac' and data_type = 'numeric' and is_nullable = 'NO') then
    raise exception 'companion-xp-frac self-check (a): player_progress.xp_frac is missing, not numeric or nullable'; end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'player_progress_xp_frac_ck'
                    and conrelid = 'public.player_progress'::regclass and convalidated) then
    raise exception 'companion-xp-frac self-check (a): the [0,1) companion-row CHECK is missing or not validated'; end if;

  -- (b) NO CLIENT WRITE PATH: no client role may write the column; no function
  --     body but hr_apply's and hr_state_of's names xp_frac.
  if has_column_privilege('authenticated', 'public.player_progress', 'xp_frac', 'UPDATE')
     or has_column_privilege('authenticated', 'public.player_progress', 'xp_frac', 'INSERT')
     or has_column_privilege('anon', 'public.player_progress', 'xp_frac', 'UPDATE')
     or has_column_privilege('anon', 'public.player_progress', 'xp_frac', 'INSERT') then
    raise exception 'companion-xp-frac self-check (b): a client role can write player_progress.xp_frac'; end if;
  select string_agg(distinct p.proname, ',' order by p.proname) into v_names
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosrc like '%xp\_frac%'
     and p.proname not in ('hr_apply', 'hr_state_of');
  if v_names is not null then
    raise exception 'companion-xp-frac self-check (b): functions other than hr_apply / hr_state_of name xp_frac: % '
                    '— the remainder must have exactly one writer', v_names; end if;
  if has_function_privilege('authenticated', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_state_of(uuid,int)', 'execute') then
    raise exception 'companion-xp-frac self-check (b): a client role can execute hr_apply / hr_state_of'; end if;

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    perform public.hr_create_character(0);
    -- The probe's own pet. A fabricated row inside the discarded subtransaction.
    update public.player_state set companion_equipped = 'fox' where user_id = v_uid and slot = 0;

    -- (c) A FRESH CHARACTER PROJECTS companions.frac = {} (present: the switch).
    v_env := public.hr_state_of(v_uid, 0);
    if coalesce(v_env->>'ok', 'false') <> 'true' then
      raise exception 'companion-xp-frac self-check (c): hr_state_of refused the probe (%)', v_env; end if;
    if (v_env #> '{companions,frac}') is distinct from '{}'::jsonb then
      raise exception 'companion-xp-frac self-check (c): a fresh character projects companions.frac %, expected {}',
                      v_env #> '{companions}'; end if;

    -- (d) A REMAINDER ALONE (the Fox's first half-swing: no whole XP yet) is
    --     accepted, creates the pet's row at value 0 and round-trips; then an
    --     XP op beside a new remainder lands both.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"companion_xp_frac":{"fox":0.5},"journal":{"kind":"admin","intent":"cxf:probe:d1"}}'::jsonb);
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'companion-xp-frac self-check (d): a valid remainder was REFUSED (%)', v_r; end if;
    v_env := public.hr_state_of(v_uid, 0);
    if (v_env #>> '{companions,frac,fox}')::numeric is distinct from 0.5
       or (v_env #>> '{companions,xp,fox}')::bigint is distinct from 0 then
      raise exception 'companion-xp-frac self-check (d): the remainder did not round-trip: %',
                      v_env #> '{companions}'; end if;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"progress":[{"kind":"stat","key":"companion_xp:fox","period":"","add":3,"state":"active"}],'
             '"companion_xp_frac":{"fox":0.25},"journal":{"kind":"admin","intent":"cxf:probe:d2"}}'::jsonb);
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'companion-xp-frac self-check (d): an XP op with a remainder was REFUSED (%)', v_r; end if;
    v_env := public.hr_state_of(v_uid, 0);
    if (v_env #>> '{companions,frac,fox}')::numeric is distinct from 0.25
       or (v_env #>> '{companions,xp,fox}')::bigint is distinct from 3 then
      raise exception 'companion-xp-frac self-check (d): expected fox xp 3 frac 0.25, got %',
                      v_env #> '{companions}'; end if;

    -- (e) AN XP-ONLY DELTA LEAVES THE REMAINDER ALONE (absent key = untouched).
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"progress":[{"kind":"stat","key":"companion_xp:fox","period":"","add":2,"state":"active"}],'
             '"journal":{"kind":"admin","intent":"cxf:probe:e"}}'::jsonb);
    select value, xp_frac into v_val, v_got from public.player_progress
     where user_id = v_uid and slot = 0 and kind = 'stat' and key = 'companion_xp:fox' and period_key = '';
    if coalesce(v_r->>'ok', 'false') <> 'true' or v_val is distinct from 5 or v_got is distinct from 0.25 then
      raise exception 'companion-xp-frac self-check (e): an XP-only delta left fox at % / % (%) — expected 5 / 0.25',
                      v_val, v_got, v_r; end if;

    -- (f) AN IMPOSSIBLE REMAINDER IS REFUSED — not clamped, not stored, no
    --     version bump — and so is one for a pet that is not equipped.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"companion_xp_frac":{"fox":1},"journal":{"kind":"admin","intent":"cxf:probe:one"}}'::jsonb);
    if v_r->>'error' is distinct from 'bad_companion_xp_frac' then
      raise exception 'companion-xp-frac self-check (f): a remainder of exactly 1 returned % — the range is [0,1)', v_r; end if;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"companion_xp_frac":{"fox":900},"journal":{"kind":"admin","intent":"cxf:probe:900"}}'::jsonb);
    if v_r->>'error' is distinct from 'bad_companion_xp_frac' then
      raise exception 'companion-xp-frac self-check (f): a remainder of 900 returned % — a 900-XP mint', v_r; end if;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"companion_xp_frac":{"fox":-0.1},"journal":{"kind":"admin","intent":"cxf:probe:neg"}}'::jsonb);
    if v_r->>'error' is distinct from 'bad_companion_xp_frac' then
      raise exception 'companion-xp-frac self-check (f): a negative remainder returned %', v_r; end if;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"companion_xp_frac":{"fox":"0.5"},"journal":{"kind":"admin","intent":"cxf:probe:str"}}'::jsonb);
    if v_r->>'error' is distinct from 'bad_companion_xp_frac' then
      raise exception 'companion-xp-frac self-check (f): a STRING remainder returned %', v_r; end if;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"companion_xp_frac":[0.5],"journal":{"kind":"admin","intent":"cxf:probe:arr"}}'::jsonb);
    if v_r->>'error' is distinct from 'bad_companion_xp_frac' then
      raise exception 'companion-xp-frac self-check (f): an ARRAY remainder returned %', v_r; end if;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"companion_xp_frac":{"wolf_pup":0.5},"journal":{"kind":"admin","intent":"cxf:probe:other"}}'::jsonb);
    if v_r->>'error' is distinct from 'companion_not_equipped' then
      raise exception 'companion-xp-frac self-check (f): a remainder for an unequipped pet returned %', v_r; end if;
    select xp_frac into v_got from public.player_progress
     where user_id = v_uid and slot = 0 and kind = 'stat' and key = 'companion_xp:fox' and period_key = '';
    select version into v_ver2 from public.player_state where user_id = v_uid and slot = 0;
    if v_got is distinct from 0.25 or v_ver2 <> v_ver
       or exists (select 1 from public.player_progress where user_id = v_uid and key = 'companion_xp:wolf_pup') then
      raise exception 'companion-xp-frac self-check (f): a REFUSED remainder moved a row (fox frac %, version % -> %)',
                      v_got, v_ver, v_ver2; end if;

    -- (g) THE TABLE CHECK BITES ON ITS OWN — out of range, and on any row that
    --     is not a permanent companion XP row.
    begin
      update public.player_progress set xp_frac = 1
       where user_id = v_uid and slot = 0 and kind = 'stat' and key = 'companion_xp:fox';
      raise exception 'companion-xp-frac self-check (g): the CHECK accepted xp_frac = 1';
    exception when check_violation then null;
    end;
    begin
      insert into public.player_progress (user_id, slot, kind, key, period_key, value, state, xp_frac)
        values (v_uid, 0, 'stat', 'ev:probe', '', 0, 'active', 0.5);
      raise exception 'companion-xp-frac self-check (g): the CHECK accepted a remainder on a non-companion row';
    exception when check_violation then null;
    end;

    -- (h) THE WRITE IS AN OVERWRITE, NEVER AN ADDITION: 0.6 then 0.3 reads 0.3.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"companion_xp_frac":{"fox":0.6},"journal":{"kind":"admin","intent":"cxf:probe:h1"}}'::jsonb);
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"companion_xp_frac":{"fox":0.3},"journal":{"kind":"admin","intent":"cxf:probe:h2"}}'::jsonb);
    select xp_frac into v_got from public.player_progress
     where user_id = v_uid and slot = 0 and kind = 'stat' and key = 'companion_xp:fox' and period_key = '';
    if coalesce(v_r->>'ok', 'false') <> 'true' or v_got is distinct from 0.3 then
      raise exception 'companion-xp-frac self-check (h): 0.6 then 0.3 stored % (%) — the upsert is not an overwrite',
                      v_got, v_r; end if;

    -- (i) THE CAP IS THE SERVER'S. A pet 5 XP under the cap is proposed 40:
    --     the row lands ON the cap, the apply succeeds, and its ledger row
    --     journals the clamp; an unclamped apply journals none; a pet AT the
    --     cap takes nothing more.
    update public.player_progress set value = c_cap - 5
     where user_id = v_uid and slot = 0 and kind = 'stat' and key = 'companion_xp:fox' and period_key = '';
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"progress":[{"kind":"stat","key":"companion_xp:fox","period":"","add":40,"state":"active"}],'
             '"journal":{"kind":"admin","intent":"cxf:probe:cap"}}'::jsonb);
    select value into v_val from public.player_progress
     where user_id = v_uid and slot = 0 and kind = 'stat' and key = 'companion_xp:fox' and period_key = '';
    select meta into v_meta from public.player_ledger
     where user_id = v_uid and intent = 'cxf:probe:cap' order by id desc limit 1;
    if coalesce(v_r->>'ok', 'false') <> 'true' or v_val is distinct from c_cap then
      raise exception 'companion-xp-frac self-check (i): a 40-XP op 5 under the cap left the pet at % (cap %; %)',
                      v_val, c_cap, v_r; end if;
    if (v_meta #>> '{delta,cxc,companion_xp:fox,proposed}')::bigint is distinct from 40
       or (v_meta #>> '{delta,cxc,companion_xp:fox,credited}')::bigint is distinct from 5 then
      raise exception 'companion-xp-frac self-check (i): the clamp was not journalled on the ledger row: %', v_meta; end if;
    select meta into v_meta from public.player_ledger
     where user_id = v_uid and intent = 'cxf:probe:e' order by id desc limit 1;
    if v_meta #> '{delta,cxc}' is not null then
      raise exception 'companion-xp-frac self-check (i): an UNCLAMPED apply journalled a clamp: %', v_meta; end if;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             '{"progress":[{"kind":"stat","key":"companion_xp:fox","period":"","add":10,"state":"active"}],'
             '"journal":{"kind":"admin","intent":"cxf:probe:cap2"}}'::jsonb);
    select value into v_val from public.player_progress
     where user_id = v_uid and slot = 0 and kind = 'stat' and key = 'companion_xp:fox' and period_key = '';
    if coalesce(v_r->>'ok', 'false') <> 'true' or v_val is distinct from c_cap then
      raise exception 'companion-xp-frac self-check (i): a pet AT the cap moved to % (%)', v_val, v_r; end if;

    raise exception using errcode = 'HR947', message = 'companion-xp-frac §4 complete — rolling back';
  exception when sqlstate 'HR947' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'companion-xp-frac self-check: §4 LEAKED a probe row'; end if;

  raise notice 'companion-xp-frac self-check PASSED: (a) the column and its [0,1) companion-row CHECK; (b) no client '
               'role can write it and only hr_apply / hr_state_of name it; (c) a fresh character projects {}; (d) a '
               'remainder alone and beside an XP op round-trips; (e) an XP-only delta leaves it alone; (f) 1, 900, -0.1, '
               'a string, an array and an unequipped pet are refused without moving a row; (g) the CHECK bites on its '
               'own; (h) the upsert overwrites; (i) the cap clamps on the server and the clamp is journalled';
end $mig$;
