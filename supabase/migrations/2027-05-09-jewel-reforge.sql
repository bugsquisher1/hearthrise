-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-09-jewel-reforge.sql — THE JEWEL REFORGE: A HALLMARKED PIECE BECOMES THE NEXT TIER'S, KEEPING BOTH PERKS, FOR THE FEE DIFFERENCE
--   (lane/d-jewelry-sample, systems-engineer, 2026-11-18; Tyler 2026-11-18, second Fable review: "keep Hallmark fees PER PIECE and ADD jewel
--   reforging up a tier, and it must make SENSE to the player in the UI"; the designer's gate and price, docs/design/itemization-plan.md §4
--   "Jewel reforging": the new tier's metal, its gem, its Hallmark skill level, and gold = the new tier's fee less the old's).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §4; ON THE EA SECURITY LIST (a money surface: a gold sink, and an item made from gold that trades). EDGE: none here (the reforge
-- moves no hunt); the new rows ship in the hr-accrue bundle with the items catalogue. CLIENT: the Reforge rows in the Work window's jeweler
-- section ride the release AFTER this applies.
-- APPLY ORDER: after 2027-05-09-jewelry-sample-catalogue.generated.sql (hr_jewel_reforge_offers, the Hallmark offers' skills), which is after
-- 2027-05-09-jewelry-sample-items-catalogue.generated.sql (hr_items holds the rows).
--
-- ── THE VERB ─────────────────────────────────────────────────────────────────
-- hr_jewel_reforge(p_slot int, p_from text, p_to text, p_price bigint, p_idem uuid): this hero turns ONE Hallmarked piece into the row the
--   catalogue pairs it with, the next tier's Hallmarked piece with the SAME perks; nothing is rolled, nothing can fail once paid, nothing is
--   refunded. The hero's Level is never read (a reforged piece is worn by the tier's own rule). Every refusal answers BEFORE anything moves:
--     not_signed_in, bad_slot, bad_idem, bad_quote, unknown_reforge      a malformed call, or a pair the catalogue doesn't hold
--     rate_limited                                                       hr_rpc_gate('outfit')
--     no_character                                                       no hero in that slot
--     reforge_level {need, have, skill}                                  the hero's level in the new piece's skill (player_skills) is under the tier's
--     reforge_limit {limit}                                              this ACCOUNT made per_day reforges this UTC day (hr_hallmark_rule)
--     quote_changed {hallmark}                                           the gold the player saw isn't the catalogue's now
--     insufficient_item {item_id, have, need, bag, storage}              hr_materials_take's: the piece, the bars and the gem, bag then Storage
--     insufficient_gold, bank_full                                       hr_apply's
--   THE CHARGE: hr_materials_take takes the piece, the bars and the gem (bag first, then the account's Storage, all or nothing), then ONE
--   hr_apply { gold: -price, items: { to: +1 } } journalled kind shop, intent jewel_reforge:<to>:<price>:<from>, its meta naming every source.
--   A refusal after the take rolls the block back, so nothing is lost to a short purse or a full bag. A WORN piece is not in the bag: it
--   is not offered (the section lists held pieces only), and the take refuses it.
-- LOCK ORDER: the hero (hr_hunt_lock), hr:sink:<uid> (the day's count, hr_sink_lock), the depot and the bag/Storage rows (hr_materials_take),
--   the purse last (hr_apply): the Hallmark's order.
-- IDEMPOTENT: the key is re-read under the hero's lock, so a doubled press is one charge (hr_intent_replay before and after the lock).
--
-- ── THE SECTION `hallmark`, RESTATED ─────────────────────────────────────────
-- hr_hallmark_view(user, slot) from 2027-03-14-jewelry-hallmark.sql §2 + each offer's `skill` (the bench the step is taken at: Smithing for
--   every jewel since Tyler's 2026-11-18 ruling) + `reforges` [{ from, to, metal, bars, gem, gold, level, skill }] for each Hallmarked piece
--   this hero holds in its bag or the account's Storage + `reforged`, the account's reforges this UTC day. The day's limit is the one row.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- A gold sink: the fee never comes back (every grade keeps its plain piece's shop bid, and the new tier's bid is the new piece's). No
-- client number prices it or names what it makes: the pair must be a catalogue row and the price the catalogue's. The level is the
-- server's. A Hallmarked piece reforged costs exactly what a fresh Hallmark of the new tier would in fees (the old fee + the difference),
-- so reforging can't undercut the Hallmark step; it saves the Fine chase only (the plan's intent). The day limit bounds a bug's reach.
--
-- REVERSIBILITY: drop hr_jewel_reforge (+ its baseline row and GM door row); restate hr_hallmark_view from 2027-03-14-jewelry-hallmark.sql §2.
--   Items made stay made.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_jewel_reforge_offers') is null or not exists (select 1 from public.hr_jewel_reforge_offers) then
    raise exception 'PRECONDITION: apply 2027-05-09-jewelry-sample-catalogue.generated.sql first (hr_jewel_reforge_offers)'; end if;
  if to_regprocedure('public.hr_hallmark(integer,text,text,bigint,uuid)') is null or to_regprocedure('public.hr_hallmark_view(uuid,integer)') is null then
    raise exception 'PRECONDITION: apply 2027-03-14-jewelry-hallmark.sql first'; end if;
  if to_regprocedure('public.hr_materials_take(uuid,integer,jsonb,boolean)') is null or to_regprocedure('public.hr_sink_lock(uuid)') is null
     or to_regprocedure('public.hr_sink_bought_today(uuid,text,text[])') is null or to_regprocedure('public.hr_skill_level(text,bigint)') is null
     or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null then
    raise exception 'PRECONDITION: a seam this verb calls is missing (hr_materials_take, hr_sink_*, hr_skill_level, hr_intent_replay, hr_hunt_lock)'; end if;
  if exists (select 1 from public.hr_hallmark_offers where skill <> 'smithing' and skill <> 'crafting') then
    raise exception 'PRECONDITION: a Hallmark offer names a bench that is not Smithing or Crafting'; end if;
end $mig$;

-- ── §1 THE SECTION, RESTATED ─────────────────────────────────────────────────
-- plpgsql, not sql: the settle reads every section, and a sql function is re-planned on every call (tests/settle-budget.mjs SB-3).
create or replace function public.hr_hallmark_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare v jsonb; v_r jsonb; v_limit int; v_today int; v_reforged int;
begin
  select r.day_limit into v_limit from public.hr_hallmark_rule r where r.id;
  if v_limit is null then return null; end if;
  /* The account's counts today, hr_sink_bought_today's own read inlined here: that one is LANGUAGE sql with a SET clause, so the
     planner re-plans it on every call, and the settle reads this section every window (tests/settle-budget.mjs SB-3). One scan, two counts. */
  select count(*) filter (where split_part(l.intent, ':', 1) = 'hallmark')::int, count(*) filter (where split_part(l.intent, ':', 1) = 'jewel_reforge')::int
    into v_today, v_reforged
    from public.player_ledger l
   where l.user_id = p_user and l.slot = any (array[0, 1, 2, 3, 4, 5]) and l.at >= public.hr_utc_day_start(now()) and l.kind = 'shop'
     and split_part(l.intent, ':', 1) in ('hallmark', 'jewel_reforge');
  select coalesce(jsonb_agg(jsonb_build_object('from', o.from_item, 'to', o.to_item, 'perk', o.perk, 'gem', o.gem, 'gold', o.gold, 'level', o.level,
                                               'skill', o.skill)
           order by o.from_item, o.to_item), '[]'::jsonb)
    into v
    from public.hr_hallmark_offers o
   where exists (select 1 from public.player_inventory i where i.user_id = p_user and i.slot = p_slot and i.item_id = o.from_item)
      or exists (select 1 from public.account_bank b where b.user_id = p_user and b.item_id = o.from_item);
  select coalesce(jsonb_agg(jsonb_build_object('from', o.from_item, 'to', o.to_item, 'metal', o.metal, 'bars', o.bars, 'gem', o.gem, 'gold', o.gold,
                                               'level', o.level, 'skill', o.skill)
           order by o.from_item), '[]'::jsonb)
    into v_r
    from public.hr_jewel_reforge_offers o
   where exists (select 1 from public.player_inventory i where i.user_id = p_user and i.slot = p_slot and i.item_id = o.from_item)
      or exists (select 1 from public.account_bank b where b.user_id = p_user and b.item_id = o.from_item);
  return jsonb_build_object('offers', v, 'today', v_today, 'reforges', v_r, 'reforged', v_reforged, 'per_day', v_limit);
end $$;
revoke all on function public.hr_hallmark_view(uuid, int) from public, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then revoke all on function public.hr_hallmark_view(uuid, int) from hr_engine; end if;
end $$;
insert into public.hr_state_sections (key, fn, note) values
  ('hallmark', 'hr_hallmark_view', '2027-05-09-jewel-reforge.sql: the Hallmark step for each Fine piece and the reforge for each Hallmarked piece this hero holds, at the piece''s own bench, the account''s counts today and the day''s limit')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §2 THE VERB ──────────────────────────────────────────────────────────────
create or replace function public.hr_jewel_reforge(p_slot int, p_from text, p_to text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'jewel_reforge';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_o public.hr_jewel_reforge_offers%rowtype;
  v_lv int; v_today int; v_limit int; v_take jsonb; v_a jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_from is null or p_to is null or p_from !~ '^[a-z0-9_]{1,48}$' or p_to !~ '^[a-z0-9_]{1,48}$' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_reforge')); end if;
  if p_price is null or p_price < 1 or p_price > 1000000000 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  v_verb := c_verb || ':' || p_to || ':' || p_price || ':' || p_from;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  /* A doubled press waited on the lock above: its key is answered now, once the first committed. */
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select * into v_o from public.hr_jewel_reforge_offers o where o.from_item = p_from and o.to_item = p_to;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_reforge')); end if;
  v_lv := public.hr_skill_level(v_o.skill, coalesce((select k.xp from public.player_skills k where k.user_id = v_uid and k.slot = p_slot and k.skill_id = v_o.skill), 0));
  if v_lv < v_o.level then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'reforge_level', 'need', v_o.level, 'have', v_lv, 'skill', v_o.skill)); end if;
  perform public.hr_sink_lock(v_uid);
  select r.day_limit into v_limit from public.hr_hallmark_rule r where r.id;
  v_today := public.hr_sink_bought_today(v_uid, c_verb);
  if v_limit is null or v_today >= v_limit then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'reforge_limit', 'limit', v_limit)); end if;
  if v_o.gold <> p_price then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'hallmark', public.hr_hallmark_view(v_uid, p_slot))); end if;
  /* THE CHARGE, all or nothing: the piece, the bars and the gem, then the purse. A refusal after the take raises, and the block's rollback puts them back. */
  begin
    v_take := public.hr_materials_take(v_uid, p_slot, jsonb_build_object(v_o.from_item, 1, v_o.metal, v_o.bars, v_o.gem, 1), true);
    if coalesce(v_take->>'ok', 'false') <> 'true' then raise exception using errcode = 'HRJ01', message = 'jewel reforge: materials short'; end if;
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'gold', -p_price,
             'items', jsonb_build_object(v_o.to_item, 1),
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', c_verb, 'from', v_o.from_item, 'to', v_o.to_item, 'metal', v_o.metal,
                                                                      'bars', v_o.bars, 'gem', v_o.gem, 'level', v_lv, 'took', v_take->'from'))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then raise exception using errcode = 'HRJ02', message = 'jewel reforge: hr_apply refused'; end if;
  exception
    when sqlstate 'HRJ01' then return public.hr_note_rejection(c_verb, p_slot, v_take || jsonb_build_object('ok', false));
    when sqlstate 'HRJ02' then return public.hr_note_rejection(c_verb, p_slot, v_a || jsonb_build_object('ok', false));
  end;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -p_price, 'item', v_o.to_item, 'hallmark', public.hr_hallmark_view(v_uid, p_slot));
end $fn$;
revoke execute on function public.hr_jewel_reforge(int, text, text, bigint, uuid) from public, anon, service_role;
grant  execute on function public.hr_jewel_reforge(int, text, text, bigint, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_jewel_reforge';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_jewel_reforge', 'p_slot integer, p_from text, p_to text, p_price bigint, p_idem uuid', 'authenticated',
   'added 2027-05-07 (lane/d-jewelry-sample): MONEY (a gold sink) - a Hallmarked piece + the next tier''s metal and gem + the fee difference make that tier''s Hallmarked row with the same perks, at the hero''s server level in the new piece''s skill, ten an account a UTC day; refuses quote_changed; one key charges once');

-- ── §2b THE GAME MASTER'S DOOR (2027-03-13-gm-tools.sql: default deny) ──────────────────────────────────────
-- A reforge reaches no other player: the hero's own purse, bag and the account's own Storage, as the Hallmark.
do $mig$
begin
  if to_regclass('public.hr_gm_wall_allow') is not null then
    insert into public.hr_gm_wall_allow (rpc, why) values ('hr_jewel_reforge', 'its own purse, bag and Storage')
      on conflict (rpc) do update set why = excluded.why;
  end if;
end $mig$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED on a probe account, every probe rolled back ─────────────────────
do $mig$
declare
  v_u constant uuid := '00000000-0000-4000-c000-1e3e17a00002';
  k text := '00000000-0000-4000-c000-1e3e17a1';
  v_o public.hr_jewel_reforge_offers%rowtype; v_other public.hr_jewel_reforge_offers%rowtype;
  v jsonb; s jsonb; v_l jsonb; v_role text; v_need jsonb;
begin
  select * into v_o from public.hr_jewel_reforge_offers order by from_item limit 1;
  select * into v_other from public.hr_jewel_reforge_offers o where o.from_item <> v_o.from_item order by from_item limit 1;
  if v_other.from_item is null then raise exception 'jewel-reforge §4: the catalogue holds one reforge only, the probe needs two'; end if;
  /* THE PRICE IS THE FEE DIFFERENCE: the new tier's Hallmark fee less the old's, from the Hallmark table itself. */
  if v_o.gold <> (select h.gold from public.hr_hallmark_offers h where h.to_item = v_o.to_item limit 1) - (select h.gold from public.hr_hallmark_offers h where h.to_item = v_o.from_item limit 1) then
    raise exception 'jewel-reforge §4: % costs %, not the fee difference', v_o.from_item, v_o.gold; end if;
  v_need := jsonb_build_object(v_o.from_item, 1, v_o.metal, v_o.bars, v_o.gem, 1);
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'jewel-reforge §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'jewel-reforge §4: hr_create_character refused: %', v; end if;
    update public.account_wallet set gold = 1000000 where user_id = v_u;

    -- (a) THE SECTION: nothing held, no reforge; both counts and the day's limit; every Hallmark offer names its bench.
    s := public.hr_state_of(v_u, 0)->'hallmark';
    if s is null or jsonb_array_length(s->'reforges') <> 0 or (s->>'reforged')::int <> 0 or (s->>'today')::int <> 0
       or (s->>'per_day')::int <> (select day_limit from public.hr_hallmark_rule) then
      raise exception 'jewel-reforge §4(a): an empty bag reads %', s; end if;

    -- (b) UNDER THE TIER'S LEVEL IN THE NEW PIECE'S SKILL: refused with both numbers, nothing moves; the section offers the held piece only.
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_o.from_item, 1), (v_u, 0, v_o.metal, v_o.bars), (v_u, 0, v_o.gem, 1)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    s := public.hr_hallmark_view(v_u, 0);
    if jsonb_array_length(s->'reforges') <> 1 or s->'reforges'->0->>'to' is distinct from v_o.to_item or (s->'reforges'->0->>'gold')::bigint <> v_o.gold
       or (s->'reforges'->0->>'bars')::int <> v_o.bars or s->'reforges'->0->>'skill' is distinct from v_o.skill then
      raise exception 'jewel-reforge §4(b): holding % the section reads %', v_o.from_item, s; end if;
    v := public.hr_jewel_reforge(0, v_o.from_item, v_o.to_item, v_o.gold, (k || '0001')::uuid);
    if v->>'error' is distinct from 'reforge_level' or (v->>'need')::int <> v_o.level or (v->>'have')::int >= v_o.level or v->>'skill' is distinct from v_o.skill
       or (select gold from public.account_wallet where user_id = v_u) <> 1000000 then
      raise exception 'jewel-reforge §4(b): a low skill answered %', v; end if;

    -- (c) AT THE LEVEL: a pair the catalogue doesn't hold, and a stale price, are refused; nothing moves.
    insert into public.player_skills (user_id, slot, skill_id, xp) values (v_u, 0, v_o.skill, public.hr_skill_xp_for_level(v_o.skill, v_o.level))
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    v := public.hr_jewel_reforge(0, v_o.from_item, v_other.to_item, v_o.gold, (k || '0002')::uuid);
    if v->>'error' is distinct from 'unknown_reforge' then raise exception 'jewel-reforge §4(c): an unpaired reforge answered %', v; end if;
    v := public.hr_jewel_reforge(0, v_o.from_item, v_o.to_item, v_o.gold - 1, (k || '0003')::uuid);
    if v->>'error' is distinct from 'quote_changed' or v->'hallmark' is null then raise exception 'jewel-reforge §4(c): a stale price answered %', v; end if;

    -- (d) ONE BAR SHORT: refused, the purse and every input untouched.
    update public.player_inventory set qty = v_o.bars - 1 where user_id = v_u and slot = 0 and item_id = v_o.metal;
    v := public.hr_jewel_reforge(0, v_o.from_item, v_o.to_item, v_o.gold, (k || '0004')::uuid);
    if v->>'error' is distinct from 'insufficient_item' or (select gold from public.account_wallet where user_id = v_u) <> 1000000
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.from_item) is distinct from 1
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.gem) is distinct from 1 then
      raise exception 'jewel-reforge §4(d): one bar short answered %', v; end if;

    -- (e) ONE COIN SHORT: refused, and the piece, the bars and the gem are still in the bag (the take rolled back).
    update public.player_inventory set qty = v_o.bars where user_id = v_u and slot = 0 and item_id = v_o.metal;
    update public.account_wallet set gold = v_o.gold - 1 where user_id = v_u;
    v := public.hr_jewel_reforge(0, v_o.from_item, v_o.to_item, v_o.gold, (k || '0005')::uuid);
    if v->>'error' is distinct from 'insufficient_gold'
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.from_item) is distinct from 1
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.metal) is distinct from v_o.bars
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.gem) is distinct from 1
       or exists (select 1 from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.to_item) then
      raise exception 'jewel-reforge §4(e): one coin short answered %', v; end if;

    -- (f) THE GEM IN STORAGE, THE REST IN THE BAG: it takes all of them, pays the fee difference, journals every source; the new piece is made.
    delete from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.gem;
    insert into public.account_bank (user_id, item_id, qty) values (v_u, v_o.gem, 2) on conflict (user_id, item_id) do update set qty = excluded.qty;
    update public.account_wallet set gold = v_o.gold + 7 where user_id = v_u;
    v := public.hr_jewel_reforge(0, v_o.from_item, v_o.to_item, v_o.gold, (k || '0006')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->>'item' is distinct from v_o.to_item
       or (select gold from public.account_wallet where user_id = v_u) <> 7
       or exists (select 1 from public.player_inventory where user_id = v_u and slot = 0 and item_id in (v_o.from_item, v_o.metal))
       or (select qty from public.account_bank where user_id = v_u and item_id = v_o.gem) is distinct from 1
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.to_item) is distinct from 1 then
      raise exception 'jewel-reforge §4(f): the reforge answered %', v; end if;
    select l.meta into v_l from public.player_ledger l where l.user_id = v_u and l.slot = 0 and l.kind = 'shop'
       and l.intent = 'jewel_reforge:' || v_o.to_item || ':' || v_o.gold || ':' || v_o.from_item and l.gold = -v_o.gold;
    if v_l is null or (v_l->'took'->'bag'->>v_o.from_item)::int <> 1 or (v_l->'took'->'bag'->>v_o.metal)::int <> v_o.bars
       or (v_l->'took'->'storage'->>v_o.gem)::int <> 1 then
      raise exception 'jewel-reforge §4(f): the journal reads %', v_l; end if;

    -- (g) THE SAME KEY AGAIN charges nothing and makes nothing; the section counts one reforge and no Hallmark today.
    update public.account_wallet set gold = 1000000 where user_id = v_u;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_o.from_item, 1), (v_u, 0, v_o.metal, v_o.bars);
    v := public.hr_jewel_reforge(0, v_o.from_item, v_o.to_item, v_o.gold, (k || '0006')::uuid);
    if (select gold from public.account_wallet where user_id = v_u) <> 1000000
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.to_item) is distinct from 1
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.from_item) is distinct from 1 then
      raise exception 'jewel-reforge §4(g): a replay moved value: %', v; end if;
    s := public.hr_hallmark_view(v_u, 0);
    if (s->>'reforged')::int <> 1 or (s->>'today')::int <> 0 then raise exception 'jewel-reforge §4(g): the counts read %', s; end if;

    -- (h) THE DAY'S LIMIT, across the account: past per_day, refused before anything moves.
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
      select v_u, 0, 'shop', 'jewel_reforge:probe:1:probe', -1, '{"probe": true}'::jsonb from generate_series(2, (select day_limit from public.hr_hallmark_rule));
    v := public.hr_jewel_reforge(0, v_o.from_item, v_o.to_item, v_o.gold, (k || '0007')::uuid);
    if v->>'error' is distinct from 'reforge_limit' or (select gold from public.account_wallet where user_id = v_u) <> 1000000 then
      raise exception 'jewel-reforge §4(h): past the day''s limit answered %', v; end if;
    raise exception using errcode = 'HRJ99', message = 'jewel-reforge §4 complete - rolling back';
  exception when sqlstate 'HRJ99' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.player_ledger where user_id = v_u)
     or exists (select 1 from public.account_bank where user_id = v_u) then
    raise exception 'jewel-reforge §4: a probe row leaked'; end if;
  -- (i) THE GRANTS: the verb is a signed-in player's, the section the server's alone.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_hallmark_view(uuid,integer)', 'execute') then
      raise exception 'jewel-reforge §4(i): % reaches the section', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_jewel_reforge(integer,text,text,bigint,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_jewel_reforge(integer,text,text,bigint,uuid)', 'execute') then
    raise exception 'jewel-reforge §4(i): hr_jewel_reforge''s grants moved'; end if;
  -- (j) THE GM'S DOOR names the verb, once gm-tools is in.
  if to_regclass('public.hr_gm_wall_allow') is not null and not exists (select 1 from public.hr_gm_wall_allow where rpc = 'hr_jewel_reforge') then
    raise exception 'jewel-reforge §4(j): the GM door does not name hr_jewel_reforge'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'jewel-reforge §4 OK: the fee difference, the level in the new bench, the pair, the quote, a short bar, a short purse, bag and Storage, the journal, one key one charge, the day''s limit, the grants';
end $mig$;
