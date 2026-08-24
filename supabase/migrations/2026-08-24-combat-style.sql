-- ════════════════════════════════════════════════════════════════════════
-- 2026-08-24-combat-style.sql — hr_set_style: THE PLAYER'S COMBAT STYLE
--                               BECOMES SERVER STATE.
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. The Coordinator applies this by hand
--     (execute_sql wrapped in begin/commit, or a branch apply). It is NOT a
--     money surface — it moves no gold, no items, no XP TOTAL — but it decides
--     WHICH SKILL every combat XP grant lands in, so Security review still
--     gates it.
--
--   Companion tests:  tests/combat-style.mjs  (catalogue drift + engine routing)
--   Companion engine: supabase/functions/hr-accrue/accrual.js  (resolveStyle)
--   Companion client: src/net/goal-claim.js setStyle() · src/legacy.js
--                     applyCombatStyle() · src/net/accrue.js reconcileCombatStyle()
--
-- ── THE DEFECT THIS CLOSES (P0, LIVE, player report — Paione) ───────────────
-- "When training combat, Strength/Defense/HP exp is not saving — only Attack
--  saves; the rest reset to level 1."
--
-- He is describing the server overwriting his skills with its own answer, and
-- the server's answer was wrong. supabase/functions/hr-accrue/accrual.js had:
--
--     const style = resolveStyle(eq.weaponType, null);
--
-- …with a comment that said, honestly, "the player's chosen style is NOT server
-- state yet (there is no column and no intent that sets it) … it closes when a
-- set_style intent exists". `null` means resolveStyle falls to the FIRST key of
-- the weapon family — `sword.accurate`, which routes 100% of styled XP to
-- ATTACK. Skills are server-of-record and ARMED, so at every settle the client's
-- predicted Strength/Defence XP is retired and replaced by the server's
-- Attack-only routing. A player fighting on Aggressive for a week trains Attack
-- and watches Strength sit still.
--
-- This file is the missing column and the missing verb.
--
-- ── WHY AN RPC AND NOT AN hr_apply DELTA KEY ───────────────────────────────
-- Identical reasoning to 2026-08-15-auto-eat.sql §2, and this is that function's
-- twin in every structural respect:
--   · hr_apply stays the single writer of everything a DELTA can touch. The
--     style is not in the delta contract, so the accrual engine cannot change a
--     player's XP routing as a side effect of paying them. It READS the column
--     and never writes it.
--   · It is a PREFERENCE, chosen by the player, gated on a server catalogue. It
--     moves no value and mints nothing.
--   · It must be callable by `authenticated` and must NOT be callable by
--     hr_engine — the engine must never be able to pick a player's style.
-- One narrow SECURITY DEFINER RPC, server clock, server-side catalogue, no
-- client write policy: the clan_deposit pattern.
--
-- ── WHY IT REFUSES MID-ABSENCE: `collect_first` ────────────────────────────
-- THE SAME LEVER hr_set_auto_eat closes, in a new dimension. The accrual prices
-- a WHOLE unpaid window with the style read at the moment of collection. Without
-- a guard: fight all night on Accurate, come back, flip to Defensive, collect —
-- and the entire night's XP lands in Defence. Worse than a re-route, it is also
-- a small PAYMENT change, because `speedMod` multiplies the swing interval
-- (src/core/styles.js): Longrange swings 10% slower, so the same window yields
-- fewer kills, less gold and fewer drops. Retroactive style selection is
-- therefore retroactive selection of a payout, not merely of a label.
--
-- The house fix for the equipment-at-collect over-payment (review S5) is
-- `accrued_to = now()`, which closes the hole by FORFEITING the unpaid span.
-- That is the wrong trade for a free toggle — nobody should lose eight hours for
-- pressing a style button. So this refuses instead, with a machine code the
-- client acts on: settle (`settleBeforeIntent()`), then retry. Nothing is lost
-- and nothing is over-paid.
--
-- The 60-second grace mirrors ACCRUE_MIN_MS in
-- supabase/functions/hr-accrue/accrual.js — below it the engine declines to pay
-- and writes nothing, so there is no span to over-pay and refusing would just be
-- rude. It is the SAME `c_collect_grace` constant hr_set_auto_eat declares, and
-- tests/accrual-engine.mjs already reads both numbers.
--
-- ── THE CATALOGUE IS BOUND, NOT DUPLICATED ─────────────────────────────────
-- ⚠ GAME DATA IS NOT COPIED INTO SQL HERE — IT IS BOUND. The authored source is
--   src/core/styles.js `COMBAT_STYLES` / `DEFAULT_STYLE_KEYS`, the SAME module
--   the style picker, the XP router and the accrual engine all import.
--   tests/combat-style.mjs imports that module and fails the build if
--   public.hr_combat_styles disagrees with it in EITHER direction — a style the
--   server would refuse, a style the server would accept that the client cannot
--   render, or a default that differs. That is the hr_traits / hr_goal_rewards
--   precedent (2026-08-23-trait-buy.sql §1), and it is why the fourteen rows
--   below are safe to type out.
--
--   NOTE WHAT IS **NOT** HERE: not one accuracyMod, damageMod, speedMod or `xp`
--   ratio. Those are the SIMULATION's numbers and they live in exactly one place
--   — src/core/styles.js, vendored into the Edge Function by the packer. This
--   table answers ONE question ("is this a real style of this family, and which
--   is the family default"), which is the only question SQL has to answer.
--
-- ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────
--   · It does NOT stamp `accrued_to`. It refuses instead (above), so an unpaid
--     window is never confiscated.
--   · It does NOT write a player_ledger row. Journal rule 6 is "journal value
--     transfers and aggregates, never per-tick" (game_events: 1.6M rows / 229 MB
--     from six players in four days). A style flip moves nothing, and the bucket
--     below is 30/MINUTE — a ledger row per call would be a per-gesture write on
--     a free button, which is the wrong side of that rule. The CURRENT value is
--     always readable from player_state.combat_style and `updated_at`/`version`
--     record when it last moved. ⚠ IF a future review wants a style audit trail,
--     DROP THE BUCKET TO 30/HOUR FIRST — do not add the insert at 30/min.
--   · It does NOT accept a whole map. One family, one key, per call, each looked
--     up in the catalogue. A map argument would be a client-shaped blob to
--     validate; a pair is two lookups.
--   · It does NOT clamp an unknown family or key to a default. It REFUSES
--     (`unknown_family` / `unknown_style`). A clamp would silently give the
--     player a style they did not pick and route their XP somewhere they did not
--     choose — which is this file's own bug in miniature.
--
-- ── IDEMPOTENCY + CONCURRENCY ──────────────────────────────────────────────
-- This is a SET, not an INCREMENT, so it is ALREADY idempotent for all time —
-- calling it twice with the same pair leaves the same state (hr_set_auto_eat
-- makes this argument and takes no key at all). `p_idem` is accepted anyway, and
-- honoured, because the client transport is fire-and-forget with retry and the
-- house contract is that every state-changing intent carries a key.
--
-- The advisory lock is taken FIRST — byte-for-byte hr_apply's key
-- (`hashtextextended(uid || ':' || slot, 0)`), transaction-scoped so it is
-- released at commit and therefore safe under the transaction pooler — then the
-- idempotency row is read, then player_state is locked `for update`. Two
-- simultaneous calls serialise on the advisory lock; the loser reads the
-- winner's cached envelope. A concurrent ACCRUAL cannot interleave, and the
-- `version` bump makes any accrual that read the OLD version re-read rather than
-- price a night at a style the player has since changed.
--
-- ONLY SUCCESSES ARE CACHED. A `collect_first` refusal must become retryable the
-- moment the settle lands; caching it would pin the player to the old style for
-- 24 hours under that key.
--
-- ── PERFORMANCE / COST AT 100x PLAYERS ─────────────────────────────────────
-- ZERO new rows per call. The write is an UPDATE of one jsonb scalar (≤ ~80
-- bytes, four families) on a row that already exists; the only insert is the
-- optional player_intents row, which `hr_intents_prune` reaps at 24h. The
-- catalogue is 14 rows FOREVER. At 600 players changing style ten times a day
-- that is 6,000 pruned intent rows in flight and no permanent growth at all.
--
-- ── REVERSIBILITY ──────────────────────────────────────────────────────────
-- Additive throughout. To revert:
--   drop function public.hr_set_style(text,text,int,uuid);
--   drop function public.hr_set_style__ungated(text,text,int,uuid);
--   drop table public.hr_combat_styles;
--   alter table public.player_state drop column combat_style;   -- optional
-- …and re-apply the previous hr_state_of / hr_rpc_gate last-toucher to remove
-- the two programmatic patches (an old client ignores the extra key; the engine
-- reads `st.combat_style ?? null` and degrades to the pre-fix default).
-- REVERTING RESTORES THE BUG — it does not corrupt anything.
--
-- ⚠ IT TAKES OVER NO LAST-TOUCHER ROLE. hr_state_of and hr_rpc_gate are patched
--   PROGRAMMATICALLY (pg_get_functiondef + a guarded, exactly-once anchor
--   replace — the 2026-08-28-client-state.sql idiom), so this file carries no
--   literal `create or replace function public.hr_state_of(` /
--   `…hr_rpc_gate(` header and is a member of NO derivation chain.
--
-- SAFE TO RE-RUN. Every step is guarded and §8's probes roll themselves back.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state')   is null then raise exception 'player_state missing — apply 2026-08-11-player-state.sql first'; end if;
  if to_regclass('public.player_intents') is null then raise exception 'player_intents missing'; end if;

  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'hr_rpc_gate(text) not found — apply the rate-gate chain first';
  end if;
  if to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 'hr_record_rejection not found — refusals would be unobservable';
  end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_state_of missing — the engine would never learn the chosen style, which '
                    'is the whole point of this file';
  end if;
end $$;

-- ── 1. player_state.combat_style — the per-weapon-family choice map ────────
-- `{"sword":"defensive","ranged":"longrange"}`. A PARTIAL map is normal and
-- correct: a family the player has never chosen for is absent, and both
-- `normaliseStyleKeys` (client + engine) and `resolveStyle` fall to that
-- family's default. `{}` is therefore the honest empty state and the honest
-- DEFAULT — it means "chosen nothing", not "chose Accurate".
--
-- NOT NULL with a non-volatile default, so Postgres 11+ adds it without a table
-- rewrite. The check keeps it an OBJECT whatever calls it: the RPC below is the
-- only writer today, but a scalar or an array here would make `st.combat_style`
-- reach the engine as something `normaliseStyleKeys` would silently swallow
-- (`typeof [] === 'object'`), and a guard the database keeps costs nothing.
do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema='public' and table_name='player_state' and column_name='combat_style') = 0 then
    alter table public.player_state
      add column combat_style jsonb not null default '{}'::jsonb;
    raise notice 'player_state.combat_style added';
  else
    raise notice 'player_state.combat_style already present — add skipped';
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_state'::regclass
                    and conname = 'player_state_combat_style_chk') then
    alter table public.player_state
      add constraint player_state_combat_style_chk
        check (jsonb_typeof(combat_style) = 'object');
  end if;
end $$;

-- ── 2. THE CATALOGUE — public.hr_combat_styles ─────────────────────────────
-- family → style_key, and which key is that family's default. BOUND to
-- src/core/styles.js COMBAT_STYLES / DEFAULT_STYLE_KEYS by tests/combat-style.mjs
-- in BOTH directions. Not one simulation number lives here (see the header).
create table if not exists public.hr_combat_styles (
  family     text    not null,
  style_key  text    not null,
  is_default boolean not null default false,
  sort_ord   int     not null default 0,
  primary key (family, style_key)
);

-- RLS on, NO policy, every client grant revoked: read by SECURITY DEFINER
-- functions only. The client already HAS this table — it is src/core/styles.js,
-- which the picker renders from — so a client grant would be a second copy of a
-- fact with no reader.
-- "revoke all", NOT "revoke insert, update, delete" (Security C1): Supabase's
-- default ACL on public also grants TRUNCATE, REFERENCES and TRIGGER, and
-- TRUNCATE bypasses row-level security entirely.
alter table public.hr_combat_styles enable row level security;
revoke all on public.hr_combat_styles from public, anon, authenticated, service_role;

-- Refilled wholesale: this file OWNS the whole table. Order and defaults are
-- BYTE-EQUAL to src/core/styles.js — `DEFAULT_STYLE_KEYS` for the flag,
-- authored key order for `sort_ord`.
delete from public.hr_combat_styles;
insert into public.hr_combat_styles (family, style_key, is_default, sort_ord) values
  ('sword',  'accurate',   true,  1),
  ('sword',  'aggressive', false, 2),
  ('sword',  'defensive',  false, 3),
  ('sword',  'controlled', false, 4),
  ('hammer', 'smash',      true,  1),
  ('hammer', 'crush',      false, 2),
  ('hammer', 'guard',      false, 3),
  ('ranged', 'rapid',      true,  1),
  ('ranged', 'precise',    false, 2),
  ('ranged', 'longrange',  false, 3),
  ('magic',  'cast',       true,  1),
  ('magic',  'focus',      false, 2),
  ('magic',  'warded',     false, 3);

-- Exactly one default per family, enforced by the DATABASE and not by the
-- insert above. resolveStyle falls back to `Object.keys(family)[0]`, so a
-- catalogue with two defaults (or none) would disagree with the engine about
-- what "unchosen" means.
create unique index if not exists hr_combat_styles_one_default
  on public.hr_combat_styles (family) where is_default;

-- ── 3. hr_set_style__ungated — validate, serialise, set ────────────────────
create or replace function public.hr_set_style__ungated(
  p_family text, p_key text, p_slot int, p_idem uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, 0);
  v_st     public.player_state%rowtype;
  v_cached jsonb;
  v_map    jsonb;
  v_result jsonb;
  -- Mirrors ACCRUE_MIN_MS (60000 ms) in the accrual engine, and is the SAME
  -- constant hr_set_auto_eat declares. Named, so a cross-language drift guard
  -- has something to read.
  c_collect_grace constant interval := interval '60 seconds';
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot', 'slot', p_slot);
  end if;

  -- ── (1) THE CATALOGUE, BEFORE ANY LOCK. A refusal that is a fact about the
  --        CATALOGUE needs no character, no lock and no row, so a client looping
  --        on garbage cannot contend on a real player's state row.
  --        TWO codes, not one: "that weapon family does not exist" and "that is
  --        not a style of this family" are different bugs on the client side and
  --        the error has to be able to say which.
  if not exists (select 1 from public.hr_combat_styles where family = p_family) then
    perform public.hr_record_rejection(v_uid, v_slot, 'set_style', 'unknown_family',
      jsonb_build_object('family', p_family), 1);
    return jsonb_build_object('ok', false, 'error', 'unknown_family', 'family', p_family);
  end if;
  if not exists (select 1 from public.hr_combat_styles
                  where family = p_family and style_key = p_key) then
    perform public.hr_record_rejection(v_uid, v_slot, 'set_style', 'unknown_style',
      jsonb_build_object('family', p_family, 'style', p_key), 1);
    return jsonb_build_object('ok', false, 'error', 'unknown_style',
      'family', p_family, 'style', p_key);
  end if;

  -- ── (2) SERIALISE THIS CHARACTER — the SAME advisory lock key hr_apply,
  --        hr_set_auto_eat, hr_trait_buy and market_* take. A lock on a
  --        different key is not a lock, it is a comment that costs a syscall.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- ── (3) IDEMPOTENCY, INSIDE THE LOCK, SUCCESSES ONLY. Read here rather than
  --        before it so two simultaneous retries of one gesture cannot both miss
  --        the cache: the loser waits on the advisory lock and then sees the
  --        winner's row.
  if p_idem is not null then
    select result into v_cached from public.player_intents
      where user_id = v_uid and intent_id = p_idem;
    if v_cached is not null then
      return v_cached || jsonb_build_object('replayed', true);
    end if;
  end if;

  select * into v_st from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if v_st.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- ── (4) THE MID-ABSENCE REFUSAL. See the header block. NOT a clamp and NOT a
  --        forfeit: the caller settles and retries, and neither side loses.
  if v_st.active_kind is distinct from 'idle'
     and v_st.accrued_to is not null
     and now() - v_st.accrued_to >= c_collect_grace then
    return jsonb_build_object('ok', false, 'error', 'collect_first',
      'detail', jsonb_build_object('accrued_to', v_st.accrued_to,
        'unpaid_ms', floor(extract(epoch from (now() - v_st.accrued_to)) * 1000)));
  end if;

  -- ── (5) THE WRITE. A MERGE of one key, never a replace of the map: the other
  --        three families are choices the player already made and a call about
  --        swords must not silently reset their bow. Everything written here
  --        came out of the catalogue two statements ago.
  v_map := coalesce(v_st.combat_style, '{}'::jsonb) || jsonb_build_object(p_family, p_key);

  update public.player_state
     set combat_style = v_map,
         -- The optimistic-concurrency token. This column PRICES an absence (XP
         -- routing AND, through speedMod, the swing interval), so an in-flight
         -- accrual holding the old version must be made to re-read rather than
         -- pay the window at a style the player has since changed.
         version      = version + 1,
         updated_at   = now()
   where user_id = v_uid and slot = v_slot;
  -- ⚠ accrued_to IS NOT TOUCHED. (4) already refused any window worth
  --   over-paying; stamping it here would confiscate the rest, silently.

  v_result := jsonb_build_object(
    'ok', true, 'family', p_family, 'style', p_key,
    'combat_style', v_map, 'slot', v_slot, 'version', v_st.version + 1);

  -- SUCCESSES ONLY (see the header). The client generates a fresh key per
  -- gesture, so a genuine retry of the SAME gesture still replays this envelope.
  if p_idem is not null then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, v_slot, 'set_style:' || p_family || ':' || p_key, v_result, now())
      on conflict (user_id, intent_id) do nothing;
  end if;

  return v_result;
end $$;

-- ── 4. The gated wrapper ───────────────────────────────────────────────────
-- ⚠ p_slot / p_idem CARRY DEFAULTS, AND THAT IS LOAD-BEARING. PostgREST
--   resolves an RPC by the NAMED ARGUMENTS in the POST body: a client that posts
--   {p_family, p_key} against a four-argument function with no defaults gets
--   PGRST202 "could not find the function" — a 404 indistinguishable from "the
--   migration was never applied". §8(c) asserts the defaults rather than
--   trusting this comment.
--
-- 30/min: a style flip is FREE and HARMLESS by construction (the collect_first
-- guard means it can only ever price a FUTURE window), so the bucket only has to
-- stop a spin loop, not price a decision. A player rotating styles per monster
-- must never see a 429.
create or replace function public.hr_set_style(
  p_family text, p_key text, p_slot int default 0, p_idem uuid default null)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_set_style') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_set_style__ungated($1, $2, $3, $4);
end $w$;

-- REVOKE BEFORE GRANT, and note who is NOT on the list.
--   • service_role — bypasses RLS and is not a player.
--   • hr_engine    — the accrual engine READS combat_style and must never be
--                    able to WRITE it. Its whole capability is "propose a delta
--                    to a function that re-validates everything"; letting it
--                    choose a style would let it choose which skill it pays.
revoke execute on function public.hr_set_style__ungated(text, text, int, uuid) from public;
revoke execute on function public.hr_set_style__ungated(text, text, int, uuid)
  from anon, authenticated, service_role;
revoke execute on function public.hr_set_style(text, text, int, uuid) from public;
revoke execute on function public.hr_set_style(text, text, int, uuid)
  from anon, authenticated, service_role;
grant  execute on function public.hr_set_style(text, text, int, uuid) to authenticated;

-- ── 5. hr_rpc_gate — PROGRAMMATIC additive patch (one bucket) ──────────────
-- The 2026-08-28-client-state.sql idiom: pg_get_functiondef + a guarded string
-- replace, so this file never restates a body it did not author and can never
-- silently delete another file's bucket. An UNKNOWN bucket fails CLOSED
-- (`else return false`), so without this the RPC would answer 429 forever and
-- the fix would deploy green and dead.
do $$
declare v_src text; v_new text;
begin
  select pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) into v_src;
  v_src := replace(v_src, chr(13), '');   -- CR-tolerant (CRLF working copies)
  if position('''hr_set_style''' in v_src) > 0 then
    raise notice 'hr_rpc_gate already admits hr_set_style — patch skipped'; return;
  end if;
  if (length(v_src) - length(replace(v_src, 'else return false;' || chr(10) || '  end case;', '')))
     <> length('else return false;' || chr(10) || '  end case;') then
    raise exception 'hr_rpc_gate case terminator anchor did not match exactly once — refusing to '
                    'patch blind';
  end if;
  v_new := replace(v_src,
    'else return false;' || chr(10) || '  end case;',
    'when ''hr_set_style'' then v_limit := 30;' || chr(10) ||
    '    else return false;' || chr(10) || '  end case;');
  execute v_new;
  raise notice 'hr_rpc_gate patched: hr_set_style admitted at 30/min';
end $$;
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── 6. hr_state_of — PROJECT combat_style INSIDE `state` ───────────────────
-- INSIDE the `state` object, not beside it, and that placement is the contract:
-- the accrual shell reads `st.combat_style` off `env.state` field by field, the
-- same way it reads `tool_carry`, `fight` and the three auto-eat keys. FLAT and
-- inside, for the reason those are: a nested bag is one more place a `?? {}`
-- can quietly turn a MISSING COLUMN into a default, and a missing column here
-- must degrade to the pre-fix behaviour visibly, not silently.
--
-- Its PRESENCE is also the switch. `st.combat_style ?? null` in index.ts and
-- set-activity.js means a database without this migration hands the engine
-- `null`, which is exactly `resolveStyle(weaponType, null)` — today's behaviour,
-- unchanged. There is no flag to forget to flip.
--
-- Patched at the `streak_day_key` terminator of the `state` object, which is the
-- last key inside it and has survived every top-level projection added since
-- (workers, bank, client_state, traits, marks). NO-OP on re-apply.
do $$
declare
  v_def text;
  c_anchor constant text := $anc$'streak_day_key', v_st.streak_day_key),$anc$;
begin
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  if v_def is null then
    raise exception 'hr_state_of is missing — apply the player-state chain first';
  end if;
  if strpos(v_def, $q$'combat_style', coalesce$q$) > 0 then
    raise notice 'hr_state_of already projects combat_style — patch skipped'; return;
  end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_state_of `state` terminator anchor did not match exactly once — '
                    'its shape is not the one this file was derived against. Do NOT patch a body '
                    'you cannot account for.';
  end if;
  v_def := replace(v_def, c_anchor, $anc$'streak_day_key', v_st.streak_day_key,
      -- combat-style slice: the player's per-weapon-family style choice, e.g.
      -- {"sword":"defensive"}. Written ONLY by hr_set_style. The accrual engine
      -- reads it as `st.combat_style` and passes it through
      -- normaliseStyleKeys -> resolveStyle, which is what makes an AWAY fight
      -- train the skill the player actually picked. A PARTIAL map is normal;
      -- `{}` means "chosen nothing" and every family falls to its default.
      'combat_style', coalesce(v_st.combat_style, '{}'::jsonb)),$anc$);
  execute v_def;
  raise notice 'hr_state_of patched: state.combat_style projected';
end $$;
-- create-or-replace preserves an ACL, but be explicit (the lesson of every
-- restated body in this tree). hr_state_of takes an arbitrary uuid; no client.
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 7. Grant-hygiene baseline (if present) ─────────────────────────────────
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — grant-hygiene not applied; nothing to update';
    return;
  end if;
  delete from public.hr_client_rpc_baseline
   where proname = 'hr_set_style' and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_set_style', 'p_family text, p_key text, p_slot integer, p_idem uuid', 'authenticated',
     'added 2026-08-24: the player''s combat-style choice becomes server state so the accrual '
     'engine routes combat XP to the skill they picked (P0 — settle was routing every styled '
     'grant to Attack). Moves no value. family/key are validated against public.hr_combat_styles; '
     'refuses mid-absence with collect_first rather than confiscating the window.');
end $$;

-- ── 8. SELF-VERIFYING COMMIT GATE ──────────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them. The apply is atomic, so
-- a raise here reverts everything above it. Row-writing probes live in an
-- HR819-discarded subtransaction.
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000c1-0000-0000-0000-0000000000c1';
  v_two  constant uuid := '000000c2-0000-0000-0000-0000000000c2';
  v_slot constant int  := 0;
  v_idem uuid;
  v_txt  text;
  v_def  text;
  v_n    int;
begin
  -- (a) THE CATALOGUE IS COHERENT: four families, exactly one default each.
  if (select count(*) from public.hr_combat_styles) = 0 then
    raise exception 'GATE(a): hr_combat_styles is empty — every set_style would answer unknown_family';
  end if;
  select string_agg(family, ', ') into v_txt from (
    select family from public.hr_combat_styles group by family
     having count(*) filter (where is_default) <> 1) q;
  if v_txt is not null then
    raise exception 'GATE(a): these families do not have exactly one default (%) — the catalogue '
                    'and resolveStyle would disagree about what "unchosen" means', v_txt;
  end if;
  foreach v_txt in array array['sword','hammer','ranged','magic'] loop
    if not exists (select 1 from public.hr_combat_styles where family = v_txt) then
      raise exception 'GATE(a): family % is absent from the catalogue', v_txt;
    end if;
  end loop;

  -- (b) GRANTS: wrapper authenticated-only, inner shut out of every client role,
  --     and NEITHER reachable by the accrual engine (the engine reads the style,
  --     it must never choose one).
  if to_regprocedure('public.hr_set_style(text,text,integer,uuid)') is null then
    raise exception 'GATE(b): the wrapper did not install';
  end if;
  if has_function_privilege('authenticated', 'public.hr_set_style__ungated(text,text,integer,uuid)', 'execute') then
    raise exception 'GATE(b): the __ungated inner is client-executable — the rate gate is decoration';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_set_style(text,text,integer,uuid)', 'execute') then
    raise exception 'GATE(b): the wrapper is not callable by authenticated — the fix is dead';
  end if;
  select string_agg(r, ',') into v_txt from unnest(array['public','anon','service_role']) r
   where has_function_privilege(r, 'public.hr_set_style(text,text,integer,uuid)', 'execute');
  if v_txt is not null then
    raise exception 'GATE(b): hr_set_style is executable by %', v_txt;
  end if;
  if has_function_privilege('hr_engine', 'public.hr_set_style(text,text,integer,uuid)', 'execute')
     or has_function_privilege('hr_engine', 'public.hr_set_style__ungated(text,text,integer,uuid)', 'execute') then
    raise exception 'GATE(b): hr_engine can choose a player''s combat style — it would then be '
                    'choosing which skill it pays';
  end if;
  -- PUBLIC must hold nothing. aclexplode, because grantee = 0 IS the definition
  -- of PUBLIC and a regex over an ACL string asserts nothing.
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
              where p.oid = to_regprocedure('public.hr_set_style(text,text,integer,uuid)')
                and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'GATE(b): hr_set_style is still executable by PUBLIC';
  end if;
  if (select prosecdef from pg_proc
       where oid = to_regprocedure('public.hr_set_style__ungated(text,text,integer,uuid)')) is not true then
    raise exception 'GATE(b): the inner is not SECURITY DEFINER — every statement would be denied';
  end if;
  if not exists (select 1 from unnest(coalesce((select proconfig from pg_proc
                    where oid = to_regprocedure('public.hr_set_style__ungated(text,text,integer,uuid)')),
                    array[]::text[])) c where c like 'search_path=%') then
    raise exception 'GATE(b): the inner has no pinned search_path — a SECURITY DEFINER function '
                    'without one is a search_path hijack';
  end if;
  if (select provolatile from pg_proc
       where oid = to_regprocedure('public.hr_set_style(text,text,integer,uuid)')) <> 'v' then
    raise exception 'GATE(b): hr_set_style is not VOLATILE — PostgREST would run it in a READ ONLY '
                    'transaction and every call would fail';
  end if;

  -- (c) THE TWO-ARGUMENT CALL FORM RESOLVES (PGRST202 insurance).
  if coalesce((select pronargdefaults from pg_proc
                where oid = to_regprocedure('public.hr_set_style(text,text,integer,uuid)')), 0) < 2 then
    raise exception 'GATE(c): hr_set_style has fewer than two defaulted arguments — a client '
                    'posting {p_family, p_key} would get PGRST202 and the fix ships dead';
  end if;

  -- (d) NO CLIENT WRITE SURFACE on the table it writes or the catalogue it reads.
  select string_agg(table_name || ':' || privilege_type, ', ') into v_txt
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('player_state','player_intents','hr_combat_styles')
     and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
     and privilege_type <> 'SELECT';
  if v_txt is not null then
    raise exception 'GATE(d): client/engine write grants on the tables this verb touches: %', v_txt;
  end if;
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'hr_combat_styles'
     and grantee in ('anon','authenticated','service_role','PUBLIC');
  if v_n > 0 then
    raise exception 'GATE(d): % client grant(s) on hr_combat_styles — definer-read only', v_n;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_combat_styles') then
    raise exception 'GATE(d): hr_combat_styles grew an RLS policy — it is definer-read only';
  end if;

  -- (e) THE VERB DOES NOT STAMP accrued_to. Its whole mid-absence argument is
  --     "refuse, never confiscate"; a stamp would silently forfeit the window.
  v_def := pg_get_functiondef(to_regprocedure('public.hr_set_style__ungated(text,text,integer,uuid)'));
  if v_def ~ 'set[[:space:]]+accrued_to[[:space:]]*=' or v_def ~ 'accrued_to[[:space:]]*=[[:space:]]*now' then
    raise exception 'GATE(e): hr_set_style stamps accrued_to — that CONFISCATES the unpaid window '
                    'the collect_first refusal exists to protect';
  end if;
  if 'update x set accrued_to = now()' !~ 'set[[:space:]]+accrued_to[[:space:]]*=' then
    raise exception 'GATE(e): the accrued_to scan is BLIND — it does not match a known positive';
  end if;
  if position('collect_first' in v_def) = 0 then
    raise exception 'GATE(e): the collect_first refusal is gone — a style flip would re-route (and '
                    'partly re-price) a whole unpaid night retroactively';
  end if;
  if position('pg_advisory_xact_lock(hashtextextended(' in v_def) = 0 then
    raise exception 'GATE(e): the per-character advisory lock is gone — a style write could '
                    'interleave with an accrual pricing the same window';
  end if;
  -- It must never write a ledger row at 30/min (journal rule 6). If a future
  -- audit trail is wanted, the bucket drops to 30/hour FIRST.
  if position('insert into public.player_ledger' in v_def) > 0
     or position('insert into player_ledger' in v_def) > 0 then
    raise exception 'GATE(e): hr_set_style journals to player_ledger at a 30/MIN bucket — that is '
                    'the per-tick journalling rule 6 forbids. Drop the bucket first.';
  end if;

  -- (f) THE GATE ADMITS THE BUCKET, and the patch was ADDITIVE.
  v_def := pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure);
  if position('''hr_set_style''' in v_def) = 0 then
    raise exception 'GATE(f): hr_rpc_gate does not admit hr_set_style — an unknown bucket fails '
                    'closed, so every call would answer 429';
  end if;
  foreach v_txt in array array['hr_bounty_spend','bank_move','client_state_put','farm_plant',
                               'hr_claim_daily','clan_deposit'] loop
    if position('''' || v_txt || '''' in v_def) = 0 then
      raise exception 'GATE(f): the hr_rpc_gate patch DELETED the ''%'' bucket — it is not additive',
        v_txt;
    end if;
  end loop;

  -- (g) THE ENVELOPE PROJECTS state.combat_style, and lost no sibling.
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  if strpos(v_def, $q$'combat_style', coalesce$q$) = 0 then
    raise exception 'GATE(g): hr_state_of does not project combat_style — the engine would never '
                    'learn the chosen style and the P0 would still be live';
  end if;
  foreach v_txt in array array['''total_level''','''inventory''','''skills''','''progress''',
                               '''marks''','''auto_eat_enabled''','''tool_carry''','''fight''',
                               '''streak_day_key'''] loop
    if position(v_txt in v_def) = 0 then
      raise exception 'GATE(g): the hr_state_of patch DROPPED the % projection', v_txt;
    end if;
  end loop;

  -- (h) EXECUTED BEHAVIOUR — discarded subtransaction, zero residue.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version, active_kind, accrued_to)
      values (v_uid, v_slot, 100, 0, 1, 'idle', now())
      on conflict (user_id, slot) do update set version = 1, active_kind = 'idle', accrued_to = now();

    -- A FRESH CHARACTER HAS CHOSEN NOTHING. `{}`, never a pre-filled default:
    -- "chosen nothing" and "chose Accurate" must stay distinguishable.
    if public.hr_state_of(v_uid, v_slot)->'state'->'combat_style' <> '{}'::jsonb then
      raise exception 'GATE(h): a fresh character projects combat_style %, expected {}',
        public.hr_state_of(v_uid, v_slot)->'state'->'combat_style';
    end if;

    -- AN UNKNOWN FAMILY AND AN UNKNOWN STYLE ARE REFUSED BY NAME, NOT CLAMPED.
    v := public.hr_set_style__ungated('spoon', 'accurate', v_slot, null);
    if v->>'error' <> 'unknown_family' then
      raise exception 'GATE(h): an unknown family was not refused: %', v;
    end if;
    v := public.hr_set_style__ungated('sword', 'no_such_style', v_slot, null);
    if v->>'error' <> 'unknown_style' then
      raise exception 'GATE(h): an unknown style was not refused: %', v;
    end if;
    -- CROSS-FAMILY: a real key of ANOTHER family is still not a style of THIS one.
    v := public.hr_set_style__ungated('sword', 'longrange', v_slot, null);
    if v->>'error' <> 'unknown_style' then
      raise exception 'GATE(h): a cross-family style was accepted: %', v;
    end if;
    if public.hr_state_of(v_uid, v_slot)->'state'->'combat_style' <> '{}'::jsonb then
      raise exception 'GATE(h): a REFUSED call wrote the map';
    end if;

    -- THE HAPPY PATH. The map is set, the version bumped, accrued_to untouched.
    v_idem := gen_random_uuid();
    v := public.hr_set_style__ungated('sword', 'defensive', v_slot, v_idem);
    if coalesce(v->>'ok','') <> 'true' or v->>'style' <> 'defensive' then
      raise exception 'GATE(h): the style was not set: %', v;
    end if;
    if (select combat_style from public.player_state where user_id = v_uid and slot = v_slot)
       <> '{"sword": "defensive"}'::jsonb then
      raise exception 'GATE(h): the stored map is %',
        (select combat_style from public.player_state where user_id = v_uid and slot = v_slot);
    end if;
    if (select version from public.player_state where user_id = v_uid and slot = v_slot) <> 2 then
      raise exception 'GATE(h): version did not bump — an in-flight accrual would price the window '
                      'at the OLD style and never be made to re-read';
    end if;
    if public.hr_state_of(v_uid, v_slot)->'state'->'combat_style' <> '{"sword": "defensive"}'::jsonb then
      raise exception 'GATE(h): the envelope does not carry the new style';
    end if;

    -- A SECOND FAMILY MERGES; it does not replace.
    v := public.hr_set_style__ungated('ranged', 'longrange', v_slot, gen_random_uuid());
    if v->'combat_style' <> '{"sword": "defensive", "ranged": "longrange"}'::jsonb then
      raise exception 'GATE(h): the second family REPLACED the map instead of merging: %',
        v->'combat_style';
    end if;

    -- REPLAY on the same key: the ORIGINAL envelope, no second write, no second
    -- version bump.
    v_n := (select version from public.player_state where user_id = v_uid and slot = v_slot);
    v := public.hr_set_style__ungated('sword', 'defensive', v_slot, v_idem);
    if coalesce((v->>'replayed')::boolean, false) is not true then
      raise exception 'GATE(h): the idempotent retry did not replay: %', v;
    end if;
    if (select version from public.player_state where user_id = v_uid and slot = v_slot) <> v_n then
      raise exception 'GATE(h): the replay bumped version again';
    end if;

    -- MID-ABSENCE: refused, nothing written, and NOT cached under its key.
    update public.player_state
       set active_kind = 'combat', active_id = 'goblin',
           accrued_to = now() - interval '3 hours'
     where user_id = v_uid and slot = v_slot;
    v_idem := gen_random_uuid();
    v := public.hr_set_style__ungated('sword', 'aggressive', v_slot, v_idem);
    if v->>'error' <> 'collect_first' then
      raise exception 'GATE(h): a mid-absence flip was allowed — three unpaid hours would re-route '
                      '(and partly re-price) retroactively: %', v;
    end if;
    if (select combat_style from public.player_state where user_id = v_uid and slot = v_slot)
       -> 'sword' <> '"defensive"'::jsonb then
      raise exception 'GATE(h): the refused mid-absence flip wrote anyway';
    end if;
    if exists (select 1 from public.player_intents where user_id = v_uid and intent_id = v_idem) then
      raise exception 'GATE(h): a REFUSAL was cached — the player could never set that style with '
                      'that key once they had collected';
    end if;
    -- …and once the window is paid, the SAME key succeeds.
    update public.player_state set accrued_to = now()
     where user_id = v_uid and slot = v_slot;
    v := public.hr_set_style__ungated('sword', 'aggressive', v_slot, v_idem);
    if coalesce(v->>'ok','') <> 'true' or v->>'style' <> 'aggressive' then
      raise exception 'GATE(h): the post-collect retry was refused: %', v;
    end if;

    -- CONTROL: A SECOND, FRESH CHARACTER IS UNAFFECTED. Without this, every
    -- assertion above is satisfied by a function that writes everybody's row.
    perform set_config('request.jwt.claim.sub', v_two::text, true);
    insert into auth.users (id) values (v_two) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version, active_kind, accrued_to)
      values (v_two, v_slot, 0, 0, 1, 'idle', now()) on conflict (user_id, slot) do nothing;
    if public.hr_state_of(v_two, v_slot)->'state'->'combat_style' <> '{}'::jsonb then
      raise exception 'GATE(h): CONTROL failed — a fresh character inherited a style choice';
    end if;
    if (select combat_style from public.player_state where user_id = v_uid and slot = v_slot)
       -> 'sword' <> '"aggressive"'::jsonb then
      raise exception 'GATE(h): CONTROL failed — the second character''s call disturbed the first';
    end if;

    raise exception using errcode = 'HR819', message = 'combat-style §8 complete — rolling back';
  exception when sqlstate 'HR819' then
    null;   -- subtransaction discarded; every probe row above is gone
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state   where user_id in (v_uid, v_two))
     or exists (select 1 from public.player_intents where user_id in (v_uid, v_two))
     or exists (select 1 from auth.users where id in (v_uid, v_two)) then
    raise exception 'GATE: §8 LEAKED a probe row';
  end if;

  -- (i) grant-hygiene clean after the addition.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(v_gh->'unapproved_client_rpcs') <> 0 then
        raise exception 'GATE(i): grant-hygiene reports unapproved client rpcs: %',
          v_gh->'unapproved_client_rpcs';
      end if;
      if jsonb_array_length(v_gh->'ungated_client_rpcs') <> 0 then
        raise exception 'GATE(i): grant-hygiene reports ungated client rpcs: %',
          v_gh->'ungated_client_rpcs';
      end if;
      if jsonb_array_length(v_gh->'baseline_rows_no_longer_live') <> 0 then
        raise exception 'GATE(i): grant-hygiene reports baseline drift: %',
          v_gh->'baseline_rows_no_longer_live';
      end if;
    end;
  end if;

  raise notice 'combat-style: catalogue coherent, wrapper authenticated-only, inner + engine shut '
               'out, no client write surface, accrued_to never stamped, collect_first intact, gate '
               'bucket additive, envelope projects state.combat_style, and the executed probes '
               'cover refuse / set / merge / replay / mid-absence / post-collect — all green';
end $$;
