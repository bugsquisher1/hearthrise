-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-06-state-of-farm-projection.sql — THE FARM STATE THE SERVER OWNS
--                                           BUT NEVER TOLD THE CLIENT.
--                                           (Q-2 + Q-5, both P1.)
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. The Coordinator applies this by hand
--     (`node tools/apply-migration.mjs supabase/migrations/2026-09-06-state-of-farm-projection.sql`,
--     ONE transaction) after the security review. It is a READ PROJECTION on a
--     SECURITY DEFINER function: it adds no writer, no grant, no column.
--
--   Companion client:  src/net/accrue.js reconcileFarm (reads both new keys)
--   Companion tests:   tests/state-of-farm-projection.mjs (PGlite chain replay
--                      + the real reconcileFarm + a mutation proof),
--                      tests/arm-homing-guard.mjs (the plotLevels/farmPlots
--                      SERVER_MECHANISM claims are now EXECUTED, not asserted
--                      by hand-typed comment),
--                      src/features/smoke-test.js regression FARM-PROJ-1.
--
-- ⚠ AFTER APPLYING: hr_state_of is a LIVE-HASH-TRACKED body
--   (tests/live-hash-drift.baseline.json — entry `hr_state_of(p_user uuid,
--   p_slot integer)`, tracked_by chain/floor/pin). This file patches it
--   PROGRAMMATICALLY, so both its `live` and its `replay` md5 move and the
--   Coordinator MUST re-seed with
--     node tests/live-hash-drift.mjs --live --write
--   and then FILL the `why` REVIEW placeholder the writer leaves behind (a
--   placeholder left in place is itself a --selftest failure). Without the
--   re-seed the next drift run reports a false divergence.
--   IT TAKES OVER NO LAST-TOUCHER ROLE — it carries no literal
--   `create or replace function public.hr_state_of(` header and is a member of
--   NO derivation chain. It DOES join `touched_by`.
--
-- ── THE TWO BUGS, STATED AS MEASURED ────────────────────────────────────────
-- Both are the SAME class: the server is the author of record for a farm fact,
-- and hr_state_of does not project it, so under BLOB_RETIRED the reload rebuilds
-- the farm WITHOUT it and the client's fail-safe default becomes the player's
-- reality. Neither is exploitable — both LOSE the player value the server holds.
--
--   Q-2  player_state.plot_level (int, NOT NULL, default 1, CHECK 1..5) is
--        written ONLY by hr_farm_upgrade_plot (2026-08-22-server-farming-
--        complete.sql §1 / the upgrade RPC). hr_state_of never projected it, so
--        src/net/accrue.js reconcileFarm left G.plotLevels untouched and
--        farm-progression.js getPlotLevel() forced 1. A player who spent
--        Farmer's Deeds to Plot Lv 3 reloaded into Lv 1: only Turnip plantable,
--        the unlocked seed list gone, and the Upgrade button QUOTING the Lv-2
--        price while the server (correctly, from its own plot_level=3) charged
--        the Lv-4 price and jumped 3 -> 4. accrue.js said so in its own header:
--        "an armed farm reads as Lv 1 … flagged, not silently defaulted-as-if-
--        correct". This is the one-line server projection add that comment asks
--        for; the client reader it describes is ALREADY THERE.
--
--   Q-5  player_farm.waterings (timestamptz[], NOT NULL, default '{}', capped
--        at 8 by hr_farm_water) is the FULL watering history, and it is the
--        input to hr_farm_growth_hours(planted, waterings, now) — the server's
--        single growth authority. hr_state_of projected only the scalar
--        `watered_at`, so reconcileFarm rebuilt `waterings` as a ONE-ELEMENT
--        array. Each watering is worth up to 2h of 1x extra growth, so a plot
--        watered 8 times came back carrying ONE watering's bonus: the client's
--        growthHours under-counted by up to 14 effective hours, showed a long
--        timer and a Water button on a plot the server already considered ready,
--        and the client-side isReady gate (legacy.js:9061) then refused to let
--        the player press Harvest.
--
-- ── WHY THE FULL ARRAY AND NOT A COUNT+LAST ─────────────────────────────────
-- src/core/farm.js growthHours() is a BYTE-FOR-BYTE port of hr_farm_growth_hours:
-- it walks `plot.waterings`, clips each watering's 2h window to [plantedAt, now]
-- and sums the overlap. A count cannot reproduce that — two waterings 10 minutes
-- apart overlap and are worth far less than two a day apart, and a watering that
-- lands before plantedAt (a regrow) contributes nothing. Any lossy shape makes
-- the client's isReady DISAGREE with the server's, which is the exact bug. So the
-- projection carries the same array the server computes from, and the client
-- mirrors it — it still computes no authority: hr_farm_harvest re-derives growth
-- from its own row under a row lock and refuses an early harvest regardless.
-- COST: <=8 timestamps x <=25 plots = a few hundred bytes on an envelope that is
-- already tens of kB. At 100x players it is noise; nothing is journalled per tick.
--
-- ── WHAT THIS FILE DELIBERATELY DOES NOT DO ─────────────────────────────────
-- player_farm.regrow_count is STILL not projected (reconcileFarm rebuilds it to
-- 0). Left alone on purpose: it is display-only, the finite-perennial wither
-- LIMIT is enforced inside hr_farm_harvest against the server's own row, and a
-- client that under-counts regrows cannot exceed it. Widening scope on an
-- unreviewed third field is how a two-bug fix becomes a three-bug fix.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Purely additive: two keys inside an existing jsonb_build_object. An old client
-- ignores an unknown key, so a partial rollout is safe in both directions. To
-- REVERT, run the inverse splice (do NOT re-apply 2026-09-10-dungeon-scrip.sql —
-- its §2 short-circuits once dungeon_scrip is projected and would restore
-- nothing):
--
--   do $$ declare v text; begin
--     v := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
--     v := regexp_replace(v, E'\n[ \t]*--[^\n]*farm-projection[^\n]*', '', 'g');
--     v := regexp_replace(v, E'\n[ \t]*''plot_level'', v_st\.plot_level,', '', 'g');
--     v := regexp_replace(v, ',[[:space:]]*''waterings'', coalesce\(to_jsonb\(waterings\), ''\[\]''::jsonb\)\)', ')', 'g');
--     if position('plot_level' in v) > 0 or position('waterings' in v) > 0 then
--       raise exception 'revert incomplete — refusing to install a body I cannot account for'; end if;
--     if position('''marks'', v_st.marks' in v) = 0 or position('''streak_days''' in v) = 0
--        or position('''watered_at'', watered_at' in v) = 0 then
--       raise exception 'revert ate a sibling projection'; end if;
--     execute v; end $$;
--
-- (Security review 2026-09-06, C1: the first draft used plain replace() with a
-- literal "\n" — which can never match — so the waterings splice would have been
-- silently left in place. Regex context + the two fail-closed checks above are
-- the accepted revert; nothing in §0–§2 changes.)
-- No data is touched, so a revert loses nothing but the two keys.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
-- This file PATCHES a body it did not author. It must refuse to touch a shape it
-- cannot account for (the b484–b487 revert class), so every anchor it is about to
-- splice against is proven present here, BEFORE anything runs.
do $$
declare v_def text;
begin
  if to_regclass('public.player_state') is null then
    raise exception 'player_state missing — apply 2026-08-11-player-state.sql first'; end if;
  if to_regclass('public.player_farm') is null then
    raise exception 'player_farm missing — apply 2026-08-20-server-farming.sql first'; end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_state_of is missing — apply the player-state chain first'; end if;

  -- The two SERVER-OWNED columns must already exist. They do (2026-08-22-server-
  -- farming-complete.sql §1) — this file adds NO column and must never be the
  -- thing that creates one, or a revert would have to drop player data.
  if (select count(*) from information_schema.columns
       where table_schema='public' and table_name='player_state'
         and column_name='plot_level') <> 1 then
    raise exception 'player_state.plot_level missing — apply 2026-08-22-server-farming-complete.sql first';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema='public' and table_name='player_farm'
         and column_name='waterings') <> 1 then
    raise exception 'player_farm.waterings missing — apply 2026-08-22-server-farming-complete.sql first';
  end if;
  if to_regprocedure('public.hr_farm_growth_hours(timestamptz,timestamptz[],timestamptz)') is null then
    raise exception 'hr_farm_growth_hours missing — the projected waterings array would have no '
                    'server-side consumer to agree with; apply 2026-08-22-server-farming-complete.sql first';
  end if;

  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if position($q$'streak_days', v_st.streak_days,$q$ in v_def) = 0 then
    raise exception 'the LIVE hr_state_of does not project streak_days — apply 2026-08-21-streak-state.sql '
                    'first; this file splices plot_level beside it';
  end if;
  if position($q$'planted_at', planted_at, 'watered_at', watered_at)$q$ in v_def) = 0 then
    raise exception 'the LIVE hr_state_of farm projection is not the shape this file was derived '
                    'against — do NOT patch a body you cannot account for';
  end if;
end $$;

-- ── 1. hr_state_of — PROJECT plot_level AND the waterings array ────────────
-- pg_get_functiondef + two guarded, EXACTLY-ONCE anchor replaces (the
-- 2026-09-10-dungeon-scrip.sql §2 / 2026-09-08-hero-slot-buy.sql §7 idiom), so
-- this file never restates a body it did not author and can never silently
-- delete another file's projection (marks, dungeon_scrip, workers, hero_slots…).
--
-- ANCHOR CHOICE. plot_level anchors on `streak_days`, NOT on the newer
-- dungeon_scrip line, because streak_days has been in the body since
-- 2026-08-21 and is therefore present whether or not the (separately staged)
-- dungeon chain has landed on the target database. Same reasoning for the farm
-- anchor: it is the ORIGINAL 2026-08-26-marks-record.sql shape and nothing since
-- has touched it.
--
-- IDEMPOTENT: each half short-circuits if its key is already projected, so a
-- re-run (or a half-applied retry) is a no-op notice, not a double splice.
do $$
declare
  v_def   text;
  v_did   boolean := false;
  c_state constant text := $anc$'streak_days', v_st.streak_days,$anc$;
  c_farm  constant text := $anc$'planted_at', planted_at, 'watered_at', watered_at)$anc$;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if v_def is null then
    raise exception 'hr_state_of is missing — apply the player-state chain first'; end if;

  -- (1a) THE PLOT TIER, flat beside the other server-owned scalars.
  if strpos(v_def, $q$'plot_level', v_st.plot_level$q$) > 0 then
    raise notice 'hr_state_of already projects plot_level — half (a) skipped';
  else
    if (length(v_def) - length(replace(v_def, c_state, ''))) <> length(c_state) then
      raise exception 'the LIVE hr_state_of streak_days anchor did not match exactly once — its shape is '
                      'not the one this file was derived against. Do NOT patch a body you cannot account for.';
    end if;
    v_def := replace(v_def, c_state, c_state || '
      -- farm-projection (Q-2): the SERVER-owned farm plot tier, written ONLY by
      -- hr_farm_upgrade_plot. Flat scalar like the other server-owned scalars, so
      -- accrue.js reconcileFarm mirrors it into G.plotLevels on every load. Before
      -- this key existed an armed client fell back to getPlotLevel()''s Lv 1
      -- fail-safe on every reload: unlocked seeds vanished and the Upgrade button
      -- quoted the wrong tier''s price. The client NEVER computes this.
      ''plot_level'', v_st.plot_level,');
    v_did := true;
  end if;

  -- (1b) THE FULL WATERING HISTORY, per plot, beside the scalar watered_at.
  -- watered_at is KEPT (an older client reads it; removing a projected key is a
  -- breaking change and this file is additive only).
  if strpos(v_def, $q$'waterings', coalesce(to_jsonb(waterings)$q$) > 0 then
    raise notice 'hr_state_of already projects waterings — half (b) skipped';
  else
    if (length(v_def) - length(replace(v_def, c_farm, ''))) <> length(c_farm) then
      raise exception 'the LIVE hr_state_of farm anchor did not match exactly once — its shape is '
                      'not the one this file was derived against. Do NOT patch a body you cannot account for.';
    end if;
    v_def := replace(v_def, c_farm, $new$'planted_at', planted_at, 'watered_at', watered_at,
                                          -- farm-projection (Q-5): the FULL watering history, the
                                          -- exact array hr_farm_growth_hours() reads. Projected
                                          -- whole because growth is the clipped 2h-window OVERLAP
                                          -- sum, which no count/last pair can reproduce — a lossy
                                          -- shape makes the client's isReady disagree with the
                                          -- server's and strands a ready crop behind a Water
                                          -- button. NOT NULL in the table; coalesce is belt-and-
                                          -- braces so a future nullable column can never emit a
                                          -- json null the client would have to special-case.
                                          'waterings', coalesce(to_jsonb(waterings), '[]'::jsonb))$new$);
    v_did := true;
  end if;

  if v_did then
    execute v_def;
    raise notice 'hr_state_of patched: projects player_state.plot_level and the per-plot waterings array';
  else
    raise notice 'hr_state_of already carries both farm projections — nothing to do';
  end if;
end $$;

-- create-or-replace preserves an ACL, but be explicit (the lesson of every
-- restated body in this tree). hr_state_of takes an ARBITRARY uuid and is
-- SECURITY DEFINER, so a client-executable grant here would be a cross-player
-- read of every projected field. Engine only.
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 2. SELF-VERIFYING COMMIT GATE ──────────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them. Apply is atomic, so a
-- raise reverts everything above. The row-writing probe lives in a subtransaction
-- discarded by a sentinel raise (HR820) so this block is net-zero on production.
do $$
declare
  v_st    jsonb;
  v_def   text;
  v_plot  jsonb;
  v_hours numeric;
  v_uid   constant uuid := '000000f0-0000-0000-0000-0000000000f0';
  v_oth   constant uuid := '000000f0-0000-0000-0000-0000000000f1';
  v_slot  constant int := 0;
  v_now   constant timestamptz := now();
  v_plant constant timestamptz := now() - interval '4 hours';
begin
  -- (a) THE SOURCE COLUMNS are untouched by this file: still there, still the
  --     shape the RPCs write. A projection must never quietly restate a column.
  if (select count(*) from information_schema.columns
       where table_schema='public' and table_name='player_state'
         and column_name='plot_level' and data_type='integer' and is_nullable='NO') <> 1 then
    raise exception 'GATE(a): player_state.plot_level is not a NOT NULL integer'; end if;
  if (select count(*) from information_schema.columns
       where table_schema='public' and table_name='player_farm'
         and column_name='waterings' and data_type='ARRAY' and is_nullable='NO') <> 1 then
    raise exception 'GATE(a): player_farm.waterings is not a NOT NULL array'; end if;

  -- (b) hr_state_of PROJECTS BOTH new keys AND still projects every neighbour
  --     the splices sat next to — a positive control that neither replace ate a
  --     sibling projection (the silent-object-loss class).
  select prosrc into v_def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='hr_state_of';
  if position('''plot_level'', v_st.plot_level' in v_def) = 0 then
    raise exception 'GATE(b): hr_state_of does not project plot_level'; end if;
  if position('''waterings'', coalesce(to_jsonb(waterings)' in v_def) = 0 then
    raise exception 'GATE(b): hr_state_of does not project the waterings array'; end if;
  if position('''streak_days'', v_st.streak_days' in v_def) = 0 then
    raise exception 'GATE(b): the plot_level splice DROPPED streak_days — chain broken'; end if;
  if position('''watered_at'', watered_at' in v_def) = 0 then
    raise exception 'GATE(b): the waterings splice DROPPED watered_at — an older client reads it'; end if;
  if position('''planted_at'', planted_at' in v_def) = 0 then
    raise exception 'GATE(b): the waterings splice DROPPED planted_at — the growth model needs it'; end if;
  if position('''marks'', v_st.marks' in v_def) = 0 then
    raise exception 'GATE(b): the marks projection is gone — this file restated a stale body'; end if;

  -- (c) NO NEW WRITE SURFACE. This file adds no writer, so player_state and
  --     player_farm must still be read-only to every client role.
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name in ('player_state','player_farm')
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(c): a client write grant exists on player_state/player_farm — the farm is forgeable';
  end if;

  -- (d) NOT CLIENT-EXECUTABLE. hr_state_of takes an arbitrary uuid; a grant to
  --     anon/authenticated is a cross-player read of the whole envelope.
  if exists (select 1 from information_schema.role_routine_grants
              where routine_schema='public' and routine_name='hr_state_of'
                and grantee in ('anon','authenticated','PUBLIC','service_role')) then
    raise exception 'GATE(d): hr_state_of is executable by a client role — cross-player state read';
  end if;

  -- (e) EXECUTED — the projection returns the REAL server values, and the
  --     projected waterings array is the one hr_farm_growth_hours computes from.
  --     Discarded subtransaction; net-zero on production.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid), (v_oth) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, plot_level, version)
      values (v_uid, v_slot, 0, 0, 3, 1)
      on conflict (user_id, slot) do update set plot_level = 3, version = 1;
    insert into public.player_state (user_id, slot, gold, gems, plot_level, version)
      values (v_oth, v_slot, 0, 0, 5, 1)
      on conflict (user_id, slot) do update set plot_level = 5, version = 1;
    insert into public.player_farm (user_id, slot, plot_idx, crop_id, planted_at, watered_at, waterings)
      values (v_uid, v_slot, 0, 'turnip', v_plant, v_now - interval '30 minutes',
              array[v_now - interval '3 hours', v_now - interval '2 hours',
                    v_now - interval '1 hour',   v_now - interval '30 minutes']::timestamptz[])
      on conflict (user_id, slot, plot_idx) do update
        set crop_id = excluded.crop_id, planted_at = excluded.planted_at,
            watered_at = excluded.watered_at, waterings = excluded.waterings;

    v_st := public.hr_state_of(v_uid, v_slot);
    if (v_st->'state'->>'plot_level')::int <> 3 then
      raise exception 'GATE(e): hr_state_of plot_level = % (expected 3)', v_st->'state'->>'plot_level'; end if;

    v_plot := v_st->'farm'->0;
    if v_plot is null then
      raise exception 'GATE(e): hr_state_of projected no farm row'; end if;
    if jsonb_typeof(v_plot->'waterings') <> 'array' then
      raise exception 'GATE(e): waterings is % not an array', jsonb_typeof(v_plot->'waterings'); end if;
    if jsonb_array_length(v_plot->'waterings') <> 4 then
      raise exception 'GATE(e): waterings projected % entries (expected 4) — THE Q-5 BUG (it collapsed '
                      'to the single watered_at scalar)', jsonb_array_length(v_plot->'waterings'); end if;
    if (v_plot->>'watered_at') is null then
      raise exception 'GATE(e): watered_at vanished — an older client reads it'; end if;

    -- THE AGREEMENT CHECK. Four waterings inside a 4h-old plant are worth
    -- 4 elapsed + min(bonus, 4) effective hours; ONE watering (the old
    -- projection) is worth strictly less. If the projected array did not carry
    -- the history, these two numbers would be equal — so this asserts the
    -- projection is not merely array-SHAPED but array-VALUED.
    select public.hr_farm_growth_hours(v_plant,
             array(select (jsonb_array_elements_text(v_plot->'waterings'))::timestamptz), v_now)
      into v_hours;
    if v_hours <= public.hr_farm_growth_hours(v_plant,
                    array[(v_plot->>'watered_at')::timestamptz], v_now) then
      raise exception 'GATE(e): growth from the projected array (%) is not greater than growth from the '
                      'single watered_at — the array is not carrying the history', v_hours; end if;

    -- (f) NO CROSS-PLAYER LEAK. The projection is per-uuid and the caller's uuid
    --     is an ARGUMENT, so prove the other player's plot tier and farm rows are
    --     absent from this envelope even though the JWT claim is set to v_uid.
    if (v_st->'state'->>'plot_level')::int = 5 then
      raise exception 'GATE(f): hr_state_of returned the OTHER player''s plot_level'; end if;
    if jsonb_array_length(coalesce(v_st->'farm','[]'::jsonb)) <> 1 then
      raise exception 'GATE(f): hr_state_of projected % farm rows for a one-plot character — cross-player '
                      'rows are leaking into the envelope', jsonb_array_length(v_st->'farm'); end if;

    raise exception using errcode = 'HR820', message = 'state-of-farm-projection §2 complete — rolling back';
  exception when sqlstate 'HR820' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_farm  where user_id in (v_uid, v_oth))
     or exists (select 1 from public.player_state where user_id in (v_uid, v_oth))
     or exists (select 1 from auth.users        where id      in (v_uid, v_oth)) then
    raise exception 'GATE: §2 LEAKED a probe row'; end if;

  raise notice 'state-of-farm-projection: hr_state_of projects player_state.plot_level and the per-plot '
               'waterings array, watered_at/planted_at/streak_days/marks all survived, no new write grant, '
               'not client-executable, no cross-player rows — all green';
end $$;
