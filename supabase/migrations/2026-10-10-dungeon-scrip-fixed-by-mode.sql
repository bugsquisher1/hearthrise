-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-10-dungeon-scrip-fixed-by-mode.sql — DUNGEON SCRIP PAYS ONLY ON A CLEAR
--                                              THE SERVER CONFIRMS. THE CLIENT'S
--                                              `quality` IS GONE.
--
-- STAGED, NOT APPLIED - REVIEW ONLY. SECURITY GO REQUIRED BEFORE APPLY (lane C,
--   it changes what a money-adjacent RPC pays). The Coordinator applies it with
--   `node tools/apply-migration.mjs supabase/migrations/2026-10-10-dungeon-scrip-fixed-by-mode.sql`
--   (one file, never inside begin/commit, never 00:00-00:10 UTC).
--   EDGE REDEPLOY REQUIRED in the same breath: supabase/functions/hr-accrue
--   (request.js stops reading `quality`, dungeon-settle.js binds NULL for $7).
--   The two halves are safe in EITHER order: this body ignores $7 entirely, and
--   an old edge that still forwards a client quality is now forwarding a value
--   nothing reads.
--
-- ── THE DEFECT (whole-game review, 2026-10-08) ──────────────────────────────
-- hr_dungeon_settle paid `round(scrip_base * clamp(p_quality, 0, 1))`, and
-- p_quality was the CLIENT's own report of how well the run went:
--   · manual    = the fraction of phases the browser said it cleared
--                 (src/dungeons.js, `settleRunServer(..., 'manual', pct)`);
--   · scavenger = max(0.1, the boss HP the browser said it took off)
--                 (src/dungeon-scavenger.js showResult);
--   · and NULL — the field simply omitted — was coalesced to 1, a FULL CLEAR
--     (supabase/functions/hr-accrue/dungeon-settle.js passed null through and
--     the SQL did `coalesce(p_quality, 1)`).
-- So the number a reward was scaled by was authored in the browser, and the
-- cheapest way to author the maximum was to say nothing at all. CLAUDE.md §1:
-- the client never computes an authoritative number.
--
-- ── THE RULINGS (Game Designer, final) ──────────────────────────────────────
--   2026-10-08: "Fixed scrip per mode, with no client quality and null never a
--               full clear."
--   2026-10-08 (second ruling, on this file's first draft, which paid manual a
--               full base on any run): "Scrip pays only on a clear the SERVER can
--               confirm from its own state. A run without a server-confirmed
--               clear pays 0. If the server has no way to confirm a clear for
--               manual/scavenger runs today, pay 0 for those modes until it does."
--
-- ── WHICH CLEARS THE SERVER CAN CONFIRM TODAY ───────────────────────────────
--   auto       YES. An auto run has no fight the browser plays: its outcome IS
--              the server's verdict, decided inside this settle from the
--              server's own rows — combat level from player_skills >= req_lv
--              (gate b), the entry key held and debited (gate f), the re-entry
--              window read from the ledger (gate c). The settle row this verb
--              journals is the clear record. Pays the fixed share:
--              round(scrip_base / hr_dungeon_cooldown_divisor('auto')) = base.
--   manual     NO. The phase mini-game is played and judged in the browser
--              (src/dungeons.js phaseResults); the server holds no phase, boss
--              or kill row for it. Pays 0 scrip.
--   scavenger  NO. Boss HP is the browser's (src/dungeon-scavenger.js); no
--              server kill record exists. Pays 0 scrip.
-- Both NO modes still cost the key and still roll the flat catalogue loot,
-- exactly as an auto run does (loot was never quality-scaled, 2026-09-10
-- §ANTI-FORGERY), so a manual/scavenger run is never better than an auto run
-- and start-and-abandon earns no scrip. When a server-adjudicated manual or
-- scavenger run exists (its encounters settled through the combat engine and
-- journalled), its mode joins the CONFIRMED set in block (d) below.
--
-- The share is DERIVED from the one server table that already prices a mode,
-- hr_dungeon_cooldown_modes() (2026-09-12-dungeon-cooldown.sql), so the window a
-- mode costs and the scrip it pays cannot drift once a mode is confirmed. A mode
-- that table does not name is refused `bad_mode` (fail closed).
--
-- ── WHAT MOVES FOR A PLAYER (measured against the shipped formula) ──────────
--   auto       no change (auto runs always sent quality 1).
--   manual     0 scrip (was base x phases cleared / total). Loot unchanged.
--   scavenger  0 scrip (was base x max(0.1, boss HP taken)). Loot unchanged.
-- ⇒ GAME DESIGNER: manual and scavenger now pay loot only. If that empties the
--   modes, the fix is a server-adjudicated run, not a client number.

-- ── EXPLOIT-SURFACE DELTA ───────────────────────────────────────────────────
-- Strictly NEGATIVE. The verb's caller-supplied surface shrinks from
-- {dungeon id, mode, quality} to {dungeon id, mode}; both remaining values are
-- lookup keys into server catalogues, and the only mode that pays scrip is the
-- one whose outcome the server decides. The signature keeps its seventh argument
-- (hr_dungeon_settle(uuid,int,bigint,uuid,text,text,numeric)) so the engine
-- allowlist, the grant hygiene baseline and every guard that names the
-- signature are untouched — but the body never reads it, and §4(b) proves that
-- by passing 999, -5 and NULL and requiring the same scrip each time.
--
-- ── WHY THE SIGNATURE IS NOT NARROWED (stated as debt, not hidden) ──────────
-- Dropping $7 means dropping and recreating an engine-only SECURITY DEFINER
-- function whose regprocedure text is pinned in the engine allowlist
-- (hr_assert_grant_hygiene), tests/schema-drift.baseline.json and
-- tests/live-hash-drift.baseline.json (Coordinator-only). A rename of a
-- money-adjacent function's identity for a parameter that is now inert is more
-- risk than it removes. The edge binds NULL; the body ignores it; §4(c) asserts
-- the body reads it nowhere. Narrowing the signature is a clean follow-up for
-- the next slice that touches this function's identity anyway.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- Unchanged. The patch replaces two lines inside the already-locked protected
-- block (advisory lock + `for update` + version check + player_intents replay
-- precede it), so it inherits every property 2026-09-10 proved.
--
-- ── COST AT 100x PLAYERS ────────────────────────────────────────────────────
-- Zero rows, zero tables, zero indexes. One immutable function call per settle
-- (it replaces an arithmetic expression). The journal row's meta.quality now
-- records the mode share instead of a client float — same width.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Additive and anchored: the body is pg_get_functiondef with ONE block replaced.
-- To revert, replace this file's c_new with its c_anchor (both are below,
-- verbatim) by the same mechanism. No data is written.
--
-- ── LIVE-HASH NOTE ──────────────────────────────────────────────────────────
-- hr_dungeon_settle is tracked in tests/live-hash-drift.baseline.json; this file
-- becomes a toucher, so that guard reads the repo AHEAD of production until the
-- apply. The baseline is Coordinator-only: stage -> apply -> `--live --write`.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ───────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_dungeon_settle(uuid,int,bigint,uuid,text,text,numeric)') is null then
    raise exception 'PRECONDITION: hr_dungeon_settle(uuid,int,bigint,uuid,text,text,numeric) is absent - '
                    'apply 2026-09-10-dungeon-settle.sql first';
  end if;
  if to_regprocedure('public.hr_dungeon_cooldown_divisor(text)') is null
     or to_regprocedure('public.hr_dungeon_cooldown_modes()') is null then
    raise exception 'PRECONDITION: the mode divisor table is absent - apply 2026-09-12-dungeon-cooldown.sql first. '
                    'This file DERIVES the scrip share from it; without it there is no fixed number to pay.';
  end if;
  -- Every mode the edge can name must have a divisor, or the derivation below has
  -- a hole. DUNGEON_MODES in supabase/functions/hr-accrue/request.js is
  -- auto|manual|scavenger; tests/dungeon-settle.mjs (section 8) binds the two lists.
  if exists (select 1 from unnest(array['auto','manual','scavenger']) m
              where public.hr_dungeon_cooldown_divisor(m) is null
                 or public.hr_dungeon_cooldown_divisor(m) < 1) then
    raise exception 'PRECONDITION: a dungeon mode has no divisor >= 1 in hr_dungeon_cooldown_modes() (%). '
                    'The scrip share would be undefined.', public.hr_dungeon_cooldown_modes();
  end if;
end $$;

-- ── 1. hr_dungeon_settle — (d) SCRIP, SERVER-CONFIRMED CLEARS ONLY ──────────
-- ONE guarded, exactly-once anchor replace (the 2026-09-12-dungeon-cooldown.sql
-- idiom: pg_get_functiondef, CR stripped, refuse unless the anchor matches once).
-- `v_q` keeps its name and its place in the journal row (meta.quality), so no
-- reader of that key breaks; it now carries the SERVER's mode share.
do $$
declare
  v_def text;
  c_anchor constant text := $anc$    -- (d) SCRIP. Clamp the ONE client value to [0,1], SELF-ONLY, and apply it to
    --     the server-owned base. round(base * clamp) — the awardDungeonScrip
    --     formula, now server-owned.
    v_q := least(greatest(coalesce(p_quality, 1), 0), 1);
    v_scrip := round(v_dun.scrip_base * v_q)::bigint;$anc$;
  c_new constant text := $new$    -- (d) SCRIP — SERVER-CONFIRMED CLEARS ONLY (2026-10-10-dungeon-scrip-fixed-by-mode.sql).
    --     Designer rulings 2026-10-08: no client quality; null is never a full
    --     clear; scrip pays only on a clear the server confirms from its own
    --     state, else 0. Only `auto` qualifies today: its outcome IS this
    --     settle's verdict (gates b, c, f above). manual and scavenger are
    --     played and judged in the browser, so they pay 0 until a
    --     server-adjudicated run exists. The confirmed share is derived from
    --     hr_dungeon_cooldown_modes. The seventh argument is NOT READ.
    v_q := 1.0 / nullif(public.hr_dungeon_cooldown_divisor(p_mode), 0);
    if v_q is null or v_q <= 0 or v_q > 1 then
      perform public.hr_reject('bad_mode',
        jsonb_build_object('mode', p_mode, 'dungeon', v_dun.dungeon_id,
                           'reason', 'no_scrip_share'));
    end if;
    if p_mode is distinct from 'auto' then
      v_q := 0;                                  -- no server-confirmed clear
    end if;
    v_scrip := round(v_dun.scrip_base * v_q)::bigint;$new$;
begin
  v_def := replace(pg_get_functiondef(
    'public.hr_dungeon_settle(uuid,int,bigint,uuid,text,text,numeric)'::regprocedure), chr(13), '');
  if strpos(v_def, 'SERVER-CONFIRMED CLEARS ONLY (2026-10-10-dungeon-scrip-fixed-by-mode.sql)') > 0 then
    raise notice 'hr_dungeon_settle already pays scrip on server-confirmed clears only — patch skipped'; return;
  end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_dungeon_settle (d) SCRIP block did not match exactly once — its shape is '
                    'not the one this file was derived against (2026-09-10-dungeon-settle.sql (d), '
                    'unmodified by 2026-09-12). Do NOT patch a body you cannot account for.';
  end if;
  execute replace(v_def, c_anchor, c_new);
end $$;

-- ── 2. Grants — re-stated, unchanged. ENGINE-ONLY. ──────────────────────────
revoke execute on function public.hr_dungeon_settle(uuid, int, bigint, uuid, text, text, numeric)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_dungeon_settle(uuid, int, bigint, uuid, text, text, numeric)
  to hr_engine;

-- ── 4. SELF-CHECK — properties PROVEN BY EXECUTING SQL ──────────────────────
-- Row-writing probes run in a subtransaction discarded by a sentinel raise
-- (HR8A1), so the block is net-zero on production; a leak check follows.
do $$
declare
  v       jsonb;
  v_uid   constant uuid := '000000d6-0000-0000-0000-00000000a101';
  v_slot  constant int  := 0;
  v_dun   text; v_key text; v_base int;
  v_mode  text;
  v_q     numeric;
  v_want  bigint;
  v_src   text;
  v_seen  int := 0;
  v_led   jsonb;
  v_pid   uuid;
begin
  -- (c) THE BODY READS THE SEVENTH ARGUMENT NOWHERE. Comments are stripped
  --     first, so a comment that names it cannot satisfy or fail the check.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'public.hr_dungeon_settle(uuid,int,bigint,uuid,text,text,numeric)'::regprocedure;
  v_src := regexp_replace(v_src, '--[^\n]*', '', 'g');
  if strpos(v_src, 'p_quality') > 0 then
    raise exception 'GATE(c): hr_dungeon_settle still READS p_quality outside a comment — a client number '
                    'still reaches the scrip credit';
  end if;
  if strpos(v_src, 'hr_dungeon_cooldown_divisor(p_mode)') = 0 then
    raise exception 'GATE(c): hr_dungeon_settle does not derive the scrip share from the mode divisor';
  end if;

  -- The probe dungeon: one the game authors a scavenger run for, so all three
  -- modes are legal on it. Read from the catalogue, never typed.
  select dungeon_id, cost_key, scrip_base into v_dun, v_key, v_base
    from public.hr_dungeons where coalesce(scavenger_ok, false)
   order by req_lv asc, dungeon_id asc limit 1;
  if v_dun is null then
    raise exception 'GATE: no scavenger-authored dungeon in the catalogue to probe all three modes on';
  end if;

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, dungeon_scrip, version)
      values (v_uid, v_slot, 0, 0, 0, 1)
      on conflict (user_id, slot) do update set dungeon_scrip = 0, version = 1;
    insert into public.player_skills (user_id, slot, skill_id, xp)
      select v_uid, v_slot, s, public.hr_xp_for_level(99)
        from unnest(array['attack','strength','defense','hitpoints','prayer','ranged','magic']) s
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, v_slot, v_key, 1)
      on conflict (user_id, slot, item_id) do update set qty = 1;

    -- (a)+(b) FOR EVERY MODE: the scrip is round(base / divisor), and a forged
    --     999, a forged -5 and an omitted NULL all pay EXACTLY that. Each
    --     (mode, quality) pair settles on its OWN probe character (md5-derived
    --     ids, all swept by the leak check), so no re-entry window or daily
    --     fuse is in the way of the property under test.
    foreach v_mode in array array['auto','manual','scavenger'] loop
      -- auto: the server-confirmed clear, the fixed share. manual / scavenger:
      -- no server-confirmed clear exists, so an abandoned, failed or "perfect"
      -- run all pay exactly 0.
      v_want := case when v_mode = 'auto'
                     then round(v_base * (1.0 / public.hr_dungeon_cooldown_divisor(v_mode)))::bigint
                     else 0 end;
      foreach v_q in array array[999::numeric, -5::numeric, null::numeric] loop
        v_seen := v_seen + 1;
        v_pid := md5('dungeon-scrip-fixed-probe-' || v_seen)::uuid;
        insert into auth.users (id) values (v_pid) on conflict (id) do nothing;
        perform set_config('request.jwt.claim.sub', v_pid::text, true);
        insert into public.player_state (user_id, slot, gold, gems, dungeon_scrip, version)
          values (v_pid, v_slot, 0, 0, 0, 1)
          on conflict (user_id, slot) do update set dungeon_scrip = 0, version = 1;
        insert into public.player_skills (user_id, slot, skill_id, xp)
          select v_pid, v_slot, s, public.hr_xp_for_level(99)
            from unnest(array['attack','strength','defense','hitpoints','prayer','ranged','magic']) s
          on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
        insert into public.player_inventory (user_id, slot, item_id, qty)
          values (v_pid, v_slot, v_key, 1)
          on conflict (user_id, slot, item_id) do update set qty = 1;
        v := public.hr_dungeon_settle(v_pid, v_slot, 1, gen_random_uuid(), v_dun, v_mode, v_q);
        if coalesce(v->>'ok', '') <> 'true' then
          raise exception 'GATE(a): % settle with quality % refused: %', v_mode, v_q, v;
        end if;
        if (v->'settled'->>'scrip')::bigint <> v_want then
          raise exception 'GATE(b): % settle with a CLIENT quality of % paid % scrip, expected the fixed % '
                          '(base % / divisor %) — a client number still moves the credit',
                          v_mode, coalesce(v_q::text, 'NULL'), v->'settled'->>'scrip', v_want,
                          v_base, public.hr_dungeon_cooldown_divisor(v_mode);
        end if;
        -- The journal records the SERVER's share, never the client's float.
        select meta into v_led from public.player_ledger
         where user_id = v_pid and slot = v_slot and kind = 'dungeon' order by at desc limit 1;
        if (v_led->>'quality')::numeric is distinct from
           (case when v_mode = 'auto' then 1.0 / public.hr_dungeon_cooldown_divisor(v_mode) else 0 end) then
          raise exception 'GATE(b): the journal recorded quality % for %, expected the server share',
            v_led->>'quality', v_mode;
        end if;
      end loop;
    end loop;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);

    -- (d) A CONFIRMED CLEAR PAYS SOMETHING: the auto share of the probe dungeon
    --     is > 0, so (b)'s zeros for manual/scavenger are a rule, not a base of 0.
    if round(v_base * (1.0 / public.hr_dungeon_cooldown_divisor('auto')))::bigint <= 0 then
      raise exception 'GATE(d): the probe dungeon pays 0 on a confirmed clear (base %) — the zero arms prove nothing',
        v_base;
    end if;

    -- (e) AN UNKNOWN MODE IS STILL REFUSED (by the existing mode gate or by the
    --     share's fail-closed branch) and pays nothing.
    v := public.hr_dungeon_settle(v_uid, v_slot, 1, gen_random_uuid(), v_dun, 'warp', 1);
    if coalesce(v->>'ok', '') = 'true' then
      raise exception 'GATE(e): an unknown mode settled: %', v;
    end if;

    raise exception using errcode = 'HR8A1', message = 'dungeon-scrip-fixed §4 complete — rolling back';
  exception when sqlstate 'HR8A1' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from (select v_uid as u union all
                            select md5('dungeon-scrip-fixed-probe-' || i)::uuid from generate_series(1, 9) i) p
              where exists (select 1 from public.player_state where user_id = p.u)
                 or exists (select 1 from public.player_ledger where user_id = p.u)
                 or exists (select 1 from public.player_intents where user_id = p.u)
                 or exists (select 1 from public.player_inventory where user_id = p.u)
                 or exists (select 1 from public.player_skills where user_id = p.u)
                 or exists (select 1 from auth.users where id = p.u)) then
    raise exception 'GATE: §4 LEAKED a probe row';
  end if;

  -- (f) THE GRANT: engine-only, never a client role.
  if has_function_privilege('authenticated', 'public.hr_dungeon_settle(uuid,int,bigint,uuid,text,text,numeric)', 'execute')
     or has_function_privilege('anon', 'public.hr_dungeon_settle(uuid,int,bigint,uuid,text,text,numeric)', 'execute') then
    raise exception 'GATE(f): hr_dungeon_settle is client-executable';
  end if;

  raise notice 'dungeon-scrip-fixed: % settles across 3 modes x {999,-5,NULL}: auto paid round(base/divisor), '
               'manual and scavenger paid 0; the body reads no client quality; unknown mode refused; engine-only — all green', v_seen;
end $$;
