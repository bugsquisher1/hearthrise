-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — BUYING STAMINA WITH GOLD (lane S2; Tyler 2026-10-18: restores
-- at most 4 h, never above the cap, a partial refill priced pro rata, every
-- purchase counts toward the escalation; src/data/stamina-refill.js;
-- ARCHITECTURE_CONTRACTS §3 Stamina (b)). STAGED. Game CLOSED: applies on its
-- passing §3; Security reviews it with every S2 money surface in the reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- hr_stamina_refill_quote(user, slot): the next purchase, priced by the server
--   from hr_stamina_refill_rule (generated from STAMINA_REFILL) at the pool's
--   own instant — a hunting character's settled_to (the pool lives there while
--   a session is open, 2026-10-23-character-premium.sql), else now():
--     restored_min = min(max_min, cap_min - current_min)   (refused <= 0: `stamina_full`)
--     n            = purchases this UTC day + 1             (refused > per_day: `refill_limit`)
--     price        = ceil((base + per_level x combat level) x (step_den + step_num x (n - 1))
--                         x restored_min / (step_den x max_min))
--   combat level = hr_bounty_combat_level (the same one the hunt hero shows).
-- THE SECTION `stamina_refill` {available, why, restore_ms, price, n, per_day}.
-- THE VERB hr_stamina_refill(p_slot, p_price, p_idem) — MONEY: under the
--   character lock (hr_hunt_lock) it re-quotes; refuses `quote_changed`
--   (carrying the new quote) when its price is not the one the player was shown;
--   `stamina_ahead` if the pool were already written past the instant; otherwise
--   ONE hr_apply {gold: -price} (insufficient_gold is hr_apply's) journalled kind
--   shop, intent stamina_refill:<price> (the per-day count reads that intent
--   prefix from the append-only ledger), then the pool is written at the
--   instant: min(cap, current + restored). Idempotent on hr_apply's row.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- A gold sink only (gold never comes back). No client number prices it; the
-- quote check means a second press re-prices (n + 1) and is refused rather
-- than charged twice. The pool never exceeds the cap at its instant; the
-- settle's stamina bound (hr_hunt_apply_member 5a) re-reads the pool, so a
-- refill during a hunt simply raises the start of the next window. A settle
-- the edge computed BEFORE a refill landed is refused once (bad_stamina) and
-- re-proposed from the new pool on the next tick.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Drop hr_stamina_refill (+ baseline row), the section row + view, the quote.
-- ORDER: after 2026-10-25-account-items.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_stamina_refill_rule') is null or to_regprocedure('public.hr_stamina_of(uuid,integer,timestamp with time zone)') is null
     or to_regprocedure('public.hr_stamina_cap(uuid,integer,timestamp with time zone)') is null then
    raise exception 'PRECONDITION: the alpha catalogue and the stamina pool (2026-10-23-character-premium.sql) are absent'; end if;
end $mig$;

-- ── §1 THE QUOTE AND THE SECTION ─────────────────────────────────────────────
create or replace function public.hr_stamina_refill_quote(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  r public.hr_stamina_refill_rule%rowtype; v_s public.hunt_sessions%rowtype;
  v_at timestamptz; v_cur bigint; v_cap bigint; v_min bigint; v_n int; v_lv int; v_price bigint;
begin
  select * into r from public.hr_stamina_refill_rule where id;
  if not found or not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  select * into v_s from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null;
  v_at := coalesce(v_s.settled_to, now());
  v_cur := public.hr_stamina_of(p_user, p_slot, v_at);
  v_cap := public.hr_stamina_cap(p_user, p_slot, v_at);
  if v_cur is null or v_cap is null then return null; end if;
  v_n := 1 + (select count(*) from public.player_ledger l
               where l.user_id = p_user and l.slot = p_slot and l.kind = 'shop' and l.intent like 'stamina\_refill:%'
                 and l.at >= public.hr_utc_day_start(now()))::int;
  v_min := least(r.max_min::bigint, v_cap / 60000 - v_cur / 60000);
  v_lv := greatest(1, coalesce(public.hr_bounty_combat_level(p_user, p_slot), 1));
  if v_min <= 0 then
    return jsonb_build_object('available', false, 'why', 'stamina_full', 'at', v_at, 'ms', v_cur, 'max_ms', v_cap, 'n', v_n, 'per_day', r.per_day);
  end if;
  if v_n > r.per_day then
    return jsonb_build_object('available', false, 'why', 'refill_limit', 'at', v_at, 'ms', v_cur, 'max_ms', v_cap, 'n', v_n, 'per_day', r.per_day);
  end if;
  v_price := ceil(((r.base + r.per_level * v_lv)::numeric * (r.step_den + r.step_num * (v_n - 1)) * v_min)
                  / (r.step_den::numeric * r.max_min))::bigint;
  return jsonb_build_object('available', true, 'why', null, 'at', v_at, 'ms', v_cur, 'max_ms', v_cap,
                            'restore_ms', v_min * 60000, 'price', v_price, 'n', v_n, 'per_day', r.per_day, 'level', v_lv);
end $$;
revoke execute on function public.hr_stamina_refill_quote(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('stamina_refill', 'hr_stamina_refill_quote', '2026-10-25-stamina-refill.sql: the next stamina purchase as the server prices it (or why there is none)')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §2 THE PURCHASE ──────────────────────────────────────────────────────────
create or replace function public.hr_stamina_refill(p_slot int, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_q jsonb; v_ver bigint; v_a jsonb; v_sat timestamptz; v_at timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('stamina_refill', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('stamina_refill', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 1 or p_price > 1000000000 then
    return public.hr_note_rejection('stamina_refill', p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  v_verb := 'stamina_refill:' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('stamina_refill', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  select version, stamina_at into v_ver, v_sat from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('stamina_refill', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_q := public.hr_stamina_refill_quote(v_uid, p_slot);
  if v_q is null then return public.hr_note_rejection('stamina_refill', p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  if not (v_q->>'available')::boolean then
    return public.hr_note_rejection('stamina_refill', p_slot, jsonb_build_object('ok', false, 'error', v_q->>'why', 'stamina_refill', v_q)); end if;
  if (v_q->>'price')::bigint <> p_price then
    return public.hr_note_rejection('stamina_refill', p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'stamina_refill', v_q)); end if;
  v_at := (v_q->>'at')::timestamptz;
  if v_sat is not null and v_sat > v_at then
    return public.hr_note_rejection('stamina_refill', p_slot, jsonb_build_object('ok', false, 'error', 'stamina_ahead')); end if;
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'gold', -p_price,
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', 'stamina_refill', 'n', (v_q->>'n')::int,
                                                                    'restore_ms', (v_q->>'restore_ms')::bigint, 'from_ms', (v_q->>'ms')::bigint,
                                                                    'level', (v_q->>'level')::int, 'at', v_at))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    return public.hr_note_rejection('stamina_refill', p_slot, v_a || jsonb_build_object('ok', false)); end if;
  update public.player_state
     set stamina_ms = least((v_q->>'max_ms')::bigint, (v_q->>'ms')::bigint + (v_q->>'restore_ms')::bigint), stamina_at = v_at
   where user_id = v_uid and slot = p_slot;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -p_price,
                            'restored_ms', (v_q->>'restore_ms')::bigint, 'stamina', public.hr_stamina_view(v_uid, p_slot));
end $$;
revoke execute on function public.hr_stamina_refill(int, bigint, uuid) from public;
revoke execute on function public.hr_stamina_refill(int, bigint, uuid) from anon, service_role;
grant  execute on function public.hr_stamina_refill(int, bigint, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_stamina_refill';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_stamina_refill', 'p_slot integer, p_price bigint, p_idem uuid', 'authenticated',
   'added 2026-10-25 (lane S2): MONEY (a gold sink) - buy up to 4 h of stamina, never above the cap, pro rata, escalating per UTC day, priced by the server; refuses quote_changed');

-- ── §3 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid := '000000c0-0000-0000-0000-00005e2e0001';
  v jsonb; q jsonb; v_role text; v_cap bigint; v_p1 bigint;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'stamina-refill §3 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    v_cap := public.hr_stamina_cap(v_u, 0, now());
    -- (a) a full pool cannot be refilled.
    update public.player_state set stamina_ms = v_cap, stamina_at = now(), gold = 1000000 where user_id = v_u and slot = 0;
    q := public.hr_state_of(v_u, 0)->'stamina_refill';
    if (q->>'available')::boolean or q->>'why' is distinct from 'stamina_full' then raise exception 'VERIFY(a): a full pool quotes %', q; end if;
    -- (b) an empty pool: 4 h at the first price; the purchase moves exactly that gold and that stamina.
    update public.player_state set stamina_ms = 0, stamina_at = now() where user_id = v_u and slot = 0;
    q := public.hr_stamina_refill_quote(v_u, 0);
    if (q->>'restore_ms')::bigint <> (select max_min from public.hr_stamina_refill_rule)::bigint * 60000 or (q->>'n')::int <> 1 then
      raise exception 'VERIFY(b): an empty pool quotes %', q; end if;
    v_p1 := (q->>'price')::bigint;
    if v_p1 <> (select ceil((base + per_level * (q->>'level')::int)::numeric) from public.hr_stamina_refill_rule) then
      raise exception 'VERIFY(b): the first full refill is not base + per_level x level: %', q; end if;
    v := public.hr_stamina_refill(0, v_p1 + 1, '000000c0-0000-4000-a000-00005e2e0101');
    if v->>'error' is distinct from 'quote_changed' then raise exception 'VERIFY(b): a wrong price answered %', v; end if;
    v := public.hr_stamina_refill(0, v_p1, '000000c0-0000-4000-a000-00005e2e0102');
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.player_state where user_id = v_u and slot = 0) <> 1000000 - v_p1
       or public.hr_stamina_of(v_u, 0, now()) < (q->>'restore_ms')::bigint then
      raise exception 'VERIFY(b): the purchase answered %', v; end if;
    -- (c) a replay charges nothing; the next purchase escalates (n = 2) and is pro rata near the cap.
    v := public.hr_stamina_refill(0, v_p1, '000000c0-0000-4000-a000-00005e2e0102');
    if (select gold from public.player_state where user_id = v_u and slot = 0) <> 1000000 - v_p1 then raise exception 'VERIFY(c): a replay charged again'; end if;
    update public.player_state set stamina_ms = v_cap - 60 * 60000, stamina_at = now() where user_id = v_u and slot = 0;
    q := public.hr_stamina_refill_quote(v_u, 0);
    if (q->>'n')::int <> 2 or (q->>'restore_ms')::bigint <> 60 * 60000
       or (q->>'price')::bigint <> (select ceil(((base + per_level * (q->>'level')::int)::numeric * (step_den + step_num) * 60) / (step_den::numeric * max_min))
                                       from public.hr_stamina_refill_rule) then
      raise exception 'VERIFY(c): the second, partial purchase quotes %', q; end if;
    v := public.hr_stamina_refill(0, (q->>'price')::bigint, '000000c0-0000-4000-a000-00005e2e0103');
    if public.hr_stamina_of(v_u, 0, now()) > v_cap then raise exception 'VERIFY(c): the pool went over the cap'; end if;
    -- (d) a short purse is hr_apply's refusal and moves no stamina.
    update public.player_state set stamina_ms = 0, stamina_at = now(), gold = 0 where user_id = v_u and slot = 0;
    q := public.hr_stamina_refill_quote(v_u, 0);
    v := public.hr_stamina_refill(0, (q->>'price')::bigint, '000000c0-0000-4000-a000-00005e2e0104');
    if v->>'error' is distinct from 'insufficient_gold' or (select stamina_ms from public.player_state where user_id = v_u and slot = 0) <> 0 then
      raise exception 'VERIFY(d): a short purse answered %', v; end if;
    -- (e) the day's limit: past per_day purchases the quote is refill_limit.
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
      select v_u, 0, 'shop', 'stamina_refill:1', -1, '{"probe": true}'::jsonb from generate_series(1, (select per_day from public.hr_stamina_refill_rule));
    q := public.hr_stamina_refill_quote(v_u, 0);
    if q->>'why' is distinct from 'refill_limit' then raise exception 'VERIFY(e): past the day''s purchases quotes %', q; end if;
    raise exception using errcode = 'HR875', message = 'stamina-refill §3 complete - rolling back';
  exception when sqlstate 'HR875' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) then raise exception 'VERIFY(f): §3 LEAKED a probe row'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_stamina_refill_quote(uuid,integer)', 'execute') then
      raise exception 'VERIFY(f): % reaches the stamina quote', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_stamina_refill(integer,bigint,uuid)', 'execute') then raise exception 'VERIFY(f): anon reaches hr_stamina_refill'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'stamina-refill: <= 4 h, never above the cap, pro rata, escalating per UTC day, charged once by hr_apply; all green';
end $$;
