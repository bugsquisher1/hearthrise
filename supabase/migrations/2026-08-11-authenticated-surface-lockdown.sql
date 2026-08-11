-- ════════════════════════════════════════════════════════════════════════
-- 2026-08-11-authenticated-surface-lockdown.sql
--
-- Clears the Security Engineer's blocking conditions from the `authenticated`
-- surface audit: A5 (a CONFIRMED treasury drain), Group 1 + 1b (28+2 helper
-- revokes) and A9 (a rate gate on every player-callable RPC).
--
-- Companion: supabase/migrations/2026-08-11-live-market-rls.sql (A6/A8/A11).
-- Apply THIS FILE FIRST — it creates hr_rpc_gate, which that file uses.
--
-- SAFE TO RE-RUN. Additive and idempotent: no table dropped, no row of player
-- data touched, every rename guarded by an existence test. Reversal is §6.
--
-- ════════════════════════════════════════════════════════════════════════
-- §1  A5 — clan_upkeep_pay(uuid): A CONFIRMED, REPRODUCED TREASURY DRAIN
-- ────────────────────────────────────────────────────────────────────────
-- The function recomputes `v_due` from the clan's upgrade levels and DEDUCTS
-- IT ON EVERY CALL. There is no period guard and no idempotency key. Security
-- executed three consecutive calls as a plain member — not officer, not vice —
-- and got `{"ok":true,"gold_paid":1250}` three times. A loop empties the
-- treasury of any clan the attacker has joined.
--
-- Its sibling `clan_upkeep_settle` has the guard this one is missing
-- (`if v_from >= v_boundary then return … weeks:0`), which is what makes this
-- an oversight rather than a design.
--
-- TWO independent fixes, because either alone is a single point of failure:
--
--   (a) REVOKE from authenticated/anon. Verified 0 references in src/** and
--       supabase/functions/** (`clan_upkeep` appears nowhere in either tree),
--       0 SECURITY INVOKER callers reachable by a client role, 0 RLS policies,
--       0 views, 0 defaults, 0 check constraints, 0 index expressions and
--       0 cron jobs. Nothing calls it. It should never have been granted.
--
--   (b) A PERIOD GUARD anyway, so the function is safe if it is ever re-granted
--       by a future migration, a dashboard click, or a `create or replace` that
--       reinstates the default ACL. A revoke that is the only control is one
--       GRANT away from being no control. The guard is read from the
--       append-only clan_ledger — the clan_deposit budget pattern
--       (2026-08-08-clan-seat.sql:579-589) — rather than from a new counter
--       column, so there is nothing to reset and the history is auditable.
--
--       It also takes `for update` on the clans row. Without it two concurrent
--       calls both read `treasury` before either writes, both pass the guard,
--       and both deduct — the exact read-modify-write race the house pattern
--       exists to prevent. The old code had no lock at all.
--
-- The gold-upkeep ledger row is distinguishable from clan_upkeep_settle's
-- ration row by `item_id is null` (settle writes item_id = 'field_ration'),
-- so the guard reads only its own history.
-- ════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regprocedure('public.clan_upkeep_pay(uuid)') is null then
    raise exception 'clan_upkeep_pay(uuid) is missing — run 2026-08-08-clan-seat.sql first';
  end if;
  if to_regprocedure('public.hr_clan_week_start(timestamptz)') is null then
    raise exception 'hr_clan_week_start(timestamptz) is missing — the period guard has no boundary';
  end if;
  if to_regprocedure('public.hr_rate_ok(uuid,text,int,interval)') is null
     or to_regprocedure('public.hr_rate_over(uuid,text)') is null
     or to_regprocedure('public.hr_rate_sample_weight(bigint)') is null
     or to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 'the rate primitives are missing — run 2026-08-11-player-state.sql first';
  end if;
end $$;

create or replace function public.clan_upkeep_pay(p_clan_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_clan        public.clans%rowtype;
  v_levels      int;
  v_treasury_lv int;
  v_due         bigint;
  v_boundary    timestamptz;
  v_paid        bigint;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not exists (select 1 from public.clan_members where clan_id = p_clan_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;

  -- LOCK FIRST. Everything below reads treasury and then writes it; without the
  -- lock two concurrent calls both pass the period guard and both deduct.
  select * into v_clan from public.clans where id = p_clan_id for update;
  if v_clan.id is null then return jsonb_build_object('ok', false, 'error', 'no_clan'); end if;

  -- ── THE PERIOD GUARD (A5) ──────────────────────────────────────────────
  -- One manual upkeep payment per clan week, read from the append-only ledger.
  -- `item_id is null` selects the GOLD upkeep rows this function writes and
  -- excludes clan_upkeep_settle's ration rows.
  v_boundary := public.hr_clan_week_start();
  select coalesce(sum(qty), 0) into v_paid
    from public.clan_ledger
   where clan_id = p_clan_id and kind = 'upkeep' and item_id is null and at >= v_boundary;
  if v_paid > 0 then
    return jsonb_build_object('ok', false, 'error', 'already_paid',
      'upkeep_state', v_clan.upkeep_state, 'gold_paid', 0,
      'paid_this_week', v_paid, 'period_start', v_boundary);
  end if;

  select coalesce(sum(greatest(0, (value)::int)), 0) into v_levels
    from jsonb_each_text(coalesce(v_clan.upgrades, '{}'::jsonb)) where value ~ '^[0-9]+$';
  v_treasury_lv := coalesce(nullif(v_clan.upgrades->>'treasury','')::int, 0);
  v_due := ceil(v_levels * 250 * (1 - least(10, greatest(0, v_treasury_lv)) * 0.01))::bigint;

  if v_clan.treasury < v_due then
    return jsonb_build_object('ok', false, 'error', 'treasury_short', 'due', v_due);
  end if;

  update public.clans
     set treasury = treasury - v_due, upkeep_state = 'active', ration_debt = 0
   where id = p_clan_id;
  insert into public.clan_ledger (clan_id, user_id, kind, qty)
    values (p_clan_id, auth.uid(), 'upkeep', v_due);
  return jsonb_build_object('ok', true, 'upkeep_state', 'active', 'gold_paid', v_due,
                            'period_start', v_boundary);
end $$;

-- REVOKE BEFORE GRANT — and there is no grant. `create or replace` preserves
-- the existing ACL, so the revoke below is what actually closes A5; the guard
-- above is the belt to its braces.
revoke execute on function public.clan_upkeep_pay(uuid) from public;
revoke execute on function public.clan_upkeep_pay(uuid) from anon, authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════
-- §2  GROUP 1 — 28 helper revokes, zero client changes
-- ────────────────────────────────────────────────────────────────────────
-- Every function below is EXECUTE-able by `authenticated` today and is reached
-- by nothing a client can call. Signatures are written out in full: a bare
-- `revoke execute on function public.f from …` is a syntax error, and naming
-- the wrong argument list silently revokes nothing at all (it errors, which is
-- the good case) or revokes an overload nobody meant (the bad one).
--
-- HOW "SAFE" WAS ESTABLISHED — four questions, all answered against the live
-- catalogue on 2026-08-11, not by reading:
--
--   1. src/** and supabase/functions/**: every textual hit was inspected.
--      hr_canon_display_name, hr_lb_boards, hr_lb_skills, hr_validate_display_name,
--      hr_utc_day_key, hr_utc_week_key and hr_week_start DO appear — every one
--      of them inside a `//` comment saying "must agree with the migration".
--      Not one is an rpc() call. The two names in this space that ARE called —
--      `hr_server_now` (muster.js:704) and `hr_rally_pledge_state` (muster.js:
--      974/1070/1072) — are deliberately NOT in this list.
--
--   2. SECURITY INVOKER callers reachable by a client role. This is the trap:
--      a definer function may call anything (the check runs as its owner), but
--      an INVOKER function's inner calls are checked as the CALLER. Query run:
--      every public function that is (a) not prosecdef, (b) executable by anon
--      or authenticated, (c) whose prosrc word-matches the target. Result: the
--      only such callers are OTHER MEMBERS OF THIS SAME LIST —
--      hr_validate_display_name→hr_canon_display_name, hr_lb_boards→hr_lb_skills,
--      hr_rally_event_id→hr_fnv1a, and the hr_rally_* chain into itself — so the
--      whole chain loses client reachability together. The ONE caller that is
--      NOT in this list is hr_server_now(), and that is §3.
--
--   3. RLS policies, views, column defaults, CHECK constraints, index
--      expressions: zero hits for every name, with one exception —
--      hr_lb_num and hr_lb_skills appear in `leaderboard_ranked`.
--
--   4. cron.job commands: zero hits.
--
-- ⚠ CORRECTION TO THE REVIEW, ON THE ONE TRAP IT CALLED CLOSED.
--   The audit says leaderboard_ranked "is a MATERIALIZED view with zero client
--   grants, so only the owner-run REFRESH touches it". The first half is right
--   and is what makes the revoke safe; the second half is FALSE. Measured:
--     relacl = {postgres=arwdDxtm/postgres, anon=arwdm/postgres,
--               authenticated=arwdm/postgres, service_role=arwdDxtm/postgres}
--   anon and authenticated both hold SELECT on leaderboard_ranked right now.
--   The revoke is still safe — reading a matview returns STORED rows and does
--   not re-evaluate hr_lb_num/hr_lb_skills; only REFRESH does, and REFRESH runs
--   as the owner — but it is safe for a different reason than the one recorded,
--   and "no client grants" is exactly the kind of comfortable fact that stops
--   the next person looking. The grant itself is out of scope here and is
--   raised back to Security as a separate exposure question.
-- ════════════════════════════════════════════════════════════════════════

do $$
declare
  r         text;
  v_missing text[] := '{}';
  -- The list, by FULL SIGNATURE. 28 entries: 5 clan RPCs + 13 pure helpers +
  -- 10 rally helpers. (The audit said "nine hr_rally_*"; the catalogue holds
  -- ELEVEN, of which hr_rally_pledge_state is client-called and stays. The
  -- other ten are listed — an off-by-one in a revoke list is a function left
  -- reachable, so the list is derived from pg_proc, not from the review.)
  c_revoke  text[] := array[
    -- ── clan RPCs with no client path (SECURITY DEFINER) ──
    'public.clan_set_role(uuid,uuid,text,text)',
    'public.clan_claim_leadership(uuid)',
    'public.clan_withdraw(uuid,bigint)',
    'public.clan_withdraw_settle(uuid)',
    'public.clan_withdraw_cancel(uuid)',
    -- ── pure helpers (SECURITY INVOKER) ──
    'public.hr_fnv1a(text)',
    'public.hr_hunt_clamp(bigint)',
    'public.hr_hunt_pool(int,int)',
    'public.hr_lb_boards()',
    'public.hr_lb_num(jsonb,text)',
    'public.hr_lb_skills()',
    'public.hr_clan_week_start(timestamptz)',
    'public.hr_week_start(text)',
    'public.hr_utc_week_key(timestamptz)',
    'public.hr_canon_display_name(text)',
    'public.hr_validate_display_name(text)',
    -- hr_level_from_xp / hr_xp_for_level: revoked from the CLIENT roles only.
    -- They must KEEP their hr_engine=X grant (server-authority.md §2a lists
    -- both) — `revoke … from anon, authenticated` does not touch it, and §5
    -- asserts the engine grant survived.
    'public.hr_level_from_xp(bigint)',
    'public.hr_xp_for_level(int)',
    -- ── rally helpers (SECURITY INVOKER) ──
    'public.hr_rally_absent_chest(text)',
    'public.hr_rally_chest(text,bigint,int,int)',
    'public.hr_rally_chest_value(jsonb)',
    'public.hr_rally_day(text)',
    'public.hr_rally_day_close(text)',
    'public.hr_rally_event_for_key(text)',
    'public.hr_rally_event_id(text,int)',
    'public.hr_rally_pool()',
    'public.hr_rally_slot(text,int)',
    'public.hr_rally_theme(text)'
  ];
begin
  -- FAIL CLOSED on a name that does not resolve. A revoke list whose entries
  -- are silently wrong is the always-null probe in its purest form.
  foreach r in array c_revoke loop
    if to_regprocedure(r) is null then v_missing := v_missing || r; end if;
  end loop;
  if array_length(v_missing, 1) > 0 then
    raise exception 'revoke list does not resolve against this database: %', v_missing;
  end if;

  foreach r in array c_revoke loop
    execute format('revoke execute on function %s from public, anon, authenticated', r);
  end loop;
  raise notice 'Group 1: % client-unreachable helpers revoked from anon/authenticated/PUBLIC',
    array_length(c_revoke, 1);
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- §2b  hr_rpc_gate — A9's gate, defined HERE because §3 is its first caller
-- ────────────────────────────────────────────────────────────────────────
-- The rationale for the whole gate lives in §4. It is CREATED here purely so
-- that file order matches call order: §3 rewrites hr_server_now to use it, and
-- a migration whose sections depend on each other backwards is one bad split
-- away from applying halfway.
--
-- WHY IT TAKES ONLY A BUCKET. `hr_rate_ok`'s signature is
-- (user, bucket, LIMIT, WINDOW) — a caller that names its own limit does not
-- have one, the same class of mistake as letting the client send `capMs`.
-- `hr_rate_gate` (2026-08-11-accrue-gate.sql) fixed the limit but still takes
-- the USER, because the accrual engine legitimately acts for a player whose JWT
-- it has verified. Here there is no such need: the caller IS the player, so the
-- gate reads `auth.uid()` itself and takes ONE argument. A caller can choose
-- neither its limit nor its victim. An unknown bucket is refused, not defaulted.
--
-- WHY IT IS A NEW FUNCTION AND NOT A BUCKET ADDED TO hr_rate_gate: two files
-- must not both own one `case`. Whichever of the two applied second would
-- silently delete the other's buckets, and the failure mode of a lost bucket is
-- fail-closed — every affected RPC dead. Different capability, different
-- grantee, different function.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.hr_rpc_gate(p_bucket text)
returns boolean language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
declare
  v_uid    uuid := auth.uid();
  v_limit  int;
  v_window constant interval := interval '1 minute';
  v_weight bigint;
begin
  -- THE LIMITS. Owned here, in a `case` no caller can reach, keyed by a bucket
  -- name validated against this allowlist. An unknown bucket is REFUSED rather
  -- than defaulted: a typo in a caller must not quietly mint an unlimited
  -- counter namespace. Fail closed is the whole point of the shape.
  case p_bucket
    -- reads — cheap, and called on panel open / page load
    when 'clan_seat_read', 'clan_vote_read', 'hr_leaderboard',
         'hr_rally_pledge_state', 'hr_display_name_available', 'hr_server_now'
      then v_limit := 120;
    -- ordinary player actions
    when 'buy_listing', 'clan_board_claim', 'clan_board_progress', 'clan_contribute',
         'clan_deposit', 'clan_feast_deposit', 'clan_rested_grant', 'clan_vote_cast',
         'clan_work_complete', 'clan_work_labour', 'clan_work_supply',
         'raid_claim', 'raid_strike',
         'world_event_absence_claim', 'world_event_claim', 'world_event_contribute',
         'world_event_join', 'world_event_pledge', 'world_event_pledge_settle'
      then v_limit := 60;
    -- rare, expensive, or one-per-period by design
    when 'bug_report_submit', 'claim_beta_invite', 'claim_display_name',
         'clan_board_roll', 'clan_feast_call', 'clan_hunt_declare', 'clan_tier_up',
         'clan_vice_set', 'clan_vote_close', 'clan_vote_open', 'clan_work_post'
      then v_limit := 12;
    -- companion file 2026-08-11-live-market-rls.sql
    when 'beta_invite_check'
      then v_limit := 20;
    else return false;
  end case;

  -- An UNAUTHENTICATED caller has no per-caller key, so there is nothing to
  -- count. The only gated function anon can reach is hr_leaderboard (a public
  -- board), and inventing a shared anon bucket would hand one attacker a switch
  -- that locks every anonymous visitor out of it. Anonymous abuse is a
  -- platform-edge concern, not something a per-user counter can express. Stated
  -- as a known limitation rather than papered over.
  if v_uid is null then return true; end if;

  if public.hr_rate_ok(v_uid, 'rpc:' || p_bucket, v_limit, v_window) then
    return true;
  end if;

  -- SAMPLED, not per-call: an unconditional write here would make the server do
  -- more durable work the harder it is hammered, all serialised on one tuple
  -- (player-state.sql §6c-ii).
  v_weight := public.hr_rate_sample_weight(
                public.hr_rate_over(v_uid, 'rpc:' || p_bucket) - v_limit);
  if v_weight > 0 then
    perform public.hr_record_rejection(v_uid, 0, p_bucket, 'rate_limited',
      jsonb_build_object('limit', v_limit, 'per', v_window::text, 'gate', 'rpc'), v_weight);
  end if;
  return false;
end $$;

-- Revoke from PUBLIC first — Postgres grants EXECUTE to PUBLIC on every new
-- function and Supabase's default ACL adds anon/authenticated/service_role, so
-- revoking one of the four leaves the privilege intact three other ways.
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;
-- NOT granted to anything. Every caller is a SECURITY DEFINER function that
-- executes as the owner. A client that could call the gate could spend its own
-- budget on demand — and, the bucket being a parameter, spend it in whichever
-- shape hurt most.

-- ════════════════════════════════════════════════════════════════════════
-- §3  GROUP 1b — the trap: hr_server_now() must stop needing its callees
-- ────────────────────────────────────────────────────────────────────────
-- `hr_server_now()` is SECURITY INVOKER and IS client-called (muster.js:704 —
-- the clock-skew sync every player runs). It calls hr_utc_day_key() and
-- hr_muster_window(), and hr_muster_window calls hr_utc_day_key again. Because
-- hr_server_now is INVOKER, those inner calls are permission-checked AS THE
-- PLAYER: revoking the two callees first would 42501 the muster clock for every
-- signed-in player, at page load, with no client change to blame it on.
--
-- ORDER IS THE FIX, and it is one statement wide:
--   1. hr_server_now becomes SECURITY DEFINER (so its inner calls resolve as
--      the owner), with an explicit `set search_path` — a definer function
--      without one is a search_path hijack, and this one calls two unqualified-
--      capable helpers.
--   2. THEN revoke hr_utc_day_key and hr_muster_window from the client roles.
--
-- Making it DEFINER grants the caller nothing new: the body reads no table, has
-- no parameters, and returns now() plus two values derived from it. The
-- capability delta is "may call two pure date functions", which is exactly what
-- every caller already had a second ago.
--
-- It also picks up A9's rate gate in the same edit — it is a player-callable
-- RPC and the rule has no exceptions. That turns it from `language sql STABLE`
-- into `plpgsql VOLATILE`, which is only safe because muster.js reaches it by
-- POST /rpc/ (the rpc() helper), the only calling convention PostgREST offers
-- for a volatile function. A rate-limited answer has no `epoch_ms`, and
-- syncClock() already handles that: it falls back to the response `Date`
-- header and, failing that, to skew 0. Degrades, never lies.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.hr_server_now()
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $$
begin
  if not public.hr_rpc_gate('hr_server_now') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  return jsonb_build_object(
    'ok', true,
    'epoch_ms', (extract(epoch from now()) * 1000)::bigint,
    'day_key', public.hr_utc_day_key(),
    'live_event_key', (select event_key from public.hr_muster_window())
  );
end $$;
revoke execute on function public.hr_server_now() from public;
revoke execute on function public.hr_server_now() from anon, service_role;
grant  execute on function public.hr_server_now() to authenticated;

do $$
declare r text;
begin
  -- Re-assert the ordering rather than trusting file order: if hr_server_now is
  -- not DEFINER at this point, revoking below breaks the live muster clock.
  if not (select prosecdef from pg_proc where oid = to_regprocedure('public.hr_server_now()')) then
    raise exception 'hr_server_now() is still SECURITY INVOKER — revoking its callees would break the muster clock';
  end if;
  foreach r in array array['public.hr_utc_day_key(timestamptz)',
                           'public.hr_muster_window(timestamptz)'] loop
    if to_regprocedure(r) is null then raise exception 'missing %', r; end if;
    execute format('revoke execute on function %s from public, anon, authenticated', r);
  end loop;
  raise notice 'Group 1b: hr_server_now is DEFINER; hr_utc_day_key + hr_muster_window revoked';
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- §4  A9 — A RATE GATE ON EVERY PLAYER-CALLABLE RPC
-- ────────────────────────────────────────────────────────────────────────
-- The standing rule is "rate-limit every player-callable RPC". It was met on
-- 2 of 43 (`hr_load`, `hr_create_character`). §1–§3 remove 6 of the 43 by
-- revoking them; the remaining 35 are retrofitted here.
--
-- ── WHY A WRAPPER AND NOT 35 EDITED BODIES ──────────────────────────────
-- The alternative is to `create or replace` 35 functions, which means copying
-- 35 large, load-bearing, already-reviewed bodies into this file. That is a
-- second copy of the clan seat, the raid engine and the world-event engine —
-- the exact double-copy failure this codebase is organised against (see the
-- `unifyObject` header at src/main.js:36-50) — and every one of those copies
-- would silently revert whatever the original file learns next.
--
-- So each target is RENAMED to `<name>__ungated` and a thin wrapper takes its
-- place at the original signature:
--
--     f(args)  ──▶ hr_rpc_gate('f')  ──▶ f__ungated(args)
--
-- The wrapper is SECURITY DEFINER, so the inner call resolves as the owner;
-- `f__ungated` is revoked from every client role, so the gate cannot be
-- side-stepped by calling the inner name. The bodies are untouched: `alter
-- function … rename` moves the object, it does not rewrite it.
--
-- ── WHY hr_rpc_gate TAKES ONLY A BUCKET ─────────────────────────────────
-- `hr_rate_ok`'s signature is (user, bucket, LIMIT, WINDOW) — a caller that
-- names its own limit does not have one, which is the same class as letting the
-- client send `capMs`. `hr_rate_gate` (2026-08-11-accrue-gate.sql) fixed the
-- limit but still takes the USER, because the engine legitimately acts for a
-- player it has verified. Here there is no such need: the caller IS the player,
-- so the gate reads `auth.uid()` itself and takes ONE argument. The caller can
-- choose neither its limit nor its victim. Unknown bucket ⇒ false, fail closed.
--
-- It is a NEW function rather than a bucket added to `hr_rate_gate` on purpose:
-- two files must not both own one `case`. accrue-gate.sql's `hr_rate_gate`
-- would overwrite this file's buckets (or be overwritten by them) on whichever
-- applies second, and the failure mode of a lost bucket is fail-closed — i.e.
-- every affected RPC dead. Different capability, different grantee, different
-- function.
--
-- ── THE NUMBERS, AND WHY THEY ARE GENEROUS ──────────────────────────────
-- These are brakes on automation, not balance, and they are being retrofitted
-- onto 35 call sites whose real-world frequency has never been measured. A
-- limit that fires during honest play is a live outage; a limit of 120/min
-- still stops a script cold at 2 requests/second/user. Reads 120/min, writes
-- 60/min, expensive-or-rare 12/min. Tighten later WITH measurement, never
-- speculatively.
--
-- ── THE FOOTGUN, NAMED ──────────────────────────────────────────────────
-- Re-applying 2026-08-08-clan-seat.sql (or any file that `create or replace`s a
-- wrapped name) would replace the WRAPPER with the ungated body and silently
-- delete the gate. Two detectors close that: the static lint in
-- tests/run-sql-tests.mjs, and a runtime assertion inside
-- hr_assert_grant_hygiene() (2026-08-11-grant-hygiene.sql) which runs nightly
-- and fails if any client-executable SECURITY DEFINER function in public does
-- not reference a gate. Neither is optional; the wrapper approach is only
-- acceptable BECAUSE both exist.
-- ════════════════════════════════════════════════════════════════════════

-- ── 4a. The gate is created in §2b, above, because §3 already uses it. ──

-- ── 4b. The retrofit ────────────────────────────────────────────────────
do $$
declare
  v_inner    text;
  v_args     text;
  v_ret      text;
  v_n_wrap   int := 0;
  v_n_skip   int := 0;
  -- (signature, bucket). The bucket is always the function's own name so that a
  -- rejection is attributable in hr_rejections without a lookup table.
  c_targets  text[] := array[
    'public.bug_report_submit(text,text,text,jsonb,jsonb,text)',
    'public.buy_listing(uuid,int)',
    'public.claim_beta_invite(text)',
    'public.claim_display_name(text)',
    'public.clan_board_claim(uuid,text)',
    'public.clan_board_progress(uuid,text,int)',
    'public.clan_board_roll(uuid)',
    'public.clan_contribute(uuid,bigint)',
    'public.clan_deposit(uuid,jsonb)',
    'public.clan_feast_call(uuid)',
    'public.clan_feast_deposit(uuid,int)',
    'public.clan_hunt_declare(uuid,text,int,text)',
    'public.clan_rested_grant(uuid)',
    'public.clan_seat_read(uuid)',
    'public.clan_tier_up(uuid)',
    'public.clan_vice_set(uuid,uuid,boolean)',
    'public.clan_vote_cast(uuid,uuid,text)',
    'public.clan_vote_close(uuid,uuid)',
    'public.clan_vote_open(uuid,jsonb,int)',
    'public.clan_vote_read(uuid)',
    'public.clan_work_complete(uuid,uuid)',
    'public.clan_work_labour(uuid,uuid,int)',
    'public.clan_work_post(uuid,text,int)',
    'public.clan_work_supply(uuid,uuid,jsonb)',
    'public.hr_display_name_available(text)',
    'public.hr_leaderboard(text,int,int)',
    'public.hr_rally_pledge_state()',
    'public.raid_claim(text,uuid,text)',
    'public.raid_strike(uuid,text,text,bigint,bigint)',
    'public.world_event_absence_claim(text)',
    'public.world_event_claim(text)',
    'public.world_event_contribute(text,int)',
    'public.world_event_join(text)',
    'public.world_event_pledge(text)',
    'public.world_event_pledge_settle(text)'
  ];
  s text;
  v_plan jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  foreach s in array c_targets loop
    if to_regprocedure(s) is null then
      raise exception 'A9 target does not resolve: % — the retrofit list is stale', s;
    end if;
  end loop;

  -- PASS 1 — READ THE CATALOGUE COMPLETELY, THEN STOP READING IT.
  -- The loop below renames functions and creates functions, i.e. it mutates the
  -- very catalogue a `for r in select … from pg_proc` cursor is walking. Whether
  -- that is safe depends on when the executor chooses to evaluate
  -- `to_regprocedure(t.s)` for each row, which is not a property worth betting a
  -- live RPC surface on. So the plan is materialised into a jsonb array first
  -- and no catalogue scan is open while DDL runs.
  -- ⚠ `types` is built from proargtypes, NOT from
  --   pg_get_function_identity_arguments(). Measured on this database
  --   2026-08-11: that function returns "p_summary text, p_description text, …"
  --   — it INCLUDES THE PARAMETER NAMES. `to_regprocedure` rejects those
  --   ("invalid type name \"p_summary text\""), so a signature built from it is
  --   NULL for every named-parameter function on the project, i.e. for all of
  --   them. This is the same shape as the to_regproc()/to_regprocedure() defect
  --   already linted in tests/run-sql-tests.mjs §1c-ii: it reads correctly and
  --   is wrong on every database in the world. Found by executing, not reading.
  select coalesce(jsonb_agg(jsonb_build_object(
           'name',  p.proname,
           -- ALWAYS schema-qualified and always built by hand: regprocedure's
           -- text form OMITS the schema when it is on search_path, and a DDL
           -- statement that resolves through search_path is a different
           -- statement on a different connection.
           'sig',   format('public.%I(%s)', p.proname, t.types),
           'args',  pg_get_function_arguments(p.oid),    -- names + defaults, for PostgREST
           'types', t.types,                             -- types only, for to_regprocedure
           'ret',   pg_get_function_result(p.oid),
           'nargs', p.pronargs,
           'src',   p.prosrc
         ) order by p.proname), '[]'::jsonb)
    into v_plan
    from unnest(c_targets) u(s)
    join pg_proc p on p.oid = to_regprocedure(u.s)
    cross join lateral (
      select coalesce((select string_agg(format_type(a.t, null), ', ' order by a.o)
                         from unnest(p.proargtypes) with ordinality a(t, o)), '') as types
    ) t;

  if jsonb_array_length(v_plan) <> array_length(c_targets, 1) then
    raise exception 'A9: planned % of % targets — a signature resolved to nothing',
      jsonb_array_length(v_plan), array_length(c_targets, 1);
  end if;

  -- PASS 2 — DDL only.
  for v_item in select * from jsonb_array_elements(v_plan) loop
    v_inner := (v_item->>'name') || '__ungated';
    v_args  := v_item->>'args';
    v_ret   := v_item->>'ret';

    -- Idempotent: rename only once. On a re-run the inner already exists and we
    -- fall through to re-creating the wrapper, which is harmless.
    if to_regprocedure(format('public.%I(%s)', v_inner, v_item->>'types')) is null then
      -- If a wrapper is already installed at this signature, renaming it would
      -- BURY the gate inside `__ungated` and leave the client calling an ungated
      -- copy. Detect it by looking for the gate in the body we are about to move.
      if (v_item->>'src') ~ 'hr_rpc_gate' then
        raise exception 'A9: % already looks like a wrapper but has no __ungated twin — refusing to rename',
          v_item->>'sig';
      end if;
      execute format('alter function %s rename to %I', v_item->>'sig', v_inner);
      v_n_wrap := v_n_wrap + 1;
    else
      v_n_skip := v_n_skip + 1;
    end if;

    -- The wrapper. `$1..$n` is used rather than the parameter names so that a
    -- name collision with anything in scope is impossible; PostgREST resolves
    -- on the NAMES in the signature, which pg_get_function_arguments preserves
    -- verbatim, defaults included.
    execute format($fmt$
      create or replace function public.%I(%s)
      returns %s language plpgsql volatile security definer
      set search_path = public, pg_catalog as $w$
      begin
        if not public.hr_rpc_gate(%L) then
          return jsonb_build_object('ok', false, 'error', 'rate_limited')::%s;
        end if;
        return public.%I(%s);
      end $w$;
    $fmt$, v_item->>'name', v_args, v_ret, v_item->>'name', v_ret, v_inner,
       coalesce((select string_agg('$' || i::text, ', ' order by i)
                   from generate_series(1, (v_item->>'nargs')::int) i), ''));

    -- The inner must not be reachable, or the gate is decoration.
    execute format('revoke execute on function public.%I(%s) from public, anon, authenticated, service_role',
                   v_inner, v_item->>'types');
    -- Revoke before grant on the wrapper too: a `create or replace` that lands a
    -- brand-new object picks up the platform default ACL.
    execute format('revoke execute on function %s from public, anon, authenticated, service_role',
                   v_item->>'sig');
    execute format('grant execute on function %s to authenticated', v_item->>'sig');
    -- hr_leaderboard is a public board and was anon-readable before this file.
    -- Preserve that; the gate lets an anonymous caller straight through (§2b).
    if (v_item->>'name') = 'hr_leaderboard' then
      execute format('grant execute on function %s to anon', v_item->>'sig');
    end if;
  end loop;

  raise notice 'A9: % RPC(s) newly wrapped, % already wrapped, % total gated',
    v_n_wrap, v_n_skip, array_length(c_targets, 1);
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- §5  SELF-VERIFICATION — assert the properties, not the statements
-- ════════════════════════════════════════════════════════════════════════
do $$
declare
  v_bad     text;
  v_n       bigint;
  v_uid     uuid := gen_random_uuid();
  v_rows    text[];
  r         record;
begin
  -- ── A5 ────────────────────────────────────────────────────────────────
  if has_function_privilege('anon',          'public.clan_upkeep_pay(uuid)', 'execute')
  or has_function_privilege('authenticated', 'public.clan_upkeep_pay(uuid)', 'execute') then
    raise exception 'A5 OPEN: clan_upkeep_pay is still client-executable';
  end if;
  if (select prosrc from pg_proc where oid = to_regprocedure('public.clan_upkeep_pay(uuid)'))
       !~ 'already_paid' then
    raise exception 'A5: the period guard is not in clan_upkeep_pay''s body';
  end if;
  if (select prosrc from pg_proc where oid = to_regprocedure('public.clan_upkeep_pay(uuid)'))
       !~ 'for update' then
    raise exception 'A5: clan_upkeep_pay still reads the clan row without FOR UPDATE';
  end if;

  -- ── Group 1 + 1b: nothing on the list may be client-executable ────────
  select string_agg(x.sig || ' → ' || x.g, ', ') into v_bad from (
    select p.oid::regprocedure::text sig, g.g
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      cross join (values ('anon'),('authenticated')) g(g)
     where n.nspname = 'public'
       and p.oid = any (array[
         to_regprocedure('public.clan_set_role(uuid,uuid,text,text)'),
         to_regprocedure('public.clan_claim_leadership(uuid)'),
         to_regprocedure('public.clan_withdraw(uuid,bigint)'),
         to_regprocedure('public.clan_withdraw_settle(uuid)'),
         to_regprocedure('public.clan_withdraw_cancel(uuid)'),
         to_regprocedure('public.hr_fnv1a(text)'),
         to_regprocedure('public.hr_hunt_clamp(bigint)'),
         to_regprocedure('public.hr_hunt_pool(int,int)'),
         to_regprocedure('public.hr_lb_boards()'),
         to_regprocedure('public.hr_lb_num(jsonb,text)'),
         to_regprocedure('public.hr_lb_skills()'),
         to_regprocedure('public.hr_clan_week_start(timestamptz)'),
         to_regprocedure('public.hr_week_start(text)'),
         to_regprocedure('public.hr_utc_week_key(timestamptz)'),
         to_regprocedure('public.hr_canon_display_name(text)'),
         to_regprocedure('public.hr_validate_display_name(text)'),
         to_regprocedure('public.hr_level_from_xp(bigint)'),
         to_regprocedure('public.hr_xp_for_level(int)'),
         to_regprocedure('public.hr_rally_absent_chest(text)'),
         to_regprocedure('public.hr_rally_chest(text,bigint,int,int)'),
         to_regprocedure('public.hr_rally_chest_value(jsonb)'),
         to_regprocedure('public.hr_rally_day(text)'),
         to_regprocedure('public.hr_rally_day_close(text)'),
         to_regprocedure('public.hr_rally_event_for_key(text)'),
         to_regprocedure('public.hr_rally_event_id(text,int)'),
         to_regprocedure('public.hr_rally_pool()'),
         to_regprocedure('public.hr_rally_slot(text,int)'),
         to_regprocedure('public.hr_rally_theme(text)'),
         to_regprocedure('public.hr_utc_day_key(timestamptz)'),
         to_regprocedure('public.hr_muster_window(timestamptz)')
       ])
       and has_function_privilege(g.g, p.oid, 'execute')) x;
  if v_bad is not null then
    raise exception 'Group 1/1b INCOMPLETE — still client-executable: %', v_bad;
  end if;

  -- …and the two the engine needs must have KEPT their hr_engine grant.
  if not has_function_privilege('hr_engine', 'public.hr_level_from_xp(bigint)', 'execute')
  or not has_function_privilege('hr_engine', 'public.hr_xp_for_level(int)', 'execute') then
    raise exception 'the XP helpers lost their hr_engine grant — the accrual engine cannot derive a level';
  end if;

  -- ── Group 1b, BEHAVIOURALLY: the muster clock still answers ───────────
  -- Reading the catalogue proves the grants; only CALLING it proves the clock.
  -- Run as `authenticated` so the check is the player's check, not the owner's.
  begin
    set local role authenticated;
    if (public.hr_server_now() ->> 'ok') <> 'true'
       or (public.hr_server_now() ->> 'day_key') is null then
      raise exception 'hr_server_now() no longer returns a clock as `authenticated`';
    end if;
    reset role;
  exception when others then
    reset role;
    raise exception 'GROUP 1b BROKE THE MUSTER CLOCK: hr_server_now() failed as authenticated — %', sqlerrm;
  end;

  -- ── A9: every wrapped RPC is gated, and its inner twin is unreachable ─
  v_rows := '{}';
  for r in
    select p.oid::regprocedure::text sig, p.proname, p.prosrc
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p') and p.prosecdef
       -- anon as well as authenticated: hr_leaderboard is a public board and is
       -- reachable without a session, which makes it the one that matters most.
       and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute'))
  loop
    if r.prosrc !~ 'hr_rpc_gate|hr_rate_gate|hr_rate_ok' then
      v_rows := v_rows || r.sig;
    end if;
  end loop;
  if array_length(v_rows, 1) > 0 then
    raise exception 'A9 INCOMPLETE — client-executable SECURITY DEFINER function(s) with no rate gate: %', v_rows;
  end if;

  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like '%\_\_ungated'
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute')
       or has_function_privilege('service_role', p.oid, 'execute'));
  if v_n > 0 then
    raise exception 'A9 BYPASSABLE — % __ungated function(s) are still client-executable', v_n;
  end if;

  -- The gate itself must not be reachable, or a client picks its own bucket.
  select string_agg(g, ', ') into v_bad
    from unnest(array['public','anon','authenticated','service_role']) g
   where has_function_privilege(g, 'public.hr_rpc_gate(text)', 'execute');
  if v_bad is not null then
    raise exception 'hr_rpc_gate is executable by: % — revoke before grant', v_bad;
  end if;

  -- ── A9, BEHAVIOURALLY: the gate admits, then refuses, then fails closed ─
  -- A gate that has never been seen to REFUSE is a gate nobody knows works.
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  if public.hr_rpc_gate('not_a_bucket') then
    raise exception 'hr_rpc_gate admitted an unknown bucket — it must fail closed';
  end if;
  if not public.hr_rpc_gate('clan_deposit') then
    raise exception 'hr_rpc_gate refused the first call';
  end if;
  select count(*) into v_n from generate_series(1, 80) i
   where public.hr_rpc_gate('clan_deposit');
  if v_n >= 80 then
    raise exception 'hr_rpc_gate allowed all 80 further calls — the limit is not applied';
  end if;
  -- Buckets are per-name: exhausting one must not exhaust another.
  if not public.hr_rpc_gate('clan_seat_read') then
    raise exception 'hr_rpc_gate leaked one bucket''s exhaustion into another';
  end if;
  -- And every bucket the retrofit uses must be KNOWN to the gate. A wrapped
  -- function whose bucket falls into the `else` is a dead RPC.
  for r in
    select replace(p.proname, '__ungated', '') as nm
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like '%\_\_ungated'
  loop
    delete from public.hr_rate_counters where user_id = v_uid;
    if not public.hr_rpc_gate(r.nm) then
      raise exception 'A9: bucket "%" is not in hr_rpc_gate''s case — that RPC is now permanently refused', r.nm;
    end if;
  end loop;

  delete from public.hr_rate_counters where user_id = v_uid;
  delete from public.hr_rejections    where user_id = v_uid;
  perform set_config('request.jwt.claim.sub', '', true);

  raise notice 'authenticated-surface lockdown OK — A5 closed, 30 helpers revoked, % RPCs gated',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname like '%\_\_ungated');
end $$;

-- ── 5b. Keep the grant detector quiet about the surface we just SHRANK ──
-- hr_assert_grant_hygiene() reports baseline rows whose function is no longer
-- client-reachable. That report is a feature — "an approved RPC that lost its
-- grant is a BROKEN FEATURE" — but here the loss is the point of the file, and
-- a warning that fires every night forever is a warning people learn to skip.
-- So the baseline forgets exactly the rows this file deliberately retired, by
-- name, and nothing else. It is a targeted DELETE and NOT a call to
-- hr_grant_baseline_sync(), which would re-approve the whole live surface and
-- turn a differential check into a rubber stamp.
do $$
declare v_n bigint := 0;
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent (grant-hygiene not applied yet) — nothing to prune';
    return;
  end if;
  delete from public.hr_client_rpc_baseline b
   where b.proname in ('clan_set_role','clan_claim_leadership','clan_withdraw',
                       'clan_withdraw_settle','clan_withdraw_cancel','clan_upkeep_pay',
                       'hr_fnv1a','hr_hunt_clamp','hr_hunt_pool','hr_lb_boards','hr_lb_num',
                       'hr_lb_skills','hr_clan_week_start','hr_week_start','hr_utc_week_key',
                       'hr_canon_display_name','hr_validate_display_name',
                       'hr_level_from_xp','hr_xp_for_level',
                       'hr_rally_absent_chest','hr_rally_chest','hr_rally_chest_value',
                       'hr_rally_day','hr_rally_day_close','hr_rally_event_for_key',
                       'hr_rally_event_id','hr_rally_pool','hr_rally_slot','hr_rally_theme',
                       'hr_utc_day_key','hr_muster_window')
     and not exists (
       select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = b.proname
          and has_function_privilege(b.grantee, p.oid, 'execute'));
  get diagnostics v_n = row_count;
  raise notice 'grant baseline: % retired row(s) pruned', v_n;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- §6  REVERSIBILITY
-- ────────────────────────────────────────────────────────────────────────
-- Every step undoes cleanly and none of it touches player data.
--
--   A5 (§1)     re-grant:  grant execute on function public.clan_upkeep_pay(uuid) to authenticated;
--               The period guard is a body change; the previous body is in
--               2026-08-08-clan-seat.sql. Re-applying that file restores it —
--               and would ALSO strip the guard, which is why §5 asserts the
--               guard's presence and hr_assert_grant_hygiene re-checks nightly.
--
--   Group 1/1b  re-grant:  grant execute on function <sig> to authenticated;
--               hr_server_now can go back to INVOKER, but ONLY after
--               hr_utc_day_key and hr_muster_window are re-granted — the
--               reverse of the order in §3, for the same reason.
--
--   A9 (§4)     per function:
--                 drop function public.<f>(<args>);                 -- the wrapper
--                 alter function public.<f>__ungated(<args>) rename to <f>;
--                 grant execute on function public.<f>(<args>) to authenticated;
--               then  drop function public.hr_rpc_gate(text);
--
-- The one-way door is §4's rename: a THIRD party (a future migration) doing
-- `create or replace function public.clan_deposit(...)` recreates the ORIGINAL
-- name as an ungated body while `clan_deposit__ungated` still exists, leaving
-- two live copies. §5's "already looks like a wrapper" check and the nightly
-- hygiene assertion both catch that state; nothing prevents it. Named, not
-- hidden.
-- ════════════════════════════════════════════════════════════════════════

-- The file must END on a terminated statement, not on a comment banner — the
-- smoke suite's migration guard checks exactly that, because a truncated
-- download or a bad paste is otherwise indistinguishable from a finished file.
do $$ begin
  raise notice 'authenticated-surface-lockdown: end of file reached cleanly.';
end $$;
