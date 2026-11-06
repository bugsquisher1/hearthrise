-- ════════════════════════════════════════════════════════════════════════
-- 2027-03-14-jewelry-hallmark.sql — THE HALLMARK STEP: A FINE PIECE, ITS TIER'S GEM AND GOLD MAKE THE HALLMARKED ROW
--   (lane/c-jewelry-sample, systems-engineer, 2026-11-05; Tyler the same day, "let start with your calls": two perks a piece at fixed
--   strength, each combination its own row; the Hallmark fee is the gold sink, 25,000 g at T2 and 100,000 g at T3, plus a gem and
--   Crafting 30 / 45; no paid re-roll; odds shown before the roll. The designer's spec: PRIORITY_BOARD "2026-11-04 Crafted jewelry").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies
-- on its passing §4; ON THE EA SECURITY LIST (a money surface, and an item made from gold that trades). EDGE: none here; the roll's
-- engine half ships in the hr-accrue bundle with the items catalogue. CLIENT: the Hallmark pane rides the release AFTER this applies.
-- APPLY ORDER: after 2027-03-14-jewelry-catalogue.generated.sql (hr_hallmark_offers, hr_hallmark_rule, hr_market_ceilings), which is
-- after 2027-03-14-jewelry-items-catalogue.generated.sql (hr_items holds the rows), all after 2027-03-13-gm-tools.sql: §3b puts the verb on
-- the GM's door (hr_gm_wall_allow), and skips it on a database without GM tools (the door then refuses it, the safe default).
--
-- ── THE VERB ─────────────────────────────────────────────────────────────────
-- hr_hallmark(p_slot int, p_from text, p_to text, p_price bigint, p_idem uuid): this hero turns ONE Fine piece into the Hallmarked row the
--   catalogue pairs it with, choosing the second perk; nothing is rolled, nothing can fail once paid, nothing is refunded. Every refusal
--   answers BEFORE anything moves, and each charges nothing:
--     not_signed_in, bad_slot, bad_idem, bad_quote, unknown_hallmark     a malformed call, or a pair the catalogue doesn't hold
--     rate_limited                                                       hr_rpc_gate('outfit')
--     no_character                                                       no hero in that slot
--     hallmark_level {need, have}                                        the hero's Crafting (player_skills, the server's column) is under the tier's
--     hallmark_limit {limit}                                             this ACCOUNT made per_day Hallmarks this UTC day (hr_hallmark_rule)
--     quote_changed {hallmark}                                           the gold the player saw isn't the catalogue's now
--     insufficient_item {item_id, have, need, bag, storage}              hr_materials_take's: the Fine piece and the gem, from the bag, then Storage
--     insufficient_gold, bank_full                                       hr_apply's
--   THE CHARGE: hr_materials_take takes the piece and the gem (bag first, then the account's Storage, all or nothing), then ONE hr_apply
--   { gold: -price, items: { to: +1 } } journalled kind shop, intent hallmark:<to>:<price>:<from>, its meta naming both sources. Any refusal
--   after the take rolls the block back, so the piece and the gem are never lost to a short purse or a full bag.
-- LOCK ORDER: the hero (hr_hunt_lock), hr:sink:<uid> (the day's count, hr_sink_lock), the depot and the bag/Storage rows (hr_materials_take),
--   the purse last (hr_apply). One account's settle can't hold another's Hallmark.
-- IDEMPOTENT: the key is re-read under the hero's lock, so a doubled press is one charge (hr_intent_replay before and after the lock).
--
-- ── THE SECTION `hallmark` ──────────────────────────────────────────────────
-- hr_hallmark_view(user, slot): { offers: [{ from, to, perk, gem, gold, level }] for each Fine piece this hero holds in its bag or the
--   account's Storage, today (the account's Hallmarks this UTC day), per_day }. The pane prices from it; the verb re-quotes.
--
-- ── THE MARKET'S CEILING ────────────────────────────────────────────────────
-- hr_market_items RESTATED (2027-02-13-market-premium-bond.sql §2, pinned in §0): ceiling_each is the greatest of ceiling_min, 100x book and
--   the row's own hr_market_ceilings entry, so a Hallmarked T2 ring may list up to 300,000 g. Bids, floors and every other column are
--   unchanged; the daily spend and proceeds caps stand.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- A gold sink: the fee never comes back (every grade keeps the plain piece's shop bid, so a Hallmark can't be sold to the Shop for more).
-- No client number prices it or names what it makes: the pair must be a catalogue row and the price the catalogue's. The level is the
-- server's. A gem bought on the market is a transfer, not a mint. The day limit bounds a bug's reach, not a player's pace.
--
-- REVERSIBILITY: delete the section row; drop hr_hallmark (+ its baseline row) and hr_hallmark_view; restate the view from
--   2027-02-13-market-premium-bond.sql §2. Items made stay made (the wipe takes them).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_def text;
begin
  if to_regclass('public.hr_hallmark_offers') is null or to_regclass('public.hr_hallmark_rule') is null or to_regclass('public.hr_market_ceilings') is null then
    raise exception 'PRECONDITION: apply 2027-03-14-jewelry-catalogue.generated.sql first'; end if;
  if not exists (select 1 from public.hr_hallmark_offers) or not exists (select 1 from public.hr_hallmark_rule) then
    raise exception 'PRECONDITION: the Hallmark catalogue is empty'; end if;
  if to_regprocedure('public.hr_materials_take(uuid,integer,jsonb,boolean)') is null or to_regprocedure('public.hr_sink_lock(uuid)') is null
     or to_regprocedure('public.hr_sink_bought_today(uuid,text,text[])') is null or to_regprocedure('public.hr_skill_level(text,bigint)') is null
     or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null then
    raise exception 'PRECONDITION: a seam this verb calls is missing (hr_materials_take, hr_sink_*, hr_skill_level, hr_intent_replay, hr_hunt_lock)'; end if;
  /* THE VIEW'S PIN: its ceiling expression is 2027-02-13's or this file's, never a third. */
  v_def := regexp_replace(pg_get_viewdef('public.hr_market_items'::regclass, true), '[[:space:]]+', ' ', 'g');
  if position('hr_market_ceilings' in v_def) = 0 and position('GREATEST(c.ceiling_min, i.value * c.ceiling_mult)' in v_def) = 0 then
    raise exception 'PIN: hr_market_items is neither 2027-02-13''s image nor this file''s: another file moved its ceiling; re-pin'; end if;
end $mig$;

-- ── §1 THE MARKET'S CEILING: A GRADED ROW'S OWN ──────────────────────────────
-- RESTATED from 2027-02-13-market-premium-bond.sql §2: + the left join and the third term of ceiling_each. Same columns in the same order.
create or replace view public.hr_market_items with (security_invoker = true) as
  select i.item_id,
         (i.tradeable and i.value > 0 and v.item_id is not null
          and not exists (select 1 from public.hr_start_inventory k where k.item_id = i.item_id)
          and not exists (select 1 from public.hr_start_equipment e where e.item_id = i.item_id)
          and not exists (select 1 from public.hr_premium_login_reward p where p.item_id = i.item_id)
          and not exists (select 1 from public.hr_market_premium_items b where b.item_id = i.item_id)) as listable,
         case when not i.tradeable then 'untradeable'
              when i.value <= 0 then 'no_value'
              when v.item_id is null then 'no_shop_price'
              when exists (select 1 from public.hr_start_inventory k where k.item_id = i.item_id)
                or exists (select 1 from public.hr_start_equipment e where e.item_id = i.item_id) then 'start_kit'
              when exists (select 1 from public.hr_premium_login_reward p where p.item_id = i.item_id)
                or exists (select 1 from public.hr_market_premium_items b where b.item_id = i.item_id) then 'premium'
         end as why,
         v.unit as floor_each,
         least(1000000000::bigint, greatest(c.ceiling_min, i.value * c.ceiling_mult, coalesce(mc.ceiling, 0)))::bigint as ceiling_each,
         i.value as book
    from public.hr_items i
    left join public.hr_hunt_vendor_value v on v.item_id = i.item_id
    left join public.hr_market_ceilings mc on mc.item_id = i.item_id
   cross join public.hr_market_config c;
revoke all on public.hr_market_items from public, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then revoke all on public.hr_market_items from hr_engine; end if;
end $$;

-- ── §2 THE SECTION ───────────────────────────────────────────────────────────
-- plpgsql, not sql: the settle reads every section, and a sql function is re-planned on every call (tests/settle-budget.mjs SB-3).
create or replace function public.hr_hallmark_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare v jsonb; v_limit int; v_today int;
begin
  select r.day_limit into v_limit from public.hr_hallmark_rule r where r.id;
  if v_limit is null then return null; end if;
  /* The account's count today, hr_sink_bought_today's own read inlined here: that one is LANGUAGE sql with a SET clause, so the
     planner re-plans it on every call, and the settle reads this section every window (tests/settle-budget.mjs SB-3). */
  select count(*)::int into v_today from public.player_ledger l
   where l.user_id = p_user and l.slot = any (array[0, 1, 2, 3, 4, 5]) and l.at >= public.hr_utc_day_start(now()) and l.kind = 'shop'
     and split_part(l.intent, ':', 1) = 'hallmark';
  select coalesce(jsonb_agg(jsonb_build_object('from', o.from_item, 'to', o.to_item, 'perk', o.perk, 'gem', o.gem, 'gold', o.gold, 'level', o.level)
           order by o.from_item, o.to_item), '[]'::jsonb)
    into v
    from public.hr_hallmark_offers o
   where exists (select 1 from public.player_inventory i where i.user_id = p_user and i.slot = p_slot and i.item_id = o.from_item)
      or exists (select 1 from public.account_bank b where b.user_id = p_user and b.item_id = o.from_item);
  return jsonb_build_object('offers', v, 'today', v_today, 'per_day', v_limit);
end $$;
revoke all on function public.hr_hallmark_view(uuid, int) from public, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then revoke all on function public.hr_hallmark_view(uuid, int) from hr_engine; end if;
end $$;
insert into public.hr_state_sections (key, fn, note) values
  ('hallmark', 'hr_hallmark_view', '2027-03-14-jewelry-hallmark.sql: the Hallmark step for each Fine piece this hero holds, the account''s count today and the day''s limit')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §3 THE VERB ──────────────────────────────────────────────────────────────
create or replace function public.hr_hallmark(p_slot int, p_from text, p_to text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'hallmark';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_o public.hr_hallmark_offers%rowtype;
  v_lv int; v_today int; v_limit int; v_take jsonb; v_a jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_from is null or p_to is null or p_from !~ '^[a-z0-9_]{1,48}$' or p_to !~ '^[a-z0-9_]{1,48}$' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_hallmark')); end if;
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
  select * into v_o from public.hr_hallmark_offers o where o.from_item = p_from and o.to_item = p_to;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_hallmark')); end if;
  v_lv := public.hr_skill_level(v_o.skill, coalesce((select k.xp from public.player_skills k where k.user_id = v_uid and k.slot = p_slot and k.skill_id = v_o.skill), 0));
  if v_lv < v_o.level then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hallmark_level', 'need', v_o.level, 'have', v_lv, 'skill', v_o.skill)); end if;
  perform public.hr_sink_lock(v_uid);
  select r.day_limit into v_limit from public.hr_hallmark_rule r where r.id;
  v_today := public.hr_sink_bought_today(v_uid, c_verb);
  if v_limit is null or v_today >= v_limit then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'hallmark_limit', 'limit', v_limit)); end if;
  if v_o.gold <> p_price then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'hallmark', public.hr_hallmark_view(v_uid, p_slot))); end if;
  /* THE CHARGE, all or nothing: the piece and the gem, then the purse. A refusal after the take raises, and the block's rollback puts them back. */
  begin
    v_take := public.hr_materials_take(v_uid, p_slot, jsonb_build_object(v_o.from_item, 1, v_o.gem, 1), true);
    if coalesce(v_take->>'ok', 'false') <> 'true' then raise exception using errcode = 'HRJ01', message = 'hallmark: materials short'; end if;
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'gold', -p_price,
             'items', jsonb_build_object(v_o.to_item, 1),
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', c_verb, 'from', v_o.from_item, 'to', v_o.to_item, 'perk', v_o.perk,
                                                                      'gem', v_o.gem, 'level', v_lv, 'took', v_take->'from'))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then raise exception using errcode = 'HRJ02', message = 'hallmark: hr_apply refused'; end if;
  exception
    when sqlstate 'HRJ01' then return public.hr_note_rejection(c_verb, p_slot, v_take || jsonb_build_object('ok', false));
    when sqlstate 'HRJ02' then return public.hr_note_rejection(c_verb, p_slot, v_a || jsonb_build_object('ok', false));
  end;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -p_price, 'item', v_o.to_item, 'hallmark', public.hr_hallmark_view(v_uid, p_slot));
end $fn$;
revoke execute on function public.hr_hallmark(int, text, text, bigint, uuid) from public, anon, service_role;
grant  execute on function public.hr_hallmark(int, text, text, bigint, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_hallmark';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hallmark', 'p_slot integer, p_from text, p_to text, p_price bigint, p_idem uuid', 'authenticated',
   'added 2027-03-14 (lane/c-jewelry-sample): MONEY (a gold sink) - a Fine jewelry piece + its tier''s gem + the catalogue''s gold make the Hallmarked row the catalogue pairs it with, at the hero''s server Crafting level, ten an account a UTC day; refuses quote_changed; one key charges once');

-- ── §3b THE GAME MASTER'S DOOR (2027-03-13-gm-tools.sql: default deny) ──────────────────────────────────────
-- A Hallmark reaches no other player: the hero's own purse, bag and the account's own Storage. So the walled GM account's test hero may make
-- one, and what it makes stays walled: the Weighhouse's row lock refuses a walled listing (gm-tools GM-W-MARKET), whatever the item.
do $mig$
begin
  if to_regclass('public.hr_gm_wall_allow') is not null then
    insert into public.hr_gm_wall_allow (rpc, why) values ('hr_hallmark', 'its own purse, bag and Storage')
      on conflict (rpc) do update set why = excluded.why;
  end if;
end $mig$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED on a probe account, every probe rolled back ─────────────────────
do $mig$
declare
  v_u constant uuid := '00000000-0000-4000-c000-1e3e17a00001';
  k text := '00000000-0000-4000-c000-1e3e17a0';
  v_o public.hr_hallmark_offers%rowtype; v_other public.hr_hallmark_offers%rowtype;
  v jsonb; s jsonb; ver bigint; v_l jsonb; v_role text;
begin
  select * into v_o from public.hr_hallmark_offers order by from_item, to_item limit 1;
  select * into v_other from public.hr_hallmark_offers o where o.from_item <> v_o.from_item and o.to_item <> v_o.to_item order by from_item, to_item limit 1;
  if v_other.from_item is null then raise exception 'jewelry-hallmark §4: the catalogue holds one piece only, the probe needs two'; end if;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'jewelry-hallmark §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'jewelry-hallmark §4: hr_create_character refused: %', v; end if;
    update public.account_wallet set gold = 1000000 where user_id = v_u;

    -- (a) THE SECTION: nothing held, no offer; the day's limit and count.
    s := public.hr_state_of(v_u, 0)->'hallmark';
    if s is null or jsonb_array_length(s->'offers') <> 0 or (s->>'today')::int <> 0 or (s->>'per_day')::int <> (select day_limit from public.hr_hallmark_rule) then
      raise exception 'jewelry-hallmark §4(a): an empty bag reads %', s; end if;

    -- (b) CRAFTING UNDER THE TIER'S: refused with both numbers, nothing moves.
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_o.from_item, 1), (v_u, 0, v_o.gem, 1);
    v := public.hr_hallmark(0, v_o.from_item, v_o.to_item, v_o.gold, (k || '0001')::uuid);
    if v->>'error' is distinct from 'hallmark_level' or (v->>'need')::int <> v_o.level or (v->>'have')::int >= v_o.level
       or (select gold from public.account_wallet where user_id = v_u) <> 1000000 then
      raise exception 'jewelry-hallmark §4(b): a low Crafting answered %', v; end if;

    -- (c) AT THE LEVEL, THE SECTION OFFERS THE HELD PIECE ONLY; a pair the catalogue doesn't hold, and a stale price, are refused.
    insert into public.player_skills (user_id, slot, skill_id, xp) values (v_u, 0, v_o.skill, public.hr_skill_xp_for_level(v_o.skill, v_o.level))
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    s := public.hr_hallmark_view(v_u, 0);
    if exists (select 1 from jsonb_array_elements(s->'offers') e where e->>'from' <> v_o.from_item)
       or not exists (select 1 from jsonb_array_elements(s->'offers') e where e->>'to' = v_o.to_item and (e->>'gold')::bigint = v_o.gold) then
      raise exception 'jewelry-hallmark §4(c): holding % the section reads %', v_o.from_item, s; end if;
    v := public.hr_hallmark(0, v_o.from_item, v_other.to_item, v_o.gold, (k || '0002')::uuid);
    if v->>'error' is distinct from 'unknown_hallmark' then raise exception 'jewelry-hallmark §4(c): an unpaired Hallmark answered %', v; end if;
    v := public.hr_hallmark(0, v_o.from_item, v_o.to_item, v_o.gold - 1, (k || '0003')::uuid);
    if v->>'error' is distinct from 'quote_changed' or v->'hallmark' is null then raise exception 'jewelry-hallmark §4(c): a stale price answered %', v; end if;

    -- (d) ONE COIN SHORT: refused, and the piece and the gem are still in the bag (the take rolled back).
    update public.account_wallet set gold = v_o.gold - 1 where user_id = v_u;
    v := public.hr_hallmark(0, v_o.from_item, v_o.to_item, v_o.gold, (k || '0004')::uuid);
    if v->>'error' is distinct from 'insufficient_gold'
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.from_item) is distinct from 1
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.gem) is distinct from 1
       or exists (select 1 from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.to_item) then
      raise exception 'jewelry-hallmark §4(d): one coin short answered %', v; end if;

    -- (e) NO GEM IN THE BAG, ONE IN STORAGE: it takes the bag's piece and Storage's gem, pays, journals both sources; the piece is made.
    delete from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.gem;
    insert into public.account_bank (user_id, item_id, qty) values (v_u, v_o.gem, 2) on conflict (user_id, item_id) do update set qty = excluded.qty;
    update public.account_wallet set gold = v_o.gold + 7 where user_id = v_u;
    v := public.hr_hallmark(0, v_o.from_item, v_o.to_item, v_o.gold, (k || '0005')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->>'item' is distinct from v_o.to_item
       or (select gold from public.account_wallet where user_id = v_u) <> 7
       or exists (select 1 from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.from_item)
       or (select qty from public.account_bank where user_id = v_u and item_id = v_o.gem) is distinct from 1
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.to_item) is distinct from 1 then
      raise exception 'jewelry-hallmark §4(e): the Hallmark answered %', v; end if;
    select l.meta into v_l from public.player_ledger l where l.user_id = v_u and l.slot = 0 and l.kind = 'shop'
       and l.intent = 'hallmark:' || v_o.to_item || ':' || v_o.gold || ':' || v_o.from_item and l.gold = -v_o.gold;
    if v_l is null or (v_l->'took'->'bag'->>v_o.from_item)::int <> 1 or (v_l->'took'->'storage'->>v_o.gem)::int <> 1 then
      raise exception 'jewelry-hallmark §4(e): the journal reads %', v_l; end if;

    -- (f) THE SAME KEY AGAIN charges nothing and makes nothing; the section now counts one today.
    update public.account_wallet set gold = 1000000 where user_id = v_u;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_o.from_item, 1);
    v := public.hr_hallmark(0, v_o.from_item, v_o.to_item, v_o.gold, (k || '0005')::uuid);
    if (select gold from public.account_wallet where user_id = v_u) <> 1000000
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.to_item) is distinct from 1
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_o.from_item) is distinct from 1 then
      raise exception 'jewelry-hallmark §4(f): a replay moved value: %', v; end if;
    if (public.hr_hallmark_view(v_u, 0)->>'today')::int <> 1 then raise exception 'jewelry-hallmark §4(f): the count today is not one'; end if;

    -- (g) THE DAY'S LIMIT, across the account: past per_day, refused before anything moves.
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
      select v_u, 0, 'shop', 'hallmark:probe:1:probe', -1, '{"probe": true}'::jsonb from generate_series(2, (select day_limit from public.hr_hallmark_rule));
    v := public.hr_hallmark(0, v_o.from_item, v_o.to_item, v_o.gold, (k || '0006')::uuid);
    if v->>'error' is distinct from 'hallmark_limit' or (select gold from public.account_wallet where user_id = v_u) <> 1000000 then
      raise exception 'jewelry-hallmark §4(g): past the day''s limit answered %', v; end if;

    -- (h) THE CEILING: a graded row lists to its own, a plain row keeps 100x book.
    if (select ceiling_each from public.hr_market_items where item_id = v_o.to_item) <> (select ceiling from public.hr_market_ceilings where item_id = v_o.to_item)
       or (select ceiling_each from public.hr_market_items where item_id = 'banded_signet')
          <> (select least(1000000000::bigint, greatest(c.ceiling_min, i.value * c.ceiling_mult)) from public.hr_items i cross join public.hr_market_config c where i.item_id = 'banded_signet') then
      raise exception 'jewelry-hallmark §4(h): the ceilings read wrong'; end if;
    raise exception using errcode = 'HRJ99', message = 'jewelry-hallmark §4 complete - rolling back';
  exception when sqlstate 'HRJ99' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.player_ledger where user_id = v_u)
     or exists (select 1 from public.account_bank where user_id = v_u) then
    raise exception 'jewelry-hallmark §4: a probe row leaked'; end if;
  -- (i) THE GRANTS: the verb is a signed-in player's, the section and the view the server's alone.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_hallmark_view(uuid,integer)', 'execute') or has_table_privilege(v_role, 'public.hr_market_items', 'select') then
      raise exception 'jewelry-hallmark §4(i): % reaches the section or the market view', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_hallmark(integer,text,text,bigint,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_hallmark(integer,text,text,bigint,uuid)', 'execute') then
    raise exception 'jewelry-hallmark §4(i): hr_hallmark''s grants moved'; end if;
  -- (j) THE GM'S DOOR names the verb, once gm-tools is in.
  if to_regclass('public.hr_gm_wall_allow') is not null and not exists (select 1 from public.hr_gm_wall_allow where rpc = 'hr_hallmark') then
    raise exception 'jewelry-hallmark §4(j): the GM door does not name hr_hallmark'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'jewelry-hallmark §4 OK: the level, the pair, the quote, a short purse, bag then Storage, the journal, one key one charge, the day''s limit, the ceilings, the grants';
end $mig$;
