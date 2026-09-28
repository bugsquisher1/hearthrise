-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-28-settle-before-mutate.sql — NOTHING THAT MOVES A PRICED INPUT LANDS
--                                       WHILE AN UNPAID WINDOW IS OPEN.
--
-- STATUS: STAGED, NOT APPLIED - REVIEW ONLY. Security F2 of
-- docs/planning/SEC_ABSENCE_PRICED_AT_RETURN_2026-09-28.md. It touches items,
-- XP credit, auto-eat and every claim, i.e. money and ranked surfaces, so it moves
-- only on a Security GO and the Coordinator applies it.
-- ⚠ APPLY ORDER: AFTER F1 IS DEPLOYED (hr-accrue with `collectsFirst:true` on
--   eat / claim_reward / shop_buy / market_* / quartermaster_buy / unlock_buy /
--   dungeon_settle). F1 closes the window before each of those verbs commits;
--   this file makes that ordering a DATABASE property. Applied against the
--   pre-F1 edge, those verbs are REFUSED `settle_first` on any row more than
--   180 s stale until the client's own settle lands (the client already answers
--   it with awaitSettleRaceClear + one retry, accrue.js) — correct, but a visible
--   refusal an honest player should not have to meet.
--
-- ── THE DEFECT (verdict §1) ──────────────────────────────────────────────────
-- The return settle prices the whole window [accrued_to, now) with the character
-- AS IT IS AT THE REQUEST. Nothing requires the first request after an absence to
-- be the settle, so claiming a tool / buying one / eating a Feast / buying a
-- perk FIRST prices the entire absence at the new state. Production, 2026-09-27:
-- quest road_forge (iron_pickaxe) claimed at 00:58:34Z, settle at 01:00:19Z priced
-- 7.25 h of mining at 11.52 s instead of 12.80 s: +13.5 % ore. A JWT and curl
-- reach it; an honest client eating at boot trips it by accident.
--
-- ── THE RULE THIS FILE INSTALLS ─────────────────────────────────────────────
-- public.hr_settle_first_of(user, slot) -> jsonb | null. NULL when the slot may
--   be mutated; otherwise the refusal body
--     { ok:false, error:'settle_first', unsettled_ms, threshold_ms, slot }.
--   The slot is REFUSED settle_first when ALL hold:
--     · its active_kind is PAYABLE (combat / gather / artisan — the engine's
--       PAYABLE_KINDS, pinned by tests/settle-before-mutate.mjs),
--     · now() - accrued_to > c_settle_first_ms (180 s, mirrored from
--       2026-09-09-combat-xp-settle-first.sql and COMBAT_XP_SETTLE_FIRST_MS),
--   A slot that meets the first two AND is in a live party hunt (hr_partied)
--   is refused `party_hunt_running` instead (Security F2/F3 review, 2026-09-28).
--   While the party channel is SHADOW nothing prices a hunt per window: the
--   member's own settle pays the whole hunt AFTER the stop, at the state that
--   exists then (2026-09-24-m8-parties-s4-2-hunt-intents.sql). Admitting a claim
--   mid-hunt is F1's mint again. The member clears it by stopping the hunt, the
--   same answer the F1 edge gives (party-fence.js PARTY_CHANNEL_PAYS = false);
--   c_party_channel_pays flips to true in the SAME commit that arms S5.
--   No character, an idle pointer or a null accrued_to is not this file's
--   refusal: the caller's own checks answer those.
-- public.hr_require_settled(user, slot) -> void. RAISES `settle_first` (HR000,
--   the hr_reject convention) with the same detail, and WRITES NOTHING. It is
--   what hr_apply calls inside its protected block, whose handler turns it into
--   the ordinary {ok:false, error} envelope.
--
-- WIRED AS THE FIRST STATEMENT of every client-direct RPC that moves a priced
-- input (items into the bag, XP that raises a combat level, auto-eat, bestiary
-- kills, a perk) and of the engine-committed ones the verdict names:
--   client-direct   hr_claim_quest, hr_claim_goal, hr_claim_daily,
--                   hr_claim_milestone, hr_claim_rank, hr_credit_kills,
--                   hr_trait_buy, raid_claim, world_event_claim,
--                   hr_set_auto_eat, hr_bank_move, hr_farm_harvest
--   engine          hr_unlock_buy, hr_market_buy, hr_market_cancel,
--                   hr_quartermaster_buy, hr_dungeon_settle
-- A refused client-direct call answers the refusal body through
-- hr_settle_first_noted -> hr_note_rejection (journalled in hr_rejections like
-- every gated refusal, §3.4) and writes nothing to the character: no inventory, gold, progress, ledger,
-- version or watermark. The gated wrappers refuse BEFORE hr_rpc_gate, so a
-- refused call does not spend the player's rate budget either.
-- hr_apply: a delta that does NOT carry accrued_to / activity / equip / enchant
--   (the settle and the window-closing verbs) or workers_accrued_to (the crew's
--   own settle, priced on its own watermark) but DOES carry `buff_apply` or a
--   POSITIVE `items` entry calls hr_require_settled after the version check.
--   `settle_first` joins c_release_codes: like version_conflict it is a statement
--   about the READ, not the delta, so the same intent key is re-usable once the
--   settle has landed.
--
-- ── WHAT IT DOES NOT CLOSE, STATED ──────────────────────────────────────────
-- Residue: at most 180 s at the new state on an unticked character (P3, below
-- the combat-XP rule's own accepted residue). hr_companion_grant / _equip are not
-- wired (the companion bonus is not priced by the server, perks.js:425-438);
-- hr_recipe_learn / hr_farm_plant consume rather than add; world_event_absence_claim
-- takes no slot. hr_claim_bounty / hr_bounty_spend move gold and marks only.
--
-- ── COST AT 100× PLAYERS ────────────────────────────────────────────────────
-- One primary-key read of player_state per wired call (plus hr_partied's two
-- indexed probes only when the row is already stale and payable). No table,
-- column, index or row. Claims, trades and purchases are a handful of calls per
-- player per day; hr_apply's extra predicate is evaluated in memory on the delta
-- and reads the row it already locked.
--
-- RESTATEMENT-DEBT-ACK: every wired body is live-hash-tracked and patched here by
--   an anchor asserted EXACTLY ONCE (the top-level `begin`, or hr_apply's
--   version check and release list). The prelude is a pure insertion; nothing is
--   restated.
-- ⚠ AFTER APPLYING: re-seed `node tests/live-hash-drift.mjs --live --write`, whys
--   from `--codediff`; re-run `select public.hr_assert_grant_hygiene(true)`.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED, ANCHORS EXACTLY ONCE ───────────────────
do $mig$
declare
  v_def text; v_n int; r record;
  c_ver constant text := $anc$    if p_version is null or p_version <> v_st.version then
      perform public.hr_reject('version_conflict',
                               jsonb_build_object('version', v_st.version));
    end if;
$anc$;
  c_rel constant text := $anc$'too_many_equip_ops', 'bad_enchant'];$anc$;
begin
  if to_regprocedure('public.hr_partied(uuid,int)') is null then
    raise exception 'hr_partied is missing — apply 2026-09-23-m8-parties-s2-2-roster-settle.sql first';
  end if;
  if to_regprocedure('public.hr_note_rejection(text,int,jsonb)') is null
     or to_regprocedure('public.hr_reject(text,jsonb)') is null then
    raise exception 'hr_note_rejection / hr_reject is missing — the refusal has nowhere to go';
  end if;
  -- (e)'s BEFORE half: hr_assert_grant_hygiene's text, carried to §4 in a
  -- transaction-local setting so the self-check can prove this file left it alone.
  perform set_config('hearthrise.sbm_hygiene_md5',
    md5(pg_get_functiondef('public.hr_assert_grant_hygiene(boolean)'::regprocedure)), true);

  v_def := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'hr_require_settled') = 0 then
    v_n := (length(v_def) - length(replace(v_def, c_ver, ''))) / length(c_ver);
    if v_n <> 1 then raise exception 'hr_apply: the version-check anchor appears % time(s), expected 1', v_n; end if;
    v_n := (length(v_def) - length(replace(v_def, c_rel, ''))) / length(c_rel);
    if v_n <> 1 then raise exception 'hr_apply: the release-list anchor appears % time(s), expected 1', v_n; end if;
  end if;

  for r in select unnest(array[
      'public.hr_claim_quest(text,int)', 'public.hr_claim_goal(text,boolean,int,uuid)',
      'public.hr_claim_daily(text,int)', 'public.hr_claim_milestone(text,int)',
      'public.hr_claim_rank(text,int)', 'public.hr_credit_kills(int,text,bigint,text)',
      'public.hr_trait_buy(text,int,uuid)', 'public.raid_claim(text,uuid,text,int)',
      'public.world_event_claim(text,int)', 'public.hr_set_auto_eat(int,boolean,text,int,boolean)',
      'public.hr_bank_move(int,text,bigint,text,uuid)', 'public.hr_farm_harvest(int,int,uuid)',
      'public.hr_unlock_buy(uuid,int,bigint,uuid,text)',
      'public.hr_market_buy(uuid,int,bigint,uuid,uuid,bigint)',
      'public.hr_market_cancel(uuid,int,bigint,uuid,uuid)',
      'public.hr_quartermaster_buy(uuid,int,bigint,uuid,text)',
      'public.hr_dungeon_settle(uuid,int,bigint,uuid,text,text,numeric)']) as sig
  loop
    if to_regprocedure(r.sig) is null then raise exception '% is missing', r.sig; end if;
    v_def := replace(pg_get_functiondef(r.sig::regprocedure), chr(13), '');
    if strpos(v_def, 'SETTLE-BEFORE-MUTATE') > 0 then continue; end if;
    v_n := (length(v_def) - length(replace(v_def, E'\nbegin\n', ''))) / length(E'\nbegin\n');
    if v_n <> 1 then raise exception '%: the top-level begin appears % time(s), expected 1', r.sig, v_n; end if;
    if strpos(v_def, 'p_slot') = 0 then raise exception '%: no p_slot to settle-check', r.sig; end if;
  end loop;
end $mig$;

-- ── 1. THE PREDICATE AND THE GATE ──────────────────────────────────────────
create or replace function public.hr_settle_first_of(p_user uuid, p_slot int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  -- Mirrors c_settle_first_ms in 2026-09-09-combat-xp-settle-first.sql and
  -- COMBAT_XP_SETTLE_FIRST_MS in src/core/combat-xp-cap.js; pinned by
  -- tests/settle-before-mutate.mjs. One threshold for "the window is open".
  c_settle_first_ms constant bigint := 180000;
  -- The engine's PAYABLE_KINDS (supabase/functions/hr-accrue/accrual.js).
  c_payable constant text[] := array['combat', 'gather', 'artisan'];
  -- Mirrors PARTY_CHANNEL_PAYS in supabase/functions/hr-accrue/party-fence.js.
  -- False while hr_party_tick_settle is SHADOW; flipped only with S5.
  c_party_channel_pays constant boolean := false;
  v_slot int := coalesce(p_slot, 0);
  v_kind text;
  v_acc  timestamptz;
  v_unsettled bigint;
begin
  select ps.active_kind, ps.accrued_to into v_kind, v_acc
    from public.player_state ps where ps.user_id = p_user and ps.slot = v_slot;
  if not found or v_acc is null or not (coalesce(v_kind, 'idle') = any (c_payable)) then
    return null;
  end if;
  v_unsettled := floor(extract(epoch from (now() - v_acc)) * 1000)::bigint;
  if v_unsettled <= c_settle_first_ms then return null; end if;
  if public.hr_partied(p_user, v_slot) then
    if c_party_channel_pays then return null; end if;
    return jsonb_build_object('ok', false, 'error', 'party_hunt_running',
      'unsettled_ms', v_unsettled, 'threshold_ms', c_settle_first_ms, 'slot', v_slot);
  end if;
  return jsonb_build_object('ok', false, 'error', 'settle_first',
    'unsettled_ms', v_unsettled, 'threshold_ms', c_settle_first_ms, 'slot', v_slot);
end $fn$;

create or replace function public.hr_require_settled(p_user uuid, p_slot int)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare v jsonb := public.hr_settle_first_of(p_user, p_slot);
begin
  -- Writes nothing: the raise aborts the caller's block, and hr_apply's HR000
  -- handler turns it into { ok:false, error:<settle_first | party_hunt_running>, ... }.
  if v is not null then
    perform public.hr_reject(v->>'error', v - 'ok' - 'error');
  end if;
end $fn$;

-- The client-direct form: the same answer, journalled once through the ONE
-- recorder every gated refusal uses. It is a helper rather than a second
-- hr_note_rejection call in each wrapper because a wrapper carries exactly one
-- seam (tests/rejections-journal.mjs P6: zero means a restatement ate the
-- journalling, two means a refusal can be counted twice).
create or replace function public.hr_settle_first_noted(p_verb text, p_user uuid, p_slot int)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare v jsonb := public.hr_settle_first_of(p_user, p_slot);
begin
  if v is null then return null; end if;
  return public.hr_note_rejection(p_verb, p_slot, v);
end $fn$;

revoke all on function public.hr_settle_first_of(uuid, int) from public, anon, authenticated, service_role;
revoke all on function public.hr_require_settled(uuid, int) from public, anon, authenticated, service_role;
revoke all on function public.hr_settle_first_noted(text, uuid, int)
  from public, anon, authenticated, service_role;

-- ── 2. THE PRELUDE, FIRST STATEMENT OF EVERY WIRED RPC ─────────────────────
do $mig$
declare
  r record; v_def text; v_pre text;
begin
  for r in select * from (values
      -- client-direct: the caller is auth.uid(); the refusal is journalled.
      ('public.hr_claim_quest(text,int)', 'auth.uid()', 'hr_claim_quest'),
      ('public.hr_claim_goal(text,boolean,int,uuid)', 'auth.uid()', 'hr_claim_goal'),
      ('public.hr_claim_daily(text,int)', 'auth.uid()', 'hr_claim_daily'),
      ('public.hr_claim_milestone(text,int)', 'auth.uid()', 'hr_claim_milestone'),
      ('public.hr_claim_rank(text,int)', 'auth.uid()', 'hr_claim_rank'),
      ('public.hr_credit_kills(int,text,bigint,text)', 'auth.uid()', 'hr_credit_kills'),
      ('public.hr_trait_buy(text,int,uuid)', 'auth.uid()', 'hr_trait_buy'),
      ('public.raid_claim(text,uuid,text,int)', 'auth.uid()', 'raid_claim'),
      ('public.world_event_claim(text,int)', 'auth.uid()', 'world_event_claim'),
      ('public.hr_set_auto_eat(int,boolean,text,int,boolean)', 'auth.uid()', 'set_auto_eat'),
      ('public.hr_bank_move(int,text,bigint,text,uuid)', 'auth.uid()', 'bank_move'),
      ('public.hr_farm_harvest(int,int,uuid)', 'auth.uid()', 'farm_harvest'),
      -- engine-committed: the Edge names the user it has already verified. Not
      -- executable by any client role, so p_user is the engine's word.
      ('public.hr_unlock_buy(uuid,int,bigint,uuid,text)', 'coalesce(p_user, auth.uid())', null),
      ('public.hr_market_buy(uuid,int,bigint,uuid,uuid,bigint)', 'coalesce(p_user, auth.uid())', null),
      ('public.hr_market_cancel(uuid,int,bigint,uuid,uuid)', 'coalesce(p_user, auth.uid())', null),
      ('public.hr_quartermaster_buy(uuid,int,bigint,uuid,text)', 'coalesce(p_user, auth.uid())', null),
      ('public.hr_dungeon_settle(uuid,int,bigint,uuid,text,text,numeric)', 'coalesce(p_user, auth.uid())', null)
    ) as t(sig, who, verb)
  loop
    v_def := replace(pg_get_functiondef(r.sig::regprocedure), chr(13), '');
    if strpos(v_def, 'SETTLE-BEFORE-MUTATE') > 0 then
      raise notice '% already settles first — patch skipped', r.sig; continue; end if;
    v_pre := format($pre$
begin
  -- SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql, Security F2). An
  -- unpaid window is priced at the state that existed during it, so nothing that
  -- moves a priced input lands while one is open. Refuses before anything else
  -- and writes nothing to the character. (A nested block, not an exception
  -- block: no subtransaction on the accepted path.)
  declare v_settle jsonb := %1$s;
  begin
    if v_settle is not null then return v_settle; end if;
  end;
$pre$,
      case when r.verb is null
           then format('public.hr_settle_first_of(%s, p_slot)', r.who)
           else format('public.hr_settle_first_noted(%L, %s, p_slot)', r.verb, r.who) end);
    v_def := replace(v_def, E'\nbegin\n', v_pre);
    execute v_def;
  end loop;
  raise notice 'settle-before-mutate: 17 RPCs refuse settle_first over an unpaid window';
end $mig$;

-- ── 3. hr_apply — A NON-STAMPING DELTA THAT ADDS AN INPUT SETTLES FIRST ────
do $mig$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef(
    'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'hr_require_settled') > 0 then
    raise notice 'hr_apply already settles first — patch skipped'; return; end if;

  v_def := replace(v_def,
    $anc$'too_many_equip_ops', 'bad_enchant'];$anc$,
    $anc$'too_many_equip_ops', 'bad_enchant',
    -- 2026-09-28-settle-before-mutate.sql: a statement about the READ (the
    -- window is still unpaid), not the delta — the same key works once the
    -- settle lands, exactly like version_conflict. party_hunt_running is its
    -- partied twin (the key works once the hunt stops and the settle lands).
    'settle_first', 'party_hunt_running'];$anc$);

  v_def := replace(v_def,
    $anc$    if p_version is null or p_version <> v_st.version then
      perform public.hr_reject('version_conflict',
                               jsonb_build_object('version', v_st.version));
    end if;
$anc$,
    $anc$    if p_version is null or p_version <> v_st.version then
      perform public.hr_reject('version_conflict',
                               jsonb_build_object('version', v_st.version));
    end if;

    -- ── SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql, F2) ────
    -- The settle and the window-closing verbs carry accrued_to / activity /
    -- equip / enchant; the crew's own settle carries workers_accrued_to. Any
    -- OTHER delta that adds a priced input — a buff, or a positive item (a
    -- tool, food, ammo, a material) — must not land while the pointer's window
    -- is unpaid, or the settle prices the whole absence at it.
    if not (p_delta ?| array['accrued_to', 'activity', 'equip', 'enchant', 'workers_accrued_to'])
       and (p_delta ? 'buff_apply'
            or (jsonb_typeof(p_delta->'items') = 'object'
                and exists (select 1 from jsonb_each_text(p_delta->'items') as t(k, v)
                             where t.v ~ '^\s*\+?0*[1-9][0-9]*\s*$'))) then
      perform public.hr_require_settled(v_uid, v_slot);
    end if;
$anc$);
  execute v_def;
  raise notice 'hr_apply patched: a non-stamping delta that adds an input settles first';
end $mig$;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
grant  execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 4. SELF-CHECK (§4) — (a)-(c), (e), (f) BY EXECUTION ────────────────────
-- (d) is 2026-09-28-buff-segment-from.sql's. Every arm drives a REAL call against
-- a fabricated character inside a subtransaction discarded by a sentinel raise
-- (HR929), so the block is net-zero; §4(z) proves no probe row survives.
do $mig$
declare
  v jsonb; v_ver bigint; v_acc timestamptz; v_gold bigint; v_led int; v_inv bigint;
  v_prog int; v_iid uuid; r record; v_food text;
  v_uid constant uuid := '00000f2b-0000-4000-a000-000000000f2b';
  c_j   constant jsonb := '{"kind":"admin","intent":"settle-before-mutate:probe"}'::jsonb;
  c_tool constant text := 'iron_pickaxe';
begin
  -- (e) hr_assert_grant_hygiene is unchanged, and still passes strict.
  if md5(pg_get_functiondef('public.hr_assert_grant_hygiene(boolean)'::regprocedure))
     is distinct from current_setting('hearthrise.sbm_hygiene_md5', true) then
    raise exception 'settle-before-mutate self-check (e): hr_assert_grant_hygiene CHANGED'; end if;
  perform public.hr_assert_grant_hygiene(true);
  for r in select unnest(array['anon', 'authenticated']) as role loop
    if has_function_privilege(r.role, 'public.hr_settle_first_of(uuid,int)', 'execute')
       or has_function_privilege(r.role, 'public.hr_require_settled(uuid,int)', 'execute')
       or has_function_privilege(r.role, 'public.hr_settle_first_noted(text,uuid,int)', 'execute') then
      raise exception 'settle-before-mutate self-check (e): % can execute the settle gate', r.role; end if;
  end loop;
  -- Every wired body carries the prelude as its first statement.
  for r in select unnest(array[
      'public.hr_claim_quest(text,int)', 'public.hr_claim_goal(text,boolean,int,uuid)',
      'public.hr_claim_daily(text,int)', 'public.hr_claim_milestone(text,int)',
      'public.hr_claim_rank(text,int)', 'public.hr_credit_kills(int,text,bigint,text)',
      'public.hr_trait_buy(text,int,uuid)', 'public.raid_claim(text,uuid,text,int)',
      'public.world_event_claim(text,int)', 'public.hr_set_auto_eat(int,boolean,text,int,boolean)',
      'public.hr_bank_move(int,text,bigint,text,uuid)', 'public.hr_farm_harvest(int,int,uuid)',
      'public.hr_unlock_buy(uuid,int,bigint,uuid,text)',
      'public.hr_market_buy(uuid,int,bigint,uuid,uuid,bigint)',
      'public.hr_market_cancel(uuid,int,bigint,uuid,uuid)',
      'public.hr_quartermaster_buy(uuid,int,bigint,uuid,text)',
      'public.hr_dungeon_settle(uuid,int,bigint,uuid,text,text,numeric)']) as sig
  loop
    if position(E'\nbegin\n  -- SETTLE-BEFORE-MUTATE' in pg_get_functiondef(r.sig::regprocedure)) = 0 then
      raise exception 'settle-before-mutate self-check: % does not settle-check as its first statement', r.sig;
    end if;
  end loop;

  begin
    select b.item_id into v_food from public.hr_item_buffs b order by b.item_id limit 1;
    if v_food is null or not exists (select 1 from public.hr_items where item_id = c_tool) then
      raise exception 'settle-before-mutate self-check: FIXTURE — no buff food or no %', c_tool; end if;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    -- A miner who left 7.25 h ago (the production row's shape) and has done the
    -- smithing road_forge asks for — the quest that grants the iron pickaxe.
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
        accrued_to, active_kind, active_id, active_since)
      values (v_uid, 0, 1000, 0, 10, 10, 1, now() - interval '7 hours 15 minutes',
              'combat', 'hr_probe_target', now() - interval '8 hours');
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, updated_at)
      values (v_uid, 0, 'stat', 'ev:smithed', 60, '', now());
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_uid, 0, v_food, 5);

    select accrued_to, version, gold into v_acc, v_ver, v_gold
      from public.player_state where user_id = v_uid and slot = 0;
    select count(*) into v_led from public.player_ledger where user_id = v_uid;

    -- (a) STALE ROW + hr_claim_quest -> settle_first; nothing moves.
    v := public.hr_claim_quest('road_forge', 0);
    if coalesce(v->>'error', '') <> 'settle_first' or (v->>'unsettled_ms')::bigint < 26000000
       or (v->>'threshold_ms')::bigint <> 180000 then
      raise exception 'settle-before-mutate self-check (a): a stale hr_claim_quest was not refused '
                      'settle_first with the real unsettled window: %', v;
    end if;
    if exists (select 1 from public.player_inventory where user_id = v_uid and item_id = c_tool)
       or (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold
       or (select count(*) from public.player_ledger where user_id = v_uid) <> v_led
       or exists (select 1 from public.player_progress where user_id = v_uid and kind = 'quest') then
      raise exception 'settle-before-mutate self-check (a): the refused claim still wrote the character';
    end if;
    -- …and every other wired client-direct RPC refuses the same row the same way.
    for r in select * from (values
        ('hr_claim_goal', public.hr_claim_goal('x', false, 0, gen_random_uuid())),
        ('hr_claim_daily', public.hr_claim_daily('x', 0)),
        ('hr_claim_milestone', public.hr_claim_milestone('x', 0)),
        ('hr_claim_rank', public.hr_claim_rank('x', 0)),
        ('hr_credit_kills', public.hr_credit_kills(0, 'x', 1, gen_random_uuid()::text)),
        ('hr_trait_buy', public.hr_trait_buy('x', 0, gen_random_uuid())),
        ('raid_claim', public.raid_claim('x', gen_random_uuid(), 'x', 0)),
        ('world_event_claim', public.world_event_claim('x', 0)),
        ('hr_set_auto_eat', public.hr_set_auto_eat(0, true, null, null, false)),
        ('hr_bank_move', public.hr_bank_move(0, v_food, 1, 'deposit', gen_random_uuid())),
        ('hr_farm_harvest', public.hr_farm_harvest(0, 0, gen_random_uuid()))) as t(fn, res)
    loop
      if coalesce(r.res->>'error', '') <> 'settle_first' then
        raise exception 'settle-before-mutate self-check (a): % on a stale row answered % instead of settle_first',
                        r.fn, r.res;
      end if;
    end loop;

    -- (c) hr_apply: a non-stamping items:+1 and a buff_apply on the stale row -> refused.
    v_iid := gen_random_uuid();
    v := public.hr_apply(v_uid, 0, v_ver, v_iid,
           jsonb_build_object('items', jsonb_build_object(c_tool, 1), 'journal', c_j));
    if coalesce(v->>'error', '') <> 'settle_first' then
      raise exception 'settle-before-mutate self-check (c): a non-stamping items:+1 on a stale row was not '
                      'refused settle_first: %', v;
    end if;
    v := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
           jsonb_build_object('buff_apply', jsonb_build_object('item', v_food),
                              'items', jsonb_build_object(v_food, -1), 'journal', c_j));
    if coalesce(v->>'error', '') <> 'settle_first' then
      raise exception 'settle-before-mutate self-check (c): a buff_apply on a stale row was not refused: %', v;
    end if;
    -- A debit alone adds nothing and is not this file's to refuse.
    v := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
           jsonb_build_object('items', jsonb_build_object(v_food, -1), 'journal', c_j));
    if coalesce(v->>'ok', 'false') <> 'true' then
      raise exception 'settle-before-mutate self-check (c): a pure debit was refused on a stale row: %', v; end if;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;

    -- (f) accrued_to UNMOVED across every refused call above.
    if (select accrued_to from public.player_state where user_id = v_uid and slot = 0) <> v_acc then
      raise exception 'settle-before-mutate self-check (f): a refused call moved accrued_to'; end if;

    -- (c) THE SAME DELTA WITH accrued_to (the settle's own key) IS ADMITTED — and
    --     on the SAME intent key the refusal used: settle_first releases the key.
    v := public.hr_apply(v_uid, 0, v_ver, v_iid,
           jsonb_build_object('items', jsonb_build_object(c_tool, 1),
                              'accrued_to', to_jsonb(now()), 'journal', c_j));
    if coalesce(v->>'ok', 'false') <> 'true' then
      raise exception 'settle-before-mutate self-check (c): the same delta carrying accrued_to (same key) '
                      'was not admitted: %', v;
    end if;
    delete from public.player_inventory where user_id = v_uid and item_id = c_tool;

    -- (b) FRESH ROW (< 180 s): the claim is admitted and pays the tool.
    v := public.hr_claim_quest('road_forge', 0);
    if coalesce(v->>'ok', 'false') <> 'true'
       or not exists (select 1 from public.player_inventory where user_id = v_uid and item_id = c_tool) then
      raise exception 'settle-before-mutate self-check (b): a claim on a settled row was not admitted: %', v;
    end if;
    -- (b) THE THRESHOLD, both sides, and the three exemptions.
    update public.player_state set accrued_to = now() - interval '179 seconds' where user_id = v_uid and slot = 0;
    if public.hr_settle_first_of(v_uid, 0) is not null then
      raise exception 'settle-before-mutate self-check (b): 179 s was refused — the threshold drifted DOWN'; end if;
    update public.player_state set accrued_to = now() - interval '181 seconds' where user_id = v_uid and slot = 0;
    if public.hr_settle_first_of(v_uid, 0) is null then
      raise exception 'settle-before-mutate self-check (b): 181 s was admitted — the threshold drifted UP'; end if;
    begin
      perform public.hr_require_settled(v_uid, 0);
      raise exception 'settle-before-mutate self-check (b): hr_require_settled did not raise on a stale row';
    exception when sqlstate 'HR000' then
      if sqlerrm <> 'settle_first' then
        raise exception 'settle-before-mutate self-check (b): hr_require_settled raised % not settle_first', sqlerrm;
      end if;
    end;
    -- (b) A LIVE PARTY HUNT IS NOT AN EXEMPTION while the channel is SHADOW: the
    --     same stale row, partied, is refused party_hunt_running (clearable by the
    --     stop), a client-direct claim writes nothing, and hr_apply releases the key.
    declare v_pid uuid;
    begin
      insert into public.party (leader_user, leader_slot) values (v_uid, 0) returning id into v_pid;
      insert into public.party_member (party_id, user_id, slot, role) values (v_pid, v_uid, 0, 'leader');
      insert into public.party_hunt (party_id, active_id, accrued_to)
        values (v_pid, 'hr_probe_target', now() - interval '181 seconds');
      if coalesce(public.hr_settle_first_of(v_uid, 0)->>'error', '') <> 'party_hunt_running' then
        raise exception 'settle-before-mutate self-check (b): a stale partied row answered % instead of '
                        'party_hunt_running — a shadow hunt would be paid at the claim', public.hr_settle_first_of(v_uid, 0);
      end if;
      select gold, version into v_gold, v_ver from public.player_state where user_id = v_uid and slot = 0;
      v := public.hr_claim_daily('x', 0);
      if coalesce(v->>'error', '') <> 'party_hunt_running'
         or (select version from public.player_state where user_id = v_uid and slot = 0) <> v_ver then
        raise exception 'settle-before-mutate self-check (b): a partied hr_claim_daily answered % (or wrote)', v;
      end if;
      v := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('items', jsonb_build_object(c_tool, 1), 'journal', c_j));
      if coalesce(v->>'error', '') <> 'party_hunt_running' then
        raise exception 'settle-before-mutate self-check (b): hr_apply on a partied stale row answered %', v; end if;
      update public.party_hunt set ended_at = now(), stopped_by = 'leader' where party_id = v_pid;
      if coalesce(public.hr_settle_first_of(v_uid, 0)->>'error', '') <> 'settle_first' then
        raise exception 'settle-before-mutate self-check (b): a STOPPED hunt did not fall back to settle_first'; end if;
    end;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_uid and slot = 0;
    if public.hr_settle_first_of(v_uid, 0) is not null then
      raise exception 'settle-before-mutate self-check (b): an IDLE pointer was refused — there is no window'; end if;
    if public.hr_settle_first_of(gen_random_uuid(), 0) is not null then
      raise exception 'settle-before-mutate self-check (b): a missing character was refused here'; end if;

    raise exception using errcode = 'HR929', message = 'settle-before-mutate §4 complete — rolling back';
  exception when sqlstate 'HR929' then null;
  end;

  -- (z) THE LEAK CHECK.
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'settle-before-mutate self-check: §4 LEAKED a probe row'; end if;

  raise notice 'settle-before-mutate self-check PASSED: (a) a stale hr_claim_quest (and 11 more '
               'client-direct RPCs) answer settle_first with inventory, gold, progress and ledger '
               'unmoved; (b) a settled row is admitted and paid, 179 s passes, 181 s refuses, idle and '
               'missing are not this gate''s; (c) hr_apply refuses a non-stamping items:+1 and a '
               'buff_apply on a stale row, admits a debit, and admits the same delta with accrued_to on '
               'the SAME intent key; a stale partied row answers party_hunt_running and writes nothing; (e) hr_assert_grant_hygiene unchanged and passing, the gate is not '
               'client-executable; (f) accrued_to unmoved across every refusal';
end $mig$;
