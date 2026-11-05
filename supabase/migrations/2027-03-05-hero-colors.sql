-- ════════════════════════════════════════════════════════════════════════
-- 2027-03-05-hero-colors.sql — A HERO'S FOUR COLORS: FREE AT CREATION, PAID TO CHANGE AFTERWARD
--   (lane/c-hero-colors, systems-engineer, 2026-11-05; Tyler 2026-11-04: "paid dye changes", one of the nine gold sinks; the designer's
--   board section "2026-11-04 Gold sinks", "Hero colors: one simplification"; the price and the cap are one row, src/data/gold-sinks.js `hero_colors`).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on its
-- passing §6; ON THE EA SECURITY LIST (a money surface: a gold sink; a look other players see). EDGE: no deploy, nothing here enters the bundle.
-- CLIENT: this file first. An old client saves an outfit with {} colors, which this file still takes; it shows no colors until the client half lands.
-- APPLY ORDER: after 2027-03-05-outfits-catalogue.generated.sql (the outfits' regions become head, body, legs, feet), which is after every staged
-- gold sink file (hr_sink_price, hr_sink_rules: 2027-02-27-gold-sinks-*).
--
-- ── WHAT IT SHIPS ────────────────────────────────────────────────────────────
--   ONE SET OF COLORS PER HERO: player_outfits.base_colors, head / body / legs / feet -> a dye index of hr_outfit_dyes. It follows the hero across
--   every outfit, so changing outfits never re-charges or asks twice. player_outfits.colors stays in the table and nothing writes to it any more.
--   hr_hero_colors_price(user, slot)        the quote: hr_sink_price('hero_colors', 0, Level). The price is a row, the Level the server's. NEVER ON THE SETTLE PATH:
--                                           only the window's read and the verb call it (a section would run it on every settle, tests/settle-budget.mjs).
--   hr_hero_colors_view(slot)               THE WINDOW'S READ: the price the Save button shows, asked while the Outfit tab is open, never in the envelope. A stale one only earns quote_changed.
--   hr_hero_colors_saved_today(user, slot)  this hero's paid saves this UTC day, read off the ledger under the hero's lock.
--   hr_hero_colors_set(slot, colors, price, key)  THE VERB, the stamina-refill shape; ledger kind shop, intent hero_colors_set:<head.body.legs.feet>:<price>.
--   hr_town_look_touch(user, slot)          a saved look is NEWS: a viewer's delta carries a body only when its changed_at moves, so a hero standing
--                                           still would keep its old look for everyone until it next walked. Skip-locked: it never waits on a town read.
--   hr_outfit_set                           RESTATED: the free verb takes no colors at all (or a forged call could recolor for free), and touches the look.
--                                           The `colors` key the projections still carry is {} from here on; no client reads it (hr_outfit_view, hr_town_look: untouched).
--   hr_social_party_view                    RESTATED: each seat + its hero's colors, so everyone in a hunt draws everyone in theirs.
-- hr_create_hero is untouched: colors at creation are free (its own §3), a named hero's second call is already_created. hr_town_look (the seams) already carries them.
-- WIPE: player_outfits is in the character wipe's list; a day's count is the ledger's and goes with it.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- A gold sink only: gold never comes back, a color is no power. The client sends INDICES and a price it was shown: hr_base_colors_problem takes exactly the four
-- regions, each a whole number in hr_outfit_dyes, so no client color value can reach another player (CLAUDE.md §1): they read an index, the client's own token
-- draws it. A stale or forged p_price is quote_changed, nothing charged; a save that changes nothing is colors_same, nothing charged, so a stuck button can't
-- bill. The key is hr_apply's: a replay answers the stored receipt, and the same key on other colors is intent_mismatch. The cap is per hero, under hr_hunt_lock.
-- A HUNTING HERO MAY SAVE, as with a stamina refill or a setup slot: the design's row says "Creation, then any" and names no refusal; the running hunt doesn't read
-- a color, and the lock orders the save against its settle (tests/hero-colors.mjs HC-HUNT).
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- An idle hero pays nothing: the price is the window's read. hr_social_party_view: one primary key per seat inside its one statement (at most 4), no new call. The verb: a day's rows of one hero's ledger.
--
-- REVERSIBILITY: re-apply the pre-images (2026-10-25-character-sheet.sql's hr_outfit_set; 2027-02-10-settle-plan-cache.generated.sql's hr_social_party_view);
-- drop the verb, the read, their baseline rows and the helpers. Saved colors are inert without a client.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_r record; v_md5 text;
begin
  if to_regprocedure('public.hr_sink_price(text,integer,integer)') is null or to_regclass('public.hr_sink_rules') is null
     or not exists (select 1 from public.hr_sink_rules where sink_id = 'hero_colors' and per_day > 0) then
    raise exception 'PRECONDITION: apply 2027-02-27-gold-sinks-catalogue.generated.sql and 2027-02-27-gold-sinks-seams.sql first'; end if;
  if to_regprocedure('public.hr_base_colors_problem(jsonb)') is null or to_regprocedure('public.hr_create_hero(integer,text,jsonb,uuid)') is null
     or to_regclass('public.town_bodies') is null or to_regprocedure('public.hr_town_look(uuid,integer)') is null then
    raise exception 'PRECONDITION: the hero creation file and the town stands must be applied'; end if;
  if exists (select 1 from public.hr_outfits where regions && array['hat', 'robe', 'trim']) then
    raise exception 'PRECONDITION: apply 2027-03-05-outfits-catalogue.generated.sql first (an outfit still names hat, robe or trim)'; end if;
  -- each restated body is EXACTLY its pre-image (the replayed chain, measured 2026-11-05) or this file's own (a second apply)
  for v_r in select * from (values
    ('public.hr_outfit_set(integer,text,jsonb,uuid)', '3b261fe4efc49f28df681742affc584f', '0a99bf08ecbd5b1f2997a35224e4d40c'),
    ('public.hr_social_party_view(uuid,integer)', 'a66ee40f025ded8603deeb025a6f9493', 'e8ffd7ccec06a286c7e6c7f34ce481d4')) t(fn, pre, post) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither its pre-image (%) nor this file''s image (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE QUOTE AND THE DAY'S COUNT ─────────────────────────────────────────
-- THE ONE PRICE: the row's, at the hero's Level. Null when the row is gone: a verb that gets null refuses, it never charges.
create or replace function public.hr_hero_colors_price(p_user uuid, p_slot int)
returns bigint language sql stable security definer set search_path = public, pg_catalog as $fn$
  select public.hr_sink_price('hero_colors', 0, public.hr_level_of(p_user, p_slot))
$fn$;

-- THIS HERO'S PAID SAVES THIS UTC DAY, off the append-only ledger's own index (user_id, slot, at desc). Read it under hr_hunt_lock.
create or replace function public.hr_hero_colors_saved_today(p_user uuid, p_slot int)
returns int language sql stable security definer set search_path = public, pg_catalog as $fn$
  select count(*)::int from public.player_ledger l
   where l.user_id = p_user and l.slot = p_slot and l.at >= public.hr_utc_day_start(now()) and l.kind = 'shop'
     and split_part(l.intent, ':', 1) = 'hero_colors_set'
$fn$;

-- A SAVED LOOK IS NEWS: re-read it now and move the body's changed_at, so the next delta any viewer asks for carries it. changed_at moves no position
-- (hr_town_bodies_at walks from `since`). A hero not standing in town has nothing to touch: its stand reads its look when it next takes one.
-- SKIP LOCKED, as hr_town_view's own refresh: it runs last in the verb and never waits, so no lock order can form; a skipped body shows the new look within the minute.
create or replace function public.hr_town_look_touch(p_user uuid, p_slot int)
returns void language sql volatile security definer set search_path = public, pg_catalog as $fn$
  update public.town_bodies b set look = public.hr_town_look(b.user_id, b.slot), look_at = now(), changed_at = now()
   where (b.user_id, b.slot) in (select t.user_id, t.slot from public.town_bodies t
                                  where t.user_id = p_user and t.slot = p_slot and t.station_id is not null for update of t skip locked)
$fn$;

-- ── §2 THE WINDOW'S READ ─────────────────────────────────────────────────────
-- What a save costs this hero right now: the Save button's number. Asked while the Outfit tab is open (hr_town_sinks_view's shape), so an idle hero costs no read.
create or replace function public.hr_hero_colors_view(p_slot int)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_catalog as $fn$
declare v_uid uuid := auth.uid(); v_price bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not public.hr_rate_ok(v_uid, 'hero_colors', 60, interval '1 minute') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  v_price := public.hr_hero_colors_price(v_uid, p_slot);
  if v_price is null then return jsonb_build_object('ok', false, 'error', 'catalogue_missing'); end if;
  return jsonb_build_object('ok', true, 'price', v_price);
end $fn$;
revoke execute on function public.hr_hero_colors_view(int) from public, anon, service_role;
grant  execute on function public.hr_hero_colors_view(int) to authenticated;

-- ── §3 THE VERB ──────────────────────────────────────────────────────────────
create or replace function public.hr_hero_colors_set(p_slot int, p_colors jsonb, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'hero_colors_set';
  v_uid uuid := auth.uid(); v_r jsonb; v_bad text; v_new jsonb; v_verb text; v_ver bigint; v_was jsonb; v_cap int; v_price bigint; v_a jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  -- EXACTLY THE FOUR REGIONS, EACH A DYE'S INDEX: the same check as creation. Nothing else the client sends can be stored.
  v_bad := public.hr_base_colors_problem(p_colors);
  if v_bad is not null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', v_bad)); end if;
  if p_price is null or p_price < 1 or p_price > 1000000000 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  v_new := jsonb_build_object('head', (p_colors->>'head')::int, 'body', (p_colors->>'body')::int, 'legs', (p_colors->>'legs')::int, 'feet', (p_colors->>'feet')::int);
  -- The key names the colors and the price: the same key on other colors is intent_mismatch, never a second look.
  v_verb := c_verb || ':' || (v_new->>'head') || '.' || (v_new->>'body') || '.' || (v_new->>'legs') || '.' || (v_new->>'feet') || ':' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- NOTHING WOULD CHANGE: said before any price is looked at, so a stale button can't turn into a charge.
  select po.base_colors into v_was from public.player_outfits po where po.user_id = v_uid and po.slot = p_slot;
  if v_was = v_new then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'colors_same')); end if;
  -- THE CAP, per hero, per UTC day, from the row.
  select r.per_day into v_cap from public.hr_sink_rules r where r.sink_id = 'hero_colors';
  if v_cap is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  if public.hr_hero_colors_saved_today(v_uid, p_slot) >= v_cap then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'colors_limit', 'per_day', v_cap)); end if;
  -- THE QUOTE, under the lock, from the server's row at the server's Level: never the client's number.
  v_price := public.hr_hero_colors_price(v_uid, p_slot);
  if v_price is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  if v_price <> p_price then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'price', v_price)); end if;
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'gold', -p_price,
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', c_verb, 'colors', v_new))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    return public.hr_note_rejection(c_verb, p_slot, v_a || jsonb_build_object('ok', false)); end if;
  -- THE SET, last: a refused charge above never got here.
  insert into public.player_outfits as po (user_id, slot, outfit_id, colors, base_colors, updated_at)
    values (v_uid, p_slot, null, '{}'::jsonb, v_new, now())
    on conflict (user_id, slot) do update set base_colors = excluded.base_colors, updated_at = now();
  perform public.hr_town_look_touch(v_uid, p_slot);
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -p_price, 'outfit', public.hr_outfit_view(v_uid, p_slot));
end $fn$;
revoke execute on function public.hr_hero_colors_set(int, jsonb, bigint, uuid) from public, anon, service_role;
grant  execute on function public.hr_hero_colors_set(int, jsonb, bigint, uuid) to authenticated;

-- ── §4 THE FREE VERB TAKES AN OUTFIT, NEVER A COLOR ──────────────────────────
-- 2026-10-25-character-sheet.sql's body with the per-outfit colors gone: any color at all is refused, so hr_hero_colors_set is the one way to recolor. The look moves now, not when the hero next walks.
create or replace function public.hr_outfit_set(p_slot int, p_outfit text, p_colors jsonb, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'outfit_set';
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_o    public.hr_outfits%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if coalesce(p_colors, '{}'::jsonb) <> '{}'::jsonb then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_colors')); end if;
  if p_outfit is not null then
    select * into v_o from public.hr_outfits where outfit_id = p_outfit;
    if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_outfit')); end if;
    if not (p_outfit = any (public.hr_outfit_owned(v_uid, p_slot))) then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_owned', 'premium', v_o.premium)); end if;
  end if;
  insert into public.player_outfits (user_id, slot, outfit_id, colors, updated_at)
    values (v_uid, p_slot, p_outfit, '{}'::jsonb, now())
  on conflict (user_id, slot) do update set outfit_id = excluded.outfit_id, colors = '{}'::jsonb, updated_at = now();
  perform public.hr_town_look_touch(v_uid, p_slot);
  v_r := jsonb_build_object('ok', true, 'outfit', public.hr_outfit_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;

-- ── §5 EVERY SEAT CARRIES ITS HERO'S COLORS, AND THE CLIENT SURFACE ──────────
-- The plan-cached form 2027-02-10-settle-plan-cache.generated.sql gave it, kept: the one line added reads one primary key per seat, an index a client draws with.
create or replace function public.hr_social_party_view(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 stable
 parallel unsafe
 cost 100
 set search_path = public, pg_catalog
as $plc$
-- PLAN-CACHE (2027-02-10-settle-plan-cache.generated.sql): the SQL body below, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select hr_q.v from (

  -- SOCIAL-PASS: each seat by its own hero's name. HERO-COLORS: and its own four colors, null when none were chosen.
  select coalesce((select jsonb_agg(jsonb_build_object('seat', m.seat, 'user', m.user_id, 'slot', m.slot,
                                                       'name', left(public.hr_character_name(m.user_id, m.slot), 24),
                                                       'colors', (select nullif(po.base_colors, '{}'::jsonb) from public.player_outfits po
                                                                   where po.user_id = m.user_id and po.slot = m.slot)) order by m.seat)
                     from public.hunt_party_members m
                    where m.party_id = public.hr_hunt_party_of(p_user, p_slot)), '[]'::jsonb)
  ) as hr_q(v) limit 1);
end
$plc$;
revoke execute on function public.hr_social_party_view(uuid, integer) from public, anon, authenticated, service_role;

delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_hero_colors_set', 'hr_hero_colors_view');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hero_colors_set', 'p_slot integer, p_colors jsonb, p_price bigint, p_idem uuid', 'authenticated',
   'added 2027-03-05 (lane/c-hero-colors): MONEY (a gold sink) - this hero''s four dye indices at the price the server quotes by Level; refuses colors_same, colors_limit and quote_changed; one key charges once'),
  ('hr_hero_colors_view', 'p_slot integer', 'authenticated',
   'added 2027-03-05 (lane/c-hero-colors): the window''s read, the price a save costs this hero right now; moves nothing');

do $mig$
declare f text;
begin
  foreach f in array array['public.hr_hero_colors_price(uuid,integer)', 'public.hr_hero_colors_saved_today(uuid,integer)', 'public.hr_town_look_touch(uuid,integer)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', f);
  end loop;
end $mig$;

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- Every number comes from the row: Tyler may move a price or the cap with one row, and this must still pass.
do $chk$
declare
  v_u  constant uuid := '000000c0-0000-4000-a000-0000901dc001';
  k1   constant uuid := '000000c0-0000-4000-a000-0000901dc002';
  c_a  constant jsonb := '{"head": 1, "body": 2, "legs": 3, "feet": 4}'::jsonb;
  c_b  constant jsonb := '{"head": 5, "body": 6, "legs": 7, "feet": 8}'::jsonb;
  v    jsonb; v_price bigint; v_gold bigint; v_cap int; v_base bigint; v_per bigint; v_name text; v_i int; f text; v_role text; bad jsonb;
begin
  select r.per_day, r.price_base, r.price_per_level into v_cap, v_base, v_per from public.hr_sink_rules r where r.sink_id = 'hero_colors';
  if v_cap is null or v_base is null or v_per is null then raise exception 'hero-colors §6: the row is not whole'; end if;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'hero-colors §6 probe') on conflict (user_id) do nothing;
    insert into public.account_wallet (user_id, gold) values (v_u, 100000000) on conflict (user_id) do update set gold = excluded.gold;
    -- (a) CREATION IS FREE: colors stored, purse unmoved, nothing journalled. The probe name is drawn until hr_create_hero would accept it.
    for v_i in 1 .. 8 loop
      v_name := 'Dyeprobe' || substr(md5(random()::text), 1, 8);
      v := public.hr_create_hero(0, v_name, c_a, gen_random_uuid());
      exit when coalesce(v->>'ok', '') = 'true';
    end loop;
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hero-colors §6(a): hr_create_hero refused: %', v; end if;
    select w.gold into v_gold from public.account_wallet w where w.user_id = v_u;
    if v_gold < 100000000 or (select po.base_colors from public.player_outfits po where po.user_id = v_u and po.slot = 0) <> c_a
       or exists (select 1 from public.player_ledger l where l.user_id = v_u and l.gold < 0) then
      raise exception 'hero-colors §6(a): creation was not free, or lost its colors: gold %, colors %', v_gold, (select po.base_colors from public.player_outfits po where po.user_id = v_u and po.slot = 0); end if;
    -- (b) THE QUOTE IS THE ROW AT THE LEVEL, IN THE SECTION.
    v_price := public.hr_hero_colors_price(v_u, 0);
    if v_price <> v_base + v_per * public.hr_level_of(v_u, 0) or (public.hr_hero_colors_view(0)->>'price')::bigint <> v_price then
      raise exception 'hero-colors §6(b): the quote reads % for a Level % hero', v_price, public.hr_level_of(v_u, 0); end if;
    -- ...AND IT NEVER RIDES AN ENVELOPE: a settle builds this section, and a price in it runs hr_sink_price every time.
    if strpos(public.hr_state_of(v_u, 0)::text, 'colors_price') > 0 then raise exception 'hero-colors §6(b): the envelope carries the price'; end if;
    -- (c) A FORGED COLOR OR REGION: refused before the lock, nothing charged, nothing stored. No client color value has a path.
    foreach bad in array array[
      '{"head": 99, "body": 2, "legs": 3, "feet": 4}'::jsonb, '{"head": -1, "body": 2, "legs": 3, "feet": 4}'::jsonb, '{"head": 1.5, "body": 2, "legs": 3, "feet": 4}'::jsonb,
      '{"head": "#ff00ff", "body": 2, "legs": 3, "feet": 4}'::jsonb, '{"hat": 1, "body": 2, "legs": 3, "feet": 4}'::jsonb, '{"head": 1, "body": 2, "legs": 3}'::jsonb,
      '{"head": 1, "body": 2, "legs": 3, "feet": 4, "cape": 5}'::jsonb, '[1, 2, 3, 4]'::jsonb, 'null'::jsonb] loop
      v := public.hr_hero_colors_set(0, bad, v_price, gen_random_uuid());
      if coalesce(v->>'ok', '') = 'true' or v->>'error' not in ('bad_colors', 'bad_region', 'bad_dye') then
        raise exception 'hero-colors §6(c): % answered %', bad, v; end if;
    end loop;
    v := public.hr_outfit_set(0, 'knight', c_b, gen_random_uuid());
    if v->>'error' is distinct from 'bad_colors' then raise exception 'hero-colors §6(c): the free verb took colors: %', v; end if;
    -- (d) NOTHING WOULD CHANGE: colors_same, whichever way round the keys came, even at a stale price.
    v := public.hr_hero_colors_set(0, c_a, v_price + 1, gen_random_uuid());
    if v->>'error' is distinct from 'colors_same' then raise exception 'hero-colors §6(d): the same colors answered %', v; end if;
    -- (e) A STALE OR FORGED PRICE: quote_changed, with the new quote. A price of nothing doesn't reach the quote.
    v := public.hr_hero_colors_set(0, c_b, v_price + 1, gen_random_uuid());
    if v->>'error' is distinct from 'quote_changed' or (v->>'price')::bigint <> v_price then
      raise exception 'hero-colors §6(e): a forged price answered %', v; end if;
    v := public.hr_hero_colors_set(0, c_b, 0, gen_random_uuid());
    if v->>'error' is distinct from 'bad_quote' then raise exception 'hero-colors §6(e): a zero price answered %', v; end if;
    if (select w.gold from public.account_wallet w where w.user_id = v_u) <> v_gold
       or (select po.base_colors from public.player_outfits po where po.user_id = v_u and po.slot = 0) <> c_a then
      raise exception 'hero-colors §6(c-e): a refused save moved something'; end if;
    -- (f) THE SAVE AND ITS REPLAY: one charge, one journal row of kind shop, the colors moved; the same key on other colors is refused.
    v := public.hr_hero_colors_set(0, c_b, v_price, k1);
    if coalesce(v->>'ok', '') <> 'true' or v->'outfit'->'base' <> c_b then raise exception 'hero-colors §6(f): the save answered %', v; end if;
    v := public.hr_hero_colors_set(0, c_b, v_price, k1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hero-colors §6(f): the replay answered %', v; end if;
    if (select w.gold from public.account_wallet w where w.user_id = v_u) <> v_gold - v_price then
      raise exception 'hero-colors §6(f): the charge is not exactly the price, once'; end if;
    if (select count(*) from public.player_ledger l where l.user_id = v_u and l.slot = 0 and l.kind = 'shop'
         and l.intent = 'hero_colors_set:5.6.7.8:' || v_price and l.gold = -v_price) <> 1 then
      raise exception 'hero-colors §6(f): one save is not one journal row'; end if;
    v := public.hr_hero_colors_set(0, c_a, v_price, k1);
    if v->>'error' is distinct from 'intent_mismatch' then raise exception 'hero-colors §6(f): one key on other colors answered %', v; end if;
    -- (g) THE COLORS FOLLOW THE HERO ACROSS OUTFITS: changing outfit neither charges nor moves them.
    select w.gold into v_gold from public.account_wallet w where w.user_id = v_u;
    v := public.hr_outfit_set(0, 'ranger', '{}'::jsonb, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or v->'outfit'->'base' <> c_b or (select w.gold from public.account_wallet w where w.user_id = v_u) <> v_gold then
      raise exception 'hero-colors §6(g): changing outfit answered %', v; end if;
    -- (h) THE CAP, per hero, from the row: one save stands in the ledger already, the rest are written here so the rate bucket is not the thing being tested.
    insert into public.player_ledger (user_id, slot, kind, intent, gold)
      select v_u, 0, 'shop', 'hero_colors_set:0.0.0.0:1', 0 from generate_series(2, v_cap);
    v := public.hr_hero_colors_set(0, c_a, v_price, gen_random_uuid());
    if v->>'error' is distinct from 'colors_limit' or (v->>'per_day')::int <> v_cap
       or (select w.gold from public.account_wallet w where w.user_id = v_u) <> v_gold then
      raise exception 'hero-colors §6(h): past the cap answered %', v; end if;
    -- ...and another hero's day is its own, though the purse is one.
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hero-colors §6(h): the second hero refused: %', v; end if;
    v := public.hr_hero_colors_set(1, c_a, public.hr_hero_colors_price(v_u, 1), gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'hero-colors §6(h): another hero''s first save answered %', v; end if;
    -- (i) A SHORT PURSE: hr_apply's own refusal, and the colors don't move.
    update public.account_wallet set gold = 0 where user_id = v_u;
    v := public.hr_hero_colors_set(1, c_b, public.hr_hero_colors_price(v_u, 1), gen_random_uuid());
    if v->>'error' is distinct from 'insufficient_gold' or (select po.base_colors from public.player_outfits po where po.user_id = v_u and po.slot = 1) <> c_a then
      raise exception 'hero-colors §6(i): a short purse answered %', v; end if;
    raise exception using errcode = 'HR934', message = 'hero-colors §6 complete - rolling back';
  exception when sqlstate 'HR934' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from auth.users where id = v_u) then
    raise exception 'hero-colors §6: LEAKED a probe row'; end if;
  -- (j) GRANTS: the verb is the client's; nothing else here is.
  foreach f in array array['public.hr_hero_colors_price(uuid,integer)', 'public.hr_hero_colors_saved_today(uuid,integer)', 'public.hr_town_look_touch(uuid,integer)',
                           'public.hr_outfit_view(uuid,integer)', 'public.hr_social_party_view(uuid,integer)'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, f, 'execute') then raise exception 'hero-colors §6(j): % reaches %', v_role, f; end if;
    end loop;
  end loop;
  foreach f in array array['public.hr_hero_colors_set(integer,jsonb,bigint,uuid)', 'public.hr_hero_colors_view(integer)'] loop
    if has_function_privilege('anon', f, 'execute') or not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'hero-colors §6(j): % grants are wrong', f; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hero-colors: free at creation, one key charges once, a forged color or price charges nothing, the cap is per hero, the colors follow the hero; all green';
end $chk$;
