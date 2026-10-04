-- ════════════════════════════════════════════════════════════════════════
-- 2026-10-04-expected-level-idempotency.sql — AN ESCALATING PURCHASE NAMES
--                                             THE RUNG IT IS BUYING.
--
-- ⚠⚠⚠ STAGED — REVIEW ONLY, NOT AUTO-APPLIED. MONEY + SHARED SURFACE.
--     The Coordinator applies this by hand (`node tools/apply-migration.mjs
--     supabase/migrations/2026-10-04-expected-level-idempotency.sql`, one file,
--     one transaction) AFTER a Security GO. It changes the SIGNATURE of two
--     client-callable RPCs that move gold (player and clan treasury), so the
--     client half (src/features/farm-progression.js, src/net/farm-sync.js,
--     src/features/clan-seat-ui.js) must ride the SAME cut, AFTER the apply.
--
-- ⚠ SAME-SITTING APPLY (Security C1) — NOT the "lane C applies when its token
--     works" path of CLAUDE.md §3.3a. The LIVE client's old call shape omits
--     p_expect_level / p_expect_tier; with `default null` it resolves to the
--     NEW function and is refused `missing_expect`. From the moment this file
--     lands until the client half is served, EVERY plot upgrade (and every
--     clan tier-up) is refused. So: apply this file in the same sitting as the
--     cut push that carries the client half — apply, read §4's notices, push
--     within minutes. Never apply it on a day whose cut does not carry the
--     client half, and never leave the apply waiting on a later cut.
--     Between apply and push: `node tests/rpc-resolution.mjs` must show only
--     the two staged new-shape probes flipping PGRST202 -> 42501 (Security
--     C3; exact expectation in tests/schema-apply-order.json), then re-baseline.
--
-- ── THE CLASS ───────────────────────────────────────────────────────────────
-- A RELATIVE money verb ("buy the NEXT plot tier", "raise the hall ONE tier")
-- is not idempotent on intent. The idempotency key makes a REPLAY of one
-- gesture safe; it does nothing for a SECOND gesture carrying a second key —
-- a double-click, or a retry after a timeout that minted a fresh key. That
-- second intent reads the state the first one just wrote and buys the rung
-- AFTER it: tier 4 (25,000g) becomes tier 4 + tier 5 (125,000g) because the
-- player clicked twice. Escalating prices make it worse at every rung.
--
-- THE FIX: the caller names the rung it is buying, read from the SERVER's own
-- projection (player_state.plot_level on the envelope; castle_tier on
-- clan_seat_read). Under the same lock that serialises the purchase, the
-- server refuses unless `current + 1 = expected`. The first intent lands; the
-- second is refused BY NAME (`stale_level` / `stale_tier`) and carries the
-- server's current rung so the client re-renders instead of guessing. The
-- expected value is compared for EQUALITY only — it cannot choose a price, a
-- rung, a currency or a target, so a forged value can only make the call
-- refuse.
--
-- ── WHAT ELSE THIS FILE CLOSES (found while restating) ──────────────────────
--   clan_tier_up had NO ROW LOCK. Two concurrent calls both read castle_tier
--   N, both passed every gate, and the second UPDATE re-evaluated
--   `treasury - gold_req` on the committed row: ONE tier, TWO debits of the
--   clan treasury and the materials bundle (clans.treasury has no >= 0 check,
--   so it can go negative). An expected tier without a lock does not close
--   that, because both readers see N. The body now takes `select ... for
--   update` on the clans row BEFORE upkeep settles and before the tier is read.
--
-- ── WHAT THIS FILE DELIBERATELY DOES NOT DO ─────────────────────────────────
--   • hr_vigour_refill — escalating (step per nth), but the client already
--     coalesces a double tap into one in-flight call and REUSES its key across
--     a lost answer (src/net/vigour.js), so the duplicate-intent class is
--     closed on the honest path; the server-side expectation is defence in
--     depth and is listed as owed rather than half-done here.
--   • hr_bounty_spend reroll — the reroll index is NOT on any server
--     projection (rerollsToday / freeRerolls are client residue), so there is
--     no server value for an honest caller to send. Owed: a projection first.
--   • No price, catalogue, rate bucket, table, policy or edge function moves.
--
-- ── CONTRACT ────────────────────────────────────────────────────────────────
--   hr_farm_upgrade_plot(p_slot int, p_idem uuid, p_expect_level int default null)
--     replaces hr_farm_upgrade_plot(int, uuid). Order: replay (same key ->
--     cached envelope, whatever p_expect_level says) -> rate gate ->
--     missing_expect -> row lock -> stale_level -> every existing gate.
--     New refusals:
--       {ok:false, error:'missing_expect'}
--       {ok:false, error:'stale_level', plot_level:<server's CURRENT level>,
--        expect_level:<what was sent>}
--     (Every other refusal keeps `plot_level` = the rung being bought.)
--   clan_tier_up(p_clan_id uuid, p_expect_tier int default null)
--     replaces clan_tier_up(uuid) (and its __ungated twin). New refusals:
--       {ok:false, error:'missing_expect'}
--       {ok:false, error:'stale_tier', castle_tier:<CURRENT>, expect_tier:<sent>}
--   `default null` is deliberate: a stale client that omits the argument
--   resolves to the NEW function and is refused by name (journalled), rather
--   than 404ing into "rpc_missing" and reading as an outage.
--
-- ── REVERSAL ────────────────────────────────────────────────────────────────
-- Not by re-applying an older file (2026-09-06-plot-tier-reachable.sql would
-- restate a body WITHOUT the rejections seam; 2026-08-08-clan-seat.sql would
-- replace the gated wrapper with an ungated body). To revert: drop the two
-- new signatures, restore the two bodies from
-- `pg_get_functiondef` captured before apply (live md5s asserted in §0), and
-- restore the three hr_client_rpc_baseline rows this file replaces in §3.
-- The client half must be reverted in the same window.
-- ════════════════════════════════════════════════════════════════════════


-- ── §0. PRECONDITIONS — FAIL CLOSED, AND REFUSE NEVER REVERT ───────────────
-- The two bodies below are RESTATED from the chain end. If production carries
-- a different body than the one this file was written against, restating
-- would silently revert whatever changed. The normalised md5s below were
-- MEASURED read-only on nezapsylztqbbwuwembx 2026-10-03 and equal the repo
-- replay (tests/live-hash-drift.baseline.json normalisation). A re-apply after
-- this file has run finds the OLD signatures gone and skips the check.
do $$
declare
  v_md5 text;
  r     record;
begin
  if to_regprocedure('public.hr_intent_replay(uuid,int,uuid,text)') is null then
    raise exception 'hr_intent_replay is absent - apply 2026-09-03-intent-mismatch-class.sql first'; end if;
  if to_regprocedure('public.hr_note_rejection(text,int,jsonb)') is null then
    raise exception 'hr_note_rejection is absent - apply 2026-09-12-hr-rejections-journal.sql first'; end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'hr_rpc_gate is absent'; end if;
  if to_regprocedure('public.hr_level_from_xp(bigint)') is null then
    raise exception 'hr_level_from_xp is absent'; end if;
  if to_regprocedure('public.clan_upkeep_settle(uuid)') is null then
    raise exception 'clan_upkeep_settle is absent - apply 2026-08-08-clan-seat.sql first'; end if;
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'hr_client_rpc_baseline is absent - apply the grant-hygiene chain first'; end if;
  if position('''clan_tier_up''' in pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure)) = 0
     or position('''farm_plant''' in pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure)) = 0 then
    raise exception 'hr_rpc_gate does not admit clan_tier_up / farm_plant - the restated bodies would be rate_limited forever'; end if;

  for r in select * from (values
      ('public.hr_farm_upgrade_plot(int,uuid)', 'bb087feef2991979575b91b40d1afe4d'),
      ('public.clan_tier_up(uuid)',             '68d3b06c54ee7bc8869edd22cd541468'),
      ('public.clan_tier_up__ungated(uuid)',    '3315e673af07aaeb5d124c34a68434da')) t(sig, want)
  loop
    if to_regprocedure(r.sig) is null then continue; end if;
    v_md5 := md5(regexp_replace(pg_get_functiondef(to_regprocedure(r.sig)), '[[:space:]]+', ' ', 'g'));
    if v_md5 <> r.want then
      raise exception 'REFUSING: % is md5 %, this file was written against % - restating it would '
                      'silently revert a change nobody here has read. Nothing has moved.', r.sig, v_md5, r.want;
    end if;
  end loop;
end $$;


-- ── §1. hr_farm_upgrade_plot — the expected plot level ─────────────────────
-- RESTATED from the chain end (2026-09-06-plot-tier-reachable.sql §2 as
-- decorated by 2026-09-12-hr-rejections-journal.sql §7). Carried forward
-- verbatim: the hr_intent_replay guard (exactly one call, no direct
-- player_intents read), the farm_plant rate bucket, the row lock, the
-- tier_unpriced fail-closed, the level gate, gold-before-deeds, the verified
-- deed debit, the version bump, the ledger row, the success-only intent cache,
-- and the rejections seam on EVERY refusal. New: missing_expect, stale_level.
drop function if exists public.hr_farm_upgrade_plot(int, uuid);

create or replace function public.hr_farm_upgrade_plot(p_slot int, p_idem uuid, p_expect_level int default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_deed constant text := 'farm_deed';
  v_uid   uuid := auth.uid();
  v_state public.player_state%rowtype;
  v_next  int;
  v_cost  int;
  v_gold  bigint;
  v_reqlv int;
  v_farmlv int;
  v_xp    bigint;
  v_have  bigint;
  v_pay   text;
  v_cached jsonb;
begin
  if v_uid is null then return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'not_signed_in')); end if;
  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY — and it is checked
  -- BEFORE the expected level: a retry of a gesture that already landed must
  -- get its own cached answer back, not a stale_level for the rung it bought.
  select public.hr_intent_replay(v_uid, p_slot, p_idem, 'farm_upgrade_plot') into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return public.hr_note_rejection('farm_upgrade_plot', p_slot, v_cached); end if;
  if v_cached is not null then return v_cached; end if;

  if not public.hr_rpc_gate('farm_plant') then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'rate_limited'));
  end if;

  -- THE EXPECTED RUNG IS REQUIRED. Before the lock: a call that cannot be
  -- judged must not first serialise the character behind it.
  if p_expect_level is null then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'missing_expect'));
  end if;

  select * into v_state from public.player_state
    where user_id = v_uid and slot = p_slot for update;
  if v_state.user_id is null then return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;

  -- A SECOND INTENT FOR THE SAME RUNG IS STALE (2026-10-04). Read under the
  -- row lock, so the first of two concurrent intents lands and the second
  -- sees its write. `plot_level` here is the server's CURRENT level — the
  -- number the client must adopt — not the rung being bought.
  if p_expect_level <> v_state.plot_level + 1 then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'stale_level',
      'plot_level', v_state.plot_level, 'expect_level', p_expect_level));
  end if;

  v_next := v_state.plot_level + 1;
  select deed_cost, gold_cost, req_farm_level into v_cost, v_gold, v_reqlv
    from public.hr_plot_tier where plot_level = v_next;
  if v_cost is null then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'max_plot_level', 'plot_level', v_state.plot_level));
  end if;
  -- FAIL CLOSED ON AN UNPRICED RUNG. Both price columns were added with
  -- `default 0` and req_farm_level `default 1`; a rung above the starting
  -- level that costs nothing in either currency is a mistake, never an offer.
  if v_next > 1 and coalesce(v_gold, 0) = 0 and coalesce(v_cost, 0) = 0 then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'tier_unpriced', 'plot_level', v_next));
  end if;

  -- THE PACING GATE. Farming level re-derived from the server's own XP.
  select coalesce(xp, 0) into v_xp from public.player_skills
    where user_id = v_uid and slot = p_slot and skill_id = 'farming';
  v_farmlv := public.hr_level_from_xp(coalesce(v_xp, 0));
  if v_farmlv < coalesce(v_reqlv, 1) then
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'farm_level_too_low',
      'need', v_reqlv, 'have', v_farmlv, 'plot_level', v_next));
  end if;

  -- THE PAYMENT DECISION. Gold first; deeds are the fallback, never the default.
  select coalesce(qty, 0) into v_have from public.player_inventory
    where user_id = v_uid and slot = p_slot and item_id = c_deed;
  v_have := coalesce(v_have, 0);
  if v_state.gold >= coalesce(v_gold, 0) then
    v_pay := 'gold';
  elsif v_have >= v_cost then
    v_pay := 'deeds';
  else
    return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'cannot_afford',
      'need_gold', coalesce(v_gold, 0), 'have_gold', v_state.gold,
      'need_deeds', v_cost, 'have_deeds', v_have, 'plot_level', v_next));
  end if;

  if v_pay = 'deeds' and v_cost > 0 then
    -- THE DEBIT VERIFIES THE QUANTITY IN EVERY BRANCH (qty > 0 is a CHECK, so
    -- the last deed is DELETEd, predicated on qty = v_cost).
    update public.player_inventory set qty = qty - v_cost
      where user_id = v_uid and slot = p_slot and item_id = c_deed and qty > v_cost;
    if not found then
      delete from public.player_inventory
        where user_id = v_uid and slot = p_slot and item_id = c_deed and qty = v_cost;
      if not found then
        return public.hr_note_rejection('farm_upgrade_plot', p_slot, jsonb_build_object('ok', false, 'error', 'cannot_afford',
          'need_gold', coalesce(v_gold, 0), 'have_gold', v_state.gold,
          'need_deeds', v_cost, 'have_deeds', v_have, 'plot_level', v_next));
      end if;
    end if;
  end if;

  update public.player_state
     set plot_level = v_next,
         gold = gold - (case when v_pay = 'gold' then coalesce(v_gold, 0) else 0 end),
         version = version + 1,
         updated_at = now()
   where user_id = v_uid and slot = p_slot
   returning gold into v_gold;

  -- THE JOURNAL. One row per upgrade; gold spent negative, deeds negative qty.
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, meta)
    values (v_uid, p_slot, 'farm', 'farm_upgrade_plot',
            case when v_pay = 'deeds' then c_deed else null end,
            case when v_pay = 'deeds' then -v_cost else 0 end,
            case when v_pay = 'gold'  then -(select gold_cost from public.hr_plot_tier where plot_level = v_next) else 0 end,
            jsonb_build_object('plot_level', v_next, 'paid_with', v_pay,
                               'farm_level', v_farmlv));

  v_cached := jsonb_build_object('ok', true, 'plot_level', v_next,
    'paid_with', v_pay,
    'deeds_spent', case when v_pay = 'deeds' then v_cost else 0 end,
    'gold_spent',  case when v_pay = 'gold'
                        then (select gold_cost from public.hr_plot_tier where plot_level = v_next)
                        else 0 end,
    'gold', v_gold);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, 'farm_upgrade_plot', v_cached, now())
    on conflict (user_id, intent_id) do nothing;
  return v_cached;
end $$;

-- Revoke from PUBLIC first (the default ACL a new signature is born with),
-- then every other role; authenticated only. NOT hr_engine, NOT service_role
-- (production's old signature carried a service_role grant nothing used).
revoke execute on function public.hr_farm_upgrade_plot(int, uuid, int) from public;
revoke execute on function public.hr_farm_upgrade_plot(int, uuid, int) from anon, authenticated, service_role;
grant  execute on function public.hr_farm_upgrade_plot(int, uuid, int) to authenticated;


-- ── §2. clan_tier_up — the expected castle tier, under a row lock ──────────
-- RESTATED from 2026-08-08-clan-seat.sql §9 (renamed to __ungated, unchanged,
-- by 2026-08-11-authenticated-surface-lockdown.sql A9). New: missing_expect,
-- the clans row lock, stale_tier. Every gate and the debit are verbatim.
drop function if exists public.clan_tier_up(uuid);
drop function if exists public.clan_tier_up__ungated(uuid);

create or replace function public.clan_tier_up__ungated(p_clan_id uuid, p_expect_tier int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clan public.clans%rowtype;
  v_t    public.hr_castle_tiers%rowtype;
  v_role text;
  k text; v_need bigint; v_have bigint;
  v_contrib int;
  v_hunt int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select role into v_role from public.clan_members where clan_id = p_clan_id and user_id = auth.uid();
  if v_role is null then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  if v_role <> 'leader' then return jsonb_build_object('ok', false, 'error', 'not_leader'); end if;
  if p_expect_tier is null then return jsonb_build_object('ok', false, 'error', 'missing_expect'); end if;

  -- LOCK FIRST (2026-10-04). Everything below reads castle_tier, treasury and
  -- the stores and then writes them; without the lock two concurrent calls
  -- both pass and the treasury is debited twice for one tier. Taken after
  -- the membership check so a non-member cannot hold a clan's row.
  perform 1 from public.clans where id = p_clan_id for update;

  perform public.clan_upkeep_settle(p_clan_id);
  select * into v_clan from public.clans where id = p_clan_id;

  -- A SECOND INTENT FOR THE SAME TIER IS STALE. `castle_tier` is the
  -- server's CURRENT tier, for the client to adopt.
  if p_expect_tier <> v_clan.castle_tier + 1 then
    return jsonb_build_object('ok', false, 'error', 'stale_tier',
      'castle_tier', v_clan.castle_tier, 'expect_tier', p_expect_tier);
  end if;

  select * into v_t from public.hr_castle_tiers where tier = v_clan.castle_tier + 1;
  if v_t.tier is null then return jsonb_build_object('ok', false, 'error', 'max_tier'); end if;
  if v_clan.upkeep_state = 'dormant' then return jsonb_build_object('ok', false, 'error', 'dormant'); end if;

  if v_clan.standing < v_t.standing_req then
    return jsonb_build_object('ok', false, 'error', 'standing_short',
      'standing', v_clan.standing, 'required', v_t.standing_req);
  end if;
  if v_clan.treasury < v_t.gold_req then
    return jsonb_build_object('ok', false, 'error', 'treasury_short',
      'treasury', v_clan.treasury, 'required', v_t.gold_req);
  end if;

  for k in select jsonb_object_keys(v_t.materials) loop
    v_need := coalesce(nullif(v_t.materials->>k,'')::bigint, 0);
    select coalesce(qty,0) into v_have from public.clan_stores where clan_id = p_clan_id and item_id = k;
    if coalesce(v_have,0) < v_need then
      return jsonb_build_object('ok', false, 'error', 'bundle_short', 'item_id', k,
        'have', coalesce(v_have,0), 'need', v_need);
    end if;
  end loop;

  -- THE DISTINCT-CONTRIBUTOR GATE (72h membership grace kills alt-farming).
  select count(distinct l.user_id) into v_contrib
    from public.clan_ledger l
    join public.clan_members m on m.clan_id = l.clan_id and m.user_id = l.user_id
   where l.clan_id = p_clan_id and l.kind = 'deposit'
     and m.joined_at < now() - interval '72 hours';
  if v_contrib < v_t.contributors then
    return jsonb_build_object('ok', false, 'error', 'contributors_short',
      'contributors', v_contrib, 'required', v_t.contributors);
  end if;

  -- Tiers 4 and 5 require a Hunt clear at the matching tier inside 28 days.
  if v_t.hunt_tier_req > 0 then
    if to_regclass('public.clan_raids') is null then
      return jsonb_build_object('ok', false, 'error', 'hunt_required');
    end if;
    execute format(
      'select count(*)::int from public.clan_raids r where r.clan_id = $1 '
      'and r.downed_at is not null and r.downed_at > now() - interval ''28 days'' %s',
      case when exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name='clan_raids' and column_name='tier')
           then 'and coalesce(r.tier,1) >= ' || v_t.hunt_tier_req::text
           else '' end)
      into v_hunt using p_clan_id;
    if coalesce(v_hunt,0) < 1 then
      return jsonb_build_object('ok', false, 'error', 'hunt_required', 'tier', v_t.hunt_tier_req);
    end if;
  end if;

  -- Consume the bundle and the gold, then raise the Hall.
  for k in select jsonb_object_keys(v_t.materials) loop
    update public.clan_stores
       set qty = qty - coalesce(nullif(v_t.materials->>k,'')::bigint, 0)
     where clan_id = p_clan_id and item_id = k;
  end loop;
  update public.clans
     set castle_tier = v_t.tier, treasury = treasury - v_t.gold_req
   where id = p_clan_id returning * into v_clan;

  insert into public.clan_ledger (clan_id, user_id, kind, qty, standing)
    values (p_clan_id, auth.uid(), 'tier', v_t.tier, v_clan.standing);

  return jsonb_build_object('ok', true, 'castle_tier', v_t.tier, 'name', v_t.name,
    'standing', v_clan.standing, 'contributors', v_contrib,
    'member_cap', v_t.member_cap, 'building_cap', v_t.building_cap);
end $$;

-- The gated wrapper, in the shape A9 generates and the rejections journal
-- decorates: one gate, one inner call, wrapped in the pass-through recorder.
create or replace function public.clan_tier_up(p_clan_id uuid, p_expect_tier int default null)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('clan_tier_up') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_note_rejection('clan_tier_up', 0, public.clan_tier_up__ungated($1, $2));
end $w$;

revoke execute on function public.clan_tier_up__ungated(uuid, int) from public;
revoke execute on function public.clan_tier_up__ungated(uuid, int) from anon, authenticated, service_role;
revoke execute on function public.clan_tier_up(uuid, int) from public;
revoke execute on function public.clan_tier_up(uuid, int) from anon, authenticated, service_role;
grant  execute on function public.clan_tier_up(uuid, int) to authenticated;


-- ── §3. THE APPROVED CLIENT SURFACE — the new identities, the old ones gone ─
-- Targeted (never hr_grant_baseline_sync()). Same proname and grantee; the
-- identity_args move because the argument lists did.
do $$
begin
  delete from public.hr_client_rpc_baseline
   where proname in ('hr_farm_upgrade_plot', 'clan_tier_up') and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_farm_upgrade_plot', 'p_slot integer, p_idem uuid, p_expect_level integer', 'authenticated',
     'server-farming 2026-08-22, gold-priced 2026-09-06, expected-level 2026-10-04: buys the NEXT plot '
     'tier on the caller''s own character. Price, level gate and payment choice are the server''s '
     '(hr_plot_tier, player_skills); p_expect_level is compared for EQUALITY with plot_level + 1 under '
     'the row lock and can only make the call refuse (stale_level). Rate-gated (farm_plant), '
     'idempotent, journalled. NOT granted to hr_engine. MONEY SURFACE: Security GO only.'),
    ('clan_tier_up', 'p_clan_id uuid, p_expect_tier integer', 'authenticated',
     'clan seat 2026-08-08, expected-tier + row lock 2026-10-04: the leader raises the castle ONE tier, '
     'paying from the clan treasury and stores (hr_castle_tiers). p_expect_tier is compared for EQUALITY '
     'with castle_tier + 1 under the clans row lock and can only make the call refuse (stale_tier). '
     'Rate-gated (clan_tier_up). SHARED SURFACE: Security GO only.');
end $$;


-- ── §4. SELF-VERIFICATION — executed, not asserted by markers ──────────────
do $$
declare
  v_uid   constant uuid := '00000000-0000-4a00-8000-0000b5620001';
  v_m2    constant uuid := '00000000-0000-4a00-8000-0000b5620002';
  v_m3    constant uuid := '00000000-0000-4a00-8000-0000b5620003';
  v_clan  constant uuid := '00000000-0000-4a00-8000-0000b56200c1';
  v_k1    constant uuid := '00000000-0000-4a00-8000-0000b5620101';
  v_k2    constant uuid := '00000000-0000-4a00-8000-0000b5620102';
  v_role  text;
  v_sig   text;
  v_src   text;
  v_r     jsonb;
  v_n     bigint;
  v_gold  bigint;
  v_tre   bigint;
begin
  -- (a) ONE OVERLOAD EACH, THE OLD IDENTITIES GONE. A surviving (int, uuid)
  --     would be a second door that never checks the rung.
  if to_regprocedure('public.hr_farm_upgrade_plot(int,uuid)') is not null
     or to_regprocedure('public.clan_tier_up(uuid)') is not null
     or to_regprocedure('public.clan_tier_up__ungated(uuid)') is not null then
    raise exception 'GATE(a): an old signature survived - a stale door that never checks the rung'; end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('hr_farm_upgrade_plot', 'clan_tier_up', 'clan_tier_up__ungated')) <> 3 then
    raise exception 'GATE(a): expected exactly one overload of each of the three functions'; end if;

  -- (b) PRIVILEGES. Wrapper/verb: authenticated only. Ungated: nobody.
  foreach v_sig in array array['public.hr_farm_upgrade_plot(int,uuid,int)', 'public.clan_tier_up(uuid,int)'] loop
    if not has_function_privilege('authenticated', v_sig, 'execute') then
      raise exception 'GATE(b): authenticated cannot execute % - the verb ships dead', v_sig; end if;
    if (select proacl from pg_proc where oid = to_regprocedure(v_sig)) is null then
      raise exception 'GATE(b): % carries the DEFAULT acl - PUBLIC may execute it', v_sig; end if;
    foreach v_role in array array['anon', 'service_role', 'hr_engine'] loop
      if exists (select 1 from pg_roles where rolname = v_role)
         and has_function_privilege(v_role, v_sig, 'execute') then
        raise exception 'GATE(b): % may execute %', v_role, v_sig; end if;
    end loop;
  end loop;
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine'] loop
    if exists (select 1 from pg_roles where rolname = v_role)
       and has_function_privilege(v_role, 'public.clan_tier_up__ungated(uuid,int)', 'execute') then
      raise exception 'GATE(b): % may call the UNGATED clan_tier_up - the rate gate is bypassable', v_role; end if;
  end loop;

  -- (c) THE BASELINE NAMES THE IDENTITIES THAT EXIST, and only those.
  if not exists (select 1 from public.hr_client_rpc_baseline
                  where proname = 'hr_farm_upgrade_plot' and grantee = 'authenticated'
                    and identity_args = pg_get_function_identity_arguments('public.hr_farm_upgrade_plot(int,uuid,int)'::regprocedure))
     or not exists (select 1 from public.hr_client_rpc_baseline
                  where proname = 'clan_tier_up' and grantee = 'authenticated'
                    and identity_args = pg_get_function_identity_arguments('public.clan_tier_up(uuid,int)'::regprocedure)) then
    raise exception 'GATE(c): hr_client_rpc_baseline does not record the new identities'; end if;
  if (select count(*) from public.hr_client_rpc_baseline
       where proname in ('hr_farm_upgrade_plot', 'clan_tier_up') and grantee = 'authenticated') <> 2 then
    raise exception 'GATE(c): a stale baseline row for an old identity survived'; end if;

  -- (d) THE BODIES KEPT WHAT THEY INHERITED, statically.
  v_src := replace(pg_get_functiondef('public.hr_farm_upgrade_plot(int,uuid,int)'::regprocedure), chr(13), '');
  if (length(v_src) - length(replace(v_src, 'hr_intent_replay(', ''))) / length('hr_intent_replay(') <> 1 then
    raise exception 'GATE(d): the farm verb lost (or doubled) the intent-mismatch guard'; end if;
  if position('from public.player_intents' in v_src) > 0 then
    raise exception 'GATE(d): the farm verb reads player_intents directly'; end if;
  if position('hr_rpc_gate(''farm_plant'')' in v_src) = 0 or position('for update' in v_src) = 0
     or position('player_ledger' in v_src) = 0 then
    raise exception 'GATE(d): the farm verb lost its rate gate, row lock or journal row'; end if;
  if v_src ~ 'return jsonb_build_object\(''ok'', false' then
    raise exception 'GATE(d): the farm verb has an UNJOURNALLED refusal site - the rejections seam is incomplete'; end if;
  if position('p_expect_level <> v_state.plot_level + 1' in v_src) = 0 then
    raise exception 'GATE(d): the farm verb does not compare the expected level with plot_level + 1'; end if;
  if position('hr_intent_replay(' in v_src) > position('p_expect_level <>' in v_src)
     or position('for update' in v_src) > position('p_expect_level <>' in v_src) then
    raise exception 'GATE(d): the stale check runs BEFORE the replay or OUTSIDE the row lock - a retried landed gesture would read stale_level, or two intents would both pass'; end if;
  v_src := replace(pg_get_functiondef('public.clan_tier_up__ungated(uuid,int)'::regprocedure), chr(13), '');
  if position('for update' in v_src) = 0
     or position('for update' in v_src) > position('clan_upkeep_settle(' in v_src) then
    raise exception 'GATE(d): clan_tier_up does not lock the clans row BEFORE settling and reading the tier'; end if;
  v_src := replace(pg_get_functiondef('public.clan_tier_up(uuid,int)'::regprocedure), chr(13), '');
  if position('hr_rpc_gate(''clan_tier_up'')' in v_src) = 0 or position('hr_note_rejection(' in v_src) = 0 then
    raise exception 'GATE(d): the clan_tier_up wrapper lost its gate or its rejections seam'; end if;

  -- (e) EXECUTED on synthetic characters and a synthetic clan, discarded.
  begin
    insert into auth.users (id) values (v_uid), (v_m2), (v_m3) on conflict (id) do nothing;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if coalesce(v_r->>'created', '') <> 'true' then raise exception 'GATE(e): no probe character: %', v_r; end if;
    update public.player_state set gold = 1000, plot_level = 1 where user_id = v_uid and slot = 0;
    insert into public.player_skills (user_id, slot, skill_id, xp) values (v_uid, 0, 'farming', 9000)
      on conflict (user_id, slot, skill_id) do update set xp = 9000;
    delete from public.player_inventory where user_id = v_uid and slot = 0 and item_id = 'farm_deed';

    -- (e1) NO EXPECTATION, NO PURCHASE.
    v_r := public.hr_farm_upgrade_plot(0, gen_random_uuid());
    if v_r->>'error' is distinct from 'missing_expect' then
      raise exception 'GATE(e1): a call without p_expect_level was not refused by name: %', v_r; end if;

    -- (e2) THE CORRECT INTENT LANDS.
    v_r := public.hr_farm_upgrade_plot(0, v_k1, 2);
    if coalesce(v_r->>'ok', '') <> 'true' or (v_r->>'plot_level')::int <> 2 or (v_r->>'gold')::bigint <> 500 then
      raise exception 'GATE(e2): the expected-level-2 upgrade did not land: %', v_r; end if;
    select count(*) into v_n from public.player_ledger where user_id = v_uid and intent = 'farm_upgrade_plot';
    if v_n <> 1 then raise exception 'GATE(e2): % ledger rows after one upgrade', v_n; end if;

    -- (e3) THE STALE SECOND INTENT (a double-click: a NEW key, the SAME rung)
    --      is refused, says the server's level, journals the refusal, and
    --      moves NOTHING: level, gold, ledger, intent cache.
    perform set_config('hearthrise.rejection_noted', '', true);
    delete from public.hr_rejections where user_id = v_uid;
    v_r := public.hr_farm_upgrade_plot(0, v_k2, 2);
    if v_r->>'error' is distinct from 'stale_level' or (v_r->>'plot_level')::int <> 2
       or (v_r->>'expect_level')::int <> 2 then
      raise exception 'GATE(e3): a stale second intent was not refused as stale_level at the server''s level: %', v_r; end if;
    if (select plot_level from public.player_state where user_id = v_uid and slot = 0) <> 2
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> 500 then
      raise exception 'GATE(e3): the stale intent moved plot_level or gold'; end if;
    if (select count(*) from public.player_ledger where user_id = v_uid and intent = 'farm_upgrade_plot') <> 1 then
      raise exception 'GATE(e3): the stale intent wrote a ledger row'; end if;
    if exists (select 1 from public.player_intents where user_id = v_uid and intent_id = v_k2) then
      raise exception 'GATE(e3): the stale refusal was cached as a decision - a retry would replay a refusal'; end if;
    if not exists (select 1 from public.hr_rejections
                    where user_id = v_uid and code = 'stale_level' and verbs ? 'farm_upgrade_plot') then
      raise exception 'GATE(e3): the stale refusal was not journalled in hr_rejections'; end if;

    -- (e4) A RETRY OF THE LANDED GESTURE (same key) REPLAYS, never stale.
    v_r := public.hr_farm_upgrade_plot(0, v_k1, 2);
    if coalesce(v_r->>'ok', '') <> 'true' or (v_r->>'plot_level')::int <> 2 then
      raise exception 'GATE(e4): the replay of a landed key did not return its own envelope: %', v_r; end if;
    if (select gold from public.player_state where user_id = v_uid and slot = 0) <> 500 then
      raise exception 'GATE(e4): the replay charged again'; end if;

    -- (e5) A SKIPPED RUNG IS STALE TOO (expect 4 at level 2).
    v_r := public.hr_farm_upgrade_plot(0, gen_random_uuid(), 4);
    if v_r->>'error' is distinct from 'stale_level' then
      raise exception 'GATE(e5): a rung-skipping expectation was not refused: %', v_r; end if;

    -- (e6) THE CLAN: a leader, two members, three contributors past the 72h
    --      grace, and exactly one tier-2 bundle's worth twice over.
    insert into public.clans (id, name, created_by, castle_tier, treasury, standing, upkeep_state)
      values (v_clan, 'b562 probe hold', v_uid, 1, 100000, 20000, 'active');
    insert into public.clan_members (clan_id, user_id, role, joined_at) values
      (v_clan, v_uid, 'leader', now() - interval '5 days'),
      (v_clan, v_m2,  'member', now() - interval '5 days'),
      (v_clan, v_m3,  'member', now() - interval '5 days');
    insert into public.clan_ledger (clan_id, user_id, kind, item_id, qty) values
      (v_clan, v_uid, 'deposit', 'timber_beam', 1),
      (v_clan, v_m2,  'deposit', 'timber_beam', 1),
      (v_clan, v_m3,  'deposit', 'timber_beam', 1);
    insert into public.clan_stores (clan_id, item_id, qty) values
      (v_clan, 'timber_beam', 600), (v_clan, 'iron_fitting', 240);

    v_r := public.clan_tier_up(v_clan);
    if v_r->>'error' is distinct from 'missing_expect' then
      raise exception 'GATE(e6): clan_tier_up without p_expect_tier was not refused by name: %', v_r; end if;
    v_r := public.clan_tier_up(v_clan, 2);
    if coalesce(v_r->>'ok', '') <> 'true' or (v_r->>'castle_tier')::int <> 2 then
      raise exception 'GATE(e6): the expected-tier-2 raise did not land: %', v_r; end if;
    select treasury into v_tre from public.clans where id = v_clan;
    if v_tre <> 60000 then raise exception 'GATE(e6): treasury % after a 40,000 raise on 100,000', v_tre; end if;

    -- (e7) THE STALE SECOND RAISE moves nothing: tier, treasury, stores, ledger
    --      — and is journalled under the wrapper's verb.
    perform set_config('hearthrise.rejection_noted', '', true);
    v_r := public.clan_tier_up(v_clan, 2);
    if not exists (select 1 from public.hr_rejections
                    where user_id = v_uid and code = 'stale_tier' and verbs ? 'clan_tier_up') then
      raise exception 'GATE(e7): the stale raise was not journalled in hr_rejections under clan_tier_up'; end if;
    if v_r->>'error' is distinct from 'stale_tier' or (v_r->>'castle_tier')::int <> 2 then
      raise exception 'GATE(e7): a stale second raise was not refused as stale_tier: %', v_r; end if;
    if (select castle_tier from public.clans where id = v_clan) <> 2
       or (select treasury from public.clans where id = v_clan) <> 60000 then
      raise exception 'GATE(e7): the stale raise moved the tier or the treasury'; end if;
    if (select qty from public.clan_stores where clan_id = v_clan and item_id = 'timber_beam') <> 300
       or (select qty from public.clan_stores where clan_id = v_clan and item_id = 'iron_fitting') <> 120 then
      raise exception 'GATE(e7): the stale raise consumed a second bundle'; end if;
    if (select count(*) from public.clan_ledger where clan_id = v_clan and kind = 'tier') <> 1 then
      raise exception 'GATE(e7): the stale raise wrote a tier ledger row'; end if;

    -- (e8) THE CORRECT NEXT RUNG PASSES THE CHECK and meets the real gates
    --      (standing 20,000 < tier 3's 60,000) — the check is not a wall.
    v_r := public.clan_tier_up(v_clan, 3);
    if v_r->>'error' is distinct from 'standing_short' then
      raise exception 'GATE(e8): expect 3 at tier 2 did not reach the standing gate: %', v_r; end if;

    raise exception using errcode = 'HR562', message = 'expected-level-idempotency §4 complete - rolling back';
  exception when sqlstate 'HR562' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_uid, v_m2, v_m3))
     or exists (select 1 from public.clans where id = v_clan)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from auth.users where id in (v_uid, v_m2, v_m3)) then
    raise exception 'GATE(e): a probe row survived the rollback'; end if;
  raise notice 'expected-level-idempotency: §4 green (a, b, c, d, e1-e8)';
end $$;
