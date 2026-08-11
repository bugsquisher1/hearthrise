-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE APPLY ENGINE  (foundation, file 2 of 3)
-- Companion design doc: docs/design/server-authority.md §3, §4
-- Depends on: 2026-08-11-player-state.sql
--
-- ⚠ REVIEW ONLY — DO NOT APPLY YET. Apply on a Supabase BRANCH first.
--
-- THE PROBLEM THIS SOLVES
--   The simulation (yields, XP, drops, farm growth, combat) has to run in
--   JAVASCRIPT, because that is where the game data already lives and where it
--   is already correct: src/data/{items,gathering,recipes,monsters,bosses}.js
--   are pure ESM and import cleanly in Node AND Deno. Re-expressing 400 items,
--   7 tree rungs, 60+ recipes and 40 monsters in PL/pgSQL would create a second
--   copy of the whole game, and a second copy is a drift generator — that
--   failure has already happened once in this codebase (main.js's unifyObject
--   header documents the ESM/legacy double-copy that silently split the data).
--
--   But a Deno Edge Function that reads state, computes in JS, then writes back
--   has a read-modify-write race and no transaction around it. If it writes with
--   the service role and no discipline, a duplicated request pays twice.
--
-- THE ANSWER — ONE TRANSACTIONAL COMMIT POINT
--   Edge Functions never write tables. They compute a PROPOSED DELTA and hand
--   it to hr_apply(), a single SECURITY DEFINER RPC that, in ONE transaction:
--     1. takes a per-character advisory lock (serialises that character),
--     2. refuses if the version it was handed is not the current version
--        (optimistic concurrency — a stale computation cannot land),
--     3. RE-VALIDATES every invariant the delta could violate: no unknown item
--        id, no negative resulting quantity, no negative gold, bank cap, per-
--        call clamps, and no Hearth Token minting,
--     4. applies the delta,
--     5. journals it,
--     6. bumps the version and returns the new state.
--
--   So the Edge Function decides WHAT SHOULD HAPPEN (game rules, needs the data
--   files) and Postgres decides WHETHER IT MAY (integrity, needs a transaction).
--   Neither trusts the client, and the split is along the line each one is
--   actually good at.
--
--   ⚠ The clamps in step 3 are NOT the game balance. They are the blast radius
--     if an Edge Function is ever wrong or compromised, exactly as the clamps in
--     clan_deposit (2026-08-08-clan-seat.sql :530) are. Set them far above
--     honest play and treat any rejection as an incident, not a tuning problem.
--
-- WHY NOT SERIALIZABLE ISOLATION INSTEAD
--   Because the contention is already ~zero: one character is one session
--   (2026-08-10-session-claims.sql enforces a single active session per tab and
--   the takeover rule), so the advisory lock is uncontended in the normal case
--   and the version check exists for the abnormal one — a retried request, a
--   double-fired client, or two Edge Function instances racing on a cold start.
--   A serialisable retry loop would cost every request to solve a case the
--   version field solves for free.
--
-- SAFE TO RE-RUN.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.player_state') is null then
    raise exception 'run 2026-08-11-player-state.sql first';
  end if;
end $$;

-- ── 1. hr_load — the ONE read the client makes ───────────────────────────
-- The client could read the tables directly (SELECT-own policies allow it),
-- but then the client decides how to assemble state, and six renderers each
-- get a slightly different idea of "the player". One function returns the
-- whole character in one round trip, WITH its version, which is the token the
-- next write must present.
--
-- STABLE, not volatile: safe to call on a read replica later.
create or replace function public.hr_load(p_slot int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_st  public.player_state%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into v_st from public.player_state where user_id = v_uid and slot = coalesce(p_slot, 0);
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  return jsonb_build_object(
    'ok', true,
    'version', v_st.version,
    'now', now(),                                  -- the server clock, so the client
                                                   -- renders countdowns without ever
                                                   -- consulting its own clock
    'state', jsonb_build_object(
      'slot', v_st.slot, 'gold', v_st.gold, 'gems', v_st.gems,
      'hearth_tokens', v_st.hearth_tokens,
      'hp', v_st.hp, 'max_hp', v_st.max_hp, 'bank_cap', v_st.bank_cap,
      'active_kind', v_st.active_kind, 'active_id', v_st.active_id,
      'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to),
    'skills', coalesce((
      select jsonb_object_agg(skill_id, jsonb_build_object(
               'xp', xp, 'level', public.hr_level_from_xp(xp)))
        from public.player_skills where user_id = v_uid and slot = v_st.slot), '{}'::jsonb),
    'inventory', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.player_inventory where user_id = v_uid and slot = v_st.slot), '{}'::jsonb),
    'equipment', coalesce((
      select jsonb_object_agg(equip_slot, item_id)
        from public.player_equipment where user_id = v_uid and slot = v_st.slot), '{}'::jsonb),
    'farm', coalesce((
      select jsonb_agg(jsonb_build_object('i', plot_idx, 'crop', crop_id,
                                          'planted_at', planted_at, 'watered_at', watered_at)
                       order by plot_idx)
        from public.player_farm where user_id = v_uid and slot = v_st.slot), '[]'::jsonb),
    'progress', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'key', key, 'value', value,
                                          'period', period_key, 'state', state))
        from public.player_progress where user_id = v_uid and slot = v_st.slot), '[]'::jsonb),
    'total_level', public.hr_total_level(v_uid, v_st.slot)
  );
end $$;
grant execute on function public.hr_load(int) to authenticated;

-- ── 2. The delta shape ───────────────────────────────────────────────────
-- hr_apply takes ONE jsonb. Documented here rather than in a wiki because the
-- Edge Functions and this function must agree exactly and the agreement should
-- be readable in the same file as the code that enforces it.
--
-- {
--   "gold":        <signed bigint>,           -- delta, not absolute
--   "gems":        <signed bigint>,
--   "hp":          <absolute int or null>,    -- combat sets HP outright
--   "items":       { "<item_id>": <signed bigint>, … },
--   "xp":          { "<skill_id>": <positive bigint>, … },   -- XP never decreases
--   "equip":       { "<equip_slot>": "<item_id>" | null, … },
--   "activity":    { "kind": "gather|artisan|combat|idle",
--                    "id": "<catalogue id>|null",
--                    "restart": true|false },  -- true → active_since = now()
--   "accrued_to":  "<iso ts>" | "now",         -- advance the accrual watermark
--   "farm":        [ {"i":0,"crop":"potato"|null,"plant":true|false,"water":true|false,
--                     "clear":true|false}, … ],
--   "progress":    [ {"kind":"quest","key":"…","period":"","add":1,"state":"done"}, … ],
--   "journal":     { "kind":"gather", "intent":"collect", "meta":{…} }
-- }
--
-- ⚠ NOTE WHAT IS ABSENT: there is no "hearth_tokens" key. The bond is minted by
--   exactly one path (the IAP verification Edge Function, its own RPC), and the
--   general apply engine physically cannot touch it. That is the Final
--   Directive's "never mintable in PvE" expressed as an absence rather than a
--   promise.

-- ── 3. hr_apply ──────────────────────────────────────────────────────────
create or replace function public.hr_apply(
  p_slot int, p_version bigint, p_delta jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  -- BLAST-RADIUS CLAMPS (see the header). Not balance. Not player-facing.
  c_max_gold_delta  constant bigint := 50000000;    -- per call
  c_max_item_delta  constant bigint := 1000000;     -- per item per call
  c_max_xp_delta    constant bigint := 5000000;     -- per skill per call (a capped
                                                    -- offline session is far below)
  c_max_item_kinds  constant int    := 200;
  v_uid   uuid := auth.uid();
  v_slot  int  := coalesce(p_slot, 0);
  v_st    public.player_state%rowtype;
  v_j     jsonb := coalesce(p_delta->'journal', '{}'::jsonb);
  v_kind  text;
  k text; v_n bigint; v_have bigint; v_stacks int;
  v_eq    jsonb;      -- equip loop value. Deliberately NOT v_j: reusing the
                      -- journal variable as a loop target would silently
                      -- overwrite the journal before it is written.
  v_plot  jsonb;
  v_prog  jsonb;
  v_new_gold bigint;
  v_act   jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_delta is null or jsonb_typeof(p_delta) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_delta');
  end if;

  -- (1) Serialise this character. hashtextextended over user+slot; the lock is
  --     transaction-scoped so it always releases, including on an exception.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  select * into v_st from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  -- (2) Optimistic concurrency. A caller that read the state before someone
  --     else's write must recompute — it cannot land a stale delta.
  if p_version is not null and p_version <> v_st.version then
    return jsonb_build_object('ok', false, 'error', 'version_conflict',
                              'version', v_st.version);
  end if;

  -- (3) ─ GOLD ─
  v_new_gold := v_st.gold;
  if p_delta ? 'gold' then
    v_n := coalesce((p_delta->>'gold')::bigint, 0);
    if abs(v_n) > c_max_gold_delta then
      return jsonb_build_object('ok', false, 'error', 'gold_clamp', 'limit', c_max_gold_delta);
    end if;
    v_new_gold := v_st.gold + v_n;
    if v_new_gold < 0 then
      return jsonb_build_object('ok', false, 'error', 'insufficient_gold',
                                'have', v_st.gold, 'need', -v_n);
    end if;
  end if;

  -- (3) ─ ITEMS ─ (the delta is signed; a spend and a gain are the same code)
  if p_delta ? 'items' then
    if (select count(*) from jsonb_object_keys(p_delta->'items')) > c_max_item_kinds then
      return jsonb_build_object('ok', false, 'error', 'too_many_item_kinds');
    end if;
    for k, v_n in select key, coalesce(nullif(value,'')::bigint, 0)
                    from jsonb_each_text(p_delta->'items') loop
      if v_n = 0 then continue; end if;
      if abs(v_n) > c_max_item_delta then
        return jsonb_build_object('ok', false, 'error', 'item_clamp', 'item_id', k);
      end if;
      -- Unknown ids are refused, exactly as clan_deposit refuses a non-catalogue
      -- good. hr_items is GENERATED from src/data/items.js — see the design doc
      -- §3.4 for the generator + drift guard.
      if to_regclass('public.hr_items') is not null
         and not exists (select 1 from public.hr_items where item_id = k) then
        return jsonb_build_object('ok', false, 'error', 'unknown_item', 'item_id', k);
      end if;
      select qty into v_have from public.player_inventory
        where user_id = v_uid and slot = v_slot and item_id = k;
      v_have := coalesce(v_have, 0);
      if v_have + v_n < 0 then
        return jsonb_build_object('ok', false, 'error', 'insufficient_item',
                                  'item_id', k, 'have', v_have, 'need', -v_n);
      end if;
      if v_have + v_n = 0 then
        delete from public.player_inventory
          where user_id = v_uid and slot = v_slot and item_id = k;
      else
        insert into public.player_inventory as pi (user_id, slot, item_id, qty)
          values (v_uid, v_slot, k, v_have + v_n)
          on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
      end if;
    end loop;

    -- The bank cap is counted, not trusted. A NEW stack is what costs space, so
    -- the check runs after the writes and only fails when the count grew past
    -- the cap — a player at cap can still gain more of what they already hold.
    select count(*) into v_stacks from public.player_inventory
      where user_id = v_uid and slot = v_slot;
    if v_stacks > v_st.bank_cap then
      return jsonb_build_object('ok', false, 'error', 'bank_full',
                                'stacks', v_stacks, 'cap', v_st.bank_cap);
    end if;
  end if;

  -- (3) ─ XP ─ XP is monotonic. A negative XP delta is a bug in the caller, and
  -- accepting one would make a rollback indistinguishable from an exploit.
  if p_delta ? 'xp' then
    for k, v_n in select key, coalesce(nullif(value,'')::bigint, 0)
                    from jsonb_each_text(p_delta->'xp') loop
      if v_n <= 0 then continue; end if;
      if v_n > c_max_xp_delta then
        return jsonb_build_object('ok', false, 'error', 'xp_clamp', 'skill_id', k);
      end if;
      if not exists (select 1 from public.player_skills
                     where user_id = v_uid and slot = v_slot and skill_id = k) then
        return jsonb_build_object('ok', false, 'error', 'unknown_skill', 'skill_id', k);
      end if;
      update public.player_skills set xp = xp + v_n
        where user_id = v_uid and slot = v_slot and skill_id = k;
    end loop;
  end if;

  -- (3) ─ EQUIPMENT ─ the Edge Function has already checked the level/skill
  -- requirement against server skills; here we only enforce that you own it.
  if p_delta ? 'equip' then
    for k, v_eq in select key, value from jsonb_each(p_delta->'equip') loop
      if jsonb_typeof(v_eq) = 'null' then
        delete from public.player_equipment
          where user_id = v_uid and slot = v_slot and equip_slot = k;
      else
        insert into public.player_equipment as pe (user_id, slot, equip_slot, item_id)
          values (v_uid, v_slot, k, v_eq #>> '{}')
          on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
      end if;
    end loop;
  end if;

  -- (3) ─ FARM ─ planting stamps the SERVER clock. `planted_at` can never be
  -- supplied by anyone: that single line is the whole farming exploit closed.
  if p_delta ? 'farm' then
    for v_plot in select value from jsonb_array_elements(p_delta->'farm') loop
      if coalesce((v_plot->>'clear')::boolean, false) then
        update public.player_farm
           set crop_id = null, planted_at = null, watered_at = null
         where user_id = v_uid and slot = v_slot and plot_idx = (v_plot->>'i')::int;
      elsif coalesce((v_plot->>'plant')::boolean, false) then
        update public.player_farm
           set crop_id = v_plot->>'crop', planted_at = now(), watered_at = null
         where user_id = v_uid and slot = v_slot and plot_idx = (v_plot->>'i')::int
           and crop_id is null;                    -- never replant an occupied plot
      elsif coalesce((v_plot->>'water')::boolean, false) then
        update public.player_farm set watered_at = now()
         where user_id = v_uid and slot = v_slot and plot_idx = (v_plot->>'i')::int
           and crop_id is not null and watered_at is null;
      end if;
    end loop;
  end if;

  -- (3) ─ PROGRESS ─
  if p_delta ? 'progress' then
    for v_prog in select value from jsonb_array_elements(p_delta->'progress') loop
      insert into public.player_progress as pp
        (user_id, slot, kind, key, period_key, value, state, updated_at)
      values (v_uid, v_slot, v_prog->>'kind', v_prog->>'key',
              coalesce(v_prog->>'period',''), coalesce((v_prog->>'add')::bigint, 0),
              v_prog->>'state', now())
      on conflict (user_id, slot, kind, key, period_key) do update
        set value = pp.value + coalesce((v_prog->>'add')::bigint, 0),
            state = coalesce(v_prog->>'state', pp.state),
            updated_at = now();
    end loop;
  end if;

  -- (3) ─ ACTIVITY + ACCRUAL WATERMARK ─
  -- `accrued_to` only ever moves FORWARD and only ever to now(). A caller that
  -- asks for a past watermark is asking to be paid the same seconds twice.
  v_act := p_delta->'activity';
  -- The (kind ⇔ id) invariant is a table CHECK, and hitting a CHECK produces an
  -- opaque 23514 rather than a usable error code. Answer it here so a caller bug
  -- reads as a caller bug.
  if v_act ? 'kind' then
    if (v_act->>'kind' = 'idle') <> (nullif(v_act->>'id','') is null) then
      return jsonb_build_object('ok', false, 'error', 'bad_activity');
    end if;
  end if;
  update public.player_state
     set gold = v_new_gold,
         gems = greatest(0, gems + coalesce((p_delta->>'gems')::bigint, 0)),
         hp   = case when p_delta ? 'hp'
                     then greatest(0, least(max_hp, coalesce((p_delta->>'hp')::int, hp)))
                     else hp end,
         active_kind  = coalesce(v_act->>'kind', active_kind),
         active_id    = case when v_act ? 'kind'
                             then nullif(v_act->>'id','') else active_id end,
         active_since = case when coalesce((v_act->>'restart')::boolean, false)
                             then now() else active_since end,
         accrued_to   = case when p_delta ? 'accrued_to' then now() else accrued_to end,
         version      = version + 1,
         updated_at   = now()
   where user_id = v_uid and slot = v_slot;

  -- (4) ─ JOURNAL ─ one row per apply. Fine-grained per-item rows would triple
  -- the write volume of an idle game for detail that `meta` already carries.
  v_kind := coalesce(v_j->>'kind', 'admin');
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, meta)
  values
    (v_uid, v_slot,
     case when v_kind in ('accrue','craft','gather','combat','farm','trade','shop',
                          'quest','equip','admin','iap','clan','raid')
          then v_kind else 'admin' end,
     v_j->>'intent',
     coalesce((p_delta->>'gold')::bigint, 0),
     jsonb_build_object('delta', p_delta - 'journal') || coalesce(v_j->'meta','{}'::jsonb));

  return public.hr_load(v_slot);
end $$;
-- PUBLIC first: Postgres grants EXECUTE to PUBLIC on every new function, so
-- revoking from `authenticated` alone leaves the privilege intact via PUBLIC.
-- This ordering is the difference between a locked door and a locked door with
-- the key under the mat.
revoke execute on function public.hr_apply(int, bigint, jsonb) from public;
revoke execute on function public.hr_apply(int, bigint, jsonb) from authenticated, anon;
-- DELIBERATELY NOT GRANTED TO `authenticated`. hr_apply is the Edge Functions'
-- commit point, called with the service role. If the browser could call it, the
-- browser could author its own delta and every guarantee above evaporates —
-- the clamps would become the game's rules rather than its blast radius.
-- The client's entry points are hr_load() plus the intent RPCs in file 3.

-- ── 4. Self-verification ─────────────────────────────────────────────────
do $$
declare v_bad int;
begin
  if to_regproc('public.hr_load(int)') is null then raise exception 'hr_load missing'; end if;
  if to_regproc('public.hr_apply(int,bigint,jsonb)') is null then raise exception 'hr_apply missing'; end if;

  -- hr_apply must NOT be executable by the browser role. This is the single
  -- most important assertion in the file.
  select count(*) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply'
     and (has_function_privilege('authenticated', p.oid, 'execute')
       or has_function_privilege('anon', p.oid, 'execute'));
  if v_bad > 0 then
    raise exception 'hr_apply is executable by a client role — revoke it';
  end if;

  raise notice 'APPLY ENGINE OK — hr_load is public, hr_apply is service-role only.';
end $$;
