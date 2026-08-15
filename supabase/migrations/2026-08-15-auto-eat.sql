-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — AUTO-EAT AS SERVER STATE
--
-- ⚠ REVIEW ONLY — STAGED, NOT APPLIED. The Coordinator applies.
--
-- APPLY ORDER (all required, in this order, BEFORE this file):
--   1. 2026-08-11-player-state.sql          — already live
--   2. 2026-08-11-catalogue.generated.sql   — MUST BE RE-APPLIED. This change
--      adds `hr_items.auto_eatable`, generated from src/data/items.js
--      `isAutoEatable()`. §0 below FAILS CLOSED without it.
--   3. 2026-08-11-apply-engine.sql          — hr_state_of is REPLACED here
--   4. THIS FILE
--
-- Nothing here reads, writes or redefines hr_apply, so this is independent of
-- the apply-engine transcription problem. It DOES replace hr_state_of, and §4
-- asserts that the replacement still returns every key the old one did — a
-- silently shortened envelope is this repo's signature failure mode and it is
-- not going to be introduced by the migration that widens it.
--
-- SAFE TO RE-RUN. Additive only. No table is dropped, no column is altered,
-- no data is deleted.
--   ⚠ NEVER re-run supabase/schema.sql against production — its §1b
--     `drop table … cascade`s market/clan/raid data.
--
-- ════════════════════════════════════════════════════════════════════════
-- WHY THIS FILE EXISTS — the number, first
--
--   `src/core/combat-sim.js` calls `fx.autoEat` once per tick, after the
--   monster's swing and BEFORE the death check. The server accrual engine had
--   no such handler, and a missing fx handler is a NO-OP BY CONSTRUCTION
--   (combat-sim.js `call()` returns undefined for an absent name) — so the
--   omission never threw, never logged, and never appeared in a test. The
--   server simply never healed. The character died at the first bad streak and
--   every hour after that paid nothing.
--
--   MEASURED 2026-08-15 by executing both engines over the same seed
--   (0x5eed1234), the same 12-hour window and the same state, varying ONLY
--   whether auto-eat runs (tests/accrual-engine.mjs `autoEatParityGuard`):
--
--     fixture                    server (no eat)       client (eat)     server pays
--     early-game goblin          1,218 kills / 1.17h   12,790 / 12.00h    -90.5%
--     maxed vs slime             6,007 kills / 4.44h   16,211 / 12.00h    -62.9%
--     maxed vs the day-1 boss       48 kills / 0.13h    4,721 / 12.00h    -99.0%
--
--   The boss fixture is the one to read twice: the server's character survived
--   SEVEN MINUTES of a twelve-hour night. The accrual engine's own header
--   called this "an under-pay, not a mint" — a correct security posture and
--   the wrong player outcome, and under the 2026-08-15 ruling ("the offline
--   portion should function exactly the same as if the player was still
--   online", Tyler) it is simply a defect.
--
--   Auto-Eat is also the item the shop sells as the fix for exactly this:
--   "Eats for you when your health drops, INCLUDING while you're away — your
--   fights stop being ninety seconds long", 100 Bounty Marks. So the loss
--   lands hardest on the players who paid to avoid it.
--
-- ── WHY THIS IS THREE COLUMNS AND NOT A JSONB SETTINGS BAG ───────────────
--   player_state is deliberately narrow: anything that is a COLLECTION gets
--   its own table, and anything that is a scalar the engine reads on the hot
--   path is a column with a CHECK. These are three scalars read once per
--   accrual off the row hr_apply already locks. A jsonb bag would give them no
--   constraint, no default, and no way for `get_advisors` or a drift baseline
--   to see them — which is the argument the whole foundation is built on.
--
-- ── WHY THE ENGINE DOES NOT READ THE TRAIT OUT OF player_progress ────────
--   Ownership of the Auto-Eat trait is a `flag` progress row. hr_state_of's
--   progress read is LIMIT 1000 and reports `progress_truncated` — a bounded
--   read is right for a progress list, and catastrophic for a survival
--   mechanic: a character with a full collection log would silently stop
--   eating. So the RPC below checks the flag AT WRITE TIME, against the table,
--   unfiltered — and `player_state.auto_eat_enabled` becomes the receipt the
--   engine reads. One non-truncatable boolean on the row that is already
--   locked, and the expensive check happens once per settings change instead
--   of once per accrual.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions. FAIL CLOSED. ───────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state') is null then
    raise exception 'run 2026-08-11-player-state.sql first';
  end if;
  if to_regclass('public.player_progress') is null then
    raise exception 'run 2026-08-11-player-state.sql first (player_progress is missing)';
  end if;
  if to_regclass('public.hr_items') is null then
    raise exception 'run 2026-08-11-catalogue.generated.sql first';
  end if;
  -- The generated column this file validates against. A database still holding
  -- the pre-auto-eat catalogue would accept ANY item id as a nominated food,
  -- which is precisely the fail-open the catalogue exists to prevent (S3).
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hr_items'
                    and column_name = 'auto_eatable') then
    raise exception 'hr_items.auto_eatable is missing — RE-APPLY '
                    '2026-08-11-catalogue.generated.sql (regenerate it with '
                    'tools/gen-catalogues.mjs first)';
  end if;
  -- ...and it must be POPULATED, not merely present. `add column … default
  -- false` on a live table leaves every row false, and a catalogue where
  -- nothing is edible fails silently in the direction of "auto-eat stopped
  -- working" rather than loudly.
  if (select count(*) from public.hr_items where auto_eatable) = 0 then
    raise exception 'hr_items.auto_eatable is present but no row is true — the '
                    'catalogue was widened without being regenerated';
  end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'run 2026-08-11-apply-engine.sql first (hr_state_of is missing)';
  end if;
  if to_regprocedure('public.hr_rate_ok(uuid,text,int,interval)') is null then
    raise exception 'run 2026-08-11-player-state.sql first (hr_rate_ok is missing)';
  end if;
end $$;

-- ── 1. The columns ───────────────────────────────────────────────────────
-- `add column if not exists` so a re-run is a no-op, and every one carries a
-- NOT NULL default so no existing row can hold an unknown answer.
alter table public.player_state
  -- FALSE BY DEFAULT, and that is the security property rather than a
  -- preference. This column is the purchased-trait receipt: the only way it
  -- becomes true is hr_set_auto_eat, which requires the ownership flag. So on
  -- the day the accrual handler ships, it is INERT for every character — it
  -- cannot hand anybody a 100-Bounty-Mark trait for free.
  add column if not exists auto_eat_enabled boolean not null default false,
  -- The nominated Provision. NULL is legal and means "whatever heals most in
  -- the bag" — the same fallback src/core/auto-eat.js chooseFood() applies, and
  -- the same one the client has had since b220.
  add column if not exists auto_eat_food text,
  -- THE THRESHOLD IS AN INTEGER PERCENT, 0..100 — never a float.
  --   • the settings slider steps by 0.05, so every settable value is an exact
  --     multiple of 1% and nothing is lost;
  --   • a float column round-trips through jsonb as 0.15000000000000002, and
  --     the two sides then disagree about whether hp/maxHp is at the threshold
  --     on the one tick where it matters;
  --   • 0 must mean ZERO. `eat.threshold || 0.5` was a falsy-coalesce on a
  --     number and turned a deliberate "never auto-eat" into 50% (b326). A
  --     `not null` integer column cannot be coalesced by accident.
  add column if not exists auto_eat_pct int not null default 50;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_state'::regclass
                    and conname = 'player_state_auto_eat_pct_chk') then
    alter table public.player_state
      add constraint player_state_auto_eat_pct_chk check (auto_eat_pct between 0 and 100);
  end if;
  -- A nominated food id is bounded so a hostile setter cannot store a novel to
  -- be read back on every hr_state_of. The catalogue check in hr_set_auto_eat
  -- is the real gate; this is the one the DATABASE keeps whatever calls it.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_state'::regclass
                    and conname = 'player_state_auto_eat_food_chk') then
    alter table public.player_state
      add constraint player_state_auto_eat_food_chk
        check (auto_eat_food is null or length(auto_eat_food) between 1 and 64);
  end if;
end $$;

-- ── 2. hr_set_auto_eat — the ONE writer of those three columns ───────────
--
-- WHY THIS IS AN RPC AND NOT AN hr_apply DELTA KEY.
--   hr_apply is the single writer of everything a delta can touch, and that
--   stays true — none of the three columns is in the delta contract, so the
--   accrual engine cannot change a player's auto-eat settings as a side effect
--   of paying them. This is a PREFERENCE, set by the player, gated on an
--   entitlement; it moves no value, mints nothing, and it must be callable by
--   `authenticated` (the engine must NOT be able to call it — see the grants).
--   Giving it its own narrow, SECURITY DEFINER RPC is the clan-seat pattern:
--   one function, server clock, server-side catalogue, no client write policy.
--
-- WHY IT TAKES NO IDEMPOTENCY KEY.
--   Same reasoning as hr_create_character (design §2a-iv): this is a SET, not
--   an INCREMENT. Calling it twice with the same arguments leaves the same
--   state, so a replayed retry is already safe on a key that never expires —
--   whereas a uuid-keyed dedupe would be pruned after 24 hours and therefore
--   strictly weaker than the idempotence the operation already has.
--
-- ⚠ WHY IT REFUSES MID-ABSENCE: `collect_first`.
--   The equipment-at-collect over-payment (review S5) is that the accrual
--   prices a WHOLE window with the gear worn at the moment of collection: log
--   off naked, equip best-in-slot, collect, and the night pays at best-in-slot
--   rates — measured at 12.8x gold. Auto-eat is the same lever in a new
--   dimension and a bigger one: the measurements above show the difference
--   between eating and not eating is up to 98x. Log off with auto-eat off, come
--   back, switch it on, collect, and the whole night is paid as if you had been
--   eating Cooked Shark all along.
--   The house fix for S5 is `accrued_to = now()` on any such change, which
--   closes the hole by FORFEITING the unpaid span. That is the wrong trade for
--   a settings toggle — nobody should lose eight hours for moving a slider. So
--   this function refuses instead, with a machine code the client can act on:
--   collect (POST /hr-accrue), then retry. Nothing is lost and nothing is
--   over-paid.
--   The 60-second grace matches ACCRUE_MIN_MS in
--   supabase/functions/hr-accrue/accrual.js — below it the engine declines to
--   pay and writes nothing, so there is no span to over-pay and refusing would
--   just be rude. tests/accrual-engine.mjs reads BOTH numbers and fails if they
--   drift apart, rather than trusting this comment.
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
  -- (tests/accrual-engine.mjs asserts the two expressions match textually.)
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

  -- THE ENTITLEMENT GATE. Only on the way ON: a player must always be able to
  -- switch it off, and must never be stuck with it on because an entitlement
  -- lookup failed. Read straight from player_progress, unfiltered — NOT from
  -- hr_state_of's LIMIT-ed envelope (see the header).
  if v_en and not v_st.auto_eat_enabled then
    if not exists (select 1 from public.player_progress
                    where user_id = v_uid and slot = p_slot
                      and kind = 'flag' and key = 'trait:auto_eat' and value > 0) then
      return jsonb_build_object('ok', false, 'error', 'trait_not_owned');
    end if;
  end if;

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
            jsonb_build_object('enabled', v_en, 'food', v_food, 'pct', v_pct));

  return jsonb_build_object('ok', true, 'auto_eat',
    jsonb_build_object('enabled', v_en, 'food', v_food, 'pct', v_pct));
end $$;

-- REVOKE BEFORE GRANT, and note who is NOT on the list.
--   • service_role — bypasses RLS and is not a player.
--   • hr_engine    — the accrual engine must not be able to turn a purchased
--                    trait ON for somebody. Its whole capability is "propose a
--                    delta to a function that re-validates everything"; letting
--                    it flip an entitlement would widen that to "grant an
--                    entitlement", which is the same argument §2a-iv makes for
--                    keeping hr_create_character off the engine's list.
revoke execute on function public.hr_set_auto_eat(int, boolean, text, int, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_set_auto_eat(int, boolean, text, int, boolean) to authenticated;

-- ── 3. hr_state_of — the envelope grows by three keys ────────────────────
-- REPLACED VERBATIM from 2026-08-11-apply-engine.sql §2 with the `auto_eat`
-- block added to `state`. Everything else — including the VOLATILE marker,
-- which apply-engine §6(f) asserts and which a `create or replace` would
-- silently drop if it were omitted — is unchanged. §4 re-asserts the full key
-- list, so a bad transcription fails this migration instead of shortening the
-- client's world.
create or replace function public.hr_state_of(p_user uuid, p_slot int)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_st public.player_state%rowtype;
begin
  select * into v_st from public.player_state
   where user_id = p_user and slot = coalesce(p_slot, 0);
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  return jsonb_build_object(
    'ok', true,
    'version', v_st.version,
    'now', now(),
    'state', jsonb_build_object(
      'slot', v_st.slot, 'gold', v_st.gold, 'gems', v_st.gems,
      'hearth_tokens', v_st.hearth_tokens,
      'hp', v_st.hp, 'max_hp', v_st.max_hp, 'bank_cap', v_st.bank_cap,
      'active_kind', v_st.active_kind, 'active_id', v_st.active_id,
      'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to,
      -- AUTO-EAT. Flat keys rather than a nested object because the accrual
      -- shell reads them field by field off `st` and a nested bag would be one
      -- more place a `?? {}` could quietly turn a missing column into a
      -- default. `auto_eat_enabled` is the purchased-trait receipt.
      'auto_eat_enabled', v_st.auto_eat_enabled,
      'auto_eat_food', v_st.auto_eat_food,
      'auto_eat_pct', v_st.auto_eat_pct),
    'skills', coalesce((
      select jsonb_object_agg(skill_id, jsonb_build_object(
               'xp', xp, 'level', public.hr_level_from_xp(xp)))
        from public.player_skills where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'inventory', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.player_inventory where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'equipment', coalesce((
      select jsonb_object_agg(equip_slot, item_id)
        from public.player_equipment where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'farm', coalesce((
      select jsonb_agg(jsonb_build_object('i', plot_idx, 'crop', crop_id,
                                          'planted_at', planted_at, 'watered_at', watered_at)
                       order by plot_idx)
        from public.player_farm where user_id = p_user and slot = v_st.slot), '[]'::jsonb),
    'progress', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'key', key, 'value', value,
                                          'period', period_key, 'state', state))
        from (select kind, key, value, period_key, state
                from public.player_progress
               where user_id = p_user and slot = v_st.slot
                 and (period_key = '' or updated_at >= now() - interval '31 days')
               order by period_key, kind, key
               limit 1000) p), '[]'::jsonb),
    'progress_truncated', (
      select count(*) > 1000 from (
        select 1 from public.player_progress
         where user_id = p_user and slot = v_st.slot
           and (period_key = '' or updated_at >= now() - interval '31 days')
         limit 1001) t),
    'total_level', public.hr_total_level(p_user, v_st.slot)
  );
end $$;
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 4. SELF-VERIFICATION — the commit gate ───────────────────────────────
-- Every claim this file makes, executed. A migration that asserts nothing is a
-- migration that has not been tested.
do $$
declare
  v_bad int;
  v_n   int;
  v_txt text;
  v_keys text[];
  c_state_keys constant text[] := array[
    'slot','gold','gems','hearth_tokens','hp','max_hp','bank_cap',
    'active_kind','active_id','active_since','accrued_to',
    'auto_eat_enabled','auto_eat_food','auto_eat_pct'];
  c_env_keys constant text[] := array[
    'ok','version','now','state','skills','inventory','equipment','farm',
    'progress','progress_truncated','total_level'];
begin
  -- (a) The columns exist, with the right types and the fail-closed defaults.
  for v_txt in
    select c from unnest(array['auto_eat_enabled','auto_eat_food','auto_eat_pct']) c
     where not exists (select 1 from information_schema.columns
                        where table_schema='public' and table_name='player_state'
                          and column_name=c)
  loop
    raise exception 'player_state.% was not added', v_txt;
  end loop;

  select column_default into v_txt from information_schema.columns
   where table_schema='public' and table_name='player_state' and column_name='auto_eat_enabled';
  if v_txt is distinct from 'false' then
    raise exception 'auto_eat_enabled defaults to % — it MUST default to false, or shipping the '
                    'accrual handler hands every character a 100-Bounty-Mark trait for free', v_txt;
  end if;
  select is_nullable into v_txt from information_schema.columns
   where table_schema='public' and table_name='player_state' and column_name='auto_eat_enabled';
  if v_txt <> 'NO' then raise exception 'auto_eat_enabled is nullable — a NULL entitlement is not a no'; end if;
  select is_nullable into v_txt from information_schema.columns
   where table_schema='public' and table_name='player_state' and column_name='auto_eat_pct';
  if v_txt <> 'NO' then raise exception 'auto_eat_pct is nullable — see the b326 falsy-coalesce note'; end if;

  -- (b) The CHECK constraints are real, not aspirational. Asserted by
  --     EXECUTING them against a temp table with the same expressions, because
  --     "the constraint exists" and "the constraint rejects" are different
  --     claims and only the second one is worth anything.
  if not exists (select 1 from pg_constraint
                  where conrelid='public.player_state'::regclass
                    and conname='player_state_auto_eat_pct_chk') then
    raise exception 'the auto_eat_pct range constraint is missing';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid='public.player_state'::regclass
                    and conname='player_state_auto_eat_food_chk') then
    raise exception 'the auto_eat_food length constraint is missing';
  end if;
  create temp table hr_ae_probe (
    pct int not null default 50 check (pct between 0 and 100),
    food text check (food is null or length(food) between 1 and 64)
  ) on commit drop;
  begin
    insert into hr_ae_probe (pct) values (101);
    raise exception 'the pct CHECK expression accepted 101 — the constraint on player_state is vacuous';
  exception when check_violation then null; end;
  begin
    insert into hr_ae_probe (pct) values (-1);
    raise exception 'the pct CHECK expression accepted -1';
  exception when check_violation then null; end;
  -- THE CONTROL. A refusal probe with no control proves only that inserting is
  -- hard. 0 and 100 are the legal extremes and must both pass — 0 in
  -- particular, because "never auto-eat" is a real choice and the b326 bug was
  -- exactly a 0 being treated as absent.
  insert into hr_ae_probe (pct) values (0), (100), (50);
  if (select count(*) from hr_ae_probe) <> 3 then
    raise exception 'the pct CHECK rejected a legal value — 0, 50 and 100 must all be settable';
  end if;
  drop table hr_ae_probe;

  -- (c) NO CLIENT WRITE POLICY, NO CLIENT WRITE GRANT. Re-asserted here rather
  --     than trusted from player-state.sql, because this file is the one that
  --     just added three columns a client would like to set directly.
  select count(*) into v_bad from pg_policies
   where schemaname='public' and tablename='player_state' and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_bad > 0 then raise exception '% write policies on player_state', v_bad; end if;
  select count(*) into v_bad from information_schema.role_table_grants
   where table_schema='public' and table_name='player_state'
     and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER');
  if v_bad > 0 then raise exception '% client write grants on player_state', v_bad; end if;

  -- (d) THE GRANTS ON hr_set_auto_eat. Revoke-before-grant, asserted both ways:
  --     the roles that must NOT hold it, and the one that must.
  for v_txt in select r from unnest(array['anon','service_role','hr_engine']) r
                where has_function_privilege(r, 'public.hr_set_auto_eat(int,boolean,text,int,boolean)', 'execute')
  loop
    raise exception 'hr_set_auto_eat is executable by % — %', v_txt,
      case when v_txt = 'hr_engine'
           then 'the accrual engine must not be able to switch a purchased trait ON'
           else 'only a signed-in player may change their own settings' end;
  end loop;
  if not has_function_privilege('authenticated', 'public.hr_set_auto_eat(int,boolean,text,int,boolean)', 'execute') then
    raise exception 'hr_set_auto_eat is not executable by authenticated — no player could set it';
  end if;
  -- PUBLIC must hold nothing. `revoke … from public` before granting is the
  -- rule; this is the assertion that it happened. `aclexplode` rather than a
  -- regex on proacl::text, because grantee = 0 IS the definition of PUBLIC and
  -- a regex over an ACL string is the kind of assertion that passes while
  -- asserting nothing.
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
              where p.oid = to_regprocedure('public.hr_set_auto_eat(int,boolean,text,int,boolean)')
                and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'hr_set_auto_eat is still executable by PUBLIC';
  end if;

  -- (e) SEARCH_PATH pinned, and SECURITY DEFINER. `get_advisors` flags a
  --     mutable search_path on a definer function, and it is the difference
  --     between "this reads public.hr_items" and "this reads whatever the
  --     caller put first on the path".
  if not exists (select 1 from pg_proc p
                  where p.oid = to_regprocedure('public.hr_set_auto_eat(int,boolean,text,int,boolean)')
                    and p.prosecdef
                    and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%') then
    raise exception 'hr_set_auto_eat is not SECURITY DEFINER with a pinned search_path';
  end if;

  -- (f) hr_state_of MUST STILL BE VOLATILE. `create or replace` re-declares the
  --     whole function, so omitting one word here would silently undo the RL1
  --     fix that apply-engine §6(f) exists to protect — every second apply
  --     returning version_conflict, in production, on day one.
  if (select provolatile from pg_proc
       where oid = to_regprocedure('public.hr_state_of(uuid,int)')) <> 'v' then
    raise exception 'hr_state_of is no longer VOLATILE — hr_apply may return pre-write state (RL1)';
  end if;
  if not exists (select 1 from pg_proc p
                  where p.oid = to_regprocedure('public.hr_state_of(uuid,int)')
                    and p.prosecdef
                    and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%') then
    raise exception 'hr_state_of lost SECURITY DEFINER or its pinned search_path';
  end if;
  for v_txt in select r from unnest(array['anon','authenticated','service_role']) r
                where has_function_privilege(r, 'public.hr_state_of(uuid,int)', 'execute')
  loop
    raise exception 'hr_state_of is executable by % — it takes an arbitrary uuid', v_txt;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_state_of(uuid,int)', 'execute') then
    raise exception 'hr_state_of is no longer executable by hr_engine — the accrual engine is dead';
  end if;

  -- (g) THE ENVELOPE DID NOT SHRINK. This is the assertion this migration most
  --     needs: hr_state_of was transcribed by hand, and a dropped key would be
  --     a silently smaller world for the client rather than an error.
  --     Read out of the INSTALLED function's own body, not out of this file:
  --     `prosrc` is what the database will actually execute, so a key that is
  --     not in that text cannot be returned no matter what the migration
  --     intended. (A behavioural call would need a real auth.users row and a
  --     real character; this is the strongest claim available without one, and
  --     the behavioural half is covered by tests/sql/server-authority.test.sql.)
  select prosrc into v_txt from pg_proc
   where oid = to_regprocedure('public.hr_state_of(uuid,int)');
  select array_agg(k) into v_keys from unnest(c_env_keys) k
   where position('''' || k || '''' in v_txt) = 0;
  if v_keys is not null then
    raise exception 'hr_state_of no longer returns %: the envelope was shortened by this migration',
      array_to_string(v_keys, ', ');
  end if;
  select array_agg(k) into v_keys from unnest(c_state_keys) k
   where position('''' || k || '''' in v_txt) = 0;
  if v_keys is not null then
    raise exception 'hr_state_of.state is missing %', array_to_string(v_keys, ', ');
  end if;
  -- ...and the bounded progress read kept BOTH halves. A limit without the
  -- companion truncation flag is a silently shortened list, which is exactly
  -- the failure this repo keeps finding.
  if position('limit 1000' in v_txt) = 0 or position('progress_truncated' in v_txt) = 0 then
    raise exception 'hr_state_of lost its bounded progress read or its truncation flag';
  end if;

  -- (h) THE CATALOGUE ANSWERS THE QUESTION THE RPC ASKS. A Feast heals and must
  --     still be ineligible; a Provision must be eligible. Both directions, so
  --     an `auto_eatable = heals > 0` "simplification" fails here.
  select count(*) into v_bad from public.hr_items where auto_eatable and coalesce(heals,0) <= 0;
  if v_bad > 0 then raise exception '% auto-eatable catalogue rows heal nothing', v_bad; end if;
  select count(*) into v_n from public.hr_items where coalesce(heals,0) > 0 and not auto_eatable;
  if v_n = 0 then
    raise exception 'every healing item is auto-eatable — auto_eatable has degenerated into '
                    '(heals > 0) and a Feast could now be burned to soak one hit (b220)';
  end if;

  raise notice 'AUTO-EAT OK — 3 columns (default OFF), hr_set_auto_eat authenticated-only, '
               'hr_state_of widened and still VOLATILE, % of % healing items auto-eatable.',
    (select count(*) from public.hr_items where auto_eatable),
    (select count(*) from public.hr_items where coalesce(heals,0) > 0);
end $$;
