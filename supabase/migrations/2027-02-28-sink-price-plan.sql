-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-28-sink-price-plan.sql — A SETTLE NO LONGER CALLS THE SINK HELPERS; THE PRICE RULE IS PLANNED ONCE
--   (lane/c-sink-price-plan, systems-engineer, 2026-11-05; tests/settle-budget.mjs SB-3 red on set/v0.2.93: hr_sink_price 5.3 calls a watched settle).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies
-- on its passing §3. Moves no value: every answer is the same, and §3 proves it rung by rung. EDGE: no deploy. CLIENT: none; the section keeps its shape.
-- APPLY ORDER: after 2027-02-28-titles.sql, in any order against the client.
--
-- ── WHAT REACHED THE SETTLE ──────────────────────────────────────────────────
-- No settle asks about a price. hr_state_of folds EVERY hr_state_sections row, and a watched 4-hero settle builds 5.33 envelopes (the commit, three
-- frames, 1.33 early asks). So the section `setup_slots` ran each time, and it read through helpers written for the verbs: per settle
-- hr_sink_price 5.3, hr_setups_of 5.3, hr_setups_bought 10.7, and 10.7 more of hr_hunt_limit. hr_sink_price is LANGUAGE sql, which PostgreSQL 17 re-plans
-- on every call. Nothing else on that path calls it: hr_town_sinks_view and the Crier's quote are window reads.
--
-- ── WHAT THIS DOES ───────────────────────────────────────────────────────────
--   hr_setup_slots_view  ONE statement, no helper: the rule row and the hero's rung, two primary key reads, the price by index. The envelope still carries
--                        the SERVER's count and price (CLAUDE.md §6): moving them to a client copy of the rules would save one read and let the browser disagree.
--                        Same keys, same values, for every rung, past the top and past a moved row (§3).
--   hr_sink_price        plpgsql, its body verbatim: the verbs and the Havora window call it, so it should be planned once per backend too.
-- hr_setups_of and hr_setups_bought stay as they are: only the verbs reach them now. tests/setup-slots.mjs SS-PARITY holds the section equal to them.
--
-- REVERSIBILITY: re-apply 2027-02-27-gold-sinks-seams.sql's hr_sink_price and 2027-02-28-setup-slots.sql's hr_setup_slots_view (§0 pins both). Nothing is stored here.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 THE PINS ──────────────────────────────────────────────────────────────
do $mig$
declare v_r record; v_md5 text;
begin
  -- each body is EXACTLY its live image (tests/live-hash-drift.baseline.json, measured 2026-11-05) or this file's own (a second apply)
  for v_r in select * from (values
    ('public.hr_sink_price(text,integer,integer)', 'd153f6419d2395a6206d125d525cc77a', 'e3ef0da5eff81c31ba01fe42f3089d58'),
    ('public.hr_setup_slots_view(uuid,integer)', '158bfe1a0ab93347a3b95717b4bce7de', 'b7a8ed034b203a10f3e498f5942c0e05')) t(fn, pre, post) loop
    v_md5 := md5(regexp_replace(pg_get_functiondef(v_r.fn::regprocedure), '[[:space:]]+', ' ', 'g'));
    if v_md5 is distinct from v_r.pre and v_md5 is distinct from v_r.post then
      raise exception 'PIN: % is neither its live pre-image (%) nor this file''s image (%): md5 % - another file moved it', v_r.fn, v_r.pre, v_r.post, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE PRICE RULE, PLANNED ONCE ──────────────────────────────────────────
create or replace function public.hr_sink_price(p_sink text, p_bought int, p_level int default null)
returns bigint language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
-- SINK-PRICE-PLAN (2027-02-28-sink-price-plan.sql): the 2027-02-27-gold-sinks-seams.sql body, verbatim, planned once per backend.
#variable_conflict use_column
begin
  return (select case when cardinality(r.prices) > 0 then r.prices[greatest(coalesce(p_bought, 0), 0) + 1]
              else r.price_base + r.price_per_level * greatest(coalesce(p_level, 1), 1) end
    from public.hr_sink_rules r where r.sink_id = p_sink);
end
$fn$;

-- ── §2 THE SECTION: ONE STATEMENT, NO HELPER ─────────────────────────────────
-- The limit is the row's own free + prices: tools/gen-gold-sinks.mjs refuses any other row and its catalogue's §4 asserts it against hr_hunt_limit('presets').
create or replace function public.hr_setup_slots_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
-- SINK-PRICE-PLAN (2027-02-28-sink-price-plan.sql): every envelope builds this, 5.33 a watched settle. Two primary key reads, no helper.
begin
  return (select jsonb_build_object('count', least(r.free + b.n, r.free + cardinality(r.prices)), 'free', r.free, 'bought', b.n,
                                    'max', r.free + cardinality(r.prices), 'price', r.prices[b.n + 1])
            from public.hr_sink_rules r
            cross join lateral (select greatest(coalesce((select p.value from public.player_progress p
                                                           where p.user_id = p_user and p.slot = p_slot and p.kind = 'stat'
                                                             and p.key = 'setup_slots_bought' and p.period_key = ''), 0), 0)::int as n) b
           where r.sink_id = 'setup_slot');
end $fn$;
revoke execute on function public.hr_sink_price(text, integer, integer) from public, anon, authenticated, service_role;
revoke execute on function public.hr_setup_slots_view(uuid, int) from public, anon, authenticated, service_role;

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $chk$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000901d5e13';
  v_free int; v_prices bigint[]; v_lim int; v jsonb; i int; f text; v_role text; v_body text; r record;
begin
  -- (a) The price rule reads as it did, on every row: the ladder climbs and ends in null, a Level price reads the Level, an unknown sink has none.
  for r in select * from public.hr_sink_rules loop
    if cardinality(r.prices) > 0 then
      for i in 1 .. cardinality(r.prices) loop
        if public.hr_sink_price(r.sink_id, i - 1) is distinct from r.prices[i] then raise exception 'sink-price-plan §3(a): % rung % reads wrong', r.sink_id, i; end if;
      end loop;
      if public.hr_sink_price(r.sink_id, cardinality(r.prices)) is not null then raise exception 'sink-price-plan §3(a): % has a rung past its top', r.sink_id; end if;
    elsif public.hr_sink_price(r.sink_id, 0, 18) is distinct from r.price_base + 18 * r.price_per_level then
      raise exception 'sink-price-plan §3(a): % reads the Level wrong', r.sink_id;
    end if;
  end loop;
  if public.hr_sink_price('no_such_sink', 0) is not null then raise exception 'sink-price-plan §3(a): an unknown sink has a price'; end if;
  -- (b) Planned once, and the section calls no helper: a settle reaches none of them.
  if (select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = 'public.hr_sink_price(text,integer,integer)'::regprocedure) <> 'plpgsql' then
    raise exception 'sink-price-plan §3(b): hr_sink_price is not plpgsql'; end if;
  v_body := (select prosrc from pg_proc where oid = 'public.hr_setup_slots_view(uuid,integer)'::regprocedure);
  if v_body ~ 'hr_sink_price\s*\(|hr_setups_of\s*\(|hr_setups_bought\s*\(|hr_hunt_limit\s*\(' then raise exception 'sink-price-plan §3(b): the section calls a helper again'; end if;
  -- (c) THE SECTION TELLS THE SAME TRUTH AS THE VERBS, at every rung and past the top: count = hr_setups_of, price = the verb's quote.
  select s.free, s.prices into v_free, v_prices from public.hr_sink_rules s where s.sink_id = 'setup_slot';
  v_lim := public.hr_hunt_limit('presets');
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'sink-price-plan §3 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'sink-price-plan §3(c): hr_create_character refused: %', v; end if;
    for i in 0 .. cardinality(v_prices) + 2 loop
      insert into public.player_progress as pp (user_id, slot, kind, key, period_key, value, updated_at)
        values (v_u, 0, 'stat', 'setup_slots_bought', '', i, now())
        on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value;
      v := public.hr_state_of(v_u, 0)->'setup_slots';
      if (v->>'count')::int is distinct from public.hr_setups_of(v_u, 0) or (v->>'free')::int is distinct from v_free or (v->>'bought')::int is distinct from i
         or (v->>'max')::int is distinct from v_lim
         or (v->>'price')::bigint is distinct from (case when public.hr_setups_of(v_u, 0) < v_lim then public.hr_sink_price('setup_slot', i) end) then
        raise exception 'sink-price-plan §3(c): at rung % the section reads %', i, v; end if;
    end loop;
    raise exception using errcode = 'HR935', message = 'sink-price-plan §3 complete - rolling back';
  exception when sqlstate 'HR935' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from auth.users where id = v_u) then
    raise exception 'sink-price-plan §3: LEAKED a probe row'; end if;
  -- (d) GRANTS: neither is a client's.
  foreach f in array array['public.hr_sink_price(text,integer,integer)', 'public.hr_setup_slots_view(uuid,integer)'] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_function_privilege(v_role, f, 'execute') then raise exception 'sink-price-plan §3(d): % reaches %', v_role, f; end if;
    end loop;
  end loop;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'sink-price-plan: a settle calls no sink helper, the price rule is planned once, and the section reads as the verbs do at every rung; all green';
end $chk$;
