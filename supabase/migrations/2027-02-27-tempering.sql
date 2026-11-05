-- ═════════════════════════════════════════════════════════════
-- 2027-02-27-tempering.sql — TEMPERING: A HERO'S RUNGS REACH THE FIGHT AND THE WINDOW (Tyler 2026-11-04: "some sort of
--   upgrade system that slightly increases gear power"; designer's table, PRIORITY_BOARD 2026-11-05, lane/c-gear-upgrade).
--
-- WHAT IT DOES
--   §1 hr_perks_of carries the rungs to the engine: a `temper` map of ladder id to rung. Carried verbatim from
--      2026-08-20-companion-model.sql, lines ADDED only (HR_PERKS_OF_CHAIN, tests/run-sql-tests.mjs PART 1f-ii). The settle
--      reads it every window (tick-reads.js PERKS_SQL), so a rung bought mid-hunt counts from the next window, both paths.
--   §2 hr_temper_view, the envelope's `temper` section: each ladder's rung and the next rung's offer at the server's price.
--   §4 THE SELF-CHECK, executed: the sale end to end on a probe account, every probe rolled back.
--
-- WHAT IT DOES NOT DO: the sale is the existing hr_unlock_buy, untouched: rung order, already_owned, GREATEST, the per-day
--   clamp (32 per namespace), the intent key, the purse move and the ledger row are its own. No table, no client RPC. A rung
--   sits on the hero (per slot: hr_unlock_buy shares only 'room' and 'property' across an account), so nothing to trade,
--   wear out or lose on a death.
--
-- APPLY ORDER: 2027-02-27-tempering-catalogue.generated.sql, then this file, then the edge deploy (the engine's hook and
--   the forward list), then the client. Apply before the edge: an old engine ignores the new key. An edge before the
--   catalogue answers unknown_offer, which sells nothing and moves nothing.
-- REVERSIBILITY: re-apply 2026-08-20-companion-model.sql §2 for the old hr_perks_of; delete from hr_state_sections where
--   key = 'temper'; drop function hr_temper_view. The ladder rows are the catalogue file's own.
-- ═════════════════════════════════════════════════════════════

do $mig$
begin
  if (select count(*) from public.hr_unlocks where namespace = 'temper') = 0
     or not exists (select 1 from public.hr_unlock_offers where source = 'gen-temper') then
    raise exception 'PRECONDITION: apply 2027-02-27-tempering-catalogue.generated.sql first'; end if;
  /* The pin: live-hash-drift's own hash of the live body; a second apply of this file finds its own. */
  if md5(regexp_replace(pg_get_functiondef(to_regprocedure('public.hr_perks_of(uuid,integer)')), '[[:space:]]+', ' ', 'g')) <> 'abe004d3ba1bc85dcaa555659a8afd23'
     and position('v_temper' in (select prosrc from pg_proc where oid = to_regprocedure('public.hr_perks_of(uuid,integer)'))) = 0 then
    raise exception 'PRECONDITION: hr_perks_of is not the body this file restates: another lane moved it, so rebase this restatement on it'; end if;
end $mig$;

-- ── §1 THE RUNGS REACH THE ENGINE ────────────────────────────────────────
create or replace function public.hr_perks_of(p_user uuid, p_slot int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_temper jsonb;
  v_rooms jsonb;
  v_plots jsonb;
  v_tier  int;
  v_recipes jsonb;
  v_renown bigint;
  v_renown_allxp float8;
  v_comp_id text;
  v_comp_xp bigint;
begin
  if p_user is null or p_slot is null then
    return jsonb_build_object('ok', false, 'error', 'bad_args');
  end if;

  -- A character that does not exist gets a refusal, not an empty stack. The
  -- two are different facts and the engine treats them differently: `ok:false`
  -- means "do not price a perk stack for this row at all", while an empty
  -- stack means "priced, and this player has bought nothing".
  if not exists (
    select 1 from public.player_state ps
     where ps.user_id = p_user and ps.slot = p_slot
  ) then
    return jsonb_build_object('ok', false, 'error', 'no_character');
  end if;

  select
    coalesce(jsonb_object_agg(substring(u.unlock_id from 6), u.level)
               filter (where u.unlock_id like 'room:%'), '{}'::jsonb),
    coalesce(jsonb_object_agg(substring(u.unlock_id from 6), u.level)
               filter (where u.unlock_id like 'plot:%'), '{}'::jsonb),
    coalesce(max(u.level) filter (where u.unlock_id like 'property:%'), 0)
    into v_rooms, v_plots, v_tier
    from public.hr_unlock_levels(p_user, p_slot) u;

  -- ── THE ARTISAN GATE ──────────────────────────────────────────────────
  -- Recipe scrolls are kind='flag' rows (see hr_unlocks) rather than levels,
  -- because the ACCRUAL ENGINE has to be able to grant one it rolled itself and
  -- 'flag' is in hr_apply's progress allowlist while 'unlock' is deliberately
  -- not. The JOIN to the catalogue is what makes a mis-filed row invisible as
  -- well as refused: hr_unlock_guard rejects a recipe row stored under the wrong
  -- kind, and this read would not see it either.
  --
  -- The wire shape is the CLIENT'S OWN — { "<scroll_id>": true } — so
  -- src/core/artisan.js gateOk consumes the server's answer and G.unlockedRecipes
  -- with the same expression. An absent row is an absent key is a LOCKED recipe:
  -- the fail-closed default is the shape's default, not a branch somebody wrote.
  select coalesce(jsonb_object_agg(substring(pp.key from 8), true), '{}'::jsonb)
    into v_recipes
    from public.player_progress pp
    join public.hr_unlocks u
      on u.unlock_id = pp.key
     and u.namespace = 'recipe'
     and u.progress_kind = pp.kind
   where pp.user_id = p_user
     and pp.slot    = p_slot
     and pp.period_key = ''
     and pp.value  > 0;

  -- TEMPERING (2027-02-27-tempering.sql): this hero's rungs, by ladder. Only ids and rungs cross; what a rung does is
  -- src/core/temper.js, clamped to the ladder there. The catalogue join makes a mis-filed row invisible, as the recipes' does.
  select coalesce(jsonb_object_agg(pp.key, pp.value), '{}'::jsonb)
    into v_temper
    from public.player_progress pp
    join public.hr_unlocks u
      on u.unlock_id = pp.key
     and u.namespace = 'temper'
     and u.progress_kind = pp.kind
   where pp.user_id = p_user
     and pp.slot    = p_slot
     and pp.period_key = ''
     and pp.value  > 0;

  -- THE RENOWN CHANNEL — server-derived, never from the client.
  v_renown := public.hr_renown_of(p_user, p_slot);
  v_renown_allxp :=
      case when v_renown >= 900    then 0.01::float8 else 0::float8 end   -- squire
    + case when v_renown >= 4500   then 0.01::float8 else 0::float8 end   -- baron
    + case when v_renown >= 32000  then 0.01::float8 else 0::float8 end   -- duke
    + case when v_renown >= 120000 then 0.01::float8 else 0::float8 end;  -- highking

  -- ── THE EQUIPPED COMPANION (layer-1 passive bonus) ────────────────────
  -- The id is SERVER-OWNED (player_state.companion_equipped, written only by
  -- hr_companion_equip after an ownership check). The xp is a server aggregate
  -- row keyed 'companion_xp:<id>' under kind='stat' — the SAME channel the
  -- bestiary/collection aggregates use, and already in hr_apply's progress
  -- allowlist, so the XP-accrual follow-up writes it with NO schema change (the
  -- 'companion_xp:' prefix is disjoint from 'ev:%', no collision). Read
  -- self-configuringly: no writer yet → 0 → level 1 → base magnitude, the same
  -- self-configuring switch as hr_unlock_levels. src/core/companion-perk.js
  -- prices {id,xp} from the COMPANIONS catalogue, so no pet data is in SQL.
  select ps.companion_equipped into v_comp_id
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
  select coalesce(sum(pp.value), 0) into v_comp_xp
    from public.player_progress pp
   where pp.user_id = p_user and pp.slot = p_slot
     and pp.kind = 'stat' and pp.period_key = ''
     and v_comp_id is not null and pp.key = 'companion_xp:' || v_comp_id;

  return jsonb_build_object(
    'ok', true,
    'rooms', coalesce(v_rooms, '{}'::jsonb),
    'plots', coalesce(v_plots, '{}'::jsonb),
    -- The property TIER, not the property id: 'property:castle' grants 5 and
    -- the capstone fires at >= CASTLE_TIER. `max` because a player who bought
    -- the Manor and then the Castle holds both rows.
    'propertyTier', coalesce(v_tier, 0),
    -- ⚠ THE JS FIELD NAME, camelCase, deliberately: this envelope is consumed
    --   by the accrual engine untranslated, and a mapping layer is where a field
    --   gets silently dropped and reads as "the player has unlocked nothing".
    'unlockedRecipes', coalesce(v_recipes, '{}'::jsonb),
    -- Named zeroes, not omissions. An absent key and a key that is honestly
    -- zero are indistinguishable to the reader, and one of them is a bug.
    'renownAllXp', v_renown_allxp,
    'temper', coalesce(v_temper, '{}'::jsonb),
    'clanPerks', '{}'::jsonb,
    'castle', null,
    -- ⚠ THE COMPANION CHANNEL — bookkeeping only ({id, xp}); the magnitudes are
    --   src/core/companion-perk.js's, off the COMPANIONS catalogue. null when
    --   nothing is equipped, so "no companion" and "an equipped one paying its
    --   base" are distinct wire shapes.
    'companion', case when v_comp_id is null then null
                      else jsonb_build_object('id', v_comp_id, 'xp', coalesce(v_comp_xp, 0)) end,
    -- ⚠ THE HONESTY FIELD. Which channels this answer actually covers. The
    --   Edge Function forwards it into the away card (`away.perkChannel`), so
    --   "the night was priced at zero perks because nothing is unlocked" can
    --   be told apart from "because the channel is not wired" — from the
    --   outside, without reading the source. Every historical away bug in this
    --   codebase was a reward that silently vanished.
    'sources', jsonb_build_object(
      'rooms',      'hr_unlock_levels',
      'plots',      'hr_unlock_levels',
      'property',   'hr_unlock_levels',
      'recipes',    'player_progress:flag:recipe:*',
      'renown',     'derived:hr_renown_of',
      'temper',     'player_progress:unlock:temper:*',
      'clan',       'derivable:contributes_zero',
      'castle',     'blocked:perk_table_client_side',
      'companions', 'derived:player_state.companion_equipped')
  );
end $$;

revoke execute on function public.hr_perks_of(uuid, int) from public;
revoke execute on function public.hr_perks_of(uuid, int)
  from anon, authenticated, service_role;
grant execute on function public.hr_perks_of(uuid, int) to hr_engine;

-- ── §2 THE WINDOW'S NUMBERS: each ladder, this hero's rung, the next rung at the server's price (none at the top) ──
create or replace function public.hr_temper_view(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'track', split_part(u.unlock_id, ':', 2),
           'tier', split_part(u.unlock_id, ':', 3)::int,
           'rung', coalesce(pp.value, 0),
           'max', u.max_value,
           'offer', o.offer_id,
           'gold', o.gold) order by u.unlock_id), '[]'::jsonb)
    from public.hr_unlocks u
    left join public.player_progress pp
      on pp.user_id = p_user and pp.slot = p_slot and pp.kind = u.progress_kind and pp.key = u.unlock_id and pp.period_key = ''
    left join public.hr_unlock_offers o
      on o.unlock_id = u.unlock_id and o.value = coalesce(pp.value, 0) + 1 and o.refusal is null
   where u.namespace = 'temper'
$$;
revoke all on function public.hr_temper_view(uuid, int) from public, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_temper_view(uuid, int) from hr_engine;
  end if;
end $$;
insert into public.hr_state_sections (key, fn, note) values
  ('temper', 'hr_temper_view', '2027-02-27-tempering.sql: each Tempering ladder, this hero''s rung, the next rung''s offer at the server''s price')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §4 THE SELF-CHECK: THE SALE, PLAYED ON A PROBE ACCOUNT ────────────────
do $mig$
declare
  v_u uuid := '00000000-0000-4000-c000-7e3b3e700001';
  k text := '00000000-0000-4000-c000-7e3b3e70';
  v jsonb; h jsonb; ver bigint; v_purse bigint; v_r1 public.hr_unlock_offers%rowtype; v_r2 public.hr_unlock_offers%rowtype;
  i int; v_ladders int := (select count(*) from public.hr_unlocks where namespace = 'temper');
begin
  select * into v_r1 from public.hr_unlock_offers where offer_id = 'temper.blows.2.1';
  select * into v_r2 from public.hr_unlock_offers where offer_id = 'temper.blows.2.2';
  if v_r1.offer_id is null or v_r2.offer_id is null then raise exception 'tempering §4: the catalogue has no first rungs to probe with'; end if;
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'tempering §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'tempering §4: hr_create_character refused: %', v; end if;
    update public.account_wallet set gold = v_r1.gold + 5 where user_id = v_u;

    -- (a) A NEW HERO: every ladder at rung 0, rung 1 next, at the catalogue's price, in the envelope and the perk channel.
    h := public.hr_state_of(v_u, 0)->'temper';
    if jsonb_array_length(h) <> v_ladders
       or exists (select 1 from jsonb_array_elements(h) e where (e->>'rung')::int <> 0 or (e->>'max')::int <> 5
                     or e->>'offer' is distinct from 'temper.' || (e->>'track') || '.' || (e->>'tier') || '.1'
                     or (e->>'gold')::bigint <> (select o.gold from public.hr_unlock_offers o where o.offer_id = e->>'offer')) then
      raise exception 'tempering §4(a): a new hero reads %', h; end if;
    if public.hr_perks_of(v_u, 0)->'temper' is distinct from '{}'::jsonb then
      raise exception 'tempering §4(a): a new hero''s perks read %', public.hr_perks_of(v_u, 0); end if;

    -- (b) A SKIPPED RUNG IS REFUSED AND MOVES NOTHING.
    select version into ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_unlock_buy(v_u, 0, ver, (k || '0001')::uuid, v_r2.offer_id);
    if v->>'error' is distinct from 'rung_skipped' or (select gold from public.account_wallet where user_id = v_u) <> v_r1.gold + 5 then
      raise exception 'tempering §4(b): rung 2 first answered %', v; end if;

    -- (c) RUNG 1: the purse moves by the catalogue's price and the rung lands, journalled, read back on both channels.
    select version into ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_unlock_buy(v_u, 0, ver, (k || '0002')::uuid, v_r1.offer_id);
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.account_wallet where user_id = v_u) <> 5 then
      raise exception 'tempering §4(c): rung 1 answered %, the purse holds %', v, (select gold from public.account_wallet where user_id = v_u); end if;
    if not exists (select 1 from public.player_ledger l where l.user_id = v_u and l.slot = 0 and l.kind = 'shop' and l.gold = -v_r1.gold
                     and l.intent = 'unlock_buy:temper.blows.2.1:1' and l.meta->>'unlock' = 'temper:blows:2') then
      raise exception 'tempering §4(c): no ledger row for the sale'; end if;
    if (public.hr_perks_of(v_u, 0)->'temper'->>'temper:blows:2')::int is distinct from 1 then
      raise exception 'tempering §4(c): the perks read %', public.hr_perks_of(v_u, 0); end if;
    h := v->'temper';
    if not exists (select 1 from jsonb_array_elements(h) e where e->>'track' = 'blows' and (e->>'tier')::int = 2 and (e->>'rung')::int = 1 and e->>'offer' = v_r2.offer_id and (e->>'gold')::bigint = v_r2.gold)
       or exists (select 1 from jsonb_array_elements(h) e where not (e->>'track' = 'blows' and (e->>'tier')::int = 2) and (e->>'rung')::int <> 0) then
      raise exception 'tempering §4(c): the envelope''s section reads %', h; end if;
    -- the same intent again replays and charges nothing
    update public.account_wallet set gold = 1000000 where user_id = v_u;
    v := public.hr_unlock_buy(v_u, 0, (select version from public.player_state where user_id = v_u and slot = 0), (k || '0002')::uuid, v_r1.offer_id);
    if coalesce(v->>'replayed', '') <> 'true' or (select gold from public.account_wallet where user_id = v_u) <> 1000000 then
      raise exception 'tempering §4(c): the intent replayed as %', v; end if;

    -- (d) RUNG 1 AGAIN, NEW INTENT: already_owned, nothing charged. NO GOLD: insufficient_gold, no rung.
    select version into ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_unlock_buy(v_u, 0, ver, (k || '0003')::uuid, v_r1.offer_id);
    if v->>'error' is distinct from 'already_owned' or (select gold from public.account_wallet where user_id = v_u) <> 1000000 then
      raise exception 'tempering §4(d): re-buying rung 1 answered %', v; end if;
    update public.account_wallet set gold = v_r2.gold - 1 where user_id = v_u;
    select version into ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_unlock_buy(v_u, 0, ver, (k || '0004')::uuid, v_r2.offer_id);
    if v->>'error' is distinct from 'insufficient_gold' or (public.hr_perks_of(v_u, 0)->'temper'->>'temper:blows:2')::int <> 1 then
      raise exception 'tempering §4(d): rung 2 short by a coin answered %', v; end if;

    -- (e) THE TOP OF A LADDER HAS NO NEXT RUNG, AND THE TOP CANNOT BE PASSED.
    update public.account_wallet set gold = 100000000 where user_id = v_u;
    for i in 2..5 loop
      select version into ver from public.player_state where user_id = v_u and slot = 0;
      v := public.hr_unlock_buy(v_u, 0, ver, (k || lpad((10 + i)::text, 4, '0'))::uuid, 'temper.blows.2.' || i);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'tempering §4(e): rung % answered %', i, v; end if;
    end loop;
    h := public.hr_temper_view(v_u, 0);
    if not exists (select 1 from jsonb_array_elements(h) e where e->>'track' = 'blows' and (e->>'tier')::int = 2 and (e->>'rung')::int = 5 and e->'offer' = 'null'::jsonb and e->'gold' = 'null'::jsonb) then
      raise exception 'tempering §4(e): a full ladder reads %', h; end if;

    -- (f) A RUNG IS THE HERO'S, NOT THE ACCOUNT'S: a second hero of the account reads rung 0.
    insert into public.player_state (user_id, slot) select v_u, 1 where not exists (select 1 from public.player_state where user_id = v_u and slot = 1);
    if public.hr_perks_of(v_u, 1)->'temper' is distinct from '{}'::jsonb
       or exists (select 1 from jsonb_array_elements(public.hr_temper_view(v_u, 1)) e where (e->>'rung')::int <> 0) then
      raise exception 'tempering §4(f): slot 1 reads slot 0''s rungs: %', public.hr_perks_of(v_u, 1); end if;
    -- the perk channel's other keys are all still answered
    if not (public.hr_perks_of(v_u, 0) ?& array['ok', 'rooms', 'plots', 'propertyTier', 'unlockedRecipes', 'renownAllXp', 'companion', 'temper', 'sources']) then
      raise exception 'tempering §4(f): the perk channel lost a key: %', public.hr_perks_of(v_u, 0); end if;

    raise exception using errcode = 'HR893', message = 'tempering §4 complete - rolling back';
  exception when sqlstate 'HR893' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.player_progress where user_id = v_u)
     or exists (select 1 from public.player_ledger where user_id = v_u) then
    raise exception 'tempering §4: a probe row leaked'; end if;
  -- (g) THE GRANTS: both reads are server-only; the seller is still the engine's alone.
  if has_function_privilege('anon', 'public.hr_temper_view(uuid,integer)', 'execute') or has_function_privilege('authenticated', 'public.hr_temper_view(uuid,integer)', 'execute')
     or has_function_privilege('service_role', 'public.hr_temper_view(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_perks_of(uuid,integer)', 'execute') or has_function_privilege('anon', 'public.hr_perks_of(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_unlock_buy(uuid,integer,bigint,uuid,text)', 'execute') or has_function_privilege('anon', 'public.hr_unlock_buy(uuid,integer,bigint,uuid,text)', 'execute') then
    raise exception 'tempering §4(g): a client role can reach a Tempering door'; end if;
  raise notice 'tempering §4 OK: the sale, the refusals, the ledger, per hero, the section and the grants';
end $mig$;
