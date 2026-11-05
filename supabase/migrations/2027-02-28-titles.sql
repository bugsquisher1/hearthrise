-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-28-titles.sql — TITLES: GOLD UNLOCKS ONE ONLY AFTER THE KILLS ARE EARNED
--   (lane/c-hero-sinks, systems-engineer, 2026-11-04; Tyler the same day: "titles (gold unlocks only after the kills are earned)"; the
--   designer's board section "2026-11-04 Gold sinks", "Titles", the sample of five; rows in src/data/titles.js).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies
-- on its passing §6; ON THE EA SECURITY LIST (a money surface, and a name other players see). EDGE: no deploy, nothing here enters the bundle.
-- CLIENT: this file first. An old client ignores the new section and the new `title` on Inspect.
-- APPLY ORDER: after 2027-02-28-titles-catalogue.generated.sql (hr_titles), which is after 2027-02-27-gold-sinks-seams.sql (the stub this replaces).
--
-- ── WHAT IT SHIPS ────────────────────────────────────────────────────────────
--   player_titles                   what a hero holds and which one it wears. Per HERO, though the purse is the account's. One worn at most, by index.
--   hr_title_kills(user, slot, monsters)  the hero's server-counted kills: player_progress ev:kill_monster:<id>, summed. Nothing a client sends.
--   hr_titles_view                  the section `titles`: { worn, rows: [{ id, words, price, kills, have, held, worn }] }.
--   hr_title_buy(slot, title, price, key)  the stamina-refill shape; kills are checked BEFORE the price: gold can't skip kills.
--   hr_title_wear(slot, title, key) a held title on, or null to take it off. Free, journalled nowhere: no value moves.
--   hr_title_of                     ONLY THE BODY (the seam's stub, 2027-02-27-gold-sinks-seams.sql): the catalogue's words for the worn title, or null.
--                                   Nothing that calls it is restated: the chat row and the town look already read it.
--   hr_inspect                      RESTATED for `title`. §0 pins it to its live image.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- A gold sink only: no power, nothing tradeable, no XP. The title is a catalogue id, never text a player typed, so nothing needs
-- moderating; the catalogue's check keeps the words to letters, spaces, ' and -, 40 at most. A stale or forged price is quote_changed. A
-- replay answers the stored receipt. A second purchase is title_owned, and the primary key stands behind it. No client number reaches
-- another player: chat and the town read hr_title_of, which reads only the catalogue. A low hero carried through a party's kills still counts
-- them, as the bestiary does (the design's known limit). A hunting hero may claim and wear: it touches nothing a hunt reads.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- The section: one statement per envelope, one index read per title. hr_title_of: one read of a partial unique index per chat line and per look.
--
-- REVERSIBILITY: restore hr_title_of's stub and 2027-01-17-social-pass.sql's hr_inspect; drop the verbs, the section row, the table. The wipe empties it.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.hr_titles') is null then
    raise exception 'PRECONDITION: apply 2027-02-28-titles-catalogue.generated.sql first'; end if;
  if to_regprocedure('public.hr_title_of(uuid,integer)') is null then
    raise exception 'PRECONDITION: apply 2027-02-27-gold-sinks-seams.sql first (the seam this body fills)'; end if;
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_inspect(text,integer)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 is distinct from 'edcb583b2b26368405ff9cec4f1d09bc' and v_md5 is distinct from 'e6e7a2ed39684391fe09df64ccd43661' then
    raise exception 'PIN: hr_inspect is neither its live pre-image nor this file''s image: md5 % - another file moved it', v_md5; end if;
end $mig$;

-- ── §1 WHAT A HERO HOLDS ─────────────────────────────────────────────────────
-- No foreign key to hr_titles: the catalogue is a full replace, and a title dropped from it reads as nothing worn (hr_title_of joins).
create table if not exists public.player_titles (
  user_id   uuid not null,
  slot      int  not null,
  title_id  text not null check (title_id ~ '^[a-z0-9_]{1,32}$'),
  paid      bigint not null check (paid >= 0),
  worn      boolean not null default false,
  bought_at timestamptz not null default now(),
  primary key (user_id, slot, title_id),
  constraint player_titles_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
create unique index if not exists player_titles_one_worn on public.player_titles (user_id, slot) where worn;
alter table public.player_titles enable row level security;
revoke all on public.player_titles from public, anon, authenticated, service_role;
comment on table public.player_titles is
  '2027-02-28-titles.sql: the titles a hero claimed and the one it wears (per hero; the purse that paid is the account''s). Written only by hr_title_buy and hr_title_wear. RLS on, no policy, no client grant.';

-- ── §2 THE READS ─────────────────────────────────────────────────────────────
create or replace function public.hr_title_kills(p_user uuid, p_slot int, p_monsters text[])
returns bigint language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  return coalesce((select sum(p.value) from public.player_progress p
                    where p.user_id = p_user and p.slot = p_slot and p.kind = 'stat' and p.period_key = ''
                      and p.key = any (array(select 'ev:kill_monster:' || m from unnest(p_monsters) m))), 0)::bigint;
end $fn$;

create or replace function public.hr_titles_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  return (select jsonb_build_object(
            'worn', (select h.title_id from public.player_titles h join public.hr_titles c on c.title_id = h.title_id
                      where h.user_id = p_user and h.slot = p_slot and h.worn),
            'rows', coalesce(jsonb_agg(jsonb_build_object('id', t.title_id, 'words', t.words, 'price', t.price, 'kills', t.kills,
                      'have', public.hr_title_kills(p_user, p_slot, t.monsters),
                      'held', h.title_id is not null, 'worn', coalesce(h.worn, false)) order by t.ord), '[]'::jsonb))
            from public.hr_titles t
            left join public.player_titles h on h.user_id = p_user and h.slot = p_slot and h.title_id = t.title_id);
end $fn$;

-- THE SEAM'S BODY, AND ONLY THAT: the catalogue's words, or null. The chat row and the town look already read this.
create or replace function public.hr_title_of(p_user uuid, p_slot int)
returns text language sql stable security definer set search_path = public, pg_catalog as $fn$
  select c.words from public.player_titles h join public.hr_titles c on c.title_id = h.title_id
   where h.user_id = p_user and h.slot = p_slot and h.worn
$fn$;

revoke execute on function public.hr_title_kills(uuid, int, text[]) from public, anon, authenticated, service_role;
revoke execute on function public.hr_titles_view(uuid, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_title_of(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('titles', 'hr_titles_view', '2027-02-28-titles.sql: every title with its price, the kills it takes, this hero''s server-counted kills, whether it holds it and which it wears')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §3 THE PURCHASE AND THE WEARING ──────────────────────────────────────────
create or replace function public.hr_title_buy(p_slot int, p_title text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'title_buy';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_t public.hr_titles%rowtype; v_have bigint; v_a jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_title is null or p_title !~ '^[a-z0-9_]{1,32}$' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_title')); end if;
  -- 0 is a price: a title that is itself a prize goes through this one path.
  if p_price is null or p_price < 0 or p_price > 1000000000 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  v_verb := c_verb || ':' || p_title || ':' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select * into v_t from public.hr_titles t where t.title_id = p_title;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_title')); end if;
  if exists (select 1 from public.player_titles h where h.user_id = v_uid and h.slot = p_slot and h.title_id = p_title) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'title_owned', 'title', p_title)); end if;
  -- GOLD CAN'T SKIP KILLS: counted here, from the hero's own counters, before any price is looked at.
  v_have := public.hr_title_kills(v_uid, p_slot, v_t.monsters);
  if v_have < v_t.kills then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'title_kills', 'title', p_title,
      'need', v_t.kills, 'have', v_have)); end if;
  if v_t.price <> p_price then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed',
      'titles', public.hr_titles_view(v_uid, p_slot))); end if;
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'gold', -p_price,
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', c_verb, 'title', p_title, 'kills', v_have))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    return public.hr_note_rejection(c_verb, p_slot, v_a || jsonb_build_object('ok', false)); end if;
  -- No on-conflict: under the hero's lock a second row can't be here, and if one is, this rolls the charge back rather than hide it.
  insert into public.player_titles (user_id, slot, title_id, paid) values (v_uid, p_slot, p_title, p_price);
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -p_price, 'titles', public.hr_titles_view(v_uid, p_slot));
end $fn$;

create or replace function public.hr_title_wear(p_slot int, p_title text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'title_wear';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_title is not null and p_title !~ '^[a-z0-9_]{1,32}$' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_title')); end if;
  v_verb := c_verb || ':' || coalesce(p_title, '-');
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if p_title is not null then
    if not exists (select 1 from public.hr_titles t where t.title_id = p_title) then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_title')); end if;
    if not exists (select 1 from public.player_titles h where h.user_id = v_uid and h.slot = p_slot and h.title_id = p_title) then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'title_not_owned', 'title', p_title)); end if;
  end if;
  -- Off first: the one-worn index holds between the two statements.
  update public.player_titles h set worn = false where h.user_id = v_uid and h.slot = p_slot and h.worn and h.title_id is distinct from p_title;
  if p_title is not null then
    update public.player_titles h set worn = true where h.user_id = v_uid and h.slot = p_slot and h.title_id = p_title and not h.worn;
  end if;
  v_r := jsonb_build_object('ok', true, 'worn', p_title, 'titles', public.hr_titles_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $fn$;

revoke execute on function public.hr_title_buy(int, text, bigint, uuid) from public, anon, service_role;
revoke execute on function public.hr_title_wear(int, text, uuid) from public, anon, service_role;
grant  execute on function public.hr_title_buy(int, text, bigint, uuid) to authenticated;
grant  execute on function public.hr_title_wear(int, text, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_title_buy', 'hr_title_wear');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_title_buy', 'p_slot integer, p_title text, p_price bigint, p_idem uuid', 'authenticated',
   'added 2027-02-28 (lane/c-hero-sinks): MONEY (a gold sink) - this hero claims a catalogue title once its server-counted kills are earned, at the server''s price; refuses title_kills, title_owned, quote_changed; one key charges once'),
  ('hr_title_wear', 'p_slot integer, p_title text, p_idem uuid', 'authenticated',
   'added 2027-02-28 (lane/c-hero-sinks): wear a title this hero holds, or null to take it off; moves no value');

-- ── §4 INSPECT: 2027-01-17-social-pass.sql's body, plus `title` ──────────────
create or replace function public.hr_inspect(p_target text, p_slot integer)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $function$
declare v_uid uuid := auth.uid(); v_t uuid; v_slot int;
begin
  -- SOCIAL-PASS: the 2026-10-27 body; a typed name opens THAT character, an id the slot asked else the current one.
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'inspect', 30, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  select t.target_user, t.target_slot into v_t, v_slot from public.hr_social_target(p_target) t;
  if v_t is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if v_t <> v_uid and (public.hr_social_blocked(v_uid, v_t) or not public.hr_admitted(v_t)) then
    return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  if p_target ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_slot := coalesce((select ps.slot from public.player_state ps where ps.user_id = v_t and ps.slot = p_slot), v_slot);
  end if;
  if v_slot is null or not exists (select 1 from public.player_state ps where ps.user_id = v_t and ps.slot = v_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  return jsonb_build_object('ok', true, 'id', v_t, 'name', left(public.hr_character_name(v_t, v_slot), 24), 'slot', v_slot,
    -- TITLES (2027-02-28-titles.sql): the worn title, a catalogue's words, or null.
    'title', left(public.hr_title_of(v_t, v_slot), 40),
    'level', public.hr_level_of(v_t, v_slot), 'weapon', public.hr_hunt_weapon_of(v_t, v_slot),
    'role', public.hr_chat_role_pick(v_t, v_slot),
    'gear', coalesce((select jsonb_agg(jsonb_build_object('slot', e.equip_slot, 'item', e.item_id) order by e.equip_slot)
                        from public.player_equipment e where e.user_id = v_t and e.slot = v_slot), '[]'::jsonb));
end $function$;

-- ── §5 THE WORDS ARE THE CLIENT'S: this file answers codes and numbers (src/data/refusal-words.js, src/shell/intent-words.js). ─

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- Every number comes from the row: a price or a kill count moved in the data must still pass.
do $chk$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000901d5e12';
  k1  constant uuid := '000000c0-0000-4000-a000-0000901d5e22';
  v_t public.hr_titles%rowtype; v jsonb; v_gold bigint; v_rows int; f text; v_role text; v_row public.chat_messages%rowtype; v_each bigint; i int;
begin
  select * into v_t from public.hr_titles t where t.price > 0 order by t.ord limit 1;
  if not found then raise exception 'titles §6: no priced title to probe with'; end if;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'titles §6 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'titles §6: hr_create_character refused: %', v; end if;
    insert into public.account_wallet (user_id, gold) values (v_u, 100000000) on conflict (user_id) do update set gold = excluded.gold;
    select w.gold into v_gold from public.account_wallet w where w.user_id = v_u;
    -- (a) a fresh hero wears nothing and the section lists the catalogue.
    v := public.hr_state_of(v_u, 0)->'titles';
    if v->'worn' is distinct from 'null'::jsonb or jsonb_array_length(v->'rows') <> (select count(*) from public.hr_titles) then
      raise exception 'titles §6(a): the section reads %', v; end if;
    if public.hr_title_of(v_u, 0) is not null then raise exception 'titles §6(a): a fresh hero wears a title'; end if;
    -- (b) GOLD CAN'T SKIP KILLS, one kill short, split across the row's monsters.
    v_each := (v_t.kills - 1) / cardinality(v_t.monsters);
    for i in 1 .. cardinality(v_t.monsters) loop
      insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at)
        values (v_u, 0, 'stat', 'ev:kill_monster:' || v_t.monsters[i], '',
                case when i = 1 then v_t.kills - 1 - v_each * (cardinality(v_t.monsters) - 1) else v_each end, now());
    end loop;
    v := public.hr_title_buy(0, v_t.title_id, v_t.price, gen_random_uuid());
    if v->>'error' is distinct from 'title_kills' or (v->>'need')::bigint <> v_t.kills or (v->>'have')::bigint <> v_t.kills - 1 then
      raise exception 'titles §6(b): one kill short answered %', v; end if;
    -- (c) earned, a stale or forged price: quote_changed. Nothing charged.
    update public.player_progress set value = value + 1
     where user_id = v_u and slot = 0 and kind = 'stat' and key = 'ev:kill_monster:' || v_t.monsters[1] and period_key = '';
    v := public.hr_title_buy(0, v_t.title_id, v_t.price + 1, gen_random_uuid());
    if v->>'error' is distinct from 'quote_changed' then raise exception 'titles §6(c): a forged price answered %', v; end if;
    v := public.hr_title_buy(0, v_t.title_id, 0, gen_random_uuid());
    if v->>'error' is distinct from 'quote_changed' then raise exception 'titles §6(c): a price of nothing answered %', v; end if;
    if (select w.gold from public.account_wallet w where w.user_id = v_u) <> v_gold then raise exception 'titles §6(c): a refused claim moved gold'; end if;
    -- (d) can't be worn before it is held.
    v := public.hr_title_wear(0, v_t.title_id, gen_random_uuid());
    if v->>'error' is distinct from 'title_not_owned' then raise exception 'titles §6(d): wearing an unheld title answered %', v; end if;
    -- (e) THE CLAIM AND ITS REPLAY: one charge, one journal row of kind shop.
    v := public.hr_title_buy(0, v_t.title_id, v_t.price, k1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'titles §6(e): the claim answered %', v; end if;
    v := public.hr_title_buy(0, v_t.title_id, v_t.price, k1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'titles §6(e): the replay answered %', v; end if;
    if (select w.gold from public.account_wallet w where w.user_id = v_u) <> v_gold - v_t.price then raise exception 'titles §6(e): the charge is not exactly the price, once'; end if;
    select count(*)::int into v_rows from public.player_ledger l
     where l.user_id = v_u and l.slot = 0 and l.kind = 'shop' and l.intent = 'title_buy:' || v_t.title_id || ':' || v_t.price and l.gold = -v_t.price;
    if v_rows <> 1 then raise exception 'titles §6(e): % journal rows for one claim', v_rows; end if;
    -- (f) not twice.
    v := public.hr_title_buy(0, v_t.title_id, v_t.price, gen_random_uuid());
    if v->>'error' is distinct from 'title_owned' then raise exception 'titles §6(f): a second claim answered %', v; end if;
    -- (g) WORN: the seam's readers see the catalogue's words; a forged title on an insert doesn't survive; null takes it off.
    v := public.hr_title_wear(0, v_t.title_id, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or public.hr_title_of(v_u, 0) is distinct from v_t.words then raise exception 'titles §6(g): wearing answered %', v; end if;
    insert into public.chat_messages (channel, from_id, from_slot, from_name, from_title, body)
      values ('global', v_u, 0, 'Forged', 'the Forged', 'titles probe') returning * into v_row;
    if v_row.from_title is distinct from v_t.words then raise exception 'titles §6(g): the chat row reads %', v_row.from_title; end if;
    if public.hr_town_look(v_u, 0)->>'title' is distinct from v_t.words then raise exception 'titles §6(g): the look reads %', public.hr_town_look(v_u, 0); end if;
    v := public.hr_inspect(v_u::text, 0);
    if v->>'title' is distinct from v_t.words then raise exception 'titles §6(g): Inspect reads %', v; end if;
    v := public.hr_title_wear(0, null, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or public.hr_title_of(v_u, 0) is not null then raise exception 'titles §6(g): taking it off answered %', v; end if;
    -- (h) PER HERO: the account's second hero shares the purse, not the kills or the title.
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'titles §6(h): the second hero refused: %', v; end if;
    v := public.hr_title_wear(1, v_t.title_id, gen_random_uuid());
    if v->>'error' is distinct from 'title_not_owned' then raise exception 'titles §6(h): another hero wearing it answered %', v; end if;
    v := public.hr_title_buy(1, v_t.title_id, v_t.price, gen_random_uuid());
    if v->>'error' is distinct from 'title_kills' or (v->>'have')::bigint <> 0 then raise exception 'titles §6(h): another hero claiming it answered %', v; end if;
    -- (i) A PRICE OF 0 GOES THROUGH THE ONE PATH: the same row, no gold moved.
    insert into public.hr_titles (title_id, words, price, kills, monsters, ord) values ('zz_probe', 'the Probe', 0, 1, array[v_t.monsters[1]], 9999);
    select w.gold into v_gold from public.account_wallet w where w.user_id = v_u;
    v := public.hr_title_buy(0, 'zz_probe', 0, gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' or (select w.gold from public.account_wallet w where w.user_id = v_u) <> v_gold then
      raise exception 'titles §6(i): a price of 0 answered %', v; end if;
    raise exception using errcode = 'HR934', message = 'titles §6 complete - rolling back';
  exception when sqlstate 'HR934' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from auth.users where id = v_u) then
    raise exception 'titles §6: LEAKED a probe row'; end if;
  -- (j) GRANTS: the two verbs are the client's; nothing else here is, and no client role can touch the table.
  foreach f in array array['public.hr_title_kills(uuid,integer,text[])', 'public.hr_titles_view(uuid,integer)', 'public.hr_title_of(uuid,integer)'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, f, 'execute') then raise exception 'titles §6(j): % reaches %', v_role, f; end if;
    end loop;
  end loop;
  foreach f in array array['public.hr_title_buy(integer,text,bigint,uuid)', 'public.hr_title_wear(integer,text,uuid)'] loop
    if has_function_privilege('anon', f, 'execute') or not has_function_privilege('authenticated', f, 'execute') then
      raise exception 'titles §6(j): the grants on % are wrong', f; end if;
  end loop;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.player_titles', 'select') or has_table_privilege(v_role, 'public.player_titles', 'insert,update,delete') then
      raise exception 'titles §6(j): % reaches player_titles', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'titles: gold cannot skip kills, one charge per key, once per hero, worn from the catalogue''s words into chat, the town and Inspect; all green';
end $chk$;
