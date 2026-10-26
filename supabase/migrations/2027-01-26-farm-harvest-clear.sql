-- ════════════════════════════════════════════════════════════════════════
-- 2027-01-26-farm-harvest-clear.sql — "HARVEST AND CLEAR PLOT": TAKE THE CROP AND PULL THE VINE.
-- STAGED (lane/a-regrow-harvest, systems-engineer, 2026-10-25). Game CLOSED: applies on its
-- passing §3 (CLAUDE.md §2). A crop + Farming XP surface (through the unchanged harvest): on the
-- Steam EA Security review list beside 2026-12-14-shared-farm.sql.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- Report #66 (v0.2.47): "When I select 'harvest only' it is still replanting them" (tomatoes).
-- Tomato and Emberfruit REGROW by design (src/data/gathering.js regrows:true; src/core/farm.js
-- REGROW_LIMITS, generated into hr_crops.regrow_limit): hr_farm_harvest leaves the vine in the
-- ground and it grows again, regrow_limit more times. The window called that "Harvest only" and
-- said nothing about a regrow: the browser said one thing, the server did another (§6). The fix
-- keeps the regrow and its economy and gives the player the missing choice: a regrowing plot's
-- buttons become "Harvest (grows back N more times)" (hr_farm_harvest, as today) and "Harvest and
-- clear plot" (this file), which takes this harvest and removes the vine so the plot is empty.
-- FOUND ON THE REPLAY (not fixed here, routed): every generated core catalogue since 2026-08-22
-- deletes and re-inserts hr_crops WITHOUT regrow_limit (tools/gen-catalogues.mjs), so the chain
-- ends with regrow_limit 0 = "no limit" on tomato and emberfruit (REGROW_LIMITS says 4). The self-
-- check below therefore probes whichever limit the catalogue holds.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 NEW client RPC hr_farm_harvest_clear(p_slot, p_plot_idx, p_idem) (authenticated; + its
--    hr_client_rpc_baseline row): hr_farm_harvest, UNCHANGED and called (pin e9541e05), under a
--    derived key; then, if the vine regrew, the plot row is deleted under the farm lock the harvest
--    took (this transaction still holds it) and one journal row says so (kind farm, intent
--    farm_clear, qty 0, meta {crop, plot, regrows_left}: the regrows thrown away). A crop that does
--    not regrow, an extra plot and a vine on its last harvest are already gone after the harvest:
--    nothing more is written. The answer is the harvest's, with regrew false, regrows_left null and
--    cleared true. Idempotent per (key, intent farm_clear, slot) through hr_intent_replay, as the
--    replant sibling is.
--    Nothing is minted here: the crop, the XP, the roll, the perks and the day budget are all the
--    harvest's own; the clear only DELETES a row (a sink).
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
-- The one lock order (2027-01-24-skills-from-storage.sql): the acting HERO's advisory key first,
-- then the harvest takes its player_state row and the account FARM key; the delete runs under
-- both. No depot key, no purse. Two heroes clearing one plot serialise on the farm key; the second
-- gets the harvest's empty_plot.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- +1 client RPC naming a slot, a plot index and a key only (no price, count or time). It can do
-- nothing a player could not already do except throw away a vine's remaining regrows. Only the
-- verified user's own rows.
--
-- ── COST ───────────────────────────────────────────────────────────────────
-- No table, column or index. One extra ledger row per clear of a living vine.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- drop function public.hr_farm_harvest_clear(int, int, uuid); delete its hr_client_rpc_baseline
-- row. No data to undo (each clear is journalled).
-- ORDER: after 2027-01-21-market-same-network.sql (restates no object of any earlier file).
-- EDGE: none. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS — FAIL CLOSED ────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.account_farm_plots') is null or to_regclass('public.hr_crops') is null
     or to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'PRECONDITION: account_farm_plots / hr_crops / hr_client_rpc_baseline absent'; end if;
  if to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'PRECONDITION: hr_intent_replay / hr_note_rejection / hr_rpc_gate absent'; end if;
  -- hr_farm_harvest is CALLED, not restated: it must be 2026-12-14-shared-farm.sql's body, whose answer
  -- (ok, crop, regrew, withered, extra) this file reads.
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_farm_harvest(integer,integer,uuid)');
  if v_md5 is distinct from 'e9541e054ed5dd2a79f51f3b1d7919d5' then
    raise exception 'PIN: hr_farm_harvest is not 2026-12-14-shared-farm.sql''s (e9541e05...) - md5 %', v_md5; end if;
end $mig$;

-- ── §1 hr_farm_harvest_clear ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_farm_harvest_clear(p_slot integer, p_plot_idx integer, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- hr_farm_harvest_clear (2027-01-26-farm-harvest-clear.sql): the harvest, unchanged, then a vine
-- that regrew is pulled out so the plot is empty ("Harvest and clear plot", report #66).
declare
  c_max_plots constant int := 128;   -- the table's index fuse
  v_uid    uuid := auth.uid();
  v_cached jsonb;
  v_h      jsonb;
  v_left   int;
  v_out    jsonb;
begin
  if v_uid is null then
    return public.hr_note_rejection('farm_clear', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  if p_idem is null or p_slot is null or p_plot_idx is null or p_plot_idx < 0 or p_plot_idx >= c_max_plots then
    return public.hr_note_rejection('farm_clear', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_clear') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_clear', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;
  -- the harvest's own bucket; the inner harvest spends one more
  if not public.hr_rpc_gate('farm_harvest') then
    return public.hr_note_rejection('farm_clear', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited')); end if;

  -- THE LOCK ORDER: the acting HERO's advisory key FIRST; the harvest then takes its row and the
  -- account farm key, which this transaction keeps for the delete below.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_slot::text, 0));

  v_h := public.hr_farm_harvest(p_slot, p_plot_idx, md5(p_idem::text || ':farm_clear:harvest')::uuid);
  if coalesce(v_h ->> 'ok', '') <> 'true' then return v_h; end if;   -- refused (and noted) by the harvest: nothing moved

  if coalesce(v_h ->> 'regrew', '') = 'true' then
    -- The vine is still in the ground (the harvest re-planted it at now()): pull it out.
    v_left := (v_h ->> 'regrows_left')::int;
    delete from public.account_farm_plots
     where user_id = v_uid and plot_idx = p_plot_idx and crop_id = v_h ->> 'crop';
    insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold_in, xp_in, qty_in, meta)
      values (v_uid, p_slot, 'farm', 'farm_clear', v_h ->> 'produce', 0, 0, 0, 0,
              jsonb_build_object('crop', v_h ->> 'crop', 'plot', p_plot_idx, 'regrows_left', v_left, 'field', 'account'));
  end if;

  v_out := v_h || jsonb_build_object('regrew', false, 'regrows_left', null, 'cleared', true);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_clear', v_out, now())
    on conflict (user_id, intent_id) do nothing;
  return v_out;
end $function$;

revoke execute on function public.hr_farm_harvest_clear(int, int, uuid) from public, anon, service_role;
grant  execute on function public.hr_farm_harvest_clear(int, int, uuid) to authenticated;

delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_farm_harvest_clear';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_farm_harvest_clear', 'p_slot integer, p_plot_idx integer, p_idem uuid', 'authenticated',
   'added 2027-01-26: hr_farm_harvest, then a regrowing vine is removed so the plot is empty (Harvest and clear plot); names a slot, a plot and a key only');

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-00000126fc01';
  k   constant text := '000000c0-0000-4000-b000-00000126';
  v jsonb; v2 jsonb; v_rg text; v_rg_prod text; v_rg_limit int; v_one text; v_one_prod text;
  v_n bigint; v_inv bigint;
begin
  -- the probe's crops, by property (never by name): a regrowing crop (a limited one first; regrow_limit
  -- 0 = no limit), and one that does not regrow
  select crop_id, prod_item, regrow_limit into v_rg, v_rg_prod, v_rg_limit from public.hr_crops
   where regrows order by (regrow_limit > 0) desc, crop_id limit 1;
  select crop_id, prod_item into v_one, v_one_prod from public.hr_crops where not regrows order by crop_id limit 1;
  if v_rg is null or v_one is null then raise exception 'VERIFY: the catalogue has no regrowing or no plain crop to probe'; end if;

  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'farm-harvest-clear §2 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY: hr_create_character(0) refused: %', v; end if;
    if public.hr_farm_plot_cap(v_u) < 2 then raise exception 'VERIFY: a fresh account''s field holds fewer than 2 plots'; end if;
    -- two ready vines of the regrowing crop, first harvest each
    insert into public.account_farm_plots (user_id, plot_idx, crop_id, planted_at, waterings, regrow_count, planted_by)
      values (v_u, 0, v_rg, now() - interval '2000 hours', '{}', 0, 0), (v_u, 1, v_rg, now() - interval '2000 hours', '{}', 0, 0);

    -- (a) REGROWING + CLEAR: paid once, the plot is EMPTY, the clear is journalled.
    v := public.hr_farm_harvest_clear(0, 0, (k || '0001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'cleared') is distinct from 'true' or (v->>'regrew') is distinct from 'false'
       or (v->>'qty')::bigint < 1 then
      raise exception 'VERIFY(a): harvest-and-clear of a regrowing crop answered %', v; end if;
    if exists (select 1 from public.account_farm_plots where user_id = v_u and plot_idx = 0) then
      raise exception 'VERIFY(a): the vine is still in plot 0 after a clear'; end if;
    select qty into v_inv from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_rg_prod;
    if v_inv is distinct from (v->>'qty')::bigint then raise exception 'VERIFY(a): the bag holds % %, the answer says %', v_inv, v_rg_prod, v->>'qty'; end if;
    select count(*) into v_n from public.player_ledger where user_id = v_u and intent = 'farm_harvest';
    if v_n <> 1 then raise exception 'VERIFY(a): % harvest rows after one clear', v_n; end if;
    if not exists (select 1 from public.player_ledger where user_id = v_u and intent = 'farm_clear' and kind = 'farm'
                    and (meta->>'plot')::int = 0
                    and (meta->>'regrows_left')::int is not distinct from case when v_rg_limit > 0 then v_rg_limit - 1 end) then
      raise exception 'VERIFY(a): the clear is not journalled with the regrows thrown away'; end if;

    -- (b) REPLAY: the same key is the cached answer and pays nothing more.
    v2 := public.hr_farm_harvest_clear(0, 0, (k || '0001')::uuid);
    if v2 is distinct from v then raise exception 'VERIFY(b): a replay answered % (first %)', v2, v; end if;
    if (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_rg_prod) is distinct from v_inv
       or (select count(*) from public.player_ledger where user_id = v_u and intent in ('farm_harvest', 'farm_clear')) <> 2 then
      raise exception 'VERIFY(b): a replay moved something'; end if;
    -- the key is the clear's: naming it on the plain harvest is an intent_mismatch, never a second payout
    if public.hr_farm_harvest(0, 0, (k || '0001')::uuid)->>'error' is distinct from 'intent_mismatch' then
      raise exception 'VERIFY(b): the clear''s key was accepted by hr_farm_harvest'; end if;

    -- (c) REGROWING + PLAIN HARVEST: unchanged, the vine stays and grows again.
    v := public.hr_farm_harvest(0, 1, (k || '0002')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'regrew') is distinct from 'true' then
      raise exception 'VERIFY(c): a plain harvest of a regrowing crop answered %', v; end if;
    if not exists (select 1 from public.account_farm_plots where user_id = v_u and plot_idx = 1 and crop_id = v_rg and regrow_count = 1) then
      raise exception 'VERIFY(c): the vine did not stay in plot 1 after a plain harvest'; end if;

    -- (d) A VINE ON ITS LAST HARVEST + CLEAR (a limited crop): it withers in the harvest; no clear row,
    --     the plot empty. With no limit, the regrown vine in plot 1 is cleared like plot 0.
    update public.account_farm_plots set planted_at = now() - interval '2000 hours', regrow_count = greatest(v_rg_limit, 1)
     where user_id = v_u and plot_idx = 1;
    v := public.hr_farm_harvest_clear(0, 1, (k || '0003')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->>'cleared') is distinct from 'true'
       or (v->>'withered') is distinct from (v_rg_limit > 0)::text
       or exists (select 1 from public.account_farm_plots where user_id = v_u and plot_idx = 1)
       or (select count(*) from public.player_ledger where user_id = v_u and intent = 'farm_clear') <> (case when v_rg_limit > 0 then 1 else 2 end) then
      raise exception 'VERIFY(d): a second clear answered % (limit %)', v, v_rg_limit; end if;

    -- (e) A CROP THAT DOES NOT REGROW + CLEAR: the harvest alone, the plot empty, no clear row.
    insert into public.account_farm_plots (user_id, plot_idx, crop_id, planted_at, waterings, regrow_count, planted_by)
      values (v_u, 0, v_one, now() - interval '2000 hours', '{}', 0, 0);
    v := public.hr_farm_harvest_clear(0, 0, (k || '0004')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or exists (select 1 from public.account_farm_plots where user_id = v_u and plot_idx = 0)
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_one_prod) is distinct from (v->>'qty')::bigint
       or (select count(*) from public.player_ledger where user_id = v_u and intent = 'farm_clear') <> (case when v_rg_limit > 0 then 1 else 2 end) then
      raise exception 'VERIFY(e): a plain crop''s clear answered %', v; end if;

    -- (f) REFUSALS: an empty plot is the harvest's empty_plot; a bad index is bad_intent; nothing moves.
    if public.hr_farm_harvest_clear(0, 0, (k || '0005')::uuid)->>'error' is distinct from 'empty_plot'
       or public.hr_farm_harvest_clear(0, -1, (k || '0006')::uuid)->>'error' is distinct from 'bad_intent' then
      raise exception 'VERIFY(f): an empty or bad plot was not refused'; end if;

    raise exception using errcode = 'HR8A6', message = 'farm-harvest-clear §2 complete - rolling back';
  exception when sqlstate 'HR8A6' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.account_farm_plots where user_id = v_u)
     or exists (select 1 from public.player_ledger where user_id = v_u) or exists (select 1 from public.player_intents where user_id = v_u) then
    raise exception 'VERIFY(g): §2 LEAKED a probe row'; end if;
  if public.hr_farm_harvest_clear(0, 0, gen_random_uuid())->>'error' is distinct from 'not_signed_in' then
    raise exception 'VERIFY(g): a signed-out call was not refused'; end if;

  -- (h) THE GRANTS: authenticated only, never PUBLIC; on the client surface baseline.
  if has_function_privilege('anon', 'public.hr_farm_harvest_clear(integer,integer,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_farm_harvest_clear(integer,integer,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_farm_harvest_clear(integer,integer,uuid)', 'execute') then
    raise exception 'VERIFY(h): hr_farm_harvest_clear is not authenticated-only'; end if;
  if exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where p.oid = 'public.hr_farm_harvest_clear(integer,integer,uuid)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'VERIFY(h): PUBLIC can execute hr_farm_harvest_clear'; end if;
  if not exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_farm_harvest_clear' and grantee = 'authenticated') then
    raise exception 'VERIFY(h): hr_farm_harvest_clear is not on hr_client_rpc_baseline'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'farm-harvest-clear: a regrowing vine can be harvested and cleared (paid once, plot empty, journalled), a plain harvest still regrows, replays are cached; all green';
end $$;
