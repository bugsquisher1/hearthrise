-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1024-carry-on.sql — CARRY ON: ONE PRESS FOR THE ACCOUNT SENDS EVERY HERO BACK TO WHAT IT DID LAST
--   (lane/c-carry-on, systems-engineer, 2026-11-20; build plan L07, docs/design/balance-program/30-plan.md §D; Tyler RULED 27-1
--   recommended on 2026-11-20: "one Carry on press for the whole account on the return card, and no hunt ever starts by itself").
--
-- STATUS: supabase/migration-notes/1024-carry-on.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────
-- A visit is 2 to 5 minutes (REAL). One hero's return was 8 to 10 presses that never change (leave, Bless, Tamsin, Dispatch, the
--   Storage withdraws, Hunt again); four heroes 32 to 40 (27-retention.md question 3). The decision was made once: the server can
--   repeat it, behind ONE press the player makes. Nothing here starts a hunt on its own (the 10-18 ruling: a session starts a hunt).
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- hr_carry_on_plan_of(p_uid, p_slots int[]) -> jsonb   NEW, owner-only, READ ONLY: what one press would do now, per hero, in slot
--   order. p_slots null = the whole account (the away card); a list = those heroes (the end card's "Hunt again, all four").
--   A hero's LAST HUNT is its newest session; a yard session its own hunt's plan opened (hunt_sessions.after_done->>'session') points
--   back at that hunt. Each hero reads one of:
--     busy    a session is open (hunting, walking, at the yard): nothing to do
--     parked  (whole-account press only) its last hunt ended by the player's own hand (left, changed): it stays where the player put it
--     go      it would go: `hunt` (its last ground, or its party's), `tier` (the ground's remembered pick, the leader's in a party),
--             `preset` and `hours` (its last hunt's, or the ground's remembered set when its party moved), `storage` (the lines
--             Storage tops its bag up with: to the last hunt's loaded count, never past what Storage holds, earlier heroes of the
--             same press first), `short` (what is still under the last count: the store tops it up inside the hunt, as ever),
--             `bless` (the Blessings the last hunt's death used, each at the server's price now), `loot` (its loot plan has
--             something to run), `job` (the town job the hunt will stop), `after` (its remembered after-hunt choice: the seam a
--             later "then" row, e.g. L30's Tower climb, reads; hunt-after.js)
--     no      it would not, and `why`: every refusal hr_hunt_enter_check answers (no_stamina, outgrown, tower_only, call_only,
--             hall_only, training_only, hunts_paused, party_hunt_mismatch ...), `party_leader` (its party is not hunting and another
--             account's hero leads it: only that leader starts it), `insufficient_gold` (the purse cannot pay its Blessings)
--   and the account total `gold` (every go hero's Blessings) and `go` (how many would go).
-- hr_carry_on_plan(p_slots int[]) -> jsonb   NEW, authenticated: the caller's own plan; rate gate hunt_read. Moves nothing.
-- hr_carry_on(p_slots int[], p_gold bigint, p_idem uuid) -> jsonb   NEW, authenticated: THE ONE PRESS. p_gold is the plan's `gold` the
--   player was shown; another sum refuses quote_changed and moves nothing (the services rule: never charge a sum not shown).
--   Under the locks (the parties, then the heroes in slot order, then Storage) it reads the plan again and, for each go hero in
--   its own subtransaction, in this order, through the doors that already exist (no second path for any of them):
--     (1) loot by plan   hr_loot_dispatch (the hero's own key derived from the press's), when its plan has a deposit or sell stack;
--                        best effort: a refusal (nothing_to_dispatch, storage_full, settle_first) keeps the bag as it is
--     (2) Tamsin         hr_tally_claim: a task done and due is paid and a Repeat task taken again (the in-town collect's own body)
--     (3) Blessings      hr_blessing_buy, tier by tier at the planned price (its own quote check, its own journal)
--     (4) Storage first  hr_bank_move_stack withdraw, line by line (the one body hr_bank_move runs; journalled bank_withdraw);
--                        a line the bag has no room for is skipped; one version step if any line moved
--     (5) hunt again     hr_hunt_enter_for with the last hunt's ground (or its party's), setup and hours, each bag line the last
--                        hunt's loaded count and at most what the bag holds now (hr_hunt_restart's rule). The door every start uses.
--   A Blessing or the start refused rolls that hero's steps back and names it (`no`, `why`); the others still go. Answers
--   { ok, went, gold, heroes, envelopes } and keeps it under the key without `envelopes` (each touched hero's hr_state_of by slot:
--   the client applies them with no second read, rule 11). Refuses quote_changed, nothing_to_carry_on (no hero would go; a second press
--   after the first lands here: every hero is busy), bad_slot, bad_intent, bad_idem, rate_limited.
-- REFUSAL CODES NEW: party_leader, nothing_to_carry_on (src/data/refusal-words.js).
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- Lock order, the same as the doors it calls: every party a go hero sits in (sorted), then each go hero (hr_hunt_lock, slot order),
--   then the account's Storage key (hr_bank_move's), then the purse and the play locks inside the doors. Nothing takes a party or a
--   hero after Storage. The plan is read again under the locks, so a hero that started a hunt meanwhile is busy, never started twice.
-- The press's key answers its first receipt (hr_intent_replay, before and under the locks); each door it calls has its own key derived
--   from the press's (md5(key || step || slot)), so even a door reached twice answers once. Two presses with two keys start one set:
--   the second finds every hero busy and refuses nothing_to_carry_on.
-- A second apply of this file restates the same bodies and the same baseline rows: byte-identical (tests/schema-drift.mjs).
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- Two authenticated verbs taking slots, one gold figure and a key. They reach only the caller's own heroes (auth.uid()), and only
--   doors the caller can already press one by one: every step is exactly a press the player could make by hand, with that door's own
--   checks, prices, clamps and journal. A hero in another account's party is never started here (its leader's press starts it; this
--   only joins a hunt that party is already on). The gold figure only REFUSES: it never sets a price. No new table, column or journal kind.
--
-- ── COST ─────────────────────────────────────────────────────────────────────
-- Off the settle path. A plan read: per hero, its newest sessions (hunt_sessions_char_recent), its last hunt's bag lines (at most 10),
--   the door's predicate, and on a death the one ledger row the death popup already reads. A press: that, twice, plus the doors' own
--   writes (about 4 to 8 statements a hero). It replaces 8 to 40 presses, each of which paid a request, a gate and a re-read.
--
-- BROWSER: the away card reads the plan when it opens and after each envelope that moves a hero; its Carry on press is off until the
--   plan says a hero would go, and the end card's leader press reads the same plan for its party's own heroes. Both show only the
--   server's plan and then its answer. EDGE: none. CLIENT: src/session/carry-on-intents.js, src/shell/windows/away.js, hunt-summary.js.
-- GUARDS: tests/carry-on.mjs (both paths, the refusal, the idempotency); its §4 below.
-- REVERSIBLE: drop the three functions and their two baseline rows. Nothing else moved.
-- WIPE: nothing to keep (no table).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
-- (lane/retire-tier-chain, 2026-11-26: the plan's hero `tier` is out of this body, folded in from 1072-retire-tier-chain.sql, which drops
--  hunt_density.tier: a staged body is edited in place, never moved by a later file)
do $mig$
begin
  if to_regprocedure('public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)') is null
     or to_regprocedure('public.hr_hunt_enter_check(uuid,integer,text,jsonb,integer,integer,boolean)') is null
     or to_regprocedure('public.hr_bank_move_stack(uuid,integer,text,bigint,text,integer)') is null
     or to_regprocedure('public.hr_blessing_buy(integer,integer,bigint,uuid)') is null
     or to_regprocedure('public.hr_blessing_price(integer,integer)') is null
     or to_regprocedure('public.hr_loot_dispatch(integer,uuid)') is null
     or to_regprocedure('public.hr_tally_claim(uuid,integer,uuid)') is null
     or to_regprocedure('public.hr_hunt_active_set(uuid,integer)') is null
     or to_regprocedure('public.hr_purse_of(uuid)') is null
     or to_regclass('public.hr_client_rpc_baseline') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hunt_sessions' and column_name = 'after_done')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_state' and column_name = 'after_choice') then
    raise exception 'PRECONDITION: a door, a helper, a table or a column this file reads is missing'; end if;
end $mig$;

-- ── §1 THE PLAN (owner-only, read only) ──────────────────────────────────────
create or replace function public.hr_carry_on_plan_of(p_uid uuid, p_slots int[])
returns jsonb language plpgsql set search_path = public, pg_catalog as $fn$
declare
  v_st      record;
  v_s       public.hunt_sessions%rowtype;
  v_t       public.hunt_sessions%rowtype;
  v_p       public.hunt_parties%rowtype;
  v_party   uuid;
  v_hunt    text;
  v_preset  int;
  v_hours   int;
  v_why     text;
  v_detail  jsonb;
  v_r       jsonb;
  v_b       record;
  v_avail   bigint;
  v_take    bigint;
  v_stacks  int;
  v_storage jsonb;
  v_short   jsonb;
  v_tiers   int[];
  v_tier    int;
  v_lv      int;
  v_price   bigint;
  v_bless   jsonb;
  v_bgold   bigint;
  v_drawn   jsonb := '{}'::jsonb;              -- Storage an earlier hero of this press already takes, per item
  v_purse   bigint := public.hr_purse_of(p_uid);
  v_gold    bigint := 0;
  v_go      int := 0;
  v_heroes  jsonb := '[]'::jsonb;
begin
  if p_uid is null then return jsonb_build_object('heroes', v_heroes, 'go', 0, 'gold', 0); end if;
  for v_st in select ps.slot, ps.active_kind, ps.bank_cap, ps.after_choice
                from public.player_state ps
               where ps.user_id = p_uid and (p_slots is null or ps.slot = any (p_slots))
               order by ps.slot loop
    v_why := null; v_detail := null; v_storage := '[]'::jsonb; v_short := '[]'::jsonb; v_bless := null; v_bgold := 0;
    select * into v_s from public.hunt_sessions h where h.user_id = p_uid and h.slot = v_st.slot
     order by h.entered_at desc, h.id limit 1;
    continue when v_s.id is null;   -- never hunted: nothing to carry on
    if v_s.ended_at is null then
      v_heroes := v_heroes || jsonb_build_array(jsonb_build_object('slot', v_st.slot, 'name', public.hr_character_name(p_uid, v_st.slot),
        'state', 'busy', 'hunt', v_s.hunt_id,
        'why', case when exists (select 1 from public.hr_training_grounds g where g.hunt_id = v_s.hunt_id) then 'training' else 'hunting' end));
      continue;
    end if;
    -- A YARD SESSION THE HUNT'S OWN PLAN OPENED (hr_hunt_after_start) points back at that hunt: the hunt is what carries on.
    if exists (select 1 from public.hr_training_grounds g where g.hunt_id = v_s.hunt_id) then
      select * into v_t from public.hunt_sessions h
       where h.user_id = p_uid and h.slot = v_st.slot and h.after_done->>'session' = v_s.id::text
       order by h.entered_at desc, h.id limit 1;
      if v_t.id is not null then v_s := v_t; end if;
    end if;
    -- THE PLAYER'S OWN STOP STANDS: on the whole-account press a hero the player took out by hand stays out (its own Hunt again remains).
    if p_slots is null and v_s.end_reason in ('left', 'changed') then
      v_heroes := v_heroes || jsonb_build_array(jsonb_build_object('slot', v_st.slot, 'name', public.hr_character_name(p_uid, v_st.slot),
        'state', 'parked', 'hunt', v_s.hunt_id, 'why', v_s.end_reason));
      continue;
    end if;
    -- THE GROUND: the last hunt's, or the party's when the hero sits in one (a member goes where its party goes).
    v_hunt := v_s.hunt_id; v_p := null;
    v_party := public.hr_hunt_party_of(p_uid, v_st.slot);
    if v_party is not null then
      select * into v_p from public.hunt_parties where id = v_party;
      v_hunt := coalesce(v_p.hunt_id, v_s.hunt_id);
      -- PARTY-LEADER-STARTS (2027-02-20): only the leader starts a party's hunt; this press is the leader's when the leader is the
      -- caller's own hero. Another account's party is only joined while it hunts.
      if v_p.leader_user <> p_uid
         and not exists (select 1 from public.hunt_sessions h where h.instance_id = v_party and h.ended_at is null) then
        v_why := 'party_leader';
        v_detail := jsonb_build_object('leader', public.hr_character_name(v_p.leader_user, v_p.leader_slot));
      end if;
    end if;
    -- THE SETUP: the last hunt's when it ran this ground, else the ground's remembered set (party start's rule); its hours either way.
    v_preset := case when v_s.hunt_id = v_hunt then coalesce(v_s.preset, 0) else public.hr_hunt_active_set(p_uid, v_st.slot) end;
    v_hours := v_s.hours_limit;
    -- THE DOOR'S OWN PREDICATE (every refusal hr_hunt_enter_for answers, in its order), the bag aside: its lines are built below.
    if v_why is null then
      v_r := public.hr_hunt_enter_check(p_uid, v_st.slot, v_hunt, '[]'::jsonb, v_preset, v_hours);
      if v_r is not null then v_why := coalesce(v_r->>'error', 'refused'); v_detail := nullif(v_r - 'ok' - 'error', '{}'::jsonb); end if;
    end if;
    -- BLESSINGS: the tiers the last hunt's death used (the death popup's own ledger row, hr_death_log_view) the hero lacks now, each at
    -- the server's price at its Level now; the purse must pay them all.
    if v_why is null and v_s.end_reason = 'died' then
      select array_agg(distinct x.t order by x.t) into v_tiers
        from (select (jsonb_array_elements_text(l.meta->'tiers'))::int as t
                from public.hunt_session_events e
                join public.player_ledger l on l.session_id = e.session_id and l.user_id = p_uid and l.slot = v_st.slot
                 and l.intent = 'blessing_used' and l.at >= e.at and l.at < e.at + interval '2 days'
               where e.session_id = v_s.id and e.type = 'death') x
       where not exists (select 1 from public.player_blessings pb where pb.user_id = p_uid and pb.slot = v_st.slot and pb.tier = x.t);
      if coalesce(cardinality(v_tiers), 0) > 0 then
        v_lv := greatest(1, coalesce(public.hr_level_of(p_uid, v_st.slot), 1));
        v_bless := '[]'::jsonb;
        foreach v_tier in array v_tiers loop
          v_price := public.hr_blessing_price(v_tier, v_lv);
          v_bless := v_bless || jsonb_build_array(jsonb_build_object('tier', v_tier, 'price', v_price));
          v_bgold := v_bgold + coalesce(v_price, 0);
        end loop;
        if v_bgold > v_purse then
          v_why := 'insufficient_gold'; v_detail := jsonb_build_object('need', v_bgold, 'have', v_purse);
        end if;
      end if;
    end if;
    -- STORAGE FIRST, THEN THE STORE (Tyler 10-16; 27-retention.md "26 home"): each line of the last hunt topped up to its loaded count
    -- from the account's Storage, no further than Storage holds after the heroes before this one; a new bag stack needs room.
    if v_why is null then
      select count(*) into v_stacks from public.player_inventory i where i.user_id = p_uid and i.slot = v_st.slot;
      for v_b in select b.item_id, b.qty_loaded, coalesce(pi.qty, 0)::bigint as held, coalesce(ab.qty, 0)::bigint as stored
                   from public.hunt_bag b
                   left join public.player_inventory pi on pi.user_id = p_uid and pi.slot = v_st.slot and pi.item_id = b.item_id
                   left join public.account_bank ab on ab.user_id = p_uid and ab.item_id = b.item_id
                  where b.session_id = v_s.id and b.qty_loaded > 0
                  order by b.essential desc, b.item_id loop
        v_avail := greatest(0, v_b.stored - coalesce((v_drawn->>v_b.item_id)::bigint, 0));
        v_take := least(greatest(v_b.qty_loaded - v_b.held, 0), v_avail);
        if v_take > 0 and v_b.held = 0 then
          if v_stacks >= coalesce(v_st.bank_cap, 0) then v_take := 0; else v_stacks := v_stacks + 1; end if;
        end if;
        if v_take > 0 then
          v_storage := v_storage || jsonb_build_array(jsonb_build_object('item', v_b.item_id, 'qty', v_take));
          v_drawn := v_drawn || jsonb_build_object(v_b.item_id, coalesce((v_drawn->>v_b.item_id)::bigint, 0) + v_take);
        end if;
        if v_b.qty_loaded - v_b.held - v_take > 0 then
          v_short := v_short || jsonb_build_array(jsonb_build_object('item', v_b.item_id, 'qty', v_b.qty_loaded - v_b.held - v_take));
        end if;
      end loop;
      v_purse := v_purse - v_bgold;
      v_gold := v_gold + v_bgold;
      v_go := v_go + 1;
    end if;
    v_heroes := v_heroes || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'slot', v_st.slot, 'name', public.hr_character_name(p_uid, v_st.slot),
      'state', case when v_why is null then 'go' else 'no' end, 'why', v_why, 'detail', v_detail,
      'hunt', v_hunt, 'session', v_s.id, 'ended', v_s.end_reason,
      'party', v_party is not null, 'preset', v_preset, 'hours', v_hours,
      'storage', case when v_why is null then v_storage end, 'short', case when v_why is null then v_short end,
      'bless', v_bless, 'bless_gold', case when v_bless is not null then v_bgold end,
      'loot', case when v_why is null then exists (select 1 from public.player_inventory i
                                                     join public.player_item_rules r on r.user_id = i.user_id and r.slot = i.slot and r.item_id = i.item_id
                                                    where i.user_id = p_uid and i.slot = v_st.slot and i.qty > 0 and not r.locked
                                                      and r.loot_rule in ('deposit', 'sell')) end,
      'job', case when v_st.active_kind in ('gather', 'artisan', 'training') then v_st.active_kind end,
      'after', v_st.after_choice)));
  end loop;
  return jsonb_build_object('heroes', v_heroes, 'go', v_go, 'gold', v_gold);
end $fn$;
revoke execute on function public.hr_carry_on_plan_of(uuid, int[]) from public, anon, authenticated, service_role;

-- ── §2 THE TWO VERBS ─────────────────────────────────────────────────────────
-- The scope a press names: null (the whole account) or one to six distinct hero slots.
create or replace function public.hr_carry_on_scope_ok(p_slots int[])
returns boolean language sql immutable set search_path = public, pg_catalog as $fn$
  select p_slots is null
      or (cardinality(p_slots) between 1 and 6
          and not exists (select 1 from unnest(p_slots) s where s is null or s < 0 or s > 5)
          and (select count(distinct s) from unnest(p_slots) s) = cardinality(p_slots))
$fn$;
revoke execute on function public.hr_carry_on_scope_ok(int[]) from public, anon, authenticated, service_role;

create or replace function public.hr_carry_on_plan(p_slots int[])
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_carry_on_scope_ok(p_slots) then
    return public.hr_note_rejection('carry_on_plan', null, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if not public.hr_rpc_gate('hunt_read') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  return jsonb_build_object('ok', true) || public.hr_carry_on_plan_of(v_uid, p_slots);
end $fn$;
revoke execute on function public.hr_carry_on_plan(int[]) from public, anon, service_role;
grant  execute on function public.hr_carry_on_plan(int[]) to authenticated;

create or replace function public.hr_carry_on(p_slots int[], p_gold bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb  constant text := 'carry_on';
  v_uid   uuid := auth.uid();
  v_r     jsonb;
  v_plan  jsonb;
  v_h     jsonb;
  v_x     jsonb;
  v_slot  int;
  v_id    uuid;
  v_cap   int;
  v_moved boolean;
  v_bag   jsonb;
  v_loot  jsonb;
  v_paid  jsonb;
  v_took  jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_went  int := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, null, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if not public.hr_carry_on_scope_ok(p_slots) then
    return public.hr_note_rejection(c_verb, null, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_gold is null or p_gold < 0 or p_gold > 1000000000 then
    return public.hr_note_rejection(c_verb, null, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  v_r := public.hr_intent_replay(v_uid, null, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, null, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;

  -- THE LOCKS: every party a go hero sits in, then each go hero, then the account's Storage (hr_bank_move's key). The doors below take
  -- the same rows again (held) and the purse and play locks after them.
  v_plan := public.hr_carry_on_plan_of(v_uid, p_slots);
  for v_id in select distinct public.hr_hunt_party_of(v_uid, (h->>'slot')::int) as p
                from jsonb_array_elements(v_plan->'heroes') h where h->>'state' = 'go' order by 1 loop
    continue when v_id is null;
    perform 1 from public.hunt_parties where id = v_id for update;
  end loop;
  for v_slot in select (h->>'slot')::int as s from jsonb_array_elements(v_plan->'heroes') h where h->>'state' = 'go' order by 1 loop
    perform public.hr_hunt_lock(v_uid, v_slot);
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));
  -- ...the key again under them: a press racing this one on its key has committed by now.
  v_r := public.hr_intent_replay(v_uid, null, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, null, v_r); end if;

  -- THE PLAN UNDER THE LOCKS, and the gold the player was shown for it.
  v_plan := public.hr_carry_on_plan_of(v_uid, p_slots);
  if (v_plan->>'gold')::bigint is distinct from p_gold then
    return public.hr_note_rejection(c_verb, null, jsonb_build_object('ok', false, 'error', 'quote_changed', 'plan', v_plan)); end if;
  if coalesce((v_plan->>'go')::int, 0) = 0 then
    return public.hr_note_rejection(c_verb, null, jsonb_build_object('ok', false, 'error', 'nothing_to_carry_on', 'plan', v_plan)); end if;

  for v_h in select h from jsonb_array_elements(v_plan->'heroes') h order by (h->>'slot')::int loop
    if v_h->>'state' is distinct from 'go' then v_out := v_out || jsonb_build_array(v_h); continue; end if;
    v_slot := (v_h->>'slot')::int;
    v_loot := null; v_paid := null; v_took := '[]'::jsonb;
    begin
      -- (1) LOOT BY PLAN: the hero's own Dispatch, best effort.
      if coalesce((v_h->>'loot')::boolean, false) then
        v_x := public.hr_loot_dispatch(v_slot, md5(p_idem::text || ':carry_on:loot:' || v_slot)::uuid);
        if coalesce(v_x->>'ok', '') = 'true' then
          v_loot := jsonb_build_object('sold', coalesce((v_x->'sold'->>'gold')::bigint, 0), 'stored', coalesce((v_x->'stored'->>'stacks')::int, 0));
        end if;
      end if;
      -- (2) TAMSIN: what is done and due is paid, a Repeat task taken again.
      v_x := public.hr_tally_claim(v_uid, v_slot, null);
      if jsonb_array_length(coalesce(v_x->'paid', '[]'::jsonb)) > 0 then v_paid := v_x->'paid'; end if;
      -- (3) BLESSINGS, tier by tier at the planned price.
      for v_x in select e from jsonb_array_elements(coalesce(v_h->'bless', '[]'::jsonb)) e order by (e->>'tier')::int loop
        v_r := public.hr_blessing_buy(v_slot, (v_x->>'tier')::int, (v_x->>'price')::bigint,
                                      md5(p_idem::text || ':carry_on:bless:' || v_slot || ':' || (v_x->>'tier'))::uuid);
        if coalesce(v_r->>'ok', '') <> 'true' then raise exception using errcode = 'HRC70', message = coalesce(v_r->>'error', 'refused'); end if;
      end loop;
      -- (4) STORAGE FIRST, line by line; a line the bag has no room for is skipped (the store tops it up in the hunt).
      select ps.bank_cap into v_cap from public.player_state ps where ps.user_id = v_uid and ps.slot = v_slot;
      v_moved := false;
      for v_x in select e from jsonb_array_elements(coalesce(v_h->'storage', '[]'::jsonb)) e loop
        if public.hr_bank_move_stack(v_uid, v_slot, v_x->>'item', (v_x->>'qty')::bigint, 'withdraw', v_cap) is null then
          v_moved := true; v_took := v_took || jsonb_build_array(v_x);
        end if;
      end loop;
      if v_moved then update public.player_state set version = version + 1, updated_at = now() where user_id = v_uid and slot = v_slot; end if;
      -- (5) HUNT AGAIN through the door every start uses: the last hunt's lines, each at most what the bag holds now.
      select coalesce(jsonb_agg(jsonb_build_object('item', b.item_id, 'qty', least(b.qty_loaded, pi.qty), 'essential', b.essential)
                                order by b.essential desc, b.item_id), '[]'::jsonb)
        into v_bag
        from public.hunt_bag b
        join public.player_inventory pi on pi.user_id = v_uid and pi.slot = v_slot and pi.item_id = b.item_id and pi.qty > 0
       where b.session_id = (v_h->>'session')::uuid and b.qty_loaded > 0;
      v_r := public.hr_hunt_enter_for(v_uid, v_slot, v_h->>'hunt', v_bag, (v_h->>'preset')::int, (v_h->>'hours')::int);
      if coalesce(v_r->>'ok', '') <> 'true' then raise exception using errcode = 'HRC70', message = coalesce(v_r->>'error', 'refused'); end if;
      v_went := v_went + 1;
      v_out := v_out || jsonb_build_array(jsonb_strip_nulls(v_h || jsonb_build_object('state', 'went', 'went_session', v_r->'session_id',
                 'storage', v_took, 'loot_done', v_loot, 'tally_paid', v_paid)));
    exception when sqlstate 'HRC70' then
      v_out := v_out || jsonb_build_array(jsonb_strip_nulls((v_h - 'storage' - 'short') || jsonb_build_object('state', 'no', 'why', sqlerrm)));
    end;
  end loop;

  v_r := jsonb_build_object('ok', true, 'went', v_went, 'gold', p_gold, 'heroes', v_out);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, coalesce((select min((h->>'slot')::int) from jsonb_array_elements(v_out) h), 0), c_verb, v_r, now())
    on conflict (user_id, intent_id) do nothing;
  -- THE ENVELOPES (rule 11, tests/write-answers-state.mjs): every hero the press touched, as it left them, keyed by slot, so the client
  -- applies each with no second read (one projection a hero either way, one round trip fewer each); the receipt carries none.
  return v_r || jsonb_build_object('envelopes', coalesce((select jsonb_object_agg(h->>'slot', public.hr_state_of(v_uid, (h->>'slot')::int))
    from jsonb_array_elements(v_out) h where h->>'state' in ('went', 'no')), '{}'::jsonb));
end $fn$;
revoke execute on function public.hr_carry_on(int[], bigint, uuid) from public, anon, service_role;
grant  execute on function public.hr_carry_on(int[], bigint, uuid) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_carry_on(int[], bigint, uuid) from hr_engine;
    revoke all on function public.hr_carry_on_plan(int[]) from hr_engine;
    revoke all on function public.hr_carry_on_plan_of(uuid, int[]) from hr_engine;
    revoke all on function public.hr_carry_on_scope_ok(int[]) from hr_engine;
  end if;
end $$;

-- ── §3 THE CLIENT SURFACE ────────────────────────────────────────────────────
-- Its own two rows only, by their arguments: 1051-company-start.sql's four-argument press keeps its row when an operator retries this file.
delete from public.hr_client_rpc_baseline where grantee = 'authenticated'
  and (proname, identity_args) in (('hr_carry_on', 'p_slots integer[], p_gold bigint, p_idem uuid'), ('hr_carry_on_plan', 'p_slots integer[]'));
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_carry_on', 'p_slots integer[], p_gold bigint, p_idem uuid', 'authenticated',
   'added 1024-carry-on (lane/c-carry-on): ONE press sends the caller''s own heroes back to their last hunt through the existing doors (loot dispatch, Tamsin, Blessings at the planned price, Storage first, hr_hunt_enter_for); p_gold only refuses (quote_changed); refuses nothing_to_carry_on'),
  ('hr_carry_on_plan', 'p_slots integer[]', 'authenticated',
   'added 1024-carry-on (lane/c-carry-on): READ ONLY, what that press would do for each of the caller''s own heroes, and the Blessings gold it would spend');

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) two heroes of one account hunted the Mill Cellar, ate from their bags, and their hunts ended (stamina); Storage holds food: the plan
--     reads both go, each topped up from Storage to its loaded count, the second from what the first leaves, Blessings 0 gold, and the
--     read moves nothing
-- (b) the press with that gold: both went on the Cellar, each with its loaded line as far as Storage reached, Storage emptied, one
--     bank_withdraw journal row a hero
-- (c) the same key again answers the same receipt and starts nothing more; a new key finds both busy: nothing_to_carry_on
-- (d) both home again, the second hero out of stamina: it is named no_stamina and its Storage is not touched, the first still goes
-- (e) a gold figure other than the plan's refuses quote_changed and moves nothing
-- (f) a hero left by hand stays parked on the whole-account press and goes when its slot is named
-- (g) the grants: authenticated only for the two verbs, owner-only helpers, the baseline rows, grant hygiene
-- Every session of one transaction is entered at the same now(): each phase moves the ended ones an hour back, so the newest is the newest.
do $chk$
declare
  v_u    constant uuid := '000000c0-0000-4000-a000-0000ca770001';
  k      constant text := '000000c0-0000-4000-a000-0000ca77d';
  c_food constant text := 'cooked_shrimp';
  c_hunt constant text := 'mill_cellar';
  v jsonb; v2 jsonb; v_plan jsonb; v_s0 uuid; v_s1 uuid; v_n int;
begin
  if not exists (select 1 from public.hr_hunt_grounds where hunt_id = c_hunt) or not exists (select 1 from public.hr_hunt_supplies where item_id = c_food) then
    raise exception 'carry-on §4: the Mill Cellar or its food is not in the catalogue'; end if;
  begin
    update public.hr_hunt_config set enabled = true where id;
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Carry') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'carry-on §4 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'carry-on §4: hr_create_character(0) refused: %', v; end if;
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
      values (v_u, 0, 'flag', 'character_slot:1', 1, '', null, now()) on conflict do nothing;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'carry-on §4: hr_create_character(1) refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u;
    delete from public.player_inventory where user_id = v_u;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, c_food, 20), (v_u, 1, c_food, 20);
    insert into public.account_bank (user_id, item_id, qty, updated_at) values (v_u, c_food, 25, now())
      on conflict (user_id, item_id) do update set qty = 25;
    -- (a) both hunt, eat 15 of 20, and come home on their own
    foreach v_n in array array[0, 1] loop
      delete from public.hr_rate_counters where user_id = v_u;
      v := public.hr_hunt_enter(v_n, c_hunt, jsonb_build_array(jsonb_build_object('item', c_food, 'qty', 20)), 0, null, (k || '00' || v_n)::uuid);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'carry-on §4(a): hero % could not enter: %', v_n, v; end if;
    end loop;
    update public.hunt_bag set qty_left = 5 where user_id = v_u;
    perform public.hr_hunt_close(h.id, 'stamina', now(), true) from public.hunt_sessions h where h.user_id = v_u and h.ended_at is null;
    update public.hunt_sessions set entered_at = entered_at - interval '1 hour' where user_id = v_u and ended_at is not null;
    delete from public.hr_rate_counters where user_id = v_u;
    v_plan := public.hr_carry_on_plan(null);
    if v_plan->>'ok' is distinct from 'true' or (v_plan->>'go')::int is distinct from 2 or (v_plan->>'gold')::bigint is distinct from 0
       or v_plan->'heroes'->0->>'state' is distinct from 'go' or v_plan->'heroes'->0->>'hunt' is distinct from c_hunt
       or v_plan->'heroes'->0->'storage' is distinct from jsonb_build_array(jsonb_build_object('item', c_food, 'qty', 15))
       or v_plan->'heroes'->1->'storage' is distinct from jsonb_build_array(jsonb_build_object('item', c_food, 'qty', 10))
       or v_plan->'heroes'->1->'short' is distinct from jsonb_build_array(jsonb_build_object('item', c_food, 'qty', 5)) then
      raise exception 'carry-on §4(a): the plan reads %', v_plan; end if;
    if (select qty from public.account_bank where user_id = v_u and item_id = c_food) is distinct from 25::bigint then
      raise exception 'carry-on §4(a): the plan read moved Storage'; end if;
    -- (b) the press
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_carry_on(null, 0, (k || '010')::uuid);
    if v->>'ok' is distinct from 'true' or (v->>'went')::int is distinct from 2 then raise exception 'carry-on §4(b): the press answered %', v; end if;
    select id into v_s0 from public.hunt_sessions where user_id = v_u and slot = 0 and ended_at is null;
    select id into v_s1 from public.hunt_sessions where user_id = v_u and slot = 1 and ended_at is null;
    if v_s0 is null or v_s1 is null
       or (select hunt_id from public.hunt_sessions where id = v_s0) is distinct from c_hunt
       or (select qty_loaded from public.hunt_bag where session_id = v_s0 and item_id = c_food) is distinct from 20::bigint
       or (select qty_loaded from public.hunt_bag where session_id = v_s1 and item_id = c_food) is distinct from 15::bigint then
      raise exception 'carry-on §4(b): the heroes went on % / %, bags %', v_s0, v_s1,
        (select jsonb_agg(jsonb_build_object('s', b.session_id, 'q', b.qty_loaded)) from public.hunt_bag b join public.hunt_sessions h on h.id = b.session_id
          where h.user_id = v_u and h.ended_at is null); end if;
    if exists (select 1 from public.account_bank where user_id = v_u and item_id = c_food) then
      raise exception 'carry-on §4(b): Storage kept %', (select qty from public.account_bank where user_id = v_u and item_id = c_food); end if;
    if (select count(*) from public.player_ledger where user_id = v_u and kind = 'bank' and intent = 'bank_withdraw' and item_id = c_food) <> 2 then
      raise exception 'carry-on §4(b): the withdraws were not journalled one a hero'; end if;
    -- (c) the same key, then a new one
    delete from public.hr_rate_counters where user_id = v_u;
    -- (b') the answer carries both heroes as the press left them (rule 11): their envelopes, each hunting
    if jsonb_typeof(v->'envelopes'->'0'->'state') is distinct from 'object' or jsonb_typeof(v->'envelopes'->'1'->'state') is distinct from 'object'
       or (v->'envelopes'->'0'->>'version') is null or jsonb_typeof(v->'envelopes'->'0'->'hunt') is distinct from 'object' then
      raise exception 'carry-on §4(b): the press carried no envelope of a hero it sent: %',
        (select string_agg(x, ',') from jsonb_object_keys(coalesce(v->'envelopes', '{}'::jsonb)) x); end if;
    v2 := public.hr_carry_on(null, 0, (k || '010')::uuid);
    if v2 is distinct from (v - 'envelopes') or (select count(*) from public.hunt_sessions where user_id = v_u) <> 4 then
      raise exception 'carry-on §4(c): the same key again answered % (sessions %)', v2, (select count(*) from public.hunt_sessions where user_id = v_u); end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v2 := public.hr_carry_on(null, 0, (k || '011')::uuid);
    if v2->>'error' is distinct from 'nothing_to_carry_on' or (select count(*) from public.hunt_sessions where user_id = v_u) <> 4 then
      raise exception 'carry-on §4(c): a second press answered %', v2; end if;
    -- (d) home again with nothing in the bag; the second hero has no stamina; Storage has 40
    perform public.hr_hunt_close(h.id, 'stamina', now(), true) from public.hunt_sessions h where h.user_id = v_u and h.ended_at is null;
    update public.hunt_sessions set entered_at = entered_at - interval '1 hour' where user_id = v_u and ended_at is not null;
    delete from public.player_inventory where user_id = v_u and item_id = c_food;
    update public.player_state set stamina_ms = 0, stamina_at = now() where user_id = v_u and slot = 1;
    insert into public.account_bank (user_id, item_id, qty, updated_at) values (v_u, c_food, 40, now())
      on conflict (user_id, item_id) do update set qty = 40;
    delete from public.hr_rate_counters where user_id = v_u;
    v_plan := public.hr_carry_on_plan(null);
    if v_plan->'heroes'->1->>'state' is distinct from 'no' or v_plan->'heroes'->1->>'why' is distinct from 'no_stamina'
       or (v_plan->>'go')::int is distinct from 1 then
      raise exception 'carry-on §4(d): the plan reads %', v_plan; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_carry_on(null, 0, (k || '020')::uuid);
    if (v->>'went')::int is distinct from 1 or v->'heroes'->1->>'why' is distinct from 'no_stamina'
       or not exists (select 1 from public.hunt_sessions where user_id = v_u and slot = 0 and ended_at is null)
       or exists (select 1 from public.hunt_sessions where user_id = v_u and slot = 1 and ended_at is null)
       or (select qty from public.account_bank where user_id = v_u and item_id = c_food) is distinct from 20::bigint
       or exists (select 1 from public.player_inventory where user_id = v_u and slot = 1 and item_id = c_food) then
      raise exception 'carry-on §4(d): the press answered % (Storage %)', v, (select qty from public.account_bank where user_id = v_u and item_id = c_food); end if;
    -- (e) a gold figure that is not the plan's
    perform public.hr_hunt_close(h.id, 'stamina', now(), true) from public.hunt_sessions h where h.user_id = v_u and h.ended_at is null;
    update public.hunt_sessions set entered_at = entered_at - interval '1 hour' where user_id = v_u and ended_at is not null;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_carry_on(null, 1, (k || '030')::uuid);
    if v->>'error' is distinct from 'quote_changed' or exists (select 1 from public.hunt_sessions where user_id = v_u and ended_at is null)
       or (select qty from public.account_bank where user_id = v_u and item_id = c_food) is distinct from 20::bigint then
      raise exception 'carry-on §4(e): another gold figure answered %', v; end if;
    -- (f) the first hero's last hunt ended by the player's own hand
    update public.hunt_sessions set end_reason = 'left'
     where user_id = v_u and id = (select h.id from public.hunt_sessions h where h.user_id = v_u and h.slot = 0 order by h.entered_at desc, h.id limit 1);
    delete from public.hr_rate_counters where user_id = v_u;
    v_plan := public.hr_carry_on_plan(null);
    if v_plan->'heroes'->0->>'state' is distinct from 'parked' then raise exception 'carry-on §4(f): a hero left by hand reads %', v_plan->'heroes'->0; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v_plan := public.hr_carry_on_plan(array[0]);
    if v_plan->'heroes'->0->>'state' is distinct from 'go' or jsonb_array_length(v_plan->'heroes') <> 1 then
      raise exception 'carry-on §4(f): named, it reads %', v_plan; end if;
    raise exception using errcode = 'HRC74', message = 'carry-on §4 complete - rolling back';
  exception when sqlstate 'HRC74' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.hunt_sessions where user_id = v_u)
     or exists (select 1 from public.account_bank where user_id = v_u) or exists (select 1 from auth.users where id = v_u) then
    raise exception 'carry-on §4: a probe row leaked'; end if;
  -- (g)
  if has_function_privilege('anon', 'public.hr_carry_on(integer[],bigint,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_carry_on(integer[],bigint,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_carry_on(integer[],bigint,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_carry_on_plan(integer[])', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_carry_on_plan(integer[])', 'execute')
     or has_function_privilege('authenticated', 'public.hr_carry_on_plan_of(uuid,integer[])', 'execute')
     or has_function_privilege('authenticated', 'public.hr_carry_on_scope_ok(integer[])', 'execute') then
    raise exception 'carry-on §4(g): a grant is wrong'; end if;
  if (select count(*) from public.hr_client_rpc_baseline where grantee = 'authenticated'
        and (proname, identity_args) in (('hr_carry_on', 'p_slots integer[], p_gold bigint, p_idem uuid'), ('hr_carry_on_plan', 'p_slots integer[]'))) <> 2 then
    raise exception 'carry-on §4(g): the client baseline rows are missing'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'carry-on §4 OK: the plan, Storage first and shared in order, both went, the key answers once, a second press starts nothing, no stamina named and untouched, the gold figure refuses, a hand stop stays parked, the grants';
end $chk$;
