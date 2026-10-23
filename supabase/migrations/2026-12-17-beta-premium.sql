-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — EVERY HERO IS PREMIUM DURING THE BETA (lane c-beta-premium,
-- backend-architect, 2026-10-23). STAGED, NOT APPLIED. Game CLOSED: applies on
-- its passing §4, one file via the Coordinator's apply tool, never inside
-- begin/commit, never 00:00–00:10 UTC. Touches the stamina cap (refill
-- headroom), the premium login reward (an item a day) and the analyzer gate:
-- in the reopen Security review. Contract: docs/design/ARCHITECTURE_CONTRACTS.md §19.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- Tyler 2026-10-23: "give all existing players premium", done as ONE server
-- switch read by the shared premium check: while it is on EVERY character,
-- existing and new, counts as premium. No per-character row is edited and
-- nothing is granted (CLAUDE.md §2: no admin grants to real characters). It is
-- turned off at the Early Access wipe.
--
-- ── THE SURFACES (swept on the replayed chain end; every one now decides
--    through the shared check) ─────────────────────────────────────────────────
--   READ THE COLUMN DIRECTLY before this file (restated here):
--     hr_premium_active     2026-10-23-character-premium.sql:69     the boolean check
--     hr_stamina_of         2026-10-23-character-premium.sql:110    piecewise rest read ps.premium_until
--     hr_premium_view       2026-10-23-character-premium.sql:171    `premium` section: active + perks
--   ALREADY THROUGH hr_premium_active (unchanged; they follow):
--     hr_stamina_cap        2026-10-23-character-premium.sql:89     the 8 h / 12 h cap
--       -> hr_stamina_view (envelope `stamina.max_ms`), hr_stamina_refill_quote
--          (2026-10-25-stamina-refill.sql:61-62, the refill's headroom),
--          hr_hunt_member_read (2026-11-07-store-by-slot.sql:461-462: the EDGE's
--          stamina_ms / stamina_max_ms, supabase/functions/hr-accrue/hunt-settle.js:203-204),
--          hr_hunt_apply_member (2026-11-16-hunt-density-bounds.sql:283-287),
--          hr_hunt_enter_check (2026-12-05-hunt-setup-per-ground.sql:202, via hr_stamina_of)
--     hr_hunt_analyzer      2026-10-26-hunt-analyzer-basic.sql:90   full vs basic analyzer (RPC)
--     hr_hunt_analyzer_view 2026-10-26-hunt-analyzer-basic.sql:103  `hunt_analyzer` section
--     hr_login_claim        2026-10-23-premium-login-reward.sql:99  the premium daily reward
--     hr_login_view         2026-10-23-premium-login-reward.sql:143 `login.premium`
--     hr_outfit_owned       2026-10-25-character-sheet.sql:108      premium outfits
--       -> hr_outfit_view, hr_outfit_set (character-sheet.sql:271), hr_hunt_party_view
--          (2026-12-07-party-finder.sql:425), hr_town_walkers (2026-12-10-town-walker-role.sql:91)
--   NOT A PREMIUM DECISION: hr_premium_grant (the owner-only writer, unchanged);
--     hr_hero_slots_of `premium_waived` (a hero-slot catalogue column, false on
--     every row since 2026-10-23-demolition-hero-slots-gold.sql); hr_login_claim_verify
--     (the retired accrual-period verify, refuses everything).
--   THE EDGE AND src/**: no premium decision. The edge reads the cap the server
--     decided (stamina_max_ms above); src/core/member.js frozenOf never carries
--     premium; the client reads `premium.active` (src/session/hunt-sections.js
--     isPremium), the analyzer's server tier, `outfit.owned` and `stamina.max_ms`.
--     No edge or client file changes.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 THE SWITCH: hr_flags row `beta_premium` (the server flag table,
--    2026-09-13-town-presence.sql: public read, no write grant or policy for any
--    role incl. service_role, so only the owner flips it). Seeded ON, ONCE: `on
--    conflict do nothing`, so a re-apply never turns back on a switch an
--    operator turned off. Read only through hr_flag_on, which fails CLOSED (a
--    missing row = off = per-character premium only).
-- §2 THE ONE CHECK. hr_premium_until(user, slot) (NEW) is the ONLY reader of the
--    switch and of player_state.premium_until: +infinity while the switch is on,
--    else the character's own premium_until; null = free or no such character.
--    hr_premium_active(user, slot, at) is its boolean form (until > at). Every
--    premium decision calls one of the two; §4(c) and tests/hunt-sessions-settle.mjs
--    BETA hold that (no other body reads the column or the switch).
-- §3 RESTATED from the replayed chain end (md5 pinned in §0, marker BETA-PREMIUM):
--    hr_premium_active (through §2), hr_stamina_of (the premium span of the rest
--    is [stamina_at, hr_premium_until), so the switch rests every pool to 12 h),
--    hr_premium_view (active and perks through hr_premium_active; `until` stays
--    the character's OWN premium_until, a display fact that decides nothing).
-- ERROR TAXONOMY: unchanged. The claim still answers premium_required, the
--    outfit verb not_owned, for a character the check calls free.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- No new lock and no write path: the four readers are STABLE (cannot write;
-- asserted in §4). A switch flip is one owner UPDATE; each statement reads it
-- once per call, so an envelope or settle is consistent within its transaction.
-- A running hunt's settle never rests (stamina_at = settled_to), so a flip
-- cannot refuse a settle; it changes only the cap the next read hands the edge.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- No new grant: hr_premium_until is owner-only like hr_premium_active; no
-- client, service, engine or tick role can execute either or write hr_flags.
-- While the switch is on, everyone gets the premium login reward (one Oak
-- Practice Blade a UTC day: bop, value 0, weaker than the starter sword) and the
-- 12 h stamina cap (4 h more refill headroom, gold-priced, 6 a day). Both are in
-- the reopen Security review. Nothing here writes premium_until or the ledger.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Operational: `update public.hr_flags set enabled = false where key =
-- 'beta_premium'` and per-character premium is back at once (the EA wipe does
-- this; the launch chain must carry it so a rebuild after launch stays off).
-- Code: re-apply hr_premium_active / hr_stamina_of / hr_premium_view from
-- 2026-10-23-character-premium.sql, drop hr_premium_until, delete the flag row.
-- KNOWN LIMIT: the switch has no history, so turning it OFF re-rests every idle
-- pool from its stamina_at at the free cap (a pool computed above 8 h but never
-- written returns to 8 h). It is turned off only at the wipe.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- One 4-column flag row. Each premium check adds one primary-key read of a
-- 5-row table; hr_premium_view now reads the check once instead of four column
-- compares. No new rows per player, per hunt or per tick.
-- ORDER: after 2026-12-16-own-drinks-settle.sql (staged; no object in common
-- with it, 2026-12-15-account-gold.sql or 2026-12-14-shared-farm.sql). EDGE:
-- unchanged. Proof: tests/hunt-sessions-settle.mjs BETA (+ mutants). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  if to_regclass('public.hr_flags') is null or to_regprocedure('public.hr_flag_on(text)') is null then
    raise exception 'PRECONDITION: hr_flags / hr_flag_on are absent (2026-09-13-town-presence.sql)'; end if;
  if to_regprocedure('public.hr_premium_grant(uuid,integer,timestamp with time zone,text)') is null
     or to_regprocedure('public.hr_stamina_cap(uuid,integer,timestamp with time zone)') is null
     or to_regprocedure('public.hr_outfit_owned(uuid,integer)') is null
     or to_regprocedure('public.hr_login_claim(integer,uuid)') is null then
    raise exception 'PRECONDITION: the premium surfaces (character-premium, premium-login-reward, character-sheet) first'; end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_premium_active(uuid,integer,timestamp with time zone)'::regprocedure;
  if md5(v_src) <> 'bc8e933442697848afefccff6ff8a082' and strpos(v_src, 'BETA-PREMIUM') = 0 then
    raise exception 'PIN: hr_premium_active is neither the 2026-10-23-character-premium image (bc8e9334...) nor this file''s (md5 %)', md5(v_src); end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_stamina_of(uuid,integer,timestamp with time zone)'::regprocedure;
  if md5(v_src) <> '809c71a7ad9bf7314d1c61f7c4ba3aeb' and strpos(v_src, 'BETA-PREMIUM') = 0 then
    raise exception 'PIN: hr_stamina_of is neither the 2026-10-23-character-premium image (809c71a7...) nor this file''s (md5 %)', md5(v_src); end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_premium_view(uuid,integer)'::regprocedure;
  if md5(v_src) <> 'fe690ee3a4c4685b6b4fa9d0d476b92f' and strpos(v_src, 'BETA-PREMIUM') = 0 then
    raise exception 'PIN: hr_premium_view is neither the 2026-10-23-character-premium image (fe690ee3...) nor this file''s (md5 %)', md5(v_src); end if;
end $mig$;

-- ── §1 THE SWITCH ───────────────────────────────────────────────────────────
insert into public.hr_flags (key, enabled, note)
values ('beta_premium', true,
        'BETA PREMIUM (2026-12-17-beta-premium.sql; Tyler 2026-10-23). TRUE = every character counts as premium '
        '(stamina cap 12 h, the full analyzer, premium outfits, the daily login reward); read ONLY by '
        'hr_premium_until. Nothing is granted and no premium_until is written. Turn it off at the Early Access '
        'wipe: update public.hr_flags set enabled = false where key = ''beta_premium''. A missing row reads as off.')
on conflict (key) do nothing;

-- ── §2 THE ONE CHECK ────────────────────────────────────────────────────────
-- The instant THIS character's premium runs to, as the server decides it.
create or replace function public.hr_premium_until(p_user uuid, p_slot int)
returns timestamptz language sql stable set search_path = public, pg_catalog as $$
  -- BETA-PREMIUM (2026-12-17-beta-premium.sql): THE ONLY READER of the beta switch and of
  -- player_state.premium_until. While hr_flags `beta_premium` is on, every character is premium
  -- with no end (+infinity); otherwise its own premium_until (null = free). No row = no character = null.
  select case when public.hr_flag_on('beta_premium') then 'infinity'::timestamptz else ps.premium_until end
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot
$$;
revoke execute on function public.hr_premium_until(uuid, int) from public, anon, authenticated, service_role;

-- Is the character premium at `p_at`? The boolean form of the one check.
create or replace function public.hr_premium_active(p_user uuid, p_slot int, p_at timestamptz)
returns boolean language sql stable set search_path = public, pg_catalog as $$
  -- BETA-PREMIUM (2026-12-17-beta-premium.sql): every premium decision goes through here or
  -- hr_premium_until; nothing else reads the column or the switch.
  select coalesce(public.hr_premium_until(p_user, p_slot) > coalesce(p_at, now()), false)
$$;
revoke execute on function public.hr_premium_active(uuid, int, timestamptz) from public, anon, authenticated, service_role;

-- ── §3 THE READERS THAT READ THE COLUMN ─────────────────────────────────────
-- The pool at `p_at`, given that nothing HUNTED between stamina_at and p_at
-- (true by construction: while a session is open stamina_at = its settled_to).
-- REST IS PIECEWISE: up to the premium cap while the character is premium
-- (hr_premium_until: its own premium_until, or no end while the beta switch is
-- on), then up to the free cap. Rest never LOWERS a value: a pool above the free
-- cap when premium lapses is kept, and rests no further until it is below it.
-- Null when a cap row is missing — callers refuse.
create or replace function public.hr_stamina_of(p_user uuid, p_slot int, p_at timestamptz)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $$
declare
  v_ms   bigint; v_sat timestamptz; v_pu timestamptz;
  v_free bigint := public.hr_hunt_limit('stamina_free_min')::bigint * 60000;
  v_prem bigint := public.hr_hunt_limit('stamina_premium_min')::bigint * 60000;
  v_mid  timestamptz;
begin
  if v_free is null or v_prem is null then return null; end if;
  select ps.stamina_ms, ps.stamina_at into v_ms, v_sat
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
  if not found then return null; end if;
  -- BETA-PREMIUM (2026-12-17-beta-premium.sql): the premium span comes from the one check.
  v_pu := public.hr_premium_until(p_user, p_slot);
  if v_sat is null then return public.hr_stamina_cap(p_user, p_slot, p_at); end if;
  if p_at is null or p_at <= v_sat then return v_ms; end if;
  -- [stamina_at, min(p_at, premium until)) rests to the premium cap.
  if v_pu is not null and v_pu > v_sat then
    v_mid := least(p_at, v_pu);
    v_ms := greatest(v_ms, least(v_prem, v_ms + floor(extract(epoch from (v_mid - v_sat)) * 1000)::bigint));
    v_sat := v_mid;
  end if;
  -- [.., p_at) rests to the free cap.
  if p_at > v_sat then
    v_ms := greatest(v_ms, least(v_free, v_ms + floor(extract(epoch from (p_at - v_sat)) * 1000)::bigint));
  end if;
  return v_ms;
end $$;
revoke execute on function public.hr_stamina_of(uuid, int, timestamptz) from public, anon, authenticated, service_role;

-- The `premium` envelope section. `active` and every perk are the one check;
-- `until` is the character's OWN premium_until (granted or bought), shown as a
-- fact and deciding nothing (null while the beta switch alone makes it premium).
create or replace function public.hr_premium_view(p_user uuid, p_slot int)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  -- BETA-PREMIUM (2026-12-17-beta-premium.sql): active and perks through hr_premium_active.
  select jsonb_build_object(
    'until', ps.premium_until,
    'active', a.prem,
    'stamina_max_ms', public.hr_stamina_cap(p_user, p_slot, now()),
    'perks', jsonb_build_object('analyzer', a.prem, 'outfits', a.prem, 'login', a.prem))
    from public.player_state ps
    cross join lateral (select public.hr_premium_active(p_user, p_slot, now()) as prem) a
   where ps.user_id = p_user and ps.slot = p_slot
$$;
revoke execute on function public.hr_premium_view(uuid, int) from public, anon, authenticated, service_role;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_uid   constant uuid := '000000c0-0000-0000-0000-00005e1a0b01';   -- a FREE hero: no premium_until, ever
  v_uid2  constant uuid := '000000c0-0000-0000-0000-00005e1a0b02';   -- a hero with its OWN premium
  v       jsonb;
  v_free  bigint := public.hr_hunt_limit('stamina_free_min')::bigint * 60000;
  v_prem  bigint := public.hr_hunt_limit('stamina_premium_min')::bigint * 60000;
  v_on0   boolean := (select f.enabled from public.hr_flags f where f.key = 'beta_premium');
  v_pout  text[]  := (select array_agg(o.outfit_id order by o.sort) from public.hr_outfits o where o.premium);
  v_fp0   text;
  v_role  text;
  v_bad   text[];
  v_sig   text;
  c_nl    constant text := chr(10);
  c_one   constant regprocedure[] := array['public.hr_premium_until(uuid,integer)'::regprocedure];
  c_col   constant regprocedure[] := array['public.hr_premium_until(uuid,integer)'::regprocedure,
                                           'public.hr_premium_grant(uuid,integer,timestamp with time zone,text)'::regprocedure,
                                           'public.hr_premium_view(uuid,integer)'::regprocedure];
begin
  -- Every OWN premium there is (only the owner-only grant writes one, so live play cannot move this
  -- while the file applies; a hero created meanwhile has none).
  select md5(coalesce(string_agg(ps.user_id::text || ':' || ps.slot || ':' || ps.premium_until::text, ','
                                 order by ps.user_id, ps.slot), '')) into v_fp0
    from public.player_state ps where ps.premium_until is not null;
  -- (a) THE SWITCH: its row exists; the reader fails closed; there is a premium outfit to probe with.
  if v_on0 is null then raise exception 'VERIFY(a): no hr_flags beta_premium row'; end if;
  if public.hr_flag_on('beta_premium:no-such-flag') then raise exception 'VERIFY(a): hr_flag_on does not fail closed'; end if;
  if v_pout is null or v_prem <= v_free then raise exception 'VERIFY(a): no premium outfit, or the premium cap is not above the free one'; end if;
  -- (b) ONLY THE OWNER flips it; the check is reachable by no client, service, engine or tick role and
  --     cannot write (STABLE).
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_role, 'public.hr_flags', 'insert') or has_table_privilege(v_role, 'public.hr_flags', 'update')
       or has_table_privilege(v_role, 'public.hr_flags', 'delete') or has_table_privilege(v_role, 'public.hr_flags', 'truncate') then
      raise exception 'VERIFY(b): % can write hr_flags', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_flags' and cmd <> 'SELECT') then
    raise exception 'VERIFY(b): hr_flags carries a write policy'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
    continue when not exists (select 1 from pg_roles where rolname = v_role);
    foreach v_sig in array array['public.hr_premium_until(uuid,integer)', 'public.hr_premium_active(uuid,integer,timestamp with time zone)',
                                 'public.hr_premium_view(uuid,integer)', 'public.hr_stamina_of(uuid,integer,timestamp with time zone)',
                                 'public.hr_flag_on(text)'] loop
      if has_function_privilege(v_role, v_sig, 'execute') then raise exception 'VERIFY(b): % can execute %', v_role, v_sig; end if;
    end loop;
  end loop;
  if exists (select 1 from pg_proc p where p.oid in ('public.hr_premium_until(uuid,integer)'::regprocedure,
               'public.hr_premium_active(uuid,integer,timestamp with time zone)'::regprocedure, 'public.hr_premium_view(uuid,integer)'::regprocedure,
               'public.hr_stamina_of(uuid,integer,timestamp with time zone)'::regprocedure,
               'public.hr_stamina_cap(uuid,integer,timestamp with time zone)'::regprocedure) and (p.provolatile <> 's' or p.prosecdef)) then
    raise exception 'VERIFY(b): a premium reader is not a STABLE invoker function (it could write, or run as another role)'; end if;
  -- (c) ONE CHECK: no other public body reads the column (code only, comments stripped) or names the switch,
  --     and every premium surface calls the check.
  select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.oid <> all (c_col)
     and regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || c_nl || ']*', '', 'g') ~ '(^|[^a-z0-9_])premium_until';
  if v_bad is not null then raise exception 'VERIFY(c): % read player_state.premium_until past the one check', v_bad; end if;
  select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.oid <> all (c_one)
     and regexp_replace(regexp_replace(p.prosrc, '/\*.*?\*/', '', 'g'), '--[^' || c_nl || ']*', '', 'g') ~ 'beta_premium';
  if v_bad is not null then raise exception 'VERIFY(c): % read the beta switch past the one check', v_bad; end if;
  foreach v_sig in array array['public.hr_stamina_cap(uuid,integer,timestamp with time zone)', 'public.hr_premium_view(uuid,integer)',
                               'public.hr_hunt_analyzer(integer,uuid)', 'public.hr_hunt_analyzer_view(uuid,integer)',
                               'public.hr_login_claim(integer,uuid)', 'public.hr_login_view(uuid,integer)', 'public.hr_outfit_owned(uuid,integer)'] loop
    if strpos((select prosrc from pg_proc where oid = v_sig::regprocedure), 'hr_premium_active(') = 0 then
      raise exception 'VERIFY(c): % decides premium without hr_premium_active', v_sig; end if;
  end loop;
  if strpos((select prosrc from pg_proc where oid = 'public.hr_premium_active(uuid,integer,timestamp with time zone)'::regprocedure), 'hr_premium_until(') = 0
     or strpos((select prosrc from pg_proc where oid = 'public.hr_stamina_of(uuid,integer,timestamp with time zone)'::regprocedure), 'hr_premium_until(') = 0 then
    raise exception 'VERIFY(c): hr_premium_active / hr_stamina_of do not read hr_premium_until'; end if;

  -- (d) EXECUTED on two probe heroes, every write rolled back.
  begin
    insert into auth.users (id) values (v_uid), (v_uid2) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'beta-premium §4 probe'), (v_uid2, 'beta-premium §4 probe')
      on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_uid2::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'VERIFY(d): hr_create_character refused the second probe'; end if;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    if coalesce(public.hr_create_character(0)->>'ok', '') <> 'true' then raise exception 'VERIFY(d): hr_create_character refused the probe'; end if;
    if (select premium_until from public.player_state where user_id = v_uid and slot = 0) is not null then
      raise exception 'VERIFY(d): CONTROL: a fresh hero has its own premium'; end if;
    -- The pool: empty 13 h ago, nothing hunted since.
    update public.player_state set stamina_ms = 0, stamina_at = now() - interval '13 hours' where user_id = v_uid and slot = 0;

    -- (d1) SWITCH ON: the free hero is premium in every surface.
    update public.hr_flags set enabled = true where key = 'beta_premium';
    v := public.hr_state_of(v_uid, 0);
    if (v->'premium'->>'active')::boolean is distinct from true
       or v->'premium'->'perks' <> jsonb_build_object('analyzer', true, 'outfits', true, 'login', true)
       or (v->'premium'->>'stamina_max_ms')::bigint <> v_prem or (v->'stamina'->>'max_ms')::bigint <> v_prem
       or (v->'stamina'->>'ms')::bigint <> v_prem
       or (v->'login'->>'premium')::boolean is distinct from true
       or not (v->'outfit'->'owned') @> to_jsonb(v_pout) then
      raise exception 'VERIFY(d1): with the switch on a free hero reads % / stamina % / login % / outfits %',
        v->'premium', v->'stamina', v->'login'->'premium', v->'outfit'->'owned'; end if;
    if public.hr_stamina_of(v_uid, 0, now()) <> v_prem or public.hr_stamina_cap(v_uid, 0, now() + interval '10 years') <> v_prem
       or not public.hr_premium_active(v_uid, 0, now() + interval '10 years') then
      raise exception 'VERIFY(d1): the rest / the cap / the check is not premium with no end under the switch'; end if;
    if public.hr_premium_active(v_uid, 5, now()) or public.hr_premium_until(v_uid, 5) is not null then
      raise exception 'VERIFY(d1): a character that does not exist reads as premium'; end if;
    v := public.hr_login_claim(0, '000000c0-0000-4000-a000-00005e1a0b11');
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(d1): the login claim under the switch answered %', v; end if;
    v := public.hr_outfit_set(0, v_pout[1], '{}'::jsonb, '000000c0-0000-4000-a000-00005e1a0b12');
    if coalesce(v->>'ok', '') <> 'true' or v->'outfit'->>'worn' is distinct from v_pout[1] then
      raise exception 'VERIFY(d1): a premium outfit under the switch answered %', v; end if;
    -- Nothing was granted to make it so.
    if (select premium_until from public.player_state where user_id = v_uid and slot = 0) is not null
       or exists (select 1 from public.player_ledger where user_id = v_uid and intent = 'premium_grant') then
      raise exception 'VERIFY(d1): the switch wrote premium_until or a premium_grant row'; end if;

    -- (d2) SWITCH OFF: the same hero is free in every surface; the worn premium outfit is no longer shown.
    update public.hr_flags set enabled = false where key = 'beta_premium';
    v := public.hr_state_of(v_uid, 0);
    if (v->'premium'->>'active')::boolean is distinct from false
       or v->'premium'->'perks' <> jsonb_build_object('analyzer', false, 'outfits', false, 'login', false)
       or (v->'premium'->>'stamina_max_ms')::bigint <> v_free or (v->'stamina'->>'max_ms')::bigint <> v_free
       or (v->'stamina'->>'ms')::bigint <> v_free
       or (v->'login'->>'premium')::boolean is distinct from false
       or (v->'outfit'->'owned') ?| v_pout or v->'outfit'->>'worn' is not null then
      raise exception 'VERIFY(d2): with the switch off a free hero reads % / stamina % / login % / outfit %',
        v->'premium', v->'stamina', v->'login'->'premium', v->'outfit'; end if;
    v := public.hr_login_claim(0, '000000c0-0000-4000-a000-00005e1a0b13');
    if v->>'error' is distinct from 'premium_required' then raise exception 'VERIFY(d2): a free claim answered %', v; end if;
    v := public.hr_outfit_set(0, v_pout[1], '{}'::jsonb, '000000c0-0000-4000-a000-00005e1a0b14');
    if v->>'error' is distinct from 'not_owned' then raise exception 'VERIFY(d2): a free hero''s premium outfit answered %', v; end if;

    -- (d3) A REAL premium_until works on its own (switch off), and only for its hero.
    perform public.hr_premium_grant(v_uid2, 0, now() + interval '1 day', 'beta-premium §4 probe');
    v := public.hr_state_of(v_uid2, 0);
    if (v->'premium'->>'active')::boolean is distinct from true or (v->'stamina'->>'max_ms')::bigint <> v_prem
       or (v->'login'->>'premium')::boolean is distinct from true or not (v->'outfit'->'owned') @> to_jsonb(v_pout) then
      raise exception 'VERIFY(d3): own premium with the switch off reads % / %', v->'premium', v->'login'; end if;
    if public.hr_premium_active(v_uid2, 0, now() + interval '2 days') or public.hr_premium_active(v_uid, 0, now()) then
      raise exception 'VERIFY(d3): own premium does not end at its own instant, or leaked to another hero'; end if;
    -- (d4) and the switch covers a lapsed one.
    update public.player_state set premium_until = now() - interval '1 second' where user_id = v_uid2 and slot = 0;
    if public.hr_premium_active(v_uid2, 0, now()) then raise exception 'VERIFY(d4): CONTROL: a lapsed premium is active with the switch off'; end if;
    update public.hr_flags set enabled = true where key = 'beta_premium';
    if not public.hr_premium_active(v_uid2, 0, now()) then raise exception 'VERIFY(d4): the switch does not cover a lapsed premium'; end if;
    raise exception using errcode = 'HR8B1', message = 'beta-premium §4 complete - rolling back';
  exception when sqlstate 'HR8B1' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  -- (e) RESTORED and LEAK-FREE: the switch as found, no probe row or journal line, no own premium moved.
  --     The file's only other write is the §1 flag row; the readers it installs are STABLE (b).
  if (select f.enabled from public.hr_flags f where f.key = 'beta_premium') is distinct from v_on0 then
    raise exception 'VERIFY(e): the probe did not restore the switch'; end if;
  if exists (select 1 from public.player_state where user_id in (v_uid, v_uid2)) or exists (select 1 from auth.users where id in (v_uid, v_uid2))
     or exists (select 1 from public.player_ledger where user_id in (v_uid, v_uid2)) then
    raise exception 'VERIFY(e): §4 LEAKED a probe row'; end if;
  if (select md5(coalesce(string_agg(ps.user_id::text || ':' || ps.slot || ':' || ps.premium_until::text, ','
                                     order by ps.user_id, ps.slot), ''))
        from public.player_state ps where ps.premium_until is not null) <> v_fp0 then
    raise exception 'VERIFY(e): an own premium_until moved'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'beta-premium: switch %; one check (hr_premium_until / hr_premium_active) decides the cap, the rest, the analyzer, the login reward and outfits; own premium still works with it off; nothing granted; all green',
    case when v_on0 then 'ON (every hero is premium)' else 'off (per-character premium)' end;
end $$;
