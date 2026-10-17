-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE DAILY LOGIN REWARD IS PREMIUM-ONLY (lane S1; Tyler
-- 2026-10-17: "premium characters only; it starts as a single training
-- weapon"; streaks must never punish a missed day). STAGED. Game CLOSED:
-- applies on its passing §4; Security reviews it in the reopen gate.
--
-- ── THE DOOR ─────────────────────────────────────────────────────────────────
-- hr_login_claim(p_slot, p_idem), authenticated, is THE ONE way to claim. It is
-- the house pattern (2026-08-08-clan-seat.sql): the reward is the server's
-- catalogue row (hr_premium_login_reward, generated from src/data/premium.js),
-- the day is the server's (hr_utc_day_key(now())), the clamp is one claim a
-- UTC day per character (today's daily:login progress row), every claim is
-- journalled (one `quest` ledger row `login_claim`), there is no client write
-- policy and the client sends nothing but its slot and an idempotency key.
-- Refused, by name: premium_required (a free character — journalled through
-- hr_note_rejection), already_claimed, no_character.
-- The C2 door (a claim op inside hr_apply, re-priced by hr_login_claim_verify)
-- stays SHUT exactly as 2026-10-23-demolition-login-catalogue.sql left it: its
-- verify refuses every claim login_reward_off, so there is one door, not two.
--
-- ── THE COUNT THAT ONLY GOES UP ─────────────────────────────────────────────
-- player_state.login_days is the character's count of CLAIMED days. Every claim
-- adds one; nothing else writes it and nothing ever lowers it. A missed day
-- PAUSES it — the next claim is day n + 1, not day 1 — and a milestone keyed on
-- it can never be lost. (The C2 rule cost one step per missed day; the older
-- one reset to day 1. Both are gone.) The claim row's `value` is the day number
-- it made, so the timeline can say "day 12".
--
-- ── THE REWARD ──────────────────────────────────────────────────────────────
-- hr_premium_login_reward: ONE item id (or null) and a quantity. Today it is
-- NULL: no training-weapon row exists, and an item may not ship without a
-- source and a use (CLAUDE.md §3.5; the training activity is reserved in
-- RESUMABLE_KINDS, not built). A claim then pays nothing and still counts its
-- day. Filling the row (premium.js + the regenerated catalogue) is the whole
-- change; this body prices exactly that row. §4 proves an item-paying row too.
--
-- §3 registers the `login` envelope section: { premium, days, claimed_today, reward }.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Drop hr_login_claim (+ its baseline row) and hr_login_view (+ its section
-- row); the login_days column may stay (inert). The C2 door is untouched.
-- ORDER: after 2026-10-23-character-premium.sql. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regprocedure('public.hr_premium_active(uuid,integer,timestamp with time zone)') is null
     or to_regclass('public.hr_state_sections') is null then
    raise exception 'PRECONDITION: apply 2026-10-23-character-premium.sql first';
  end if;
  if to_regclass('public.hr_premium_login_reward') is null or not exists (select 1 from public.hr_premium_login_reward) then
    raise exception 'PRECONDITION: no hr_premium_login_reward row — apply 2026-10-23-hunt-sessions-catalogue.generated.sql first';
  end if;
  if to_regprocedure('public.hr_utc_day_key(timestamp with time zone)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'PRECONDITION: hr_utc_day_key / hr_rpc_gate is absent';
  end if;
end $mig$;

-- ── §1 THE COUNT ─────────────────────────────────────────────────────────────
alter table public.player_state add column if not exists login_days int not null default 0;
do $mig$
begin
  if not exists (select 1 from pg_constraint where conname = 'player_state_login_days_ck'
                   and conrelid = 'public.player_state'::regclass) then
    alter table public.player_state add constraint player_state_login_days_ck check (login_days >= 0);
  end if;
end $mig$;
comment on column public.player_state.login_days is
  '2026-10-23 (lane S1, Tyler 2026-10-17). Premium daily-login days CLAIMED by this character. Only goes up '
  '(+1 per claim, written only by hr_login_claim); a missed day pauses it and never resets it.';

-- ── §2 THE DOOR ──────────────────────────────────────────────────────────────
create or replace function public.hr_login_claim(p_slot int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'login_claim';
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_day  text;
  v_n    int;
  v_item text;
  v_qty  int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hr_claim_daily') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;

  -- THE CHARACTER LOCK (hr_apply's key) and the row.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_slot::text, 0));
  perform 1 from public.player_state where user_id = v_uid and slot = p_slot for update;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- PREMIUM, at the server's instant, from the server's column.
  if not public.hr_premium_active(v_uid, p_slot, now()) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'premium_required')); end if;
  -- ONE CLAIM A UTC DAY, on the server's day.
  v_day := public.hr_utc_day_key(now());
  if exists (select 1 from public.player_progress where user_id = v_uid and slot = p_slot
               and kind = 'daily' and key = 'login' and period_key = v_day and state = 'claimed') then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'already_claimed', 'day', v_day)); end if;

  update public.player_state set login_days = login_days + 1, version = version + 1, updated_at = now()
   where user_id = v_uid and slot = p_slot
   returning login_days into v_n;
  insert into public.player_progress as pp (user_id, slot, kind, key, value, period_key, state, updated_at)
    values (v_uid, p_slot, 'daily', 'login', v_n, v_day, 'claimed', now())
    on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value, state = 'claimed', updated_at = now();
  -- THE REWARD: the catalogue row, nothing else.
  select r.item_id, r.qty into v_item, v_qty from public.hr_premium_login_reward r where r.id;
  if v_item is not null then
    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (v_uid, p_slot, v_item, v_qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
  end if;
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
    values (v_uid, p_slot, 'quest', c_verb, v_item, case when v_item is null then 0 else v_qty end,
            jsonb_build_object('day', v_day, 'login_days', v_n, 'item', v_item, 'qty', case when v_item is null then 0 else v_qty end));
  v_r := jsonb_build_object('ok', true, 'day', v_day, 'login_days', v_n,
                            'reward', jsonb_build_object('item', v_item, 'qty', case when v_item is null then 0 else v_qty end),
                            'version', (select version from public.player_state where user_id = v_uid and slot = p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_login_claim(int, uuid) from public;
revoke execute on function public.hr_login_claim(int, uuid) from anon, service_role;
grant  execute on function public.hr_login_claim(int, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where proname = 'hr_login_claim';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_login_claim', 'p_slot integer, p_idem uuid', 'authenticated',
   'added 2026-10-23 (lane S1, Tyler 2026-10-17): the premium-only daily login claim. Server catalogue, server day, one claim a UTC day, '
   'login_days only goes up, one quest ledger row; the client sends its slot and a key');

-- ── §3 THE `login` SECTION ───────────────────────────────────────────────────
create or replace function public.hr_login_view(p_user uuid, p_slot int)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select jsonb_build_object(
    'premium', public.hr_premium_active(p_user, p_slot, now()),
    'days', ps.login_days,
    'claimed_today', exists (select 1 from public.player_progress pp where pp.user_id = p_user and pp.slot = p_slot
                              and pp.kind = 'daily' and pp.key = 'login'
                              and pp.period_key = public.hr_utc_day_key(now()) and pp.state = 'claimed'),
    'reward', (select jsonb_build_object('item', r.item_id, 'qty', r.qty) from public.hr_premium_login_reward r where r.id))
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot
$$;
revoke execute on function public.hr_login_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('login', 'hr_login_view', '2026-10-23-premium-login-reward.sql: premium, days claimed (only goes up), claimed today, the reward')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_uid  constant uuid := '000000c0-0000-0000-0000-00005e1a0002';
  v      jsonb;
  v_day  text := public.hr_utc_day_key(now());
  v_inv  bigint;
  v_item text := (select i.item_id from public.hr_items i order by i.item_id limit 1);
  v_role text;
  v_item0 text := (select r.item_id from public.hr_premium_login_reward r where r.id);
  v_qty0  int  := (select r.qty from public.hr_premium_login_reward r where r.id);
begin
  -- (a) the shipped reward row is premium.js's: today, no item yet.
  if (select item_id from public.hr_premium_login_reward where id) is not null then
    raise notice 'premium-login-reward: the reward row names %', (select item_id from public.hr_premium_login_reward where id);
  end if;
  -- (b) EXECUTED.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_uid, 'premium-login-reward §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): hr_create_character refused: %', v; end if;
    -- a FREE character is refused by name, and nothing moves.
    v := public.hr_login_claim(0, '000000c0-0000-4000-a000-00005e1a0201');
    if v->>'error' is distinct from 'premium_required' then raise exception 'VERIFY(b): a free claim answered %', v; end if;
    if (select login_days from public.player_state where user_id = v_uid and slot = 0) <> 0
       or exists (select 1 from public.player_ledger where user_id = v_uid and intent = 'login_claim') then
      raise exception 'VERIFY(b): a refused claim moved the count or journalled'; end if;
    -- premium, an item-paying row: day 1 pays exactly the row, once.
    perform public.hr_premium_grant(v_uid, 0, now() + interval '30 days', 'probe');
    update public.hr_premium_login_reward set item_id = v_item, qty = 1 where id;
    select coalesce((select qty from public.player_inventory where user_id = v_uid and slot = 0 and item_id = v_item), 0) into v_inv;
    v := public.hr_login_claim(0, '000000c0-0000-4000-a000-00005e1a0202');
    if coalesce(v->>'ok', '') <> 'true' or (v->>'login_days')::int <> 1 or v->'reward'->>'item' is distinct from v_item then
      raise exception 'VERIFY(b): the first premium claim answered %', v; end if;
    if (select qty from public.player_inventory where user_id = v_uid and slot = 0 and item_id = v_item) <> v_inv + 1 then
      raise exception 'VERIFY(b): the claim did not pay exactly one %', v_item; end if;
    if (select count(*) from public.player_ledger where user_id = v_uid and kind = 'quest' and intent = 'login_claim') <> 1 then
      raise exception 'VERIFY(b): the claim was not journalled once'; end if;
    -- the same key replays; a second claim the same day is refused; nothing more pays.
    v := public.hr_login_claim(0, '000000c0-0000-4000-a000-00005e1a0202');
    if (v->>'login_days')::int is distinct from 1 then raise exception 'VERIFY(b): the retry did not replay: %', v; end if;
    v := public.hr_login_claim(0, '000000c0-0000-4000-a000-00005e1a0203');
    if v->>'error' is distinct from 'already_claimed' then raise exception 'VERIFY(b): a second claim today answered %', v; end if;
    if (select qty from public.player_inventory where user_id = v_uid and slot = 0 and item_id = v_item) <> v_inv + 1 then
      raise exception 'VERIFY(b): a replay or second claim paid'; end if;
    -- A MISSED DAY PAUSES, NEVER RESETS: move today's claim five days back (four
    -- days missed); the next claim is day 2.
    update public.player_progress set period_key = public.hr_utc_day_key(now() - interval '5 days')
     where user_id = v_uid and slot = 0 and kind = 'daily' and key = 'login' and period_key = v_day;
    v := public.hr_login_claim(0, '000000c0-0000-4000-a000-00005e1a0204');
    if coalesce(v->>'ok', '') <> 'true' or (v->>'login_days')::int <> 2 then
      raise exception 'VERIFY(b): after four missed days the claim was not day 2: %', v; end if;
    -- a null reward pays nothing and still counts the day.
    update public.hr_premium_login_reward set item_id = null where id;
    update public.player_progress set period_key = public.hr_utc_day_key(now() - interval '1 day')
     where user_id = v_uid and slot = 0 and kind = 'daily' and key = 'login' and period_key = v_day;
    v := public.hr_login_claim(0, '000000c0-0000-4000-a000-00005e1a0205');
    if (v->>'login_days')::int <> 3 or v->'reward'->>'item' is not null or (v->'reward'->>'qty')::int <> 0 then
      raise exception 'VERIFY(b): a null reward did not count the day and pay nothing: %', v; end if;
    -- a lapse: premium gone, the claim refused, the count kept.
    update public.player_state set premium_until = now() - interval '1 second' where user_id = v_uid and slot = 0;
    update public.player_progress set period_key = public.hr_utc_day_key(now() - interval '2 days')
     where user_id = v_uid and slot = 0 and kind = 'daily' and key = 'login' and period_key = v_day;
    v := public.hr_login_claim(0, '000000c0-0000-4000-a000-00005e1a0206');
    if v->>'error' is distinct from 'premium_required'
       or (select login_days from public.player_state where user_id = v_uid and slot = 0) <> 3 then
      raise exception 'VERIFY(b): a lapsed claim answered % or moved the count', v; end if;
    -- the section.
    v := public.hr_state_of(v_uid, 0);
    if (v->'login'->>'days')::int <> 3 or (v->'login'->>'premium')::boolean then
      raise exception 'VERIFY(b): the login section is %', v->'login'; end if;
    raise exception using errcode = 'HR857', message = 'premium-login-reward §4 complete - rolling back';
  exception when sqlstate 'HR857' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid) or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'VERIFY(c): §4 LEAKED a probe row'; end if;
  if (select item_id from public.hr_premium_login_reward where id) is distinct from v_item0
     or (select qty from public.hr_premium_login_reward where id) is distinct from v_qty0 then
    raise exception 'VERIFY(c): the reward probe was not rolled back'; end if;
  -- (d) grants: the door is authenticated-only and gated; the view is not client-callable.
  if has_function_privilege('anon', 'public.hr_login_claim(integer,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_login_claim(integer,uuid)', 'execute') then
    raise exception 'VERIFY(d): hr_login_claim grants are wrong'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_login_view(uuid,integer)', 'execute') then
      raise exception 'VERIFY(d): % can execute hr_login_view', v_role; end if;
  end loop;
  if strpos((select prosrc from pg_proc where oid = 'public.hr_login_claim(integer,uuid)'::regprocedure), 'hr_rpc_gate') = 0 then
    raise exception 'VERIFY(d): hr_login_claim does not call the rate gate'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'premium-login-reward: premium-only, one claim a UTC day, login_days only goes up (a missed day pauses), one ledger row, the catalogue row is the reward; all green';
end $$;
