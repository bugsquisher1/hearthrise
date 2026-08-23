-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — AUTO-EAT GETS TWO TIERS (Designer ruling, 2026-08-23)
--
-- ── THE PROBLEM ─────────────────────────────────────────────────────────────
-- The death sheet is the game's best teaching moment, and what it teaches a
-- first-time player is "unlock Auto-Eat". Auto-Eat cost 100 Bounty Marks —
-- about 18 contracts, roughly 1,800 kills. The lesson pointed at a purchase the
-- first week could not make. The ruling: a cheap entry tier at 15 Marks that
-- triggers at 25% HP, so the SECOND session can buy what the FIRST death taught;
-- the existing 100-Mark trait becomes tier II and keeps today's settable
-- threshold.
--
-- ── WHAT A TIER IS, SERVER-SIDE ────────────────────────────────────────────
-- A CEILING on `player_state.auto_eat_pct`, and nothing else:
--
--     tier 0  no flag                        — cannot enable auto-eat at all
--     tier 1  flag 'trait:auto_eat'          — pct clamped to 25
--     tier 2  flag 'trait:auto_eat_2'        — pct up to 100 (today's behaviour)
--
-- The ENTRY tier deliberately keeps the EXISTING unlock id. src/features/
-- death-sheet.js reads `G.traits.auto_eat` / `window.TRAITS.auto_eat.cost`, so
-- keeping the cheap tier there makes the sheet quote the cheapest unlockable
-- price and stop nagging an owner, with no change to the sheet. It also means
-- `hr_set_auto_eat`'s entitlement gate keeps its meaning — "may this character
-- switch auto-eat on" — while tier II only widens the slider.
--
-- The numbers are authored ONCE, in src/core/auto-eat.js `AUTO_EAT_TIERS`, and
-- tests/auto-eat-authority.mjs binds them to the clamp below and to the prices
-- in legacy.js TRAITS / the generated src/data/shops.js.
--
-- ── WHY THE CLAMP IS ON WRITE, AND WHY THAT IS SUFFICIENT ──────────────────
-- The accrual engine prices an absence from `st.auto_eat_pct` as projected by
-- hr_state_of. Clamping on READ would mean adding a tier key to hr_state_of —
-- the most-restated body in the schema, with a generated derivation chain
-- (tests/run-sql-tests.mjs PART 1f-ii) — for a value the write path can simply
-- keep honest. So the invariant is established at the only door:
--
--   (1) `hr_set_auto_eat` is the ONLY writer of `auto_eat_pct` AND of
--       `auto_eat_enabled` (asserted by 2026-08-15-auto-eat.sql §4 and re-
--       asserted below);
--   (2) it clamps `v_pct` to the caller's ceiling on EVERY call, including the
--       `p_pct is null` path — otherwise a tier-1 owner who never touched the
--       slider would keep the column's default of 50;
--   (3) the engine only eats when `auto_eat_enabled`, which can only become
--       true through (1);
--   (4) an entitlement is never revoked, so a character's ceiling is monotone
--       and a value written under an older, lower ceiling is still legal.
--
--   ⇒ every row that can ever pay an absence satisfies `pct <= ceiling(tier)`.
--
-- §3 also clamps any pre-existing row for completeness. Measured on production
-- 2026-08-23 before applying: 2 characters, 0 rows with `auto_eat_enabled`, 0
-- rows of kind='flag' key='trait:auto_eat' — so the set is empty today and the
-- statement is there to make the invariant structural rather than argued.
--
-- The CLIENT applies the same ceiling on READ instead
-- (`HearthriseAuto.eatThreshold()`, the file's declared single reader of the
-- effective trigger point), which keeps a player's stored preference through an
-- upgrade. Different moment, same effective number — which is the property the
-- away/live parity guard needs.
--
-- ── ONE WIDENING, DELIBERATE ───────────────────────────────────────────────
-- The enable gate now accepts EITHER flag rather than only 'trait:auto_eat'.
-- A character who somehow held only tier II would otherwise own the more
-- expensive trait and be unable to switch it on — a dead purchase produced by a
-- gate that reads an id instead of a capability.
--
-- REVERSIBILITY: re-apply 2026-08-15-auto-eat.sql §2 to restore the unclamped
-- writer. No column is added, no row is deleted; §3's clamp is not reversible in
-- the sense that a lowered preference is not remembered — it affects 0 rows on
-- production today, which is why it is safe to state that plainly.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS ───────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_set_auto_eat(integer,boolean,text,integer,boolean)') is null then
    raise exception 'hr_set_auto_eat is absent — apply 2026-08-15-auto-eat.sql first';
  end if;
  if not exists (select 1 from public.hr_unlocks where unlock_id = 'trait:auto_eat_2') then
    raise exception 'hr_unlocks has no trait:auto_eat_2 row — apply the regenerated '
      '2026-08-16-unlocks.generated.sql first (tools/gen-unlocks.mjs from src/data/shops.js)';
  end if;
end $$;

-- ── 1. THE TIER READER ─────────────────────────────────────────────────────
-- Read straight from player_progress, UNFILTERED — not from hr_state_of's
-- LIMIT-ed envelope, for the same reason the entitlement gate does not (see
-- 2026-08-15-auto-eat.sql's header): a projection that truncates is a projection
-- that can silently answer "you own nothing".
create or replace function public.hr_auto_eat_tier(p_user uuid, p_slot int)
returns int language sql stable security definer
set search_path = public, pg_catalog as $$
  select case
    when exists (select 1 from public.player_progress
                  where user_id = p_user and slot = coalesce(p_slot, 0)
                    and kind = 'flag' and key = 'trait:auto_eat_2' and value > 0) then 2
    when exists (select 1 from public.player_progress
                  where user_id = p_user and slot = coalesce(p_slot, 0)
                    and kind = 'flag' and key = 'trait:auto_eat' and value > 0) then 1
    else 0
  end;
$$;

revoke execute on function public.hr_auto_eat_tier(uuid, int)
  from public, anon, authenticated, service_role;

-- The ceiling table — the SQL side of src/core/auto-eat.js `maxPctForTier`.
-- Tier 0 gets tier 1's ceiling rather than 0 for the reason that function states:
-- a character who owns nothing never eats anyway, and 0 would read as
-- "never auto-eat", which is the most damaging value in the range.
create or replace function public.hr_auto_eat_max_pct(p_tier int)
returns int language sql immutable set search_path = pg_catalog as $$
  select case when coalesce(p_tier, 0) >= 2 then 100 else 25 end;
$$;

revoke execute on function public.hr_auto_eat_max_pct(int)
  from public, anon, authenticated, service_role;

-- ── 2. hr_set_auto_eat — RESTATED from 2026-08-15-auto-eat.sql §2 ──────────
-- Two blocks change: the entitlement gate becomes tier-based, and the pct is
-- clamped to the tier ceiling. Everything else — the rate gate and its sampled
-- rejection, the advisory lock (byte-for-byte hr_apply's key), the food
-- catalogue checks, the collect-first refusal, the version bump and the ledger
-- row — is verbatim. §4 re-proves each rather than trusting the transcription.
create or replace function public.hr_set_auto_eat(
  p_slot int default 0,
  p_enabled boolean default null,
  p_food text default null,
  p_pct int default null,
  p_clear_food boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_st   public.player_state%rowtype;
  v_food text;
  v_pct  int;
  v_en   boolean;
  v_tier int;
  v_max  int;
  -- Mirrors ACCRUE_MIN_MS (60000 ms) in the accrual engine. Named, so the
  -- cross-language drift guard has something to read.
  c_collect_grace constant interval := interval '60 seconds';
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  -- A rejected call must still consume budget, or "spam it" is a free denial of
  -- service (apply-engine.sql:420). 30/hour is generous for a slider a player
  -- touches once and cheap for one that is dragged.
  if not public.hr_rate_ok(v_uid, 'set_auto_eat', 30, interval '1 hour') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'set_auto_eat') - 30) > 0 then
      perform public.hr_record_rejection(v_uid, coalesce(p_slot, 0), 'set_auto_eat',
        'rate_limited', jsonb_build_object('limit', 30, 'per', '1 hour'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'set_auto_eat') - 30));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot');
  end if;

  -- Serialise against a concurrent accrual on the same character. THE KEY MUST
  -- BE BYTE-FOR-BYTE the one hr_apply takes (apply-engine.sql:532) and
  -- market_list/cancel/buy take — a lock on a different key is not a lock, it
  -- is a comment that costs a syscall. Transaction-scoped, so it is released at
  -- commit, which is what makes it safe under the transaction-mode pooler.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_slot::text, 0));

  select * into v_st from public.player_state
   where user_id = v_uid and slot = p_slot for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  v_en  := coalesce(p_enabled, v_st.auto_eat_enabled);
  v_pct := coalesce(p_pct, v_st.auto_eat_pct);
  -- Three-valued food: NULL = leave alone, a string = set it, p_clear_food =
  -- back to "best in the bag". Without the explicit clear flag there would be
  -- no way to UNSET a nomination, because NULL already means "unchanged".
  v_food := case when p_clear_food then null
                 when p_food is not null then p_food
                 else v_st.auto_eat_food end;

  if v_pct < 0 or v_pct > 100 then
    return jsonb_build_object('ok', false, 'error', 'bad_pct');
  end if;

  if v_food is not null then
    if not exists (select 1 from public.hr_items where item_id = v_food) then
      return jsonb_build_object('ok', false, 'error', 'unknown_item',
                                'detail', jsonb_build_object('item_id', v_food));
    end if;
    -- The catalogue answers this, not `heals > 0`: a Feast or a Draught
    -- (foodClass 'buff') heals and must still be ineligible. b220 — auto-eat
    -- burning a Void Banquet to soak one wolf hit is the failure the rule
    -- exists to prevent, and the player can still eat it by hand.
    if not exists (select 1 from public.hr_items where item_id = v_food and auto_eatable) then
      return jsonb_build_object('ok', false, 'error', 'not_auto_eatable',
                                'detail', jsonb_build_object('item_id', v_food));
    end if;
  end if;

  -- THE TIER. One read, used by both the entitlement gate and the ceiling, so
  -- the two can never answer from different snapshots of the same fact.
  v_tier := public.hr_auto_eat_tier(v_uid, p_slot);
  v_max  := public.hr_auto_eat_max_pct(v_tier);

  -- THE ENTITLEMENT GATE. Only on the way ON: a player must always be able to
  -- switch it off, and must never be stuck with it on because an entitlement
  -- lookup failed. b45x: the gate is now "owns ANY tier" rather than "owns the
  -- tier-I id", so a character holding only the more expensive trait is not left
  -- with a purchase they cannot switch on.
  if v_en and not v_st.auto_eat_enabled then
    if v_tier < 1 then
      return jsonb_build_object('ok', false, 'error', 'trait_not_owned');
    end if;
  end if;

  -- THE TIER CEILING. Applied to v_pct — NOT to p_pct — so the `p_pct is null`
  -- path is clamped too: a tier-I owner who never touched the slider would
  -- otherwise keep the column default of 50 and be paid an absence at a
  -- threshold they did not buy. Clamped rather than refused because refusing
  -- would make "switch auto-eat on" fail for every fresh tier-I purchase.
  v_pct := least(v_pct, v_max);

  -- The mid-absence refusal. See the header block above this function.
  if v_st.active_kind <> 'idle' and now() - v_st.accrued_to >= c_collect_grace then
    return jsonb_build_object('ok', false, 'error', 'collect_first',
      'detail', jsonb_build_object('accrued_to', v_st.accrued_to,
                                   'unpaid_ms', floor(extract(epoch from (now() - v_st.accrued_to)) * 1000)));
  end if;

  update public.player_state
     set auto_eat_enabled = v_en,
         auto_eat_food    = v_food,
         auto_eat_pct     = v_pct,
         -- The optimistic-concurrency token. These three columns PRICE an
         -- absence, so an in-flight accrual holding the old version must be
         -- made to re-read rather than pay at the old settings.
         version          = version + 1,
         updated_at       = now()
   where user_id = v_uid and slot = p_slot;

  -- Journalled because it is an entitlement-gated setting that changes what a
  -- night pays, so "my Cooked Sharks vanished overnight" has to be answerable.
  -- ONE ROW PER CALL, rate-limited to 30/hour — this is a settings change, not
  -- a tick, and journal rule 6 (game_events: 1.6M rows from six players) is
  -- about per-tick logging, not about rare, audit-relevant writes.
  insert into public.player_ledger (user_id, slot, kind, intent, meta)
    values (v_uid, p_slot, 'admin', 'set_auto_eat',
            jsonb_build_object('enabled', v_en, 'food', v_food, 'pct', v_pct, 'tier', v_tier));

  return jsonb_build_object('ok', true, 'auto_eat',
    jsonb_build_object('enabled', v_en, 'food', v_food, 'pct', v_pct,
                       'tier', v_tier, 'max_pct', v_max));
end $$;

-- REVOKE BEFORE GRANT, and note who is NOT on the list.
--   • service_role — bypasses RLS and is not a player.
--   • hr_engine    — the accrual engine must not be able to turn a purchased
--                    trait ON for somebody.
revoke execute on function public.hr_set_auto_eat(int, boolean, text, int, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_set_auto_eat(int, boolean, text, int, boolean) to authenticated;

-- ── 3. Bring any pre-existing row inside its ceiling ───────────────────────
-- 0 rows on production 2026-08-23 (no character has auto_eat_enabled and no
-- character holds the trait flag). Present so the invariant in the header is
-- structural rather than an argument about who wrote the column first. The
-- version bump is deliberate: an in-flight accrual holding the old version must
-- re-read rather than price a night at a threshold this row no longer has.
do $$
declare v_n int;
begin
  update public.player_state ps
     set auto_eat_pct = public.hr_auto_eat_max_pct(public.hr_auto_eat_tier(ps.user_id, ps.slot)),
         version      = ps.version + 1,
         updated_at   = now()
   where ps.auto_eat_enabled
     and ps.auto_eat_pct > public.hr_auto_eat_max_pct(public.hr_auto_eat_tier(ps.user_id, ps.slot));
  get diagnostics v_n = row_count;
  raise notice 'auto-eat tier clamp: % pre-existing row(s) brought inside their ceiling', v_n;
end $$;

-- ── 4. SELF-VERIFYING COMMIT GATE ──────────────────────────────────────────
do $$
declare
  v_txt text;
  v_def text;
begin
  -- (a) the ceiling table is the one src/core/auto-eat.js authors.
  if public.hr_auto_eat_max_pct(0) <> 25 or public.hr_auto_eat_max_pct(1) <> 25
     or public.hr_auto_eat_max_pct(2) <> 100 then
    raise exception 'GATE(a): the ceiling table is (%,%,%), expected (25,25,100)',
      public.hr_auto_eat_max_pct(0), public.hr_auto_eat_max_pct(1), public.hr_auto_eat_max_pct(2);
  end if;
  -- CONTROL: a nonsense tier must not open the ceiling.
  if public.hr_auto_eat_max_pct(null) <> 25 or public.hr_auto_eat_max_pct(-3) <> 25 then
    raise exception 'GATE(a): a null/negative tier does not fail closed to 25';
  end if;

  -- (b) the catalogue row the ownership flag will be written against exists.
  if not exists (select 1 from public.hr_unlocks
                  where unlock_id = 'trait:auto_eat_2' and progress_kind = 'flag') then
    raise exception 'GATE(b): trait:auto_eat_2 is not a flag unlock in hr_unlocks';
  end if;
  if not exists (select 1 from public.hr_unlocks
                  where unlock_id = 'trait:auto_eat' and progress_kind = 'flag') then
    raise exception 'GATE(b): trait:auto_eat lost its hr_unlocks row';
  end if;

  -- (c) THE INVARIANT. No enabled character sits above its ceiling.
  if exists (select 1 from public.player_state ps
              where ps.auto_eat_enabled
                and ps.auto_eat_pct > public.hr_auto_eat_max_pct(
                      public.hr_auto_eat_tier(ps.user_id, ps.slot))) then
    raise exception 'GATE(c): an enabled character is above its auto-eat ceiling after the clamp';
  end if;

  -- (d) the restatement kept every property that was not supposed to move.
  v_def := pg_get_functiondef(to_regprocedure(
    'public.hr_set_auto_eat(integer,boolean,text,integer,boolean)'));
  if position('hr_rate_ok' in v_def) = 0 or position('hr_record_rejection' in v_def) = 0
     or position('hr_rate_sample_weight' in v_def) = 0 then
    raise exception 'GATE(d): the rate gate or its sampled rejection is gone from the restated body';
  end if;
  if position('pg_advisory_xact_lock(hashtextextended(v_uid::text || '':'' || p_slot::text, 0))'
        in v_def) = 0 then
    raise exception 'GATE(d): the advisory lock key is not byte-for-byte hr_apply''s — a lock on a '
      'different key is not a lock';
  end if;
  if position('collect_first' in v_def) = 0 then
    raise exception 'GATE(d): the mid-absence refusal is gone — log off with auto-eat off, switch '
      'it on, collect, and the whole night pays as if you had been eating';
  end if;
  if position('not_auto_eatable' in v_def) = 0 or position('trait_not_owned' in v_def) = 0
     or position('bad_pct' in v_def) = 0 then
    raise exception 'GATE(d): the restatement lost the food catalogue check, the entitlement gate '
      'or the pct range check';
  end if;
  if position('version          = version + 1' in v_def) = 0 then
    raise exception 'GATE(d): the version bump is gone — an in-flight accrual would price a night '
      'at settings that have already changed';
  end if;
  -- THE NEW PROPERTY: the clamp is applied to v_pct, i.e. AFTER the
  -- coalesce(p_pct, stored) — so the null-pct path is clamped too.
  if position('v_pct := least(v_pct, v_max)' in v_def) = 0 then
    raise exception 'GATE(d): the tier ceiling is not applied to v_pct — a tier-I owner who never '
      'touched the slider would keep the column default of 50';
  end if;

  -- (e) hr_set_auto_eat is STILL the only writer of the three columns. The whole
  --     write-clamp argument rests on this, so it is executed, not asserted in prose.
  select string_agg(p.oid::regprocedure::text, ', ') into v_txt
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language  l on l.oid = p.prolang
   where n.nspname = 'public'
     and p.prokind = 'f'                       -- pg_get_functiondef raises on an aggregate
     and l.lanname in ('sql', 'plpgsql')       -- …and on a C/internal function
     and p.proname <> 'hr_set_auto_eat'
     and pg_get_functiondef(p.oid) ~ 'set[[:space:]]+auto_eat_pct[[:space:]]*=';
  if v_txt is not null then
    raise exception 'GATE(e): auto_eat_pct is also written by % — the tier ceiling is enforced on '
      'the WRITE path only, so a second writer voids it', v_txt;
  end if;

  -- (f) grants: revoke-before-grant held, and the engine still cannot call it.
  select string_agg(r, ',') into v_txt from unnest(array['public','anon','service_role']) r
   where has_function_privilege(r, 'public.hr_set_auto_eat(int,boolean,text,int,boolean)', 'execute');
  if v_txt is not null then
    raise exception 'GATE(f): hr_set_auto_eat is executable by %', v_txt;
  end if;
  if not has_function_privilege('authenticated',
        'public.hr_set_auto_eat(int,boolean,text,int,boolean)', 'execute') then
    raise exception 'GATE(f): hr_set_auto_eat is not executable by authenticated — no player could set it';
  end if;
  if has_function_privilege('hr_engine', 'public.hr_set_auto_eat(int,boolean,text,int,boolean)', 'execute') then
    raise exception 'GATE(f): hr_engine can set a paid trait for a player';
  end if;
  select string_agg(r, ',') into v_txt from unnest(array['public','anon','authenticated','service_role']) r
   where has_function_privilege(r, 'public.hr_auto_eat_tier(uuid,integer)', 'execute')
      or has_function_privilege(r, 'public.hr_auto_eat_max_pct(integer)', 'execute');
  if v_txt is not null then
    raise exception 'GATE(f): an auto-eat tier helper is executable by % — it decides an entitlement', v_txt;
  end if;

  raise notice 'auto-eat tiers: I=25%% ceiling (trait:auto_eat), II=100%% (trait:auto_eat_2)';
end $$;

-- ── 5. EXECUTED PROBES — the ceiling, in a discarded subtransaction ────────
-- §4 proves the SHAPE. This proves the BEHAVIOUR, because the whole write-clamp
-- argument is about what a real call stores. HR819-discarded subtransaction:
-- hr_set_auto_eat writes player_ledger, whose retention guard refuses to DELETE
-- a fresh row, so a rollback is the only clean teardown.
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000ae-0000-0000-0000-0000000000ae';
  v_two  constant uuid := '000000af-0000-0000-0000-0000000000af';
  v_slot constant int  := 0;
  v_pct  int;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version, auto_eat_pct)
      values (v_uid, v_slot, 0, 0, 1, 50)
      on conflict (user_id, slot) do update set auto_eat_pct = 50;

    -- (a) NO TIER — enabling is refused, and the refusal writes nothing.
    v := public.hr_set_auto_eat(v_slot, true, null, null, false);
    if v->>'ok' <> 'false' or v->>'error' <> 'trait_not_owned' then
      raise exception 'GATE(h): enabling with no tier returned %', v;
    end if;
    if (select auto_eat_enabled from public.player_state where user_id = v_uid and slot = v_slot) then
      raise exception 'GATE(h): the refusal still switched auto-eat on';
    end if;

    -- (b) TIER I — enabling succeeds AND the stored pct is clamped to 25, even
    --     though the caller asked for 50. This is the ruling, executed.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'flag', 'trait:auto_eat', 1, '', null);
    v := public.hr_set_auto_eat(v_slot, true, null, 50, false);
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(h): tier I could not switch auto-eat on: %', v;
    end if;
    select auto_eat_pct into v_pct from public.player_state where user_id = v_uid and slot = v_slot;
    if v_pct <> 25 then
      raise exception 'GATE(h): tier I stored pct %, expected the 25%% ceiling', v_pct;
    end if;
    if (v->'auto_eat'->>'tier')::int <> 1 or (v->'auto_eat'->>'max_pct')::int <> 25 then
      raise exception 'GATE(h): the envelope does not report tier 1 / ceiling 25: %', v;
    end if;

    -- (b-ii) THE NULL-PCT PATH is clamped too. Force the column above the
    --        ceiling behind the RPC's back, then make a call that supplies NO
    --        pct — the stored value must still come back inside the ceiling.
    --        Without this the default of 50 would survive on any character who
    --        never touched the slider, which is most of them.
    update public.player_state set auto_eat_pct = 90 where user_id = v_uid and slot = v_slot;
    v := public.hr_set_auto_eat(v_slot, null, null, null, false);
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(h): a no-op settings call was refused: %', v;
    end if;
    select auto_eat_pct into v_pct from public.player_state where user_id = v_uid and slot = v_slot;
    if v_pct <> 25 then
      raise exception 'GATE(h): the null-pct path left % stored — the coalesce is clamped in the '
        'wrong order', v_pct;
    end if;

    -- (c) A LOWER value is the player's own choice and must NOT be raised.
    v := public.hr_set_auto_eat(v_slot, null, null, 10, false);
    select auto_eat_pct into v_pct from public.player_state where user_id = v_uid and slot = v_slot;
    if v_pct <> 10 then
      raise exception 'GATE(h): a deliberate 10%% was rewritten to % — the tier is a CEILING, not '
        'a fixed value', v_pct;
    end if;

    -- (d) TIER II — the ceiling opens. THE CONTROL for every clamp above: if
    --     this fails, (b) is satisfied by a function that clamps everybody.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'flag', 'trait:auto_eat_2', 1, '', null);
    v := public.hr_set_auto_eat(v_slot, null, null, 50, false);
    select auto_eat_pct into v_pct from public.player_state where user_id = v_uid and slot = v_slot;
    if v_pct <> 50 then
      raise exception 'GATE(h): tier II stored pct %, expected 50 — the ceiling did not open', v_pct;
    end if;
    if (v->'auto_eat'->>'tier')::int <> 2 or (v->'auto_eat'->>'max_pct')::int <> 100 then
      raise exception 'GATE(h): the envelope does not report tier 2 / ceiling 100: %', v;
    end if;
    -- …and 100 is still the wall.
    v := public.hr_set_auto_eat(v_slot, null, null, 101, false);
    if v->>'ok' <> 'false' or v->>'error' <> 'bad_pct' then
      raise exception 'GATE(h): an out-of-range pct was not refused: %', v;
    end if;

    -- (e) TIER II ALONE enables. The deliberate widening — a character holding
    --     only the upgrade must not own a trait they cannot switch on.
    perform set_config('request.jwt.claim.sub', v_two::text, true);
    insert into auth.users (id) values (v_two) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_two, v_slot, 0, 0, 1) on conflict (user_id, slot) do nothing;
    v := public.hr_set_auto_eat(v_slot, true, null, null, false);
    if v->>'ok' <> 'false' or v->>'error' <> 'trait_not_owned' then
      raise exception 'GATE(h): CONTROL failed — a second fresh character was not refused: %', v;
    end if;
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_two, v_slot, 'flag', 'trait:auto_eat_2', 1, '', null);
    v := public.hr_set_auto_eat(v_slot, true, null, null, false);
    if coalesce(v->>'ok','') <> 'true' or (v->'auto_eat'->>'tier')::int <> 2 then
      raise exception 'GATE(h): tier II alone could not switch auto-eat on: %', v;
    end if;

    raise exception using errcode = 'HR819', message = 'auto-eat-tiers §5 complete — rolling back';
  exception when sqlstate 'HR819' then
    null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state where user_id in
               ('000000ae-0000-0000-0000-0000000000ae','000000af-0000-0000-0000-0000000000af'))
     or exists (select 1 from public.player_ledger where user_id in
               ('000000ae-0000-0000-0000-0000000000ae','000000af-0000-0000-0000-0000000000af'))
     or exists (select 1 from public.player_progress where user_id in
               ('000000ae-0000-0000-0000-0000000000ae','000000af-0000-0000-0000-0000000000af'))
     or exists (select 1 from auth.users where id in
               ('000000ae-0000-0000-0000-0000000000ae','000000af-0000-0000-0000-0000000000af')) then
    raise exception 'GATE(h): §5 LEAKED a probe row';
  end if;
end $$;
