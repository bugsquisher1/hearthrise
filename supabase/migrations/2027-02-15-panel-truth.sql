-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-15-panel-truth.sql — TWO PLACES THE SERVER DID SOMETHING THE SCREEN NEVER SAID
-- (player panel 2026-11-01, lane/a-panel-truth, systems-engineer). STAGED: tools/apply-migration.mjs,
-- one file, never inside begin/commit, never 00:00-00:10 UTC. Reproduced on tools/qa/local-world.mjs.
--
-- §1 TAMSIN PAYS WHAT HER BOARD SAYS. hr_tally_pick is read twice: for her board's line, and again by
--    hr_tally_claim at payment. It skipped a piece the hero carried or wore, so a hunt that dropped the
--    promised piece moved the payment to the next piece or, with none left, to materials: board "480 gp
--    + a Bronze Platebody", paid "480 gp and 5 Raw Wolf Meat". Her window has always said "a piece she
--    hasn't given you", and now that alone decides. A found piece no longer moves the pick; hero_tally_given
--    keeps every piece to once per hero, forever. NO NEW MINT: still one piece or materials per claim,
--    still at most paid_per_day claims, and the given rows bound a hero to one of each piece as before
--    (before this file, selling a found piece made it payable once too).
--
-- §2 A HUNT'S END NEVER RESTARTS A BENCH. hr_last_activity_note remembers the last pointer for ever, and
--    an automatic end (stamina, death, no_fight...) pointed the hero back at it with no count (active_left
--    is not restored), so one "Fuel all 15" pressed before an 11 h hunt burned that hunt's 1,954 Bones in
--    town after the stamina end, and "Make 1" would have become "make until the ore is gone". A bench spends
--    what the player owns, in an amount the player chose for the stack of that moment. Gathering spends
--    nothing and keeps resuming (Tyler 2026-10-14). The clause in hr_hunt_apply_member step (7) asks this
--    helper, so only the helper moves: no settle body is restated. Its name outlives its meaning; renaming it
--    would restate hr_hunt_apply_member for a word.
--
-- CLIENT: the board's words and src/data/how-to-play ride the next release, after this file (they say a found
-- piece does not move her pick). Until this applies they read as today's did. EDGE: none. No table, no row
-- of any character changes; the catalogue is untouched. REVERSIBLE: re-apply the two pre-images below.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PINS: FAIL CLOSED IF ANOTHER FILE MOVED EITHER BODY ──────────────────
do $mig$
declare v_md5 text; r record;
begin
  for r in select * from (values
    ('public.hr_tally_pick(uuid,integer,text)', '1bbc4966ded0167c2bf66bb4c6fa39d6', '47c265f6d101a7720f83e59073968841', '2026-12-23-tally-tasks.sql'),
    ('public.hr_resume_has_inputs(uuid,integer,text,text)', 'aa41bbd819d4ec3ad68adf855466444e', '8956066872c1d7ea186d98f89c855d9c', '2027-01-24-skills-from-storage.sql')
  ) p(sig, pre, post, src) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PIN: % is missing', r.sig; end if;
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither %''s image (%) nor this file''s (%) - md5 %: another file moved it; restate from the new image',
        r.sig, r.src, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 HER PICK DEPENDS ONLY ON WHAT SHE HAS GIVEN ──────────────────────────
create or replace function public.hr_tally_pick(p_user uuid, p_slot integer, p_task text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare v_t public.hr_tally_tasks%rowtype; v_w text; v_order text[]; v_item text; v_n bigint; v_len bigint; v_m record;
begin
  -- TALLY (2026-12-23-tally-tasks.sql). PANEL-TRUTH (2027-02-15-panel-truth.sql): a piece the hero found does not move it.
  select * into v_t from public.hr_tally_tasks where task_id = p_task;
  if not found then return null; end if;
  select h.weight, coalesce(nullif(h.slot_order, '{}'::text[]), c.slot_order) into v_w, v_order
    from public.hr_tally_config c left join public.hero_tally h on h.user_id = p_user and h.slot = p_slot
   where c.only_row;
  if v_w is not null then
    select p.item_id into v_item from public.hr_tally_pieces p
     where p.hunt_id = v_t.hunt_id and p.weight = v_w
       and not exists (select 1 from public.hero_tally_given g where g.user_id = p_user and g.slot = p_slot and g.item_id = p.item_id)
     order by coalesce(array_position(v_order, p.equip_slot), 99), p.tier desc, p.item_id
     limit 1;
    if v_item is not null then return jsonb_build_object('pick', 'piece', 'item', v_item, 'qty', 1); end if;
  end if;
  select count(*) into v_len from public.hr_tally_materials m where m.task_id = p_task;
  if v_len = 0 then return null; end if;
  select count(*) into v_n from public.hero_tally_claims k
   where k.user_id = p_user and k.slot = p_slot and k.task_id = p_task and k.pick = 'material';
  select m.item_id, m.qty into v_m from public.hr_tally_materials m where m.task_id = p_task order by m.ord offset (v_n % v_len) limit 1;
  return jsonb_build_object('pick', 'material', 'item', v_m.item_id, 'qty', v_m.qty);
end $$;
revoke all on function public.hr_tally_pick(uuid, integer, text) from public, anon, authenticated, service_role;

-- ── §2 NO BENCH RESUMES ─────────────────────────────────────────────────────
create or replace function public.hr_resume_has_inputs(p_user uuid, p_slot integer, p_kind text, p_id text)
returns boolean language sql stable set search_path = public, pg_catalog as $$
  -- PANEL-TRUTH (2027-02-15-panel-truth.sql): false for every bench, whatever it holds: a resume has no count and would
  -- spend a whole hunt's loot unasked. True for what spends nothing (gathering, and the reserved `training`).
  select p_kind is distinct from 'artisan'
$$;
revoke all on function public.hr_resume_has_inputs(uuid, integer, text, text) from public, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_resume_has_inputs(uuid, integer, text, text) from hr_engine; end if;
end $$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ─────
-- Fails on the pre-images: (b) they move the pick to the next piece when the piece is carried; (c) they answer true
-- for a bench holding its inputs. The end-to-end paths, the hunt viewed and the browser closed, are
-- tests/hunt-sessions-settle.mjs RESUME and tests/tally-tasks.mjs TT-6 on the replayed chain.
do $$
declare
  c_u    constant uuid := '000000d5-0000-4000-a000-00007f0c0215';
  v      jsonb;
  v2     jsonb;
  v_sig  text;
  v_task text;
  v_w    text;
  v_bench text;
  v_in   jsonb;
begin
  -- (a) THE SHAPE: neither body is reachable by a client, and the helper keeps its pinned search_path.
  foreach v_sig in array array['hr_tally_pick(uuid,integer,text)', 'hr_resume_has_inputs(uuid,integer,text,text)'] loop
    if has_function_privilege('anon', ('public.' || v_sig)::regprocedure, 'execute')
       or has_function_privilege('authenticated', ('public.' || v_sig)::regprocedure, 'execute') then
      raise exception 'panel-truth §4(a): % is reachable by a client', v_sig; end if;
  end loop;
  if not exists (select 1 from pg_proc p where p.oid = 'public.hr_resume_has_inputs(uuid,integer,text,text)'::regprocedure
                  and p.proconfig @> array['search_path=public, pg_catalog']) then
    raise exception 'panel-truth §4(a): hr_resume_has_inputs has no pinned search_path'; end if;

  begin
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'panel-truth §4 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'panel-truth §4-harness: hr_create_character refused: %', v; end if;

    -- (b) THE BOARD'S PIECE IS THE PAYMENT'S PIECE: carrying it moves nothing; only her giving it does.
    select t.task_id, p.weight into v_task, v_w from public.hr_tally_tasks t join public.hr_tally_pieces p on p.hunt_id = t.hunt_id
     order by t.ord, p.weight limit 1;
    if v_task is null then raise exception 'panel-truth §4-harness: no task has a piece'; end if;
    insert into public.hero_tally (user_id, slot, weight) values (c_u, 0, v_w)
      on conflict (user_id, slot) do update set weight = excluded.weight;
    v := public.hr_tally_pick(c_u, 0, v_task);
    if v->>'pick' is distinct from 'piece' then raise exception 'panel-truth §4(b): the probe''s first pick is %', v; end if;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty) values (c_u, 0, v->>'item', 1)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;
    v2 := public.hr_tally_pick(c_u, 0, v_task);
    if v2 is distinct from v then raise exception 'panel-truth §4(b): carrying % moved her pick to %', v->>'item', v2; end if;
    insert into public.hero_tally_given (user_id, slot, item_id, task_id, claim_id) values (c_u, 0, v->>'item', v_task, gen_random_uuid());
    v2 := public.hr_tally_pick(c_u, 0, v_task);
    if v2 is not distinct from v then raise exception 'panel-truth §4(b): a given piece % came again', v->>'item'; end if;

    -- (c) A STOCKED BENCH DOES NOT RESUME; WHAT SPENDS NOTHING STILL DOES.
    select b.key, b.value into v_bench, v_in from jsonb_each(public.hr_bench_inputs()) b
     where exists (select 1 from public.hr_activities a where a.kind = 'artisan' and a.activity_id = b.key)
     order by b.key limit 1;
    if v_bench is null then raise exception 'panel-truth §4-harness: no bench consumes anything'; end if;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      select c_u, 0, i.key, (i.value #>> '{}')::bigint from jsonb_each(v_in) i
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
    if public.hr_resume_has_inputs(c_u, 0, 'artisan', v_bench) then
      raise exception 'panel-truth §4(c): the stocked bench % resumes', v_bench; end if;
    if not public.hr_resume_has_inputs(c_u, 0, 'gather', 'anything') then
      raise exception 'panel-truth §4(c): gathering no longer resumes'; end if;
    raise exception using errcode = 'HRP15', message = 'panel-truth §4 complete - rolling back';
  exception when sqlstate 'HRP15' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id = c_u) then raise exception 'panel-truth §4: LEAKED a probe row'; end if;
  raise notice 'panel-truth: her board''s piece is what she pays, carried or not; no bench resumes, gathering does; all green';
end $$;
