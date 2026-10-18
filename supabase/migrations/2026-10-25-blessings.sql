-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — BLESSINGS: PROTECTION FROM THE XP A DEATH TAKES (lane S2;
-- Tyler 2026-10-18: three tiers, ≈32 / 63 / 95 % less XP lost, each dearer
-- than the last, all free under combat level 30, USED UP by a death;
-- src/data/blessings.js). STAGED. Game CLOSED: applies on its passing §4;
-- Security reviews it with every S2 money surface in the reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- player_blessings (user, slot, tier): a held tier, with the gold paid and when.
-- THE SECTION `blessings` {held: [tier], permille, free_until, tiers: [{tier,
--   permille, price, held}]} — every price the server's (hr_blessing_price).
-- THE VERB hr_blessing_buy(p_slot, p_tier, p_price, p_idem) — MONEY: a tier
--   needs every tier below it (`needs_previous`); held → `already_blessed`;
--   priced free under hr_blessing_rule.free_until_level, else base + per_level
--   x (level − free_until) (hr_bounty_combat_level); `quote_changed` when the
--   price is not the one shown; a paid tier is ONE hr_apply {gold: -price}
--   journalled kind shop, intent blessing_buy:<tier>; a free one journals the
--   same intent at 0 gold. Idempotent.
-- THE DEATH HOOK (called by name from S1's death-XP rule, restated whole in
-- 2026-10-25-settle-hooks.sql's hr_hunt_apply_member §6):
--   hr_blessing_take(user, slot, session, falls' xp, window start) — when a
--   settled window holds a fall, the FIRST fall's loss per skill keeps only
--   loss − floor(loss x permille / 1000) (permille = the highest tier held
--   since before the window began); every tier so used is deleted (used up)
--   and journalled (kind hunt, intent blessing_used, the XP it saved). Later
--   falls in the window are unprotected. The edge still proposes the
--   unblessed loss (it does not know blessings) and SQL bounds it as before;
--   the debit, the stored fall events and the settle's answer (death_xp) carry
--   the blessed loss. (The edge's live timeline carries no XP: falls are member events.)
--   A tier bought DURING a window protects from the next one: a blessing
--   cannot be bought after a death to cover it.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- A gold sink. The XP saved is bounded by the loss the settle already bounds
-- (≤ the level gap's death permille); a blessing never adds XP, only reduces
-- a debit, once per death. No client number prices it.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Drop hr_blessing_buy (+ baseline row), the section row + view, the helpers,
-- the table, AFTER reverting 2026-10-25-settle-hooks.sql (its caller).
-- ORDER: after 2026-10-25-stamina-refill.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_blessing_tiers') is null or to_regclass('public.hr_blessing_rule') is null
     or to_regclass('public.player_state') is null then
    raise exception 'PRECONDITION: the alpha catalogue and the S1 member settle are absent'; end if;
end $mig$;

-- ── §1 THE TABLE AND THE PRICE ───────────────────────────────────────────────
create table if not exists public.player_blessings (
  user_id   uuid not null,
  slot      int  not null,
  tier      smallint not null check (tier between 1 and 9),
  paid      bigint not null check (paid >= 0),
  bought_at timestamptz not null default now(),
  primary key (user_id, slot, tier),
  constraint player_blessings_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade
);
alter table public.player_blessings enable row level security;
revoke all on public.player_blessings from public, anon, authenticated, service_role;
comment on table public.player_blessings is
  '2026-10-25 (lane S2). Held blessing tiers: written by hr_blessing_buy, deleted (used up) by hr_blessing_take at a death.';

create or replace function public.hr_blessing_price(p_tier int, p_level int)
returns bigint language sql stable set search_path = public, pg_catalog as $$
  select case when p_level < r.free_until_level then 0
              else t.base::bigint + t.per_level::bigint * (p_level - r.free_until_level) end
    from public.hr_blessing_tiers t, public.hr_blessing_rule r
   where t.tier = p_tier and r.id
$$;
revoke execute on function public.hr_blessing_price(int, int) from public, anon, authenticated, service_role;

create or replace function public.hr_blessings_view(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  with lv as (select greatest(1, coalesce(public.hr_bounty_combat_level(p_user, p_slot), 1)) as level)
  select jsonb_build_object(
    'held', coalesce((select jsonb_agg(b.tier order by b.tier) from public.player_blessings b where b.user_id = p_user and b.slot = p_slot), '[]'::jsonb),
    'permille', coalesce((select max(t.permille) from public.player_blessings b join public.hr_blessing_tiers t on t.tier = b.tier
                           where b.user_id = p_user and b.slot = p_slot), 0),
    'free_until', (select r.free_until_level from public.hr_blessing_rule r where r.id),
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('tier', t.tier, 'permille', t.permille,
                                                           'price', public.hr_blessing_price(t.tier, lv.level),
                                                           'held', exists (select 1 from public.player_blessings b
                                                                            where b.user_id = p_user and b.slot = p_slot and b.tier = t.tier))
                                         order by t.tier)
                         from public.hr_blessing_tiers t, lv), '[]'::jsonb))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$$;
revoke execute on function public.hr_blessings_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('blessings', 'hr_blessings_view', '2026-10-25-blessings.sql: the held tiers, the protection they give and every tier''s price')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §2 THE PURCHASE ──────────────────────────────────────────────────────────
create or replace function public.hr_blessing_buy(p_slot int, p_tier int, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_lv int; v_price bigint; v_a jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_tier is null or p_price is null or p_price < 0 or p_price > 1000000000 then
    return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  v_verb := 'blessing_buy:' || p_tier;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('blessing_buy', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.hr_blessing_tiers t where t.tier = p_tier) then
    return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_tier')); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if exists (select 1 from public.player_blessings b where b.user_id = v_uid and b.slot = p_slot and b.tier = p_tier) then
    return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'already_blessed')); end if;
  if exists (select 1 from public.hr_blessing_tiers t where t.tier < p_tier
               and not exists (select 1 from public.player_blessings b where b.user_id = v_uid and b.slot = p_slot and b.tier = t.tier)) then
    return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'needs_previous')); end if;
  v_lv := greatest(1, coalesce(public.hr_bounty_combat_level(v_uid, p_slot), 1));
  v_price := public.hr_blessing_price(p_tier, v_lv);
  if v_price is distinct from p_price then
    return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed',
      'blessings', public.hr_blessings_view(v_uid, p_slot))); end if;
  if v_price > 0 then
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object('gold', -v_price,
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'blessing_buy', 'tier', p_tier, 'level', v_lv))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      return public.hr_note_rejection('blessing_buy', p_slot, v_a || jsonb_build_object('ok', false)); end if;
  else
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
      values (v_uid, p_slot, 'shop', v_verb, 0, jsonb_build_object('reason', 'blessing_buy', 'tier', p_tier, 'level', v_lv, 'free', true));
  end if;
  insert into public.player_blessings (user_id, slot, tier, paid, bought_at) values (v_uid, p_slot, p_tier, v_price, now());
  v_r := jsonb_build_object('ok', true, 'gold', -v_price, 'blessings', public.hr_blessings_view(v_uid, p_slot));
  if v_price = 0 then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  end if;
  return v_r;
end $$;
revoke execute on function public.hr_blessing_buy(int, int, bigint, uuid) from public;
revoke execute on function public.hr_blessing_buy(int, int, bigint, uuid) from anon, service_role;
grant  execute on function public.hr_blessing_buy(int, int, bigint, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_blessing_buy';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_blessing_buy', 'p_slot integer, p_tier integer, p_price bigint, p_idem uuid', 'authenticated',
   'added 2026-10-25 (lane S2): MONEY (a gold sink) - buy the next blessing tier at the server''s price (free under the level floor); refuses quote_changed; used up by a death');

-- ── §3 THE DEATH USES IT UP ──────────────────────────────────────────────────
-- Owner-only; called by hr_hunt_apply_member under the character lock with the
-- window's per-fall XP losses (already shape-checked) and the window's start.
-- Answers {dx, lost} (the blessed losses) or null when nothing protected the window.
create or replace function public.hr_blessing_take(p_user uuid, p_slot int, p_session uuid, p_dx jsonb, p_from timestamptz)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare
  v_pm int; v_tiers int[]; v_first jsonb := '{}'::jsonb; v_saved jsonb := '{}'::jsonb; v_k text; v_v jsonb; v_n bigint; v_keep bigint;
  v_dx jsonb; v_lost jsonb := '{}'::jsonb; v_el jsonb;
begin
  if p_dx is null or jsonb_typeof(p_dx) <> 'array' or jsonb_array_length(p_dx) = 0 then return null; end if;
  select max(t.permille), array_agg(b.tier order by b.tier) into v_pm, v_tiers
    from public.player_blessings b join public.hr_blessing_tiers t on t.tier = b.tier
   where b.user_id = p_user and b.slot = p_slot and b.bought_at <= p_from
  ;
  if v_pm is null then return null; end if;
  for v_k, v_v in select key, value from jsonb_each(p_dx->0) loop
    v_n := (v_v #>> '{}')::bigint;
    v_keep := v_n - floor(v_n * v_pm / 1000.0)::bigint;
    v_first := v_first || jsonb_build_object(v_k, v_keep);
    if v_n - v_keep > 0 then v_saved := v_saved || jsonb_build_object(v_k, v_n - v_keep); end if;
  end loop;
  v_dx := jsonb_set(p_dx, '{0}', v_first);
  for v_el in select value from jsonb_array_elements(v_dx) loop
    for v_k, v_v in select key, value from jsonb_each(v_el) loop
      if (v_v #>> '{}')::bigint > 0 then
        v_lost := v_lost || jsonb_build_object(v_k, coalesce((v_lost->>v_k)::bigint, 0) + (v_v #>> '{}')::bigint);
      end if;
    end loop;
  end loop;
  delete from public.player_blessings where user_id = p_user and slot = p_slot and tier = any (v_tiers);
  insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
    values (p_user, p_slot, 'hunt', 'blessing_used',
            jsonb_build_object('reason', 'blessing_used', 'tiers', to_jsonb(v_tiers), 'permille', v_pm, 'saved', v_saved), p_session);
  return jsonb_build_object('dx', v_dx, 'lost', v_lost);
end $$;
revoke execute on function public.hr_blessing_take(uuid, int, uuid, jsonb, timestamptz) from public, anon, authenticated, service_role;


-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid := '000000c0-0000-0000-0000-00005e2f0001';
  v jsonb; b jsonb; v_role text; v_free int := (select free_until_level from public.hr_blessing_rule where id);
  v_lv int; v_p bigint; v_t1 int := (select permille from public.hr_blessing_tiers where tier = 1);
  v_t3 int := (select max(permille) from public.hr_blessing_tiers);
begin
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'blessings §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    -- (a) under the level floor every tier is free; a tier needs the one below it.
    b := public.hr_state_of(v_u, 0)->'blessings';
    if exists (select 1 from jsonb_array_elements(b->'tiers') t where (t->>'price')::bigint <> 0) or b->'held' <> '[]'::jsonb then
      raise exception 'VERIFY(a): a fresh character''s blessings are %', b; end if;
    v := public.hr_blessing_buy(0, 2, 0, '000000c0-0000-4000-a000-00005e2f0101');
    if v->>'error' is distinct from 'needs_previous' then raise exception 'VERIFY(a): tier 2 first answered %', v; end if;
    v := public.hr_blessing_buy(0, 1, 0, '000000c0-0000-4000-a000-00005e2f0102');
    if coalesce(v->>'ok', '') <> 'true' or (v->'blessings'->>'permille')::int <> v_t1 then raise exception 'VERIFY(a): a free tier 1 answered %', v; end if;
    v := public.hr_blessing_buy(0, 1, 0, '000000c0-0000-4000-a000-00005e2f0103');
    if v->>'error' is distinct from 'already_blessed' then raise exception 'VERIFY(a): a second tier 1 answered %', v; end if;
    -- (b) over the floor the price is the server's; a wrong one is refused; the right one is charged once.
    insert into public.player_skills (user_id, slot, skill_id, xp)
      select v_u, 0, s, (select xp from public.hr_xp_table where level = v_free + 10)
        from unnest(array['attack', 'strength', 'defense', 'hitpoints']) s
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    v_lv := public.hr_bounty_combat_level(v_u, 0);
    if v_lv < v_free then raise exception 'VERIFY(b): the probe is level %, under %', v_lv, v_free; end if;
    v_p := public.hr_blessing_price(2, v_lv);
    if v_p <> (select base + per_level * (v_lv - v_free) from public.hr_blessing_tiers where tier = 2) then raise exception 'VERIFY(b): tier 2 costs %', v_p; end if;
    update public.player_state set gold = v_p where user_id = v_u and slot = 0;
    v := public.hr_blessing_buy(0, 2, v_p - 1, '000000c0-0000-4000-a000-00005e2f0104');
    if v->>'error' is distinct from 'quote_changed' then raise exception 'VERIFY(b): a wrong price answered %', v; end if;
    v := public.hr_blessing_buy(0, 2, v_p, '000000c0-0000-4000-a000-00005e2f0105');
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.player_state where user_id = v_u and slot = 0) <> 0 then
      raise exception 'VERIFY(b): the paid tier answered %', v; end if;
    v := public.hr_blessing_buy(0, 3, public.hr_blessing_price(3, v_lv), '000000c0-0000-4000-a000-00005e2f0106');
    if v->>'error' is distinct from 'insufficient_gold' or exists (select 1 from public.player_blessings where user_id = v_u and tier = 3) then
      raise exception 'VERIFY(b): an unaffordable tier answered %', v; end if;
    -- (c) A DEATH: the first fall keeps the unprotected share, later falls are whole; the tiers are used up.
    update public.player_blessings set bought_at = now() - interval '1 hour' where user_id = v_u;
    v := public.hr_blessing_take(v_u, 0, null, '[{"attack": 1000, "defense": 40}, {"attack": 1000}]'::jsonb, now() - interval '1 minute');
    if (v->'dx'->0->>'attack')::bigint <> 1000 - floor(1000 * (select max(permille) from public.hr_blessing_tiers where tier <= 2) / 1000.0)
       or (v->'dx'->1->>'attack')::bigint <> 1000
       or (v->'lost'->>'attack')::bigint <> (v->'dx'->0->>'attack')::bigint + 1000
       or exists (select 1 from public.player_blessings where user_id = v_u)
       or not exists (select 1 from public.player_ledger where user_id = v_u and intent = 'blessing_used') then
      raise exception 'VERIFY(c): a blessed death answered %', v; end if;
    -- (d) a tier bought after the window began does not cover it (and is not used up).
    update public.player_skills set xp = 0 where user_id = v_u and slot = 0;
    v := public.hr_blessing_buy(0, 1, 0, '000000c0-0000-4000-a000-00005e2f0107');
    v := public.hr_blessing_take(v_u, 0, null, '[{"attack": 100}]'::jsonb, now() - interval '1 minute');
    if v is not null or not exists (select 1 from public.player_blessings where user_id = v_u and tier = 1) then
      raise exception 'VERIFY(d): a blessing bought mid-window covered the window: %', v; end if;
    if v_t3 <> (select permille from public.hr_blessing_tiers order by tier desc limit 1) then raise exception 'VERIFY(d): the top tier is not the strongest'; end if;
    raise exception using errcode = 'HR876', message = 'blessings §4 complete - rolling back';
  exception when sqlstate 'HR876' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) then raise exception 'VERIFY(e): §4 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.player_blessings', 'select,insert,update,delete')
       or has_function_privilege(v_role, 'public.hr_blessings_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_blessing_price(integer,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_blessing_take(uuid,integer,uuid,jsonb,timestamp with time zone)', 'execute') then
      raise exception 'VERIFY(e): % reaches a blessing table or internal', v_role; end if;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'blessings: free under the floor, server-priced above it, charged once, used up by the first fall of a window; all green';
end $$;
