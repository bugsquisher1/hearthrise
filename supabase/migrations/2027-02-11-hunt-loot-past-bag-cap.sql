-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — A FULL BAG NEVER STOPS A HUNT (lane a-party-soak, qa-engineer, 2026-10-31).
-- STAGED. Pre-EA (CLAUDE.md §2): applies on its passing §3, one file via the Coordinator's
-- apply tool, never inside begin/commit, never 00:00–00:10 UTC. On the EA Security list (hr_apply).
-- DB-ONLY: no hr-accrue change (pack-edge --hash unmoved by this file), no client change.
-- RESTATEMENT-DEBT-ACK: hr_apply (the economy's single write path, 155k chars) takes ONE anchored edit in §1, a stamp read at the stack fuse; restating the whole body to change one condition risks more than the splice its §0 and §2 pins hold. This line was added after the apply (patch-chain-guard, run 41226511232): no body moved.
--
-- ── ROOT CAUSE ──────────────────────────────────────────────────────────────
-- hr_apply's stack fuse (player_state.bank_cap, 100 kinds) refuses `bank_full` when a delta takes the
-- bag past the cap. A hunt's settle is such a delta, and the engine cannot shrink a kill: the halved
-- windows of the degrade ladder walk up to the swing that drops the new kind and stop there, so every
-- fire is refused, the seat's sixth refusal in a row forfeits it (window_forfeit, end `server`) and
-- every later hunt of that hero dies the same way within two minutes of its next new kind.
-- MEASURED (tools/qa/local-world.mjs, four own heroes, no selling, every open ground in turn): the
-- heroes reached 100 kinds after 33 hunting hours, then 137 forfeits in the next 6, all `bank_full`.
-- 2027-02-11-bag-over-cap.sql (APPLIED 06:12 UTC 10-31) fixed the wedge ABOVE the cap and kept this
-- refusal on purpose for every delta (its table: 100 -> 101 refused). Production bags run 83-101 kinds.
--
-- ── THE FIX (the contract; one body, one anchored splice) ───────────────────
-- A delta under hr_hunt_apply_member (hr.hunt_session set, the settle's own stamp; the Level XP block
-- reads the same setting) is never refused for the stack cap: loot lands however many kinds the bag
-- holds. Every other delta keeps bag-over-cap's rule: town work and Storage stop at the cap.
--
-- ── DESIGN CALL (QA, for the game designer to overrule; no ruling covers a full bag) ──────
-- Nothing is ever lost at a full bag: the rulings say loot is credited on the server, moved by the
-- player in town (LOOT DESTINATION PLAN, Tyler 2026-10-25: "nothing moves at pickup"), and a hunt ends
-- only for END_ORDER's reasons, of which a full bag is not one. The bag's foot already draws used/cap
-- with its full mark (src/shell/windows/inventory/index.js patchFoot), so 112/100 reads as it is.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- hr.hunt_session is a transaction-local setting only hr_hunt_apply_member sets; hr_apply is granted
-- to hr_engine alone, and no client reaches either. Stacks past the cap cost nothing but rows
-- (bounded by the catalogue) and buy nothing. No value moves differently; no new grant, RPC or policy.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- Under hr_apply's character lock. No new lock, order or verb; intent keys untouched.
-- A second apply: §1's marker skips the splice and §2 re-pins (byte-identical).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Reverse the one anchor below on hr_apply (the §0 pre-image). No column, row or value moves.
-- ORDER: after 2027-02-11-settle-plan-cache-2.generated.sql. COST: none (one setting read at the fuse).
-- Proof: tests/hunt-sessions-settle.mjs BAG-CAP (both doors) + §3 below. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 THE PIN ──────────────────────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure;
  if v_md5 is null then raise exception 'PIN: hr_apply is missing'; end if;
  if v_md5 not in ('654377fe009b38619be46e84283a0a5e', '0c899a4a8ac29c95953f09081ef22aa0') then
    raise exception 'PIN: hr_apply is neither 2027-02-11-bag-over-cap.sql''s image nor this file''s - md5 %: another file moved it; re-pin', v_md5; end if;
end $mig$;

-- ── §1 THE ANCHORED SPLICE ──────────────────────────────────────────────────
do $mig$
declare
  v_def text; v_n int;
  c_a constant text := $a$      if v_stacks > v_st.bank_cap and v_stacks > v_stacks_before then$a$;
  c_r constant text := $a$      -- HUNT-LOOT-PAST-CAP (2027-02-11-hunt-loot-past-bag-cap.sql): no hunt stops or forfeits for a full bag
      -- (hr.hunt_session is hr_hunt_apply_member's own stamp); every other delta stops at the cap.
      if coalesce(current_setting('hr.hunt_session', true), '') = '' and v_stacks > v_st.bank_cap and v_stacks > v_stacks_before then$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if position('HUNT-LOOT-PAST-CAP' in v_def) > 0 then return; end if;
  v_n := (length(v_def) - length(replace(v_def, c_a, ''))) / length(c_a);
  if v_n <> 1 then raise exception 'hunt-loot-past-cap §1: hr_apply anchor matched % times (need 1): the body moved', v_n; end if;
  -- CREATE OR REPLACE keeps the function's grants.
  execute replace(v_def, c_a, c_r);
end $mig$;

-- ── §2 THE LANDED IMAGE ─────────────────────────────────────────────────────
do $mig$
begin
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure) <> '0c899a4a8ac29c95953f09081ef22aa0' then
    raise exception 'hunt-loot-past-cap §2: hr_apply landed as md5 %, not the post pin', (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure); end if;
end $mig$;

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- Fails on the pre-image: (c) refuses the hunt's new kind.
-- The engine-level proof, both doors (the tick = browser closed, the player's settle = hunt viewed), is
-- tests/hunt-sessions-settle.mjs BAG-CAP.
do $$
declare
  c_u    constant uuid := '000000d7-0000-4000-a000-0000ba9ca901';
  v      jsonb;
  v_ver  bigint;
  v_cap  int;
  v_hunt text;
  v_sid  uuid;
  v_keep text;
  v_new  text[];
begin
  begin
    update public.hr_hunt_config set enabled = true where id;
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'hunt-loot-past-cap §3 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'hunt-loot-past-cap §3-harness: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_u and slot = 0;
    select bank_cap into v_cap from public.player_state where user_id = c_u and slot = 0;
    select g.hunt_id into v_hunt from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id
     order by coalesce(h.band_min, 0), g.hunt_id limit 1;
    -- Four kinds the bag does not hold, then the bag filled to exactly its cap with other kinds.
    select array_agg(item_id) into v_new from (select i.item_id from public.hr_items i where i.item_id like '%\_ore' or i.item_id like 'raw\_%'
       order by i.item_id limit 4) x;
    delete from public.player_inventory where user_id = c_u and slot = 0;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      select c_u, 0, i.item_id, 5 from public.hr_items i where not (i.item_id = any (v_new)) order by i.item_id limit v_cap;
    if array_length(v_new, 1) <> 4 or (select count(*) from public.player_inventory where user_id = c_u and slot = 0) <> v_cap then
      raise exception 'hunt-loot-past-cap §3-harness: the bag is not at its cap'; end if;
    select item_id into v_keep from public.player_inventory where user_id = c_u and slot = 0 order by item_id limit 1;

    -- (a) AT THE CAP, IN TOWN: a new kind is refused; more of a kind held lands.
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    v := public.hr_apply(c_u, 0, v_ver, gen_random_uuid(), jsonb_build_object('items', jsonb_build_object(v_new[1], 1), 'journal', jsonb_build_object('kind', 'admin', 'intent', 'probe')));
    if v->>'error' is distinct from 'bank_full' then raise exception 'hunt-loot-past-cap §3(a): a new kind at the cap answered %', v; end if;
    v := public.hr_apply(c_u, 0, v_ver, gen_random_uuid(), jsonb_build_object('items', jsonb_build_object(v_keep, 1), 'journal', jsonb_build_object('kind', 'admin', 'intent', 'probe')));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hunt-loot-past-cap §3(a): more of a held kind at the cap answered %', v; end if;

    -- (b) OVER THE CAP (a hunt's pack handed back): a sale that leaves it still over lands; a new kind is still refused.
    insert into public.player_inventory (user_id, slot, item_id, qty)
      select c_u, 0, i.item_id, 5 from public.hr_items i
       where not (i.item_id = any (v_new)) and not exists (select 1 from public.player_inventory p where p.user_id = c_u and p.slot = 0 and p.item_id = i.item_id)
       order by i.item_id limit 3;
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    v := public.hr_apply(c_u, 0, v_ver, gen_random_uuid(), jsonb_build_object('items', jsonb_build_object(v_keep, -6), 'journal', jsonb_build_object('kind', 'admin', 'intent', 'probe')));
    if coalesce(v->>'ok', '') <> 'true' or (select count(*) from public.player_inventory where user_id = c_u and slot = 0) <> v_cap + 2 then
      raise exception 'hunt-loot-past-cap §3(b): a sale at an over-full bag answered %', v; end if;
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    v := public.hr_apply(c_u, 0, v_ver, gen_random_uuid(), jsonb_build_object('items', jsonb_build_object(v_new[1], 1), 'journal', jsonb_build_object('kind', 'admin', 'intent', 'probe')));
    if v->>'error' is distinct from 'bank_full' then raise exception 'hunt-loot-past-cap §3(b): a new kind past the cap answered %', v; end if;

    -- (c) A HUNT'S SETTLE (hr.hunt_session, hr_hunt_apply_member's own stamp): its loot lands past the cap, stamped.
    v := public.hr_hunt_enter_for(c_u, 0, v_hunt, '[]'::jsonb, 0, null);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hunt-loot-past-cap §3-harness: the enter refused: %', v; end if;
    v_sid := (v->>'session_id')::uuid;
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    perform set_config('hr.hunt_session', v_sid::text, true);
    v := public.hr_apply(c_u, 0, v_ver, gen_random_uuid(), jsonb_build_object('items', jsonb_build_object(v_new[2], 1), 'journal', jsonb_build_object('kind', 'admin', 'intent', 'probe')));
    perform set_config('hr.hunt_session', '', true);
    if coalesce(v->>'ok', '') <> 'true' or not exists (select 1 from public.player_inventory where user_id = c_u and slot = 0 and item_id = v_new[2]) then
      raise exception 'hunt-loot-past-cap §3(c): a hunt''s new kind past the cap answered %', v; end if;
    -- The stamp is the whole exemption: the same delta outside it is refused again.
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    v := public.hr_apply(c_u, 0, v_ver, gen_random_uuid(), jsonb_build_object('items', jsonb_build_object(v_new[3], 1), 'journal', jsonb_build_object('kind', 'admin', 'intent', 'probe')));
    if v->>'error' is distinct from 'bank_full' then raise exception 'hunt-loot-past-cap §3(c): outside the settle a new kind answered %', v; end if;
    raise exception 'hunt-loot-past-cap §3: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'hunt-loot-past-cap §3: ok' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform public.hr_assert_grant_hygiene(true);
  if has_function_privilege('anon', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute')
     or not has_function_privilege('hr_engine', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute') then
    raise exception 'hunt-loot-past-cap §3: a grant moved'; end if;
  raise notice 'hunt-loot-past-cap: a hunt''s loot lands past the cap, a sale always lands, town work stops at the cap; all green';
end $$;
