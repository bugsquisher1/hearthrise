-- ============================================================================
-- 2026-08-22-companion-record.sql — THE FULL COMPANION ROSTER, PROJECTED (DORMANT).
--
-- Blob-retire capstone blocker. Under the capstone arm the client stops loading
-- the save blob and must REBUILD G.companions from the server envelope. The
-- server already OWNS the three facts that define a roster, but hr_state_of does
-- NOT carry them as a clean set:
--   · equipped id       — player_state.companion_equipped (NOT projected here;
--                          only hr_perks_of.companion.id carried it, equipped-only)
--   · owned companions  — player_progress kind='unlock' key='companion:<id>' rows
--   · per-companion XP   — player_progress kind='stat'   key='companion_xp:<id>' rows
-- hr_perks_of returns companion:{id,xp} for the EQUIPPED companion only — a
-- pricing field, NOT the whole roster. A client reconstruction that read only
-- that would default every OTHER owned companion to level 1 and silently drop the
-- roster. So this projects the WHOLE set.
--
-- ── WHAT IS ADDED ────────────────────────────────────────────────────────────
--   hr_state_of — a top-level `companions` object (additive, faithful superset):
--       { equipped: text|null,
--         owned:    [<id>, …]     — the companion:<id> unlock ids (server-owned),
--         xp:       {<id>: <xp>}  — the companion_xp:<id> stat aggregates }
--     NOTE: the STARTER 'fox' is owned by grammar (no unlock row; see
--     hr_companion_equip c_starter) and therefore is NOT in `owned`. The client
--     reconstruction unions 'fox' in, exactly as ensureCompanionState seeds it.
--     `xp` is empty until the companion-XP server writer (b434,
--     COMPANION_XP_SERVER_BACKED) is armed — an absent id reads 0 → level 1 base,
--     the same self-configuring default hr_perks_of uses.
--
-- ── HOW (programmatic, NOT a chain member) ───────────────────────────────────
-- Patched by editing pg_get_functiondef output at the `total_level` anchor and
-- re-executing — the SAME technique as 2026-08-22-rested-record.sql /
-- 2026-08-27-bank-store.sql / 2026-08-28-client-state.sql. It carries NO literal
-- the hr_state_of create-or-replace header, so it is deliberately
-- NOT an HR_STATE_OF_CHAIN member and does not take over the last-toucher role.
-- NO-OP on re-apply (skips if the projection is already present).
--
-- ── SECURITY / AUTHORITY ─────────────────────────────────────────────────────
-- Read-only, additive, engine/self scoped exactly as the rest of hr_state_of
-- (SECURITY DEFINER, own row). It MOVES NO authority: ownership is still written
-- only by hr_unlock_buy / hr_companion_equip's ownership gate, equipped only by
-- hr_companion_equip, XP only by the accrual engine. This is a projection of
-- state those RPCs already own. A forged client value cannot enter here — the
-- three reads are all keyed on p_user's own player_state / player_progress rows.
--
-- ── EDGE REDEPLOY ────────────────────────────────────────────────────────────
-- NONE. The companions projection is computed inside hr_state_of from columns/
-- rows the deployed engine already stamps; no accrual.js / core / data change,
-- so pack-edge hr-accrue --check is unaffected.
--
-- ── REVERSIBILITY ────────────────────────────────────────────────────────────
-- Additive. Re-apply the predecessor body (2026-08-28-client-state.sql restores
-- hr_state_of without the companions key) to revert; nothing else reads the
-- projection, and an old client simply ignores the extra key.
--
-- APPLY AFTER: 2026-08-20-companion-model.sql (player_state.companion_equipped +
--   the companion:<id> / companion_xp:<id> row model) and the current last
--   toucher of hr_state_of (2026-08-28-client-state.sql — the live body this
--   patches).
-- ============================================================================

begin;

-- ── 0. PRECONDITIONS — FAIL CLOSED ───────────────────────────────────────────
do $mig$
declare v_def text;
begin
  if to_regclass('public.player_state') is null
     or to_regclass('public.player_progress') is null then
    raise exception 'player_state / player_progress missing — apply the player-state chain first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='player_state'
                    and column_name='companion_equipped') then
    raise exception 'player_state.companion_equipped is absent — apply '
                    '2026-08-20-companion-model.sql first. The projection reads it as the equipped id.';
  end if;
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  if v_def is null then
    raise exception 'hr_state_of is missing — apply the player-state chain first';
  end if;
  -- The anchor the projection is inserted at. If the live body has moved off the
  -- total_level terminator this file cannot account for the shape, so it REFUSES
  -- rather than patch blindly.
  if strpos(v_def, $anc$'total_level', public.hr_total_level(p_user, v_st.slot),$anc$) = 0 then
    raise exception 'the LIVE hr_state_of has no total_level anchor — its shape is not the one this '
                    'file was derived against. Do NOT patch a body you cannot account for.';
  end if;
end $mig$;

-- ── 1. hr_state_of — PROJECT the full companion roster (programmatic, additive)
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  if strpos(v_def, $q$'companions', jsonb_build_object($q$) > 0 then
    raise notice 'hr_state_of already projects companions — skipping';
  else
    v_def := replace(v_def,
      $anc$'total_level', public.hr_total_level(p_user, v_st.slot),$anc$,
      $anc$'total_level', public.hr_total_level(p_user, v_st.slot),
    -- companion-record (blob-retire capstone): the FULL roster the client rebuilds
    -- G.companions from under arm — equipped id + owned set + per-id XP. hr_perks_of
    -- carries only the EQUIPPED companion's {id,xp} for pricing; this carries the
    -- whole set so the reconstruction cannot silently reset a player's roster/XP.
    -- The starter 'fox' is owned by grammar (no unlock row) and is unioned in by
    -- the client, so it is deliberately absent from `owned`.
    'companions', jsonb_build_object(
      'equipped', v_st.companion_equipped,
      'owned', coalesce((
        select jsonb_agg(substring(pp.key from 11) order by pp.key)
          from public.player_progress pp
         where pp.user_id = p_user and pp.slot = v_st.slot
           and pp.kind = 'unlock' and pp.period_key = ''
           and pp.key like 'companion:%' and pp.value > 0), '[]'::jsonb),
      'xp', coalesce((
        select jsonb_object_agg(substring(pp.key from 14), pp.value)
          from public.player_progress pp
         where pp.user_id = p_user and pp.slot = v_st.slot
           and pp.kind = 'stat' and pp.period_key = ''
           and pp.key like 'companion_xp:%'), '{}'::jsonb)),$anc$);
    execute v_def;
  end if;
end $mig$;

-- ── 2. SELF-CHECK — the load-bearing properties, proven on apply ─────────────
-- Driven through a REAL character in an HRC22-rolled-back subtransaction, so the
-- projection is proved end to end (equipped, owned union, per-id xp) with zero
-- residue committed to production.
do $mig$
declare
  v_uid uuid := '00000000-0000-4000-8000-0000000c04d5'::uuid;
  v_env jsonb; v_comp jsonb;
begin
  -- (a) STRUCTURAL — hr_state_of literally projects the companions object.
  if strpos(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure),
            $q$'companions', jsonb_build_object($q$) = 0 then
    raise exception 'companion-record self-check (a): hr_state_of does not project companions';
  end if;

  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'companion-record self-check CANNOT RUN: hr_create_character missing — apply '
                    '2026-08-14-character-bootstrap.sql first. A skipped check is not a passed one.';
  end if;

  begin  -- ── subtransaction, rolled back ─────────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    perform public.hr_create_character(0);

    -- A fresh character: nothing owned (no unlock rows), nothing equipped.
    v_env := public.hr_state_of(v_uid, 0);
    v_comp := v_env->'companions';
    if v_comp is null or v_comp = 'null'::jsonb then
      raise exception 'companion-record (b): companions key absent from the envelope';
    end if;
    if v_comp->>'equipped' is not null then
      raise exception 'companion-record (b): fresh character has an equipped id: %', v_comp->'equipped';
    end if;
    if jsonb_array_length(coalesce(v_comp->'owned','[]'::jsonb)) <> 0 then
      raise exception 'companion-record (b): fresh character owns companion rows: %', v_comp->'owned';
    end if;
    if v_comp->'xp' <> '{}'::jsonb then
      raise exception 'companion-record (b): fresh character has companion xp: %', v_comp->'xp';
    end if;

    -- Own two companions (unlock rows), equip one, and give both XP.
    insert into public.player_progress (user_id, slot, kind, key, period_key, value)
      values (v_uid, 0, 'unlock', 'companion:raccoon', '', 1),
             (v_uid, 0, 'unlock', 'companion:sparrow', '', 1),
             (v_uid, 0, 'stat',   'companion_xp:raccoon', '', 5000),
             (v_uid, 0, 'stat',   'companion_xp:sparrow', '', 120)
      on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value;
    -- Equip through the real RPC so equipped rides player_state, ownership-gated.
    perform public.hr_companion_equip(0, 'raccoon', false);

    v_env := public.hr_state_of(v_uid, 0);
    v_comp := v_env->'companions';

    -- (c) EQUIPPED is the server-owned column.
    if v_comp->>'equipped' <> 'raccoon' then
      raise exception 'companion-record (c): equipped projected as % (expected raccoon)', v_comp->'equipped';
    end if;
    -- (d) OWNED carries BOTH unlock ids (order-stable), and NOT the grammar-owned fox.
    if not (v_comp->'owned' @> '["raccoon","sparrow"]'::jsonb)
       or jsonb_array_length(v_comp->'owned') <> 2 then
      raise exception 'companion-record (d): owned set wrong: % (expected exactly raccoon+sparrow)', v_comp->'owned';
    end if;
    if v_comp->'owned' @> '["fox"]'::jsonb then
      raise exception 'companion-record (d): fox leaked into owned — it is grammar-owned, unioned client-side';
    end if;
    -- (e) PER-ID XP for ALL owned companions, not just the equipped one.
    if (v_comp->'xp'->>'raccoon')::bigint <> 5000
       or (v_comp->'xp'->>'sparrow')::bigint <> 120 then
      raise exception 'companion-record (e): per-id xp wrong: % (expected raccoon 5000, sparrow 120)', v_comp->'xp';
    end if;

    raise exception using errcode = 'HRC22', message = 'companion-record self-check complete — rolling back';
  exception when sqlstate 'HRC22' then
    null;
  end;

  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'companion-record self-check LEAKED a probe row';
  end if;

  raise notice 'COMPANION-RECORD OK — hr_state_of projects the FULL roster: equipped from the '
               'server column, the whole owned set (fox excluded, unioned client-side), and per-id '
               'XP for every owned companion. Fresh character reads null/[]/{}. Zero residue.';
end $mig$;

commit;
