-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-10-muster-chest-xp-credit.sql — THE RALLY CHEST'S XP IS CREDITED BY
--   THE SERVER, INSIDE THE CLAIM. THE BROWSER NO LONGER AUTHORS IT.
--
-- STATUS: STAGED, NOT APPLIED — Security review required (XP is a ranked
-- surface). Lane C (lane/b567-muster-xp-server). The Coordinator applies
-- (tools/apply-migration.mjs, one file, never inside begin/commit, never
-- 00:00–00:10 UTC). CHAIN POSITION: AFTER 2026-10-10-w0a-catalogue-cuts.sql —
-- the online body below is restated from w0a's (Seal-free) version, so applying
-- this first and w0a second would put the client-mint body back. §0 refuses to
-- apply unless the live online body is w0a's (no `seals`).
--
-- ── THE DEFECT (P1 class-kill, CLAUDE.md §1; confirmed by Security) ─────────
-- hr_rally_chest converts 20% of a rally band's gold into an XP budget (up to
-- 1,500 g -> 3,000 XP, 2 XP/g, split across the theme's skills). Both claim
-- bodies (world_event_claim__ungated, world_event_absence_claim__ungated)
-- COMPUTED that list, journalled it in meta, RETURNED it — and never wrote
-- player_skills (xp_in 0). src/features/muster.js payChest then called
-- window.addXp for each entry:
--   · non-combat themes: the next envelope replaced G.skills — XP shown, never
--     kept, and the gold that bought it was already spent;
--   · combat themes (ashen_horde: attack/strength/defense): addXp routes combat
--     XP into G._combatXpPending -> hr_credit_combat_xp, so CLIENT-AUTHORED XP
--     reached the ranked credit (bounded only by the combat cap).
-- Measured on prod 2026-10-10: 0 rally ledger rows — it has never fired live.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
--   world_event_claim(p_day_key text, p_slot int)   — wrapper UNCHANGED
--   world_event_absence_claim(p_day_key text)        — wrapper UNCHANGED
--   Both __ungated inners are RESTATED; same arity, same grants (inner: no
--   client role; wrapper: authenticated), so hr_client_rpc_baseline is untouched.
--
--   NEW in both bodies, in this order:
--     1. the chest is priced (hr_rally_chest is pure, so pricing it before the
--        consume changes nothing it returns);
--     2. hr_rally_xp_credit (NEW, no client grant) turns the chest's `xp` list
--        into the credit: skill ids must be in hr_rally_theme(<the server's own
--        event id>).skills AND in hr_skills; each amount is clamped to
--        [0, 3000] (the hr_rally_chest ceiling: 7,500 g x 0.20 x 2 XP/g) and the
--        total to 3000; duplicate skills fold;
--     3. hr_day_budget_check(uid, slot, 0, xp_total, 0, 0) — BEFORE the consume,
--        so a refusal ('daily_budget') spends nothing and leaves the claim
--        claimable;
--     4. the consume (unchanged conditional flip; a replay stops here);
--     5. player_skills += credit, OWN ROW ONLY (auth.uid(), the claim's own slot)
--        — additive upsert, same transaction as the consume;
--     6. player_state.version + 1 (the online body already bumped; the absence
--        body now bumps too, so a held envelope is stale and the gap-heal /
--        next settle re-reads the absolute skills);
--     7. the rally ledger row carries xp_in = xp_total and meta.xp = the
--        CREDITED list (meta.xp_chest = what the chest priced, for audit).
--   RESPONSE: `xp` is now the CREDITED list [{skill, amount}] (same shape the
--   client already sanitises) plus `xp_total`. The client renders it and never
--   adds it — the absolute skills arrive on the next envelope.
--
--   ERROR TAXONOMY (additive): 'daily_budget' {detail} — refused before the
--   consume; absence also gains 'no_character' (the pledge's slot has no
--   character — previously an FK raise on the item insert).
--
-- ── WHY xp_in IS SET (a deliberate departure from the b422 convention) ──────
-- b422 kept once-per-period chest rewards out of the shared day budget (xp_in
-- 0). Security's ruling for this lane is the opposite: the credit is checked
-- against and journalled into the ONE day budget. 3,000 XP against a
-- 120,000,000/day ceiling cannot make an honest night start refuse.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- The once-guard is unchanged: the conditional UPDATE on world_event_joins /
-- world_event_pledges takes the row lock; a concurrent second call blocks, then
-- sees row_count 0 and returns already_claimed / already_settled before any
-- credit. Consume, skills, inventory, gold and the ledger row are one
-- transaction. The day-budget read is check-then-insert like hr_apply's (the
-- accepted house TOCTOU; the 120M ceiling is a runaway fuse, not a tight one).
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- Strictly narrower: the client loses its last XP input on this surface (no
-- addXp). No new client-callable function; hr_rally_xp_credit is executable by
-- no client role. No client value reaches the credit: event key, slot and the
-- XP list are the server's own rows.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- At most one claim per character per day (+ one absence). Per claim: <= 4
-- player_skills upserts, one ledger row (unchanged count). At 100x players:
-- no new rows beyond the existing one-per-claim ledger row.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply 2026-10-10-w0a-catalogue-cuts.sql §1c (online body) and
-- 2026-08-22-absence-chest-items.sql §2 (absence body); drop
-- hr_rally_xp_credit(text, jsonb). Credited XP stays credited (it was earned);
-- the client half must then go back too or the XP is shown nowhere.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS (fail closed) ─────────────────────────────────────────
do $$
declare v_src text;
begin
  if to_regprocedure('public.world_event_claim__ungated(text,integer)') is null
     or to_regprocedure('public.world_event_absence_claim__ungated(text)') is null
     or to_regprocedure('public.world_event_claim(text,integer)') is null
     or to_regprocedure('public.world_event_absence_claim(text)') is null then
    raise exception '§0: the muster claim surface is missing';
  end if;
  if to_regprocedure('public.hr_rally_chest(text,bigint,integer,integer)') is null
     or to_regprocedure('public.hr_rally_theme(text)') is null
     or to_regprocedure('public.hr_rally_event_for_key(text)') is null then
    raise exception '§0: the rally-v2 chest functions are missing';
  end if;
  if to_regprocedure('public.hr_day_budget_check(uuid,integer,bigint,bigint,bigint,bigint)') is null then
    raise exception '§0: the six-argument hr_day_budget_check is missing — apply 2026-08-15-gem-daily-budget.sql';
  end if;
  if to_regclass('public.hr_skills') is null or to_regclass('public.player_skills') is null then
    raise exception '§0: hr_skills / player_skills missing';
  end if;
  -- CHAIN POSITION: the online body must already be w0a's (Seal-free). This
  -- file restates FROM that body; applying it before w0a would be fine for XP
  -- but a later w0a apply would then put the client-mint body back.
  select prosrc into v_src from pg_proc
   where oid = 'public.world_event_claim__ungated(text,integer)'::regprocedure;
  if v_src ~ '\mv_seal\M' then
    raise exception '§0: world_event_claim__ungated still carries the Rally Seal — apply '
                    '2026-10-10-w0a-catalogue-cuts.sql FIRST (this file restates its body)';
  end if;
end $$;

-- ── 1. THE CREDIT CALCULATOR (pure; no client grant) ───────────────────────
-- Input: the server's own event key and the chest hr_rally_chest priced.
-- Output: {list:[{skill,amount}], total, by_skill:{skill:amount}} — only theme
-- skills that exist in hr_skills, each clamped, total clamped. It never reads a
-- client value: both arguments are computed inside the claim body.
create or replace function public.hr_rally_xp_credit(p_event_key text, p_chest jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  -- The hr_rally_chest ceiling: 7,500 g band x 0.20 XP share x 2 XP per gold.
  -- A chest can never price more; a larger number is a broken chest, and it is
  -- clamped, never trusted.
  c_max_chest_xp constant bigint := 3000;
  v_theme  jsonb;
  v_skills text[];
  v_by     jsonb := '{}'::jsonb;
  v_list   jsonb := '[]'::jsonb;
  v_total  bigint := 0;
  v_x      jsonb;
  v_sk     text;
  v_amt    bigint;
  v_room   bigint;
begin
  v_theme := public.hr_rally_theme(public.hr_rally_event_for_key(p_event_key));
  if v_theme is null or p_chest is null or jsonb_typeof(p_chest->'xp') is distinct from 'array' then
    return jsonb_build_object('list', v_list, 'total', 0, 'by_skill', v_by);
  end if;
  select array_agg(s) into v_skills from jsonb_array_elements_text(v_theme->'skills') s;

  for v_x in select * from jsonb_array_elements(p_chest->'xp') loop
    if jsonb_typeof(v_x) is distinct from 'object' then continue; end if;
    v_sk := v_x->>'skill';
    if v_sk is null or not (v_sk = any(v_skills))
       or not exists (select 1 from public.hr_skills where skill_id = v_sk) then
      continue;
    end if;
    -- a non-number is zero; a number is floored and clamped IN numeric, so no
    -- magnitude can overflow the bigint cast.
    if jsonb_typeof(v_x->'amount') = 'number' then
      v_amt := least(greatest(floor((v_x->>'amount')::numeric), 0), c_max_chest_xp)::bigint;
    else
      v_amt := 0;
    end if;
    v_room := c_max_chest_xp - v_total;
    v_amt  := least(v_amt, v_room);
    if v_amt <= 0 then continue; end if;
    v_by    := jsonb_set(v_by, array[v_sk], to_jsonb(coalesce((v_by->>v_sk)::bigint, 0) + v_amt));
    v_total := v_total + v_amt;
  end loop;

  for v_sk, v_amt in select key, value::bigint from jsonb_each_text(v_by) order by key loop
    v_list := v_list || jsonb_build_object('skill', v_sk, 'amount', v_amt);
  end loop;
  return jsonb_build_object('list', v_list, 'total', v_total, 'by_skill', v_by);
end $$;
revoke execute on function public.hr_rally_xp_credit(text, jsonb) from public;
revoke execute on function public.hr_rally_xp_credit(text, jsonb) from anon, authenticated, service_role;

-- ── 2. THE ONLINE CLAIM (restated from 2026-10-10-w0a-catalogue-cuts.sql §1c) ─
create or replace function public.world_event_claim__ungated(p_day_key text, p_slot int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_join     public.world_event_joins%rowtype;
  v_tot      public.world_event_totals%rowtype;
  v_median   numeric;
  v_rows     int;
  v_slot     int := coalesce(p_slot, 0);
  v_gold     bigint := 0;
  v_gems     int    := 0;
  v_band     text   := 'none';
  v_held     boolean := false;
  -- themed-chest locals
  v_chest    jsonb;
  v_gold_out bigint;
  v_gems_out int;
  v_it       jsonb;
  v_iid      text;
  v_iqty     bigint;
  v_qty_total bigint := 0;
  -- XP credit locals (2026-10-10-muster-chest-xp-credit.sql)
  v_xc       jsonb;
  v_xp_total bigint := 0;
  v_bud      jsonb;
  v_sk       text;
  v_amt      bigint;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  -- The credit target must be one of the caller's OWN characters. Checked BEFORE
  -- any consume, so a bad/foreign slot never spends the claim. auth.uid() scopes
  -- it to the caller, so a forged slot can only miss the caller's own rows.
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  select * into v_join from public.world_event_joins
    where day_key = p_day_key and user_id = auth.uid();
  if v_join.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_joined');
  end if;
  if v_join.claimed then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;
  if v_join.points <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_contribution');
  end if;
  if p_day_key is distinct from public.hr_utc_day_key() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if now() < v_join.window_end then
    return jsonb_build_object('ok', false, 'error', 'still_live',
                              'ends_at', v_join.window_end);
  end if;

  select * into v_tot from public.world_event_totals where event_key = v_join.event_key;
  v_held := v_tot.met_at is not null;

  select percentile_cont(0.5) within group (order by points)
    into v_median
    from public.world_event_joins
   where event_key = v_join.event_key and points >= 200;
  v_median := coalesce(nullif(v_median, 0), 200);

  -- Ceiling per §5.2: 7,500 gold · 10 gems. No hearth_token. (W0: the Rally
  -- Seal is cut — this body no longer computes, journals or returns one.)
  v_gold := 1500; v_gems := 2; v_band := 'answered';
  if v_join.points >= v_median * 0.60 then
    v_gold := v_gold + 1500; v_gems := v_gems + 2; v_band := 'silver';
  end if;
  if v_join.points >= v_median * 1.50 then
    v_gold := v_gold + 2000; v_gems := v_gems + 2; v_band := 'gold';
  end if;
  if v_held then
    v_gold := (v_gold * 1.5)::bigint; v_gems := v_gems + 2;
  end if;

  -- ── THE THEMED CHEST. Server owns the pool AND the conversion (rally-v2 §3).
  --    hr_rally_chest is pure, so it is priced BEFORE the consume: the XP it
  --    converts must clear the day budget first, and a refusal must spend
  --    nothing. No client value crosses in — event_key is the server's own join
  --    row, hr_rally_chest re-derives the theme from it.
  v_chest    := public.hr_rally_chest(v_join.event_key, v_gold, v_gems, 0);
  v_gold_out := coalesce((v_chest->>'gold')::bigint, v_gold);
  v_gems_out := coalesce((v_chest->>'gems')::int,    v_gems);

  -- ── THE XP CREDIT, validated (theme skills ∩ hr_skills, clamped) and checked
  --    against the ONE day budget BEFORE the consume.
  v_xc       := public.hr_rally_xp_credit(v_join.event_key, v_chest);
  v_xp_total := coalesce((v_xc->>'total')::bigint, 0);
  if v_xp_total > 0 then
    v_bud := public.hr_day_budget_check(auth.uid(), v_slot, 0, v_xp_total, 0, 0);
    if v_bud is not null then
      return jsonb_build_object('ok', false, 'error', 'daily_budget', 'detail', v_bud, 'slot', v_slot);
    end if;
  end if;

  -- ── THE CONSUME. Conditional flip; row_count = 0 means a replay already took it.
  update public.world_event_joins
     set claimed = true, claimed_at = now()
   where day_key = p_day_key and user_id = auth.uid() and claimed = false;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;

  -- ── THE CREDIT (after the consume guard → exactly once). Same transaction as
  --    the consume, so a rollback undoes both; a replay never reaches here.
  update public.player_state
     set gold = coalesce(gold, 0) + v_gold_out,
         gems = coalesce(gems, 0) + v_gems_out,
         version = version + 1,
         updated_at = now()
   where user_id = auth.uid() and slot = v_slot;

  -- ── THE XP. Own row only (auth.uid(), the checked slot). Additive upsert.
  for v_sk, v_amt in select key, value::bigint from jsonb_each_text(v_xc->'by_skill') loop
    insert into public.player_skills as ps (user_id, slot, skill_id, xp)
      values (auth.uid(), v_slot, v_sk, v_amt)
      on conflict (user_id, slot, skill_id) do update set xp = ps.xp + excluded.xp;
  end loop;

  -- ── THE ITEMS. Written to player_inventory — the source of truth the accrual
  --    absolute envelope is built FROM, so a credited item survives the flip by
  --    construction. Additive upsert (existing qty + granted), scoped to the
  --    caller's own (user_id, slot).
  for v_it in select * from jsonb_array_elements(v_chest->'items') loop
    v_iid  := v_it->>'id';
    v_iqty := coalesce((v_it->>'qty')::bigint, 0);
    if v_iid is not null and v_iqty > 0 then
      insert into public.player_inventory as pi (user_id, slot, item_id, qty)
        values (auth.uid(), v_slot, v_iid, v_iqty)
        on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
      v_qty_total := v_qty_total + v_iqty;
    end if;
  end loop;

  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_slot, 'rally', 'world_event_claim:' || p_day_key,
     v_gold_out, 0, v_xp_total, 0, 0,
     jsonb_build_object('band', v_band, 'held', v_held, 'gems', v_gems_out,
                        'day_key', p_day_key,
                        'event_key', v_join.event_key,
                        'band_gold', v_gold, 'items', v_chest->'items',
                        'item_qty', v_qty_total, 'xp', v_xc->'list',
                        'xp_chest', v_chest->'xp'));

  return jsonb_build_object('ok', true, 'band', v_band, 'held', v_held,
    'gold', v_gold_out, 'band_gold', v_gold, 'gems', v_gems_out,
    'items', v_chest->'items', 'xp', v_xc->'list', 'xp_total', v_xp_total,
    'points', v_join.points, 'median', v_median,
    'day_key', p_day_key, 'event_key', v_join.event_key, 'slot', v_slot,
    'credited', true, 'chest', true);
end $$;
revoke execute on function public.world_event_claim__ungated(text, int) from public;
revoke execute on function public.world_event_claim__ungated(text, int) from anon, authenticated, service_role;

-- ── 3. THE ABSENCE CLAIM (restated from 2026-08-22-absence-chest-items.sql §2;
--       live body measured identical modulo comments, 2026-10-10) ────────────
create or replace function public.world_event_absence_claim__ungated(p_day_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_gold constant bigint := 750;
  c_gems constant int    := 1;
  v_day     date;
  v_day_key text;
  v_close   timestamptz;
  v_p       public.world_event_pledges%rowtype;
  v_joined  boolean := false;
  v_rows    int;
  v_chest   jsonb;
  v_it      jsonb;
  v_iid     text;
  v_iqty    bigint;
  v_qty_total bigint := 0;
  -- XP credit locals (2026-10-10-muster-chest-xp-credit.sql)
  v_xc       jsonb;
  v_xp_total bigint := 0;
  v_bud      jsonb;
  v_sk       text;
  v_amt      bigint;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  v_day := public.hr_rally_day(p_day_key);
  if v_day is null then
    return jsonb_build_object('ok', false, 'error', 'bad_day_key');
  end if;
  v_day_key := public.hr_utc_day_key((v_day + interval '12 hours') at time zone 'utc');

  select * into v_p from public.world_event_pledges
   where day_key = v_day_key and user_id = auth.uid();
  if v_p.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_pledge');
  end if;
  if v_p.settled then
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;

  -- LOCK 1 — while the day can still be joined, nothing is owed.
  v_close := public.hr_rally_day_close(v_day_key);
  if v_close is null or now() < v_close then
    return jsonb_build_object('ok', false, 'error', 'day_open', 'closes_at', v_close);
  end if;

  -- LOCK 2 — the join primary key. They were there; the live chest was their
  -- reward and the pledge closes paying nothing.
  if to_regclass('public.world_event_joins') is not null then
    execute 'select exists (select 1 from public.world_event_joins j
                             where j.day_key = $1 and j.user_id = $2)'
      into v_joined using v_day_key, auth.uid();
  end if;
  if v_joined then
    update public.world_event_pledges
       set settled = true, settled_at = now(), outcome = 'answered_live', gold = 0, gems = 0
     where day_key = v_day_key and user_id = auth.uid() and settled = false;
    return jsonb_build_object('ok', false, 'error', 'answered_live', 'day_key', v_day_key);
  end if;

  -- The credit target is the pledge's own (user, slot): it must still be a
  -- character. Checked BEFORE the settle so a deleted character never spends
  -- the pledge (previously an FK raise on the item insert).
  if not exists (select 1 from public.player_state where user_id = auth.uid() and slot = v_p.slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_p.slot);
  end if;

  -- ── THE THEMED CHEST, priced BEFORE the settle (pure), and its XP checked
  --    against the ONE day budget, so a refusal spends nothing.
  v_chest    := public.hr_rally_chest(v_p.event_key, c_gold, c_gems, 0);
  v_xc       := public.hr_rally_xp_credit(v_p.event_key, v_chest);
  v_xp_total := coalesce((v_xc->>'total')::bigint, 0);
  if v_xp_total > 0 then
    v_bud := public.hr_day_budget_check(auth.uid(), v_p.slot, 0, v_xp_total, 0, 0);
    if v_bud is not null then
      return jsonb_build_object('ok', false, 'error', 'daily_budget', 'detail', v_bud, 'slot', v_p.slot);
    end if;
  end if;

  -- ── THE SETTLE. Conditional flip; row_count = 0 means a replay already took it.
  update public.world_event_pledges
     set settled = true, settled_at = now(), outcome = 'absent', gold = c_gold, gems = c_gems
   where day_key = v_day_key and user_id = auth.uid() and settled = false;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'error', 'already_settled');
  end if;

  -- ── THE XP (after the settle guard → exactly once). Own row only.
  for v_sk, v_amt in select key, value::bigint from jsonb_each_text(v_xc->'by_skill') loop
    insert into public.player_skills as ps (user_id, slot, skill_id, xp)
      values (auth.uid(), v_p.slot, v_sk, v_amt)
      on conflict (user_id, slot, skill_id) do update set xp = ps.xp + excluded.xp;
  end loop;

  -- ── THE ITEMS (after the settle guard → exactly once). Written to
  --    player_inventory — the source of truth the accrual absolute envelope is
  --    built FROM. Same transaction as the settle; additive upsert, scoped to the
  --    caller's own (user_id, slot).
  for v_it in select * from jsonb_array_elements(v_chest->'items') loop
    v_iid  := v_it->>'id';
    v_iqty := coalesce((v_it->>'qty')::bigint, 0);
    if v_iid is not null and v_iqty > 0 then
      insert into public.player_inventory as pi (user_id, slot, item_id, qty)
        values (auth.uid(), v_p.slot, v_iid, v_iqty)
        on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
      v_qty_total := v_qty_total + v_iqty;
    end if;
  end loop;

  -- A server write to the character's progression moves its version, so a held
  -- envelope is stale and the next read carries the absolute skills.
  if v_xp_total > 0 or v_qty_total > 0 then
    update public.player_state
       set version = version + 1, updated_at = now()
     where user_id = auth.uid() and slot = v_p.slot;
  end if;

  -- ── JOURNAL. gold=0: absence gold is NOT server-credited here (the gold arm
  --    owns that); xp_in carries the credited XP so it counts against the day.
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (auth.uid(), v_p.slot, 'rally', 'world_event_absence_claim:' || v_day_key,
     0, 0, v_xp_total, 0, 0,
     jsonb_build_object('band', 'absent', 'day_key', v_day_key,
                        'event_key', v_p.event_key, 'absence_gold', c_gold,
                        'absence_gems', c_gems, 'items', v_chest->'items',
                        'item_qty', v_qty_total, 'xp', v_xc->'list',
                        'xp_chest', v_chest->'xp'));

  return jsonb_build_object('ok', true, 'band', 'absent', 'day_key', v_day_key,
    'event_key', v_p.event_key, 'slot', v_p.slot,
    'gold', c_gold, 'gems', c_gems, 'seals', 0,
    'items', v_chest->'items', 'xp', v_xc->'list', 'xp_total', v_xp_total,
    'chest', v_chest);
end $$;
revoke execute on function public.world_event_absence_claim__ungated(text) from public;
revoke execute on function public.world_event_absence_claim__ungated(text) from anon, authenticated, service_role;

-- ── 4. SELF-VERIFYING COMMIT GATE (§4) ─────────────────────────────────────
-- Every property EXECUTED. ONE block, no begin/commit (tools/apply-migration.mjs
-- sends the file as one batch); a raise anywhere reverts the whole file. The
-- row-writing probe lives in a subtransaction discarded by the HR867 sentinel.
do $$
declare
  v_uid   constant uuid := '00000000-0000-4000-8000-0000b5670a01';
  v_today text := public.hr_utc_day_key();
  v_pday  date := (now() at time zone 'utc')::date - 1;          -- a CLOSED prior day
  v_pdk   text;
  v_ek_c  text;   -- an event key whose theme is COMBAT (ashen_horde)
  v_ek_n  text;   -- an event key whose theme is NON-COMBAT (forge_levy)
  v_d     date;
  v_h     int;
  v_k     text;
  v_r     jsonb;
  v_case  record;
  v_x     jsonb;
  v_before jsonb;
  v_after  jsonb;
  v_sum   bigint;
  v_led   record;
  v_n     bigint;
  v_rows0 bigint;
  v_ver0  bigint;
  v_ver1  bigint;
  v_def   text;
begin
  -- (a) GRANTS. Inners and the calculator: no client role. Wrappers: authenticated.
  foreach v_k in array array['public.world_event_claim__ungated(text,integer)',
                             'public.world_event_absence_claim__ungated(text)',
                             'public.hr_rally_xp_credit(text,jsonb)'] loop
    if has_function_privilege('authenticated', v_k, 'execute')
       or has_function_privilege('anon', v_k, 'execute') then
      raise exception 'GATE(a): % is client-executable', v_k;
    end if;
  end loop;
  if not has_function_privilege('authenticated', 'public.world_event_claim(text,integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.world_event_absence_claim(text)', 'execute') then
    raise exception 'GATE(a): a claim wrapper is not callable by authenticated — the feature is dead';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name = 'player_skills'
                and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE', 'DELETE')) then
    raise exception 'GATE(a): a client write grant exists on player_skills';
  end if;
  -- the Rally Seal stays out (w0a), and both bodies now write player_skills.
  select prosrc into v_def from pg_proc where oid = 'public.world_event_claim__ungated(text,integer)'::regprocedure;
  if v_def ~ '\mv_seal\M' or strpos(v_def, 'insert into public.player_skills') = 0 then
    raise exception 'GATE(a): the online body is not the Seal-free, XP-crediting one';
  end if;
  select prosrc into v_def from pg_proc where oid = 'public.world_event_absence_claim__ungated(text)'::regprocedure;
  if strpos(v_def, 'insert into public.player_skills') = 0 then
    raise exception 'GATE(a): the absence body does not write player_skills';
  end if;

  -- (b) THE CALCULATOR refuses what is not the theme's, and clamps.
  -- find event keys for a combat and a non-combat theme (deterministic search).
  for v_d in select generate_series((now() at time zone 'utc')::date - 400, (now() at time zone 'utc')::date, interval '1 day')::date loop
    foreach v_h in array array[1, 13] loop
      v_k := public.hr_utc_day_key((v_d + interval '12 hours') at time zone 'utc') || '#' || v_h;
      if v_ek_c is null and public.hr_rally_event_for_key(v_k) = 'ashen_horde' then v_ek_c := v_k; end if;
      if v_ek_n is null and public.hr_rally_event_for_key(v_k) = 'forge_levy'  then v_ek_n := v_k; end if;
    end loop;
    exit when v_ek_c is not null and v_ek_n is not null;
  end loop;
  if v_ek_c is null or v_ek_n is null then
    raise exception 'GATE(b) CANNOT RUN: no ashen_horde / forge_levy event key in 400 days (% / %)', v_ek_c, v_ek_n;
  end if;
  v_r := public.hr_rally_xp_credit(v_ek_n, jsonb_build_object('xp', jsonb_build_array(
           jsonb_build_object('skill', 'smithing', 'amount', 999999),     -- clamped to 3000
           jsonb_build_object('skill', 'attack',   'amount', 500),        -- not forge_levy's
           jsonb_build_object('skill', 'crafting', 'amount', 50),         -- no room left
           jsonb_build_object('skill', 'bogus',    'amount', 5))));
  if (v_r->>'total')::bigint <> 3000 or (v_r->'by_skill'->>'smithing')::bigint <> 3000
     or v_r->'by_skill' ? 'attack' or v_r->'by_skill' ? 'bogus' or v_r->'by_skill' ? 'crafting' then
    raise exception 'GATE(b): the calculator did not clamp / refuse foreign skills: %', v_r;
  end if;
  v_r := public.hr_rally_xp_credit('not-a-key', jsonb_build_object('xp', jsonb_build_array(
           jsonb_build_object('skill', 'attack', 'amount', 10))));
  if (v_r->>'total')::bigint <> 0 then
    raise exception 'GATE(b): an unknown event key credited XP: %', v_r;
  end if;

  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'GATE(c) CANNOT RUN: hr_create_character missing';
  end if;

  begin  -- ── SUBTRANSACTION, discarded by the HR867 sentinel ─────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(c): no probe character: %', v_r; end if;

    v_pdk := public.hr_utc_day_key(((public.hr_rally_day(to_char(v_pday, 'YYYY-MM-DD'))) + interval '12 hours') at time zone 'utc');
    if public.hr_rally_day_close(v_pdk) is null or now() < public.hr_rally_day_close(v_pdk) then
      raise exception 'GATE(c) CANNOT RUN: prior day % is not closed', v_pdk;
    end if;

    -- (c) BOTH PATHS x BOTH THEME KINDS: the player_skills delta EQUALS the
    --     response, the ledger's xp_in EQUALS its sum, and the response is not
    --     empty (positive control: an empty list would pass the equality).
    for v_case in
      select * from (values ('online', v_ek_c), ('online', v_ek_n),
                            ('absence', v_ek_c), ('absence', v_ek_n)) t(path, ek)
    loop
      -- clean per-case fixtures
      delete from public.world_event_joins   where user_id = v_uid;
      delete from public.world_event_pledges where user_id = v_uid;
      select coalesce(jsonb_object_agg(skill_id, xp), '{}'::jsonb) into v_before
        from public.player_skills where user_id = v_uid and slot = 0;
      select version into v_ver0 from public.player_state where user_id = v_uid and slot = 0;
      select count(*) into v_rows0 from public.player_ledger where user_id = v_uid and kind = 'rally';

      if v_case.path = 'online' then
        insert into public.world_event_totals (event_key, participants, goal, progress, met_at)
          values (v_case.ek, 1, 6000, 6000, now())
          on conflict (event_key) do update set met_at = now();
        insert into public.world_event_joins (day_key, user_id, event_key, slot, window_end, points)
          values (v_today, v_uid, v_case.ek, 0, now() - interval '1 minute', 500);
        v_r := public.world_event_claim(v_today, 0);
      else
        insert into public.world_event_pledges (day_key, user_id, event_key, slot, settled)
          values (v_pdk, v_uid, v_case.ek, 0, false);
        v_r := public.world_event_absence_claim__ungated(to_char(v_pday, 'YYYY-MM-DD'));
      end if;
      if coalesce(v_r->>'ok', 'false') <> 'true' then
        raise exception 'GATE(c) %/%: the claim did not pay: %', v_case.path, v_case.ek, v_r;
      end if;
      if jsonb_array_length(coalesce(v_r->'xp', '[]'::jsonb)) = 0 or coalesce((v_r->>'xp_total')::bigint, 0) <= 0 then
        raise exception 'GATE(c) %/% CONTROL: the response credits no XP (%) — the equality below would be vacuous',
          v_case.path, v_case.ek, v_r;
      end if;

      select coalesce(jsonb_object_agg(skill_id, xp), '{}'::jsonb) into v_after
        from public.player_skills where user_id = v_uid and slot = 0;
      v_sum := 0;
      for v_x in select * from jsonb_array_elements(v_r->'xp') loop
        if coalesce((v_after->>(v_x->>'skill'))::bigint, 0) - coalesce((v_before->>(v_x->>'skill'))::bigint, 0)
           <> (v_x->>'amount')::bigint then
          raise exception 'GATE(c) %/%: player_skills.% moved % -> %, the response says +%',
            v_case.path, v_case.ek, v_x->>'skill', v_before->>(v_x->>'skill'), v_after->>(v_x->>'skill'), v_x->>'amount';
        end if;
        if not ((v_x->>'skill') = any (select jsonb_array_elements_text(
                 public.hr_rally_theme(public.hr_rally_event_for_key(v_case.ek))->'skills'))) then
          raise exception 'GATE(c) %/%: credited a non-theme skill %', v_case.path, v_case.ek, v_x->>'skill';
        end if;
        v_sum := v_sum + (v_x->>'amount')::bigint;
      end loop;
      if v_sum <> (v_r->>'xp_total')::bigint then
        raise exception 'GATE(c) %/%: xp list sums to %, xp_total says %', v_case.path, v_case.ek, v_sum, v_r->>'xp_total';
      end if;
      -- NO OTHER skill moved.
      select count(*) into v_n from jsonb_each_text(v_after) a
       where coalesce((v_before->>a.key)::bigint, 0) <> a.value::bigint
         and not exists (select 1 from jsonb_array_elements(v_r->'xp') x where x->>'skill' = a.key);
      if v_n <> 0 then
        raise exception 'GATE(c) %/%: % skill(s) outside the response moved', v_case.path, v_case.ek, v_n;
      end if;
      -- the combat theme pays combat skills, the non-combat one pays none.
      if v_case.ek = v_ek_c and not (v_r->'xp' @> '[{"skill":"attack"}]') then
        raise exception 'GATE(c) %: the combat theme credited no Attack: %', v_case.path, v_r;
      end if;
      if v_case.ek = v_ek_n and (v_r->'xp' @> '[{"skill":"attack"}]' or v_r->'xp' @> '[{"skill":"strength"}]') then
        raise exception 'GATE(c) %: the non-combat theme credited a combat skill: %', v_case.path, v_r;
      end if;
      -- ONE new rally ledger row, xp_in = the credited total, meta.xp = the list.
      select count(*) into v_n from public.player_ledger where user_id = v_uid and kind = 'rally';
      if v_n <> v_rows0 + 1 then
        raise exception 'GATE(c) %/%: expected one new rally ledger row, have % -> %', v_case.path, v_case.ek, v_rows0, v_n;
      end if;
      select xp_in, meta into v_led from public.player_ledger
       where user_id = v_uid and kind = 'rally' order by at desc, id desc limit 1;
      if v_led.xp_in <> v_sum or v_led.meta->'xp' <> v_r->'xp' then
        raise exception 'GATE(c) %/%: the ledger row does not journal the credit (xp_in %, meta.xp %)',
          v_case.path, v_case.ek, v_led.xp_in, v_led.meta->'xp';
      end if;
      select version into v_ver1 from public.player_state where user_id = v_uid and slot = 0;
      if v_ver1 <= v_ver0 then
        raise exception 'GATE(c) %/%: the version did not move (% -> %)', v_case.path, v_case.ek, v_ver0, v_ver1;
      end if;

      -- (d) REPLAY: refused, no skill moves, no second ledger row.
      if v_case.path = 'online' then
        v_r := public.world_event_claim(v_today, 0);
        if coalesce(v_r->>'error', '') <> 'already_claimed' then
          raise exception 'GATE(d) online: replay not refused: %', v_r;
        end if;
      else
        v_r := public.world_event_absence_claim__ungated(to_char(v_pday, 'YYYY-MM-DD'));
        if coalesce(v_r->>'error', '') <> 'already_settled' then
          raise exception 'GATE(d) absence: replay not refused: %', v_r;
        end if;
      end if;
      select coalesce(jsonb_object_agg(skill_id, xp), '{}'::jsonb) into v_before
        from public.player_skills where user_id = v_uid and slot = 0;
      if v_before <> v_after then
        raise exception 'GATE(d) %/%: a refused replay moved player_skills', v_case.path, v_case.ek;
      end if;
      select count(*) into v_n from public.player_ledger where user_id = v_uid and kind = 'rally';
      if v_n <> v_rows0 + 1 then
        raise exception 'GATE(d) %/%: a refused replay journalled', v_case.path, v_case.ek;
      end if;
    end loop;

    -- (e) THE DAY BUDGET: a character at its XP ceiling is refused BEFORE the
    --     consume — nothing moves and the claim stays claimable.
    delete from public.world_event_joins where user_id = v_uid;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
      values (v_uid, 0, 'admin', 'muster-xp-budget-probe', 0, 0,
              ((public.hr_day_budget_limits())->>'xp')::bigint, 0, 0, '{}'::jsonb);
    insert into public.world_event_joins (day_key, user_id, event_key, slot, window_end, points)
      values (v_today, v_uid, v_ek_c, 0, now() - interval '1 minute', 500);
    select coalesce(jsonb_object_agg(skill_id, xp), '{}'::jsonb) into v_before
      from public.player_skills where user_id = v_uid and slot = 0;
    select count(*) into v_rows0 from public.player_ledger where user_id = v_uid and kind = 'rally';
    v_r := public.world_event_claim(v_today, 0);
    if coalesce(v_r->>'error', '') <> 'daily_budget' then
      raise exception 'GATE(e): a claim over the XP day budget was not refused: %', v_r;
    end if;
    if (select claimed from public.world_event_joins where user_id = v_uid and day_key = v_today) then
      raise exception 'GATE(e): the budget refusal SPENT the claim';
    end if;
    select coalesce(jsonb_object_agg(skill_id, xp), '{}'::jsonb) into v_after
      from public.player_skills where user_id = v_uid and slot = 0;
    select count(*) into v_n from public.player_ledger where user_id = v_uid and kind = 'rally';
    if v_after <> v_before or v_n <> v_rows0 then
      raise exception 'GATE(e): the budget refusal moved skills or journalled';
    end if;

    raise exception using errcode = 'HR867', message = 'muster-chest-xp-credit §4 complete — rolling back';
  exception when sqlstate 'HR867' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- ROLLBACK PROOF — the probe left nothing behind (CLAUDE.md §2).
  if exists (select 1 from public.player_state        where user_id = v_uid)
     or exists (select 1 from public.player_skills    where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from public.world_event_joins   where user_id = v_uid)
     or exists (select 1 from public.world_event_pledges where user_id = v_uid)
     or exists (select 1 from auth.users              where id = v_uid) then
    raise exception 'GATE: §4 LEAKED a probe row';
  end if;

  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    perform public.hr_assert_grant_hygiene(true);
  end if;

  raise notice 'muster-chest-xp-credit: both claims credit the chest XP to player_skills (combat % / non-combat %), '
               'delta = response, xp_in journalled, replay-safe, budget refused before the consume',
               v_ek_c, v_ek_n;
end $$;
