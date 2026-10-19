-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE CORE REBUILD, PART 3 OF 3: THE BODIES
-- (docs/design/CORE_MODEL.md; Tyler 2026-10-19). STAGED (lane/c-core-rebuild).
-- Game CLOSED: applies on its passing §5; Security reviews every core surface
-- at the reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 THE CORE MODEL IN SQL — twins of src/core/xp.js and src/core/vitals.js over
--    the generated rows (hr_hunt_limits core-model keys, hr_skill_curve,
--    hr_items.armour_weight, hr_activities.level), pinned by tests/core-curves.mjs:
--      hr_char_xp_for_level / hr_char_level / hr_level_block   the Level curve
--      hr_skill_xp_for_level / hr_skill_level                  capped (99) or uncapped
--      hr_level_of(user, slot)            replaces the retired combat level everywhere it is read
--      hr_max_hp / hr_max_mana / hr_regen_permille / hr_vitals_of   derived, never stored
--      hr_monster_level                   Defense XP scales with it
--      hr_total_level                     summed on each skill's own curve
-- §2 RESTATED WHOLE (no body patching), each from the replayed chain's own
--    pre-image with only the core-model edits its title names: hr_apply,
--    hr_hunt_apply_member, hr_hunt_settle_session, hr_state_of, hr_create_character,
--    the hunt session doors and views, the blessing / stamina / floor / chat /
--    social / town readers of the Level, the death log, the character sheet, the
--    leaderboard's skill and board lists.
-- §3 THE CLIENT DOOR WITHOUT A FALLS LIMIT: hr_hunt_enter(p_slot, p_hunt, p_bag,
--    p_preset, p_hours, p_idem) replaces the seven-argument door (baseline row moved).
-- §4 THE LEADERBOARD: the Level board replaces the combat-level board; Total
--    Level sums each skill on its own curve.
--
-- ── NOT HERE, HANDED ON ──────────────────────────────────────────────────────
-- hr_bounty_combat_level / hr_lb_combat_level stay ONLY for the dormant bounty,
-- dungeon, renown and M8-party bodies that still call them (the dormant-surface
-- lane deletes those surfaces and these two with them); no live reader is left.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- level_xp is credited ONLY by hr_apply inside the hunt settle (hr.hunt_session
-- set by hr_hunt_apply_member), bounded there by the journalled kills x the
-- catalogue's per-kill XP; a death's debit is re-bounded on the current values
-- and never crosses a level floor; the magic and Defense XP bounds read the
-- hero's own derived max mana and the ground's monster levels. No client grant
-- changes except hr_hunt_enter's signature.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply the 2026-10-25 files that last restated each body (their own §0 pins
-- accept their own image), then 2026-10-25-party-invites.sql for hr_hunt_enter.
-- ORDER: after 2026-10-27-hunt-sessions-catalogue.generated.sql; before
-- 2026-10-27-core-wipe.sql. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_state' and column_name = 'level_xp') then
    raise exception 'PRECONDITION: apply 2026-10-27-core-schema.sql first'; end if;
  if to_regclass('public.hr_skill_curve') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_items' and column_name = 'armour_weight')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_activities' and column_name = 'level') then
    raise exception 'PRECONDITION: apply 2026-10-27-core-catalogue.generated.sql first'; end if;
  if public.hr_hunt_limit('level_quartic') is null or public.hr_hunt_limit('hp_base') is null
     or public.hr_hunt_limit('death_xp_base') is null or public.hr_hunt_limit('magic_xp_mult_max') is null then
    raise exception 'PRECONDITION: apply 2026-10-27-hunt-sessions-catalogue.generated.sql first'; end if;
end $mig$;

-- ── §1 THE CORE MODEL IN SQL ─────────────────────────────────────────────────
-- THE LEVEL CURVE (src/core/xp.js charXpForLevel): quartic x n^4 + cubic x n^3 + linear x n, n = L - 1, exact.
create or replace function public.hr_char_xp_for_level(p_level int)
returns bigint language sql stable set search_path = public, pg_catalog as $$
  select (coalesce(public.hr_hunt_limit('level_quartic'), 0)::numeric * n * n * n * n
          + coalesce(public.hr_hunt_limit('level_cubic'), 0)::numeric * n * n * n
          + coalesce(public.hr_hunt_limit('level_linear'), 0)::numeric * n)::bigint
    from (select (greatest(1, coalesce(p_level, 1)) - 1)::numeric as n) x
$$;
revoke execute on function public.hr_char_xp_for_level(int) from public, anon, authenticated, service_role;

-- THE LEVEL `p_xp` makes (src/core/xp.js charLevelFromXp): an estimate from the leading term, walked exact.
create or replace function public.hr_char_level(p_xp bigint)
returns int language plpgsql stable set search_path = public, pg_catalog as $$
declare
  x  bigint := greatest(0, coalesce(p_xp, 0));
  q  int := coalesce(public.hr_hunt_limit('level_quartic'), 0);
  c  int := greatest(1, coalesce(public.hr_hunt_limit('level_cubic'), 1));
  lv int;
begin
  lv := greatest(1, floor(case when q > 0 then power(x::float8 / q, 0.25) else power(x::float8 / c, 1.0 / 3) end)::int);
  while lv > 1 and public.hr_char_xp_for_level(lv) > x loop lv := lv - 1; end loop;
  while public.hr_char_xp_for_level(lv + 1) <= x loop lv := lv + 1; end loop;
  return lv;
end $$;
revoke execute on function public.hr_char_level(bigint) from public, anon, authenticated, service_role;

-- THE LEVEL BLOCK the envelope projects: { xp, level, into, need } (need = the next Level's total).
create or replace function public.hr_level_block(p_xp bigint)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  select jsonb_build_object('xp', x, 'level', lv,
           'into', x - public.hr_char_xp_for_level(lv),
           'need', public.hr_char_xp_for_level(lv + 1) - public.hr_char_xp_for_level(lv))
    from (select greatest(0, coalesce(p_xp, 0)) as x, public.hr_char_level(p_xp) as lv) a
$$;
revoke execute on function public.hr_level_block(bigint) from public, anon, authenticated, service_role;

-- A SKILL'S CURVE: the combat skills (hr_skills.cat 'combat') walk the uncapped hr_skill_curve;
-- every other skill is capped at 99 on hr_xp_table (src/core/xp.js isCapped).
create or replace function public.hr_skill_xp_for_level(p_skill text, p_level int)
returns bigint language sql stable set search_path = public, pg_catalog as $$
  select case when exists (select 1 from public.hr_skills k where k.skill_id = p_skill and k.cat = 'combat')
              then coalesce((select c.xp from public.hr_skill_curve c where c.level = greatest(1, coalesce(p_level, 1))),
                            (select max(c.xp) from public.hr_skill_curve c))
              else public.hr_xp_for_level(p_level) end
$$;
revoke execute on function public.hr_skill_xp_for_level(text, int) from public, anon, authenticated, service_role;

create or replace function public.hr_skill_level(p_skill text, p_xp bigint)
returns int language sql stable set search_path = public, pg_catalog as $$
  select case when exists (select 1 from public.hr_skills k where k.skill_id = p_skill and k.cat = 'combat')
              then coalesce((select max(c.level) from public.hr_skill_curve c where c.xp <= greatest(0, coalesce(p_xp, 0))), 1)
              else public.hr_level_from_xp(p_xp) end
$$;
revoke execute on function public.hr_skill_level(text, bigint) from public, anon, authenticated, service_role;

-- THE CHARACTER'S LEVEL: replaces the retired combat level for every reader (the hunt floor,
-- the blessing and stamina prices, chat / social / town names, the hunt and party views).
create or replace function public.hr_level_of(p_user uuid, p_slot int)
returns int language sql stable security definer set search_path = public, pg_catalog as $$
  select public.hr_char_level(coalesce((select ps.level_xp from public.player_state ps
                                         where ps.user_id = p_user and ps.slot = p_slot), 0))
$$;
revoke execute on function public.hr_level_of(uuid, int) from public, anon, authenticated, service_role;

-- MAX HP AND MAX MANA (src/core/vitals.js maxHpFor / maxManaFor), integer arithmetic in the same order.
create or replace function public.hr_max_hp(p_level int, p_heavy int)
returns int language sql stable set search_path = public, pg_catalog as $$
  select floor((public.hr_hunt_limit('hp_base')::bigint + public.hr_hunt_limit('hp_per_level')::bigint * (greatest(1, coalesce(p_level, 1)) - 1))
               * (1000 + floor(public.hr_hunt_limit('heavy_hp_permille')::bigint * greatest(0, coalesce(p_heavy, 0)) / public.hr_hunt_limit('armour_slots')))
               / 1000)::int
$$;
revoke execute on function public.hr_max_hp(int, int) from public, anon, authenticated, service_role;

create or replace function public.hr_max_mana(p_level int, p_light int)
returns int language sql stable set search_path = public, pg_catalog as $$
  select floor((public.hr_hunt_limit('mana_base')::bigint + public.hr_hunt_limit('mana_per_level')::bigint * (greatest(1, coalesce(p_level, 1)) - 1))
               * (1000 + floor(public.hr_hunt_limit('light_mana_permille')::bigint * greatest(0, coalesce(p_light, 0)) / public.hr_hunt_limit('armour_slots')))
               / 1000)::int
$$;
revoke execute on function public.hr_max_mana(int, int) from public, anon, authenticated, service_role;

-- THE REGEN RATE (src/core/vitals.js regenPermille): 1000 + floor(max x P / (P + k)), P = the Prayer level.
create or replace function public.hr_regen_permille(p_prayer int)
returns int language sql stable set search_path = public, pg_catalog as $$
  select 1000 + floor(public.hr_hunt_limit('prayer_regen_max_permille')::bigint * p
                      / (p + public.hr_hunt_limit('prayer_regen_k')))::int
    from (select greatest(1, coalesce(p_prayer, 1))::bigint as p) x
$$;
revoke execute on function public.hr_regen_permille(int) from public, anon, authenticated, service_role;

-- EVERY VITAL OF A CHARACTER (src/core/vitals.js vitalsOf): { level, max_hp, max_mana, regen_pm },
-- counting the worn pieces of each armour weight. Derived on every read, never stored.
create or replace function public.hr_vitals_of(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  with lv as (select public.hr_level_of(p_user, p_slot) as level),
       w as (select count(*) filter (where i.armour_weight = 'heavy')::int as heavy,
                    count(*) filter (where i.armour_weight = 'light')::int as light
               from public.player_equipment e join public.hr_items i on i.item_id = e.item_id
              where e.user_id = p_user and e.slot = p_slot),
       p as (select public.hr_skill_level('prayer', coalesce((select s.xp from public.player_skills s
                                                               where s.user_id = p_user and s.slot = p_slot and s.skill_id = 'prayer'), 0)) as prayer)
  select jsonb_build_object('level', lv.level, 'max_hp', public.hr_max_hp(lv.level, w.heavy),
                            'max_mana', public.hr_max_mana(lv.level, w.light), 'regen_pm', public.hr_regen_permille(p.prayer))
    from lv, w, p
$$;
revoke execute on function public.hr_vitals_of(uuid, int) from public, anon, authenticated, service_role;

-- A MONSTER'S LEVEL (src/data/monsters.js monsterLevelOf), from the generated combat row.
create or replace function public.hr_monster_level(p_monster text)
returns int language sql stable set search_path = public, pg_catalog as $$
  select coalesce((select a.level from public.hr_activities a where a.kind = 'combat' and a.activity_id = p_monster), 0)
$$;
revoke execute on function public.hr_monster_level(text) from public, anon, authenticated, service_role;

-- TOTAL LEVEL: every skill on its OWN curve (the Level is not a skill and is not in it).
create or replace function public.hr_total_level(p_user uuid, p_slot int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(public.hr_skill_level(skill_id, xp)), 0)::int
    from public.player_skills where user_id = p_user and slot = p_slot
$$;
revoke execute on function public.hr_total_level(uuid, int) from public, anon, authenticated, service_role;
grant execute on function public.hr_total_level(uuid, int) to hr_engine;

-- ── §2 RESTATED WHOLE ────────────────────────────────────────────────────────

-- ── hr_apply: Level XP (kills only, the hunt settle only); max HP derived; no recovery line; one death row ──
CREATE OR REPLACE FUNCTION public.hr_apply(p_user uuid, p_slot integer, p_version bigint, p_intent_id uuid, p_delta jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- hr_apply restated 2026-09-14 (2026-09-14-hr-apply-restatement.sql) — chain depth 0.
-- This body is AUTHORED HERE. Do not add an anchored programmatic patch to it:
-- tests/patch-chain-guard.mjs refuses a third one, and the two before that are
-- how a body that moves gold came to exist in no file at all.
declare
  -- BLAST-RADIUS CLAMPS. NOT balance, NOT player-facing. They are the blast
  -- radius if an Edge Function is ever wrong or compromised, exactly as the
  -- clamps in clan_deposit (2026-08-08-clan-seat.sql:530) are. Set far above
  -- honest play.
  --
  -- ── WHAT THESE CLAMPS ACTUALLY BUY, STATED HONESTLY (Security, 2026-08-11) ──
  --    introduced by 2026-08-11-apply-engine.sql
  -- The flattering version of this control is "one compromised call cannot max
  -- a skill from zero". That is TRUE at 5,000,000 and at 12,000,000 and it is
  -- nearly WORTHLESS, because nothing limits a compromised engine to one call:
  -- hr_rate_gate allows 30 accrues/minute, so the reachable rate is 150M XP/min
  -- at 5M and 360M XP/min at 12M. Against an attacker with the engine, the
  -- per-call clamp is a speed bump measured in seconds either way.
  --
  -- What it DOES buy, and the reason it is worth having:
  --   1. It stops a single bad delta from an HONEST-BUT-BUGGY engine. The
  --      `interval_ms` class is the live example: one request field taken from
  --      the client turns a 12h absence into ~43.2M ticks instead of ~18,000 —
  --      a ~2400x mint that proposes roughly 6.8 BILLION XP. That is refused
  --      identically at 5M and at 12M. Almost every real defect looks like
  --      this: not "slightly too much", but three orders of magnitude too much.
  --   2. It keeps ledger rows small-grained, so anomaly detection has something
  --      to detect. A clamp is also a bucket size.
  --
  -- ⚠ A clamp rejection is therefore NOT automatically an incident. Before the
  --   degrade ladder in hr-accrue/index.ts it was closer to one — a rejection
  --   rolled back the watermark with the payment and bricked accrual. It is now
  --   recoverable, and honest play at maximum gear over a 24h cap can approach
  --   these numbers on its own. Read a rejection as EITHER an incident OR a
  --   balance change that outgrew its blast radius, and check
  --   tests/accrual-engine.mjs' clamp-headroom report before assuming which.
  --
  -- c_max_xp_delta: 5,000,000 -> 12,000,000 on 2026-08-11 (Security ruling).
  --   At 5M the worst honest case measured by clampGuard was inside the 60%
  --   HEADROOM line but close enough that a single balance change would fire
  --   it; at 12M the same worst case is ~23.6%. HEADROOM stays at 0.60 in
  --   tests/accrual-engine.mjs — moving BOTH the clamp and the line is how you
  --   arrive at a guard that structurally cannot fire. Only this one clamp
  --   moved; gold, items, kinds and progress all have real margin already.
  --   The surviving property is asserted, not documented: clampGuard requires
  --   c_max_xp_delta < 13,034,431 = xpForLevel(99), i.e. one call can still
  --   never carry a skill from 0 to the level cap.
  c_max_gold_delta   constant bigint := 50000000;   -- per call
  c_max_gem_delta    constant bigint := 100000;     -- per call  (review S5)
  c_max_item_delta   constant bigint := 1000000;    -- per item per call
  c_max_xp_delta     constant bigint := 12000000;   -- per skill per call (see above)
  c_max_item_kinds   constant int    := 200;
  c_max_equip_kinds  constant int    := 32;
  c_max_farm_ops     constant int    := 64;
  c_max_progress_ops constant int    := 64;
  c_max_progress_add constant bigint := 1000000;
  c_delta_keys constant text[] := array[
    'gold','gems','hp','items','xp','equip','activity','accrued_to',
    -- THE CARRIED XP REMAINDER (2026-10-09-xp-frac-carry.sql): an ABSOLUTE
    -- per-skill map of numbers in [0,1), the tool_carry shape. Engine output,
    -- never client input; validated and written after the XP loop.
    'xp_frac',
    -- THE PET'S CARRIED XP REMAINDER (2026-10-12-companion-xp-frac.sql): an
    -- ABSOLUTE map {<equipped companion id>: [0,1)}, the xp_frac shape. Engine
    -- output, never client input; written after the progress loop.
    'companion_xp_frac',
    -- CONSUMABLE BUFFS (2026-09-13): an OBJECT carrying ONE field, `item`. AT
    -- MOST ONE PER APPLY. The type, the magnitude, the duration and the expiry
    -- are resolved at (4a-b) from hr_item_buffs and now(); an object carrying any
    -- other key is REFUSED BY NAME, so there is no representation in which a
    -- client authors a buff's strength or its end. Nothing here moves a
    -- tradeable, rankable or contributable value.
    'buff_apply',
    -- THE HEARTHFIND (Feature Slate §2). An OBJECT: {item, source_kind,
    -- source_id, dropped?}. AT MOST ONE PER APPLY; `dropped` is the COUNT the
    -- engine had to throw away in the same span and grants nothing at all - it
    -- exists so a discarded find is journalled instead of vanishing. Everything
    -- else about the find - the
    -- odds, the trophy's legitimacy, the pairing, the day count, the broadcast
    -- window and the instant - is re-derived server-side at (4a-h)/(4z-h).
    -- There is no quantity field: a find is exactly one trophy, always.
    'hearthfind',
    -- THE LEVEL XP (2026-10-27 core rebuild, CORE_MODEL.md §2): a whole number
    -- >= 0 credited to player_state.level_xp. Level comes from KILLS only, so it
    -- is accepted only inside the hunt settle (hr_hunt_apply_member sets
    -- hr.hunt_session and bounds it by the journalled kills); any other caller is
    -- refused level_xp_outside_hunt.
    'level_xp',
    -- THE DEATH LEDGER. An ARRAY of at most ONE server-derived death record (a
    -- death ends the hunt), written as one player_ledger row at (4z). Engine output.
    -- It moves NO VALUE - it is audit only - which is why it is not part of any
    -- conservation sum and why its rows carry no gold_in/xp_in/qty_in stamp.
    'deaths',
    'farm','progress','progress_claim','journal',
    -- b348: the deterministic gathering tool carry. See the block at (4a-ii).
    'tool_carry',
    -- Phase 0 (docs/design/live-settlement.md): the IN-FLIGHT FIGHT. Engine
    -- output, never client input, and an ABSOLUTE like tool_carry. Validated
    -- at (4a-iii) and VOIDED unconditionally by an activity change.
    'fight',
    -- ELEMENTS/ENCHANTING v1: the server-owned weapon enchant. hr_apply resolves
    -- the rune it carries to an ELEMENT via hr_runes and stores THAT.
    'enchant',
    -- worker-settlement slice: the PARALLEL hired-crew accrual. `workers` is a
    -- per-worker xp sub-delta ({ uid: { xp:+n } }); `workers_accrued_to` is the
    -- crew's own watermark, advanced from now(). Worker OUTPUT rides `items`.
    'workers', 'workers_accrued_to',
    -- rested-record (b437): the ABSOLUTE bank + its watermark. Engine output,
    -- never client input, and clamped at the write below.
    'rested_xp', 'rested_at'];
  -- The carry is a FRACTION of one item per skill, so its whole legal range is
  -- [0,1). A ceiling on the number of skills is a ceiling on the row size.
  c_max_carry_skills constant int := 32;
  -- A blast radius on the carried kill counter, not a balance number. It drives
  -- nothing in the simulation today (resolveKill increments it, nothing reads
  -- it) and is carried so the streak readout survives the cutover; the clamp is
  -- here so an engine bug cannot store a counter nobody can explain.
  c_max_fight_kills constant bigint := 1000000;
  -- A crew is at most a handful of workers; this is a blast radius on the
  -- worker xp sub-delta, not a balance number.
  c_max_worker_ops constant int := 16;
  -- The per-worker fractional carry (leftover ms of a partial tick) is < the
  -- largest perTickMs = max(node.ms)/min(eff) = 13000/0.10 = 130,000 ms. This is
  -- the blast radius; acc_ms is REFUSED (never clamped) outside [0, this).
  -- Mirrors WORKER_MAX_ACC_MS in supabase/functions/hr-accrue/accrual.js.
  c_max_worker_acc constant double precision := 900000;
  -- ⚠ THE INTENT KEYS A REJECTION MUST RELEASE (Security F3, 2026-08-16).
  --   Step (5) releases a claimed key on `version_conflict` because the accrual
  --   engine DERIVES its key from (user, slot, watermark, version, salt) and a
  --   rejection moves neither watermark nor version — so an honest retry
  --   re-derives a byte-identical key and replays the stored rejection until
  --   hr_intents_prune, up to 25 hours later.
  --
  --   The `fight` codes have exactly that shape, and the trigger is a ROUTINE
  --   OPERATION rather than an attack: change a monster's hp in
  --   src/data/monsters.js and deploy the Edge payload BEFORE re-applying
  --   2026-08-11-catalogue.generated.sql, and every honest checkpoint for that
  --   monster proposes an hp above the stale ceiling. Refused, key bricked,
  --   every player on that monster frozen for a day — and re-applying the
  --   catalogue would NOT unfreeze them, because the replay never re-evaluates.
  --
  --   THE RULE, STATED AS A PROPERTY RATHER THAN AS A LIST: release a claimed
  --   key when the refusal is a function of SERVER STATE THAT CAN CHANGE
  --   UNDERNEATH AN UNCHANGED DELTA — the row version, or the catalogue the
  --   clamp is re-derived from. Everything else is a decision about the delta
  --   itself and deserves the same answer on the same key. Nothing is released
  --   that EXECUTED anything: a rejection rolled the protected block back, so a
  --   re-run is a first run.
  --   ⚠ THE LIST ROTTED IN ONE DAY, exactly as predicted (b361 incident):
  --   Stonemason shipped to clients minutes before its hr_skills row landed,
  --   `unknown_skill` fired for two LIVE players, stored itself against their
  --   accrue keys, and "Try again" replayed the stored refusal after the
  --   catalogue was fixed — the F3 brick, second instance, severity incident.
  --   `unknown_skill` / `unknown_item` / `unknown_activity` are all functions
  --   of catalogue state (hr_skills / hr_items / hr_activities) and were
  --   always in the property's scope; they are now in the list. If you add a
  --   catalogue-validated refusal code to hr_apply, IT GOES HERE TOO.
  --   ⚠ b366 — THE EQUIP BLOCK JOINS THE LIST, AND IT IS THE SAME LESSON A
  --   SECOND TIME. Until b366 nothing could reach hr_apply's equip block
  --   through a player gesture (there was no equip verb anywhere in src/net,
  --   which is the root of the b362 dupe class), so its refusals were
  --   unreachable and none of them was ever considered here. The equip verb
  --   makes all five reachable, and FOUR of them are functions of a GENERATED
  --   catalogue — hr_equip_slots, hr_items, hr_item_slots — i.e. exactly the
  --   "server state that can change underneath an unchanged delta" the property
  --   above names. The routine operation that trips it is a deploy-order slip:
  --   add an item to src/data/items.js, deploy the Edge payload BEFORE
  --   re-applying 2026-08-11-catalogue.generated.sql, and every equip of that
  --   item is unknown_item — and STAYS unknown_item for that key even after the
  --   catalogue lands, because a replay never re-evaluates.
  --   `requirement_not_met` is here for the same reason with a different table:
  --   it is derived from player_skills through hr_level_from_xp, and an XP
  --   grant that lands between two attempts changes the answer to an unchanged
  --   delta.
  --   `bad_equip` is a SHAPE refusal and is here only because hr_apply raises
  --   it for a delta whose shape depends on nothing but itself — releasing it
  --   is harmless (the block rolled back) and keeping it off the list would
  --   brick a key on a client bug that a redeploy fixes.
  --   ⚠ `insufficient_item` IS DELIBERATELY ABSENT. "You do not own one" is a
  --   fact about the PLAYER'S OWN ROW, not about a catalogue, and it is the
  --   ownership check that makes equipping a conserving transfer. Releasing it
  --   would hand a client an unlimited number of free re-attempts on one key
  --   against a moving inventory — which is the retry loop a dupe wants.
  c_release_codes constant text[] := array[
    'bad_buff_item', 'bad_buff_shape', 'buff_at_max', 'buff_not_paid',
    'bad_hearthfind',
    'version_conflict', 'bad_level_xp', 'bad_deaths',
    'bad_fight', 'bad_fight_hp', 'bad_fight_kills', 'unknown_monster',
    'unknown_skill', 'unknown_item', 'unknown_activity',
    'bad_equip', 'unknown_equip_slot', 'wrong_slot', 'requirement_not_met',
    'too_many_equip_ops', 'bad_enchant',
    -- 2026-09-28-settle-before-mutate.sql: a statement about the READ (the
    -- window is still unpaid), not the delta — the same key works once the
    -- settle lands, exactly like version_conflict. party_hunt_running is its
    -- partied twin (the key works once the hunt stops and the settle lands).
    'settle_first', 'party_hunt_running'];
  c_ledger_kinds constant text[] := array[
    'accrue','craft','gather','combat','farm','trade','shop',
    'quest','equip','admin','iap','clan','raid','enchant','worker'];

  v_uid   uuid;
  v_role  text;
  v_prev_intent text;
  v_this_intent text;
  -- b346. The slot a key was CLAIMED on, and whether THIS call is the one that
  -- claimed it. The first lets step (3) refuse a cross-slot reuse; the second
  -- lets step (5) release a key it claimed itself. Both are explained at their
  -- use sites — this is only where they live.
  v_prev_slot   int;
  v_claimed     boolean := false;
  v_slot  int  := coalesce(p_slot, 0);
  v_st    public.player_state%rowtype;
  v_j     jsonb;
  v_out   jsonb;
  v_prev  jsonb;
  v_kind  text;
  v_msg   text; v_det text; v_sqlstate text;
  k text; v_n bigint; v_have bigint; v_stacks int;
  v_eq    jsonb; v_item text; v_cur text;
  v_enchant_el text;   -- ELEMENTS v1: the element hr_runes resolves a rune to
  v_plot  jsonb; v_prog jsonb;
  -- 2026-10-12-companion-xp-frac.sql. THE COMPANION XP CAP, ON THE SERVER:
  -- companionXpToReach(COMPANION_MAX_LEVEL) in src/core/companion-perk.js,
  -- pinned equal by tests/companion-xp-frac.mjs. Until this file the cap lived
  -- only in the edge. v_cxp_clamp collects the clamps this apply made, for the
  -- ledger row; v_cxp_have is the row's value before the op.
  c_companion_xp_cap constant bigint := 792783;
  v_cxp_have  bigint;
  v_cxp_credit bigint;
  v_cxp_clamp jsonb;
  v_new_gold bigint; v_new_gems bigint; v_wallet jsonb;
  v_act   jsonb; v_accrued timestamptz; v_rows int;
  v_meta  jsonb;
  v_carry jsonb;
  -- Phase 0. The proposed in-flight fight, and the ceiling its HP is re-derived
  -- against. `v_fight_max` comes out of hr_activities — the GENERATED
  -- catalogue — so the clamp is a fact about src/data/monsters.js rather than a
  -- number somebody typed into SQL and stopped maintaining.
  -- The death row's loop variable and its ceiling: a death ends the hunt, so a
  -- settle carries at most one (2026-10-27 core rebuild).
  v_death jsonb;
  c_max_death_rows constant int := 1;
  -- THE HEARTHFIND. v_hf_* are all SERVER-DERIVED: the only values that
  -- come from the delta are the item id and the (kind,id) pair, and each of
  -- those is used ONLY as a lookup key against a generated catalogue.
  v_hf        jsonb;
  v_hf_item   text;
  v_hf_kind   text;
  v_hf_src    text;
  v_hf_one    bigint;
  v_hf_today  bigint;
  v_hf_last   timestamptz;
  v_hf_have   bigint;
  v_hf_out    jsonb;
  -- THE BAND, IN THE UNIT IT IS RULED IN. Read from the catalogue beside the
  -- odds so the runtime check and the migration-time self-check assert the same
  -- column, never two numbers that can drift.
  v_hf_hours     numeric;
  -- THE COSMETICS, ALL READ FROM THE CATALOGUE. No string literal for a title
  -- code or the plinth appears anywhere in this body: hand-typing them here
  -- would be the src/main.js unifyObject data double-copy, with the copy on the
  -- side that GRANTS.
  v_hf_title     text;
  v_hf_titlename text;
  v_hf_set       int;      -- distinct trophies this character has found, after this one
  v_hf_setneed   int;      -- how many distinct trophies the full set is
  v_hf_settitle  text;
  v_hf_setname   text;
  v_hf_plinth    text;
  v_hf_cosm      jsonb;    -- the cosmetics UNLOCKED BY THIS FIND, for the receipt
  -- THE GLOBAL ORDINAL - "the 4th ever found in Hearthrise". Counted across ALL
  -- characters from the append-only journal under this character's lock. It is
  -- NOT counted from world_finds: the broadcast clamp suppresses public rows, so
  -- a world_finds count would drift below the truth and the chat line would
  -- claim an ordinal that had already been used.
  v_hf_nth    bigint;
  -- THE DISCARD COUNT. Advisory only: it is journalled and never read by any
  -- arithmetic that grants, so a forged value costs the player nothing and buys
  -- the forger nothing but a rejection row against their own character.
  v_hf_drop   int;
  -- AT MOST ONE FIND PER APPLY. The engine's own roll cannot produce two in one
  -- action, and a window that legitimately contained two is settled as two
  -- applies. Accepting an array would make the daily clamp a per-array clamp.
  -- (No constant: the `hearthfind` key is an OBJECT, so the body structurally
  --  cannot see two. c_max_hf_per_apply was declared by 2026-09-08-hearthfind.sql
  --  and read by nothing; §0 proves it before this file removes it.)
  -- THREE PER CHARACTER PER UTC DAY (Feature Slate §2). An anti-automation
  -- ceiling, not a balance number: at 1-in-6,000 to 1-in-40,000 a fourth find in
  -- one day is not reachable by playing.
  c_max_hf_per_day   constant int := 3;
  -- ONE BROADCAST PER 30 s PER CHARACTER (Designer ruling 2026-09-08 §9; the
  -- 60 s form was REJECTED). Suppresses the world_finds ROW ONLY; the trophy,
  -- the ledger row, the cosmetic unlocks and the receipt are unaffected, so a
  -- suppressed broadcast never costs value -- only a duplicate chat line. At the
  -- ruled cadence (~2 finds per realm-week) the clamp exists solely to stop a
  -- pathological retry storm from spamming global chat; halving it costs
  -- nothing and keeps a genuine back-to-back double find visible.
  c_hf_broadcast     constant interval := interval '30 seconds';
  -- CONSUMABLE BUFFS (2026-09-13). Resolved from hr_item_buffs under the
  -- character lock at (4a-b); written in the SET clause. No client value reaches
  -- any of them except the ITEM ID, which is looked up rather than trusted.
  c_buff_max_ms constant bigint  := 3600000;   -- the expiry cap AND the blast radius
  c_buff_scale  constant numeric := 1;         -- the BASE multiplier, before any perk
  -- ⚠ THE FUSE ON THE PERK STACK (2026-09-13 step 3). The Cellar's top rung sells
  --   +100%, so this binds on nothing that exists today — which is exactly when a
  --   ceiling should be written. It bounds anything a future perk (a clan bonus, a
  --   Feast Mastery) can add to a duration WITHOUT this body being re-reviewed,
  --   and it is applied before the 60-minute expiry cap rather than instead of it.
  c_buff_scale_max constant numeric := 2;      -- no perk stack may more than double a buff
  v_buff_rung   int;
  v_buff_bonus  numeric;
  v_buff_scale  numeric;
  -- ⚠ THE MINIMUM GAIN, and it is the whole reason buff_at_max is REACHABLE.
  --   The cap is `now() + c_buff_max_ms`, so it MOVES with the clock: once a queue
  --   sits on the ceiling, the next consume a second later still buys one second
  --   and `base >= cap` is never true again. That is "eat the item for nothing"
  --   with extra steps — the exact outcome the designer's ruling forbids — and it
  --   was measured, not reasoned about: the first draft refused only on
  --   `base >= cap`, the migration's own §4 passed (a migration applies inside ONE
  --   transaction, where now() is FROZEN, so the equality really does hold there)
  --   and tests/buff-queue.mjs, which calls hr_apply in separate transactions like
  --   production does, went 200 consumes without a single refusal.
  --   So the rule is stated as the ruling means it: a consume must buy a
  --   MEANINGFUL share of what it promises, or it is refused and the food is not
  --   spent. A FRACTION rather than a fixed number of seconds, so it scales with a
  --   two-minute Roasted Carrot and a ten-minute Feast alike.
  c_buff_min_gain_frac constant numeric := 0.10;
  v_buff_gain   bigint;
  v_buff_need   bigint;
  v_buff_item   text;
  v_buff_type   text;
  v_buff_mag    numeric;
  v_buff_newmag numeric;
  v_buff_dur    bigint;
  v_buff_now    timestamptz;
  v_buff_base   timestamptz;
  v_buff_until  timestamptz;
  v_buff_cap    timestamptz;
  -- (No v_buff_old: 2026-09-13-buff-segments.sql replaced the max()-merge that
  --  read it with per-segment stacking and said so — "keeps its declare and stops
  --  being read". §0 proves it before this file removes it.)
  -- Per-segment stacking (2026-09-13). c_buff_max_segments is a COST fuse, not a
  -- balance number: without it the entry count is bounded only by (60 min / the
  -- shortest food) x the type vocabulary = 270 entries ~ 25 KB of jsonb on every
  -- hr_state_of, and that envelope is read on every boot, settle and switch.
  c_buff_max_segments constant int := 8;
  v_buff_segs   int;
  v_buff_same   jsonb;
  v_buffs_new   jsonb;
  v_fight jsonb;
  v_fight_max int;
  -- THE DAILY BUDGET (C5/X3). Gross inflow proposed by THIS delta, per
  -- dimension. Computed here from the delta, never accepted from the caller —
  -- there is no delta key for them and the ledger has no client write grant, so
  -- a compromised engine cannot understate its own consumption.
  -- See supabase/migrations/2026-08-11-daily-budget.sql for the whole design.
  v_gold_in bigint := 0; v_xp_in bigint := 0; v_qty_in bigint := 0;
  -- b351 — THE FOURTH DIMENSION. Gems had a per-call clamp (100,000) and NO
  -- daily ceiling, so a compromised engine could mint 100,000 gems per call at
  -- 240 applies/minute. Security measured it: 1.2M gems in 12 calls, zero
  -- refusals, while the IDENTICAL gold loop was refused at call 6. Same
  -- provenance rule as the three above: computed here from the delta, never
  -- accepted from the caller.
  v_gems_in bigint := 0;
  v_bud   jsonb;
  -- Slice 3 (docs/design/live-settlement.md): the daily settle STREAK. Advanced
  -- ONLY here, from now(), on any ACCRUAL delta (one that carries accrued_to) —
  -- never a client value, and there is no present:true field. Computed just
  -- before the state UPDATE.
  v_new_streak int;
  v_streak_day text;
begin
  -- ── (0) THE IDENTITY SEAM (review S1) ──────────────────────────────────
  --    introduced by 2026-08-11-apply-engine.sql
  -- hr_apply is granted to exactly one role. `hr_engine` may act for a user it
  -- names, because it has already verified that user's JWT and it holds no
  -- table privilege of its own. Nobody else may name a user at all.
  --
  -- ⚠ current_user IS NOT THE CALLER HERE. Inside a SECURITY DEFINER function
  --   current_user is the function's OWNER (postgres), so a `current_user =
  --   'hr_engine'` test can never be true — verified on the database, not
  --   assumed. The GUC set by PostgREST's `SET LOCAL ROLE <jwt.role>` does
  --   survive the definer boundary, and that is what is read below.
  --
  --   The GUC is a SECONDARY check. The PRIMARY control is the GRANT: hr_apply
  --   is executable by hr_engine and by nothing else a request can arrive as,
  --   so reaching this line at all already means the caller is the engine (or
  --   the owner, running a migration or a test). The GUC test exists so that
  --   an owner-context call — a psql session, a future admin script — cannot
  --   silently act as an arbitrary user without saying so.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role = 'hr_engine' then
    v_uid := coalesce(p_user, auth.uid());
  else
    v_uid := auth.uid();
    if p_user is not null and p_user is distinct from v_uid then
      -- Recorded even though it never reaches the protected block: this is the
      -- single most interesting thing anyone can do to this function. (R4.)
      perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'forbidden_impersonation',
        jsonb_build_object('claimed_user', p_user, 'role', v_role));
      return jsonb_build_object('ok', false, 'error', 'forbidden_impersonation');
    end if;
  end if;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  if p_delta is null or jsonb_typeof(p_delta) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_delta');
  end if;
  if p_intent_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_intent_id');
  end if;
  -- Unknown top-level keys are an error, not a shrug. A delta key that this
  -- function does not implement must never look like it worked.
  if exists (select 1 from jsonb_object_keys(p_delta) as t(dk)
              where dk <> all (c_delta_keys)) then
    v_out := jsonb_build_object('ok', false, 'error', 'unknown_delta_key',
      'keys', (select jsonb_agg(dk) from jsonb_object_keys(p_delta) as t(dk)
                where dk <> all (c_delta_keys)));
    -- An unknown key means the Edge Function and this contract have diverged,
    -- or someone is probing for one that is not implemented. Both are worth
    -- knowing about tomorrow, not just for the next 24 hours. (R4.)
    perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'unknown_delta_key',
      jsonb_build_object('keys', v_out->'keys'));
    return v_out;
  end if;

  -- ── (1) Rate limit. OUTSIDE the protected block on purpose: a rejected call
  --    introduced by 2026-08-11-apply-engine.sql
  --        must still consume budget, otherwise "spam invalid deltas" is a free
  --        denial of service against the engine.
  if not public.hr_rate_ok(v_uid, 'apply', 240, interval '1 minute') then
    -- (C2) Recorded BEFORE the return, and before the intent claim, because
    -- otherwise a rate-limited caller leaves no durable trace anywhere: the
    -- early return happens ahead of player_intents, and player_intents is
    -- pruned after 24h regardless. Sustained rate limiting is the loudest
    -- automation signal this server produces and it was being discarded.
    -- hr_record_rejection aggregates per (character, code, day) and promotes
    -- the row to severity 'incident' past its daily threshold, so this costs
    -- one row per player per day, not one row per rejected call.
    --
    -- (S6) …but still one WRITE per rejected call, which under the retry storm
    -- this exists to detect is a row lock plus a WAL record per request, all
    -- serialised on one tuple. So it is SAMPLED: the 1st, 10th and 50th
    -- rejection in the window, then every 1000th, each carrying the gap it
    -- stands for so `n` and the 'incident' escalation are unchanged.
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'rate_limited',
        jsonb_build_object('limit', 240, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- ── (2) Serialise this character. hashtextextended over user+slot; the lock
  --    introduced by 2026-08-11-apply-engine.sql
  --        is transaction-scoped so it always releases, exception included.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- ── (3) IDEMPOTENCY (review S8). Under the lock, so the check and the claim
  --    introduced by 2026-08-11-apply-engine.sql
  --        cannot interleave. A replay returns the FIRST answer — success or
  --        rejection — because "same key, same answer" is the contract that
  --        makes a client retry safe.
  --
  --        WHAT IS STORED IS THE DECISION, NOT THE ENVELOPE (review R5).
  --        Revision 2 stored the ENTIRE hr_state_of envelope — inventory,
  --        fifteen skills, farm plots, progress — in player_intents.result, per
  --        intent, at up to 240 applies/min/player. That is a full state
  --        snapshot roughly every quarter second per player, retained 24 hours:
  --        ~2 KB × 240 × 60 × 24 = 690 MB PER PLAYER PER DAY at the rate limit,
  --        and this repo already has the receipt for what an unbounded journal
  --        does here (game_events: 1.6M rows / 229 MB, six players, 3.45 days).
  --        Now only `{ok}` (plus the error and its detail on a rejection) is
  --        stored — tens of bytes — and a REPLAY OF A SUCCESS RE-DERIVES the
  --        current state. That is strictly better for the caller too: a retry
  --        gets fresh state and a fresh version instead of a stale snapshot it
  --        would then have to discard. The contract is unchanged and is the one
  --        that matters: the same key applies the effect exactly once.
  --
  --        ── ONE NAMESPACE, TWO KINDS OF KEY (review S6) ──────────────────
  --    introduced by 2026-08-11-apply-engine.sql
  --        `player_intents` is keyed on (user_id, intent_id) and NOTHING else,
  --        so a client-supplied uuid (market_list / market_cancel / market_buy
  --        all take p_intent_id straight from the browser) shares a namespace
  --        with keys the SERVER derives — the accrual engine's key is
  --        sha256(user, slot, watermark, …), and `accrued_to` is a value
  --        hr_load hands the client so it can render a countdown.
  --
  --        Left alone, that is a self-denial-of-service with a nasty shape: a
  --        player computes their own next accrual key, burns it with a market
  --        call, and every accrual from then on returns `replayed: true`,
  --        applies nothing, and never advances the watermark — silently, with
  --        ok:true, until hr_intents_prune deletes the row 24 hours later.
  --
  --        The fix is to notice that a replay must be a replay OF THE SAME
  --        THING. `player_intents.intent` already records what the key was
  --        claimed for; if the incoming call names a different one, this is not
  --        a retry, it is a collision — deliberate or accidental — and the
  --        honest answer is to refuse rather than to hand back someone else's
  --        decision. One comparison, and it hardens every intent in the system,
  --        not just accrual. (The accrual key is ALSO salted with hr_seed's
  --        server secret now, so it cannot be computed in the first place; these
  --        are two independent locks and the cheap one lives here.)
  v_this_intent := p_delta #>> '{journal,intent}';
  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents
   where user_id = v_uid and intent_id = p_intent_id;
  if found then
    --        ── AND A REPLAY MUST BE A REPLAY ON THE SAME CHARACTER (b346) ──
    --    introduced by 2026-08-15-intent-key-hygiene.sql
    --        The intent NAME cannot carry the slot: it is also
    --        player_ledger.intent, which the rollup groups on, so a slot number
    --        in it would make one declaration read as two different things.
    --        Which leaves 'set_activity:combat:goblin' meaning the same thing on
    --        slot 0 and slot 1 — and 'set_activity:idle', which EVERY stop a
    --        player makes shares, meaning the same thing everywhere.
    --
    --        Measured on this database 2026-08-15 and rolled back: one key
    --        applied on slot 0 and then presented on slot 1 answered
    --        ok:true, replayed:true and APPLIED NOTHING (slot 1 gold 500 -> 500)
    --        while a control with a fresh key applied (500 -> 507). Silent, with
    --        ok:true, on the character the player is looking at.
    --
    --        The column was already on the table and simply never read. One
    --        comparison, here, covers all nine intents; the alternative is nine
    --        Edge Functions each remembering to disambiguate a key they did not
    --        choose.
    if v_prev_intent is distinct from v_this_intent
       or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(v_uid, v_slot, coalesce(v_this_intent, 'apply'),
        'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_this_intent,
                           'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then
      return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
    end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;
  -- (N3) The advisory lock above is keyed on user:SLOT, but the intent PK is
  -- (user_id, intent_id) — no slot. Two slots replaying the same intent_id
  -- concurrently therefore both miss the select and both insert, and the loser
  -- gets an unhandled unique_violation (a 500) instead of an answer. Exotic
  -- today (one character is active at a time) but it is a race, and a race
  -- closed by `on conflict do nothing` costs nothing. The key stays
  -- user-global rather than slot-scoped on purpose: a client-generated uuid
  -- that means two different things on two slots is a worse contract than one
  -- that is simply already taken.
  -- b346: "already taken" is now SAID OUT LOUD. The branch above answers
  -- intent_mismatch on a cross-slot reuse instead of handing back the other
  -- character's decision, which is what "a worse contract" was always going to
  -- feel like in practice.
  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_intent_id, v_slot, v_this_intent)
  on conflict (user_id, intent_id) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
  end if;
  -- THIS call owns the row. Nothing else may release it (see step (5)): a
  -- rejection returned from the branch above belongs to whoever claimed the key
  -- first, and deleting it there would free a key that is recording a SUCCESS.
  v_claimed := true;

  -- ══ THE PROTECTED BLOCK ═══════════════════════════════════════════════
  --    introduced by 2026-08-11-apply-engine.sql
  -- Everything from here to the handler is all-or-nothing. Every rejection is
  -- hr_reject(), which raises; the handler below undoes the block. (Review S2.)
  begin
    select * into v_st from public.player_state
      where user_id = v_uid and slot = v_slot for update;
    if not found then perform public.hr_reject('no_character'); end if;

    --    introduced by 2026-08-11-apply-engine.sql
    -- (4) OPTIMISTIC CONCURRENCY — MANDATORY (review S9). Revision 1 skipped
    -- the check when p_version was null, which meant the caller chose whether
    -- concurrency control applied. A missing version IS a conflict.
    if p_version is null or p_version <> v_st.version then
      perform public.hr_reject('version_conflict',
                               jsonb_build_object('version', v_st.version));
    end if;

    -- ── SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql, F2) ────
    -- The settle and the window-closing verbs carry accrued_to / activity /
    -- equip / enchant; the crew's own settle carries workers_accrued_to. Any
    -- OTHER delta that adds a priced input — a buff, or a positive item (a
    -- tool, food, ammo, a material) — must not land while the pointer's window
    -- is unpaid, or the settle prices the whole absence at it.
    if not (p_delta ?| array['accrued_to', 'activity', 'equip', 'enchant', 'workers_accrued_to'])
       and (p_delta ? 'buff_apply'
            or (jsonb_typeof(p_delta->'items') = 'object'
                and exists (select 1 from jsonb_each_text(p_delta->'items') as t(k, v)
                             where t.v ~ '^\s*\+?0*[1-9][0-9]*\s*$'))) then
      perform public.hr_require_settled(v_uid, v_slot);
    end if;

    -- ── GOLD ─────────────────────────────────────────────────────────────
    --    introduced by 2026-08-11-apply-engine.sql
    v_new_gold := v_st.gold;
    if p_delta ? 'gold' then
      v_n := coalesce((p_delta->>'gold')::bigint, 0);
      if abs(v_n) > c_max_gold_delta then
        perform public.hr_reject('gold_clamp', jsonb_build_object('limit', c_max_gold_delta));
      end if;
      v_new_gold := v_st.gold + v_n;
      if v_new_gold < 0 then
        perform public.hr_reject('insufficient_gold',
                                 jsonb_build_object('have', v_st.gold, 'need', -v_n));
      end if;
    end if;

    -- ── GEMS (review S5) ─────────────────────────────────────────────────
    --    introduced by 2026-08-11-apply-engine.sql
    -- Revision 1 wrote `greatest(0, gems + delta)` with no clamp and no error:
    -- spending 10 gems while holding 3 succeeded and silently cost 3. Gems are
    -- a premium currency; a silent partial spend is a support ticket at best.
    -- ACCOUNT WALLET (2026-10-19-account-wallet.sql). Gems are the ACCOUNT's,
    -- in public.account_wallet, so v_new_gems is now the CREDIT this apply asks
    -- the wallet for: paid AFTER the ledger row by hr_wallet_credit under the
    -- account grant key 'apply:<journal.intent>' (once per account, the
    -- account's day cap). The engine never SPENDS gems — a spend is an RPC with
    -- its own catalogue — so a negative gem delta is refused.
    v_new_gems := 0;
    if p_delta ? 'gems' then
      v_n := coalesce((p_delta->>'gems')::bigint, 0);
      if abs(v_n) > c_max_gem_delta then
        perform public.hr_reject('gem_clamp', jsonb_build_object('limit', c_max_gem_delta));
      end if;
      if v_n < 0 then
        perform public.hr_reject('bad_delta', jsonb_build_object(
          'field', 'gems', 'why', 'the engine never spends gems'));
      end if;
      if v_n > 0 and coalesce(p_delta #>> '{journal,intent}', '') = '' then
        perform public.hr_reject('bad_delta', jsonb_build_object(
          'field', 'gems', 'why', 'a gem credit needs journal.intent, its account grant key'));
      end if;
      v_new_gems := v_n;
    end if;

    -- ── ITEMS ─ the delta is signed; a spend and a gain are the same code ─
    --    introduced by 2026-08-11-apply-engine.sql
    if p_delta ? 'items' then
      if jsonb_typeof(p_delta->'items') <> 'object' then
        perform public.hr_reject('bad_items');
      end if;
      if (select count(*) from jsonb_object_keys(p_delta->'items')) > c_max_item_kinds then
        perform public.hr_reject('too_many_item_kinds');
      end if;
      for k, v_n in select key, coalesce(nullif(value,'')::bigint, 0)
                      from jsonb_each_text(p_delta->'items') loop
        if v_n = 0 then continue; end if;
        if abs(v_n) > c_max_item_delta then
          perform public.hr_reject('item_clamp', jsonb_build_object('item_id', k));
        end if;
        -- Unknown ids are refused unconditionally now. hr_items is GENERATED
        -- from src/data/items.js; if it is missing this function errors, which
        -- is the correct direction to fail. (Review S3.)
        if not exists (select 1 from public.hr_items where item_id = k) then
          perform public.hr_reject('unknown_item', jsonb_build_object('item_id', k));
        end if;
        select qty into v_have from public.player_inventory
          where user_id = v_uid and slot = v_slot and item_id = k for update;
        v_have := coalesce(v_have, 0);
        if v_have + v_n < 0 then
          perform public.hr_reject('insufficient_item',
            jsonb_build_object('item_id', k, 'have', v_have, 'need', -v_n));
        end if;
        -- A LOCKED ITEM IS NEVER SOLD TO THE NPC (hook: hr_item_locked, 2026-10-25-bag-rules.sql).
        if v_n < 0 and coalesce(v_this_intent, '') ~ '^vendor_sell(_many)?(:|$)' and public.hr_item_locked(v_uid, v_slot, k) then
          perform public.hr_reject('item_locked', jsonb_build_object('item_id', k));
        end if;
        if v_have + v_n = 0 then
          delete from public.player_inventory
            where user_id = v_uid and slot = v_slot and item_id = k;
        else
          insert into public.player_inventory as pi (user_id, slot, item_id, qty)
            values (v_uid, v_slot, k, v_have + v_n)
            on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
        end if;
      end loop;
    end if;

    -- ── XP ─ monotonic. A negative XP delta is a caller bug, and accepting one
    --    introduced by 2026-08-11-apply-engine.sql
    --        would make a rollback indistinguishable from an exploit.
    if p_delta ? 'xp' then
      if jsonb_typeof(p_delta->'xp') <> 'object' then perform public.hr_reject('bad_xp'); end if;
      for k, v_n in select key, coalesce(nullif(value,'')::bigint, 0)
                      from jsonb_each_text(p_delta->'xp') loop
        if v_n <= 0 then continue; end if;
        if v_n > c_max_xp_delta then
          perform public.hr_reject('xp_clamp', jsonb_build_object('skill_id', k));
        end if;
        -- ⚠ A MISSING ROW IS A ROW TO CREATE, NOT A REFUSAL (b370, and the
        --   incident that named it). This was an UPDATE plus
        --   `if v_rows <> 1 then hr_reject('unknown_skill')`, which conflated
        --   two unrelated facts: "that skill is not in the catalogue" (a real
        --   deploy bug) and "this character has no row for a real skill" (server
        --   bookkeeping). The per-skill rows are seeded ONCE, at character
        --   creation (2026-08-14-character-bootstrap.sql), and the catalogue
        --   grows afterwards — so every character older than a skill was missing
        --   its row, and hr_apply answered a legitimate grant with a refusal.
        --   When Stonemason shipped, that refusal STORED itself against the
        --   intent key (so "Try again" replayed it) and, because hr_reject rolls
        --   the protected block back WHOLE, it took the player's ore, gold and
        --   every other skill's XP down with it. 51 rejections in one night.
        --
        -- ⚠ THE HAND BACKFILL IS NOT THE FIX. Production was backfilled that
        --   night (all user/slot × hr_skills pairs now exist), which removes the
        --   symptom and leaves the defect: the NEXT skill added to
        --   src/data/skills.js re-creates it for every existing character. The
        --   bootstrap seed cannot fix it either — it runs once. The grant is the
        --   only place that is correct for a backfilled database AND a fresh one,
        --   so the fix is here.
        --
        -- ⚠ THE CATALOGUE CHECK IS THE VALIDATION; THE UPSERT IS NOT. There is
        --   NO foreign key from player_skills.skill_id to hr_skills (the FK is to
        --   player_state(user_id, slot)), so a bare upsert would happily mint a
        --   skill row named by a client string. Checking hr_skills FIRST is what
        --   keeps `unknown_skill` meaning what its name says — and it is raised
        --   STRICTLY MORE NARROWLY than before, so no delta this body used to
        --   accept can start being refused.
        if not exists (select 1 from public.hr_skills where skill_id = k) then
          perform public.hr_reject('unknown_skill', jsonb_build_object('skill_id', k));
        end if;
        insert into public.player_skills (user_id, slot, skill_id, xp)
          values (v_uid, v_slot, k, v_n)
          on conflict (user_id, slot, skill_id)
          do update set xp = player_skills.xp + v_n;
      end loop;
    end if;

    -- ── LEVEL XP (2026-10-27 core rebuild) ─ monotonic, kills only, the hunt settle only.
    --    The value bound (the journalled kills x the catalogue's per-kill XP) is
    --    hr_hunt_apply_member's, which wraps this call and sets hr.hunt_session.
    if p_delta ? 'level_xp' then
      if jsonb_typeof(p_delta->'level_xp') <> 'number' or (p_delta->>'level_xp') !~ '^[0-9]{1,15}$' then
        perform public.hr_reject('bad_level_xp', jsonb_build_object('type', jsonb_typeof(p_delta->'level_xp')));
      end if;
      if coalesce(current_setting('hr.hunt_session', true), '') = '' then
        perform public.hr_reject('level_xp_outside_hunt');
      end if;
      v_n := (p_delta->>'level_xp')::bigint;
      if v_n > c_max_xp_delta then
        perform public.hr_reject('xp_clamp', jsonb_build_object('skill_id', 'level'));
      end if;
      update public.player_state set level_xp = level_xp + v_n where user_id = v_uid and slot = v_slot;
    end if;

    -- ── XP REMAINDER (2026-10-09-xp-frac-carry.sql) ─ ABSOLUTE, per skill.
    --    grantXp credits floor(remainder + grant) and carries the rest; this
    --    stores the rest. REFUSED, never clamped, exactly as tool_carry: a
    --    remainder outside [0,1) has no honest source, and 900 would be a
    --    900-XP mint on the next grant. Written AFTER the XP loop so a skill
    --    row the loop just created is updated, not duplicated.
    if p_delta ? 'xp_frac' then
      if jsonb_typeof(p_delta->'xp_frac') <> 'object' then
        perform public.hr_reject('bad_xp_frac',
          jsonb_build_object('type', jsonb_typeof(p_delta->'xp_frac')));
      end if;
      if (select count(*) from jsonb_object_keys(p_delta->'xp_frac')) > c_max_carry_skills then
        perform public.hr_reject('too_many_xp_frac_skills',
          jsonb_build_object('n', (select count(*) from jsonb_object_keys(p_delta->'xp_frac'))));
      end if;
      for k in select key from jsonb_each(p_delta->'xp_frac') loop
        if length(k) not between 1 and 32
           or not exists (select 1 from public.hr_skills where skill_id = k) then
          perform public.hr_reject('unknown_skill', jsonb_build_object('skill_id', k));
        end if;
        if jsonb_typeof(p_delta->'xp_frac'->k) <> 'number'
           or (p_delta->'xp_frac'->>k)::numeric < 0 or (p_delta->'xp_frac'->>k)::numeric >= 1 then
          perform public.hr_reject('bad_xp_frac',
            jsonb_build_object('skill', k, 'value', p_delta->'xp_frac'->k));
        end if;
        -- trunc, never round: round(0.9999996, 6) is 1, which the CHECK refuses.
        insert into public.player_skills (user_id, slot, skill_id, xp, xp_frac)
          values (v_uid, v_slot, k, 0, trunc((p_delta->'xp_frac'->>k)::numeric, 6))
          on conflict (user_id, slot, skill_id)
          do update set xp_frac = excluded.xp_frac;
      end loop;
    end if;

    -- ── EQUIPMENT (review S4) ────────────────────────────────────────────
    --    introduced by 2026-08-11-apply-engine.sql
    -- Equipping is a TRANSFER, not a flag. One unit leaves player_inventory
    -- and one unit comes back on unequip or swap, so the total the player owns
    -- is conserved and the equip/unequip duplication is arithmetically
    -- impossible rather than merely unimplemented.
    --
    -- Four gates, all against the SERVER's data:
    --   • the equip slot exists                 (hr_equip_slots)
    --   • the item exists                       (hr_items)
    --   • the item fits that slot               (hr_item_slots — 'ring' is
    --     expanded to ring1/ring2 by the generator, in JS, next to the data)
    --   • the player meets reqSkill/reqLv       (player_skills, derived level)
    if p_delta ? 'equip' then
      if jsonb_typeof(p_delta->'equip') <> 'object' then perform public.hr_reject('bad_equip'); end if;
      if (select count(*) from jsonb_object_keys(p_delta->'equip')) > c_max_equip_kinds then
        perform public.hr_reject('too_many_equip_ops');
      end if;
      for k, v_eq in select key, value from jsonb_each(p_delta->'equip') loop
        if not exists (select 1 from public.hr_equip_slots where equip_slot = k) then
          perform public.hr_reject('unknown_equip_slot', jsonb_build_object('equip_slot', k));
        end if;

        select item_id into v_cur from public.player_equipment
         where user_id = v_uid and slot = v_slot and equip_slot = k for update;

        if jsonb_typeof(v_eq) = 'null' then
          -- UNEQUIP: return the unit to the bank.
          if v_cur is not null then
            delete from public.player_equipment
             where user_id = v_uid and slot = v_slot and equip_slot = k;
            insert into public.player_inventory as pi (user_id, slot, item_id, qty)
              values (v_uid, v_slot, v_cur, 1)
              on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;
          end if;
          continue;
        end if;

        if jsonb_typeof(v_eq) <> 'string' then
          perform public.hr_reject('bad_equip', jsonb_build_object('equip_slot', k));
        end if;
        v_item := v_eq #>> '{}';
        if v_cur is not null and v_cur = v_item then continue; end if;   -- no-op

        if not exists (select 1 from public.hr_items where item_id = v_item) then
          perform public.hr_reject('unknown_item', jsonb_build_object('item_id', v_item));
        end if;
        if not exists (select 1 from public.hr_item_slots
                        where item_id = v_item and equip_slot = k) then
          perform public.hr_reject('wrong_slot',
            jsonb_build_object('item_id', v_item, 'equip_slot', k));
        end if;
        -- The requirement is re-checked here even though the Edge Function
        -- already checked it. "The caller checked" is not a control.
        if exists (
          select 1 from public.hr_items i
           where i.item_id = v_item and i.req_skill is not null and i.req_lv is not null
             and coalesce((select public.hr_level_from_xp(s.xp) from public.player_skills s
                            where s.user_id = v_uid and s.slot = v_slot
                              and s.skill_id = i.req_skill), 1) < i.req_lv)
        then
          perform public.hr_reject('requirement_not_met', jsonb_build_object('item_id', v_item));
        end if;

        -- DEBIT one from the bank. This is the ownership check; there is
        -- nothing else to check.
        select qty into v_have from public.player_inventory
         where user_id = v_uid and slot = v_slot and item_id = v_item for update;
        if coalesce(v_have, 0) < 1 then
          perform public.hr_reject('insufficient_item',
            jsonb_build_object('item_id', v_item, 'have', coalesce(v_have, 0), 'need', 1));
        end if;
        if v_have = 1 then
          delete from public.player_inventory
           where user_id = v_uid and slot = v_slot and item_id = v_item;
        else
          update public.player_inventory set qty = qty - 1
           where user_id = v_uid and slot = v_slot and item_id = v_item;
        end if;

        -- CREDIT back whatever was in the slot.
        if v_cur is not null then
          insert into public.player_inventory as pi (user_id, slot, item_id, qty)
            values (v_uid, v_slot, v_cur, 1)
            on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;
        end if;

        insert into public.player_equipment as pe (user_id, slot, equip_slot, item_id)
          values (v_uid, v_slot, k, v_item)
          on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
      end loop;
    end if;

    -- ── ENCHANTING (ELEMENTS v1) ─────────────────────────────────────────
    --    introduced by 2026-08-18-enchant.sql
    -- Applying a rune to the weapon MIRRORS the equip TRANSFER above: one rune
    -- leaves player_inventory (the debit IS the ownership check) and the
    -- server-owned player_state.enchant[<slot>] becomes the rune's ELEMENT,
    -- RESOLVED from the SERVER catalogue hr_runes — never an element the Edge
    -- Function proposed. Re-validated here under the row lock; the Edge answer is
    -- only an earlier, named refusal. v1 enchants the WEAPON slot only, and only
    -- when it currently holds a weapon.
    --   • the enchant slot is a real equip slot and is the weapon slot (v1)
    --   • the rune resolves to an element              (hr_runes)
    --   • that slot currently holds a WEAPON           (player_equipment + hr_items.kind)
    --   • the player owns >=1 of the rune — the debit is the check
    if p_delta ? 'enchant' then
      if jsonb_typeof(p_delta->'enchant') <> 'object' then perform public.hr_reject('bad_enchant'); end if;
      -- v1 is ONE slot per call; more than one is a shape error, not a partial
      -- apply. (equip allows a loadout map; an enchant is a single gesture.)
      if (select count(*) from jsonb_object_keys(p_delta->'enchant')) <> 1 then
        perform public.hr_reject('bad_enchant', jsonb_build_object('why', 'one slot per enchant'));
      end if;
      for k, v_eq in select key, value from jsonb_each(p_delta->'enchant') loop
        if not exists (select 1 from public.hr_equip_slots where equip_slot = k) then
          perform public.hr_reject('unknown_equip_slot', jsonb_build_object('equip_slot', k));
        end if;
        -- v1: WEAPON ONLY. A real slot that is not the weapon slot is wrong_slot,
        -- the same code a slot that holds no weapon gets below — "this cannot be
        -- enchanted" is one fact.
        if k <> 'weapon' then
          perform public.hr_reject('wrong_slot', jsonb_build_object('equip_slot', k));
        end if;
        if jsonb_typeof(v_eq) <> 'string' then
          perform public.hr_reject('bad_enchant', jsonb_build_object('equip_slot', k));
        end if;
        v_item := v_eq #>> '{}';                       -- the RUNE id
        -- RESOLVE rune -> element from the catalogue. Unknown => not a rune.
        select element into v_enchant_el from public.hr_runes where rune_id = v_item;
        if v_enchant_el is null then
          perform public.hr_reject('unknown_item', jsonb_build_object('item_id', v_item));
        end if;
        -- The target slot must currently hold a WEAPON. The server reads its OWN
        -- equipment, never the client's claim.
        select item_id into v_cur from public.player_equipment
         where user_id = v_uid and slot = v_slot and equip_slot = k for update;
        if v_cur is null
           or not exists (select 1 from public.hr_items where item_id = v_cur and kind = 'weapon') then
          perform public.hr_reject('wrong_slot', jsonb_build_object('equip_slot', k, 'held', v_cur));
        end if;
        -- DEBIT one rune. This is the ownership check; there is nothing else to
        -- check, exactly as with the equip debit above. insufficient_item is
        -- DELIBERATELY off c_release_codes for the same reason equip's is.
        select qty into v_have from public.player_inventory
         where user_id = v_uid and slot = v_slot and item_id = v_item for update;
        if coalesce(v_have, 0) < 1 then
          perform public.hr_reject('insufficient_item',
            jsonb_build_object('item_id', v_item, 'have', coalesce(v_have, 0), 'need', 1));
        end if;
        if v_have = 1 then
          delete from public.player_inventory
           where user_id = v_uid and slot = v_slot and item_id = v_item;
        else
          update public.player_inventory set qty = qty - 1
           where user_id = v_uid and slot = v_slot and item_id = v_item;
        end if;
        -- SET the server-owned enchant state to the resolved ELEMENT. jsonb
        -- merge so any future ELEMENTS v2 slot survives a single-slot enchant.
        update public.player_state
           set enchant = coalesce(enchant, '{}'::jsonb) || jsonb_build_object(k, v_enchant_el)
         where user_id = v_uid and slot = v_slot;
      end loop;
    end if;

    -- ── BANK CAP ─ counted once, AFTER items and equipment, because both can
    --    introduced by 2026-08-11-apply-engine.sql
    --   create a stack. Revision 1 checked it mid-way through the item loop and
    --   then returned, committing the items it had already written.
    --   A NEW stack is what costs space, so a player at cap can still gain more
    --   of what they already hold.
    --   BOUNDED COUNT (reliability RL4): the question is "> cap?", not "how
    --   many?", so the scan stops at cap+1 rows instead of walking a 100,000-
    --   stack bank on every item-touching apply.
    if (p_delta ? 'items') or (p_delta ? 'equip') then
      select count(*) into v_stacks from (
        select 1 from public.player_inventory
         where user_id = v_uid and slot = v_slot
         limit v_st.bank_cap + 1) s;
      if v_stacks > v_st.bank_cap then
        perform public.hr_reject('bank_full',
          jsonb_build_object('stacks', v_stacks, 'cap', v_st.bank_cap));
      end if;
    end if;

    -- ── FARM ─ planting stamps the SERVER clock. `planted_at` can never be
    --    introduced by 2026-08-11-apply-engine.sql
    --   supplied by anyone: that single line is the whole farming exploit
    --   closed. The crop id is checked against the generated catalogue.
    if p_delta ? 'farm' then
      if jsonb_typeof(p_delta->'farm') <> 'array' then perform public.hr_reject('bad_farm'); end if;
      if jsonb_array_length(p_delta->'farm') > c_max_farm_ops then
        perform public.hr_reject('too_many_farm_ops');
      end if;
      for v_plot in select value from jsonb_array_elements(p_delta->'farm') loop
        if coalesce((v_plot->>'clear')::boolean, false) then
          update public.player_farm
             set crop_id = null, planted_at = null, watered_at = null
           where user_id = v_uid and slot = v_slot and plot_idx = (v_plot->>'i')::int;
        elsif coalesce((v_plot->>'plant')::boolean, false) then
          if not exists (select 1 from public.hr_crops where crop_id = v_plot->>'crop') then
            perform public.hr_reject('unknown_crop', jsonb_build_object('crop', v_plot->>'crop'));
          end if;
          update public.player_farm
             set crop_id = v_plot->>'crop', planted_at = now(), watered_at = null
           where user_id = v_uid and slot = v_slot and plot_idx = (v_plot->>'i')::int
             and crop_id is null;                   -- never replant an occupied plot
          get diagnostics v_rows = row_count;
          if v_rows <> 1 then
            perform public.hr_reject('plot_unavailable', jsonb_build_object('i', v_plot->>'i'));
          end if;
        elsif coalesce((v_plot->>'water')::boolean, false) then
          update public.player_farm set watered_at = now()
           where user_id = v_uid and slot = v_slot and plot_idx = (v_plot->>'i')::int
             and crop_id is not null and watered_at is null;
        end if;
      end loop;
    end if;

    -- ── PROGRESS (review S13) ────────────────────────────────────────────
    --    introduced by 2026-08-11-apply-engine.sql
    -- Revision 1 inserted whatever `kind` and `state` the delta named, with an
    -- unbounded `add`. `kind` typos became a parallel universe of rows; `state`
    -- accepted 'claimed', which is the one value that gates a payout.
    -- Here: `kind` is checked, `add` is clamped and non-negative, and 'claimed'
    -- is unreachable — the separate claim block below is the only route.
    if p_delta ? 'progress' then
      if jsonb_typeof(p_delta->'progress') <> 'array' then perform public.hr_reject('bad_progress'); end if;
      if jsonb_array_length(p_delta->'progress') > c_max_progress_ops then
        perform public.hr_reject('too_many_progress_ops');
      end if;
      for v_prog in select value from jsonb_array_elements(p_delta->'progress') loop
        if coalesce(v_prog->>'kind','') not in
             ('quest','daily','bounty','stat','collection','flag') then
          perform public.hr_reject('bad_progress_kind', jsonb_build_object('kind', v_prog->>'kind'));
        end if;
        if length(coalesce(v_prog->>'key','')) not between 1 and 64
           or length(coalesce(v_prog->>'period','')) > 16 then
          perform public.hr_reject('bad_progress_key');
        end if;
        if coalesce(v_prog->>'state','active') not in ('active','done') then
          perform public.hr_reject('bad_progress_state',
            jsonb_build_object('state', v_prog->>'state'));
        end if;
        v_n := coalesce((v_prog->>'add')::bigint, 0);
        if v_n < 0 or v_n > c_max_progress_add then
          perform public.hr_reject('progress_clamp', jsonb_build_object('add', v_n));
        end if;
        -- ── COMPANION XP (2026-10-12-companion-xp-frac.sql) ─────────────────
        --    An EXACT prefix, never `like` (`_` would match any character), and
        --    hr_state_of projects companions with the same prefix (§3).
        --    (1) ONLY THE EQUIPPED PET earns: the engine credits exactly
        --        player_state.companion_equipped (version-bumped by
        --        hr_companion_equip, so its read and this check see one pet);
        --        an op for any other id has no honest source. REFUSED, as the
        --        companion_xp_frac key is (Security, 2026-10-13 #2).
        --    (2) THE CAP: CLAMPED, not refused, and journalled: the engine
        --        clamps to the same headroom, so an honest op never reaches
        --        this, and refusing a whole settle over the pet's last few XP
        --        would cost the player the window's loot. A row already over
        --        the cap is never reduced here. The journal ACCUMULATES per key
        --        (proposed and credited summed, the first clamp's `had` kept):
        --        a folded chain can cross the cap on its second op of the same
        --        key, and a per-op overwrite would journal only the last
        --        (Security, 2026-10-13 #1).
        if v_prog->>'kind' = 'stat' and left(v_prog->>'key', 13) = 'companion_xp:' then
          if substring(v_prog->>'key' from 14) is distinct from v_st.companion_equipped then
            perform public.hr_reject('companion_not_equipped',
              jsonb_build_object('companion_id', left(substring(v_prog->>'key' from 14), 64)));
          end if;
          v_cxp_have := null;
          select pp.value into v_cxp_have from public.player_progress pp
           where pp.user_id = v_uid and pp.slot = v_slot and pp.kind = 'stat'
             and pp.key = v_prog->>'key' and pp.period_key = coalesce(v_prog->>'period', '');
          v_cxp_have := coalesce(v_cxp_have, 0);
          if v_cxp_have + v_n > c_companion_xp_cap then
            v_cxp_credit := greatest(0, c_companion_xp_cap - v_cxp_have);
            v_cxp_clamp := coalesce(v_cxp_clamp, '{}'::jsonb) || jsonb_build_object(v_prog->>'key',
              case when coalesce(v_cxp_clamp ? (v_prog->>'key'), false) then
                jsonb_build_object(
                  'proposed', (v_cxp_clamp #>> array[v_prog->>'key', 'proposed'])::bigint + v_n,
                  'had',      v_cxp_clamp #>  array[v_prog->>'key', 'had'],
                  'credited', (v_cxp_clamp #>> array[v_prog->>'key', 'credited'])::bigint + v_cxp_credit)
              else
                jsonb_build_object('proposed', v_n, 'had', v_cxp_have, 'credited', v_cxp_credit)
              end);
            v_n := v_cxp_credit;
          end if;
        end if;
        insert into public.player_progress as pp
          (user_id, slot, kind, key, period_key, value, state, updated_at)
        values (v_uid, v_slot, v_prog->>'kind', v_prog->>'key',
                coalesce(v_prog->>'period',''), v_n, v_prog->>'state', now())
        on conflict (user_id, slot, kind, key, period_key) do update
          set value = pp.value + v_n,
              -- A row already 'claimed' is terminal until its period rolls.
              state = case when pp.state = 'claimed' then pp.state
                           else coalesce(v_prog->>'state', pp.state) end,
              updated_at = now();
      end loop;
    end if;

    -- ── THE PET'S XP REMAINDER (2026-10-12-companion-xp-frac.sql) ─ ABSOLUTE.
    --    companionSpanGrant credits floor(remainder + 0.5 x actions) and
    --    carries the rest; this stores the rest on the pet's own row. Every
    --    key must be the EQUIPPED companion — the only pet a settle credits —
    --    and every value a number in [0,1): REFUSED, never clamped, exactly as
    --    xp_frac. An OVERWRITE: the engine proposes the absolute remainder.
    if p_delta ? 'companion_xp_frac' then
      if jsonb_typeof(p_delta->'companion_xp_frac') <> 'object' then
        perform public.hr_reject('bad_companion_xp_frac',
          jsonb_build_object('type', jsonb_typeof(p_delta->'companion_xp_frac')));
      end if;
      for k in select key from jsonb_each(p_delta->'companion_xp_frac') loop
        if k is distinct from v_st.companion_equipped then
          perform public.hr_reject('companion_not_equipped',
            jsonb_build_object('companion_id', left(k, 64)));
        end if;
        if jsonb_typeof(p_delta->'companion_xp_frac'->k) <> 'number'
           or (p_delta->'companion_xp_frac'->>k)::numeric < 0
           or (p_delta->'companion_xp_frac'->>k)::numeric >= 1 then
          perform public.hr_reject('bad_companion_xp_frac',
            jsonb_build_object('companion_id', k, 'value', p_delta->'companion_xp_frac'->k));
        end if;
        -- trunc, never round: round(0.9999996, 6) is 1, which the CHECK refuses.
        insert into public.player_progress as pp
          (user_id, slot, kind, key, period_key, value, state, xp_frac, updated_at)
        values (v_uid, v_slot, 'stat', 'companion_xp:' || k, '', 0, 'active',
                trunc((p_delta->'companion_xp_frac'->>k)::numeric, 6), now())
        on conflict (user_id, slot, kind, key, period_key) do update
          set xp_frac = excluded.xp_frac, updated_at = now();
      end loop;
    end if;

    -- ── PROGRESS CLAIM ─ the only path to 'claimed', and it requires the row
    --    introduced by 2026-08-11-apply-engine.sql
    --   to already be 'done'. `row_count` is the check: a claim that changes
    --   nothing is a claim of something that was not earned, or a double claim.
    if p_delta ? 'progress_claim' then
      if jsonb_typeof(p_delta->'progress_claim') <> 'array' then
        perform public.hr_reject('bad_progress_claim');
      end if;
      for v_prog in select value from jsonb_array_elements(p_delta->'progress_claim') loop
        update public.player_progress
           set state = 'claimed', updated_at = now()
         where user_id = v_uid and slot = v_slot
           and kind = v_prog->>'kind' and key = v_prog->>'key'
           and period_key = coalesce(v_prog->>'period','')
           and state = 'done';
        get diagnostics v_rows = row_count;
        if v_rows <> 1 then
          perform public.hr_reject('not_claimable',
            jsonb_build_object('kind', v_prog->>'kind', 'key', v_prog->>'key'));
        end if;
        -- THE LOGIN CLAIM IS RE-PRICED HERE (2026-10-16-login-reward.sql):
        -- under this apply's character lock, the period must be today, the
        -- claimed row must hold the server's streak and the delta's gold, gems
        -- and items must equal hr_login_price. Edge proposes; this disposes.
        if v_prog->>'kind' = 'daily' and v_prog->>'key' = 'login' then
          perform public.hr_login_claim_verify(v_uid, v_slot, coalesce(v_prog->>'period', ''), p_delta);
        end if;
      end loop;
    end if;

    -- ── ACTIVITY ─────────────────────────────────────────────────────────
    --    introduced by 2026-08-11-apply-engine.sql
    -- (Review R11.) Revision 2 gated the whole block on `v_act ? 'kind'`, so
    -- `{"activity":{"restart":true}}` skipped EVERY check and still reached the
    -- UPDATE, where `restart` resets active_since to now(). A caller could
    -- therefore restamp the activity clock — the input to accrual — without
    -- naming an activity, without a catalogue lookup and without the skill
    -- gate. `{"activity":{}}` was likewise accepted and did nothing, which is
    -- the "silently dropped effect" this contract explicitly refuses elsewhere.
    -- Now: an `activity` key means a complete, validated activity statement.
    v_act := p_delta->'activity';
    if p_delta ? 'activity' then
      if jsonb_typeof(v_act) <> 'object' then perform public.hr_reject('bad_activity'); end if;
      if not (v_act ? 'kind') then
        perform public.hr_reject('bad_activity',
          jsonb_build_object('why', 'activity requires kind; restart alone is not an activity'));
      end if;
      -- The activity statement is an ALLOWLIST (stances and stop rules left with
      -- the away model, 2026-10-22-hunt-sessions-delete-away.sql).
      if exists (select 1 from jsonb_object_keys(v_act) as t(ak)
                  where ak <> all (array['kind','id','restart'])) then
        perform public.hr_reject('bad_activity', jsonb_build_object('why', 'unknown activity key'));
      end if;
      if (v_act ? 'restart') and jsonb_typeof(v_act->'restart') <> 'boolean' then
        perform public.hr_reject('bad_activity', jsonb_build_object('why', 'restart must be boolean'));
      end if;
      -- The (kind ⇔ id) invariant is a table CHECK, and hitting a CHECK yields
      -- an opaque 23514. Answer it here so a caller bug reads as a caller bug.
      if (v_act->>'kind' = 'idle') <> (nullif(v_act->>'id','') is null) then
        perform public.hr_reject('bad_activity');
      end if;
      if v_act->>'kind' <> 'idle' then
        -- NAMED HUNT (2026-10-20-hunts-start-gate.sql): a combat id that is a hunt
        -- is admitted iff the SERVER combat level reaches its band floor.
        if v_act->>'kind' = 'combat'
           and exists (select 1 from public.hr_hunts h where h.hunt_id = v_act->>'id') then
          perform public.hr_hunt_gate(v_uid, v_slot, v_act->>'id');
        elsif not exists (select 1 from public.hr_activities
                        where kind = v_act->>'kind' and activity_id = v_act->>'id') then
          perform public.hr_reject('unknown_activity',
            jsonb_build_object('kind', v_act->>'kind', 'id', v_act->>'id'));
        end if;
        -- Re-check the skill gate against SERVER xp. A forged local level buys
        -- nothing, including the right to start a level-90 node.
        if exists (
          select 1 from public.hr_activities a
           where a.kind = v_act->>'kind' and a.activity_id = v_act->>'id'
             and a.req_skill is not null and a.req_lv is not null
             and coalesce((select public.hr_level_from_xp(s.xp) from public.player_skills s
                            where s.user_id = v_uid and s.slot = v_slot
                              and s.skill_id = a.req_skill), 1) < a.req_lv)
        then
          perform public.hr_reject('activity_locked', jsonb_build_object('id', v_act->>'id'));
        end if;
      end if;
    end if;

    -- ── (4a-ii) THE GATHERING TOOL CARRY (b348) ──────────────────────────
    --    introduced by 2026-08-15-tool-carry.sql
    -- src/core/tools.js `advanceToolCarry` banks `qty x toolDouble` into a
    -- per-skill FRACTION and pays out whole units as they accrue, so a 10%
    -- tool pays exactly one bonus every ten actions instead of rolling for it.
    -- That determinism is the whole reason an away replay is byte-identical
    -- run to run, and it only survives across sessions if the remainder is
    -- stored. legacy.js:3841 renamed it out of `G._toolCarry` for exactly this
    -- column.
    --
    -- ⚠ IT IS AN ABSOLUTE, NOT A DELTA, and it is the only key here that is.
    --   Every other value in this contract is signed and added; a carry cannot
    --   be, because the engine computes the RESULTING remainder from a starting
    --   one it was handed, and adding two remainders would be arithmetic
    --   nobody defined. Stated here rather than inferred from the code.
    --
    -- ⚠ THE RANGE IS THE WHOLE CONTROL. A carry of 0.9 is legal; a carry of 900
    --   would be a 900-item mint on the first action of the next span, because
    --   `advanceToolCarry` floors it straight into a payout. So each value must
    --   be a number in [0,1) — refused, never clamped: there is no honest way
    --   for a carry to be out of range, and silently repairing an impossible
    --   value is how a compromised engine's bug becomes the server's opinion.
    if p_delta ? 'tool_carry' then
      v_carry := p_delta->'tool_carry';
      if jsonb_typeof(v_carry) <> 'object' then
        perform public.hr_reject('bad_tool_carry', jsonb_build_object('type', jsonb_typeof(v_carry)));
      end if;
      if (select count(*) from jsonb_object_keys(v_carry)) > c_max_carry_skills then
        perform public.hr_reject('too_many_carry_skills',
          jsonb_build_object('n', (select count(*) from jsonb_object_keys(v_carry))));
      end if;
      for k in select key from jsonb_each(v_carry) loop
        if length(k) not between 1 and 32
           or not exists (select 1 from public.hr_skills where skill_id = k) then
          perform public.hr_reject('unknown_skill', jsonb_build_object('skill_id', k));
        end if;
        if jsonb_typeof(v_carry->k) <> 'number'
           or (v_carry->>k)::numeric < 0 or (v_carry->>k)::numeric >= 1 then
          perform public.hr_reject('bad_tool_carry',
            jsonb_build_object('skill', k, 'value', v_carry->k));
        end if;
      end loop;
    end if;

    -- ── (4a-iii) THE IN-FLIGHT FIGHT (Phase 0) ───────────────────────────
    --    introduced by 2026-08-17-fight-carry.sql
    -- Carrying a partial fight across accrual windows is what stops a monster
    -- whose time-to-kill exceeds the window from paying ZERO forever. Measured
    -- (tools/probe-live-settle.mjs P3): a 520 HP dragon against mediocre
    -- offence takes ~488 ticks — about 20 minutes — for one kill. One 60-minute
    -- window pays 1 kill / 575 gold; sixty 60-second windows paid 0 kills /
    -- 0 gold / 0 XP, at every cadence, indefinitely.
    --
    -- ⚠ THE PROPOSAL IS CHECKED, NOT TRUSTED, and this is the whole reason the
    --   key exists in the delta contract rather than being written by the Edge
    --   Function directly. `hp` is re-clamped against the ACTUAL monster's HP
    --   re-derived from hr_activities here, in SQL, under the row lock — not
    --   against a maximum the engine sent alongside it. A forged `fight` is
    --   worth a mint otherwise: name the highest-value boss, claim 1 HP, and
    --   every window kills it on the first swing.
    --
    -- ⚠ REFUSED, NEVER CLAMPED. There is no honest way for the engine to
    --   propose 9,999 HP on a 520 HP dragon, and silently repairing an
    --   impossible value is how a compromised engine's bug becomes the server's
    --   opinion — the same posture as bad_tool_carry, and the same cost
    --   (`bad_fight*` is not on index.ts's DEGRADABLE list, so it 409s the
    --   window rather than shortening it).
    if p_delta ? 'fight' then
      v_fight := p_delta->'fight';
      if jsonb_typeof(v_fight) <> 'object' then
        perform public.hr_reject('bad_fight', jsonb_build_object('type', jsonb_typeof(v_fight)));
      end if;
      -- '{}' is the explicit VOID and is always legal — it is how the engine
      -- says "the fight ended", which a death, a stop and a monster on exactly
      -- 0 HP all are.
      if v_fight <> '{}'::jsonb then
        if exists (select 1 from jsonb_object_keys(v_fight) as t(fk)
                    where fk not in ('monster','hp','kills')) then
          perform public.hr_reject('bad_fight', jsonb_build_object('why', 'unknown key'));
        end if;
        -- ⚠ PRESENCE BEFORE TYPE, AND IT IS NOT BELT-AND-BRACES. Security
        --   F2, 2026-08-16: `jsonb_typeof(v_fight->'hp')` of an ABSENT key is
        --   SQL NULL, `NULL <> 'number'` is NULL, and `NULL or NULL or NULL`
        --   is NULL — so the type gate below never fired for a key that simply
        --   was not there. `{"monster":"dragon","kills":0}` was ACCEPTED, and
        --   because `(v_fight->>'hp')::numeric` is likewise NULL, every
        --   comparison in the CEILING CHECK was NULL too: the clamp was skipped
        --   entirely and a checkpoint with no HP at all was stored. It was an
        --   under-payment rather than a mint only because normaliseFight
        --   independently refuses a missing hp — i.e. the database's gate was
        --   decorative and the Edge Function was the only thing holding, which
        --   is the exact inversion of this file's whole posture.
        --   Three-valued logic is why a gate must test PRESENCE explicitly.
        if not (v_fight ? 'monster' and v_fight ? 'hp' and v_fight ? 'kills') then
          perform public.hr_reject('bad_fight', jsonb_build_object('why', 'missing key',
            'keys', (select coalesce(jsonb_agg(fk order by fk), '[]'::jsonb)
                       from jsonb_object_keys(v_fight) as t(fk))));
        end if;
        if jsonb_typeof(v_fight->'monster') <> 'string'
           or jsonb_typeof(v_fight->'hp') <> 'number'
           or jsonb_typeof(v_fight->'kills') <> 'number' then
          perform public.hr_reject('bad_fight', jsonb_build_object('why', 'shape'));
        end if;
        -- THE CEILING, RE-DERIVED. A non-combat activity id has a NULL max_hp
        -- by construction (the generator asserts both directions), so this same
        -- lookup also refuses a fight that names a tree or a recipe.
        select max_hp into v_fight_max from public.hr_activities
         where kind = 'combat' and activity_id = v_fight->>'monster';
        if v_fight_max is null then
          perform public.hr_reject('unknown_monster',
            jsonb_build_object('id', v_fight->>'monster'));
        end if;
        if (v_fight->>'hp')::numeric <> trunc((v_fight->>'hp')::numeric)
           or (v_fight->>'hp')::numeric < 1
           or (v_fight->>'hp')::numeric > v_fight_max then
          perform public.hr_reject('bad_fight_hp', jsonb_build_object(
            'id', v_fight->>'monster', 'hp', v_fight->'hp', 'max_hp', v_fight_max));
        end if;
        if (v_fight->>'kills')::numeric <> trunc((v_fight->>'kills')::numeric)
           or (v_fight->>'kills')::numeric < 0
           or (v_fight->>'kills')::numeric > c_max_fight_kills then
          perform public.hr_reject('bad_fight_kills',
            jsonb_build_object('kills', v_fight->'kills'));
        end if;
      end if;
    end if;

    -- ── (4a-iv) HIRED-WORKER PRODUCTION (worker-settlement slice) ─────────
    --    introduced by 2026-08-25-workers.sql
    -- A crew (player_workers) is server-owned — no client write policy — and
    -- gathers in PARALLEL to the active pointer on its OWN watermark. The engine
    -- proposes a `workers` sub-delta of PER-WORKER xp keyed by uid; each uid is
    -- re-validated HERE against the CALLER'S OWN crew, so a forged uid that names
    -- another player's worker (or one that does not exist) is refused, never
    -- silently credited. Worker xp is NEVER player xp and NEVER a player_skills
    -- row. The produced ITEMS ride the signed `items` map above, so the day
    -- budget already counted them; this block is xp only. The character row is
    -- already locked (for update above), so the membership read is a check, not a
    -- second lock.
    --    the death ledger row (2026-10-27 core rebuild: a death ends the hunt; there is no recovery line)
    -- (4a-d) THE DEATH LEDGER (rev. 2, N3). SHAPE ONLY, and refused rather than
    -- truncated: more than one death row means the engine proposed something the
    -- core model cannot produce (a death ends the hunt), and quietly writing the
    -- first of it would turn an engine bug into a plausible-looking audit trail. Every FIELD is
    -- re-derived server-side at (4z) from this array's own values, and the
    -- rows move no value, so there is nothing here to clamp - only to refuse.
    if p_delta ? 'deaths' then
      if jsonb_typeof(p_delta->'deaths') <> 'array' then
        perform public.hr_reject('bad_deaths', jsonb_build_object('type', jsonb_typeof(p_delta->'deaths')));
      end if;
      if jsonb_array_length(p_delta->'deaths') > c_max_death_rows then
        perform public.hr_reject('bad_deaths',
          jsonb_build_object('why', 'too many', 'n', jsonb_array_length(p_delta->'deaths'),
                             'limit', c_max_death_rows));
      end if;
      for v_death in select value from jsonb_array_elements(p_delta->'deaths') loop
        if jsonb_typeof(v_death) <> 'object' then
          perform public.hr_reject('bad_deaths', jsonb_build_object('why', 'not an object'));
        end if;
        if length(coalesce(v_death->>'monster', '')) > 64 then
          perform public.hr_reject('bad_deaths', jsonb_build_object('why', 'monster id too long'));
        end if;
      end loop;
    end if;

    --    introduced by 2026-09-08-hearthfind.sql
    -- (4a-h) THE HEARTHFIND. Shape first, then the catalogue, then the pair.
    if p_delta ? 'hearthfind' then
      v_hf := p_delta->'hearthfind';
      if jsonb_typeof(v_hf) <> 'object' then
        perform public.hr_reject('bad_hearthfind',
          jsonb_build_object('why', 'not an object', 'type', jsonb_typeof(v_hf)));
      end if;
      -- Unknown sub-keys are an error, not a shrug - the same rule the top-level
      -- delta follows. A field this arm does not implement must never look like
      -- it worked (there is deliberately no `one_in`, no `qty` and no `at`:
      -- the odds come from the catalogue and the instant comes from now()).
      if exists (select 1 from jsonb_object_keys(v_hf) as t(hk)
                  where hk <> all (array['item','source_kind','source_id','dropped'])) then
        perform public.hr_reject('bad_hearthfind',
          jsonb_build_object('why', 'unknown key',
            'keys', (select jsonb_agg(hk) from jsonb_object_keys(v_hf) as t(hk)
                      where hk <> all (array['item','source_kind','source_id','dropped']))));
      end if;
      -- `dropped` - THE DISCARD COUNT, VALIDATED LIKE ANY OTHER CLIENT NUMBER
      -- even though it can buy nothing. A second find inside ONE settled span is
      -- thrown away by the engine (hr_apply takes one find per apply and
      -- re-derives it); before this key the discard was SILENT, which is exactly
      -- the shape of a bug nobody can see. It is journalled at (4z-h) as a
      -- rejection row - aggregated per character/code/day by
      -- hr_record_rejection, never one row per event (the game_events lesson).
      if v_hf ? 'dropped' then
        if jsonb_typeof(v_hf->'dropped') <> 'number'
           or (v_hf->>'dropped') !~ '^[0-9]+$'
           or (v_hf->>'dropped')::bigint > 99 then
          perform public.hr_reject('bad_hearthfind',
            jsonb_build_object('why', 'dropped must be a non-negative integer <= 99',
                               'dropped', v_hf->'dropped'));
        end if;
        v_hf_drop := (v_hf->>'dropped')::int;
      else
        v_hf_drop := 0;
      end if;
      v_hf_item := v_hf->>'item';
      v_hf_kind := v_hf->>'source_kind';
      v_hf_src  := v_hf->>'source_id';
      if v_hf_item is null or v_hf_kind is null or v_hf_src is null then
        perform public.hr_reject('bad_hearthfind', jsonb_build_object('why', 'missing field'));
      end if;
      -- Bounded before they are used as lookup keys, so a megabyte string can
      -- never reach an index scan or a rejection payload.
      if length(v_hf_item) > 64 or length(v_hf_kind) > 16 or length(v_hf_src) > 64 then
        perform public.hr_reject('bad_hearthfind', jsonb_build_object('why', 'field too long'));
      end if;
      -- THE PAIR, THE TROPHY AND THE ODDS, ALL IN ONE LOOKUP. A source that does
      -- not exist, a trophy that is not a trophy, and a source paying the WRONG
      -- trophy are one refusal, because they are one question: is this find a
      -- thing the catalogue says can happen?
      select s.one_in, s.expected_hours, i.title_code, i.title_name
        into v_hf_one, v_hf_hours, v_hf_title, v_hf_titlename
        from public.hr_hearthfind_sources s
        join public.hr_hearthfind_items  i on i.item_id = s.item_id
       where s.source_kind = v_hf_kind and s.source_id = v_hf_src and s.item_id = v_hf_item;
      if v_hf_one is null then
        perform public.hr_reject('bad_hearthfind',
          jsonb_build_object('why', 'no such source/item pair',
                             'source_kind', v_hf_kind, 'source_id', v_hf_src, 'item', v_hf_item));
      end if;
      -- THE BAND, re-asserted at RUNTIME and not only at migration time, and
      -- STATED IN HOURS because that is the unit the Designer ruled in: oneIn is
      -- per roll and roll rates span >12x across the shipped sources, so a
      -- per-roll floor said nothing comparable (it is what let the staged goblin
      -- row become the best hearthfind farm in the game). §4(a) proves the
      -- stored rows are in band today; this proves it for THE ROW BEING PAID, so
      -- an out-of-band row that somehow reached the table pays nothing instead
      -- of paying a common trophy.
      if v_hf_hours is null or v_hf_hours < 100 or v_hf_hours > 400 then
        perform public.hr_reject('bad_hearthfind',
          jsonb_build_object('why', 'expected_hours outside the 100-400 band',
                             'expected_hours', v_hf_hours, 'one_in', v_hf_one));
      end if;
    end if;

    --    introduced by 2026-09-08-hearthfind.sql
    -- (4a-h2) THE ONE DOOR. A hearthfind trophy may NOT be minted through the
    -- ordinary `items` delta - not by this engine, not by any future one. The
    -- hearthfind arm is the only path that creates one, and it is the path that
    -- journals and broadcasts, so "broadcast what the ledger journalled" is true
    -- by construction. (A NEGATIVE items delta is untouched: a player may still
    -- spend or lose a trophy through whatever consumes it later.)
    if p_delta ? 'items' and jsonb_typeof(p_delta->'items') = 'object' then
      if exists (
        select 1 from jsonb_each_text(p_delta->'items') as t(ik, iv)
         where coalesce(nullif(iv,'')::bigint, 0) > 0
           and exists (select 1 from public.hr_hearthfind_items h where h.item_id = t.ik)) then
        perform public.hr_reject('bad_hearthfind',
          jsonb_build_object('why', 'a hearthfind trophy cannot be minted through items'));
      end if;
    end if;

    -- ── (4a-b) CONSUMABLE BUFFS ─────────────────────────────────────────
    --    introduced by 2026-09-13-consumable-buffs.sql
    -- The client/engine names an ITEM. Everything else is server-derived:
    --   type, magnitude, duration ← hr_item_buffs (generated from src/data)
    --   until                     ← now() + duration × c_buff_scale, capped
    -- and the merge is by TYPE, never a replace, so a weaker dish cannot dilute a
    -- Feast and a second helping EXTENDS the tail instead of restarting it.
    if p_delta ? 'buff_apply' then
      if jsonb_typeof(p_delta->'buff_apply') <> 'object' then
        perform public.hr_reject('bad_buff_item',
          jsonb_build_object('why', 'not an object',
                             'type', jsonb_typeof(p_delta->'buff_apply')));
      end if;
      -- ⚠ THE FORGERY REFUSAL, BY NAME. A `buff_apply` carrying `until`,
      --   `magnitude`, `type`, `duration_ms` or anything else is REFUSED — not
      --   silently ignored. "Ignored today" is one careless future edit away from
      --   "read tomorrow"; refused by name is a property a reviewer can see and a
      --   test can fire. This is the line that makes the buff clock unforgeable.
      if exists (select 1 from jsonb_object_keys(p_delta->'buff_apply') as t(bk)
                  where t.bk <> 'item') then
        -- bad_buff_shape (Security, 2026-09-13): its OWN code, so the rejections
        -- journal can classify "a caller invented a field" as an INCIDENT without
        -- also flagging every player who ate a Trout. `why` stays for continuity
        -- and the key list stays with it — the same refusal, named honestly.
        perform public.hr_reject('bad_buff_shape',
          jsonb_build_object('why', 'forbidden_key',
            'keys', (select jsonb_agg(t.bk) from jsonb_object_keys(p_delta->'buff_apply') as t(bk)
                      where t.bk <> 'item')));
      end if;
      if jsonb_typeof(p_delta->'buff_apply'->'item') <> 'string' then
        perform public.hr_reject('bad_buff_item',
          jsonb_build_object('why', 'item is not a string',
                             'type', jsonb_typeof(p_delta->'buff_apply'->'item')));
      end if;
      v_buff_item := p_delta->'buff_apply'->>'item';
      select b.type, b.magnitude, b.duration_ms
        into v_buff_type, v_buff_mag, v_buff_dur
        from public.hr_item_buffs b where b.item_id = v_buff_item;
      if not found then
        -- An unknown item id, OR a real item that carries no buff (a Trout, a
        -- bronze sword). One code for both: from the server's side they are the
        -- same statement — "there is no buff to apply for that".
        perform public.hr_reject('bad_buff_item', jsonb_build_object('item', v_buff_item));
      end if;

      -- ── (4a-b2) THE BUFF MUST BE PAID FOR (F3, Security 2026-09-13) ──────
      --    introduced by 2026-09-13-buff-apply-coupling.sql
      -- The SAME delta must spend exactly one of the item. The `items` block above
      -- is the possession check — it takes `for update` on the inventory row and
      -- refuses `insufficient_item` when the stack cannot cover the debit — so this
      -- is a COUPLING, not a second check: the buff and its cost are inseparable
      -- because hr_apply is all-or-nothing.
      --
      -- WHY NOT "does the player own one": a bare existence read is TOCTOU-prone
      -- AND makes the buff free (you would buff off a stack you keep). The debit is
      -- the only form of the question that is both locked and honest.
      --
      -- EXACTLY -1: a buff is one serving. `-2` would mean either a second buff the
      -- merge rules never saw or a double debit; "eat three at once" is a design
      -- change and must arrive as one. coalesce() on every jsonb_typeof because
      -- `null <> 'object'` is NULL, and an `if NULL then` does NOT refuse — the
      -- shape of a check that passes everything while reading like a control.
      if coalesce(jsonb_typeof(p_delta->'items'), '') <> 'object'
         or coalesce(jsonb_typeof(p_delta->'items'->v_buff_item), '') <> 'number'
         or (p_delta->'items'->>v_buff_item)::numeric <> -1 then
        perform public.hr_reject('buff_not_paid',
          jsonb_build_object('item', v_buff_item, 'need', -1,
                             'got', p_delta->'items'->v_buff_item));
      end if;

      v_buff_now := now();                                    -- SERVER CLOCK, always
      v_buff_cap := v_buff_now + make_interval(secs => c_buff_max_ms / 1000.0);
      -- The LIVE entry of this type on the locked row, if any. `until > now()` so
      -- an expired entry cannot extend anything: a buff that ran out yesterday
      -- must not make today's pie last two hours.
      -- PER-SEGMENT STACKING (2026-09-13). The new segment starts at the latest
      -- expiry among live segments of this type that are AT LEAST AS STRONG — so a
      -- weaker dish waits its turn behind the Feast, and a stronger one starts NOW.
      -- `until > v_buff_now` throughout: an expired segment can never extend
      -- anything, or a buff that ran out yesterday would make today's pie last two
      -- hours.
      select max((e.v->>'until')::timestamptz) into v_buff_base
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
       where e.v->>'type' = v_buff_type
         and (e.v->>'until')::timestamptz > v_buff_now
         and (e.v->>'magnitude')::numeric >= v_buff_mag;
      v_buff_base := greatest(v_buff_now, coalesce(v_buff_base, v_buff_now));

      -- THE SEGMENT BUDGET (cost fuse). Counted over LIVE segments of this type
      -- only, so an expired stack costs nothing. A REFUSAL, never a silent drop:
      -- spending food for nothing is the outcome the ruling forbids by name.
      select count(*) into v_buff_segs
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
       where e.v->>'type' = v_buff_type
         and (e.v->>'until')::timestamptz > v_buff_now;
      if v_buff_segs >= c_buff_max_segments then
        perform public.hr_reject('buff_at_max',
          jsonb_build_object('type', v_buff_type, 'why', 'segment_budget',
                             'segments', v_buff_segs, 'limit', c_buff_max_segments));
      end if;

      -- THE TWIN: the segment this one would be contiguous with AND identical to.
      -- A same-magnitude re-eat is ONE longer segment, not two — otherwise a
      -- player topping up the same dish would fill the budget with duplicates of
      -- the same number.
      select e.v into v_buff_same
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
       where e.v->>'type' = v_buff_type
         and (e.v->>'magnitude')::numeric = v_buff_mag
         and (e.v->>'until')::timestamptz = v_buff_base
       limit 1;
      -- ⚠ buff_at_max (game-designer, 2026-09-13). If the cap would swallow (all
      --   but a token sliver of) the duration there is nothing worth buying, so
      --   REFUSE the consume instead of eating the item for nothing. A PARTIAL
      --   clamp still applies — a consume that fits most of the way still buys the
      --   minutes that fit; only one that would buy less than
      --   c_buff_min_gain_frac of what it promises is refused. See the declare
      --   block for why this is a FRACTION and not `base >= cap` (that form is
      --   unreachable outside a single transaction, and it was MEASURED as such).
      -- ── THE CELLAR (2026-09-13 step 3) ───────────────────────────────────
      --    introduced by 2026-09-13-buff-cellar-scale.sql
      -- The duration multiplier this character has EARNED, read here, inside the
      -- lock, from the server's own rows. There is no delta key for it: the shape
      -- check above admits `item` and nothing else, so a caller that invents
      -- `scale` is refused bad_buff_shape before this line is reached.
      --
      -- hr_unlock_levels is the SAME source hr_perks_of builds its `rooms` key
      -- from, so this is not a third truth about what a character owns; it is read
      -- directly rather than through hr_perks_of because that function also
      -- aggregates renown and the recipe gate, none of which is a buff duration,
      -- and this runs on the write path with the row locked.
      select coalesce(max(u.level), 0) into v_buff_rung
        from public.hr_unlock_levels(v_uid, v_slot) u
       where u.unlock_id = 'room:cellar';
      -- `level <= the rung owned`, max: a rung payload REPLACES the rung below it,
      -- the catalogue proves the cellar ladder is contiguous and non-decreasing,
      -- and this form CLAMPS a stored rung above the ladder instead of raising on
      -- the write path. No row, no cellar, no bonus — 0, never null.
      select coalesce(max((rp.perks->>'buffDuration')::numeric), 0) into v_buff_bonus
        from public.hr_room_perks rp
       where rp.room_id = 'cellar' and rp.level <= v_buff_rung;
      -- The fuse, and the floor: a perk may only ever LENGTHEN a buff, so a
      -- negative or absent bonus can never shorten one below the catalogue value.
      v_buff_scale := least(greatest(c_buff_scale * (1 + coalesce(v_buff_bonus, 0)),
                                     c_buff_scale), c_buff_scale_max);
      v_buff_gain := greatest(0, floor(extract(epoch from (v_buff_cap - v_buff_base)) * 1000))::bigint;
      v_buff_need := ceil((v_buff_dur * v_buff_scale) * c_buff_min_gain_frac)::bigint;
      if v_buff_gain < v_buff_need then
        perform public.hr_reject('buff_at_max',
          jsonb_build_object('type', v_buff_type, 'until', v_buff_base,
                             'cap', v_buff_cap, 'max_ms', c_buff_max_ms,
                             'gain_ms', v_buff_gain, 'need_ms', v_buff_need));
      end if;
      -- THE SCALED EXPIRY. The 60-minute ceiling is applied AFTER the scale and is
      -- unchanged by it: a perk lengthens what a consume BUYS, it never raises the
      -- ceiling a queue may stand on.
      v_buff_until := least(v_buff_base
                              + make_interval(secs => (v_buff_dur * v_buff_scale) / 1000.0),
                            v_buff_cap);
      -- THE NEW MAGNITUDE IS THE FOOD'S OWN, and that is the whole ruling:
      -- `max(old, new)` let a 12-gold Roasted Carrot extend a 2,600-gold elixir's
      -- +5% by its own two minutes. A cheap food can now only ever write a cheap
      -- segment.
      v_buff_newmag := v_buff_mag;
      -- THE REBUILT QUEUE — one pass, and the WHERE clause IS the ruling:
      --   · another type                        -> kept if still live, untouched
      --   · this type, magnitude >= the new one  -> kept (the new one is behind it)
      --   · this type, weaker, expiring AFTER the new segment -> kept, it resumes
      --   · this type, weaker, covered by the new segment -> DROPPED (wall-clock:
      --     its time passed while the stronger effect ran)
      --   · the twin from 2b (same magnitude, contiguous) -> dropped here and
      --     re-added below as one EXTENDED segment
      -- ⚠ THIS PREDICATE IS THE ONE PRODUCTION APPLIED, and it stays that way.
      --   A later edit made the second branch re-test the type; the file
      --   early-returns on re-apply, so the edit never reached the database and the
      --   repo stopped matching production (live-hash --codediff: 35 chars). The
      --   applied file's payload must stay byte-honest, so the rewrite lives in
      --   2026-09-13-buff-segments-predicate.sql instead. The two predicates are
      --   EQUIVALENT — proven by execution over the full cross-product in that
      --   file's §4 — so this is a readability/robustness convergence, not a
      --   behaviour change.
      select coalesce(jsonb_agg(e.v order by (e.v->>'until')::timestamptz), '[]'::jsonb)
        into v_buffs_new
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
       where (e.v->>'until')::timestamptz > v_buff_now
         and (((e.v->>'type') <> v_buff_type)
              -- THE SECOND BRANCH RE-TESTS THE TYPE. Logically redundant — the first
              -- disjunct already covers every other-type row, and §4(b) proves the two
              -- forms select identically over the whole cross-product — but the old
              -- form's conditions read as if they applied to EVERY row, so an edit to
              -- the first branch changed other-type handling silently. That is not
              -- hypothetical: tests/buff-queue.mjs's merge_replaces_other_types
              -- mutation was INVISIBLE under the old form and bites under this one.
              or ((e.v->>'type') = v_buff_type
                  and not (v_buff_same is not null and e.v = v_buff_same)
                  and ((e.v->>'magnitude')::numeric >= v_buff_mag
                       or (e.v->>'until')::timestamptz > v_buff_until)));
      -- `scale` is carried on the segment so the player can be TOLD why their buff
      -- is long ("+100% from the Cellar") instead of having to trust a number they
      -- cannot see. It is DISPLAY ONLY: the duration it bought is already inside
      -- `until`, src/core/buffs.js ignores unknown fields, and nothing multiplies
      -- by it — doing so would pay the Cellar twice.
      v_buffs_new := v_buffs_new || jsonb_build_array(jsonb_build_object(
        'type', v_buff_type,
        'magnitude', v_buff_newmag,
        'until', to_jsonb(v_buff_until),
        'scale', to_jsonb(v_buff_scale),
        -- THE SEGMENT'S START (2026-09-28-buff-segment-from.sql, Security F3). The
        -- engine pays a segment only from here on: without it a Feast eaten at the
        -- instant of return priced the whole absence. A same-magnitude re-eat that
        -- extends its twin keeps the twin's start (the segment it lengthens began
        -- then); a twin written before this key existed starts at v_buff_now,
        -- which under-pays at most the settle-first residue, never over-pays.
        'from', to_jsonb(case when v_buff_same is not null
                              then least(v_buff_base,
                                         coalesce((v_buff_same->>'from')::timestamptz, v_buff_now))
                              else v_buff_base end)));
      -- CANONICAL ORDER: the stored array is sorted by expiry, always. Nothing
      -- DEPENDS on it (hr_state_of sorts its own projection and src/core/buffs.js
      -- picks the soonest expiry), which is precisely why it is pinned here: a row
      -- a human reads out of order is a row the next reader indexes wrongly — §3(b3)
      -- below did exactly that on the first draft, because the append put a
      -- just-started stronger segment AFTER an older weaker one.
      select coalesce(jsonb_agg(e.v order by (e.v->>'until')::timestamptz), '[]'::jsonb)
        into v_buffs_new from jsonb_array_elements(v_buffs_new) as e(v);
    end if;

    if p_delta ? 'workers' then
      if jsonb_typeof(p_delta->'workers') <> 'object' then
        perform public.hr_reject('bad_workers', jsonb_build_object('type', jsonb_typeof(p_delta->'workers')));
      end if;
      if (select count(*) from jsonb_object_keys(p_delta->'workers')) > c_max_worker_ops then
        perform public.hr_reject('too_many_worker_ops');
      end if;
      for k, v_eq in select key, value from jsonb_each(p_delta->'workers') loop
        if not exists (select 1 from public.player_workers
                        where user_id = v_uid and slot = v_slot and uid = k) then
          perform public.hr_reject('unknown_worker', jsonb_build_object('uid', k));
        end if;
        -- Each entry is { xp?:int, acc_ms?:number }: an xp DELTA (optional) and
        -- the per-worker fractional carry (an ABSOLUTE, like tool_carry). At least
        -- one must be present or the entry is meaningless.
        if jsonb_typeof(v_eq) <> 'object' or not (v_eq ? 'xp' or v_eq ? 'acc_ms') then
          perform public.hr_reject('bad_workers', jsonb_build_object('uid', k));
        end if;
        v_n := coalesce((v_eq->>'xp')::bigint, 0);
        -- Monotonic and clamped, exactly like a player-skill xp op.
        if v_n < 0 or v_n > c_max_xp_delta then
          perform public.hr_reject('xp_clamp', jsonb_build_object('uid', k));
        end if;
        -- THE CARRY IS RANGE-REFUSED, NEVER CLAMPED. A legit carry is < one
        -- perTickMs (< 130 s); anything at/above c_max_worker_acc is corruption,
        -- and silently repairing an impossible value is how a compromised engine's
        -- bug becomes the server's opinion (the bad_tool_carry / bad_fight posture).
        if v_eq ? 'acc_ms' then
          if jsonb_typeof(v_eq->'acc_ms') <> 'number'
             or (v_eq->>'acc_ms')::double precision < 0
             or (v_eq->>'acc_ms')::double precision >= c_max_worker_acc then
            perform public.hr_reject('bad_worker_carry',
              jsonb_build_object('uid', k, 'acc_ms', v_eq->'acc_ms'));
          end if;
        end if;
        -- xp is a DELTA (added); acc_ms is an ABSOLUTE (set). Absent acc_ms leaves
        -- the stored carry untouched.
        update public.player_workers
           set xp = xp + v_n,
               acc_ms = case when v_eq ? 'acc_ms'
                             then (v_eq->>'acc_ms')::double precision else acc_ms end
         where user_id = v_uid and slot = v_slot and uid = k;
      end loop;
    end if;

    -- ── (4b) THE LEDGER-DERIVED DAILY BUDGET (C5 / X3) ───────────────────
    --    introduced by 2026-08-11-apply-engine.sql
    -- The per-call clamps below are a blast radius for ONE call. Nothing
    -- restricts a compromised engine to one call — hr_rate_gate allows 30
    -- accrues/minute — so without a per-DAY ceiling the reachable rate is
    -- 518 BILLION XP/day, i.e. every skill in the game to 99 every two seconds.
    -- This is the ceiling. Design, numbers and the composition argument against
    -- the b307 per-absence cap: supabase/migrations/2026-08-11-daily-budget.sql.
    --
    -- WHERE IT SITS, AND WHY EXACTLY HERE:
    --   • AFTER the advisory lock and the `for update` above, so the sum and
    --     the row it will insert are inside one serialised critical section for
    --     this character. Two concurrent applies cannot both read a
    --     pre-insert world (hr_day_budget_used is VOLATILE — see its header).
    --   • AFTER the version check, so a stale caller pays `version_conflict`
    --     without a ledger scan.
    --   • AFTER the per-call clamps, and that ordering was decided by a test
    --     rather than by taste. With the budget checked first, the conservation
    --     fuzz's `gold_clamp` op — a deliberate 6.8e9-class delta — came back
    --     `daily_budget`, because the day's gold ceiling (25,000,000) is BELOW
    --     the per-call gold clamp (50,000,000). c_max_gold_delta would have
    --     become unreachable: a control that reads as a control in review and
    --     can never fire. Clamps answer "this ONE delta is insane"; the budget
    --     answers "you have had enough today". The specific diagnosis wins.
    --   • STILL INSIDE the protected block, before the state UPDATE and before
    --     the ledger row, so a breach rolls back everything the earlier blocks
    --     wrote through the same hr_reject/HR000 path as any other rejection.
    --     `daily_budget` never half-applies; the fuzz asserts that by
    --     reconciling after it.
    --   • GROSS inflow only. Netting a spend against a mint would give the
    --     budget a free reset button (mint 25M, buy something, mint again).
    --   • UNCONDITIONAL on journal.kind. `kind` is chosen by the caller; a
    --     budget that only counted kind='accrue' would be evaded by writing
    --     kind='trade'. Real transfers do not pass through hr_apply — market_buy
    --     credits gold itself and leaves gold_in NULL — so honest trading is
    --     not charged for this either.
    v_gold_in := greatest(0, coalesce((p_delta->>'gold')::bigint, 0));
    -- b351. GROSS gem inflow. `greatest(0, …)` is not decoration: a gem SPEND
    -- must not buy back budget, or "mint 5,000, spend them, mint again" is a
    -- reset button on the ceiling. Same reason gold is gross — daily-budget.sql,
    -- "GROSS INFLOW, NOT NET".
    v_gems_in := greatest(0, coalesce((p_delta->>'gems')::bigint, 0));
    -- The typeof guards keep a malformed delta reaching its OWN error below
    -- (bad_xp / bad_items) instead of erroring out of jsonb_each_text here with
    -- an sqlstate the handler does not cover.
    if jsonb_typeof(p_delta->'xp') = 'object' then
      select coalesce(sum(greatest(0, coalesce(nullif(value,'')::bigint, 0))), 0)
        into v_xp_in from jsonb_each_text(p_delta->'xp');
    end if;
    if jsonb_typeof(p_delta->'items') = 'object' then
      select coalesce(sum(greatest(0, coalesce(nullif(value,'')::bigint, 0))), 0)
        into v_qty_in from jsonb_each_text(p_delta->'items');
    end if;
    -- b351. GEMS IS APPENDED LAST rather than inserted next to gold, on
    -- purpose: every existing argument keeps its position, so a stale 5-argument
    -- call site fails LOUDLY with "function does not exist" instead of silently
    -- passing a gem count where an xp count is expected. The 5-argument overload
    -- is dropped in §8 for the same reason — an overload that skips a dimension
    -- is a ceiling somebody can call their way around.
    v_bud := public.hr_day_budget_check(v_uid, v_slot, v_gold_in, v_xp_in, v_qty_in, v_gems_in);
    if v_bud is not null then
      -- The detail carries used / add / limit / dim / day, so a fired fuse is
      -- diagnosable from the response alone. `daily_budget` is on the degrade
      -- ladder's DEGRADABLE list in hr-accrue/index.ts for the same reason
      -- bank_full is: halving the span reduces the proposed inflow, so an
      -- honest accrual that lands on the ceiling costs part of an absence
      -- rather than bricking the watermark.
      perform public.hr_reject('daily_budget', v_bud);
    end if;

    -- ── ACCRUAL WATERMARK (review S19) ───────────────────────────────────
    --    introduced by 2026-08-11-apply-engine.sql
    -- Revision 1 set accrued_to = now() AT APPLY TIME while the ticks had been
    -- computed from the READ time, so every round trip silently confiscated the
    -- elapsed milliseconds between the two — a few hundred per collect, forever.
    -- The caller now states the watermark it actually paid up to, and the server
    -- CLAMPS it into [old, now()]: it can never move backwards (which would pay
    -- the same seconds twice) and never into the future (which would pay for
    -- time that has not happened). "now" remains accepted as shorthand.
    v_accrued := v_st.accrued_to;
    if p_delta ? 'accrued_to' then
      if p_delta->>'accrued_to' = 'now' then
        v_accrued := now();
      else
        v_accrued := (p_delta->>'accrued_to')::timestamptz;
      end if;
      v_accrued := least(now(), greatest(v_st.accrued_to, v_accrued));
    end if;

    -- ── S5 (HALF) — AN EQUIPMENT OR ACTIVITY CHANGE CLOSES THE WINDOW ────
    --    introduced by 2026-08-11-apply-engine.sql
    -- docs/design/server-authority.md §3 "⚠ Under-payment is the only direction
    -- we are wrong in — THAT IS NOT TRUE": the accrual engine prices an absence
    -- with the equipment read at COLLECT time, so logging off naked and putting
    -- on best-in-slot before collecting is paid for the whole night at
    -- best-in-slot rates. Measured on an identical seed and window: 12.8x gold
    -- and 20x XP.
    --
    -- The close is structural rather than a rule the engine has to remember: any
    -- apply that changes equipment or the activity pointer ALSO stamps
    -- accrued_to = now(), so after an equip there is no unpaid window left for
    -- the new gear to be applied to. The exploit is not "detected", it is
    -- arithmetically empty.
    --
    -- ⚠ THE OTHER HALF IS NOT HERE, AND IT IS NOT MINE. This closes the
    --   OVER-payment. It creates a matching UNDER-payment if the engine changes
    --   equipment without collecting first — the elapsed time since the last
    --   watermark is forfeited. The intent surface must therefore COLLECT
    --   BEFORE IT EQUIPS, exactly as start_activity already collects the
    --   previous activity first (design §2, "Where each one runs"). That is a
    --   change in supabase/functions/hr-accrue, not in this file. It is safe to
    --   ship this half alone today ONLY because no client-reachable path can
    --   equip or start an activity yet; it must not stay alone past the first
    --   one that can.
    --
    --   Also still open: the fail-closed `active_since` rule (an activity with a
    --   NULL active_since must not be priced), which lives in accrual.js's
    --   preconditions and is likewise not this file's to make.
    if p_delta ? 'equip' or p_delta ? 'activity' or p_delta ? 'enchant' then
      v_accrued := now();
    end if;

    -- ── (4c) THE DAILY SETTLE STREAK (Slice 3) ───────────────────────────
    --    introduced by 2026-08-21-streak-state.sql
    -- Advanced from now() on any ACCRUAL delta — one that moves the watermark,
    -- i.e. carries `accrued_to`. A live settle, an away collect and a
    -- set_activity collect all carry it; a bare equip / enchant / market intent
    -- does not, and must not bump the streak. NEVER a client value: `d` is
    -- hr_utc_day_key(now()), and the "consecutive?" test compares the STORED day
    -- to hr_utc_day_key(now() - 1 day). There is no `present` field to forge.
    --   · first ever (streak_day_key null/'')  -> 1
    --   · same UTC day as the stored key        -> unchanged (idempotent)
    --   · stored key == yesterday's key         -> +1
    --   · any larger gap                        -> reset to 1
    v_new_streak := v_st.streak_days;
    v_streak_day := v_st.streak_day_key;
    if p_delta ? 'accrued_to' then
      v_streak_day := public.hr_utc_day_key(now());
      if v_st.streak_day_key is null or v_st.streak_day_key = '' then
        v_new_streak := 1;
      elsif v_st.streak_day_key = v_streak_day then
        v_new_streak := v_st.streak_days;
      elsif v_st.streak_day_key = public.hr_utc_day_key(now() - interval '1 day') then
        v_new_streak := v_st.streak_days + 1;
      else
        v_new_streak := 1;
      end if;
    end if;

    update public.player_state
       set gold = v_new_gold,
           -- CONSUMABLE BUFFS (2026-09-13): the queue rebuilt at (4a-b) from the
           -- LOCKED row + the server clock. Absent key = untouched; present = set.
           -- NOT voided by an `activity` key (see 3e).
           buffs = case when p_delta ? 'buff_apply' then v_buffs_new else buffs end,
           hp   = case when p_delta ? 'hp'
                       then greatest(0, least((public.hr_vitals_of(v_uid, v_slot)->>'max_hp')::int, coalesce((p_delta->>'hp')::int, hp)))
                       else hp end,
           active_kind  = coalesce(v_act->>'kind', active_kind),
           active_id    = case when v_act ? 'kind'
                               then nullif(v_act->>'id','') else active_id end,
           -- SECURITY F1 - THE ACTIVITY SWITCH STAMP. `active_since` is the
           -- instant this character started what it is doing NOW, and the
           -- not-in-combat end-cap in hr_credit_kills__ungated /
           -- hr_credit_combat_xp__ungated reads it as the moment a character
           -- STOPPED fighting. It used to move only on the client's `restart`
           -- flag, which the SERVER's own auto-stops do not send: accrual.js
           -- emits delta.activity = {kind:'idle', id:null} for an exhausted
           -- node, a knockout and a refused fight, so the pointer went idle
           -- while active_since stayed at the start of the fight. 12 of 36 live
           -- characters carried active_since < accrued_to on 2026-09-06, and
           -- against the end-cap that under-pays every attended credit until
           -- the next client declare.
           --   Stamp whenever the APPLIED pointer differs from the STORED one
           --   in EITHER field, from ANY caller. Both applied expressions are
           --   copied from this same UPDATE's active_kind / active_id
           --   assignments so the test cannot drift from what is written; a
           --   bare column reference in a SET list reads the OLD row, which is
           --   exactly the comparison wanted. `is distinct from` (not <>)
           --   because active_id is nullable and combat->idle is a transition
           --   TO null. `restart` stays as the first disjunct and keeps its
           --   meaning: re-stamp a SAME-activity restart, which no difference
           --   test can see. Server clock only.
           active_since = case when coalesce((v_act->>'restart')::boolean, false)
                                 or coalesce(v_act->>'kind', active_kind) is distinct from active_kind
                                 or (case when v_act ? 'kind'
                                          then nullif(v_act->>'id','') else active_id end)
                                    is distinct from active_id
                               then now() else active_since end,
           -- ATTENDED-XP SPAN STAMP (2026-09-17). THE SETTLE STATES WHAT IT
           -- JUST PRICED, so hr_credit_combat_xp can top the same span up to the
           -- attended rate ONCE instead of leaving it at the away rate. Three
           -- SERVER values: the OLD watermark (v_st.accrued_to, read under this
           -- function's own `for update`), the NEW one (v_accrued, already
           -- clamped into [old, now()] above), and the COMBAT XP THIS VERY DELTA
           -- IS APPLYING - i.e. what the away simulation paid. Nothing here is
           -- client-supplied: p_delta->'xp' is the ENGINE's proposal, and it is
           -- read only to be SUBTRACTED later, so inflating it can only make the
           -- top-up SMALLER.
           --   Bounds: only a span LONGER than the 180 s settle-first threshold
           --   (a shorter one never produced the refusal this exists to
           --   complete) and NO LONGER THAN ONE HOUR (beyond that the player
           --   genuinely was away and the away price is the right one) is
           --   stamped. EVERY other delta - an equip, a market intent, a short
           --   settle, a settle that moved nothing - sets this to NULL, so a
           --   span cannot outlive the round trip that made it.
           combat_settle_span = case
             when p_delta ? 'accrued_to'
              and v_accrued > v_st.accrued_to
              and floor(extract(epoch from (v_accrued - v_st.accrued_to)) * 1000)::bigint > 180000
              and floor(extract(epoch from (v_accrued - v_st.accrued_to)) * 1000)::bigint <= 3600000
             then jsonb_build_object(
                    'from', v_st.accrued_to,
                    'to',   v_accrued,
                    'sim_xp', (select coalesce(sum(greatest(0, coalesce(nullif(value,'')::bigint, 0))), 0)
                                 from jsonb_each_text(case when jsonb_typeof(p_delta->'xp') = 'object'
                                                           then p_delta->'xp' else '{}'::jsonb end)
                                where key = any(array['melee','ranged','magic','defense','prayer'])))
             else null end,
           accrued_to   = v_accrued,
           -- worker-settlement slice: the crew's own watermark. Advanced to
           -- now() whenever the delta carries it (the engine sends 'now'); the
           -- value is not trusted — now() is the server clock. Absent = untouched.
           rested_xp = case when p_delta ? 'rested_xp'
                            then least(120, greatest(0, coalesce((p_delta->>'rested_xp')::bigint, rested_xp)))
                            else rested_xp end,
           rested_at = case when p_delta ? 'rested_at'
                            then least(now(), greatest(rested_at, coalesce((p_delta->>'rested_at')::timestamptz, rested_at)))
                            else rested_at end,
           workers_accrued_to = case when p_delta ? 'workers_accrued_to'
                                     then now() else workers_accrued_to end,
           -- Slice 3: the daily settle streak, advanced above from now() on an
           -- accrual delta only. A non-accrual delta leaves both columns as-is.
           streak_days    = case when p_delta ? 'accrued_to' then v_new_streak else streak_days end,
           streak_day_key = case when p_delta ? 'accrued_to' then v_streak_day else streak_day_key end,
           -- b348: an ABSOLUTE, validated at (4a-ii). Absent key = untouched.
           tool_carry   = case when p_delta ? 'tool_carry'
                               then v_carry else tool_carry end,
           -- Phase 0: an ABSOLUTE, validated at (4a-iii). Absent key =
           -- untouched.
           -- ⚠ THE `activity` ARM IS FIRST AND IT IS UNCONDITIONAL. A delta
           --   that changes the activity VOIDS the fight even if it also
           --   carries a `fight` key, so the two cannot be combined into
           --   "switch away and keep the boss". This is the answer to the
           --   exploit question the design names: a player banks a nearly-dead
           --   dragon, switches to slimes, switches back — and the dragon is at
           --   full HP, because the switch that collected the partial also
           --   discarded it. It costs the honest player at most one partial
           --   fight per deliberate re-target.
           fight        = case when p_delta ? 'activity' then '{}'::jsonb
                               when p_delta ? 'fight'    then v_fight
                               else fight end,
           version      = version + 1,
           updated_at   = now()
     where user_id = v_uid and slot = v_slot;

    -- ── THE VOID (Phase 0) — the SECOND, INDEPENDENT half of the rule ────
    --    introduced by 2026-08-17-fight-carry.sql
    -- The CASE above is a statement about the DELTA. This is a statement about
    -- the ROW AS IT NOW STANDS, and it holds no matter which key wrote what: a
    -- fight may survive only while the character is still in combat AND still
    -- facing the same monster. It closes the case the delta arm cannot see —
    -- an activity that was changed by an earlier call, a row left inconsistent
    -- by an admin fix, a future delta key that moves the pointer without using
    -- 'activity'. Two mechanisms, neither load-bearing alone; a reviewer trying
    -- to bank a boss has to defeat both.
    --
    -- It can only ever REMOVE value, so it is safe to run unconditionally. No
    -- version bump: the row is already locked and the UPDATE above bumped it,
    -- and hr_state_of is read AFTER this, so the envelope reflects the void.
    update public.player_state
       set fight = '{}'::jsonb
     where user_id = v_uid and slot = v_slot
       and fight <> '{}'::jsonb
       and (active_kind is distinct from 'combat'
            or (active_id is distinct from (fight->>'monster')
                -- NAMED HUNT: the checkpoint may be on any of THIS hunt's spawns.
                and not exists (select 1 from public.hr_hunt_spawns hs
                                 where hs.hunt_id = player_state.active_id
                                   and hs.monster_id = player_state.fight->>'monster')));

    -- ── JOURNAL ─ ONE row per apply. Per-item rows would multiply the write
    --    introduced by 2026-08-11-apply-engine.sql
    --   volume of an idle game for detail `meta` already carries — and this
    --   repo has the receipt: game_events, 1.6M rows / 229 MB, six players,
    --   four days. A very large delta is summarised rather than stored whole,
    --   so one pathological call cannot write a megabyte.
    --
    --   AND ONE ROW IS NOT ENOUGH IF THE ROW IS HUGE (reliability RL2(b)).
    --   Revision 2 stored `p_delta - 'journal'` — the WHOLE proposed delta, up
    --   to 200 item keys plus farm ops plus progress ops — as meta. Measured
    --   projection: ~2.5× a game_events row, ×2 indexes, 600 MB/day at 600
    --   players. Rebuilding game_events under a new name is exactly the mistake
    --   this comment block was written to prevent.
    --
    --   What is kept is what a ledger is FOR: the value that moved. Gold, gems,
    --   items, xp and equipment transfers are recorded (they are the audit
    --   trail, and they are small — a real accrual apply touches 1-5 item
    --   kinds). Everything else is recorded as a KEY NAME only, because the
    --   authoritative record of it is the row it wrote: farm state is in
    --   player_farm, progress is in player_progress, the activity pointer and
    --   accrued_to are in player_state, and all of them are reachable from this
    --   row's timestamp. `k` is the list of those keys, so the ledger still
    --   says what kind of thing happened.
    v_j    := coalesce(p_delta->'journal', '{}'::jsonb);
    v_kind := coalesce(v_j->>'kind', 'admin');
    if v_kind <> all (c_ledger_kinds) then v_kind := 'admin'; end if;
    v_meta := jsonb_strip_nulls(jsonb_build_object(
      'g',  nullif(coalesce((p_delta->>'gold')::bigint, 0), 0),
      'm',  nullif(coalesce((p_delta->>'gems')::bigint, 0), 0),
      'i',  case when p_delta ? 'items'
                 and (select count(*) from jsonb_object_keys(p_delta->'items')) <= 24
                 then p_delta->'items' end,
      'x',  case when p_delta ? 'xp' then p_delta->'xp' end,
      -- THE LEVEL XP this apply credited (2026-10-27): the hunt fold's Level tally.
      'lx', case when p_delta ? 'level_xp' then p_delta->'level_xp' end,
      'e',  case when p_delta ? 'equip' then p_delta->'equip' end,
      -- THE BUFF SCALE THAT WAS USED, and only when a perk actually moved it
      -- (jsonb_strip_nulls drops the 1.0 case). NOT a new ledger row: one row per
      -- eaten pie is the game_events mistake — 1.6M rows / 229 MB, six players,
      -- four days — repeated at ledger scale. This makes "why was that buff long"
      -- answerable from the append-only journal for ~10 bytes on the applies that
      -- used a perk, and zero on the ones that did not.
      'bs', case when p_delta ? 'buff_apply' and coalesce(v_buff_scale, 1) <> 1
                 then to_jsonb(v_buff_scale) end,
      'k',  (select jsonb_agg(dk order by dk) from jsonb_object_keys(p_delta) as t(dk)
              where dk <> all (array['gold','gems','items','xp','level_xp','equip','journal']))
    ));
    -- If items were too numerous to itemise, say so with an aggregate rather
    -- than dropping the fact that a large transfer happened.
    if p_delta ? 'items' and not (v_meta ? 'i') then
      v_meta := v_meta || jsonb_build_object('i_n',
        (select count(*) from jsonb_object_keys(p_delta->'items')),
        'i_sum', (select sum(coalesce(nullif(value,'')::bigint, 0))
                    from jsonb_each_text(p_delta->'items')));
    end if;
    -- Backstop. Nothing above should be able to reach this, which is why it is
    -- 2 KB and not 8 KB: if it ever fires, the shape has regressed.
    if pg_column_size(v_meta) > 2000 then
      v_meta := jsonb_build_object('summary', true, 'bytes', pg_column_size(p_delta),
        'k', (select jsonb_agg(dk order by dk) from jsonb_object_keys(p_delta) as t(dk)));
    end if;
    -- THE COMPANION XP CAP CLAMPS this apply made (2026-10-12-companion-xp-frac.sql):
    -- an honest edge never reaches the cap clamp, so a `cxc` here is evidence.
    if v_cxp_clamp is not null then
      v_meta := v_meta || jsonb_build_object('cxc', v_cxp_clamp);
    end if;
    --
    --   THE THREE STAMP COLUMNS ARE THE DAILY BUDGET'S ONLY INPUT. They are
    --   written UNCONDITIONALLY, on every row hr_apply writes, from the same
    --   three variables the check at (4b) was made against — so what was
    --   checked and what is charged cannot disagree. NULL in these columns
    --   means "not written by hr_apply", which is exactly the set of rows
    --   (market_buy's seller credit, market_list's escrow) that must not
    --   consume progression budget.
    insert into public.player_ledger
      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
    values
      (v_uid, v_slot, v_kind, v_j->>'intent',
       coalesce((p_delta->>'gold')::bigint, 0),
       v_gold_in, v_xp_in, v_qty_in, 0,
       jsonb_build_object('delta', v_meta) || coalesce(v_j->'meta', '{}'::jsonb));
    -- ACCOUNT WALLET: the credit, journalled by the wallet as its OWN kind='wallet'
    -- row. gems_in lives THERE (0 above), so the account's day budget counts a
    -- gem once; v_gems_in still pre-checked it at (4b).
    if v_new_gems > 0 then
      v_wallet := public.hr_wallet_credit(v_uid, v_slot, v_new_gems,
                    'apply:' || (p_delta #>> '{journal,intent}'), now() + interval '8 days');
    end if;

    if p_delta ? 'deaths' then
      for v_death in select value from jsonb_array_elements(p_delta->'deaths') loop
        insert into public.player_ledger
          (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta)
        values
          (v_uid, v_slot, 'combat', 'death', 0, 0, 0, 0,
           jsonb_build_object(
             'monster',          left(coalesce(v_death->>'monster', ''), 64),
             'deaths_today',     coalesce((v_death->>'deaths_today')::bigint, 0),
             'deaths_lifetime',  coalesce((v_death->>'deaths_lifetime')::bigint, 0),
             'food_in_bag',      coalesce((v_death->>'food_in_bag')::boolean, false)));
      end loop;
    end if;

    if p_delta ? 'hearthfind' then
      --    introduced by 2026-09-08-hearthfind.sql
      -- (0) THE DISCARD, JOURNALLED. If the engine rolled more than one find in
      --     the span it settled, it proposes the first and reports the rest
      --     here. Recorded BEFORE the clamp and unconditionally, because the
      --     question "did a player ever lose a find to the one-per-apply rule?"
      --     must be answerable from the database rather than from an argument
      --     about probability. One aggregated row per character/code/day.
      if coalesce(v_hf_drop, 0) > 0 then
        perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'hearthfind_span_discard',
          jsonb_build_object('dropped', v_hf_drop, 'kept_item', v_hf_item,
                             'kept_source_kind', v_hf_kind, 'kept_source_id', v_hf_src));
      end if;
      -- (i) THE DAILY CLAMP, counted from the append-only journal - the only
      --     durable record - under the character lock. NOTE `now() at time zone
      --     'utc'`: the UTC day, matching the accrual engine's day key, never
      --     the server's local zone and never a client's.
      select count(*) into v_hf_today
        from public.player_ledger
       where user_id = v_uid and slot = v_slot and kind = 'hearthfind'
         and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
      if v_hf_today >= c_max_hf_per_day then
        -- DROPPED, NOT REFUSED. Refusing the apply would cost the player the
        -- whole window's accrual because they got lucky a fourth time. Recorded
        -- so a real ceiling breach is visible tomorrow, not just for a minute.
        perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'hearthfind_daily_cap',
          jsonb_build_object('today', v_hf_today, 'limit', c_max_hf_per_day,
                             'item', v_hf_item, 'source_kind', v_hf_kind, 'source_id', v_hf_src));
      else
        -- (ii) THE TROPHY. One unit, always: there is no quantity anywhere in
        --      this arm to inflate. Same upsert shape as the items delta.
        select qty into v_hf_have from public.player_inventory
          where user_id = v_uid and slot = v_slot and item_id = v_hf_item for update;
        insert into public.player_inventory as pi (user_id, slot, item_id, qty)
          values (v_uid, v_slot, v_hf_item, coalesce(v_hf_have, 0) + 1)
          on conflict (user_id, slot, item_id) do update set qty = excluded.qty;

        -- (ii-b) THE GLOBAL ORDINAL, and it is computed BEFORE the journal row
        --        is written so that "Nth ever found" counts the finds that came
        --        BEFORE this one, plus one. Counting after the insert would make
        --        the same expression mean something different depending on
        --        statement order - the kind of off-by-one a player screenshots.
        --        One index probe on player_ledger_hearthfind_item_idx; the whole
        --        index holds a handful of rows per realm-week.
        -- LIFETIME FACTS OFF THE LEDGER (2026-09-19) - fact 2, the GLOBAL
        -- ORDINAL. ALLOCATED, not counted: `insert ... on conflict do update
        -- ... returning` holds the counter row's lock across the read and the
        -- write, so two characters finding the same trophy in the same instant
        -- cannot both be told they were the Nth. The old body counted
        -- player_ledger, which (i) races and (ii) RESTARTS at the 90-day prune.
        -- Still computed BEFORE the journal row below, so "Nth ever" counts the
        -- finds that came before this one, plus one - the meaning has not moved.
        insert into public.hearthfind_ordinal as o (item_id, found_total, updated_at)
          values (v_hf_item, 1, now())
          on conflict (item_id) do update
            set found_total = o.found_total + 1, updated_at = now()
          returning o.found_total into v_hf_nth;

        -- THE DURABLE FIND ROW. Append-only and never pruned; `unique (item_id,
        -- nth_ever)` makes a duplicate ordinal a constraint violation rather
        -- than a shared bragging moment. This is also fact 1's storage.
        insert into public.hearthfind_log (user_id, slot, item_id, nth_ever)
          values (v_uid, v_slot, v_hf_item, v_hf_nth);

        -- (iii) THE JOURNAL. qty_in = 1 so the trophy enters the daily item
        --       budget like any other granted unit; gold_in/xp_in are ZERO and
        --       stay zero, because a find moves no gold and no XP - which is
        --       what tests/hearthfind-mint-guard.mjs asserts.
        insert into public.player_ledger
          (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, meta)
        values
          (v_uid, v_slot, 'hearthfind', 'hearthfind', v_hf_item, 1, 0, 0, 0, 1,
           jsonb_build_object('item', v_hf_item, 'source_kind', v_hf_kind,
                              'source_id', v_hf_src, 'one_in', v_hf_one,
                              'expected_hours', v_hf_hours,
                              'nth_ever', v_hf_nth,
                              'nth_today', v_hf_today + 1));

        -- (iv) THE BROADCAST, at most one row per 30 s per character. The
        --      trophy and the journal above are already written; only the public
        --      line is suppressed, so a suppressed broadcast never costs value.
        select max(found_at) into v_hf_last from public.world_finds
         where user_id = v_uid and slot = v_slot;
        if v_hf_last is null or v_hf_last < now() - c_hf_broadcast then
          insert into public.world_finds (user_id, slot, item_id, source_kind, source_id, one_in)
            values (v_uid, v_slot, v_hf_item, v_hf_kind, v_hf_src, v_hf_one);
        end if;

        -- (iv-b) THE COSMETICS. THE ONLY THING A FIND PAYS BESIDES THE TROPHY,
        --        and they are cosmetic by construction: player_cosmetics has no
        --        numeric column, nothing joins it to a rate, and no RPC reads it
        --        to decide an outcome. Ruling §6 - "pays a moment and nothing
        --        else": no gold, no XP, no renown, no gems, no stat.
        --
        --        WRITTEN HERE AND ONLY HERE, under the character lock, from the
        --        catalogue lookup above - never from the delta. A duplicate find
        --        re-broadcasts and pays nothing, which is exactly what the
        --        ON CONFLICT DO NOTHING expresses: the unlock is idempotent, so
        --        a replayed apply cannot double-grant and a second Emberheart
        --        cannot re-unlock Emberborn.
        select value into v_hf_plinth   from public.hr_hearthfind_meta where key = 'plinth_code';
        select value into v_hf_settitle from public.hr_hearthfind_meta where key = 'set_title_code';
        select value into v_hf_setname  from public.hr_hearthfind_meta where key = 'set_title_name';
        v_hf_cosm := '[]'::jsonb;

        insert into public.player_cosmetics (user_id, slot, kind, code, name)
          values (v_uid, v_slot, 'title', v_hf_title, v_hf_titlename)
          on conflict (user_id, slot, kind, code) do nothing;
        if found then
          v_hf_cosm := v_hf_cosm || jsonb_build_object('kind','title','code',v_hf_title,'name',v_hf_titlename);
        end if;

        -- THE PLINTH, on the character's FIRST find of any trophy. A flag, not a
        -- count: it unlocks the homestead display, and what stands on it is
        -- derived from the trophies the character holds.
        insert into public.player_cosmetics (user_id, slot, kind, code, name)
          values (v_uid, v_slot, 'plinth', v_hf_plinth, 'Hearth Plinth')
          on conflict (user_id, slot, kind, code) do nothing;
        if found then
          v_hf_cosm := v_hf_cosm || jsonb_build_object('kind','plinth','code',v_hf_plinth,'name','Hearth Plinth');
        end if;

        -- THE FULL SET. Counted as DISTINCT trophies from the append-only
        -- journal (including the row just written) against the catalogue's own
        -- trophy count - never a stored counter, which would be a second copy of
        -- a fact the ledger already holds and would drift on any prune.
        -- LIFETIME FACTS OFF THE LEDGER (2026-09-19) - fact 1, THE SET.
        -- Counted from hearthfind_log, which is not prunable. The old body
        -- counted player_ledger and its comment claimed a stored counter "would
        -- drift on any prune"; the read that drifts is the LEDGER one, and it
        -- would have made the full set unreachable for exactly the veterans who
        -- earned it. This is not a second copy of a fact: it is the FIRST
        -- durable copy, and the ledger keeps journalling beside it.
        select count(distinct item_id) into v_hf_set
          from public.hearthfind_log
         where user_id = v_uid and slot = v_slot;
        select count(*) into v_hf_setneed from public.hr_hearthfind_items;
        if v_hf_set >= v_hf_setneed then
          insert into public.player_cosmetics (user_id, slot, kind, code, name)
            values (v_uid, v_slot, 'title', v_hf_settitle, v_hf_setname)
            on conflict (user_id, slot, kind, code) do nothing;
          if found then
            v_hf_cosm := v_hf_cosm || jsonb_build_object('kind','title','code',v_hf_settitle,'name',v_hf_setname,'set',true);
          end if;
        end if;

        -- (v) THE RECEIPT. Attached to the apply's return value below, so an
        --     AWAY find comes back on the settle receipt and the client can
        --     reveal it on return without a second round trip. Server-authored
        --     in full: every field here was looked up or derived above.
        v_hf_out := jsonb_build_object(
          'item', v_hf_item, 'source_kind', v_hf_kind, 'source_id', v_hf_src,
          'one_in', v_hf_one, 'expected_hours', v_hf_hours,
          'nth_ever', v_hf_nth, 'nth_today', v_hf_today + 1,
          -- WHAT THIS FIND UNLOCKED, so the reveal can say it without a second
          -- round trip and without the client deciding what a find is worth.
          'unlocked', v_hf_cosm,
          'set_complete', (v_hf_set >= v_hf_setneed),
          'broadcast', (v_hf_last is null or v_hf_last < now() - c_hf_broadcast),
          'at', now());
      end if;
    end if;

    -- ── THE SERVER'S COUNTED RENOWN, RATCHETED HERE (2026-09-12) ─────────
    --    introduced by 2026-09-12-renown-high-projection.sql
    -- hr_claim_rank has always ratcheted `renown_high = greatest(renown_high,
    -- hr_renown_of(...))` and then decided the rank against it. Doing it ONLY at
    -- claim time left the number dark between claims, so the envelope had
    -- nothing honest to project and the headline fell back to the last PAID
    -- rank's threshold (measured live: 400 shown, 779 counted).
    --
    -- SOURCE: hr_renown_of, server-derived, client-credited kills already
    -- subtracted. NOTHING is read from p_delta — no client value reaches this
    -- statement, and the delta the engine proposed cannot influence it.
    -- DELIBERATELY NO `version = version + 1` and NO `updated_at = now()`: the
    -- apply owns the version bump, and a second bump here would manufacture
    -- version_conflict refusals against the very client that just settled.
    --
    -- ⚠ C1 (Security, 2026-09-12) — ITS OWN SUBTRANSACTION, AND IT IS NOT
    --   ALLOWED TO FAIL THE SETTLE. Bare, this sat inside hr_apply's
    --   write-bearing block above the handlers, so ANY raise inside
    --   hr_renown_of landed in the bad_delta handler and rolled back the WHOLE
    --   delta. hr_renown_of reads `streak_days` off a by-name whole-row cast of
    --   a column Slice 3 owns; the reviewer injected the same shape on
    --   `streak_day_key` and a 7,777-gold PAID settle came back ok:false with
    --   the gold unchanged. A DISPLAY high-water must never be able to eat a
    --   player's earnings, so the block swallows its own failure and the settle
    --   proceeds with a stale — never wrong — renown figure.
    --
    -- ⚠ RAISE-ONLY IN THE WHERE, not greatest() in the SET. Same monotonic
    --   result, but now `found` means EXACTLY "the high-water moved", which is
    --   what C2's journal keys on — and it removes the write amplification of
    --   rewriting the row on every apply when nothing changed.
    begin
      declare
        v_rh bigint;
      begin
        update public.player_state ps
           set renown_high = r.v
          from (select coalesce(public.hr_renown_of(v_uid, v_slot), 0) as v) r
         where ps.user_id = v_uid and ps.slot = v_slot
           and coalesce(ps.renown_high, 0) < r.v
        returning ps.renown_high into v_rh;
        -- ⚠ C2 (Security) — ONE LEDGER ROW PER REAL RAISE, AND ONLY PER RAISE.
        --   renown_high has no lowering path anywhere (every writer is a
        --   ratchet), and hr_claim_rank pays up to 1,000,000 gold + 500 gems
        --   against it, so an inflation that is never journalled is both
        --   undetectable and irreversible. This is the audit trail. It is NOT a
        --   per-tick log: a no-op apply updates no row, `found` is false, and
        --   nothing is written — which is the whole reason the raise-only WHERE
        --   above replaced greatest().
        if found then
          insert into public.player_ledger (user_id, slot, kind, intent, meta)
          values (v_uid, v_slot, 'renown', 'renown_ratchet',
                  jsonb_build_object('to', v_rh, 'intent_id', p_intent_id));
        end if;
      end;
    exception when others then
      raise warning 'renown ratchet skipped for %/%: %', v_uid, v_slot, sqlerrm;
    end;

    v_out := public.hr_state_of(v_uid, v_slot);
    -- What the wallet ACTUALLY paid (0 when another hero of the account already
    -- took this grant key), so no receipt can claim gems that did not land.
    if v_wallet is not null then
      v_out := v_out || jsonb_build_object('gems_paid', (v_wallet ->> 'paid')::bigint);
    end if;
    if v_hf_out is not null then
      v_out := jsonb_set(v_out, '{hearthfind}', v_hf_out);
    end if;

  exception
    -- Our own rejections. The block is rolled back; the envelope is built from
    -- the machine code and its detail payload.
    when sqlstate 'HR000' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
      v_out := jsonb_build_object('ok', false, 'error', v_msg)
               || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
    -- A malformed delta that reaches a cast or a constraint. Rolled back and
    -- reported rather than surfacing as a 500 — but NEVER silently: the
    -- sqlstate is returned so a caller bug is diagnosable from the response.
    when invalid_text_representation or invalid_datetime_format
      or numeric_value_out_of_range or division_by_zero
      or check_violation or not_null_violation or foreign_key_violation
      or unique_violation or datatype_mismatch then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_msg = message_text;
      v_out := jsonb_build_object('ok', false, 'error', 'bad_delta',
                                  'sqlstate', v_sqlstate, 'detail', v_msg);
  end;

  -- ── (5) Record the DECISION under the idempotency key. This statement is
  --    introduced by 2026-08-11-apply-engine.sql
  --        OUTSIDE the protected block, so it survives a rejection: a replay of
  --        a rejected intent returns the same rejection instead of re-running
  --        it. Only the decision is stored, never the state envelope (R5, and
  --        the reasoning is at step (3)) — on a success that is literally
  --        `{"ok": true}`.
  --
  --        ── ONE EXCEPTION: A VERSION CONFLICT RELEASES THE KEY (b346) ──────
  --    introduced by 2026-08-15-intent-key-hygiene.sql
  --        "Same key, same answer" is the right contract for a decision about
  --        the DELTA — a clamp, an insufficiency, an unknown id. The caller must
  --        change something, and changing the key is how it says "this is a new
  --        attempt". `version_conflict` is not that. It is a statement about the
  --        caller's READ: nothing was applied, the protected block rolled back
  --        in full, and the DEFINED recovery is "re-read and try again".
  --
  --        Storing it turns an ordinary concurrency outcome into a lockout for
  --        any caller whose key cannot change. Measured on this database
  --        2026-08-15, rolled back:
  --            (1) apply, stale version      -> {ok:false, version_conflict}
  --            (2) retry SAME key, CORRECT   -> {ok:false, version_conflict,
  --                                              replayed:true}
  --            (3) control, NEW key, CORRECT -> {ok:true}
  --        Same delta, same correct version; only the key differed. The accrual
  --        engine's key is DERIVED from (user, slot, watermark, version, salt)
  --        and a rejection does not move the watermark, so before this it could
  --        re-derive a byte-identical, permanently-refused key — for up to 25
  --        hours (hr_intents_prune, 17 * * * *, 24h window). The Edge side
  --        additionally puts `version` in that derivation; this is the half that
  --        also covers the CLIENT-chosen keys, which cannot re-derive anything.
  --
  --        NARROW ON PURPOSE. `v_claimed` means this call inserted the row, so a
  --        rejection returned from step (3) — including an intent_mismatch
  --        against a row recording somebody's SUCCESS — never reaches here and
  --        can never free that row. And only `version_conflict` is released:
  --        every other code is a decision about the delta and deserves the same
  --        answer on the same key.
  if v_claimed
     and coalesce(v_out->>'ok', 'false') <> 'true'
     and v_out->>'error' = any (c_release_codes) then
    delete from public.player_intents
     where user_id = v_uid and intent_id = p_intent_id;
  else
    update public.player_intents
       set result = case when coalesce(v_out->>'ok','false') = 'true'
                         then jsonb_build_object('ok', true)
                         else v_out end
     where user_id = v_uid and intent_id = p_intent_id;
  end if;

  -- ── (6) THE REJECTION RECORD (review R4). Also outside the protected block,
  --    introduced by 2026-08-11-apply-engine.sql
  --        and that is the entire point: the ledger insert that revision 2
  --        relied on for an audit trail sits INSIDE the block, so a rejection
  --        rolled it back and the only trace of a fired clamp was
  --        player_intents.result — which hr_intents_prune deletes after 24
  --        hours. The design says "treat any rejection as an incident"; an
  --        incident nobody can see the next morning is not one.
  --
  --        hr_record_rejection aggregates per (character, code, day) and
  --        classifies incident vs normal itself, so this is a bounded write —
  --        one UPSERT, not a row per rejection. See player-state.sql §6b-ii for
  --        why that shape and not a log.
  if coalesce(v_out->>'ok', 'false') <> 'true' then
    perform public.hr_record_rejection(
      v_uid, v_slot, coalesce(p_delta #>> '{journal,intent}', 'apply'),
      v_out->>'error', v_out - 'ok' - 'error');
  end if;

  -- ── (7) THE FRAME, FROM THE ENVELOPE THIS CALL ALREADY COMPUTED ────────
  --    introduced by 2026-09-23-frame-emit-from-apply.sql
  --        v_out IS the projection the client applies, built once at the end of
  --        the protected block. The push layer is handed it; it makes no second
  --        projection and re-reads no row, which is the whole of condition 8b.
  --
  --        THE GATE IS THE TRIGGER'S OLD `when` CLAUSE, EXACTLY. Step (4)
  --        refuses unless p_version equals the row's pre-write version, so
  --        `version is distinct from p_version` here is `new.version is
  --        distinct from old.version` there: a refusal, a replay and a write
  --        that moves no version all emit nothing.
  --
  --        AND A PUSH FAILURE MAY NEVER FAIL A PAYMENT. The value is written,
  --        journalled and recorded by the time this runs. hr_frame_send
  --        swallows its own failures; this second handler is what stands
  --        between a raise it could not swallow and a rolled-back payment.
  if coalesce(v_out->>'ok', 'false') = 'true'
     and (v_out->>'version')::bigint is distinct from p_version then
    begin
      perform public.hr_frame_send(v_uid, v_slot, v_out);
    exception when others then
      raise warning 'hr_apply: frame % for %/% not sent (%) — the write is committed anyway',
        v_out->>'version', v_uid, v_slot, sqlerrm;
    end;
  end if;

  return v_out;
end $function$;

-- ── hr_hunt_apply_member: one death ends the hunt (priced on the Level and the combat skills, Blessings first); Level XP bounded by the kills; the magic bound reads the hero's own max mana; no knockout ──
CREATE OR REPLACE FUNCTION public.hr_hunt_apply_member(p_instance uuid, p_user uuid, p_slot integer, p_session uuid, p_intent uuid, p_delta jsonb, p_hunt jsonb, p_analyzer jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- The combat skills a death costs (src/data/skills.js COMBAT_SKILLS); the Level is priced as `level`.
  c_xp_skills constant text[] := array['defense', 'magic', 'melee', 'prayer', 'ranged'];
  c_day_ms    constant bigint := 86400000;
  v_s     public.hunt_sessions%rowtype;
  v_ver   bigint;
  v_a     jsonb;
  v_h     jsonb;
  v_hunt  jsonb;
  v_to    timestamptz;
  v_dx    jsonb; v_nd int; v_el jsonb; v_k text; v_v jsonb;
  v_lost  jsonb := '{}'::jsonb; v_rate int;
  v_xp0   jsonb := '{}'::jsonb; v_ev0 bigint := 0;
  v_n bigint; v_cur bigint; v_lv int; v_lv0 int; v_fin int; v_fi int; v_r record;
  v_stam  jsonb; v_cap bigint; v_sat timestamptz; v_s0 bigint; v_e bigint;
  v_win bigint; v_paid bigint; v_nsw bigint; v_tick bigint;
  v_lx0 bigint; v_lxb bigint; v_base int; v_lvl int; v_xfloor bigint; v_vit jsonb; v_mana bigint; v_def bigint;
  v_buys jsonb; v_cost bigint := 0; v_units bigint := 0; v_items jsonb := '{}'::jsonb;
  v_price bigint; v_kind text; v_bk jsonb := '{}'::jsonb; v_day jsonb := '{}'::jsonb; v_ukind jsonb := '{}'::jsonb;
  v_cons int; v_off int; v_ammo_max int;
  v_gold_now bigint; v_cover jsonb; v_cgold bigint := 0; v_cunits bigint := 0; v_citems jsonb := '{}'::jsonb;
  v_unit bigint; v_avail bigint; v_supply jsonb; v_floor bigint;
  v_kills bigint; v_ground public.hr_hunt_grounds%rowtype; v_kmax bigint;
  v_vb_gold bigint; v_vb_xp bigint; v_vb_h bigint; v_vb_item text; v_magic bigint;
  v_unit_id int;
  v_bless jsonb;  -- the blessing hook's answer (hr_blessing_take, 2026-10-25-blessings.sql)
  v_loot  jsonb;  -- the loot filter's answer (hr_hunt_loot_rules, 2026-10-25-bag-rules.sql)
  v_end text; v_lk text; v_li text; v_home timestamptz; v_ok boolean;
begin
  if p_user is null or p_slot is null or p_session is null or p_intent is null
     or p_delta is null or jsonb_typeof(p_delta) <> 'object' or p_hunt is null or jsonb_typeof(p_hunt) <> 'object' then
    perform public.hr_reject('bad_arguments'); end if;
  -- (1) THE CHARACTER LOCK (hr_apply's key) and the session — of THIS instance.
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null or v_s.id <> p_session or v_s.instance_id <> p_instance then
    perform public.hr_reject('no_hunt', jsonb_build_object('session', p_session)); end if;
  -- (2a) THE STORED INDEX (a key that already landed falls through: hr_apply replays it).
  if jsonb_typeof(p_hunt->'swing_from') is distinct from 'number' or (p_hunt->>'swing_from') !~ '^[0-9]{1,15}$' then
    perform public.hr_reject('bad_swing'); end if;
  if (p_hunt->>'swing_from')::bigint <> v_s.swing_index
     and not exists (select 1 from public.player_intents i where i.user_id = p_user and i.intent_id = p_intent) then
    perform public.hr_reject('session_moved', jsonb_build_object('swing_index', v_s.swing_index)); end if;
  select version into v_ver from public.player_state where user_id = p_user and slot = p_slot;
  if v_ver is null then perform public.hr_reject('no_character'); end if;
  begin v_to := (p_hunt->>'to')::timestamptz;
  exception when others then perform public.hr_reject('bad_window'); end;
  if v_to is null then perform public.hr_reject('bad_window'); end if;

  -- (2b) THE PRICE OF THE DEATH, shape only: at most one death a settle (it ends the hunt),
  --      priced as `level` and the combat skills.
  v_dx := p_hunt->'death_xp';
  v_hunt := p_hunt - 'death_xp' - 'stamina' - 'buys' - 'cover' - 'unit_id' - 'tick_ms';
  v_nd := case when jsonb_typeof(p_delta->'deaths') = 'array' then jsonb_array_length(p_delta->'deaths') else 0 end;
  if v_dx is null and v_nd = 0 then v_dx := '[]'::jsonb; end if;
  if v_dx is null or jsonb_typeof(v_dx) <> 'array' or jsonb_array_length(v_dx) <> v_nd or v_nd > 1 then
    perform public.hr_reject('bad_death_xp'); end if;
  for v_el in select value from jsonb_array_elements(v_dx) loop
    if jsonb_typeof(v_el) <> 'object' then perform public.hr_reject('bad_death_xp'); end if;
    for v_k, v_v in select key, value from jsonb_each(v_el) loop
      if (v_k <> 'level' and v_k <> all (c_xp_skills)) or jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,12}$' then
        perform public.hr_reject('bad_death_xp'); end if;
      if (v_v #>> '{}')::bigint > 0 then
        v_lost := v_lost || jsonb_build_object(v_k, coalesce((v_lost->>v_k)::bigint, 0) + (v_v #>> '{}')::bigint);
      end if;
    end loop;
  end loop;
  if v_lost <> '{}'::jsonb then
    v_rate := public.hr_hunt_limit('death_xp_permille');
    v_base := public.hr_hunt_limit('death_xp_base');
    if v_rate is null or v_base is null then perform public.hr_reject('catalogue_missing'); end if;
  end if;
  -- (2c) THE STAMINA POOL, shape only; the start value is the DATABASE's.
  v_stam := p_hunt->'stamina';
  if v_stam is null or jsonb_typeof(v_stam) <> 'number' or (v_stam #>> '{}') !~ '^[0-9]{1,12}$' then
    perform public.hr_reject('bad_stamina'); end if;
  -- The cap over the window: premium_until only ever rises, so it is the
  -- larger of the caps at its two ends.
  v_cap := greatest(public.hr_stamina_cap(p_user, p_slot, v_s.settled_to), public.hr_stamina_cap(p_user, p_slot, v_to));
  if v_cap is null then perform public.hr_reject('catalogue_missing'); end if;
  select stamina_at, level_xp into v_sat, v_lx0 from public.player_state where user_id = p_user and slot = p_slot;
  if v_sat is not null and v_sat > v_s.settled_to then perform public.hr_reject('stamina_ahead'); end if;
  v_s0 := public.hr_stamina_of(p_user, p_slot, v_s.settled_to);
  -- (2d) THE STORE, shape only (re-priced and debited below).
  v_buys := coalesce(p_hunt->'buys', '{}'::jsonb);
  if jsonb_typeof(v_buys) <> 'object' or (select count(*) from jsonb_object_keys(v_buys)) > 20
     or exists (select 1 from jsonb_each(v_buys) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_buys'); end if;
  v_cover := coalesce(p_hunt->'cover', '{}'::jsonb);
  if jsonb_typeof(v_cover) <> 'object' or (select count(*) from jsonb_object_keys(v_cover)) > 64
     or exists (select 1 from jsonb_each(v_cover) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_cover'); end if;
  -- (2e) THE HERO'S UNIT and the analyzer tally, shape only.
  if p_hunt ? 'unit_id' and jsonb_typeof(p_hunt->'unit_id') <> 'null'
     and (jsonb_typeof(p_hunt->'unit_id') <> 'number' or (p_hunt->>'unit_id') !~ '^[0-9]{1,6}$') then
    perform public.hr_reject('bad_unit'); end if;
  v_unit_id := case when jsonb_typeof(p_hunt->'unit_id') = 'number' then (p_hunt->>'unit_id')::int end;
  if p_analyzer is not null and jsonb_typeof(p_analyzer) <> 'null'
     and (jsonb_typeof(p_analyzer) <> 'object'
          or exists (select 1 from jsonb_object_keys(p_analyzer) k where k not in ('dealt', 'taken', 'healed'))
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'dealt', '{}'::jsonb), array['byAbility', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'taken', '{}'::jsonb), array['byMonster', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'healed', '{}'::jsonb), array['bySource'])) then
    perform public.hr_reject('bad_analyzer'); end if;
  select * into v_ground from public.hr_hunt_grounds g where g.hunt_id = v_s.hunt_id;
  if not found then perform public.hr_reject('no_ground', jsonb_build_object('hunt', v_s.hunt_id)); end if;
  select coalesce(jsonb_object_agg(skill_id, xp), '{}'::jsonb) into v_xp0
    from public.player_skills where user_id = p_user and slot = p_slot and skill_id = any (c_xp_skills);
  select coalesce(max(id), 0) into v_ev0 from public.hunt_session_events where session_id = p_session;

  -- (3) THE VALUE HALF: hr_apply, every row it writes stamped with the session.
  perform set_config('hr.hunt_session', p_session::text, true);
  v_a := public.hr_apply(p_user, p_slot, v_ver, p_intent, p_delta);
  perform set_config('hr.hunt_session', '', true);
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    perform public.hr_reject(coalesce(v_a->>'error', 'apply_failed'), v_a);
  end if;
  if coalesce(v_a->>'replayed', 'false') = 'true' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;

  -- (4) THE KILL BOUND: the kills THIS settle's stamped rows journal, held to
  --     the ground's spawns times the respawns the window's time admits.
  v_win := floor(extract(epoch from (v_to - v_s.settled_to)) * 1000)::bigint;
  select coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then (l.meta->>'kills')::numeric else 0 end), 0)::bigint
    into v_kills
    from public.player_ledger l
   where l.session_id = p_session and l.kind <> 'hunt'
     and l.id > coalesce((select t.ledger_hwm from public.hunt_session_tally t where t.session_id = p_session), 0)
     and l.at >= now() - interval '25 hours';
  v_kmax := v_ground.spawns::bigint * (greatest(v_win, 0) / v_ground.respawn_ms + 2);
  if v_kills > v_kmax then
    perform public.hr_reject('kills_over', jsonb_build_object('kills', v_kills, 'max', v_kmax, 'window_ms', v_win));
  end if;
  -- (4c) THE VALUE BOUND, against the ground's own monsters.
  v_vb_h := public.hr_hunt_limit('value_headroom');
  select coalesce(max(b.gold_max), 0), coalesce(max(b.xp_max), 0) into v_vb_gold, v_vb_xp
    from public.hr_hunt_kill_bounds b
   where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id);
  -- THE MAGIC BOUND reads the hero's OWN max mana (hr_vitals_of): a full pool, then its regen at the
  -- Prayer rate plus the most a drink every lane restores, every minute; x the largest ability
  -- multiplier (hr_hunt_abilities) on top of the per-mana rate.
  v_vit := public.hr_vitals_of(p_user, p_slot);
  v_mana := (v_vit->>'max_mana')::bigint;
  v_magic := ceil((v_mana + (greatest(v_win, 0) / 60000 + 1)
                   * (ceil(v_mana * public.hr_hunt_limit('mana_regen_pct_min') * (v_vit->>'regen_pm')::int / 100000.0)
                      + public.hr_hunt_limit('drink_mana_per_min_max')))
                  * public.hr_hunt_limit('magic_xp_permille') / 1000.0
                  * greatest(1000, coalesce(public.hr_hunt_limit('magic_xp_mult_max'), 1000)) / 1000.0)::bigint;
  -- THE DEFENSE BOUND: every swing interval of the window, every foe the ground can engage at once
  -- (its spawns, at most a full box twice over), at the highest level it spawns, the block multiple.
  v_def := ceil((greatest(v_win, 0) / public.hr_hunt_limit('swing_interval_ms') + 1)
                * least(v_ground.spawns, 16)
                * coalesce((select max(public.hr_monster_level(sp.monster_id)) from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id), 0)
                * public.hr_hunt_limit('defense_xp_level_permille') / 1000.0 * public.hr_hunt_limit('block_mult'))::bigint;
  if jsonb_typeof(p_delta->'gold') = 'number' and (p_delta->>'gold')::numeric > v_kills * v_vb_gold * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'gold', 'gold', p_delta->'gold', 'kills', v_kills,
      'max', v_kills * v_vb_gold * v_vb_h)); end if;
  if jsonb_typeof(p_delta->'xp') = 'object'
     and (select coalesce(sum(greatest(0, (e.value #>> '{}')::numeric)), 0) from jsonb_each(p_delta->'xp') e
           where jsonb_typeof(e.value) = 'number') > ((v_kills + v_ground.spawns) * v_vb_xp + v_magic + v_def) * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'xp', 'kills', v_kills, 'spawns', v_ground.spawns,
      'max', ((v_kills + v_ground.spawns) * v_vb_xp + v_magic + v_def) * v_vb_h)); end if;
  -- THE LEVEL XP BOUND (kills only): the journalled kills x the most one kill of the ground pays.
  if jsonb_typeof(p_delta->'level_xp') = 'number' and (p_delta->>'level_xp')::numeric > v_kills * v_vb_xp * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'level_xp', 'level_xp', p_delta->'level_xp', 'kills', v_kills,
      'max', v_kills * v_vb_xp * v_vb_h)); end if;
  if jsonb_typeof(p_delta->'items') = 'object' then
    select e.key into v_vb_item from jsonb_each(p_delta->'items') e
     where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric > 0
       and (e.value #>> '{}')::numeric > v_kills * coalesce((
             select max(coalesce((b.drops->>e.key)::numeric, 0)) from public.hr_hunt_kill_bounds b
              where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id)), 0)
     limit 1;
    if v_vb_item is not null then
      perform public.hr_reject('value_over', jsonb_build_object('what', 'item', 'item', left(v_vb_item, 64),
        'qty', p_delta->'items'->v_vb_item, 'kills', v_kills)); end if;
  end if;

  -- (5a) THE STAMINA POOL, RE-PROVED AND WRITTEN (before the session half,
  --      whose `stamina` end proof reads this row). Every swing of a hunt drains
  --      (there is no knockout to rest in): P = swings x interval, the window is
  --      P to the millisecond, and E = max(0, S0 − P) exactly; an empty pool walks
  --      no swing.
  if jsonb_typeof(p_hunt->'paid_ms') is distinct from 'number'
     or jsonb_typeof(p_hunt->'swing_to') is distinct from 'number'
     or (p_hunt->>'paid_ms')::numeric not between 0 and 1e12
     or (p_hunt->>'swing_to')::numeric not between 0 and 1e15 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'shape')); end if;
  v_e    := (v_stam #>> '{}')::bigint;
  v_paid := (p_hunt->>'paid_ms')::numeric::bigint;
  v_nsw  := (p_hunt->>'swing_to')::numeric::bigint - v_s.swing_index;
  if v_win < 0 or v_nsw < 0 or v_paid > v_win or v_paid < v_win - 1 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'window', 'window_ms', v_win, 'paid_ms', v_paid)); end if;
  v_tick := public.hr_hunt_limit('swing_interval_ms');
  if v_tick is null or v_tick <= 0 or v_paid <> v_nsw * v_tick then
    perform public.hr_reject('bad_clock', jsonb_build_object('paid_ms', v_paid, 'swings', v_nsw, 'interval_ms', v_tick)); end if;
  if v_e <> greatest(0, v_s0 - v_paid) then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'bound', 'from_ms', v_s0, 'ms', v_e, 'paid_ms', v_paid)); end if;
  if v_s0 <= 0 and v_nsw > 0 then perform public.hr_reject('end_missing', jsonb_build_object('reason', 'stamina')); end if;
  update public.player_state set stamina_ms = v_e, stamina_at = v_to where user_id = p_user and slot = p_slot;

  -- (5b) THE STORE: sell-to-cover first, then every store use, priced by the
  --      catalogue, under the hero's own setting, capped, debited, journalled.
  v_supply := public.hr_hunt_supply_of(p_user, p_slot, v_s.preset);
  v_floor := (v_supply->>'gold_floor')::bigint;
  if v_cover <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_cover) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select c.unit into v_unit from public.hr_hunt_cover_items c where c.item_id = v_k;
      if v_unit is null then perform public.hr_reject('not_coverable', jsonb_build_object('item', v_k)); end if;
      -- NOTHING SELLS A LOCKED ITEM (hook: hr_item_locked; hr_hunt_member_read never offers one).
      if public.hr_item_locked(p_user, p_slot, v_k) then perform public.hr_reject('item_locked', jsonb_build_object('item', v_k)); end if;
      select least(
               coalesce((select pi.qty from public.player_inventory pi where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_k), 0),
               coalesce((select (t.loot->>v_k)::numeric from public.hunt_session_tally t where t.session_id = p_session), 0)::bigint
               + greatest(0, coalesce(case when jsonb_typeof(p_delta->'items'->v_k) = 'number' then (p_delta->'items'->>v_k)::numeric end, 0))::bigint
               - coalesce((select (t.covered->>v_k)::bigint from public.hunt_session_tally t where t.session_id = p_session), 0))
        into v_avail;
      if v_n > coalesce(v_avail, 0) then
        perform public.hr_reject('cover_over', jsonb_build_object('item', v_k, 'units', v_n, 'avail', v_avail)); end if;
      delete from public.player_inventory where user_id = p_user and slot = p_slot and item_id = v_k and qty = v_n;
      update public.player_inventory set qty = qty - v_n where user_id = p_user and slot = p_slot and item_id = v_k;
      v_citems := v_citems || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'unit', v_unit));
      v_cgold := v_cgold + v_n * v_unit;
      v_cunits := v_cunits + v_n;
      v_unit := null; v_avail := null;
    end loop;
    if v_cgold > 0 then
      update public.player_state set gold = gold + v_cgold where user_id = p_user and slot = p_slot;
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id)
        values (p_user, p_slot, 'hunt', 'vendor_cover', v_cgold, -v_cunits,
                jsonb_build_object('reason', 'vendor_cover', 'items', v_citems, 'gold', v_cgold), p_session);
      update public.hunt_session_tally t
         set covered = public.hr_jsonb_add(t.covered, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                          from jsonb_each(v_citems) i)),
             cover_gold = t.cover_gold + v_cgold
       where t.session_id = p_session;
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'cover', v_to, jsonb_build_object('n', v_cunits, 'gold', v_cgold));
    end if;
    -- Loot is sold only to pay the store: a window that sold and bought nothing is refused.
    if v_buys = '{}'::jsonb then perform public.hr_reject('cover_unspent'); end if;
  end if;
  -- THE LOOT FILTER (hook: hr_hunt_loot_rules): sell / ignore on pickup, online or not, after cover.
  v_loot := public.hr_hunt_loot_rules(p_user, p_slot, p_session, p_intent, p_delta->'items', v_to);
  v_cons := (select l.ms from public.hr_hunt_lanes l where l.lane = 'consumable' and l.active);
  v_off  := (select l.ms from public.hr_hunt_lanes l where l.lane = 'offense' and l.active);
  v_ammo_max := public.hr_hunt_limit('ability_ammo_max');
  if v_cons is null or v_off is null or v_ammo_max is null then perform public.hr_reject('catalogue_missing'); end if;
  -- Own uses per kind (the bag lines the session half will debit).
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_ukind from (
    select q.kind as k, sum((u.value #>> '{}')::bigint) as n
      from jsonb_each(case when jsonb_typeof(p_hunt->'uses') = 'object' then p_hunt->'uses' else '{}'::jsonb end) u
      join public.hr_hunt_supplies q on q.item_id = u.key
     where jsonb_typeof(u.value) = 'number' group by q.kind) a;
  if v_buys <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_buys) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select q.price, q.kind into v_price, v_kind from public.hr_hunt_basic_supplies q where q.basic_id = v_k;
      if v_price is null then perform public.hr_reject('not_for_sale', jsonb_build_object('item', v_k)); end if;
      -- THE STORE IS USED ONLY ON THE HERO'S OWN SETTING (spec §3.4 #5-7).
      if not (v_supply->>'supply_source' = 'store' or v_supply->>'on_empty' = 'switch') then
        perform public.hr_reject('store_off', jsonb_build_object('item', v_k)); end if;
      v_bk := v_bk || jsonb_build_object(v_kind, coalesce((v_bk->>v_kind)::bigint, 0) + v_n);
      v_items := v_items || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'price', v_price));
      v_cost := v_cost + v_n * v_price;
      v_units := v_units + v_n;
      v_price := null; v_kind := null;
    end loop;
    select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_day from (
      select q.kind as k, sum((x.value->>'qty')::bigint) as n
        from public.player_ledger l, jsonb_each(case when jsonb_typeof(l.meta->'items') = 'object' then l.meta->'items' else '{}'::jsonb end) x
        join public.hr_hunt_basic_supplies q on q.basic_id = x.key
       where l.user_id = p_user and l.slot = p_slot and l.kind = 'hunt' and l.intent = 'supply_buy'
         and l.at >= public.hr_utc_day_start(now()) group by q.kind) a;
    -- PER UTC DAY: the food-and-drink lane's buys, and the shots, over 24 h.
    if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_day->>'heal')::bigint, 0)
         + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_day->>'mana')::bigint, 0) > c_day_ms / v_cons + 1
       or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_day->>'ammo')::bigint, 0)
            > c_day_ms / v_tick + 1 + (c_day_ms / v_off + 1) * (v_ammo_max + 1) then
      perform public.hr_reject('too_many_buys', jsonb_build_object('why', 'day', 'bought', v_bk, 'today', v_day)); end if;
    -- THE FLOOR: after the window's coins and cover, the buys may not take gold below it.
    select gold into v_gold_now from public.player_state where user_id = p_user and slot = p_slot;
    if coalesce(v_gold_now, 0) - v_cost < v_floor then
      perform public.hr_reject('gold_short', jsonb_build_object('gold', v_gold_now, 'cost', v_cost, 'floor', v_floor)); end if;
    if v_cost > 0 then
      update public.player_state set gold = gold - v_cost where user_id = p_user and slot = p_slot;
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id)
        values (p_user, p_slot, 'hunt', 'supply_buy', -v_cost, -v_units,
                jsonb_build_object('reason', 'supply_buy', 'source', 'store', 'items', v_items, 'gold', v_cost), p_session);
      update public.hunt_session_tally t
         set bought = public.hr_jsonb_add(t.bought, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                        from jsonb_each(v_items) i)),
             supply_gold = t.supply_gold + v_cost
       where t.session_id = p_session;
    end if;
  end if;
  -- PER WINDOW, OWN + STORE TOGETHER: food and drink share ONE lane (consumable,
  -- consumables.js laneMs); a shot or a rune is at most one a swing (the ranged
  -- basic) plus every ability cast's on the offense lane.
  if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_ukind->>'heal')::bigint, 0)
       + coalesce((v_ukind->>'mana')::bigint, 0) > v_win / v_cons + 1
     or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_ukind->>'ammo')::bigint, 0)
       > v_nsw + 1 + (v_win / v_off + 1) * (v_ammo_max + 1) then
    perform public.hr_reject('too_many_uses', jsonb_build_object('bought', v_bk, 'used', v_ukind, 'window_ms', v_win));
  end if;

  -- (5) THE SESSION HALF (2026-10-23-hunt-supply-ledger.sql).
  v_h := public.hr_hunt_settle_session(p_user, p_slot, p_session, v_hunt);
  if coalesce(v_h->>'ok', 'true') = 'false' then perform public.hr_reject(coalesce(v_h->>'error', 'hunt_settle_refused'), v_h); end if;
  -- STAMINA LOW: once per hunt, when the pool this window left is at or under the limits row.
  if v_e <= coalesce(public.hr_hunt_limit('stamina_low_min'), 0)::bigint * 60000
     and not exists (select 1 from public.hunt_session_events e where e.session_id = p_session and e.type = 'stamina_low') then
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (p_session, p_user, p_slot, 'stamina_low', v_to, jsonb_build_object('n', v_e / 60000));
  end if;

  -- BLESSINGS (hook: hr_blessing_take): the death keeps only the unprotected share of its
  -- loss (Level and skills); the tiers it used (held since before the window began) are used up.
  if v_nd > 0 then
    v_bless := public.hr_blessing_take(p_user, p_slot, p_session, v_dx, v_s.settled_to);
    if v_bless is not null then v_dx := v_bless->'dx'; v_lost := v_bless->'lost'; end if;
  end if;
  -- (6) THE PRICE OF THE DEATH, RE-CHECKED AND DEBITED (Tyler 2026-10-19, CORE_MODEL.md §6):
  --     the LEVEL loses at most death_xp_permille of its total XP (death_xp_base 0) or of
  --     its current Level's span (1), the debit never below the current Level's start;
  --     each combat skill loses at most the permille of its progress into its level.
  --     Bounds are read on the CURRENT values, which only grew since the death.
  if v_lost <> '{}'::jsonb then
    for v_k, v_n in select key, (value #>> '{}')::bigint from jsonb_each(v_lost) order by key loop
      if v_k = 'level' then
        select level_xp into v_cur from public.player_state where user_id = p_user and slot = p_slot for update;
        v_lvl := public.hr_char_level(v_cur);
        v_xfloor := public.hr_char_xp_for_level(v_lvl);
        v_lxb := case when v_base = 1 then public.hr_char_xp_for_level(v_lvl + 1) - v_xfloor else v_cur end;
        if v_n > floor(v_lxb * v_rate / 1000.0) or v_cur - v_n < v_xfloor then
          perform public.hr_reject('death_xp_over', jsonb_build_object('skill', 'level', 'level', v_lvl)); end if;
        update public.player_state set level_xp = level_xp - v_n where user_id = p_user and slot = p_slot;
        continue;
      end if;
      select xp into v_cur from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_k for update;
      if v_cur is null then perform public.hr_reject('bad_death_xp', jsonb_build_object('skill', v_k)); end if;
      v_lv := public.hr_skill_level(v_k, v_cur);
      v_xfloor := public.hr_skill_xp_for_level(v_k, v_lv);
      if v_n > floor((v_cur - v_xfloor) * v_rate / 1000.0) or v_cur - v_n < v_xfloor then
        perform public.hr_reject('death_xp_over', jsonb_build_object('skill', v_k, 'level', v_lv)); end if;
      update public.player_skills set xp = xp - v_n where user_id = p_user and slot = p_slot and skill_id = v_k;
    end loop;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'death_xp',
              jsonb_build_object('reason', 'death_xp', 'xp', v_lost, 'deaths', v_nd, 'permille', v_rate, 'base', v_base), p_session);
    for v_r in select e.id, e.data->>'skill' as sk, (e.data->>'level')::int as lv
                 from public.hunt_session_events e
                where e.session_id = p_session and e.id > v_ev0 and e.type = 'level_up' and v_lost ? (e.data->>'skill') loop
      if v_r.sk = 'level' then
        v_fin := public.hr_char_level((select level_xp from public.player_state where user_id = p_user and slot = p_slot));
        v_lv0 := public.hr_char_level(coalesce(v_lx0, 0));
      else
        v_fin := public.hr_skill_level(v_r.sk, (select xp from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_r.sk));
        v_lv0 := public.hr_skill_level(v_r.sk, coalesce((v_xp0->>v_r.sk)::bigint, 0));
      end if;
      if v_r.lv > v_fin then
        if v_fin > v_lv0 then update public.hunt_session_events set data = data || jsonb_build_object('level', v_fin) where id = v_r.id;
        else delete from public.hunt_session_events where id = v_r.id; end if;
      end if;
    end loop;
  end if;
  v_fi := 0;
  for v_r in select e.id from public.hunt_session_events e
              where e.session_id = p_session and e.id > v_ev0 and e.type = 'death' order by e.id loop
    v_el := coalesce(v_dx->v_fi, '{}'::jsonb);
    update public.hunt_session_events
       set data = data || jsonb_build_object('xp_lost', v_el, 'xp', (select coalesce(sum((x.value #>> '{}')::bigint), 0) from jsonb_each(v_el) x))
     where id = v_r.id;
    v_fi := v_fi + 1;
  end loop;

  -- (7) AN AUTOMATIC END RESUMES WHAT THE CHARACTER WAS DOING (after the walk home).
  v_end := v_h->>'ended';
  if v_end is not null and coalesce((select r.resumes from public.hr_hunt_end_reasons r where r.reason = v_end), false) then
    select ps.last_activity_kind, ps.last_activity_id into v_lk, v_li from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
    select h.ended_at + make_interval(secs => coalesce((select t.travel_s from public.hr_hunt_travel t where t.hunt_id = h.hunt_id), 0))
      into v_home from public.hunt_sessions h where h.id = p_session;
    v_ok := v_lk is not null and v_home is not null
      and exists (select 1 from public.hr_activities a where a.kind = v_lk and a.activity_id = v_li)
      and not exists (select 1 from public.hr_activities a
                       where a.kind = v_lk and a.activity_id = v_li and a.req_skill is not null and a.req_lv is not null
                         and coalesce((select public.hr_level_from_xp(sk.xp) from public.player_skills sk
                                        where sk.user_id = p_user and sk.slot = p_slot and sk.skill_id = a.req_skill), 1) < a.req_lv);
    if v_ok then
      update public.player_state
         set active_kind = v_lk, active_id = v_li, active_since = v_home, accrued_to = v_home,
             fight = '{}'::jsonb, version = version + 1, updated_at = now()
       where user_id = p_user and slot = p_slot;
      insert into public.hr_return_anchor (user_id, slot, real_return_at, updated_at)
        values (p_user, p_slot, v_home, now())
        on conflict (user_id, slot) do update
          set real_return_at = greatest(public.hr_return_anchor.real_return_at, excluded.real_return_at), updated_at = now();
    end if;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'resume',
              jsonb_build_object('reason', v_end, 'resumed', v_ok, 'kind', v_lk, 'id', v_li, 'at', v_home), p_session);
    update public.hunt_session_events e
       set data = e.data || jsonb_build_object('resume', case when v_ok then jsonb_build_object('kind', v_lk, 'id', v_li, 'at', v_home) else null end)
     where e.session_id = p_session and e.id > v_ev0 and e.type = 'ended';
  end if;
  -- THE ANALYZER TALLY (display) and THE HERO'S UNIT (null once it has left).
  if p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' then
    update public.hunt_session_tally t
       set dealt = public.hr_hunt_tally_add(t.dealt, coalesce(p_analyzer->'dealt', '{}'::jsonb)),
           taken = public.hr_hunt_tally_add(t.taken, coalesce(p_analyzer->'taken', '{}'::jsonb)),
           healed = public.hr_hunt_tally_add(t.healed, coalesce(p_analyzer->'healed', '{}'::jsonb))
     where t.session_id = p_session;
  end if;
  update public.hunt_sessions set unit_id = case when ended_at is null then v_unit_id end where id = p_session;
  -- The debited (blessed) loss of the death travels back with the answer.
  return coalesce(v_h, '{}'::jsonb) || case when v_nd > 0 then jsonb_build_object('death_xp', v_dx) else '{}'::jsonb end;
end $function$;

-- ── hr_hunt_settle_session: the `died` and `party_member_died` ends; the Level tally and Level-ups; no falls, no knockout ──
CREATE OR REPLACE FUNCTION public.hr_hunt_settle_session(p_user uuid, p_slot integer, p_session uuid, p_delta jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_skew       constant interval := interval '60 seconds';
  c_max_window constant bigint   := 24 * 3600000;   -- the outage fuse, never a gameplay cap
  c_min_swing_ms constant bigint := 500;            -- fuse on the swing count, not a balance figure
  c_keys constant text[] := array['swing_from', 'swing_to', 'to', 'next_swing_at', 'uses', 'paid_ms', 'raw_xp', 'hints', 'ended'];
  v_s      public.hunt_sessions%rowtype;
  v_to     timestamptz; v_next timestamptz;
  v_win    bigint;
  v_from_i bigint; v_to_i bigint;
  v_k text; v_v jsonb; v_kind text; v_left bigint; v_n bigint;
  v_deaths int; v_lx bigint;
  v_end text; v_end_at timestamptz;
  v_hwm bigint; v_new_hwm bigint;
  v_coins bigint; v_kills bigint;
  v_xp jsonb; v_loot jsonb; v_sup jsonb;
  v_ev int := 0; v_r record; v_hint jsonb; v_at timestamptz; v_i int;
  v_next_id uuid;
  v_raw jsonb;
  v_used   jsonb := '{}'::jsonb;
  v_used_n bigint := 0;
  v_supply jsonb;
  v_store  boolean;
  v_tier   int;
  -- THE FOLD'S TIME BOUND: every row this folds was stamped in the transaction
  -- of a settle, and a window is at most c_max_window.
  v_fold_from timestamptz := now() - interval '25 hours';
begin
  -- ── VALIDATE (no writes) ───────────────────────────────────────────────
  if p_user is null or p_slot is null or p_session is null or p_delta is null or jsonb_typeof(p_delta) <> 'object' then
    perform public.hr_reject('bad_arguments'); end if;
  if exists (select 1 from jsonb_object_keys(p_delta) k where k <> all (c_keys)) then
    perform public.hr_reject('unknown_delta_key'); end if;
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null or v_s.id <> p_session then perform public.hr_reject('no_hunt'); end if;

  if jsonb_typeof(p_delta->'swing_from') is distinct from 'number' or jsonb_typeof(p_delta->'swing_to') is distinct from 'number'
     or (p_delta->>'swing_from') !~ '^[0-9]{1,15}$' or (p_delta->>'swing_to') !~ '^[0-9]{1,15}$' then
    perform public.hr_reject('bad_swing'); end if;
  v_from_i := (p_delta->>'swing_from')::bigint; v_to_i := (p_delta->>'swing_to')::bigint;
  if v_from_i <> v_s.swing_index then
    perform public.hr_reject('session_moved', jsonb_build_object('swing_index', v_s.swing_index)); end if;
  begin
    v_to := (p_delta->>'to')::timestamptz;
    v_next := (p_delta->>'next_swing_at')::timestamptz;
  exception when others then
    perform public.hr_reject('bad_window');
  end;
  if v_to is null or v_next is null or v_to <= v_s.settled_to then
    perform public.hr_reject('bad_window', jsonb_build_object('settled_to', v_s.settled_to)); end if;
  if v_to > now() + c_skew then perform public.hr_reject('window_in_future'); end if;
  v_win := floor(extract(epoch from (v_to - v_s.settled_to)) * 1000)::bigint;
  if v_win > c_max_window then perform public.hr_reject('window_too_long'); end if;
  if v_next < v_to or v_next > v_to + c_skew then perform public.hr_reject('bad_next_swing'); end if;
  if v_to_i < v_from_i or v_to_i - v_from_i > v_win / c_min_swing_ms + 1 then
    perform public.hr_reject('bad_swing'); end if;

  -- OWN USES: packed bag lines only, of a kind a hunt spends, never more than is left.
  if p_delta ? 'uses' then
    if jsonb_typeof(p_delta->'uses') <> 'object' or (select count(*) from jsonb_object_keys(p_delta->'uses')) > 10 then
      perform public.hr_reject('bad_uses'); end if;
    for v_k, v_v in select key, value from jsonb_each(p_delta->'uses') loop
      if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,9}$' then
        perform public.hr_reject('bad_uses', jsonb_build_object('item', left(v_k, 64))); end if;
      v_n := (v_v #>> '{}')::bigint;
      select b.qty_left, p.kind into v_left, v_kind
        from public.hunt_bag b left join public.hr_hunt_supplies p on p.item_id = b.item_id
       where b.session_id = p_session and b.item_id = v_k;
      if v_left is null then perform public.hr_reject('not_in_bag', jsonb_build_object('item', left(v_k, 64))); end if;
      if v_n > v_left then perform public.hr_reject('bag_short', jsonb_build_object('item', v_k, 'left', v_left)); end if;
      if v_n > 0 and v_kind is distinct from 'heal' and v_kind is distinct from 'ammo' then
        perform public.hr_reject('kind_not_used', jsonb_build_object('item', v_k, 'kind', v_kind)); end if;
      v_left := null; v_kind := null;
    end loop;
  end if;

  -- THE DEATH: the death rows hr_apply stamped with this session since the last fold (at most one).
  select t.ledger_hwm into v_hwm from public.hunt_session_tally t where t.session_id = p_session;
  v_hwm := coalesce(v_hwm, 0);
  select count(*) into v_deaths from public.player_ledger l
   where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'combat' and l.intent = 'death';
  if v_deaths > 1 then perform public.hr_reject('bad_counts', jsonb_build_object('deaths', v_deaths)); end if;
  if (p_delta ? 'paid_ms' and (jsonb_typeof(p_delta->'paid_ms') <> 'number' or (p_delta->>'paid_ms')::numeric < 0
                                  or (p_delta->>'paid_ms')::numeric > v_win)) then
    perform public.hr_reject('bad_counts'); end if;
  v_raw := coalesce(p_delta->'raw_xp', '{}'::jsonb);
  if jsonb_typeof(v_raw) <> 'object' or (select count(*) from jsonb_object_keys(v_raw)) > 24
     or exists (select 1 from jsonb_each(v_raw) x where x.key !~ '^[a-zA-Z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number'
                   or (x.value #>> '{}')::numeric < 0 or (x.value #>> '{}')::numeric > 1e12) then
    perform public.hr_reject('bad_counts'); end if;

  -- THE END, re-proved from server state as it will stand after the uses.
  v_supply := public.hr_hunt_supply_of(p_user, p_slot, v_s.preset);
  v_store := v_supply->>'supply_source' = 'store' or v_supply->>'on_empty' = 'switch';
  select t.tier into v_tier from public.hr_hunt_travel t where t.hunt_id = v_s.hunt_id;
  if p_delta ? 'ended' and jsonb_typeof(p_delta->'ended') = 'object' then
    v_end := p_delta->'ended'->>'reason';
    begin v_end_at := (p_delta->'ended'->>'at')::timestamptz;
    exception when others then perform public.hr_reject('bad_end'); end;
    if v_end is null or not exists (select 1 from public.hr_hunt_end_reasons where reason = v_end)
       or v_end_at is null or v_end_at < v_s.settled_to or v_end_at > v_to then
      perform public.hr_reject('bad_end'); end if;
    if not coalesce(case v_end
      -- DIED (Tyler 2026-10-19): this settle journalled the hero's death.
      when 'died' then v_deaths >= 1
      -- PARTY_MEMBER_DIED: another member of this instance died, which ends the whole party's hunt;
      -- provable only as "the instance holds another member": the end can only stop value, never mint it.
      when 'party_member_died' then exists (select 1 from public.hunt_sessions o
                                             where o.instance_id = v_s.instance_id and o.id <> v_s.id)
      -- heals_out / ammo_out: every essential line of the kind empty after the
      -- uses, and the store closed to it (the hero's explicit `end`) or holding
      -- no row it could buy instead.
      when 'heals_out' then not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                         where b.session_id = p_session and p.kind = 'heal' and b.essential
                                           and b.qty_left - coalesce((p_delta->'uses'->>b.item_id)::bigint, 0) > 0)
                        and exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                     where b.session_id = p_session and p.kind = 'heal' and b.essential)
                        and not (v_store and exists (select 1 from public.hr_hunt_basic_supplies q
                                                      where q.kind = 'heal' and v_tier = any (q.tiers)))
      when 'ammo_out' then not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                        where b.session_id = p_session and p.kind = 'ammo' and b.essential
                                          and b.qty_left - coalesce((p_delta->'uses'->>b.item_id)::bigint, 0) > 0)
                       and exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                    where b.session_id = p_session and p.kind = 'ammo' and b.essential)
                       and not (v_store and exists (select 1 from public.hunt_bag b join public.hr_hunt_basic_supplies q
                                                     on q.kind = 'ammo' and q.partner = b.item_id
                                                    where b.session_id = p_session and b.essential))
      -- GOLD_OUT: the store was open to the hero, and the gold left over its floor
      -- (after this window's coins, cover and buys, written before this call) is
      -- below the dearest store row it could need.
      when 'gold_out' then v_store
                       and coalesce((select ps.gold from public.player_state ps
                                      where ps.user_id = p_user and ps.slot = p_slot), 0)
                           - (v_supply->>'gold_floor')::bigint
                         < coalesce((select max(q.price) from public.hr_hunt_basic_supplies q
                                      where ((q.kind in ('heal', 'mana')) and v_tier = any (q.tiers))
                                         or (q.kind = 'ammo' and (q.partner in (select b.item_id from public.hunt_bag b where b.session_id = p_session)
                                                                  or q.partner = (select pe.item_id from public.player_equipment pe
                                                                                   where pe.user_id = p_user and pe.slot = p_slot
                                                                                     and pe.equip_slot = 'ammo')))), 0)
      -- STAMINA: hr_hunt_apply_member wrote this window's end value at `to` before this call.
      when 'stamina' then coalesce((select ps.stamina_ms from public.player_state ps
                                     where ps.user_id = p_user and ps.slot = p_slot), 1) <= 0
      when 'hours' then v_s.hours_limit is not null and v_end_at >= v_s.hunt_from + make_interval(hours => v_s.hours_limit)
      when 'left' then v_s.leave_at is not null and v_end_at >= v_s.leave_at
      when 'changed' then v_s.change_at is not null and v_end_at >= v_s.change_at
      when 'server' then not coalesce((select enabled from public.hr_hunt_config where id), false)
      -- RULE (lane action-engine): one of the hero's own stop rules held (src/core/hunt/conditions.js);
      -- provable only as "the preset carries a stop rule": the end can only stop value, never mint it.
      when 'rule' then exists (select 1 from public.player_action_sets a where a.user_id = p_user and a.slot = p_slot
                                 and a.preset = v_s.preset and jsonb_typeof(a.options->'stop_rules') = 'array'
                                 and jsonb_array_length(a.options->'stop_rules') > 0)
      else false end, false) then
      perform public.hr_reject('end_not_proven', jsonb_build_object('reason', v_end));
    end if;
  elsif p_delta ? 'ended' and jsonb_typeof(p_delta->'ended') <> 'null' then
    perform public.hr_reject('bad_end');
  else
    -- AN END THE ENGINE OWED: a death journalled, a leave/change/hours
    -- instant more than one skew behind the window end.
    if v_deaths >= 1
       or (v_s.leave_at is not null and v_to > v_s.leave_at + c_skew)
       or (v_s.change_at is not null and v_to > v_s.change_at + c_skew)
       or (v_s.hours_limit is not null and v_to > v_s.hunt_from + make_interval(hours => v_s.hours_limit) + c_skew) then
      perform public.hr_reject('end_missing'); end if;
  end if;
  v_hint := coalesce(p_delta->'hints', '{}'::jsonb);
  if jsonb_typeof(v_hint) <> 'object' then perform public.hr_reject('bad_hints'); end if;

  -- ── APPLY ──────────────────────────────────────────────────────────────
  -- (1) OWN USES: the bag, and ONE `supply_own` row per settle carrying every
  --     unit used in meta.items (qty = the units destroyed, negative, gold 0).
  if p_delta ? 'uses' then
    for v_k, v_v in select key, value from jsonb_each(p_delta->'uses') order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      update public.hunt_bag set qty_left = qty_left - v_n where session_id = p_session and item_id = v_k
        returning qty_left into v_left;
      v_used := v_used || jsonb_build_object(v_k, v_n);
      v_used_n := v_used_n + v_n;
      if v_left = 0 then
        v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_hint->'slot_dry'->v_k), v_to), v_s.settled_to), v_to);
        insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
          values (p_session, p_user, p_slot, 'slot_dry', v_at, jsonb_build_object('item', v_k));
        v_ev := v_ev + 1;
      end if;
    end loop;
    if v_used_n > 0 then
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id)
        values (p_user, p_slot, 'hunt', 'supply_own', 0, -v_used_n,
                jsonb_build_object('side', 'bag', 'source', 'own', 'items', v_used), p_session);
    end if;
  end if;

  -- (2) THE FOLD: every row stamped with this session since the high-water mark.
  select coalesce(sum(case when l.kind <> 'hunt' then coalesce(l.gold, 0) else 0 end), 0),
         coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then greatest(0, (l.meta->>'kills')::numeric) else 0 end), 0)::bigint,
         max(l.id)
    into v_coins, v_kills, v_new_hwm
    from public.player_ledger l where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from;
  -- THE LEVEL XP the fold credited (hr_apply's ledger meta `lx`), tallied under `level`.
  select coalesce(sum((l.meta->'delta'->>'lx')::numeric), 0)::bigint into v_lx
    from public.player_ledger l
   where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
     and jsonb_typeof(l.meta->'delta'->'lx') = 'number';
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_xp from (
    select x.key as k, sum(x.value::numeric) as v
      from public.player_ledger l, jsonb_each_text(case when jsonb_typeof(l.meta->'delta'->'x') = 'object'
                                                         then l.meta->'delta'->'x' else '{}'::jsonb end) x
     where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
     group by x.key) a;
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_loot from (
    select k, sum(v) as v from (
      select i.key as k, i.value::numeric as v
        from public.player_ledger l, jsonb_each_text(case when jsonb_typeof(l.meta->'delta'->'i') = 'object'
                                                           then l.meta->'delta'->'i' else '{}'::jsonb end) i
       where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
      union all
      select '*', (l.meta->'delta'->>'i_sum')::numeric
        from public.player_ledger l
       where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
         and jsonb_typeof(l.meta->'delta'->'i_sum') = 'number') u
    group by k) a;
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_sup from (
    select i.key as k, sum(i.value::numeric) as n
      from public.player_ledger l, jsonb_each_text(case when jsonb_typeof(l.meta->'items') = 'object'
                                                         then l.meta->'items' else '{}'::jsonb end) i
     where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'hunt' and l.intent = 'supply_own'
     group by i.key) a;
  update public.hunt_session_tally t
     set coins = t.coins + v_coins, kills = t.kills + v_kills, deaths = t.deaths + v_deaths,
         xp = public.hr_jsonb_add(t.xp, v_xp || case when v_lx > 0 then jsonb_build_object('level', v_lx) else '{}'::jsonb end),
         loot = public.hr_jsonb_add(t.loot, v_loot),
         supplies = public.hr_jsonb_add(t.supplies, v_sup), raw_xp = public.hr_jsonb_add(t.raw_xp, v_raw),
         paid_ms = t.paid_ms + coalesce((p_delta->>'paid_ms')::numeric, 0)::bigint,
         ledger_hwm = greatest(t.ledger_hwm, coalesce(v_new_hwm, 0)), updated_at = now()
   where t.session_id = p_session;

  -- (3) DERIVED EVENTS. The death from its row; Level- and level-ups from the XP the
  --     fold credited; rare drops only for items this fold looted.
  v_i := 0;
  for v_r in select l.at, l.meta->>'monster' as monster from public.player_ledger l
              where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'combat' and l.intent = 'death' order by l.id loop
    v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_hint->'death'->v_i), v_r.at), v_s.settled_to), v_to);
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (p_session, p_user, p_slot, 'death', v_at, jsonb_build_object('monster', left(coalesce(v_r.monster, ''), 64)));
    v_i := v_i + 1; v_ev := v_ev + 1;
  end loop;
  if v_lx > 0 then
    select public.hr_char_level(ps.level_xp), public.hr_char_level(greatest(0, ps.level_xp - v_lx))
      into v_n, v_left from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
    if v_n > v_left then
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'level_up', v_to, jsonb_build_object('skill', 'level', 'level', v_n));
      v_ev := v_ev + 1;
    end if;
  end if;
  for v_r in select x.key as skill, public.hr_skill_level(x.key, ps.xp) as lv_now,
                    public.hr_skill_level(x.key, greatest(0, ps.xp - floor(x.value::numeric)::bigint)) as lv_then
               from jsonb_each_text(v_xp) x
               join public.player_skills ps on ps.user_id = p_user and ps.slot = p_slot and ps.skill_id = x.key
              where x.value::numeric > 0 loop
    if v_r.lv_now > v_r.lv_then then
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'level_up', v_to, jsonb_build_object('skill', left(v_r.skill, 64), 'level', v_r.lv_now));
      v_ev := v_ev + 1;
    end if;
  end loop;
  if jsonb_typeof(v_hint->'rare_drop') = 'array' then
    for v_r in select distinct on (e.value->>'item') e.value->>'item' as item, e.value->'at' as at_ms
                 from jsonb_array_elements(v_hint->'rare_drop') with ordinality e(value, o)
                where jsonb_typeof(e.value) = 'object' and coalesce((v_loot->>(e.value->>'item'))::numeric, 0) > 0
                order by e.value->>'item', e.o limit 10 loop
      v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_r.at_ms), v_to), v_s.settled_to), v_to);
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'rare_drop', v_at, jsonb_build_object('item', left(v_r.item, 64)));
      v_ev := v_ev + 1;
    end loop;
  end if;

  -- (4) THE SESSION CLOCK.
  update public.hunt_sessions
     set swing_index = v_to_i, settled_to = v_to, next_swing_at = v_next, version = version + 1
   where id = p_session;

  -- (5) THE END.
  if v_end = 'changed' then
    v_next_id := public.hr_hunt_swap(p_session, v_end_at);
  elsif v_end is not null then
    perform public.hr_hunt_close(p_session, v_end, v_end_at, true);
  end if;

  return jsonb_build_object('ok', true, 'session', p_session, 'swing_index', v_to_i, 'settled_to', v_to,
                            'ended', v_end, 'next_session', v_next_id, 'events', v_ev,
                            'version', (select version from public.hunt_sessions where id = p_session));
end $function$;

-- ── hr_state_of: Level, vitals (derived), the skill curve; no knockout, no style, no stored max HP ──
CREATE OR REPLACE FUNCTION public.hr_state_of(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- hr_state_of restated 2026-09-14 (2026-09-14-hr-state-of-restatement.sql) — chain depth 0;
-- restated again WHOLE by 2026-10-19-account-wallet.sql (gems + hearth_tokens read
-- from public.account_wallet, the ACCOUNT's balance, identical on every slot).
-- This body is AUTHORED HERE. Do not add an anchored programmatic patch to it:
-- tests/patch-chain-guard.mjs refuses a third one, and twenty-four of them are
-- how the envelope every client renders came to exist in no file at all.
declare v_st public.player_state%rowtype;
        v_w  public.account_wallet%rowtype;
        v_vit jsonb;
begin
  -- ── THE CHARACTER ROW, AND THE ENVELOPE ROOT (ok / version / now) ──
  --    introduced by 2026-08-11-apply-engine.sql
  select * into v_st from public.player_state
   where user_id = p_user and slot = coalesce(p_slot, 0);
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  -- THE ACCOUNT WALLET. One PK probe; a missing row reads 0 (never NULL), so an
  -- account the wallet has not met yet renders an honest zero, not "unknown".
  select * into v_w from public.account_wallet where user_id = p_user;
  -- THE CORE MODEL'S VITALS (2026-10-27): Level, max HP / mana and the regen rate, derived.
  v_vit := public.hr_vitals_of(p_user, v_st.slot);

  -- ── THE SECTION REGISTRY (architecture contracts X7; 2026-10-23-character-premium.sql):
  --    every hr_state_sections row, folded UNDER the hand-written keys below.
  return public.hr_state_sections_of(p_user, v_st.slot) || jsonb_build_object(
    'ok', true,
    'version', v_st.version,
    'now', now(),
    -- CONSUMABLE BUFFS (2026-09-13). The character's own timed-consumable queue,
    -- written only by hr_apply's buff_apply block from hr_item_buffs + now().
    -- `until` is the authority; `remaining_ms` is the server's own subtraction
    -- against the same now() this envelope reports, so no client clock is ever an
    -- input to how long a buff has left. Ordered by expiry so the soonest is
    -- first. Expired entries are carried with remaining_ms = 0 — the away engine
    -- needs a buff that was alive at the START of the window it prices, and the
    -- renderer filters on remaining_ms > 0.
    -- ── buffs — THE CONSUMABLE QUEUE, with a SERVER-derived remaining_ms ──
    --    introduced by 2026-09-13-consumable-buffs.sql
    --    `scale` was added by 2026-09-13-buff-cellar-scale.sql
    -- ── level / vitals — THE CORE MODEL (2026-10-27-core-bodies.sql; CORE_MODEL.md §2-3) ──
    --    Level from kills only (player_state.level_xp), endless; max HP and max mana from
    --    Level and armour weight, the regen rate from Prayer: all DERIVED, never stored.
    'level', public.hr_level_block(v_st.level_xp),
    'vitals', v_vit,
    'buffs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', e.v->>'type',
               'magnitude', (e.v->>'magnitude')::numeric,
               'until', e.v->>'until',
               -- THE SEGMENT'S START (2026-09-28-buff-segment-from.sql). The
               -- engine does not pay a segment before it; null on a row written
               -- before the key existed (the engine then assumes the earliest
               -- start the one-hour ceiling allows).
               'from', e.v->>'from',
               -- THE PERK MULTIPLIER THIS SEGMENT WAS STAMPED WITH (step 3).
               -- Display only — the time it bought is already in `until`, and a
               -- segment written before the Cellar was priced has no key and is
               -- honestly 1.0 rather than absent, because an absent number is one
               -- a renderer has to guess at.
               'scale', coalesce((e.v->>'scale')::numeric, 1),
               'remaining_ms', greatest(0, floor(
                 extract(epoch from ((e.v->>'until')::timestamptz - now())) * 1000))::bigint)
               order by (e.v->>'until')::timestamptz)
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
    ), '[]'::jsonb),
    -- place (2026-09-13): the character's OWN position in the live world, and
    -- nothing about anybody else. Week 1 has one zone, so `zone` is a server
    -- constant (hr_town_zone) rather than a column — Week 2 adds player_state
    -- .zone_id and this line reads it instead. `quiet` is the stalking opt-out,
    -- projected so the toggle survives a reload without living in the residue (a
    -- client-held privacy flag is a privacy flag a reload loses). PEERS ARE NOT
    -- HERE AND MUST NEVER BE: this envelope is version-gated, and peer motion in
    -- it would be a version_conflict storm. They come from hr_town_of.
    -- ── place — THE CHARACTER'S OWN POSITION. PEERS ARE NEVER HERE ──
    --    introduced by 2026-09-13-town-presence.sql
    'place', jsonb_build_object(
      'zone', public.hr_town_zone(),
      'quiet', coalesce(v_st.presence_quiet, false)),
    -- dungeon re-entry cooldown (2026-09-12): the ACTIVE windows only, PER DUNGEON
    -- and PER MODE — { dungeon_id: { auto: ISO, manual: ISO, scavenger: ISO } },
    -- each mode waiting cooldown_s / its divisor (Designer ruling: scavenger is a
    -- quarter window, not an exemption). Derived by hr_dungeon_cooldowns from the
    -- append-only ledger + the catalogue — THE SAME function hr_dungeon_settle's
    -- gate (c) refuses on, so the countdown shown and the window enforced are one
    -- number. Was a client-clock `G.dungeons.lastRun` in the residue, which the
    -- armed path had stopped stamping at all. An expired mode is omitted, a dungeon
    -- with no active mode is omitted, a fresh character gets {}; an absent key on
    -- the client means READY, which is safe because the SERVER refuses — the worst
    -- case is one refused intent. The client reads map[dungeon_id][mode].
    -- ── dungeon_cooldowns — the ACTIVE windows, per dungeon and per mode ──
    --    introduced by 2026-09-12-dungeon-cooldown.sql
    -- ── stamina — THE HUNT POOL (ms / at / max_ms / hunting) ──
    --    introduced by 2026-10-22-hunt-sessions-settle.sql §4c
    'stamina', public.hr_stamina_view(p_user, v_st.slot),
    'dungeon_cooldowns', public.hr_dungeon_cooldowns(p_user, v_st.slot),
    -- ── state — THE FLAT SCALAR BAG (opens here, closes at streak_day_key) ──
    --    introduced by 2026-08-11-apply-engine.sql
    'state', jsonb_build_object(
      'slot', v_st.slot, 'gold', v_st.gold, 'gems', coalesce(v_w.gems, 0),
      -- Bounty-Marks server-of-record slice: the marks currency the bounty
      -- turn-in (hr_claim_bounty) already credits into player_state.marks. Flat
      -- scalar beside gold/gems so src/net/record.js reads it the SAME way it
      -- reads gold — a moved-but-UNKNOWN marks balance renders a pending glyph,
      -- never a forgeable local number. Additive; nothing else changes.
      -- ── state.marks — the Bounty-Marks currency ──
      --    introduced by 2026-08-26-marks-record.sql
      'marks', v_st.marks,
      -- dungeon-scrip: the server-owned Dungeon Scrip currency, credited by
      -- hr_dungeon_settle. Flat scalar beside marks so src/net/record.js reads it
      -- the SAME way it reads gold/marks — a moved-but-UNKNOWN scrip balance
      -- renders a pending glyph, never a forgeable local number. Never an
      -- inventory item, never a residue mirror (dungeon-settlement.md §1).
      -- ── state.dungeon_scrip — the Dungeon Scrip currency ──
      --    introduced by 2026-09-10-dungeon-scrip.sql
      'dungeon_scrip', v_st.dungeon_scrip,
      -- ── state — tokens, hit points, the bank cap and the activity pointer ──
      --    introduced by 2026-08-11-apply-engine.sql
      'hearth_tokens', coalesce(v_w.hearth_tokens, 0),
      'hp', least(v_st.hp, (v_vit->>'max_hp')::int), 'max_hp', (v_vit->>'max_hp')::int, 'level_xp', v_st.level_xp,
      'bank_cap', v_st.bank_cap,
      'active_kind', v_st.active_kind, 'active_id', v_st.active_id,
      'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to,
      -- worker-settlement slice: the hired crew's own accrual watermark. The
      -- accrual shell reads it as `st.workers_accrued_to` and settles
      -- [workers_accrued_to, now()] alongside the pointer. Flat, like the other
      -- watermarks, so a nested bag cannot hide a missing column behind a default.
      -- ── state.workers_accrued_to — the hired crew's own watermark ──
      --    introduced by 2026-08-25-workers.sql
      'workers_accrued_to', v_st.workers_accrued_to,
      -- ── state.combat_xp_accrued_to — the combat-XP cadence watermark ──
      --    introduced by 2026-08-31-combat-xp-credit.sql
      'combat_xp_accrued_to', v_st.combat_xp_accrued_to,
      -- rested-record (b437): the bank charge count + its wall-clock watermark,
      -- flat like the other watermarks so a nested bag cannot hide a missing
      -- column behind a default. The accrual shell reads them as st.rested_xp /
      -- st.rested_at and settles [rested_at, now()] alongside the pointer.
      -- ── state.rested_xp / rested_at — the rested bank and its watermark ──
      --    introduced by 2026-08-22-rested-record.sql
      'rested_xp', v_st.rested_xp,
      'rested_at', v_st.rested_at,
      -- b348: THE GATHERING TOOL CARRY. Its presence here is what tells the
      -- accrual engine the server owns the carry — `st.tool_carry ?? null`, and
      -- the null branch omits the delta key. Never nested, for the same reason
      -- the auto-eat keys are flat.
      -- ── state.tool_carry — the gathering carry the SERVER owns ──
      --    introduced by 2026-08-15-tool-carry.sql
      'tool_carry', v_st.tool_carry,
      -- THE HEARTHFIND's self-configuring switch. Always true once
      -- 2026-09-08-hearthfind.sql has run; read by hr-accrue to decide whether
      -- to propose delta.hearthfind at all. Not a feature flag.
      -- ── state.hearthfind_* — the switch, the day’s find, the titles, the plinth ──
      --    introduced by 2026-09-08-hearthfind.sql
      'hearthfind_ready', true,
      -- THE DAY'S LATEST FIND, so a RETRIED SETTLE DOES NOT LOSE THE REVEAL.
      -- hr_apply's replay path returns `hr_state_of(...) || {replayed:true}` --
      -- a FRESH envelope, deliberately, because storing the receipt would put a
      -- full snapshot in player_intents (revision 2 did, at ~690 MB per player
      -- per day). The consequence is that the `hearthfind` field of the
      -- ORIGINAL receipt exists only on the first response: a settle whose
      -- reply is lost to a dropped connection is retried, comes back ok, and
      -- the player is never told about the rarest thing that has ever happened
      -- to them. The trophy and the ledger row were never at risk; only the
      -- MOMENT was, and the moment is the entire feature.
      --
      -- Projected from the append-only journal (the only durable record) rather
      -- than from world_finds, because the public row is suppressed by the
      -- 60-second broadcast clamp while the ledger row never is. Scoped to the
      -- UTC day so it is self-expiring: there is no state to clear, no flag to
      -- reset, and a client that has already revealed it simply sees the same
      -- object again (it carries `at`, so the client can tell). One index probe
      -- on player_ledger_hearthfind_idx; null on the ~100% of reads with no
      -- find today.
      'hearthfind_last', (
        select jsonb_build_object('item', l.item_id, 'at', l.at) || coalesce(l.meta, '{}'::jsonb)
          from public.player_ledger l
         where l.user_id = p_user and l.slot = p_slot and l.kind = 'hearthfind'
           and l.at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
         order by l.at desc limit 1),
      -- THE COSMETICS THE CHARACTER OWNS. Projected from the server table, not
      -- carried in the residue: a title is earned state, and CLAUDE.md §6 is
      -- explicit that anything a player would miss after a reload lives in a
      -- server row and is projected. Two arrays and one boolean, all derived:
      --   hearthfind_titles  every title unlocked, newest last
      --   hearthfind_plinth  whether the homestead plinth is unlocked
      -- The EQUIPPED title is deliberately absent until an equip intent exists;
      -- a client that picked one would be authoring it, and there is no RPC yet
      -- that would let the server own that choice. Stated as a known limitation
      -- rather than shipped as a residue field.
      'hearthfind_titles', coalesce((
        select jsonb_agg(jsonb_build_object('code', c.code, 'name', c.name, 'at', c.granted_at)
                         order by c.granted_at)
          from public.player_cosmetics c
         where c.user_id = p_user and c.slot = p_slot and c.kind = 'title'), '[]'::jsonb),
      'hearthfind_plinth', exists (
        select 1 from public.player_cosmetics c
         where c.user_id = p_user and c.slot = p_slot and c.kind = 'plinth'),
      -- Phase 0: THE IN-FLIGHT FIGHT. Its presence here is what tells the
      -- accrual engine the server owns the fight — `st.fight ?? null`, and the
      -- null branch omits the delta key, exactly as tool_carry does. Never
      -- nested, for the same reason the auto-eat keys are flat.
      -- ── state.fight — the IN-FLIGHT fight the server owns ──
      --    introduced by 2026-08-17-fight-carry.sql
      'fight', v_st.fight,
      -- THE TWO DEATH COUNTERS, projected as SCALARS.
      -- They are the same two player_progress rows the accrual delta writes
      -- (kind='stat' key='deaths', period='' and period=<UTC day>), read here
      -- DIRECTLY rather than left to be dug out of the 'progress' array above
      -- - that array is `limit 1000` and carries `progress_truncated`, and a
      -- character with enough collection rows would silently read as one who
      -- has never died. A survival counter must not depend on a truncatable read. The day key is
      -- hr_utc_day_key, the SAME spelling src/core/goals.js utcDayKey
      -- produces, so the row the engine writes is the row this reads.
      -- ── state.deaths_* — the two death counters, read DIRECTLY (never off the truncatable `progress` array) ──
      --    introduced by 2026-09-06-recovering-until.sql
      'deaths_lifetime', coalesce((select pp.value from public.player_progress pp
                                    where pp.user_id = p_user and pp.slot = v_st.slot
                                      and pp.kind = 'stat' and pp.key = 'deaths'
                                      and pp.period_key = ''), 0),
      'deaths_today',    coalesce((select pp.value from public.player_progress pp
                                    where pp.user_id = p_user and pp.slot = v_st.slot
                                      and pp.kind = 'stat' and pp.key = 'deaths'
                                      and pp.period_key = public.hr_utc_day_key(now())), 0),
      -- Slice 3: the daily settle STREAK, server-owned, advanced only inside
      -- hr_apply from now(). Projected so the client can render it; never read
      -- for authority, and there is no present:true field anywhere.
      -- ── state.streak_days — the daily settle streak ──
      --    introduced by 2026-08-21-streak-state.sql
      'streak_days', v_st.streak_days,
      -- farm-projection (Q-2): the SERVER-owned farm plot tier, written ONLY by
      -- hr_farm_upgrade_plot. Flat scalar like the other server-owned scalars, so
      -- accrue.js reconcileFarm mirrors it into G.plotLevels on every load. Before
      -- this key existed an armed client fell back to getPlotLevel()'s Lv 1
      -- fail-safe on every reload: unlocked seeds vanished and the Upgrade button
      -- quoted the wrong tier's price. The client NEVER computes this.
      -- ── state.plot_level — the SERVER-owned farm plot tier ──
      --    introduced by 2026-09-06-state-of-farm-projection.sql
      'plot_level', v_st.plot_level,
      -- ── state.streak_day_key — the streak’s UTC day key ──
      --    introduced by 2026-08-21-streak-state.sql
      -- ── state.streak_day_key — CLOSES `state` (the combat style left with the core rebuild) ──
      'streak_day_key', v_st.streak_day_key),
    -- ── skills / inventory — the two maps the client renders from ──
    --    introduced by 2026-08-11-apply-engine.sql
    'skills', coalesce((
      select jsonb_object_agg(skill_id, jsonb_build_object(
               'xp', xp, 'level', public.hr_skill_level(skill_id, xp),
               -- THE CARRIED XP REMAINDER (2026-10-09-xp-frac-carry.sql). The
               -- engine's input (envelope.js xpFrac); the client renders `xp`.
               'frac', xp_frac))
        from public.player_skills where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'inventory', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.player_inventory where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    -- bank-store (b438): the BANK item container, server-owned
    -- (player_bank, no client write policy), projected as a flat {item_id:qty}
    -- map beside `inventory`. The client folds it through the SAME
    -- serverOwnedItem carve-out and the SAME inventory arm as the bag. Absent
    -- row = real zero (qty>0 invariant + delete-on-zero in hr_bank_move).
    -- ── bank — the server-owned bank container, beside `inventory` ──
    --    introduced by 2026-08-27-bank-store.sql
    'bank', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.player_bank where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    -- ── equipment — the worn set ──
    --    introduced by 2026-08-11-apply-engine.sql
    'equipment', coalesce((
      select jsonb_object_agg(equip_slot, item_id)
        from public.player_equipment where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    -- ELEMENTS/ENCHANTING v1: the server-owned weapon enchant,
    -- `{ <equip_slot>: <element> }`. Read here so the client renders it and the
    -- accrual shell builds `eq` from equipment + this (accrual.js weakness()),
    -- never from a client value. `{}` when nothing is enchanted.
    -- ── enchant — ELEMENTS v1, the server-owned weapon enchant ──
    --    introduced by 2026-08-18-enchant.sql
    'enchant', coalesce(v_st.enchant, '{}'::jsonb),
    -- worker-settlement slice: the hired crew, server-owned (player_workers, no
    -- client write policy). The accrual shell reads this as `env.workers` and
    -- settles each assigned worker; the client renders it and computes no yield.
    -- ── workers — the hired crew (hired_at added 2026-09-12-worker-hired-at-projection.sql) ──
    --    introduced by 2026-08-25-workers.sql
    'workers', coalesce((
      select jsonb_agg(jsonb_build_object('uid', uid, 'name', name,
                                          'skill', skill, 'target_id', target_id,
                                          'xp', xp, 'acc_ms', acc_ms,
                                          -- worker hire floor (2026-09-09 P0): the engine pays a
                                          -- worker only for time it has EXISTED. The shared
                                          -- workers_accrued_to watermark is stale by construction
                                          -- for a character who never had a crew, so without this
                                          -- the first hire collects a 24h backlog.
                                          'hired_at', hired_at)
                       order by uid)
        from public.player_workers where user_id = p_user and slot = v_st.slot), '[]'::jsonb),
    -- ── farm — the plots, with the FULL waterings array (Q-5) ──
    --    introduced by 2026-08-11-apply-engine.sql
    --    `waterings` was added by 2026-09-06-state-of-farm-projection.sql
    'farm', coalesce((
      select jsonb_agg(jsonb_build_object('i', plot_idx, 'crop', crop_id,
                                          'planted_at', planted_at, 'watered_at', watered_at,
                                          -- farm-projection (Q-5): the FULL watering history, the
                                          -- exact array hr_farm_growth_hours() reads. Projected
                                          -- whole because growth is the clipped 2h-window OVERLAP
                                          -- sum, which no count/last pair can reproduce — a lossy
                                          -- shape makes the client's isReady disagree with the
                                          -- server's and strands a ready crop behind a Water
                                          -- button. NOT NULL in the table; coalesce is belt-and-
                                          -- braces so a future nullable column can never emit a
                                          -- json null the client would have to special-case.
                                          'waterings', coalesce(to_jsonb(waterings), '[]'::jsonb))
                       order by plot_idx)
        from public.player_farm where user_id = p_user and slot = v_st.slot), '[]'::jsonb),
    -- ── progress / progress_truncated — capped at 1000 rows, and it SAYS when it capped ──
    --    introduced by 2026-08-11-apply-engine.sql
    'progress', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'key', key, 'value', value,
                                          'period', period_key, 'state', state))
        from (select kind, key, value, period_key, state
                from public.player_progress
               where user_id = p_user and slot = v_st.slot
                 and (period_key = '' or updated_at >= now() - interval '31 days')
                 -- Slices 1+2: the bestiary (ev:kill_monster:%) and collection
                 -- (ev:loot:%) populations are served by hr_bestiary_of /
                 -- hr_collection_of; together they approach the 1000-row cap, so
                 -- they are kept OUT of the generic envelope in one reviewed change.
                 and key not like 'ev:kill_monster:%'
                 and key not like 'ev:loot:%'
                 -- 2026-09-22: the TROPHY population (docs/design/BESTIARY_LADDER.md
                 -- §6). Claimed trophy rows are served by hr_trophy_of, beside
                 -- hr_bestiary_of / hr_collection_of. 108 kills + up to 432 trophies
                 -- + the collection log breach this 1000-row cap, and the failure is
                 -- SILENT: kind='collection' sorts ahead of daily/flag/quest/stat,
                 -- so what falls off the end is a player's quest state.
                 and key not like 'trophy:%'
               order by period_key, kind, key
               limit 1000) p), '[]'::jsonb),
    'progress_truncated', (
      select count(*) > 1000 from (
        select 1 from public.player_progress
         where user_id = p_user and slot = v_st.slot
           and (period_key = '' or updated_at >= now() - interval '31 days')
           and key not like 'ev:kill_monster:%'
           and key not like 'ev:loot:%'
           -- 2026-09-22: the TROPHY population. The SAME predicate as the one
           -- inside `progress` above, and it must stay the same: a flag that
           -- counted rows the array excludes would report truncation that did
           -- not happen, which is the read filter / prune divergence RL3 names.
           and key not like 'trophy:%'
         limit 1001) t),
    -- ── client_state — the denylisted client-preference bag ──
    --    introduced by 2026-08-28-client-state.sql
    'client_state', coalesce(v_st.client_state, '{}'::jsonb),
    -- ── total_level — derived server-side ──
    --    introduced by 2026-08-11-apply-engine.sql
    'total_level', public.hr_total_level(p_user, v_st.slot),
    -- recipe-learn (2026-09-14): the gated recipes THIS CHARACTER has learned,
    -- in the client's own `{ "<scroll_id>": true }` shape. Written only by
    -- hr_recipe_learn (there is no client write policy and no client write grant
    -- on player_progress); the SAME rows hr_perks_of hands the away engine, so
    -- the attended screen and the night finally read one set. `{}` on a fresh
    -- character is a known state, not an error: no row is a LOCKED recipe.
    -- ── unlocked_recipes — the gated recipes THIS character has learned ──
    --    introduced by 2026-09-14-recipe-learn.sql
    'unlocked_recipes', public.hr_recipes_of(p_user, v_st.slot),
    -- gem-unlock-buy (2026-09-14): the themes and cosmetics this ACCOUNT owns,
    -- as a flat array of '<namespace>:<id>'. Written only by hr_buy_gem_unlock
    -- (there is no client write policy and no client write grant on
    -- player_progress), read by src/legacy.js ownsGemUnlock so ownership stops
    -- living in the residue a cloud restore can rewind — the half of the b371
    -- gem dupe that made a free theme STICK. Always contains the FREE rows
    -- (theme:default), so the starting theme stays equippable the moment the
    -- client reads this set server-first. Never truncated: an entitlement must
    -- not be able to read as "you own nothing".
    -- ── gem_unlocks — the ACCOUNT’s entitlements. NEVER truncated ──
    --    introduced by 2026-09-14-gem-unlock-buy.sql
    'gem_unlocks', public.hr_gem_unlocks_of(p_user, v_st.slot),
    -- THE SERVER'S COUNTED RENOWN (2026-09-12). The high-water hr_claim_rank
    -- decides every rank against, cached on player_state by the ratchet §1 added
    -- to hr_apply. Read straight off the row this function already selected, so
    -- the projection is free; the recompute lives on the apply path where it is
    -- floored at one call per intent instead of one per envelope.
    -- DISPLAY + the rank-up card only — the client authors none of it, there is
    -- no client write policy or grant on player_state, and hr_renown_of stays
    -- revoked from every browser role. This is the caller's OWN character (the
    -- whole body is keyed on p_user/v_st.slot); no other player's score is
    -- reachable through it. 0 on a fresh character, never null.
    -- ── renown_high — the SERVER’s counted renown, display only ──
    --    introduced by 2026-09-12-renown-high-projection.sql
    'renown_high', coalesce(v_st.renown_high, 0),
    -- THE ACTIVE BOUNTY, AND THE SERVER'S OWN PROGRESS ARITHMETIC (2026-09-09).
    -- `progress` is the SAME expression hr_claim_bounty judges the turn-in by:
    -- hr_bounty_kills(target) - baseline, i.e. kills since accept, counting the
    -- away/settle kills the client cannot see (ev:kill_monster:% is excluded
    -- from the `progress` array on purpose — the bestiary is hr_bestiary_of's).
    -- Display + turn-in trigger only; the client authors none of it, and
    -- active_bounty is SELECT-only to browser roles. NULL = no active contract.
    -- ── bounty — the active contract and the SERVER’s own progress arithmetic ──
    --    introduced by 2026-09-09-bounty-progress-projection.sql
    'bounty', (select jsonb_build_object(
                 'bounty_id',   b.bounty_id,
                 'b_type',      b.b_type,
                 'difficulty',  b.difficulty,
                 'target',      b.target,
                 'tier',        b.tier,
                 'required',    b.required,
                 'baseline',    b.baseline,
                 'accepted_at', b.accepted_at,
                 'kills_now',   k.v,
                 'progress',    greatest(0, k.v - b.baseline))
                 from public.active_bounty b
                 cross join lateral (select public.hr_bounty_kills(p_user, v_st.slot, b.target) as v) k
                where b.user_id = p_user and b.slot = v_st.slot),
    -- hero-slot-buy: the ACCOUNT's owned hero slots, as a flat int array.
    -- ACCOUNT-scoped (no v_st.slot) because a hero slot is an account
    -- entitlement, unlike every other projection in this envelope. Written only
    -- by hr_buy_hero_slot; read by the client so ownership survives a device
    -- change without the save blob, which is the store the b371 gem dupe lived
    -- in. Never truncated — an entitlement must not become "you own nothing".
    -- `[0]` is a valid known state: a fresh account owns only the free slot.
    -- ── hero_slots — ACCOUNT-scoped entitlement. NEVER truncated ──
    --    introduced by 2026-09-08-hero-slot-buy.sql
    'hero_slots', public.hr_hero_slots_of(p_user),
    -- trait-buy: the character's OWNED PERMANENT TRAITS, as a flat id array.
    -- Written only by hr_trait_buy; read by the client to hydrate G.traits on
    -- boot so ownership survives a device change without the save blob. Read
    -- UNFILTERED (not through the LIMIT-ed `progress` array) — an entitlement
    -- must never be truncated into "you own nothing". `[]` is a valid known
    -- state: a fresh character owns no traits.
    -- ── traits — owned permanent traits, read UNFILTERED ──
    --    introduced by 2026-08-23-trait-buy.sql
    'traits', coalesce((
      select jsonb_agg(substring(pp.key from 7) order by pp.key)
        from public.player_progress pp
       where pp.user_id = p_user and pp.slot = v_st.slot
         and pp.kind = 'flag' and pp.period_key = ''
         and pp.key like 'trait:%' and pp.value > 0), '[]'::jsonb),
    -- companion-record (blob-retire capstone): the FULL roster the client rebuilds
    -- G.companions from under arm — equipped id + owned set + per-id XP. hr_perks_of
    -- carries only the EQUIPPED companion's {id,xp} for pricing; this carries the
    -- whole set so the reconstruction cannot silently reset a player's roster/XP.
    -- The starter 'fox' is owned by grammar (no unlock row) and is unioned in by
    -- the client, so it is deliberately absent from `owned`.
    -- ── companions — the FULL roster (equipped + owned + per-id XP) ──
    --    introduced by 2026-08-22-companion-record.sql
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
           and left(pp.key, 13) = 'companion_xp:'), '{}'::jsonb),
      -- ^ an EXACT prefix since 2026-10-12 (was `like`, whose `_` matched any
      -- character): a row is projected as a pet's XP only under the key
      -- hr_apply equipped-checks and caps.
      -- THE PET'S CARRIED XP REMAINDER (2026-10-12-companion-xp-frac.sql). The
      -- engine's input (envelope.js companionXpFrac); non-zero only, absent = 0.
      'frac', coalesce((
        select jsonb_object_agg(substring(pp.key from 14), pp.xp_frac)
          from public.player_progress pp
         where pp.user_id = p_user and pp.slot = v_st.slot
           and pp.kind = 'stat' and pp.period_key = ''
           and left(pp.key, 13) = 'companion_xp:' and pp.xp_frac > 0), '{}'::jsonb)),
    -- ── inventory-flip Step B1: THE SERVER-STAMPED COMPLETENESS SIGNAL ───────
    -- TRUE only when the accrual settle loop has NO pending, un-drained window
    -- that could still grant OWNABLE items — i.e. player_inventory is a complete
    -- statement of the owned set and the dormant absolute-replace flip
    -- (src/net/accrue.js envelopeBaselineComplete) may safely fire. Read
    -- src/net/accrue.js:863 and tools/derive-inventory-complete.mjs's header for
    -- why a false negative merely defers the flip (safe) and a false positive
    -- would DELETE a legit crafted stack (the one irreversible mistake).
    --
    -- SINGLE SOURCE OF TRUTH: this reads the engine's OWN completeness watermark,
    -- accrued_to (advanced to now() by, and only by, a full settle), against the
    -- engine's OWN min-span ACCRUE_MIN_MS = 60000 ms (accrual.js). Below that
    -- span the engine settles nothing (SKIP.TOO_SOON) so no grant is pending;
    -- at/above it there is an un-settled payable window → INCOMPLETE. The 60s
    -- literal is pinned to ACCRUE_MIN_MS by tests/inventory-complete-probe.mjs.
    --
    -- FAIL-CLOSED and CHAINED-CRAFT-SAFE (see the tool header): idle/unknown
    -- pointer → no accrual → complete; a payable pointer with a drained window
    -- (< 60s) → complete, because each settle is atomic and collect-before-switch
    -- leaves no cross-pointer chain mid-flight; a payable pointer with an open
    -- window (>= 60s) OR an inconsistent payable row with no active_since →
    -- INCOMPLETE.
    -- ── inventory_complete — the STAMPED completeness signal, fail-closed ──
    --    introduced by 2026-08-24-inventory-complete.sql
    --    the third (worker) arm was added by 2026-08-25-workers.sql
    -- ── must_rename (2026-10-11-name-moderation.sql) ── the player's own
    --    moderation flag; the client opens a non-dismissable rename prompt.
    'must_rename', coalesce((select pr.must_rename from public.profiles pr
                              where pr.id = p_user), false),
    'inventory_complete', (
      case
        when v_st.active_kind is null
          or v_st.active_kind not in ('combat', 'gather', 'artisan')
          or v_st.active_id is null
          then true
        when v_st.active_since is null
          then false
        else now() - greatest(v_st.accrued_to, v_st.active_since) < interval '60 seconds'
      end)
      -- ── THIRD ARM (worker-settlement slice) ──────────────────────────────
      -- Also INCOMPLETE when the crew is non-empty AND its window is open
      -- (>= 60s since workers_accrued_to). The crew read is in THIS transaction —
      -- a lagging read would be a false-positive that lets the flip delete a
      -- pending worker haul. Pinned to ACCRUE_MIN_MS by the probe test.
      and (not exists (select 1 from public.player_workers pw
                        where pw.user_id = p_user and pw.slot = v_st.slot)
           or now() - v_st.workers_accrued_to < interval '60 seconds')
  );
end $function$;

-- ── hr_create_character: no stored max HP (a Level-1 character starts at the kit's full HP) ──
CREATE OR REPLACE FUNCTION public.hr_create_character(p_slot integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid  uuid := auth.uid();
  v_slot int;
  v_kit  public.hr_start_kit%rowtype;
  v_n    int;
begin
  -- CLOSED MODE (2026-10-22-closed-mode-ungated-rpcs.sql, Security R3): this RPC
  -- never calls hr_rpc_gate, so it refuses a non-admitted caller itself.
  perform public.hr_access_check();
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  -- Validate the slot BEFORE spending any budget. A malformed request should
  -- not be able to consume the honest player's rate allowance.
  v_slot := coalesce(p_slot, 0);
  if v_slot < 0 or v_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot');
  end if;

  -- ── TWO BUCKETS, AND THE SPLIT IS THE POINT ───────────────────────────
  -- The previous body charged the strict 6/hour CREATION budget on every
  -- call, including calls that create nothing. That was fine while nothing
  -- called it; it is wrong now that the client ENSURES on load, because a
  -- player who reloads seven times in an hour would be refused for doing
  -- nothing unusual, and refusing an ensure is how a real character silently
  -- fails to exist.
  --   ensure_character  60/min  — a cheap guard on one indexed PK lookup, so
  --                               this cannot be used as a free query hammer.
  --   create_character   6/hour — charged ONLY on a path that will actually
  --                               insert. Create-and-delete looping (the abuse
  --                               the original limit was written for) is still
  --                               capped at six.
  if not public.hr_rate_ok(v_uid, 'ensure_character', 60, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'ensure_character') - 60) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'ensure_character', 'rate_limited',
        jsonb_build_object('limit', 60, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'ensure_character') - 60));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- FAST PATH. The overwhelmingly common call is "yes, it is already there".
  -- It takes no lock and spends no creation budget.
  if exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    return jsonb_build_object('ok', true, 'slot', v_slot, 'created', false);
  end if;

  -- ── THE HERO-SLOT ENTITLEMENT GATE (2026-09-08-hero-slot-buy.sql) ────
  -- Until this existed, {"p_slot":4} minted a fifth character with a full
  -- starting kit for free — the whole 3,100-gem hero-slot ladder bypassed by
  -- one fetch, five times over. Slot 0 is free and always owned; every slot
  -- above it must be in hr_hero_slots_of (bought, grandfathered, or waived by
  -- Hearth Hall). Placed AFTER the fast path so an existing character can
  -- never be locked out of its own account, and BEFORE the advisory lock and
  -- the 6/hour creation budget so a refusal costs neither.
  if v_slot > 0 and not (public.hr_hero_slots_of(v_uid) @> to_jsonb(v_slot)) then
    perform public.hr_record_rejection(v_uid, v_slot, 'create_character', 'slot_not_owned',
      jsonb_build_object('slot', v_slot, 'owned', public.hr_hero_slots_of(v_uid)), 1);
    return jsonb_build_object('ok', false, 'error', 'slot_not_owned', 'slot', v_slot);
  end if;

  -- ── SERIALISE (D1) ────────────────────────────────────────────────────
  -- Transaction-scoped, so it is released by COMMIT or ROLLBACK and cannot be
  -- leaked by an early return or an exception — unlike pg_advisory_lock(),
  -- which needs a matching unlock on every path and is held on a POOLED
  -- connection that outlives the request.
  -- The key is namespaced by a literal so it cannot collide with any other
  -- advisory lock in this schema, and keyed per (user, slot) so two players —
  -- or one player's two slots — never queue behind each other.
  perform pg_advisory_xact_lock(
    hashtextextended('hr_create_character:' || v_uid::text || ':' || v_slot::text, 0));

  -- RE-CHECK UNDER THE LOCK. The loser of a race arrives here after the winner
  -- has committed and takes the idempotent branch. This is the line that makes
  -- the handler below unreachable in practice — which is exactly why the
  -- handler is still there.
  if exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    return jsonb_build_object('ok', true, 'slot', v_slot, 'created', false, 'raced', true);
  end if;

  if not public.hr_rate_ok(v_uid, 'create_character', 6, interval '1 hour') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'create_character') - 6) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'create_character', 'rate_limited',
        jsonb_build_object('limit', 6, 'per', '1 hour'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'create_character') - 6));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_kit from public.hr_start_kit;
  if not found then
    -- Unreachable given §0, and it stays here anyway: a kitless character is
    -- worse than a refused one, because nothing downstream would ever notice.
    return jsonb_build_object('ok', false, 'error', 'no_start_kit');
  end if;

  -- ── THE INSERT, AND THE SECOND LOCK ───────────────────────────────────
  -- An `exception` clause opens a subtransaction, so if the primary key does
  -- fire, everything inside this block unwinds and the caller still gets a
  -- verdict rather than a 500. `raced` distinguishes it in the ledger of
  -- outcomes without pretending it did not happen.
  begin
    insert into public.player_state
      (user_id, slot, gold, hp, bank_cap,
       active_kind, active_id, active_since, accrued_to)
      values (v_uid, v_slot, v_kit.gold,
              -- hp is clamped to a Level-1 character's derived max HP (hr_vitals_of,
              -- nothing worn yet) rather than trusted: the kit is generated data.
              least(v_kit.hp, public.hr_max_hp(1, 0)), v_kit.bank_cap,
              -- A new character is idle, and `accrued_to` is NOW. Not
              -- `created_at`, not a client value, not null — an accrual
              -- watermark that starts anywhere but now() is a free grant of
              -- however long the gap is.
              'idle', null, null, now());
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'slot', v_slot, 'created', false, 'raced', true);
  end;

  -- THE ACCOUNT WALLET (2026-10-19-account-wallet.sql). Gems and Hearth Tokens
  -- are ONE balance per account, not per character, so the kit's gems are paid
  -- ONCE PER ACCOUNT under the 'start_kit' grant key: a second, third or fifth
  -- character is created with gold and no gems. hearth_tokens are not paid here
  -- at all: the kit's column is CHECK (= 0) and the bond is IAP-only.
  perform public.hr_wallet_ensure(v_uid);
  if coalesce(v_kit.gems, 0) > 0 then
    perform public.hr_wallet_credit(v_uid, v_slot, v_kit.gems, 'start_kit', null);
  end if;

  -- Skills: a row per skill IN THE CATALOGUE, with the starting XP from the
  -- kit. Adding a skill to src/data/skills.js therefore gives every new
  -- character that skill at 0 with no edit here and no edit to the kit.
  insert into public.player_skills (user_id, slot, skill_id, xp)
    select v_uid, v_slot, k.skill_id, coalesce(s.xp, 0)
      from public.hr_skills k
      left join public.hr_start_skill_xp s on s.skill_id = k.skill_id;

  insert into public.player_inventory (user_id, slot, item_id, qty)
    select v_uid, v_slot, i.item_id, i.qty from public.hr_start_inventory i;

  insert into public.player_equipment (user_id, slot, equip_slot, item_id)
    select v_uid, v_slot, e.equip_slot, e.item_id from public.hr_start_equipment e;

  -- ⚠ CONSERVATION: starting equipment is NOT also placed in the inventory.
  -- hr_apply's equip/unequip pair conserves the total count of an item across
  -- the two tables (player-state.sql §3, review S4), so seeding a sword into
  -- BOTH would let the player unequip it and hold two. The bootstrap is the
  -- one place in the system that legitimately creates items from nothing, and
  -- it must create each of them exactly once.

  if v_kit.farm_plots > 0 then
    insert into public.player_farm (user_id, slot, plot_idx)
      select v_uid, v_slot, g from generate_series(0, v_kit.farm_plots - 1) g;
  end if;

  -- ONE ledger row, not one per grant. (Journal rule 6: game_events reached
  -- 1.6M rows / 229 MB from six players in four days by journalling per-event.)
  -- `gold` carries the starting grant so the rollup's `gold_in` accounts for
  -- every gold that has ever entered the economy, including this.
  select count(*) into v_n from public.hr_start_inventory;
  insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
    values (v_uid, v_slot, 'admin', 'create_character', v_kit.gold,
            jsonb_build_object('slot', v_slot, 'kit_gold', v_kit.gold,
                               'kit_items', v_n, 'plots', v_kit.farm_plots,
                               'catalogue', (select digest from public.hr_catalogue_meta)));

  return jsonb_build_object('ok', true, 'slot', v_slot, 'created', true);
end $function$;

-- ── hr_hunt_member_read: no falls, no knockout ──
CREATE OR REPLACE FUNCTION public.hr_hunt_member_read(p_s hunt_sessions)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select jsonb_build_object(
    'id', p_s.id, 'hunt', p_s.hunt_id, 'preset', p_s.preset, 'version', p_s.version,
    'hunt_from_ms', ceil(extract(epoch from p_s.hunt_from) * 1000)::bigint,
    'settled_to_ms', ceil(extract(epoch from p_s.settled_to) * 1000)::bigint,
    'next_swing_at_ms', ceil(extract(epoch from p_s.next_swing_at) * 1000)::bigint,
    'swing_index', p_s.swing_index,
    'hours_limit', p_s.hours_limit,
    'leave_at_ms', case when p_s.leave_at is null then null else ceil(extract(epoch from p_s.leave_at) * 1000)::bigint end,
    'change_at_ms', case when p_s.change_at is null then null else ceil(extract(epoch from p_s.change_at) * 1000)::bigint end,
    'change_to', p_s.change_to,
    'bag', coalesce((select jsonb_object_agg(b.item_id, jsonb_build_object(
                       'loaded', b.qty_loaded, 'left', b.qty_left, 'essential', b.essential))
                     from public.hunt_bag b where b.session_id = p_s.id), '{}'::jsonb),
    'enabled', coalesce((select c.enabled from public.hr_hunt_config c where c.id), false),
    -- THE STAMINA POOL AT THE WINDOW START and the cap it rests to (premium).
    'stamina_ms', public.hr_stamina_of(p_s.user_id, p_s.slot, p_s.settled_to),
    'stamina_max_ms', public.hr_stamina_cap(p_s.user_id, p_s.slot, p_s.settled_to),
    -- THE STORE (catalogue) and the ids this hunt's tier resolves food and drink to.
    'basics', coalesce((select jsonb_object_agg(b.basic_id, jsonb_build_object('kind', b.kind, 'price', b.price,
                          'heals', b.heals, 'mana', b.mana, 'partner', b.partner))
                          from public.hr_hunt_basic_supplies b), '{}'::jsonb),
    'shop', (select jsonb_build_object(
               'heal', (select b.basic_id from public.hr_hunt_basic_supplies b where b.kind = 'heal' and t.tier = any (b.tiers)
                          order by b.basic_id limit 1),
               'mana', (select b.basic_id from public.hr_hunt_basic_supplies b where b.kind = 'mana' and t.tier = any (b.tiers)
                          order by b.basic_id limit 1))
               from public.hr_hunt_travel t where t.hunt_id = p_s.hunt_id),
    -- THE HERO'S SETTINGS (options) and BAR, its supply setting and floor.
    'options', coalesce((select a.options from public.player_action_sets a
                          where a.user_id = p_s.user_id and a.slot = p_s.slot and a.preset = p_s.preset), '{}'::jsonb),
    'bar', coalesce((select a.slots from public.player_action_sets a
                      where a.user_id = p_s.user_id and a.slot = p_s.slot and a.preset = p_s.preset), '[]'::jsonb),
    'gold_floor', (public.hr_hunt_supply_of(p_s.user_id, p_s.slot, p_s.preset)->>'gold_floor')::bigint,
    'supply_source', public.hr_hunt_supply_of(p_s.user_id, p_s.slot, p_s.preset)->>'supply_source',
    'on_empty', public.hr_hunt_supply_of(p_s.user_id, p_s.slot, p_s.preset)->>'on_empty',
    -- WHAT SELL-TO-COVER MAY SELL: this session's own loot of the cover items, still in the bag.
    'cover', coalesce((select jsonb_object_agg(c.item_id, jsonb_build_object('unit', c.unit,
                 'avail', greatest(0, least(
                   coalesce((select pi.qty from public.player_inventory pi
                              where pi.user_id = p_s.user_id and pi.slot = p_s.slot and pi.item_id = c.item_id), 0),
                   coalesce((t.loot->>c.item_id)::numeric, 0)::bigint - coalesce((t.covered->>c.item_id)::bigint, 0)))))
                 from public.hr_hunt_cover_items c
                 left join public.hunt_session_tally t on t.session_id = p_s.id
                -- NEVER A LOCKED ITEM (hook: hr_item_locked, 2026-10-25-bag-rules.sql).
                where not public.hr_item_locked(p_s.user_id, p_s.slot, c.item_id)), '{}'::jsonb))
$function$;

-- ── hr_hunt_open_session: no falls limit (a death ends the hunt) ──
drop function if exists public.hr_hunt_open_session(uuid, integer, text, uuid, integer, integer, integer, uuid, timestamp with time zone, integer);
CREATE OR REPLACE FUNCTION public.hr_hunt_open_session(p_user uuid, p_slot integer, p_hunt text, p_prev uuid, p_preset integer, p_hours integer, p_instance uuid, p_from timestamp with time zone, p_seat integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_id   uuid := gen_random_uuid();
  v_keep int := coalesce(public.hr_hunt_limit('sessions_kept'), 20);
  v_preset int := p_preset;
begin
  if coalesce(p_preset, 0) = 0 then
    v_preset := coalesce((select a.preset from public.player_action_sets a
                           where a.user_id = p_user and a.slot = p_slot and jsonb_typeof(a.options->'grounds') = 'array'
                             and a.options->'grounds' @> jsonb_build_array(p_hunt)
                           order by a.preset limit 1), 0);
  end if;
  -- RETENTION: the character keeps its last `sessions_kept` hunts, this one included.
  delete from public.hunt_sessions h
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is not null
     and h.id not in (select x.id from public.hunt_sessions x
                       where x.user_id = p_user and x.slot = p_slot and x.ended_at is not null
                       order by x.entered_at desc, x.id limit greatest(0, v_keep - 1));
  insert into public.hunt_sessions (id, user_id, slot, hunt_id, prev_session_id, preset, hours_limit,
                                    entered_at, hunt_from, settled_to, next_swing_at, instance_id, seat)
  values (v_id, p_user, p_slot, p_hunt, p_prev, v_preset, p_hours, now(), p_from, p_from, p_from, p_instance, p_seat);
  insert into public.hunt_session_tally (session_id, user_id, slot) values (v_id, p_user, p_slot);
  insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
  values (v_id, p_user, p_slot, 'entered', now(), jsonb_build_object('hunt', p_hunt, 'preset', v_preset));
  return v_id;
end $function$;
revoke execute on function public.hr_hunt_open_session(uuid, integer, text, uuid, integer, integer, uuid, timestamp with time zone, integer) from public, anon, authenticated, service_role;

-- ── hr_hunt_new_session: no falls limit ──
drop function if exists public.hr_hunt_new_session(uuid, integer, text, uuid, integer, integer, integer);
CREATE OR REPLACE FUNCTION public.hr_hunt_new_session(p_user uuid, p_slot integer, p_hunt text, p_prev uuid, p_preset integer, p_hours integer)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select public.hr_hunt_open_session(p_user, p_slot, p_hunt, p_prev, p_preset, p_hours, null,
    date_trunc('milliseconds', now() + make_interval(secs => (select travel_s from public.hr_hunt_travel where hunt_id = p_hunt))), 0)
$function$;
revoke execute on function public.hr_hunt_new_session(uuid, integer, text, uuid, integer, integer) from public, anon, authenticated, service_role;

-- ── hr_hunt_swap: no falls limit ──
CREATE OR REPLACE FUNCTION public.hr_hunt_swap(p_session uuid, p_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_s public.hunt_sessions%rowtype; v_new uuid; v_b record;
begin
  select * into v_s from public.hunt_sessions where id = p_session for update;
  if not found or v_s.ended_at is not null or v_s.change_to is null then return null; end if;
  -- The old session ends first so the one-open index admits the new one.
  perform public.hr_hunt_close(p_session, 'changed', p_at, false);
  v_new := public.hr_hunt_new_session(v_s.user_id, v_s.slot, v_s.change_to, p_session,
                                      v_s.preset, v_s.hours_limit);
  for v_b in select item_id, qty_left, essential from public.hunt_bag where session_id = p_session and qty_left > 0 order by item_id loop
    insert into public.hunt_bag (session_id, user_id, slot, item_id, qty_loaded, qty_left, essential)
      values (v_new, v_s.user_id, v_s.slot, v_b.item_id, v_b.qty_left, v_b.qty_left, v_b.essential);
    perform public.hr_hunt_ledger_pair(v_s.user_id, v_s.slot, p_session, v_new, v_b.item_id, v_b.qty_left, 'hunt_move');
  end loop;
  update public.hunt_bag set qty_left = 0 where session_id = p_session and qty_left > 0;
  perform public.hr_hunt_point(v_s.user_id, v_s.slot, v_s.change_to);
  return v_new;
end $function$;

-- ── hr_hunt_enter_for: no falls limit ──
drop function if exists public.hr_hunt_enter_for(uuid, integer, text, jsonb, integer, integer, integer);
CREATE OR REPLACE FUNCTION public.hr_hunt_enter_for(p_uid uuid, p_slot integer, p_hunt text, p_bag jsonb, p_preset integer, p_hours integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_uid  uuid := p_uid;
  v_r    jsonb;
  v_s    public.hunt_sessions%rowtype;
  v_st   public.player_state%rowtype;
  v_lines int := public.hr_hunt_limit('bag_lines');
  v_line jsonb; v_item text; v_qty bigint; v_ess boolean; v_have bigint;
  v_items text[] := '{}';
  v_id uuid;
  v_party uuid; v_p public.hunt_parties%rowtype; v_seat int := 0;
  v_i    public.hunt_instances%rowtype;
  v_from timestamptz; v_tick bigint;
begin
  if v_uid is null or p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if not coalesce((select enabled from public.hr_hunt_config where id), false) then
    return jsonb_build_object('ok', false, 'error', 'hunts_paused'); end if;
  if p_hunt is null or not exists (select 1 from public.hr_hunt_travel where hunt_id = p_hunt) then
    return jsonb_build_object('ok', false, 'error', 'unknown_hunt'); end if;
  -- A HUNT IS FOUGHT ON A GROUND: no ground, no world, no hunt (spec §1.1).
  if not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = p_hunt) then
    return jsonb_build_object('ok', false, 'error', 'no_ground'); end if;
  if p_preset is null or p_preset < 0 or p_preset >= public.hr_hunt_limit('presets') then
    return jsonb_build_object('ok', false, 'error', 'bad_preset'); end if;
  if p_hours is not null and (p_hours < public.hr_hunt_limit('hours_min') or p_hours > public.hr_hunt_limit('hours_max')) then
    return jsonb_build_object('ok', false, 'error', 'bad_hours'); end if;
  -- THE BAG, shape only (stock is checked under the lock).
  if p_bag is null then p_bag := '[]'::jsonb; end if;
  if jsonb_typeof(p_bag) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'bad_bag'); end if;
  if jsonb_array_length(p_bag) > v_lines then
    return jsonb_build_object('ok', false, 'error', 'too_many_lines', 'max', v_lines); end if;
  for v_line in select value from jsonb_array_elements(p_bag) loop
    if jsonb_typeof(v_line) <> 'object' or exists (select 1 from jsonb_object_keys(v_line) k where k not in ('item', 'qty', 'essential'))
       or jsonb_typeof(v_line->'item') is distinct from 'string' or jsonb_typeof(v_line->'qty') is distinct from 'number'
       or (v_line ? 'essential' and jsonb_typeof(v_line->'essential') <> 'boolean') then
      return jsonb_build_object('ok', false, 'error', 'bad_bag'); end if;
    v_item := v_line->>'item';
    if not exists (select 1 from public.hr_hunt_supplies where item_id = v_item) then
      return jsonb_build_object('ok', false, 'error', 'unknown_supply', 'item', left(v_item, 64)); end if;
    if v_item = any (v_items) then
      return jsonb_build_object('ok', false, 'error', 'duplicate_line', 'item', v_item); end if;
    v_items := v_items || v_item;
    if (v_line->>'qty') !~ '^[0-9]{1,7}$' or (v_line->>'qty')::bigint < 1 or (v_line->>'qty')::bigint > 100000 then
      return jsonb_build_object('ok', false, 'error', 'bad_qty', 'item', v_item); end if;
  end loop;

  -- THE PARTY ROW FIRST (lock order: party, then character), then the character.
  v_party := public.hr_hunt_party_of(v_uid, p_slot);
  if v_party is not null then
    select * into v_p from public.hunt_parties where id = v_party for update;
    if v_p.hunt_id <> p_hunt then
      return jsonb_build_object('ok', false, 'error', 'party_hunt_mismatch', 'hunt', v_p.hunt_id); end if;
    select m.seat into v_seat from public.hunt_party_members m where m.party_id = v_party and m.user_id = v_uid and m.slot = p_slot;
  end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  select * into v_st from public.player_state where user_id = v_uid and slot = p_slot;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if v_s.id is not null then
    return jsonb_build_object('ok', false, 'error', 'hunt_open', 'session', v_s.id); end if;
  if v_st.active_kind <> 'idle' then
    return jsonb_build_object('ok', false, 'error', 'activity_running', 'active_kind', v_st.active_kind); end if;
  if p_preset <> 0 and not exists (select 1 from public.player_action_sets a where a.user_id = v_uid and a.slot = p_slot and a.preset = p_preset) then
    return jsonb_build_object('ok', false, 'error', 'unknown_preset'); end if;
  v_r := public.hr_hunt_admit(v_uid, p_slot, p_hunt);
  if v_r is not null then return v_r; end if;
  -- STAMINA: an empty pool cannot start a hunt.
  if coalesce(public.hr_stamina_of(v_uid, p_slot, now()), 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_stamina'); end if;
  for v_line in select value from jsonb_array_elements(p_bag) loop
    select qty into v_have from public.player_inventory
     where user_id = v_uid and slot = p_slot and item_id = v_line->>'item' for update;
    if coalesce(v_have, 0) < (v_line->>'qty')::bigint then
      return jsonb_build_object('ok', false, 'error', 'insufficient_item',
        'item', v_line->>'item', 'have', coalesce(v_have, 0), 'need', (v_line->>'qty')::bigint); end if;
  end loop;

  -- THE ARRIVAL: after the walk; a party member's on the instance's boundaries.
  v_from := date_trunc('milliseconds', now() + make_interval(secs => (select travel_s from public.hr_hunt_travel where hunt_id = p_hunt)));
  if v_party is not null then
    v_tick := public.hr_hunt_limit('swing_interval_ms');
    select * into v_i from public.hunt_instances where id = v_party for update;
    if not found then
      insert into public.hunt_instances (id, hunt_id, kind, settled_to, next_swing_at)
        values (v_party, p_hunt, 'party', v_from, v_from);
    elsif not exists (select 1 from public.hunt_sessions h where h.instance_id = v_party and h.ended_at is null) then
      -- No open session: the instance restarts its clock here, with no world (the
      -- swing counter keeps counting forward).
      update public.hunt_instances set world = null, settled_to = v_from, next_swing_at = v_from, version = version + 1
       where id = v_party;
    else
      v_from := v_i.next_swing_at + make_interval(secs => ceil(greatest(0, extract(epoch from (v_from - v_i.next_swing_at)) * 1000)
                                                               / v_tick) * v_tick / 1000.0);
    end if;
  end if;
  v_id := public.hr_hunt_open_session(v_uid, p_slot, p_hunt, null, p_preset, p_hours, v_party, v_from, coalesce(v_seat, 0));
  for v_line in select value from jsonb_array_elements(p_bag) loop
    v_item := v_line->>'item'; v_qty := (v_line->>'qty')::bigint;
    v_ess := coalesce((v_line->>'essential')::boolean, (select essential from public.hr_hunt_supplies where item_id = v_item));
    update public.player_inventory set qty = qty - v_qty
     where user_id = v_uid and slot = p_slot and item_id = v_item and qty > v_qty;
    if not found then
      delete from public.player_inventory where user_id = v_uid and slot = p_slot and item_id = v_item and qty = v_qty;
    end if;
    insert into public.hunt_bag (session_id, user_id, slot, item_id, qty_loaded, qty_left, essential)
      values (v_id, v_uid, p_slot, v_item, v_qty, v_qty, v_ess);
    perform public.hr_hunt_ledger_pair(v_uid, p_slot, null, v_id, v_item, v_qty, 'hunt_pack');
  end loop;
  perform public.hr_hunt_point(v_uid, p_slot, p_hunt);
  update public.hunt_sessions set version = version + 1 where id = v_id;

  -- THE FLOOR IS A WARNING (Tyler 2026-10-18; 2026-10-25-hunt-floor-warning.sql): admitted under
  -- band[0] within the margin, the answer says so and the picker warns.
  return jsonb_build_object('ok', true, 'session_id', v_id, 'session', public.hr_hunt_view(v_id),
                            'version', (select version from public.player_state where user_id = v_uid and slot = p_slot),
                            'below_range', public.hr_hunt_below_range(v_uid, p_slot, p_hunt));
end $function$;
revoke execute on function public.hr_hunt_enter_for(uuid, integer, text, jsonb, integer, integer) from public, anon, authenticated, service_role;

-- ── hr_hunt_party_start: no falls limit ──
CREATE OR REPLACE FUNCTION public.hr_hunt_party_start(p_slot integer, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_verb constant text := 'hunt_party_start';
  v_uid uuid := auth.uid(); v_r jsonb; v_pid uuid; v_p public.hunt_parties%rowtype;
  v_m record; v_last public.hunt_sessions%rowtype; v_not jsonb := '[]'::jsonb; v_n int := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_pid := public.hr_hunt_party_of(v_uid, p_slot);
  if v_pid is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  select * into v_p from public.hunt_parties where id = v_pid for update;
  if v_p.closed_at is not null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  if not (v_p.leader_user = v_uid and v_p.leader_slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_leader')); end if;
  -- EVERY MEMBER OR NONE: one subtransaction, rolled back when any seat cannot enter.
  begin
    for v_m in select m.user_id, m.slot, m.seat from public.hunt_party_members m where m.party_id = v_pid order by m.seat loop
      continue when exists (select 1 from public.hunt_sessions h where h.user_id = v_m.user_id and h.slot = v_m.slot
                              and h.ended_at is null and h.instance_id = v_pid);
      select * into v_last from public.hunt_sessions h where h.user_id = v_m.user_id and h.slot = v_m.slot
       order by h.entered_at desc, h.id limit 1;
      v_r := public.hr_hunt_enter_for(v_m.user_id, v_m.slot, v_p.hunt_id, public.hr_hunt_saved_bag(v_m.user_id, v_m.slot),
                                      public.hr_hunt_active_set(v_m.user_id, v_m.slot), v_last.hours_limit);
      if coalesce(v_r->>'ok', 'false') = 'true' then v_n := v_n + 1;
      else v_not := v_not || jsonb_build_array(jsonb_build_object('seat', v_m.seat, 'name', public.hr_character_name(v_m.user_id, v_m.slot),
                                                                  'error', v_r->>'error'));
      end if;
    end loop;
    if jsonb_array_length(v_not) > 0 then raise exception using errcode = 'HR878', message = 'not_ready'; end if;
  exception when sqlstate 'HR878' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_ready', 'seats', v_not));
  end;
  if v_n = 0 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'already_hunting')); end if;
  v_r := jsonb_build_object('ok', true, 'entered', v_n, 'party', public.hr_hunt_party_view(v_uid, p_slot));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $function$;

-- ── hr_hunt_restart: no falls limit ──
CREATE OR REPLACE FUNCTION public.hr_hunt_restart(p_slot integer, p_session uuid, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_s public.hunt_sessions%rowtype; v_bag jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('hunt_restart', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('hunt_restart', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_session is null then return public.hr_note_rejection('hunt_restart', p_slot, jsonb_build_object('ok', false, 'error', 'bad_session')); end if;
  v_verb := 'hunt_restart:' || p_session;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('hunt_restart', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if public.hr_hunt_party_of(v_uid, p_slot) is not null then
    return public.hr_note_rejection('hunt_restart', p_slot, jsonb_build_object('ok', false, 'error', 'party_hunt')); end if;
  select * into v_s from public.hunt_sessions h where h.user_id = v_uid and h.slot = p_slot order by h.entered_at desc, h.id limit 1;
  if v_s.id is distinct from p_session or v_s.ended_at is null then
    return public.hr_note_rejection('hunt_restart', p_slot, jsonb_build_object('ok', false, 'error', 'not_latest')); end if;
  -- That session's bag, each line at most what is held now.
  select coalesce(jsonb_agg(jsonb_build_object('item', b.item_id, 'qty', least(b.qty_loaded, pi.qty), 'essential', b.essential)
                            order by b.essential desc, b.item_id), '[]'::jsonb)
    into v_bag
    from public.hunt_bag b
    join public.player_inventory pi on pi.user_id = v_uid and pi.slot = p_slot and pi.item_id = b.item_id and pi.qty > 0
   where b.session_id = v_s.id and b.qty_loaded > 0;
  v_r := public.hr_hunt_enter_for(v_uid, p_slot, v_s.hunt_id, v_bag, v_s.preset, v_s.hours_limit);
  if coalesce(v_r->>'ok', 'false') <> 'true' then return public.hr_note_rejection('hunt_restart', p_slot, v_r); end if;
  v_r := jsonb_build_object('ok', true, 'session', v_r->'session', 'version', v_r->'version');
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $function$;

-- ── hr_hunt_view: no falls, no knockout, no down time ──
CREATE OR REPLACE FUNCTION public.hr_hunt_view(p_session uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select jsonb_build_object(
    'id', s.id, 'hunt', s.hunt_id, 'prev', s.prev_session_id, 'preset', s.preset,
    'hours_limit', s.hours_limit,
    'entered_at', s.entered_at, 'hunt_from', s.hunt_from, 'settled_to', s.settled_to,
    'instance', s.instance_id, 'unit', s.unit_id, 'seat', s.seat,
    'leave_at', s.leave_at, 'change_at', s.change_at, 'change_to', s.change_to,
    'ended_at', s.ended_at, 'end_reason', s.end_reason, 'home_at',
    case when s.ended_at is not null then s.ended_at + make_interval(secs => coalesce(
      (select travel_s from public.hr_hunt_travel t where t.hunt_id = s.hunt_id), 0)) end,
    'seen_event_id', s.seen_event_id, 'version', s.version,
    'phase', case when s.ended_at is not null then 'ended'
                  when s.leave_at is not null or s.change_at is not null then 'leaving'
                  when now() < s.hunt_from then 'walking' else 'hunting' end,
    'bag', coalesce((select jsonb_agg(jsonb_build_object('item', b.item_id, 'loaded', b.qty_loaded,
                       'left', b.qty_left, 'essential', b.essential) order by b.item_id)
                     from public.hunt_bag b where b.session_id = s.id), '[]'::jsonb),
    'tally', (select jsonb_build_object('kills', t.kills, 'xp', t.xp, 'coins', t.coins, 'loot', t.loot,
                       'supplies', t.supplies, 'deaths', t.deaths, 'paid_ms', t.paid_ms,
                       'bought', t.bought, 'supply_gold', t.supply_gold)
              from public.hunt_session_tally t where t.session_id = s.id))
  from public.hunt_sessions s where s.id = p_session
$function$;

-- ── hr_hunt_section_view: the hero's Level, Level progress and derived vitals; Prayer's regen rate; no falls ──
CREATE OR REPLACE FUNCTION public.hr_hunt_section_view(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  s       public.hunt_sessions%rowtype;
  i       public.hunt_instances%rowtype;
  ps      public.player_state%rowtype;
  v_shape public.hr_hunt_world_shape%rowtype;
  v_wj    jsonb;
  v_uf    jsonb;
  v_units jsonb := '[]'::jsonb;
  v_me    jsonb;
  v_u     jsonb;
  v_side  text;
  v_kind  text;
  v_pose  jsonb;
  v_hpx   bigint;
  v_lv    int;
  v_lo    bigint;
  v_hi    bigint;
  v_hpmax numeric;
  v_mpmax numeric;
  v_vit   jsonb;
begin
  select * into s from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot
   order by (h.ended_at is null) desc, h.entered_at desc, h.id limit 1;
  if s.id is null then return null; end if;
  select * into i from public.hunt_instances where id = s.instance_id;
  select * into ps from public.player_state where user_id = p_user and slot = p_slot;
  select * into v_shape from public.hr_hunt_world_shape where id;
  if s.ended_at is null and i.world is not null then
    begin
      v_wj := i.world::jsonb;
    exception when others then
      v_wj := null;
    end;
  end if;
  if v_wj is not null and jsonb_typeof(v_wj) = 'object' and v_shape.id
     and (v_wj->>'v') = v_shape.version::text and (v_wj->>'s') = v_shape.shape::text
     and jsonb_typeof(v_wj->'u') = 'array' then
    v_uf := v_shape.fields->'unit';
    for v_u in select e from jsonb_array_elements(v_wj->'u') e loop
      v_side := case when v_u->>((v_uf->>'side')::int) = 'hero' then 'hero' else 'monster' end;
      v_kind := v_u->>((v_uf->>'kind')::int);
      v_units := v_units || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'u', v_u->((v_uf->>'id')::int), 'side', v_side,
        'kind', case when v_side = 'monster' then v_kind end,
        'boss', case when v_side = 'monster' then exists (select 1 from public.hr_activities a
                                                            where a.kind = 'combat' and a.activity_id = v_kind and a.is_boss) end,
        'alive', v_u->((v_uf->>'alive')::int),
        'x', v_u->((v_uf->>'x')::int), 'y', v_u->((v_uf->>'y')::int),
        'hp', v_u->((v_uf->>'hp')::int), 'hp_max', v_u->((v_uf->>'maxHp')::int))));
      if v_side = 'hero' and s.unit_id is not null and (v_u->>((v_uf->>'id')::int))::int = s.unit_id then v_me := v_u; end if;
    end loop;
    v_pose := jsonb_build_object('at_ms', floor(extract(epoch from i.settled_to) * 1000)::bigint,
                                 'world_swing', i.world_swing, 'units', v_units);
  end if;
  -- LEVEL progress through its current Level (CORE_MODEL.md §2: kills only).
  v_vit := public.hr_vitals_of(p_user, p_slot);
  v_hpx := ps.level_xp;
  v_lv := (v_vit->>'level')::int;
  v_lo := public.hr_char_xp_for_level(v_lv);
  v_hi := public.hr_char_xp_for_level(v_lv + 1);
  v_hpmax := coalesce((v_me->>((v_uf->>'maxHp')::int))::numeric, (v_vit->>'max_hp')::numeric);
  v_mpmax := coalesce((v_me->>((v_uf->>'maxMana')::int))::numeric, (v_vit->>'max_mana')::numeric);
  return jsonb_build_object(
    'session_id', s.id, 'hunt_id', s.hunt_id, 'ended', s.ended_at is not null,
    'hero', jsonb_build_object(
      'unit', s.unit_id,
      'name', public.hr_character_name(p_user, p_slot),
      'level', v_lv,
      'hp', coalesce(v_me->((v_uf->>'hp')::int), to_jsonb(ps.hp)),
      'hp_max', to_jsonb(v_hpmax),
      'mana', v_me->((v_uf->>'mana')::int), 'mana_max', to_jsonb(v_mpmax),
      -- Per minute, at rest, times Prayer's regen rate (permille, hr_regen_permille).
      'hp_regen', floor(v_hpmax * public.hr_hunt_limit('ooc_regen_permille_s') * 60 * (v_vit->>'regen_pm')::int / 1000000)::bigint,
      'mana_regen', case when v_mpmax is not null then floor(v_mpmax * public.hr_hunt_limit('mana_regen_pct_min') * (v_vit->>'regen_pm')::int / 100000)::bigint end,
      'regen_pm', (v_vit->>'regen_pm')::int,
      'shield', v_me->((v_uf->>'shield')::int),
      'xp_pct', case when v_hi is not null and v_hi > v_lo then round(least(1, greatest(0, (v_hpx - v_lo)::numeric / (v_hi - v_lo))), 4) end),
    'pose', v_pose,
    'loot', coalesce((select jsonb_agg(jsonb_build_object('item', l.key, 'count', floor(l.value::numeric)::bigint) order by l.key)
                        from public.hunt_session_tally t, jsonb_each_text(coalesce(t.loot, '{}'::jsonb)) l
                       where t.session_id = s.id and l.value ~ '^[0-9]+(\.[0-9]+)?$' and l.value::numeric >= 1), '[]'::jsonb),
    'session', public.hr_hunt_view(s.id),
    'instance', jsonb_build_object('id', i.id, 'kind', i.kind, 'world_swing', i.world_swing, 'settled_to', i.settled_to));
end $function$;

-- ── hr_hunt_party_view: Level and derived max HP; no knockout (a dead hero leaves at its boundary) ──
CREATE OR REPLACE FUNCTION public.hr_hunt_party_view(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_pid   uuid := public.hr_hunt_party_of(p_user, p_slot);
  v_p     public.hunt_parties%rowtype;
  v_own   public.hunt_sessions%rowtype;
  v_inst  uuid;
  v_shape public.hr_hunt_world_shape%rowtype;
  v_wj    jsonb;
  v_uf    jsonb;
  v_vit   jsonb := '{}'::jsonb;
  v_lead  int;
  v_self  int;
  v_sseat int;
  v_lseat int;
  v_mem   jsonb := '[]'::jsonb;
  v_r     record;
  v_u     jsonb;
  v_id    int;
  v_t     int;
  v_v     jsonb;
  v_secs  numeric;
begin
  select * into v_own from public.hunt_sessions h
   where h.user_id = p_user and h.slot = p_slot and h.ended_at is null order by h.entered_at desc limit 1;
  if v_pid is null and v_own.id is null then return null; end if;
  if v_pid is not null then
    select * into v_p from public.hunt_parties where id = v_pid;
    v_inst := v_pid;
  else
    v_inst := v_own.instance_id;
  end if;

  -- The pose's hero vitals by unit id, and which heroes a living monster is on.
  select * into v_shape from public.hr_hunt_world_shape where id;
  begin
    select i.world::jsonb into v_wj from public.hunt_instances i where i.id = v_inst;
  exception when others then
    v_wj := null;
  end;
  if v_wj is not null and jsonb_typeof(v_wj) = 'object' and v_shape.id
     and (v_wj->>'v') = v_shape.version::text and (v_wj->>'s') = v_shape.shape::text then
    v_uf := v_shape.fields->'unit';
    if jsonb_typeof(v_wj->'w'->((v_shape.fields->'world'->>'leader')::int)) = 'number' then
      v_lead := (v_wj->'w'->>((v_shape.fields->'world'->>'leader')::int))::int;
    end if;
    for v_u in select e from jsonb_array_elements(case when jsonb_typeof(v_wj->'u') = 'array' then v_wj->'u' else '[]'::jsonb end) e loop
      v_id := (v_u->>((v_uf->>'id')::int))::int;
      if v_u->>((v_uf->>'side')::int) = 'hero' then
        v_v := jsonb_build_object(
          'hp', v_u->((v_uf->>'hp')::int), 'hp_max', v_u->((v_uf->>'maxHp')::int),
          'mana', v_u->((v_uf->>'mana')::int), 'mana_max', v_u->((v_uf->>'maxMana')::int),
          'eating', jsonb_typeof(v_u->((v_uf->>'otHp')::int)) = 'array',
          'drinking', jsonb_typeof(v_u->((v_uf->>'otMana')::int)) = 'array');
        v_vit := v_vit || jsonb_build_object(v_id::text, coalesce(v_vit->(v_id::text), '{}'::jsonb) || v_v);
      elsif (v_u->>((v_uf->>'alive')::int)) = 'true' and jsonb_typeof(v_u->((v_uf->>'target')::int)) = 'number' then
        v_t := (v_u->>((v_uf->>'target')::int))::int;
        v_vit := v_vit || jsonb_build_object(v_t::text, coalesce(v_vit->(v_t::text), '{}'::jsonb) || jsonb_build_object('aggro', true));
      end if;
    end loop;
  end if;

  for v_r in
    select m.user_id, m.slot, m.seat::int as seat, m.weapon_type as weapon, h.id as sid, h.unit_id, h.preset,
           h.hunt_from, h.settled_to
      from public.hunt_party_members m
      left join public.hunt_sessions h on h.user_id = m.user_id and h.slot = m.slot and h.ended_at is null and h.instance_id = v_pid
     where v_pid is not null and m.party_id = v_pid
    union all
    select p_user, p_slot, 0, public.hr_hunt_weapon_of(p_user, p_slot), v_own.id, v_own.unit_id, v_own.preset,
           v_own.hunt_from, v_own.settled_to
     where v_pid is null
     order by 3
  loop
    v_v := case when v_r.unit_id is not null then coalesce(v_vit->(v_r.unit_id::text), '{}'::jsonb) else '{}'::jsonb end;
    v_secs := greatest(0, extract(epoch from (v_r.settled_to - v_r.hunt_from)));
    select jsonb_build_object(
        'unit', v_r.unit_id, 'seat', v_r.seat, 'hunting', v_r.sid is not null,
        'name', public.hr_character_name(v_r.user_id, v_r.slot),
        'level', public.hr_level_of(v_r.user_id, v_r.slot),
        'weapon', v_r.weapon,
        'role_pick', (select a.options->>'role' from public.player_action_sets a
                       where a.user_id = v_r.user_id and a.slot = v_r.slot and a.preset = coalesce(v_r.preset, 0)),
        'hp', case when v_r.sid is not null then coalesce(v_v->'hp', to_jsonb(ps.hp)) end,
        'hp_max', case when v_r.sid is not null then coalesce(v_v->'hp_max', to_jsonb(public.hr_vitals_of(v_r.user_id, v_r.slot)->'max_hp')) end,
        'mana', v_v->'mana', 'mana_max', v_v->'mana_max',
        'dealt', case when v_r.sid is not null then coalesce((t.dealt->>'total')::bigint, 0) end,
        'healed', case when v_r.sid is not null then coalesce((t.healed->>'total')::bigint, 0) end,
        'dps', case when v_r.sid is not null and v_secs > 0 then round(coalesce((t.dealt->>'total')::numeric, 0) / v_secs, 1) end,
        'hps', case when v_r.sid is not null and v_secs > 0 then round(coalesce((t.healed->>'total')::numeric, 0) / v_secs, 1) end,
        'eating', coalesce((v_v->>'eating')::boolean, false),
        'drinking', coalesce((v_v->>'drinking')::boolean, false), 'aggro', coalesce((v_v->>'aggro')::boolean, false))
      into v_u
      from public.player_state ps
      left join public.hunt_session_tally t on t.session_id = v_r.sid
     where ps.user_id = v_r.user_id and ps.slot = v_r.slot;
    if v_u is not null then v_mem := v_mem || jsonb_build_array(v_u); end if;
    if v_r.user_id = p_user and v_r.slot = p_slot then v_self := v_r.unit_id; v_sseat := v_r.seat; end if;
    if v_pid is null or (v_r.user_id = v_p.leader_user and v_r.slot = v_p.leader_slot) then v_lseat := v_r.seat; end if;
  end loop;

  -- The leader: the pose's pull leader, else the party leader's unit, else (solo) self.
  if v_lead is null then
    v_lead := case when v_pid is null then v_self
                   else (select h.unit_id from public.hunt_sessions h
                          where h.user_id = v_p.leader_user and h.slot = v_p.leader_slot and h.ended_at is null
                            and h.instance_id = v_pid) end;
  end if;
  return jsonb_build_object(
    'id', v_pid, 'hunt', coalesce(v_p.hunt_id, v_own.hunt_id),
    'max', coalesce(v_p.max_size::int, 1),
    'open', v_pid is not null and jsonb_array_length(v_mem) < v_p.max_size,
    'leader', v_lead, 'self', v_self, 'leader_seat', v_lseat, 'self_seat', v_sseat, 'members', v_mem);
end $function$;

-- ── hr_blessing_buy: the character's Level (hr_level_of), not the retired combat level ──
CREATE OR REPLACE FUNCTION public.hr_blessing_buy(p_slot integer, p_tier integer, p_price bigint, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_lv int; v_price bigint; v_a jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_tier is null or p_price is null or p_price < 0 or p_price > 1000000000 then
    return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  v_verb := 'blessing_buy:' || p_tier;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('blessing_buy', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.hr_blessing_tiers t where t.tier = p_tier) then
    return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_tier')); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if exists (select 1 from public.player_blessings b where b.user_id = v_uid and b.slot = p_slot and b.tier = p_tier) then
    return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'already_blessed')); end if;
  if exists (select 1 from public.hr_blessing_tiers t where t.tier < p_tier
               and not exists (select 1 from public.player_blessings b where b.user_id = v_uid and b.slot = p_slot and b.tier = t.tier)) then
    return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'needs_previous')); end if;
  v_lv := greatest(1, coalesce(public.hr_level_of(v_uid, p_slot), 1));
  v_price := public.hr_blessing_price(p_tier, v_lv);
  if v_price is distinct from p_price then
    return public.hr_note_rejection('blessing_buy', p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed',
      'blessings', public.hr_blessings_view(v_uid, p_slot))); end if;
  if v_price > 0 then
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object('gold', -v_price,
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'blessing_buy', 'tier', p_tier, 'level', v_lv))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      return public.hr_note_rejection('blessing_buy', p_slot, v_a || jsonb_build_object('ok', false)); end if;
  else
    insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
      values (v_uid, p_slot, 'shop', v_verb, 0, jsonb_build_object('reason', 'blessing_buy', 'tier', p_tier, 'level', v_lv, 'free', true));
  end if;
  insert into public.player_blessings (user_id, slot, tier, paid, bought_at) values (v_uid, p_slot, p_tier, v_price, now());
  v_r := jsonb_build_object('ok', true, 'gold', -v_price, 'blessings', public.hr_blessings_view(v_uid, p_slot));
  if v_price = 0 then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  end if;
  return v_r;
end $function$;

-- ── hr_blessings_view: the character's Level (hr_level_of), not the retired combat level ──
CREATE OR REPLACE FUNCTION public.hr_blessings_view(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  with lv as (select greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1)) as level)
  select jsonb_build_object(
    'held', coalesce((select jsonb_agg(b.tier order by b.tier) from public.player_blessings b where b.user_id = p_user and b.slot = p_slot), '[]'::jsonb),
    'permille', coalesce((select max(t.permille) from public.player_blessings b join public.hr_blessing_tiers t on t.tier = b.tier
                           where b.user_id = p_user and b.slot = p_slot), 0),
    'free_until', (select r.free_until_level from public.hr_blessing_rule r where r.id),
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('tier', t.tier, 'permille', t.permille,
                                                           'price', public.hr_blessing_price(t.tier, lv.level),
                                                           'held', exists (select 1 from public.player_blessings b
                                                                            where b.user_id = p_user and b.slot = p_slot and b.tier = t.tier))
                                         order by t.tier)
                         from public.hr_blessing_tiers t, lv), '[]'::jsonb))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$function$;

-- ── hr_stamina_refill_quote: the character's Level (hr_level_of), not the retired combat level ──
CREATE OR REPLACE FUNCTION public.hr_stamina_refill_quote(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
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
  v_lv := greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1));
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
end $function$;

-- ── hr_hunt_gate: the character's Level (hr_level_of), not the retired combat level ──
CREATE OR REPLACE FUNCTION public.hr_hunt_gate(p_user uuid, p_slot integer, p_hunt text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_min    int;
  v_cl     int;
  v_refuse int := public.hr_hunt_limit('below_range_refuse');
begin
  select band_min into v_min from public.hr_hunts where hunt_id = p_hunt;
  if v_min is null then
    perform public.hr_reject('unknown_activity', jsonb_build_object('kind', 'combat', 'id', p_hunt));
  end if;
  v_cl := coalesce(public.hr_level_of(p_user, p_slot), 0);
  -- THE FLOOR IS A WARNING (Tyler 2026-10-18): refused only this far under it.
  -- No limit row = the old hard floor (fail closed).
  if v_min - v_cl >= coalesce(v_refuse, 1) then
    perform public.hr_reject('activity_locked',
      jsonb_build_object('id', p_hunt, 'combat_level', v_cl, 'band_min', v_min, 'refuse_under', coalesce(v_refuse, 1)));
  end if;
  -- SECURITY C2: every spawn's OWN gate is asked too (defence in depth; the
  -- generator and the catalogue self-check refuse a gated spawn outright). A
  -- boss is never a spawn; a skill-gated monster needs its skill level.
  if exists (
    select 1 from public.hr_hunt_spawns s
      join public.hr_activities a on a.kind = 'combat' and a.activity_id = s.monster_id
     where s.hunt_id = p_hunt
       and (a.is_boss
            or (a.req_skill is not null and a.req_lv is not null
                and coalesce((select public.hr_level_from_xp(ps.xp) from public.player_skills ps
                               where ps.user_id = p_user and ps.slot = p_slot
                                 and ps.skill_id = a.req_skill), 1) < a.req_lv)))
  then
    perform public.hr_reject('activity_locked', jsonb_build_object('id', p_hunt, 'spawn_gate', true));
  end if;
end $function$;

-- ── hr_hunt_below_range: the character's Level (hr_level_of), not the retired combat level ──
CREATE OR REPLACE FUNCTION public.hr_hunt_below_range(p_user uuid, p_slot integer, p_hunt text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select coalesce((select h.band_min > coalesce(public.hr_level_of(p_user, p_slot), 0)
                     from public.hr_hunts h
                    where h.hunt_id = p_hunt
                      and not coalesce((select t.training from public.hr_hunt_travel t where t.hunt_id = p_hunt), false)), false)
$function$;

-- ── hr_chat_send: the character's Level (hr_level_of), not the retired combat level ──
CREATE OR REPLACE FUNCTION public.hr_chat_send(p_slot integer, p_kind text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_uid uuid := auth.uid(); v_body text; v_fault text; v_channel text; v_pid uuid; v_aud uuid[];
  v_row public.chat_messages%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_kind is null or p_kind not in ('global', 'local', 'party') then return jsonb_build_object('ok', false, 'error', 'bad_channel'); end if;
  v_body := public.hr_chat_clean(p_body);
  v_fault := public.hr_chat_body_fault(v_body);
  if v_fault is not null then return jsonb_build_object('ok', false, 'error', v_fault); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if not public.hr_rate_ok(v_uid, 'chat:burst', 5, interval '10 seconds') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_rate_ok(v_uid, 'chat:send', 20, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if p_kind = 'global' then
    v_channel := 'global';
  elsif p_kind = 'local' then
    v_channel := public.hr_chat_zone_of(v_uid, p_slot);
  else
    v_pid := public.hr_hunt_party_of(v_uid, p_slot);
    if v_pid is null then return jsonb_build_object('ok', false, 'error', 'not_in_party'); end if;
    v_channel := 'party:' || v_pid::text;
    select array_agg(distinct m.user_id) into v_aud from public.hunt_party_members m where m.party_id = v_pid;
  end if;
  -- from_id and from_name are overwritten by hr_chat_name_authority from the session and profiles.
  insert into public.chat_messages (channel, from_id, from_name, body, from_slot, from_level, from_weapon, from_role, audience)
  values (v_channel, v_uid, 'Adventurer', v_body, p_slot,
          public.hr_level_of(v_uid, p_slot), public.hr_hunt_weapon_of(v_uid, p_slot),
          public.hr_chat_role_pick(v_uid, p_slot), v_aud)
  returning * into v_row;
  return jsonb_build_object('ok', true, 'line', public.hr_chat_row(v_row));
end $function$;

-- ── hr_whisper_send: the character's Level (hr_level_of), not the retired combat level ──
CREATE OR REPLACE FUNCTION public.hr_whisper_send(p_slot integer, p_target text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_to uuid; v_body text; v_fault text; v_row public.chat_whispers%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if p_slot is null or p_slot < 0 or p_slot > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  v_body := public.hr_chat_clean(p_body);
  v_fault := public.hr_chat_body_fault(v_body);
  if v_fault is not null then return jsonb_build_object('ok', false, 'error', v_fault); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  if not public.hr_rate_ok(v_uid, 'whisper:burst', 5, interval '10 seconds') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_rate_ok(v_uid, 'whisper:send', 20, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_to := public.hr_social_resolve(p_target);
  if v_to is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if v_to = v_uid then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if public.hr_social_blocked(v_uid, v_to) or not public.hr_admitted(v_to) then
    return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  insert into public.chat_whispers (from_id, from_slot, from_name, from_level, from_weapon, from_role, to_id, to_name, body)
  values (v_uid, p_slot, public.hr_social_name(v_uid), public.hr_level_of(v_uid, p_slot),
          public.hr_hunt_weapon_of(v_uid, p_slot), public.hr_chat_role_pick(v_uid, p_slot),
          v_to, public.hr_social_name(v_to), v_body)
  returning * into v_row;
  return jsonb_build_object('ok', true, 'line', public.hr_whisper_row(v_row));
end $function$;

-- ── hr_inspect: the character's Level (hr_level_of), not the retired combat level ──
CREATE OR REPLACE FUNCTION public.hr_inspect(p_target text, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_uid uuid := auth.uid(); v_t uuid; v_slot int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_rate_ok(v_uid, 'inspect', 30, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_t := public.hr_social_resolve(p_target);
  if v_t is null then return jsonb_build_object('ok', false, 'error', 'no_player'); end if;
  if v_t <> v_uid and (public.hr_social_blocked(v_uid, v_t) or not public.hr_admitted(v_t)) then
    return jsonb_build_object('ok', false, 'error', 'unavailable'); end if;
  v_slot := coalesce((select ps.slot from public.player_state ps where ps.user_id = v_t and ps.slot = p_slot),
                     (select sp.slot from public.social_presence sp join public.player_state ps
                         on ps.user_id = sp.user_id and ps.slot = sp.slot where sp.user_id = v_t),
                     (select min(ps.slot) from public.player_state ps where ps.user_id = v_t));
  if v_slot is null then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  return jsonb_build_object('ok', true, 'id', v_t, 'name', public.hr_social_name(v_t), 'slot', v_slot,
    'level', public.hr_level_of(v_t, v_slot), 'weapon', public.hr_hunt_weapon_of(v_t, v_slot),
    'role', public.hr_chat_role_pick(v_t, v_slot),
    'gear', coalesce((select jsonb_agg(jsonb_build_object('slot', e.equip_slot, 'item', e.item_id) order by e.equip_slot)
                        from public.player_equipment e where e.user_id = v_t and e.slot = v_slot), '[]'::jsonb));
end $function$;

-- ── hr_town_walkers: the character's Level (hr_level_of), not the retired combat level ──
CREATE OR REPLACE FUNCTION public.hr_town_walkers(p_map text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- Fresh: the client re-publishes a standing body every 10 s, so three missed
  -- keepalives is gone (a closed tab leaves within this without a goodbye).
  c_fresh   constant interval := interval '30 seconds';
  c_cap     constant int := 40;
  c_scan    constant int := 80;    -- the index rows one read may visit (2 × cap)
  c_per_min constant int := 45;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  perform public.hr_access_check();
  if not public.hr_flag_on('town_presence') then return jsonb_build_object('ok', true, 'off', true); end if;
  if not public.hr_rate_ok(v_uid, 'town_walk', c_per_min, interval '1 minute') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.hr_town_maps where map_id = p_map) then
    return jsonb_build_object('ok', false, 'error', 'bad_map'); end if;
  return jsonb_build_object('ok', true, 'map', p_map, 'cap', c_cap, 'walkers', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', w.user_id, 'slot', w.slot,
             'name', public.hr_social_name(w.user_id),
             'level', public.hr_level_of(w.user_id, w.slot),
             'role', public.hr_chat_role_pick(w.user_id, w.slot),
             -- THE OUTFIT the character chose (player_outfits, written only by hr_outfit_set),
             -- null when none or no longer owned (a lapsed premium outfit), as hr_outfit_view reads it.
             'outfit', case when po.outfit_id is not null and po.outfit_id = any (public.hr_outfit_owned(w.user_id, w.slot))
                            then jsonb_build_object('id', po.outfit_id, 'colors', coalesce(po.colors, '{}'::jsonb)) end,
             'x', w.x, 'y', w.y, 'gx', w.gx, 'gy', w.gy, 'dir', w.dir,
             'age_ms', greatest(0, floor(extract(epoch from (now() - w.at)) * 1000))::int
           ) order by w.at desc)
      from (select c.*
              from (select tp.* from public.town_positions tp
                     where tp.map_id = p_map and tp.at > now() - c_fresh
                     order by tp.at desc limit c_scan) c
              join public.player_state ps on ps.user_id = c.user_id and ps.slot = c.slot
             where c.user_id <> v_uid
               and not coalesce(ps.presence_quiet, false)
               and not exists (select 1 from public.hunt_sessions h
                                where h.user_id = c.user_id and h.slot = c.slot and h.ended_at is null)
               and not public.hr_social_blocked(v_uid, c.user_id)
               and public.hr_admitted(c.user_id)
             order by c.at desc limit c_cap) w
      left join public.player_outfits po on po.user_id = w.user_id and po.slot = w.slot), '[]'::jsonb));
end $function$;

-- ── hr_death_log_view: the death rows (a death ends the hunt) ──
CREATE OR REPLACE FUNCTION public.hr_death_log_view(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'at', d.at, 'hunt', d.hunt_id, 'monster', nullif(d.data->>'monster', ''),
           'xp', case when d.data ? 'xp' then (d.data->>'xp')::bigint end,
           'xp_lost', case when jsonb_typeof(d.data->'xp_lost') = 'object' then d.data->'xp_lost' end)
         order by d.at desc, d.id desc), '[]'::jsonb)
    from (select e.id, e.at, e.data, h.hunt_id
            from public.hunt_sessions h
            join public.hunt_session_events e on e.session_id = h.id and e.type = 'death'
           where h.user_id = p_user and h.slot = p_slot
           order by e.at desc, e.id desc
           limit 30) d
$function$;

-- ── hr_character_sheet_inputs: skill levels on their own curves, the Level; no style ──
CREATE OR REPLACE FUNCTION public.hr_character_sheet_inputs(p_user uuid, p_slot integer)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select md5(jsonb_build_object(
    'skills', coalesce((select jsonb_object_agg(s.skill_id, public.hr_skill_level(s.skill_id, s.xp))
                          from public.player_skills s where s.user_id = p_user and s.slot = p_slot), '{}'::jsonb),
    'equipment', coalesce((select jsonb_object_agg(q.equip_slot, q.item_id)
                             from public.player_equipment q where q.user_id = p_user and q.slot = p_slot), '{}'::jsonb),
    'level', (select ps.level_xp from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot),
    'buffs', coalesce((select jsonb_agg(jsonb_build_object('type', b.v->>'type', 'magnitude', b.v->'magnitude', 'until', b.v->>'until')
                                        order by b.v->>'until', b.v->>'type')
                         from public.player_state ps, jsonb_array_elements(coalesce(ps.buffs, '[]'::jsonb)) b(v)
                        where ps.user_id = p_user and ps.slot = p_slot
                          and (b.v->>'until')::timestamptz > now()
                          and (b.v->>'from' is null or (b.v->>'from')::timestamptz <= now())), '[]'::jsonb),
    'perks', public.hr_perks_of(p_user, p_slot) - 'sources')::text)
$function$;

-- ── hr_character_sheet_view: Level and derived max HP ──
CREATE OR REPLACE FUNCTION public.hr_character_sheet_view(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare v_cs public.hr_character_sheets%rowtype; v_fresh boolean := false; v_engine text;
begin
  select * into v_cs from public.hr_character_sheets where user_id = p_user and slot = p_slot;
  if found then
    select e.version into v_engine from public.hr_character_sheet_engine e where e.id;
    v_fresh := v_cs.engine_version = v_engine
      and v_cs.inputs_md5 = public.hr_character_sheet_stamp(public.hr_character_sheet_inputs(p_user, p_slot), v_engine);
  end if;
  return jsonb_build_object(
    'level', public.hr_level_of(p_user, p_slot),
    'max_hp', (public.hr_vitals_of(p_user, p_slot)->>'max_hp')::int,
    'bestiary', jsonb_build_object(
      'slain', (select count(*) from public.hr_bestiary_of(p_user, p_slot) b
                 where exists (select 1 from public.hr_activities a where a.kind = 'combat' and a.activity_id = b.monster_id)),
      'total', (select count(*) from public.hr_activities a where a.kind = 'combat')),
    'fresh', v_fresh,
    'combat', case when v_fresh then v_cs.sheet end,
    'computed_at', case when v_fresh then v_cs.computed_at end);
end $function$;

-- ── hr_lb_skills: the skill list (Melee; no Attack, Strength or Hitpoints) ──
CREATE OR REPLACE FUNCTION public.hr_lb_skills()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select array[
    'melee','ranged','magic','defense','prayer',
    'woodcutting','mining','fishing','farming',
    'cooking','crafting','smithing','runecrafting','stonemason','bountyHunter'
  ]
$function$;

-- ── hr_lb_boards: the Level board replaces the combat-level board ──
CREATE OR REPLACE FUNCTION public.hr_lb_boards()
 RETURNS text[]
 LANGUAGE sql
 STABLE
AS $function$
  select array['renown','total_level','level','wealth','bosses','clan_power']
      || array(select 'skill:' || s from unnest(public.hr_lb_skills()) s)
$function$;

-- ── §3 THE CLIENT DOOR WITHOUT A FALLS LIMIT ─────────────────────────────────
-- hr_hunt_enter restated from 2026-10-25-party-invites.sql with p_falls removed (a death ends
-- the hunt; there is no limit to set). The seven-argument door and its baseline row go.
drop function if exists public.hr_hunt_enter(integer, text, jsonb, integer, integer, integer, uuid);
create or replace function public.hr_hunt_enter(p_slot int, p_hunt text, p_bag jsonb, p_preset int,
  p_hours int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hunt_enter';
  v_uid  uuid := auth.uid();
  v_r    jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_r := public.hr_hunt_enter_for(v_uid, p_slot, p_hunt, p_bag, p_preset, p_hours);
  if coalesce(v_r->>'ok', 'false') <> 'true' then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  v_r := jsonb_build_object('ok', true, 'session', v_r->'session', 'version', v_r->'version',
                            'below_range', coalesce((v_r->>'below_range')::boolean, false));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_hunt_enter(int, text, jsonb, int, int, uuid) from public;
revoke execute on function public.hr_hunt_enter(int, text, jsonb, int, int, uuid) from anon, service_role;
grant  execute on function public.hr_hunt_enter(int, text, jsonb, int, int, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where proname = 'hr_hunt_enter';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hunt_enter', 'p_slot integer, p_hunt text, p_bag jsonb, p_preset integer, p_hours integer, p_idem uuid', 'authenticated',
   'restated 2026-10-27 (core rebuild): enter a hunt with a packed bag; no falls limit (a death ends the hunt). Was the 7-argument door with p_falls.');

-- ── §4 THE LEADERBOARD ───────────────────────────────────────────────────────
-- 2026-08-18-leaderboard-server-source.sql §2, restated with the core model: the Level board
-- (score = Level XP, from kills only) replaces the combat-level board, and Total Level sums
-- every skill on its own curve (hr_skill_level). `saved_at` stays NULL (the WAL decision in
-- that file's header) and the revoke is re-applied to the new object.
drop materialized view if exists public.leaderboard_ranked cascade;
create materialized view public.leaderboard_ranked as
with base as (
  select ps.user_id,
         ps.gold,
         ps.level_xp,
         null::timestamptz                          as saved_at,
         coalesce(p.display_name, 'Adventurer')     as name,
         c.name                                     as clan_name
  from public.player_state ps
  left join public.profiles p on p.id = ps.user_id
  left join public.clans    c on c.id = p.clan_id
  where ps.slot = 0
),
lv as (
  select s.user_id, s.skill_id, s.xp, public.hr_skill_level(s.skill_id, s.xp) as level
  from public.player_skills s
  where s.slot = 0
    and s.skill_id = any (public.hr_lb_skills())
),
agg as (
  select b.user_id, coalesce(sum(l.level), 0)::bigint as total_level
  from base b
  left join lv l on l.user_id = b.user_id
  group by b.user_id
),
scores as (
  select 'total_level'::text as board, b.user_id as subject_id, b.name, b.clan_name,
         a.total_level as score, b.saved_at
  from base b join agg a on a.user_id = b.user_id
  union all
  select 'level', b.user_id, b.name, b.clan_name, b.level_xp, b.saved_at
  from base b
  union all
  select 'wealth', b.user_id, b.name, b.clan_name, b.gold, b.saved_at
  from base b
  union all
  select 'skill:' || l.skill_id, l.user_id, b.name, b.clan_name, l.xp, b.saved_at
  from lv l join base b on b.user_id = l.user_id
  union all
  select 'clan_power', c.id, c.name, c.name,
         (coalesce(c.castle_tier, 0)::bigint * 1000000000)
           + least(greatest(coalesce(c.treasury, 0), 0), 999999999)::bigint,
         null::timestamptz
  from public.clans c
)
select board, subject_id, name, clan_name, score, saved_at,
       row_number() over (partition by board order by score desc, subject_id) as rank
from scores
where score is not null
  and score > 0;
create unique index if not exists leaderboard_ranked_subject_idx on public.leaderboard_ranked (board, subject_id);
create index if not exists leaderboard_ranked_rank_idx on public.leaderboard_ranked (board, rank);
revoke all on public.leaderboard_ranked from public, anon, authenticated, service_role;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $mig$
declare
  v_u constant uuid := '000000c0-0000-0000-0000-00000c0e0001';
  v jsonb; s jsonb; v_role text; v_bad text; v_ver bigint; v_lx bigint; v_heavy text;
  c_live constant text[] := array['hr_apply', 'hr_hunt_apply_member', 'hr_hunt_settle_session', 'hr_state_of',
    'hr_create_character', 'hr_hunt_member_read', 'hr_hunt_open_session', 'hr_hunt_new_session', 'hr_hunt_swap',
    'hr_hunt_enter_for', 'hr_hunt_enter', 'hr_hunt_party_start', 'hr_hunt_restart', 'hr_hunt_view', 'hr_hunt_section_view',
    'hr_hunt_party_view', 'hr_blessing_buy', 'hr_blessings_view', 'hr_stamina_refill_quote', 'hr_hunt_gate',
    'hr_hunt_below_range', 'hr_chat_send', 'hr_whisper_send', 'hr_inspect', 'hr_town_walkers', 'hr_death_log_view',
    'hr_character_sheet_inputs', 'hr_character_sheet_view', 'hr_lb_skills', 'hr_lb_boards', 'hr_total_level'];
begin
  -- (a) NO LIVE BODY READS THE OLD MODEL: the knockout, the stored max HP, the styles, the falls,
  --     the retired combat level or the retired skills.
  select string_agg(distinct p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (c_live)
     and p.prosrc ~ '(recovering_until|consec_falls|combat_style|falls_limit|knockout_ms|down_ms|hr_bounty_combat_level|hr_lb_combat_level|''hitpoints''|''attack''|''strength''|ps\.max_hp|v_st\.max_hp|v_kit\.max_hp|''fall''|downMs)';
  if v_bad is not null then raise exception 'SELF-CHECK(a): live bodies still read the old model: %', v_bad; end if;
  -- (b) THE CURVES: both start at 0 and rise strictly; a combat skill passes 99, a gathering skill does not.
  if public.hr_char_xp_for_level(1) <> 0 or public.hr_char_xp_for_level(2) <= 0
     or public.hr_char_level(public.hr_char_xp_for_level(200)) <> 200 or public.hr_char_level(public.hr_char_xp_for_level(200) - 1) <> 199 then
    raise exception 'SELF-CHECK(b): the Level curve does not round-trip at 1 / 2 / 200'; end if;
  if public.hr_skill_level('melee', public.hr_skill_xp_for_level('melee', 150)) <> 150
     or public.hr_skill_level('mining', 9000000000) <> 99 then
    raise exception 'SELF-CHECK(b): a combat skill is capped or a gathering skill is not'; end if;
  -- (c) A REAL CHARACTER through the real doors.
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'core-bodies §5 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'SELF-CHECK(c): hr_create_character refused: %', v; end if;
    -- Level 1, full health on the derived max, the base mana, no regen bonus, no retired skill row.
    s := public.hr_state_of(v_u, 0);
    if (s->'level'->>'level')::int <> 1 or (s->'vitals'->>'max_hp')::int <> public.hr_max_hp(1, 0)
       or (s->'state'->>'hp')::int <> public.hr_max_hp(1, 0) or (s->'vitals'->>'max_mana')::int <> public.hr_max_mana(1, 0)
       or s->'state' ? 'recovering_until' or s->'state' ? 'combat_style'
       or s->'skills' ? 'attack' or s->'skills' ? 'hitpoints' or not (s->'skills' ? 'melee') then
      raise exception 'SELF-CHECK(c): a fresh character''s envelope is %', jsonb_build_object('level', s->'level', 'vitals', s->'vitals', 'state', s->'state'); end if;
    -- Level XP is refused outside the hunt settle, and credited inside it.
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, gen_random_uuid(), '{"level_xp": 5000, "journal": {"kind": "combat", "intent": "probe"}}'::jsonb);
    if v->>'error' is distinct from 'level_xp_outside_hunt' then raise exception 'SELF-CHECK(c): Level XP outside a hunt answered %', v; end if;
    perform set_config('hr.hunt_session', gen_random_uuid()::text, true);
    v := public.hr_apply(v_u, 0, v_ver, gen_random_uuid(), '{"level_xp": 5000, "journal": {"kind": "combat", "intent": "probe"}}'::jsonb);
    perform set_config('hr.hunt_session', '', true);
    select level_xp into v_lx from public.player_state where user_id = v_u and slot = 0;
    if coalesce(v->>'ok', '') <> 'true' or v_lx <> 5000 or public.hr_level_of(v_u, 0) <> public.hr_char_level(5000) then
      raise exception 'SELF-CHECK(c): Level XP inside the settle answered % (level_xp %)', v, v_lx; end if;
    -- Max HP follows Level and the heavy armour worn; current HP is clamped to it.
    select item_id into v_heavy from public.hr_items where armour_weight = 'heavy' and item_id in (select item_id from public.hr_item_slots where equip_slot = 'body') order by item_id limit 1;
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (v_u, 0, 'body', v_heavy)
      on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
    if (public.hr_vitals_of(v_u, 0)->>'max_hp')::int <> public.hr_max_hp(public.hr_char_level(5000), 1) then
      raise exception 'SELF-CHECK(c): one heavy piece at Level % gives max HP %', public.hr_char_level(5000), public.hr_vitals_of(v_u, 0); end if;
    -- The hunt readers answer without touching a dropped column.
    perform public.hr_hunt_section_view(v_u, 0);
    perform public.hr_hunt_party_view(v_u, 0);
    perform public.hr_character_sheet_view(v_u, 0);
    perform public.hr_death_log_view(v_u, 0);
    perform public.hr_blessings_view(v_u, 0);
    perform public.hr_stamina_refill_quote(v_u, 0);
    raise exception using errcode = 'HR877', message = 'core-bodies §5 complete - rolling back';
  exception when sqlstate 'HR877' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) then raise exception 'SELF-CHECK(d): §5 LEAKED a probe row'; end if;
  -- (e) No client role reaches an internal of the core model; the door is the six-argument one.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_vitals_of(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_level_of(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_char_level(bigint)', 'execute')
       or has_function_privilege(v_role, 'public.hr_skill_level(text,bigint)', 'execute')
       or has_function_privilege(v_role, 'public.hr_hunt_enter_for(uuid,integer,text,jsonb,integer,integer)', 'execute') then
      raise exception 'SELF-CHECK(e): % reaches a core-model internal', v_role; end if;
  end loop;
  if to_regprocedure('public.hr_hunt_enter(integer,text,jsonb,integer,integer,integer,uuid)') is not null
     or not has_function_privilege('authenticated', 'public.hr_hunt_enter(integer,text,jsonb,integer,integer,uuid)', 'execute') then
    raise exception 'SELF-CHECK(e): the hunt door is not the six-argument one'; end if;
  if has_table_privilege('authenticated', 'public.leaderboard_ranked', 'select') then
    raise exception 'SELF-CHECK(e): leaderboard_ranked is client-selectable'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'core-bodies: Level, skills, vitals, the death price and the readers are the core model; all green';
end $mig$;
