-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-10-lone-hunt-weekly-chest.sql — THE LONE HUNT IS AN HONEST WEEKLY
--                                         CHEST WITH A SERVER-DERIVED GATE.
--
-- STAGED, NOT APPLIED - REVIEW ONLY. SECURITY GO REQUIRED BEFORE APPLY (lane C:
--   gold, gems and inventory). The Coordinator applies it with
--   `node tools/apply-migration.mjs supabase/migrations/2026-10-10-lone-hunt-weekly-chest.sql`
--   (one file, never inside begin/commit, never 00:00-00:10 UTC). NO EDGE CHANGE.
--   The client half (src/features/raids.js: the Lone Hunt card becomes a weekly
--   chest card, the solo strike/pool is deleted) rides the next cut AFTER this
--   applies. Before it applies the new card's Claim reaches the OLD body and
--   pays as today; after it applies an OLD client's "fake fight" still reaches
--   the gate below and is refused until the kills are real. Either order is safe.
--
-- ── THE DEFECT (whole-game review, 2026-10-08) ──────────────────────────────
-- The solo "Lone Hunt" fight was simulated in the browser
-- (src/features/raids.js soloStrike/applySolo: a client-rolled damage number
-- against a client-sized pool), and when the browser said the boss fell it
-- called raid_claim('solo'). raid_claim__ungated's solo branch checked NOTHING
-- but the once-per-week insert, then paid 1,120 gold + 2 gems + 2 boss
-- materials. So every account could take the chest every week by calling one
-- RPC — the "fight" was decoration, and a client's word was the only gate.
--
-- ── THE RULING (Game Designer, final) ───────────────────────────────────────
-- "Replace it with an honest weekly chest whose eligibility is server-derived
--  (e.g. a weekly kill or bounty threshold from server counters). No client
--  damage, boss or limit. Keep the payout or lower it, never raise it."
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
-- ONE anchored, exactly-once insert into raid_claim__ungated's SOLO branch, in
-- front of the once-per-week consume:
--
--   eligible  ⇔  Σ player_progress(kind='daily', key='ev:kill_any',
--                                  period_key ∈ the 7 UTC day keys of the
--                                  claimed HUNT WEEK) for the CREDITED slot
--               ≥ c_lone_kills (300)
--
--   · The counter is the server's own: kind='daily' ev:kill_any is stamped by
--     the accrual settle (hr_apply, hr_engine only) for every kill, attended or
--     away, and read by hr_claim_daily / hr_claim_goal already. The client
--     sends NO number — the RPC signature is unchanged and takes none.
--   · The window is the claim's own hunt week (v_target, already derived
--     server-side, including the 24h Monday-grace previous week), so the kills
--     that open a week's chest are that week's kills.
--   · Refused BEFORE the consume: `not_eligible` with {have, need, week}, so a
--     refusal costs nothing and the card can show the server's count.
--   · The payout is UNCHANGED (1,120 gold + 2 gems + 2 materials) — the ruling
--     allows keeping it; nothing about the chest grows.
--
-- ── THE THRESHOLD (300 kills in the hunt week) ──────────────────────────────
-- Authored once in src/data/raid-bosses.js LONE_HUNT_CHEST.killsNeeded and bound
-- to this file's literal by tests/raid-card-copy.mjs. Sized against the weekly
-- goal wk_kills (100) and road_hunt (500 lifetime): three weekly goals' worth of
-- fighting, which an idle-combat player reaches in a few hours across the week
-- (away accrual counts). It is the Designer's dial.
--
-- ── THE BOUNTY-FREE CREDIT IS DISCOUNTED (Security A1, 2026-10-08) ─────────
-- hr_credit_kills (authenticated, 60/min) has a BOUNTY-FREE branch that adds a
-- client-reported count (physics-capped, up to 10,000/day) to this same daily
-- ev:kill_any row (2026-09-01-kill-daily-credit.sql). Every such credit is logged
-- in hr_kill_credit_log with free = true and applied = exactly what it stamped,
-- so the gate subtracts the week's sum(applied) and counts only what the
-- server's own settle simulated. That log must therefore outlive the hunt week:
-- 2026-10-10-kill-credit-prune-8d.sql raises its prune floor from 2 to 8 days.
-- The residual is the one documented in 2026-09-01: a settle's kills landing
-- before the day's first free credit can be under-subtracted (bounded by one
-- settle, self-only, under-credits in the safe direction otherwise).
--
-- ── COST AT 100x PLAYERS ────────────────────────────────────────────────────
-- One indexed sum over ≤7 PK rows plus one sum over the week's free credit rows
-- (hr_kill_credit_log_free_day_idx: user_id, slot, created_at where free) per
-- solo claim (≤1 claim per account-week). No new table, row, index or journal shape.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Anchored insert; revert by re-applying 2026-08-22-raid-chest-items.sql §2
-- (the static solo body). No data is written by this file.
--
-- ── LIVE-HASH NOTE ──────────────────────────────────────────────────────────
-- raid_claim__ungated is tracked; the repo reads ahead of production until
-- applied (Coordinator re-measures with --live --write).
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS ─────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.raid_claim__ungated(text,uuid,text,integer)') is null then
    raise exception 'PRECONDITION: raid_claim__ungated(text,uuid,text,int) is absent';
  end if;
  if to_regprocedure('public.hr_week_start(text)') is null
     or to_regprocedure('public.hr_utc_day_key(timestamptz)') is null then
    raise exception 'PRECONDITION: hr_week_start / hr_utc_day_key are absent';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'hr_kill_credit_log' and column_name = 'free') then
    raise exception 'PRECONDITION: hr_kill_credit_log.free is absent - apply 2026-09-01-kill-daily-credit.sql first';
  end if;
end $$;

-- ── 1. THE GATE — anchored, exactly once ────────────────────────────────────
do $$
declare
  v_def text;
  c_anchor constant text := $anc$  if p_scope = 'solo' then
    insert into public.raid_claims (user_id, week_key, scope, clan_id, boss_id, scale)$anc$;
  c_new constant text := $new$  if p_scope = 'solo' then
    -- THE LONE HUNT'S GATE (2026-10-10-lone-hunt-weekly-chest.sql). The chest
    -- opens on the SERVER's own count of this character's kills in the claimed
    -- hunt week: the kind='daily' ev:kill_any rows the accrual settle stamps,
    -- summed over the week's seven UTC day keys, MINUS the week's bounty-free
    -- credits (hr_kill_credit_log.free, sum(applied) = exactly what that branch
    -- stamped onto the same daily rows). hr_credit_kills's bounty-free branch
    -- takes a client-reported count up to 10,000/day, so it must not open a
    -- chest; what remains is what the server's own settle simulated (Security
    -- A1, 2026-10-08). No client number is read.
    -- Refused BEFORE the once-per-week consume, so a refusal costs nothing.
    declare
      c_lone_kills constant bigint := 300;   -- src/data/raid-bosses.js LONE_HUNT_CHEST.killsNeeded
      v_lone_have  bigint;
      v_lone_free  bigint;
    begin
      select coalesce(sum(pp.value), 0) into v_lone_have
        from public.player_progress pp
       where pp.user_id = auth.uid() and pp.slot = v_slot
         and pp.kind = 'daily' and pp.key = 'ev:kill_any'
         and pp.period_key in (
               select public.hr_utc_day_key(public.hr_week_start(v_target) + make_interval(days => d))
                 from generate_series(0, 6) as d);
      select coalesce(sum(kl.applied), 0) into v_lone_free
        from public.hr_kill_credit_log kl
       where kl.user_id = auth.uid() and kl.slot = v_slot and kl.free
         and kl.created_at >= public.hr_week_start(v_target)
         and kl.created_at <  public.hr_week_start(v_target) + interval '7 days';
      v_lone_have := greatest(0, v_lone_have - v_lone_free);
      if v_lone_have < c_lone_kills then
        return jsonb_build_object('ok', false, 'error', 'not_eligible', 'week', v_target,
                                  'have', v_lone_have, 'need', c_lone_kills);
      end if;
    end;
    insert into public.raid_claims (user_id, week_key, scope, clan_id, boss_id, scale)$new$;
begin
  v_def := replace(pg_get_functiondef('public.raid_claim__ungated(text,uuid,text,integer)'::regprocedure), chr(13), '');
  if strpos(v_def, '2026-10-10-lone-hunt-weekly-chest.sql') > 0 then
    raise notice 'raid_claim__ungated already gates the Lone Hunt - patch skipped'; return;
  end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE raid_claim__ungated solo branch did not match exactly once - its shape is '
                    'not 2026-08-22-raid-chest-items.sql §2. Do NOT patch a body you cannot account for.';
  end if;
  execute replace(v_def, c_anchor, c_new);
end $$;

revoke execute on function public.raid_claim__ungated(text, uuid, text, int) from public, anon, authenticated, service_role;

-- ── 4. SELF-CHECK — executed, net-zero (sentinel HR8A5) ─────────────────────
do $$
declare
  v       jsonb;
  v_uid   constant uuid := '000000c0-0000-0000-0000-00000000a105';
  v_week  text := public.hr_utc_week_key();
  v_day0  text := public.hr_utc_day_key(public.hr_week_start(public.hr_utc_week_key()));
  v_prev  text := public.hr_utc_day_key(public.hr_week_start(public.hr_utc_week_key()) - interval '1 day');
  v_g0    bigint;
  v_g1    bigint;
  v_n     int;
begin
  if has_function_privilege('authenticated', 'public.raid_claim__ungated(text,uuid,text,integer)', 'execute')
     or has_function_privilege('anon', 'public.raid_claim__ungated(text,uuid,text,integer)', 'execute') then
    raise exception 'VERIFY: raid_claim__ungated is client-executable';
  end if;
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version) values (v_uid, 0, 0, 0, 1), (v_uid, 1, 0, 0, 1);

    -- (a) ZERO kills: refused not_eligible, nothing paid, the week NOT consumed.
    v := public.raid_claim__ungated('solo', null, v_week, 0);
    if v->>'error' <> 'not_eligible' or (v->>'have')::bigint <> 0 or (v->>'need')::bigint <> 300 then
      raise exception 'VERIFY(a): a zero-kill solo claim was not refused not_eligible: %', v; end if;
    if exists (select 1 from public.raid_claims where user_id = v_uid) then
      raise exception 'VERIFY(a): a refused claim consumed the week'; end if;
    select gold into v_g0 from public.player_state where user_id = v_uid and slot = 0;
    if v_g0 <> 0 then raise exception 'VERIFY(a): a refused claim paid % gold', v_g0; end if;

    -- (b) 299 this week + 999 the day BEFORE the week: still refused — the
    --     window is the claimed week only, never a lifetime or a neighbour.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, 0, 'daily', 'ev:kill_any', 299, v_day0, 'active'),
             (v_uid, 0, 'daily', 'ev:kill_any', 999, v_prev, 'active'),
             (v_uid, 0, 'stat',  'ev:kill_any', 99999, '', 'active');
    v := public.raid_claim__ungated('solo', null, v_week, 0);
    if v->>'error' <> 'not_eligible' or (v->>'have')::bigint <> 299 then
      raise exception 'VERIFY(b): 299 in-week kills were not refused (or the window leaked): %', v; end if;

    -- (c) the OTHER slot's kills do not count for this slot.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, 1, 'daily', 'ev:kill_any', 5000, v_day0, 'active');
    v := public.raid_claim__ungated('solo', null, v_week, 0);
    if v->>'error' <> 'not_eligible' then
      raise exception 'VERIFY(c): another character''s kills opened this character''s chest: %', v; end if;

    -- (e) 300 BOUNTY-FREE CREDITED kills are refused (Security A1): the daily row
    --     reads 300, but every one of them was stamped by hr_credit_kills's
    --     bounty-free branch (a client-reported count), so the server count is 0.
    update public.player_progress set value = 300
     where user_id = v_uid and slot = 0 and kind = 'daily' and period_key = v_day0;
    insert into public.hr_kill_credit_log (user_id, slot, idem, target, claimed, credit, cap, applied, free)
      values (v_uid, 0, 'lone-hunt-probe-free', 'goblin', 300, 300, 300, 300, true);
    v := public.raid_claim__ungated('solo', null, v_week, 0);
    if v->>'error' <> 'not_eligible' or (v->>'have')::bigint <> 0 then
      raise exception 'VERIFY(e): 300 bounty-free credited kills opened the chest (or were not discounted): %', v; end if;

    -- (d) 300 SETTLED kills on top of the 300 free ones: pays EXACTLY the
    --     unchanged chest (1,120 gold + 2 gems), once.
    update public.player_progress set value = 600
     where user_id = v_uid and slot = 0 and kind = 'daily' and period_key = v_day0;
    v := public.raid_claim__ungated('solo', null, v_week, 0);
    if coalesce(v->>'ok','') <> 'true' or (v->>'gold')::bigint <> 1120 or (v->>'gems')::int <> 2 then
      raise exception 'VERIFY(d): the eligible claim did not pay the unchanged chest: %', v; end if;
    select gold into v_g1 from public.player_state where user_id = v_uid and slot = 0;
    if v_g1 <> 1120 then raise exception 'VERIFY(d): player_state gold % (expected 1120)', v_g1; end if;
    v := public.raid_claim__ungated('solo', null, v_week, 0);
    if v->>'error' <> 'already_claimed' then raise exception 'VERIFY(d): replay not refused: %', v; end if;
    select count(*) into v_n from public.player_ledger where user_id = v_uid and kind = 'raid';
    if v_n <> 1 then raise exception 'VERIFY(d): % raid journal rows, expected 1', v_n; end if;

    raise exception using errcode = 'HR8A5', message = 'lone-hunt §4 complete - rolling back';
  exception when sqlstate 'HR8A5' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.raid_claims where user_id = v_uid)
     or exists (select 1 from public.hr_kill_credit_log where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY: §4 LEAKED a probe row';
  end if;
  raise notice 'lone-hunt: 0 / 299 / other-slot / 300 bounty-free refused not_eligible without consuming the '
               'week, the neighbouring day and the lifetime counter do not count, 300 settled pays the unchanged chest once — all green';
end $$;
