-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1058-hunting-blocks.sql — BOUGHT HUNTING BLOCKS REPLACE THE STAMINA REFILL
--   (lane/r8-hunting-day, backend-architect, 2026-11-22; Tyler's rulings of 2026-11-22; 04-math-strategy.md section 11;
--   11-build-audit.md R8; src/data/time-blocks.js).
--
-- STATUS: supabase/migration-notes/1058-hunting-blocks.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12), after 1058-hunting-blocks-catalogue.generated.sql (hr_time_blocks,
--   hr_time_block_price) and 1058-hunting-blocks-hunt-sessions-catalogue.generated.sql (the 10 h free day). Applied as ONE transaction
--   by the apply tool; never begin/commit here. Ends with its §4 self-check.
-- EDGE: none. No engine or edge file reads a block: the settle re-reads the pool (hr_hunt_apply_member 5a), so a block bought during a
--   hunt raises the start of the next window, exactly as the refill did. Either side of any hr-accrue deploy.
-- CLIENT: the `time_blocks` section and hr_time_buy ride the next release AFTER this applies. Until then the old client's "+" reads no
--   `stamina_refill` section and shows its "No refill price yet" (Buy off): no money path is open in between.
--
-- ── RULINGS (Tyler 2026-11-22, newest wins) ──────────────────────────────────
--   The hunting day is 10 h, 12 h with Premium (the hunt-sessions catalogue's stamina_free_min / stamina_premium_min; Premium is the one
--   server check hr_premium_active: the hero's premium_until, or every hero while the beta switch is on). Extra hunting is bought in 2 h
--   blocks; each costs x1.5 the one before it that server day; at most 2 a day. Bought town work (later) is the same rule, capped at 4.
--   The price is hours of the wage at the hero's Level (hr_time_block_price -> hr_wage, the catalogue file; lane/w-wage: the day's first
--   is 4 hours of wage, about twice what its 2 h pay). Blocks REPLACE the live refill path: 1009's refill steps (4 h, six a
--   day) are retired (12-targets.md section 2.7); the refill verb and its quote leave here so no client can buy past the cap.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
--   hr_time_quote(p_user uuid, p_slot int, p_kind text) -> jsonb                          INTERNAL (no client role)
--     the next block of `kind` as the server prices it, at the pool's own instant (a hunting hero's settled_to, else now()):
--       { kind, available, why, at, ms, max_ms, ceiling_ms, block_ms, price, n, bought, per_day, level }
--       n       = blocks of this kind bought this UTC day (player_ledger, kind shop, intent time_buy:<kind>:%) + 1
--       price   = hr_time_block_price(kind, Level, n)                       (hr_level_of at the instant)
--       why     = 'block_limit'  n > per_day (the day's cap: 2 for hunting)
--                 'stamina_full' ms + block_ms > ceiling_ms, where ceiling_ms = the cap + per_day blocks (14 h free, 16 h Premium):
--                                bought time banks above the cap, never past one day's worth of blocks
--     null when the hero or the kind's row is missing.
--   THE SECTION `time_blocks` (hr_time_blocks_view) { <kind>: quote } for every catalogue kind ('hunt' today).
--   hr_time_buy(p_kind text, p_slot int, p_price bigint, p_idem uuid) -> jsonb              MONEY, authenticated
--     keyed (hr_intent_replay before AND under the hero's lock, 2027-04-19-key-under-lock.sql), rate-gated ('hunt'), under
--     hr_hunt_lock it re-quotes; refuses the quote's why, `quote_changed` (carrying the new quote) when p_price is not the server's
--     price, `stamina_ahead` if the pool were written past the instant; otherwise ONE hr_apply {gold: -price} journalled kind shop,
--     intent time_buy:<kind>:<price> (the day's count reads that prefix from the append-only ledger), then the pool is written at
--     the instant: ms + block_ms. A replayed key answers the first press and moves nothing.
--     -> { ok, version, kind, gold, added_ms, stamina: hr_stamina_view, time_blocks: { <kind>: the next quote } }
--   ERRORS: not_signed_in, bad_slot, bad_idem, bad_kind, bad_quote, rate_limited, no_character, catalogue_missing, block_limit,
--     stamina_full, quote_changed, stamina_ahead, insufficient_gold (hr_apply's), intent_mismatch (hr_intent_replay's).
--   RETIRED FROM EVERY CLIENT: hr_stamina_refill(int, bigint, uuid) (execute revoked from authenticated: no request role reaches it),
--     the `stamina_refill` section, its baseline row and its GM wall row. Its body, its quote and hr_stamina_refill_rule stay OWNER-ONLY
--     for one reason: 1009-approved-rows-alpha-catalogue.generated.sql (STAGED, retired by R6 per 12-targets.md 2.7) self-checks by
--     buying six refills through them, so dropping them here would make 1009 refuse a retry. They drop with 1009's retirement.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
--   Two presses race on hr_hunt_lock (the settle's own per-hero lock), so the quote, the charge and the pool write are one decision.
--   The key is read before the lock (a replay answers at once) and again under it (a second press that waited answers the first
--   press's decision); hr_apply's `replayed` answer ends the call. A second press with a NEW key re-prices (n + 1, x1.5) and is
--   refused quote_changed rather than charged a sum the player never saw. The settle's stamina bound re-reads the pool, so a settle
--   the edge computed before a purchase landed is refused once (bad_stamina) and re-proposed from the new pool on the next tick.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
--   A gold sink only: gold never comes back. No client number prices it (the price is checked, never used, past the equality).
--   At most per_day blocks a UTC day a hero, never a pool past the cap + a day's blocks; no request role can reach the refill that
--   sold 24 h a day (§1, asserted in §4 f), so the 14 h / 16 h bound holds. Crowns reach it only as gold bought from players. ON THE PRE-EA SECURITY LIST (a money surface).
--
-- ── COST ────────────────────────────────────────────────────────────────────
--   The section scans this hero's ledger rows of today by player_ledger_user_idx, as the refill's quote did (cost-neutral: it replaces
--   that section). A purchase writes one ledger row and one intent row: at most 2 a hero a day, ~600 bytes; at 100x (2,000 accounts x
--   4 heroes) at most 16,000 rows a day, under 10 MB a day before the ledger's retention prune.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Drop hr_time_buy (+ its baseline and GM wall rows), the section row, hr_time_blocks_view and hr_time_quote; to restore the refill,
--   grant hr_stamina_refill to authenticated again and put back its section row and baseline row (2026-10-25-stamina-refill.sql §1-§2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_time_blocks') is null or to_regprocedure('public.hr_time_block_price(text,integer,integer)') is null then
    raise exception 'PRECONDITION: the bought-time catalogue first (1058-hunting-blocks-catalogue.generated.sql)'; end if;
  if to_regprocedure('public.hr_stamina_of(uuid,integer,timestamp with time zone)') is null
     or to_regprocedure('public.hr_stamina_cap(uuid,integer,timestamp with time zone)') is null
     or to_regprocedure('public.hr_stamina_view(uuid,integer)') is null then
    raise exception 'PRECONDITION: the stamina pool (hr_stamina_of, hr_stamina_cap, hr_stamina_view) is absent'; end if;
  if to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null or to_regprocedure('public.hr_level_of(uuid,integer)') is null
     or to_regprocedure('public.hr_utc_day_start(timestamp with time zone)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regclass('public.hr_state_sections') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
  if public.hr_hunt_limit('stamina_free_min') is distinct from 600 then
    raise exception 'PRECONDITION: the free hunting day is % min, want 600 (1058-hunting-blocks-hunt-sessions-catalogue.generated.sql first)',
      public.hr_hunt_limit('stamina_free_min'); end if;
end $mig$;

-- ── §1 THE REFILL LEAVES EVERY CLIENT (Tyler 2026-11-22: blocks replace it) ──
-- Revoked, not dropped: 1009 (STAGED) buys six refills through the body in its own self-check, and a staged file must survive a retry.
do $mig$
declare v_role text;
begin
  if to_regprocedure('public.hr_stamina_refill(integer,bigint,uuid)') is not null then
    revoke execute on function public.hr_stamina_refill(integer, bigint, uuid) from public, anon, authenticated, service_role;
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function public.hr_stamina_refill(integer, bigint, uuid) from %I', v_role); end if;
    end loop;
  end if;
end $mig$;
delete from public.hr_state_sections where key = 'stamina_refill';
delete from public.hr_client_rpc_baseline where proname = 'hr_stamina_refill';
do $mig$
begin
  if to_regclass('public.hr_gm_wall_allow') is not null then
    delete from public.hr_gm_wall_allow where rpc = 'hr_stamina_refill';
    insert into public.hr_gm_wall_allow (rpc, why) values ('hr_time_buy', 'its own purse') on conflict (rpc) do update set why = excluded.why;
  end if;
end $mig$;

-- ── §2 THE QUOTE AND THE SECTION ─────────────────────────────────────────────
create or replace function public.hr_time_quote(p_user uuid, p_slot int, p_kind text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare
  r public.hr_time_blocks%rowtype; v_s public.hunt_sessions%rowtype;
  v_at timestamptz; v_cur bigint; v_cap bigint; v_ceil bigint; v_block bigint; v_bought int; v_lv int; v_why text;
begin
  select * into r from public.hr_time_blocks where kind = p_kind;
  if not found or not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  -- THE POOL'S OWN INSTANT: a hunting hero's pool lives at its session's settled_to (2026-10-23-character-premium.sql).
  select * into v_s from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null;
  v_at := coalesce(v_s.settled_to, now());
  v_cur := public.hr_stamina_of(p_user, p_slot, v_at);
  v_cap := public.hr_stamina_cap(p_user, p_slot, v_at);
  if v_cur is null or v_cap is null then return null; end if;
  v_block := r.block_min::bigint * 60000;
  v_ceil := v_cap + r.per_day::bigint * v_block;
  v_bought := (select count(*) from public.player_ledger l
                where l.user_id = p_user and l.slot = p_slot and l.kind = 'shop' and l.intent like 'time\_buy:' || r.kind || ':%'
                  and l.at >= public.hr_utc_day_start(now()))::int;
  v_lv := greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1));
  v_why := case when v_bought >= r.per_day then 'block_limit' when v_cur + v_block > v_ceil then 'stamina_full' end;
  return jsonb_build_object('kind', r.kind, 'available', v_why is null, 'why', v_why, 'at', v_at, 'ms', v_cur, 'max_ms', v_cap,
                            'ceiling_ms', v_ceil, 'block_ms', v_block, 'n', least(v_bought + 1, r.per_day), 'bought', v_bought, 'per_day', r.per_day,
                            'level', v_lv, 'price', case when v_why is null then public.hr_time_block_price(r.kind, v_lv, v_bought + 1) end);
end $fn$;

create or replace function public.hr_time_blocks_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v jsonb := '{}'::jsonb; k text; q jsonb;
begin
  -- THE SECTION `time_blocks` (1058-hunting-blocks.sql): the next block of every kind, as the server prices it (or why there is none).
  for k in select kind from public.hr_time_blocks order by kind loop
    q := public.hr_time_quote(p_user, p_slot, k);
    if q is not null then v := v || jsonb_build_object(k, q); end if;
  end loop;
  return case when v = '{}'::jsonb then null else v end;
end $fn$;
revoke execute on function public.hr_time_quote(uuid, int, text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_time_blocks_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('time_blocks', 'hr_time_blocks_view', '1058-hunting-blocks.sql: the next bought block of each kind (hunting) as the server prices it, or why there is none')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §3 THE PURCHASE ──────────────────────────────────────────────────────────
create or replace function public.hr_time_buy(p_kind text, p_slot int, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_q jsonb; v_ver bigint; v_a jsonb; v_sat timestamptz; v_at timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('time_buy', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('time_buy', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_kind is null or not exists (select 1 from public.hr_time_blocks b where b.kind = p_kind) then
    return public.hr_note_rejection('time_buy', p_slot, jsonb_build_object('ok', false, 'error', 'bad_kind')); end if;
  if p_price is null or p_price < 1 or p_price > 1000000000000 then
    return public.hr_note_rejection('time_buy', p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  v_verb := 'time_buy:' || p_kind || ':' || p_price;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('time_buy', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  -- A SECOND PRESS OF ONE KEY that waited on that lock answers the first one's decision (2027-04-19-key-under-lock.sql): the read above
  -- ran before the first press committed, and past this point hr_apply answers a decided key ok and replayed, charging nothing.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('time_buy', p_slot, v_r); end if;
  select version, stamina_at into v_ver, v_sat from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('time_buy', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_q := public.hr_time_quote(v_uid, p_slot, p_kind);
  if v_q is null then return public.hr_note_rejection('time_buy', p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  if not (v_q->>'available')::boolean then
    return public.hr_note_rejection('time_buy', p_slot, jsonb_build_object('ok', false, 'error', v_q->>'why', 'time_blocks', jsonb_build_object(p_kind, v_q))); end if;
  if (v_q->>'price')::bigint <> p_price then
    return public.hr_note_rejection('time_buy', p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'time_blocks', jsonb_build_object(p_kind, v_q))); end if;
  v_at := (v_q->>'at')::timestamptz;
  if v_sat is not null and v_sat > v_at then
    return public.hr_note_rejection('time_buy', p_slot, jsonb_build_object('ok', false, 'error', 'stamina_ahead')); end if;
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'gold', -p_price,
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', 'time_buy', 'kind', p_kind, 'n', (v_q->>'bought')::int + 1,
                                                                    'block_ms', (v_q->>'block_ms')::bigint, 'from_ms', (v_q->>'ms')::bigint,
                                                                    'level', (v_q->>'level')::int, 'at', v_at))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    return public.hr_note_rejection('time_buy', p_slot, v_a || jsonb_build_object('ok', false)); end if;
  -- A KEY THIS CALL DID NOT DECIDE moves nothing more (never reached while the read above holds under the lock).
  if coalesce(v_a->>'replayed', 'false') = 'true' then return jsonb_build_object('ok', true, 'replayed', true); end if;
  update public.player_state
     set stamina_ms = (v_q->>'ms')::bigint + (v_q->>'block_ms')::bigint, stamina_at = v_at
   where user_id = v_uid and slot = p_slot;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'kind', p_kind, 'gold', -p_price,
                            'added_ms', (v_q->>'block_ms')::bigint, 'stamina', public.hr_stamina_view(v_uid, p_slot),
                            'time_blocks', public.hr_time_blocks_view(v_uid, p_slot));
end $fn$;
revoke execute on function public.hr_time_buy(text, int, bigint, uuid) from public;
revoke execute on function public.hr_time_buy(text, int, bigint, uuid) from anon, service_role;
grant  execute on function public.hr_time_buy(text, int, bigint, uuid) to authenticated;
do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_time_buy(text,integer,bigint,uuid)', 'public.hr_time_quote(uuid,integer,text)', 'public.hr_time_blocks_view(uuid,integer)'] loop
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke all on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $mig$;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_time_buy';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_time_buy', 'p_kind text, p_slot integer, p_price bigint, p_idem uuid', 'authenticated',
   'added 1058-hunting-blocks.sql (lane/r8-hunting-day): MONEY (a gold sink) - buy a 2 h hunting block, x1.5 each that UTC day, 2 a day, priced by the server; refuses quote_changed');

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) THE DAY: with the beta switch off a new hero rests to 10 h, and with it on to 12 h (the one premium check).
-- (e) THE CEILING AND THE PURSE, before any block: a pool within a block of the ceiling (the cap + a day's blocks) is stamina_full; a
--     short purse is hr_apply's refusal and moves no stamina; a kind with no row is bad_kind.
-- (b) A FULL POOL: the first block is quoted at the twin's price for the hero's Level; a wrong price is quote_changed and moves nothing;
--     the right one moves exactly that gold, adds exactly 2 h above the cap, and writes ONE shop row time_buy:hunt:<price>.
-- (c) A replay of the key charges nothing; the second block costs x1.5 (the twin's n = 2) and banks the pool to the ceiling.
-- (d) THE CAP: the third is block_limit, quoted and refused, and moves nothing.
-- (f) The section is the quote; the refill is gone (verb, quote, section, baseline); no client role reaches the quote or the
--     section; anon cannot buy; the baseline names hr_time_buy; grant hygiene is quiet.
do $$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-000000b10c58';
  v jsonb; q jsonb; v_role text; v_cap bigint; v_p1 bigint; v_p2 bigint; v_g bigint; v_lv int;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'hunting-blocks §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    -- (a) the day, both ways
    update public.hr_flags set enabled = true where key = 'beta_premium';
    if public.hr_stamina_cap(v_u, 0, now()) <> 720 * 60000 then raise exception 'VERIFY(a): a Premium day is % ms, want 12 h', public.hr_stamina_cap(v_u, 0, now()); end if;
    update public.hr_flags set enabled = false where key = 'beta_premium';
    update public.player_state set premium_until = null, stamina_ms = 0, stamina_at = now() - interval '11 hours' where user_id = v_u and slot = 0;
    v_cap := public.hr_stamina_cap(v_u, 0, now());
    if v_cap <> 600 * 60000 or public.hr_stamina_of(v_u, 0, now()) <> v_cap then
      raise exception 'VERIFY(a): a free hero rests to % of a % ms day, want 10 h', public.hr_stamina_of(v_u, 0, now()), v_cap; end if;
    v_lv := greatest(1, coalesce(public.hr_level_of(v_u, 0), 1));
    v_p1 := public.hr_time_block_price('hunt', v_lv, 1);
    -- (e) the ceiling, the purse and the kind, before any block
    update public.player_state set stamina_ms = v_cap + 2 * 7200000 - 7200000 + 60000, stamina_at = now() where user_id = v_u and slot = 0;
    q := public.hr_time_quote(v_u, 0, 'hunt');
    if (q->>'bought')::int <> 0 or q->>'why' is distinct from 'stamina_full' then raise exception 'VERIFY(e): a pool a minute inside a block of the ceiling quotes %', q; end if;
    update public.player_state set stamina_ms = 0, stamina_at = now() where user_id = v_u and slot = 0;
    insert into public.account_wallet as w (user_id, gold) values (v_u, 0)
      on conflict (user_id) do update set gold = excluded.gold, version = w.version + 1, updated_at = now();
    v := public.hr_time_buy('hunt', 0, v_p1, '000000c0-0000-4000-a000-000000b10c05');
    if v->>'error' is distinct from 'insufficient_gold' or (select stamina_ms from public.player_state where user_id = v_u and slot = 0) <> 0 then
      raise exception 'VERIFY(e): a short purse answered %', v; end if;
    v := public.hr_time_buy('work', 0, v_p1, '000000c0-0000-4000-a000-000000b10c06');
    if v->>'error' is distinct from 'bad_kind' then raise exception 'VERIFY(e): a kind with no row answered %', v; end if;
    -- (b) a full pool buys the first block above the cap
    update public.player_state set stamina_ms = v_cap, stamina_at = now() where user_id = v_u and slot = 0;
    update public.account_wallet set gold = 1000000 where user_id = v_u;
    q := public.hr_state_of(v_u, 0)->'time_blocks'->'hunt';
    if q is distinct from public.hr_time_quote(v_u, 0, 'hunt') then raise exception 'VERIFY(f): the section reads % not the quote', q; end if;
    if not (q->>'available')::boolean or (q->>'price')::bigint <> v_p1 or (q->>'block_ms')::bigint <> 7200000 or (q->>'n')::int <> 1
       or (q->>'ceiling_ms')::bigint <> v_cap + 2 * 7200000 then
      raise exception 'VERIFY(b): a full pool quotes %', q; end if;
    v := public.hr_time_buy('hunt', 0, v_p1 + 1, '000000c0-0000-4000-a000-000000b10c01');
    if v->>'error' is distinct from 'quote_changed' or (select gold from public.account_wallet where user_id = v_u) <> 1000000 then
      raise exception 'VERIFY(b): a wrong price answered %', v; end if;
    v := public.hr_time_buy('hunt', 0, v_p1, '000000c0-0000-4000-a000-000000b10c02');
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.account_wallet where user_id = v_u) <> 1000000 - v_p1
       or (select stamina_ms from public.player_state where user_id = v_u and slot = 0) <> v_cap + 7200000
       or (select count(*) from public.player_ledger where user_id = v_u and kind = 'shop' and intent = 'time_buy:hunt:' || v_p1) <> 1 then
      raise exception 'VERIFY(b): the first block answered %', v; end if;
    -- (c) a replay moves nothing; the second costs x1.5
    v := public.hr_time_buy('hunt', 0, v_p1, '000000c0-0000-4000-a000-000000b10c02');
    if (select gold from public.account_wallet where user_id = v_u) <> 1000000 - v_p1
       or (select count(*) from public.player_ledger where user_id = v_u and intent like 'time\_buy:%') <> 1 then
      raise exception 'VERIFY(c): a replay of the key charged again: %', v; end if;
    q := public.hr_time_quote(v_u, 0, 'hunt');
    v_p2 := public.hr_time_block_price('hunt', v_lv, 2);
    if (q->>'n')::int <> 2 or (q->>'price')::bigint <> v_p2 or v_p2 <> ceil(v_p1 * 1.5) then
      raise exception 'VERIFY(c): the second block quotes % (want %)', q, v_p2; end if;
    v := public.hr_time_buy('hunt', 0, v_p2, '000000c0-0000-4000-a000-000000b10c03');
    if coalesce(v->>'ok', '') <> 'true' or (select stamina_ms from public.player_state where user_id = v_u and slot = 0) <> v_cap + 2 * 7200000 then
      raise exception 'VERIFY(c): the second block answered %', v; end if;
    -- (d) the third is refused
    q := public.hr_time_quote(v_u, 0, 'hunt');
    if (q->>'available')::boolean or q->>'why' is distinct from 'block_limit' or (q->>'bought')::int <> 2 then
      raise exception 'VERIFY(d): past the day''s blocks quotes %', q; end if;
    v_g := (select gold from public.account_wallet where user_id = v_u);
    update public.player_state set stamina_ms = 0, stamina_at = now() where user_id = v_u and slot = 0;
    v := public.hr_time_buy('hunt', 0, v_p2, '000000c0-0000-4000-a000-000000b10c04');
    if v->>'error' is distinct from 'block_limit' or (select gold from public.account_wallet where user_id = v_u) <> v_g
       or (select stamina_ms from public.player_state where user_id = v_u and slot = 0) <> 0 then
      raise exception 'VERIFY(d): a third block answered %', v; end if;
    raise exception using errcode = 'HR858', message = 'hunting-blocks §4 complete - rolling back';
  exception when sqlstate 'HR858' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) then raise exception 'VERIFY(f): §4 LEAKED a probe row'; end if;
  -- (f) no client reaches the refill; the grants are the house's
  if exists (select 1 from public.hr_state_sections where key = 'stamina_refill')
     or exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_stamina_refill') then
    raise exception 'VERIFY(f): the stamina refill still stands beside the blocks'; end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if to_regprocedure('public.hr_stamina_refill(integer,bigint,uuid)') is not null
       and has_function_privilege(v_role, 'public.hr_stamina_refill(integer,bigint,uuid)', 'execute') then
      raise exception 'VERIFY(f): % can still buy a stamina refill', v_role; end if;
    if has_function_privilege(v_role, 'public.hr_time_quote(uuid,integer,text)', 'execute')
       or has_function_privilege(v_role, 'public.hr_time_blocks_view(uuid,integer)', 'execute') then
      raise exception 'VERIFY(f): % reaches the block quote', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_time_buy(text,integer,bigint,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_time_buy(text,integer,bigint,uuid)', 'execute') then
    raise exception 'VERIFY(f): hr_time_buy is not exactly the signed-in client''s'; end if;
  if not exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_time_buy' and grantee = 'authenticated') then
    raise exception 'VERIFY(f): the client baseline does not name hr_time_buy'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hunting-blocks: a 10 h free day (12 h Premium), 2 h blocks at x1.5, 2 a day, banked to the cap + a day''s blocks, charged once by hr_apply; the refill retired; all green';
end $$;
