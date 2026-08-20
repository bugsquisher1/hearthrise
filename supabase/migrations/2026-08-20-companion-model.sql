-- ════════════════════════════════════════════════════════════════════════
-- 2026-08-20-companion-model.sql — THE EQUIPPED COMPANION BECOMES SERVER STATE,
-- AND ITS PASSIVE BONUS BECOMES SERVER-OWNED (the last of the 6 blocked reward
-- sources; the effect-half of the b410 companion purchase gate).
--
-- Backend Architect, 2026-08-20. STAGED, NOT APPLIED (the Coordinator applies).
--
-- ⚠ SECURITY GATE — MUST go to the Security Engineer before it is applied.
--   THE EQUIPPED-ID IS THE MINT VECTOR: a forged equipped='raccoon' would mint
--   goldFind (→ gold, a tradeable) into the player's own economy. This file
--   closes it by making the equipped id SERVER STATE (player_state.companion_
--   equipped) that only hr_companion_equip writes, AFTER a server-side OWNERSHIP
--   check — you cannot equip a companion you do not server-own. The passive
--   bonus is then priced at accrual from THAT server state, never from a client
--   value. The RPC is client-callable (like hr_set_auto_eat), so the ownership
--   gate + the version/collect-first guards are the whole security surface.
--
-- ── WHAT SHIPS ───────────────────────────────────────────────────────────
-- (1) player_state.companion_equipped text — the SERVER-OWNED equipped id.
-- (2) hr_companion_equip(slot, companion, unequip) — SECURITY DEFINER,
--     ownership-gated, version-bumping, collect-first-guarded. Mirrors
--     hr_set_auto_eat: a companion changes what a night pays, so it forces a
--     collect before it repricing an in-flight accrual, exactly as auto-eat does.
-- (3) hr_perks_of re-defined (4th HR_PERKS_OF_CHAIN link) to add the
--     `companion: { id, xp }` bookkeeping — the id from (1), the xp from a
--     server aggregate row (kind='stat', key='companion_xp:<id>'), read
--     self-configuringly so an absent xp writer reads 0 → level 1 → the base
--     magnitude. src/core/
--     companion-perk.js turns {id,xp} into magnitudes from the COMPANIONS
--     catalogue (the room/renown split — no pet data in SQL).
--
-- ── WHAT IS SERVER-OWNED vs STILL CLIENT (stated plainly) ────────────────
--   SERVER-OWNED now:  the EQUIPPED id; the OWNERSHIP of shop companions
--                      (b410 unlock rows) + the starter fox; the PASSIVE BONUS
--                      (governed percentage keys + farmYield) priced at accrual.
--   STILL CLIENT / DEFERRED (tracked follow-ups, each an UNDER-pay = safe):
--     · companion XP → level. No server writer yet, so hr_perks_of returns
--       xp 0 → the level-1 base magnitude. The projection is level-AWARE (it
--       reads kind='stat' key='companion_xp:<id>'), so the day an XP-accrual slice lands, levels
--       light up with NO change here — the self-configuring switch, exactly like
--       hr_unlock_levels. Consequence: a leveled pet pays its BASE server-side
--       until then (client shows more; reconciles DOWN to server truth).
--     · COMBAT-STAT companions (strB/atkB/defB/crit). Those reach the sim via
--       equipmentStats → `eq`, not the bonus vector, so projecting them is a
--       combat-damage-path change. Every SHOP companion has ZERO combat stats,
--       so the un-gate is complete without them. src/core/companion-perk.js
--       COMPANION_KEYS is the projected set.
--     · PROCS (gold/extraGold/doubleDrop/…). An RNG-seam change to resolveKill /
--       the gather seam — deferred to keep AWAY-1 byte-identical. They stay
--       client-display flavor, arm-gated for the gold ones (companions.js
--       rollProc). BUILDING them is a draw-ORDERING change and was explicitly
--       scoped out of this slice.
--     · NON-SHOP ACQUISITION (drop/skill/boss/quest/hatch). Same rng-seam grant
--       path as procs; deferred. Only server-owned ownership (shop + fox) can be
--       equipped server-side today, which is the un-gate target.
--
-- ── BYTE-PARITY (the load-bearing claim) ─────────────────────────────────
-- The passive bonus is applied by accrual.js `bonusFor` as a SEPARATE additive
-- layer 1 (src/core/companion-perk.js companionBonus), summed on top of the
-- fused layer 0, precisely as the client wraps window.getBonus. It draws NO rng
-- and pays on AWAY_SCOPE.permanent (true) → live and away share every seeded
-- draw → AWAY-1 stays byte-identical. resolveKill's draw order is UNTOUCHED.
--
-- REVERSIBILITY: `drop function public.hr_companion_equip(int,text,boolean)`,
--   re-apply 2026-08-20-renown.sql to restore the pre-companion hr_perks_of
--   body (companion channel back to blocked), and the column may be left
--   (nullable, unread) or dropped. Additive, idempotent, safe to re-run.
--
-- APPLY AFTER: 2026-08-11-player-state.sql, 2026-08-19-companion-unlocks.sql
--   (the ownership rows the gate reads), 2026-08-20-renown.sql (the current last
--   toucher of hr_perks_of — this is a faithful SUPERSET of that body).
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — fail CLOSED ───────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state') is null then
    raise exception 'player_state is missing — apply 2026-08-11-player-state.sql first';
  end if;
  if to_regclass('public.player_progress') is null then
    raise exception 'player_progress is missing — apply 2026-08-11-player-state.sql first';
  end if;
  if to_regprocedure('public.hr_perks_of(uuid,int)') is null then
    raise exception 'hr_perks_of is missing — apply 2026-08-15-perk-channel.sql (+ its chain) first';
  end if;
  -- THE PREDECESSOR GATE. §2 REPLACES hr_perks_of, so the live body MUST be
  -- 2026-08-20-renown.sql's — otherwise this replace silently drops the renown
  -- channel (or the artisan gate it carries). Positive marker + negative control.
  if position('derived:hr_renown_of' in (
        select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='public' and p.proname='hr_perks_of')) = 0 then
    raise exception 'the LIVE hr_perks_of is not the 2026-08-20-renown.sql body (no renown channel). '
                    'Apply that file first; do NOT replace a body you cannot account for.';
  end if;
  if not exists (
    select 1 from pg_roles where rolname = 'hr_engine'
  ) then
    raise exception 'the hr_engine role is missing — apply 2026-08-11-accrual.sql first';
  end if;
end $$;

-- ── 1. THE SERVER-OWNED EQUIPPED ID ──────────────────────────────────────
-- Nullable text: NULL = no companion equipped (the client's `equipped: null`).
-- No FK to a companion catalogue table — companions live in src/data, not SQL;
-- the ownership gate in §3 is what constrains it to a real, owned id.
alter table public.player_state add column if not exists companion_equipped text;

-- ── 2. hr_perks_of — FAITHFUL SUPERSET of the renown body + the companion
--       channel. Do not hand-edit; it is pinned to HR_PERKS_OF_CHAIN.
--
-- ⚠ This restatement carries 2026-08-20-renown.sql's body VERBATIM and makes
--   exactly these changes, all declared in HR_PERKS_OF_CHAIN's removals list:
--     · INSERTS the companion read (v_comp_id/v_comp_xp + two selects)   [additive]
--     · INSERTS the `companion` field into the returned object           [additive]
--     · CHANGES the sources.companions census line (blocked → derived)   [1 removal]
--   Everything else — the whole artisan gate, the renown channel, every source
--   line — is preserved line for line.
create or replace function public.hr_perks_of(p_user uuid, p_slot int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
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
      'clan',       'derivable:contributes_zero',
      'castle',     'blocked:perk_table_client_side',
      'companions', 'derived:player_state.companion_equipped')
  );
end $$;

revoke execute on function public.hr_perks_of(uuid, int) from public;
revoke execute on function public.hr_perks_of(uuid, int)
  from anon, authenticated, service_role;
grant execute on function public.hr_perks_of(uuid, int) to hr_engine;

-- ── 3. hr_companion_equip — SET THE SERVER-OWNED EQUIPPED ID ─────────────
-- Client-callable (authenticated), the hr_set_auto_eat pattern: a companion
-- changes what a night pays, so it is version-bumping and collect-first-guarded.
-- THE OWNERSHIP GATE is the security property — you cannot equip what you do
-- not server-own.
create or replace function public.hr_companion_equip(
  p_slot int default 0,
  p_companion text default null,
  p_unequip boolean default false)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_st    public.player_state%rowtype;
  v_target text;
  -- Mirrors ACCRUE_MIN_MS (60000 ms). Named, for the drift guard.
  c_collect_grace constant interval := interval '60 seconds';
  -- ⚠ THE STARTER, as a NAMED constant (like src/core/perks.js CASTLE_TIER):
  --   src/data/companions.js `fox` has source:'starter' and the client seeds it
  --   equipped by default. It has no purchase unlock row, so it is owned by
  --   grammar, not by a row. A sixth starter would move this one datum.
  c_starter constant text := 'fox';
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  -- A rejected call must still consume budget (apply-engine.sql:420). Equipping
  -- is a click a player makes rarely; 30/hour is generous and cheap.
  if not public.hr_rate_ok(v_uid, 'companion_equip', 30, interval '1 hour') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'companion_equip') - 30) > 0 then
      perform public.hr_record_rejection(v_uid, coalesce(p_slot, 0), 'companion_equip',
        'rate_limited', jsonb_build_object('limit', 30, 'per', '1 hour'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'companion_equip') - 30));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot');
  end if;

  -- The target id: NULL when unequipping. A blank string is treated as unequip
  -- rather than a lookup that can never match.
  v_target := case when p_unequip or p_companion is null or p_companion = '' then null
                   else p_companion end;

  -- Serialise against a concurrent accrual on the SAME character — the SAME key
  -- hr_apply / hr_set_auto_eat take (a lock on a different key is not a lock).
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_slot::text, 0));

  select * into v_st from public.player_state
   where user_id = v_uid and slot = p_slot for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  -- ── THE OWNERSHIP GATE — the mint-vector closure ──────────────────────
  -- Equipping requires server-owned ownership: a companion:<id> unlock row
  -- (b410 purchases + any future server acquisition) OR the starter. Unequip
  -- (NULL) is always allowed. A forged id with no row is refused by NAME.
  if v_target is not null and v_target <> c_starter then
    if not exists (
      select 1 from public.player_progress
       where user_id = v_uid and slot = p_slot
         and kind = 'unlock' and period_key = ''
         and key = 'companion:' || v_target and value > 0
    ) then
      perform public.hr_record_rejection(v_uid, p_slot, 'companion_equip', 'not_owned',
        jsonb_build_object('companion', v_target));
      return jsonb_build_object('ok', false, 'error', 'not_owned',
        'detail', jsonb_build_object('companion', v_target));
    end if;
  end if;

  -- The mid-absence refusal — a companion reprices a running accrual, so the
  -- client must collect first, exactly as auto-eat requires.
  if v_st.active_kind <> 'idle' and now() - v_st.accrued_to >= c_collect_grace then
    return jsonb_build_object('ok', false, 'error', 'collect_first',
      'detail', jsonb_build_object('accrued_to', v_st.accrued_to,
                                   'unpaid_ms', floor(extract(epoch from (now() - v_st.accrued_to)) * 1000)));
  end if;

  -- No-op guard: equipping the already-equipped id (or unequipping nothing) is
  -- a success that must NOT bump the version — a version bump forces every
  -- in-flight client to re-read for a state that did not change.
  if v_st.companion_equipped is not distinct from v_target then
    return jsonb_build_object('ok', true, 'companion', v_target, 'unchanged', true);
  end if;

  update public.player_state
     set companion_equipped = v_target,
         -- The optimistic-concurrency token: this column prices an absence, so
         -- an in-flight accrual holding the old version must re-read.
         version    = version + 1,
         updated_at = now()
   where user_id = v_uid and slot = p_slot;

  -- Journalled: it changes what a night pays, so "my pet's bonus vanished"
  -- is answerable. ONE ROW PER CALL, rate-limited — a settings change, not a
  -- tick (journal rule 6 is about per-tick logging).
  insert into public.player_ledger (user_id, slot, kind, intent, meta)
    values (v_uid, p_slot, 'admin', 'companion_equip',
            jsonb_build_object('companion', v_target, 'prev', v_st.companion_equipped));

  return jsonb_build_object('ok', true, 'companion', v_target);
end $$;

-- REVOKE BEFORE GRANT. NOT hr_engine — the accrual engine must not be able to
-- equip a companion for somebody (its capability is "propose a delta the RPC
-- re-validates", never "flip a preference"). NOT service_role/anon.
revoke execute on function public.hr_companion_equip(int, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_companion_equip(int, text, boolean) to authenticated;

-- ── 4. SELF-VERIFICATION — the commit gate ───────────────────────────────
do $$
declare v_p oid; v_bad text;
begin
  -- (a) hr_perks_of still engine-only, SECURITY DEFINER, pinned search_path.
  v_p := to_regprocedure('public.hr_perks_of(uuid,int)');
  foreach v_bad in array array['public','anon','authenticated','service_role'] loop
    if has_function_privilege(v_bad, v_p, 'execute') then
      raise exception 'hr_perks_of is EXECUTABLE BY % — cross-player perk read', v_bad;
    end if;
  end loop;
  if not has_function_privilege('hr_engine', v_p, 'execute') then
    raise exception 'hr_perks_of is not executable by hr_engine — accrual reads zero perks';
  end if;

  -- (b) hr_companion_equip is CLIENT-callable but NOT engine/anon/service_role.
  v_p := to_regprocedure('public.hr_companion_equip(int,text,boolean)');
  if v_p is null then raise exception 'hr_companion_equip did not install'; end if;
  if not has_function_privilege('authenticated', v_p, 'execute') then
    raise exception 'hr_companion_equip is not executable by authenticated — the client cannot equip';
  end if;
  foreach v_bad in array array['public','anon','service_role','hr_engine'] loop
    if has_function_privilege(v_bad, v_p, 'execute') then
      raise exception 'hr_companion_equip is executable by % — it must be authenticated-only', v_bad;
    end if;
  end loop;
  if (select prosecdef from pg_proc where oid = v_p) is not true then
    raise exception 'hr_companion_equip is not SECURITY DEFINER';
  end if;

  -- (c) THE COLUMN EXISTS and has no client write surface (RLS: only the RPC
  --     writes it; player_state has no client UPDATE policy — assert it).
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='player_state'
                    and column_name='companion_equipped') then
    raise exception 'player_state.companion_equipped did not install';
  end if;
  select string_agg(policyname || ':' || cmd, ', ') into v_bad from pg_policies
   where schemaname='public' and tablename='player_state' and cmd <> 'SELECT';
  if v_bad is not null then
    raise exception 'player_state grew a non-SELECT policy (%) — a client could write its own equipped id', v_bad;
  end if;

  raise notice 'companion-model §4(a-c) PASSED: hr_perks_of engine-only; hr_companion_equip '
               'authenticated-only + SECURITY DEFINER; the column installed with no client write policy.';
end $$;

-- (d) BEHAVIOUR — the ownership gate bites, a legal equip lands + projects,
--     unequip clears, all in a rolled-back subtransaction.
do $$
declare
  v_uid uuid := '00000000-0000-4000-8000-0000000c0e91'::uuid;
  v_r   jsonb; v_p jsonb;
begin
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'companion-model §4(d) CANNOT RUN: hr_create_character missing — apply '
                    '2026-08-14-character-bootstrap.sql first';
  end if;

  begin  -- ── subtransaction, rolled back ──────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    perform public.hr_create_character(0);

    -- (i) THE GATE BITES: equipping an UNOWNED companion is refused by name and
    --     writes nothing.
    v_r := public.hr_companion_equip(0, 'raccoon', false);
    if v_r->>'error' is distinct from 'not_owned' then
      raise exception '§4(d)(i): equipping unowned raccoon answered % (expected not_owned — the mint gate)', v_r;
    end if;
    if (select companion_equipped from public.player_state where user_id=v_uid and slot=0) is not null then
      raise exception '§4(d)(i): a REFUSED equip still wrote the column';
    end if;

    -- (ii) THE STARTER is owned by grammar: equipping fox LANDS with no row.
    v_r := public.hr_companion_equip(0, 'fox', false);
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception '§4(d)(ii): equipping the starter fox was refused (%)', v_r;
    end if;
    if (select companion_equipped from public.player_state where user_id=v_uid and slot=0) <> 'fox' then
      raise exception '§4(d)(ii): fox did not reach the column';
    end if;
    -- …and hr_perks_of projects it as {id:'fox', xp:0} (level 1 base).
    v_p := public.hr_perks_of(v_uid, 0);
    if v_p->'companion'->>'id' <> 'fox' or (v_p->'companion'->>'xp')::bigint <> 0 then
      raise exception '§4(d)(ii): hr_perks_of companion reads % — expected {fox,0}', v_p->'companion';
    end if;
    if v_p->'sources'->>'companions' <> 'derived:player_state.companion_equipped' then
      raise exception '§4(d)(ii): sources.companions reads % — the channel census did not update',
        v_p->'sources'->>'companions';
    end if;

    -- (iii) A PURCHASED companion (an ownership row) equips.
    insert into public.player_progress (user_id, slot, kind, key, period_key, value)
      values (v_uid, 0, 'unlock', 'companion:raccoon', '', 1)
      on conflict (user_id, slot, kind, key, period_key) do update set value = 1;
    v_r := public.hr_companion_equip(0, 'raccoon', false);
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception '§4(d)(iii): equipping OWNED raccoon was refused (%)', v_r;
    end if;
    v_p := public.hr_perks_of(v_uid, 0);
    if v_p->'companion'->>'id' <> 'raccoon' then
      raise exception '§4(d)(iii): hr_perks_of did not switch to raccoon: %', v_p->'companion';
    end if;

    -- (iv) A COMPANION-XP aggregate row (kind='stat', key='companion_xp:<id>')
    --      lifts the projected xp — the self-configuring seam the XP-accrual
    --      follow-up fills through the existing 'stat' allowlist channel.
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
      values (v_uid, 0, 'stat', 'companion_xp:raccoon', '', 5000, 'active')
      on conflict (user_id, slot, kind, key, period_key) do update set value = 5000;
    v_p := public.hr_perks_of(v_uid, 0);
    if (v_p->'companion'->>'xp')::bigint <> 5000 then
      raise exception '§4(d)(iv): companion xp did not project: %', v_p->'companion';
    end if;

    -- (v) UNEQUIP clears the column and nulls the channel.
    v_r := public.hr_companion_equip(0, null, true);
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception '§4(d)(v): unequip refused (%)', v_r;
    end if;
    v_p := public.hr_perks_of(v_uid, 0);
    if v_p->'companion' <> 'null'::jsonb and v_p->'companion' is not null then
      raise exception '§4(d)(v): companion channel not null after unequip: %', v_p->'companion';
    end if;

    raise exception using errcode = 'HRC20', message = 'companion-model §4(d) complete — rolling back';
  exception when sqlstate 'HRC20' then
    null;
  end;

  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'companion-model §4(d) LEAKED a probe row';
  end if;

  raise notice 'COMPANION-MODEL OK — the ownership gate refuses an unowned companion by name (writing '
               'nothing), the starter is owned by grammar, a purchased companion equips + projects, a '
               'companion_xp row lifts the projected xp, unequip clears the channel. Zero residue.';
end $$;

-- ── 5. RECORD hr_companion_equip IN THE CLIENT-RPC BASELINE ──────────────
-- A migration that grants a new client-callable RPC is not finished until it has
-- decided which of the two the baseline records (auto-eat-baseline.sql's rule):
-- the client GENUINELY owns this surface (a player chooses their own companion),
-- so the row is a standing statement that the client MAY call it. Deliberately
-- NOT granted to hr_engine, and asserted so in §6.
do $$
declare v_n int := 0;
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'hr_client_rpc_baseline absent — apply 2026-08-11-grant-hygiene.sql first';
  end if;
  if to_regproc('public.hr_companion_equip') is null then
    raise exception 'hr_companion_equip absent — §3 did not install';
  end if;

  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note)
  select p.proname, pg_get_function_identity_arguments(p.oid), 'authenticated',
         'companion equip: the player owns which companion is equipped. Ownership-gated + '
         'version-bumping + collect-first-guarded (the hr_set_auto_eat pattern). Deliberately NOT '
         'granted to hr_engine — the engine must never equip a companion for somebody. 2026-08-20'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'hr_companion_equip'
     and not exists (
       select 1 from public.hr_client_rpc_baseline b
        where b.proname = p.proname
          and b.identity_args = pg_get_function_identity_arguments(p.oid)
          and b.grantee = 'authenticated');
  get diagnostics v_n = row_count;
  raise notice 'hr_client_rpc_baseline: % row(s) recorded for hr_companion_equip', v_n;
end $$;

-- ── 6. THE HYGIENE COMMIT GATE — the DETECTOR itself, strict form ─────────
-- The same call the nightly pg_cron `hr-grant-hygiene` job makes. A wrong
-- signature above does not silence the check, so this raises on drift.
do $$
declare v_report jsonb;
begin
  v_report := public.hr_assert_grant_hygiene(true);
  if jsonb_array_length(coalesce(v_report->'unapproved_client_rpcs', '[]'::jsonb)) <> 0 then
    raise exception 'grant hygiene still reports unapproved client RPCs: %',
      v_report->'unapproved_client_rpcs';
  end if;
  if has_function_privilege('hr_engine', 'public.hr_companion_equip(int,text,boolean)', 'execute') then
    raise exception 'hr_engine can execute hr_companion_equip — the engine must never equip for a player';
  end if;
  raise notice 'COMPANION BASELINE OK — hygiene clean in strict form, engine still refused.';
end $$;
