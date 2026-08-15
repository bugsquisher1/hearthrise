-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE ARTISAN PROGRESS MODEL: unlockedRecipes and noBurn
--
--   ⚠ STAGED, NOT APPLIED. The Coordinator applies migrations; agents stage.
--
--   Companion generator: tools/gen-unlocks.mjs → 2026-08-16-unlocks.generated.sql
--   Companion derivation: tools/derive-perks-of.mjs (§5's body is EXTRACTED)
--   Companion tests: tests/artisan-progress-model.mjs, tests/perk-channel.mjs
--
-- ── THE PROBLEM, IN ONE PARAGRAPH ───────────────────────────────────────
-- b350 made artisan simulation server-runnable (src/core/artisan-sim.js) and
-- then refused, in writing, to add 'artisan' to PAYABLE_KINDS — because a
-- server that cooked tonight would read `bonus('noBurn')` as 0 while the
-- player's Cast-Iron Range says 0% burn, DESTROYING a quarter of the input,
-- and would read `state.unlockedRecipes` as absent, locking eight recipes the
-- player has already earned. Both are `player_progress` shapes that did not
-- exist. This file is those two shapes, their storage rules, and the read path
-- that carries them to the engine.
--
-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  THE ARCHITECTURAL POINT: `player_progress.kind` IS THE WRITE        ║
-- ║  CAPABILITY, NOT A TAXONOMY.                                         ║
-- ║                                                                      ║
-- ║  hr_apply's progress block accepts SIX kinds and merges them         ║
-- ║  `value = value + add`. Which kind a row is stored under therefore   ║
-- ║  decides WHO MAY WRITE IT and WHAT TWO WRITES DO:                    ║
-- ║                                                                      ║
-- ║    kind='flag'   IN the allowlist · additive · booleans, where       ║
-- ║                  additive is harmless (2 reads as 1 does)            ║
-- ║    kind='stat'   IN the allowlist · additive · counts, where         ║
-- ║                  additive is CORRECT                                 ║
-- ║    kind='unlock' NOT in the allowlist, deliberately · MAX · levels.  ║
-- ║                  Under additive merge, buying the 500g Hearthstone   ║
-- ║                  twice yields room:kitchen = 2 — the 2,000g Iron     ║
-- ║                  Stove for 1,000 gold.                               ║
-- ║                                                                      ║
-- ║  THE TWO ARTISAN SHAPES WANT OPPOSITE CAPABILITIES, and that is why  ║
-- ║  they are stored differently:                                        ║
-- ║                                                                      ║
-- ║    unlockedRecipes  EARNED by playing. The accrual engine's OWN drop  ║
-- ║                     roll yields a recipe scroll, so the engine must   ║
-- ║                     be able to grant it through hr_apply.            ║
-- ║                     → kind='flag', key='recipe:<scroll_id>'          ║
-- ║                     → NO hr_apply CHANGE IS REQUIRED. 'flag' is      ║
-- ║                       already in the allowlist and the key fits the  ║
-- ║                       64-char bound. This file adds no delta key.    ║
-- ║                                                                      ║
-- ║    noBurn           BOUGHT with gold. The Kitchen rung is a LEVEL,   ║
-- ║                     and no engine may ever climb it.                 ║
-- ║                     → kind='unlock', key='room:kitchen', value=rung  ║
-- ║                     → written ONLY by a spend RPC (hr_shop_buy),     ║
-- ║                       which DOES NOT EXIST YET — see §9.             ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- ── WHERE THEY LIVE, AND WHY NOT A NEW TABLE ────────────────────────────
-- Both are rows in public.player_progress with period_key = ''. There is no
-- player_unlocks table and there will not be one. That ruling is inherited
-- from the parked economy-substrate branch (worktree-agent-a079e5c2e5260c6f8),
-- reviewed and reused here, and its three reasons still hold:
--   1. A new table would be UNREADABLE without replacing hr_state_of, and
--      hr_state_of is the highest-risk `create or replace` in the repo.
--      player_progress rows with period_key='' are already returned in full
--      (the 31-day filter covers periodic rows only).
--   2. It INHERITS every asserted security property — RLS on, own-read policy,
--      no client write policy, no client write grant, FK cascade on character
--      delete — each enumerated BY TABLE NAME in 2026-08-11-player-state.sql.
--      A new player table nobody adds to those lists is a table the repo's
--      only static "no client writer" defence silently does not cover.
--   3. hr_progress_prune only deletes period_key <> ''. A permanent unlock row
--      is never swept.
--
-- ── WHAT IS STALE IN THE PARKED BRANCH, AND CORRECTED HERE ──────────────
-- The parked branch established kind='unlock' for rooms but did NOT replace
-- `public.hr_unlock_levels`, which 2026-08-15-perk-channel.sql creates
-- IF ABSENT with a body that reads kind='flag'. Applied together, rooms would
-- be stored as 'unlock' and read as 'flag' — hr_perks_of would return {} for
-- every character, noBurn would read 0, and the artisan block would be exactly
-- as broken as it is today with every self-check on both files still green.
-- ⚠ THIS FILE IS THE AUTHORITATIVE DEFINITION OF hr_unlock_levels (§4). It
--   reads the STORAGE KIND OUT OF THE CATALOGUE rather than naming one, so the
--   seam cannot disagree with the guard about where a row lives.
-- It also SUPERSEDES the parked 2026-08-16-unlock-grants.sql: do not merge
-- both, or two files define hr_unlock_guard and filename order picks one.
--
-- ── THE FAIL-CLOSED DEFAULTS, STATED SO THEY ARE NOT DISCOVERED ─────────
--   no recipe row   → hr_perks_of returns unlockedRecipes {} → gateOk false →
--                     simulateArtisanSpan stops with STOP_REASON.GATE at tick
--                     0 and pays only the time actually worked. LOCKED.
--   no room row     → rooms {} → makeBonus('noBurn') = 0 → burnChance =
--                     BURN_BASE. FULL BURN.
-- Both are the SHAPE's default rather than a branch somebody wrote, which is
-- the only kind of default that cannot be forgotten. Neither can fail open:
-- there is no code path in which an absent row grants a recipe or relieves a
-- burn. tests/artisan-progress-model.mjs proves both by DELETING the row.
--
-- ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────
--   · It does NOT touch hr_apply. 2026-08-15-gem-daily-budget.sql remains the
--     last file that may replace that body; §0 asserts its terms instead.
--   · It does NOT touch hr_state_of. The envelope grows in hr_perks_of.
--   · It adds NO client-callable RPC and NO write path for a ROOM rung. A
--     half-built spend intent reads as a control in review. §9 states the
--     contract the next author implements.
--   · It does NOT add 'artisan' to PAYABLE_KINDS/SETTABLE_KINDS. That is the
--     Coordinator's final wiring step — see §9.
--
-- REVERSIBILITY
--   drop trigger player_progress_unlock_guard on public.player_progress;
--   drop function public.hr_unlock_guard();
--   alter table public.player_progress drop constraint player_progress_unlock_shape;
--   -- and re-apply 2026-08-15-perk-channel.sql to restore its hr_perks_of and
--   -- (after dropping it) its default hr_unlock_levels.
--   Narrowing the kind CHECK back to six kinds is only safe while no
--   kind='unlock' row exists — i.e. until a room-purchase RPC ships.
--
-- APPLY ORDER: … → 2026-08-15-perk-channel.sql → 2026-08-16-unlocks.generated.sql
--   → THIS FILE. It FAILS CLOSED without either.
--
-- SAFE TO RE-RUN. Every step is guarded and §8's probes roll themselves back.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS + REFUSE-TO-INSTALL — FAIL CLOSED ───────────────────
-- This file restates hr_perks_of (a body it did not author) and REPLACES
-- hr_unlock_levels (a body it did not author either). The only honest way to do
-- that is to refuse unless the bodies about to be destroyed are the ones this
-- file was derived from and designed against.
--
-- It also asserts a property of hr_apply it must NOT break and DEPENDS ON:
-- 'flag' is in the progress allowlist (unlockedRecipes is unwritable without
-- it) and 'unlock' is NOT (room rungs become additively climbable with it).
-- That is a positive AND a negative claim about the same list, which is the
-- strongest shape a source scan can take.
do $$
declare
  v_src   text;
  v_len   int;
  v_kinds text;
  v_row   text[];
  -- name -> the regex that must be PRESENT in the live hr_apply body.
  c_terms constant text[][] := array[
    ['b346 C3: the slot comparison',               '\mv_prev_slot\M'],
    ['b346 C3: the intent_mismatch branch',        'intent_mismatch'],
    ['b348: the tool_carry delta key',             '\mtool_carry\M'],
    ['C5/X3: the daily budget is enforced',        'hr_day_budget_check'],
    ['b351: the gem daily-budget dimension',       '\mv_gems_in\M']
  ];
begin
  if to_regclass('public.player_state') is null or to_regclass('public.player_progress') is null then
    raise exception 'player_state/player_progress are missing — apply 2026-08-11-player-state.sql first';
  end if;

  -- (a) THE CATALOGUE. Both objects this file installs read it; a guard that
  --     installs against an absent catalogue would silently allow everything,
  --     which is worse than no guard because it reads as a control in review.
  if to_regclass('public.hr_unlocks') is null then
    raise exception 'hr_unlocks is absent — apply 2026-08-16-unlocks.generated.sql first. '
                    'hr_unlock_guard reads the merge rule out of it and hr_unlock_levels reads '
                    'the storage kind out of it; without it both would be decoration.';
  end if;
  if (select count(*) from public.hr_unlocks) = 0 then
    raise exception 'hr_unlocks exists but is EMPTY — re-run node tools/gen-unlocks.mjs and '
                    're-apply 2026-08-16-unlocks.generated.sql. An empty catalogue makes every '
                    'unlock unknown and every recipe permanently locked.';
  end if;
  if not exists (select 1 from public.hr_unlocks where namespace = 'recipe' and progress_kind = 'flag') then
    raise exception 'the catalogue holds no flag-stored recipe unlocks — unlockedRecipes would have '
                    'no legal storage and every gated recipe would be unreachable server-side';
  end if;
  if not exists (select 1 from public.hr_unlocks where unlock_id = 'room:kitchen' and merge = 'max') then
    raise exception 'the catalogue does not know room:kitchen as a level — noBurn has no source';
  end if;

  -- (b) THE PERK CHANNEL. §5 restates hr_perks_of; if it is not there, this
  --     file would INSTALL a channel perk-channel.sql is supposed to own, and
  --     the two would then race on filename order.
  if to_regprocedure('public.hr_perks_of(uuid,int)') is null then
    raise exception 'hr_perks_of is missing — apply 2026-08-15-perk-channel.sql first. §5 restates '
                    'its body (derived programmatically by tools/derive-perks-of.mjs); installing '
                    'it here first would make THIS file the channel''s author and leave two '
                    'definitions racing on filename order.';
  end if;
  if to_regprocedure('public.hr_unlock_levels(uuid,int)') is null then
    raise exception 'hr_unlock_levels is missing — apply 2026-08-15-perk-channel.sql first (§1 of '
                    'that file declares the seam)';
  end if;
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='hr_perks_of';
  if v_src !~ 'propertyTier' then
    raise exception 'REFUSING TO REPLACE hr_perks_of: the live body does not carry "propertyTier". '
                    'This file restates the WHOLE function from 2026-08-15-perk-channel.sql''s body; '
                    'against a different body it would silently delete whatever that body added.';
  end if;
  if v_src !~ 'sources' then
    raise exception 'REFUSING TO REPLACE hr_perks_of: the live body has no `sources` honesty census, '
                    'so it is not the b349 body this file was derived from.';
  end if;

  -- (c) hr_apply — the biconditional this whole model rests on.
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null then
    raise exception 'hr_apply missing — apply 2026-08-11-apply-engine.sql first';
  end if;
  select prosrc, length(prosrc) into v_src, v_len
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='hr_apply';

  -- ⚠ TWO CONTROLS BEFORE ANY VERDICT. A prosrc scan can fail in BOTH
  --   directions: it can stop matching (every "present?" test then raises on a
  --   healthy database — loud but wrong), or it can match everything (every
  --   test then passes on a body with none of these properties — quiet and
  --   fatal). The positive control is a term any hr_apply must have; the
  --   negative is a sentinel no hr_apply can contain.
  if v_src !~ 'version_conflict' then
    raise exception 'THE hr_apply SOURCE SCAN IS BLIND (positive control): "version_conflict" is '
                    'absent from a % char body, so every check below would raise on a database that '
                    'is perfectly healthy. Do not "fix" this by deleting the check.', coalesce(v_len,0);
  end if;
  if v_src ~ 'hr352_negative_control_this_string_is_not_in_any_hr_apply' then
    raise exception 'THE hr_apply SOURCE SCAN CANNOT SEE FAILURE (negative control): a sentinel that '
                    'appears in no hr_apply body MATCHED, so the scan is matching everything.';
  end if;

  foreach v_row slice 1 in array c_terms loop
    if v_src !~ v_row[2] then
      raise exception 'REFUSING TO INSTALL against this hr_apply: the live body (% chars) does not '
                      'carry "%" (regex: %). This file does not replace hr_apply, but it depends on '
                      'the CURRENT one — an older body means the chain is not where this model '
                      'assumes it is. Apply the missing predecessor first.',
                      coalesce(v_len,0), v_row[1], v_row[2];
    end if;
  end loop;

  -- THE BICONDITIONAL, on the progress-kind allowlist itself.
  v_kinds := substring(v_src from 'not in\s*\n?\s*\(''quest''[^)]*\)');
  if v_kinds is null then
    raise exception 'THE PROGRESS-KIND ALLOWLIST SCAN IS BLIND: hr_apply''s progress kind list could '
                    'not be located in a % char body, so neither half of the check below means '
                    'anything. The list''s spelling moved — find it and fix this anchor.', coalesce(v_len,0);
  end if;
  if v_kinds !~ '''flag''' then
    raise exception 'REFUSING TO INSTALL: hr_apply''s progress allowlist (%) does NOT accept ''flag''. '
                    'unlockedRecipes is stored as a flag row precisely so the accrual engine can '
                    'grant a scroll it rolled itself; without it the artisan gate can never open.',
                    v_kinds;
  end if;
  if v_kinds ~ '''unlock''' then
    raise exception 'REFUSING TO INSTALL: hr_apply''s progress allowlist (%) ACCEPTS ''unlock''. Its '
                    'merge is `value = value + add`, so a player could buy rung 1 twice and stand in '
                    'rung 2 — the 2,000-gold Iron Stove for 1,000 gold. The whole reason ''unlock'' is '
                    'a separate kind is that hr_apply cannot write it. Remove it there, not here.',
                    v_kinds;
  end if;

  raise notice 'b352 §0 PASSED: catalogue loaded, hr_perks_of is the b349 body, hr_apply carries all '
               '% properties, and its progress allowlist accepts ''flag'' and refuses ''unlock''.',
               array_length(c_terms, 1);
end $$;

-- ── 1. `unlock` BECOMES A LEGAL KIND ─────────────────────────────────────
-- The original CHECK is inline in the create table, so its name is whatever
-- Postgres generated. It is located by SHAPE — a CHECK on player_progress whose
-- definition constrains `kind` — rather than by a guessed name, and the whole
-- step is skipped if 'unlock' is already accepted.
do $$
declare v_con text; v_def text;
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.player_progress'::regclass
       and contype  = 'c'
       and pg_get_constraintdef(oid) like '%kind%'
       and pg_get_constraintdef(oid) like '%''unlock''%')
  then
    raise notice 'player_progress.kind already accepts ''unlock'' — nothing to widen';
    return;
  end if;

  select conname, pg_get_constraintdef(oid) into v_con, v_def
    from pg_constraint
   where conrelid = 'public.player_progress'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%kind%'
     and pg_get_constraintdef(oid) like '%''quest''%'
   limit 1;
  if v_con is null then
    raise exception 'could not find player_progress'' kind CHECK. It is the constraint that keeps a '
                    'typo''d kind from becoming a silently separate universe of rows; widening '
                    'blindly would drop it.';
  end if;
  execute format('alter table public.player_progress drop constraint %I', v_con);
  alter table public.player_progress
    add constraint player_progress_kind_check
    check (kind in ('quest','daily','bounty','stat','collection','flag','unlock'));
  raise notice 'player_progress.kind widened: % -> + ''unlock''', v_def;
end $$;

-- ── 2. THE SHAPE OF AN UNLOCK ROW ────────────────────────────────────────
-- An unlock is permanent and has no lifecycle. period_key='' keeps it out of
-- the periodic population (and therefore out of hr_progress_prune and inside
-- hr_state_of's unfiltered read); a null `state` says it is not a quest.
-- value >= 0 because player_progress.value carries no sign constraint of its
-- own and a negative rung is meaningless.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid='public.player_progress'::regclass
                    and conname='player_progress_unlock_shape') then
    alter table public.player_progress
      add constraint player_progress_unlock_shape
      check (kind <> 'unlock' or (period_key = '' and value >= 0 and state is null));
  end if;
end $$;

-- ── 3. hr_unlock_guard — THE CEILING IS A PROPERTY OF THE DATABASE ───────
-- The clan_deposit pattern: a server-side catalogue plus a clamp read from it.
-- Design inherited from the parked economy-substrate branch and re-implemented
-- against this file's catalogue shape.
--
-- WHAT IT ENFORCES, each because something breaks without it:
--   · an unlock id absent from the catalogue is refused              (unknown)
--   · a catalogued unlock is stored under its DECLARED kind — so nobody can
--     file room:kitchen as a 'flag' and get hr_apply's additive merge back,
--     and nobody can file recipe:soul_recipe as an 'unlock' and put it beyond
--     the engine's reach
--   · merge='none' has no persistent home at all, so it is refused outright
--   · a LEVEL's value is on its own rung ladder and within [0, max_value]
--   · a LEVEL never decreases
--
-- WHAT IT DELIBERATELY DOES NOT ENFORCE: whether a PURCHASE was legal.
-- "You already own this" and "you have hit the plot cap" are decisions about a
-- transaction and belong to the spend RPC, not to a trigger that also fires on
-- quest rewards.
--
-- ⚠ IT RAISES check_violation ON PURPOSE. hr_apply's exception handler already
--   catches check_violation and answers {ok:false, error:'bad_delta',
--   sqlstate:'23514'} with the protected block rolled back. A custom SQLSTATE
--   would escape that handler and surface as a 500 — a caller bug that reads as
--   a server outage.
--
-- NOT SECURITY DEFINER. The only writers of player_progress are SECURITY
-- DEFINER functions owned by postgres, so the trigger already runs with the
-- privileges it needs, and hr_unlocks is world-readable.
create or replace function public.hr_unlock_guard()
returns trigger language plpgsql set search_path = public as $$
declare u public.hr_unlocks%rowtype;
begin
  select * into u from public.hr_unlocks where unlock_id = new.key;

  if not found then
    -- Not a catalogued unlock. A row that CLAIMS to be one anyway is refused;
    -- an ordinary permanent quest/stat/collection/flag row passes untouched.
    if new.kind = 'unlock' then
      raise exception 'unknown_unlock: %', new.key
        using errcode = 'check_violation',
              hint = 'kind=''unlock'' is reserved for ids in public.hr_unlocks. Regenerate the '
                     'catalogue (node tools/gen-unlocks.mjs) if this is a new grant.';
    end if;
    return new;
  end if;

  if u.merge = 'none' then
    raise exception 'unlock_not_storable: %', new.key
      using errcode = 'check_violation',
            hint = 'This grant is a one-shot action with no persistent home by design. The intent '
                   'that consumes it owns it.';
  end if;

  -- THE MERGE-RULE PIN, and it cuts BOTH ways. A level filed as a flag inherits
  -- hr_apply's additive merge (two cheap rungs buy an expensive one); a recipe
  -- filed as an unlock puts itself beyond hr_apply's reach, so the accrual
  -- engine could never grant the scroll it rolled and the recipe would be
  -- permanently locked.
  if new.kind is distinct from u.progress_kind then
    raise exception 'unlock_wrong_kind: % stored as ''%'', catalogue says ''%''',
                    new.key, new.kind, u.progress_kind
      using errcode = 'check_violation',
            hint = 'player_progress.kind IS the write capability. See '
                   '2026-08-16-artisan-progress-model.sql''s header.';
  end if;

  -- Flags and counts merge additively and correctly; their ceilings are a
  -- PURCHASE decision, not a storage one.
  if new.kind <> 'unlock' then return new; end if;

  if u.max_value is not null and new.value > u.max_value then
    raise exception 'unlock_over_ceiling: % = % exceeds %', new.key, new.value, u.max_value
      using errcode = 'check_violation';
  end if;

  if u.rungs is not null and not (new.value::int = any (u.rungs)) then
    raise exception 'unlock_bad_rung: % = % is not on ladder %', new.key, new.value, u.rungs
      using errcode = 'check_violation',
            hint = 'A level unlock stores a rung the catalogue actually sells. A value between '
                   'rungs is a writer that added instead of taking a maximum.';
  end if;

  if tg_op = 'UPDATE' and new.value < old.value then
    raise exception 'unlock_regressed: % % -> %', new.key, old.value, new.value
      using errcode = 'check_violation',
            hint = 'A level unlock is monotonic. Nothing in the game takes a room away, so a '
                   'decrease is a writer bug, and a silent one would look like a refund.';
  end if;

  return new;
end $$;

revoke execute on function public.hr_unlock_guard()
  from public, anon, authenticated, service_role;

-- WHEN (new.period_key = ''): unlocks are always permanent, so the entire
-- PERIODIC population — the unbounded one, 600 players x 6 dailies x 365 days —
-- never fires this at all. What remains is one primary-key lookup on a 61-row
-- catalogue, on rows bounded by CONTENT.
drop trigger if exists player_progress_unlock_guard on public.player_progress;
create trigger player_progress_unlock_guard
  before insert or update on public.player_progress
  for each row when (new.period_key = '')
  execute function public.hr_unlock_guard();

-- ── 4. hr_unlock_levels — THE AUTHORITATIVE SEAM ─────────────────────────
-- 2026-08-15-perk-channel.sql §1 declares this seam and creates it ONLY IF
-- ABSENT, saying in its own header that "whichever storage model lands first is
-- authoritative". THIS IS THAT DEFINITION.
--
-- The default body it replaces read `kind='flag'`, which was the only
-- unlock-shaped storage that existed when it was written. Rooms are now
-- kind='unlock' (§0's biconditional explains why), so the default body would
-- return ZERO ROWS for every character — noBurn 0, every perk 0, with both
-- files' self-checks green. That is the defect this replacement closes.
--
-- ⚠ THE KIND IS READ OUT OF THE CATALOGUE, never named here. hr_unlock_guard
--   refuses a row stored under the wrong kind and this join cannot see one, so
--   the guard and the seam physically cannot disagree about where a row lives —
--   which is the failure mode that made this replacement necessary in the first
--   place.
--
-- CONTRACT (perk-channel §4(a) asserts it, and so does §7 below):
--   returns table(unlock_id text, level int) · STABLE · SECURITY DEFINER ·
--   executable by NOBODY, not even hr_engine — hr_perks_of is the only caller
--   and it is SECURITY DEFINER, so a grant here would only create a second,
--   unfiltered read path over every character's unlocks.
create or replace function public.hr_unlock_levels(p_user uuid, p_slot int)
returns table(unlock_id text, level int)
language sql
stable
security definer
set search_path = public, pg_temp
as $body$
  select pp.key,
         /* bigint -> int, clamped rather than cast. player_progress.value is a
            bigint with no upper CHECK, and an int overflow here would be an
            exception thrown inside an accrual — a whole night lost — rather
            than a bonus that reads too high. The magnitude is never taken from
            this number anyway: src/core/perks.js clamps the level to the rung
            count that actually exists. */
         greatest(0, least(pp.value, 2147483647))::int
    from public.player_progress pp
    join public.hr_unlocks u
      on u.unlock_id     = pp.key
     and u.progress_kind = pp.kind
   where pp.user_id    = p_user
     and pp.slot       = p_slot
     and pp.period_key = ''
     and pp.value      > 0
     /* The perk channel's three namespaces. `recipe` is deliberately NOT here:
        it is not a magnitude, it is a gate, and it rides its own key in
        hr_perks_of's envelope. Forwarding it would put a recipe id into the
        room map, where src/core/perks.js drops it silently — a bug that stays
        invisible until a scroll id collides with a room id. */
     and u.namespace in ('room', 'plot', 'property')
$body$;

revoke execute on function public.hr_unlock_levels(uuid, int) from public;
revoke execute on function public.hr_unlock_levels(uuid, int)
  from anon, authenticated, service_role, hr_engine;

-- ── 5. hr_perks_of — THE ENVELOPE GROWS BY ONE KEY ───────────────────────
-- ⚠ THE BODY BELOW IS DERIVED, NOT RETYPED. It is 2026-08-15-perk-channel.sql's
--   hr_perks_of, extracted programmatically and patched at four named anchors
--   by tools/derive-perks-of.mjs. `node tools/derive-perks-of.mjs --check` (a
--   preflight in tests/run-smoke.mjs) re-derives it and fails on any drift, and
--   tests/run-sql-tests.mjs PART 1f-ii grades the chain line by line with an
--   EMPTY declared-removals list: this link adds lines and removes none.
--
--   To change it: edit the PATCHES in tools/derive-perks-of.mjs and run
--   `node tools/derive-perks-of.mjs --write`. Hand-editing between the markers
--   is how a fix that landed last week silently disappears.
--
-- WHY hr_perks_of AND NOT hr_state_of — the architectural call:
--   · hr_state_of ALREADY returns these rows (progress is unfiltered for
--     period_key=''), so a projection there would be free. It is the wrong
--     place for three reasons. (1) Its progress array is LIMIT 1000 with a
--     `progress_truncated` flag; the artisan gate would then depend on an
--     incidental ORDER BY for correctness, and the failure mode is a player
--     with many dailies silently losing a recipe. (2) Adding a key means
--     restating the whole 60-line body and becoming the last file that may
--     replace the highest-risk function in the repo. (3) It would put the
--     projection in a different function from the perk projection that reads
--     the same table for the same reason.
--   · hr_perks_of is the PERMANENT-CAPABILITY envelope: "what has this
--     character permanently acquired". A recipe unlock is exactly that. It
--     already carries a `sources` honesty census, it is engine-only, it is
--     small, and one function now owns the whole unlock → engine projection.
--   · The two are kept SEPARATE ON THE JS SIDE: `perks` (magnitudes) and
--     `unlockedRecipes` (a gate) are two fields of the accrual input, not one
--     conflated object. src/core/perks.js normalisePerkState never sees the
--     recipe map.
-- ⟦DERIVED hr_perks_of — tools/derive-perks-of.mjs, do not hand-edit⟧
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
    'renownAllXp', 0,
    'clanPerks', '{}'::jsonb,
    'castle', null,
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
      'renown',     'blocked:no_server_renown_score',
      'clan',       'derivable:contributes_zero',
      'castle',     'blocked:perk_table_client_side',
      'companions', 'blocked:no_server_pet_model')
  );
end $$;
-- ⟦/DERIVED hr_perks_of⟧

-- ── 6. GRANTS — revoke from PUBLIC first, then grant ─────────────────────
-- Postgres grants EXECUTE to PUBLIC on every new function and Supabase's
-- default ACL additionally grants it to anon/authenticated/service_role.
-- `create or replace` PRESERVES an existing ACL, so a wrong one would survive a
-- re-apply — which is why these are restated unconditionally.
revoke execute on function public.hr_perks_of(uuid, int) from public;
revoke execute on function public.hr_perks_of(uuid, int)
  from anon, authenticated, service_role;
grant execute on function public.hr_perks_of(uuid, int) to hr_engine;

-- ── 7. STRUCTURAL ASSERTIONS ─────────────────────────────────────────────
do $$
declare v_p oid; v_bad text; v_cols text; v_n int;
begin
  -- (a) THE SEAM'S CONTRACT SURVIVED THE REPLACEMENT.
  v_p := to_regprocedure('public.hr_unlock_levels(uuid,int)');
  if v_p is null then raise exception 'hr_unlock_levels vanished after §4'; end if;
  v_cols := pg_get_function_result(v_p);
  if lower(replace(coalesce(v_cols,''),' ','')) is distinct from 'table(unlock_idtext,levelinteger)' then
    raise exception 'hr_unlock_levels returns "%" — the contract is TABLE(unlock_id text, level '
                    'integer). A replacement that changes the shape silently zeroes every perk in '
                    'the game.', coalesce(v_cols,'NOTHING');
  end if;
  if (select provolatile from pg_proc where oid = v_p) not in ('s','i') then
    raise exception 'hr_unlock_levels is VOLATILE. hr_perks_of is declared STABLE and PostgREST '
                    'honours a STABLE declaration by running in a READ-ONLY transaction.';
  end if;
  foreach v_bad in array array['public','anon','authenticated','service_role','hr_engine'] loop
    if has_function_privilege(v_bad, v_p, 'execute') then
      raise exception 'hr_unlock_levels is EXECUTABLE BY % — it is an unfiltered read path over '
                      'every character''s unlocks and must be reachable only through '
                      'hr_perks_of', v_bad;
    end if;
  end loop;

  -- (b) hr_perks_of's posture is unchanged by the restatement.
  v_p := to_regprocedure('public.hr_perks_of(uuid,int)');
  if v_p is null then raise exception 'hr_perks_of vanished after §5'; end if;
  foreach v_bad in array array['public','anon','authenticated','service_role'] loop
    if has_function_privilege(v_bad, v_p, 'execute') then
      raise exception 'hr_perks_of is EXECUTABLE BY % — that is a cross-player read of who owns '
                      'which room and which recipe', v_bad;
    end if;
  end loop;
  if not has_function_privilege('hr_engine', v_p, 'execute') then
    raise exception 'hr_perks_of is not executable by hr_engine — index.ts would take its 42883 '
                    'branch and pay every night at zero perks and zero recipes';
  end if;
  if (select prosecdef from pg_proc where oid = v_p) is not true then
    raise exception 'hr_perks_of is not SECURITY DEFINER — hr_engine holds no table grants';
  end if;
  if (select provolatile from pg_proc where oid = v_p) not in ('s','i') then
    raise exception 'hr_perks_of stopped being STABLE';
  end if;
  if not exists (select 1 from unnest(coalesce((select proconfig from pg_proc where oid = v_p),
                                               array[]::text[])) c where c like 'search_path=%') then
    raise exception 'hr_perks_of has no pinned search_path — a SECURITY DEFINER function without '
                    'one is a search_path hijack';
  end if;

  -- (c) THE GUARD IS INSTALLED, ENABLED, AND NOT CALLABLE AS A FUNCTION.
  if not exists (select 1 from pg_trigger where tgrelid='public.player_progress'::regclass
                  and tgname='player_progress_unlock_guard' and not tgisinternal) then
    raise exception 'the unlock guard trigger is not installed';
  end if;
  if exists (select 1 from pg_trigger where tgrelid='public.player_progress'::regclass
              and tgname='player_progress_unlock_guard' and tgenabled='D') then
    raise exception 'the unlock guard trigger is installed but DISABLED';
  end if;
  if has_function_privilege('authenticated', to_regprocedure('public.hr_unlock_guard()'), 'execute')
     or has_function_privilege('anon', to_regprocedure('public.hr_unlock_guard()'), 'execute')
     or has_function_privilege('public', to_regprocedure('public.hr_unlock_guard()'), 'execute') then
    raise exception 'hr_unlock_guard() is executable by a client role';
  end if;

  -- (d) NO NEW CLIENT WRITE SURFACE. If a client could INSERT a progress row it
  --     could grant itself a Great Hearth and every recipe in the game.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema='public' and table_name='player_progress'
     and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
     and privilege_type <> 'SELECT';
  if v_n > 0 then raise exception '% client write grants on player_progress', v_n; end if;
  select string_agg(policyname||':'||cmd, ', ') into v_bad from pg_policies
   where schemaname='public' and tablename='player_progress' and cmd <> 'SELECT';
  if v_bad is not null then
    raise exception 'player_progress grew a non-SELECT policy (%) — a client-writable progress row '
                    'is a client-authored perk stack AND a client-authored recipe book', v_bad;
  end if;

  -- (e) STILL NO TABLE GRANTS TO THE ENGINE.
  select string_agg(table_name||':'||privilege_type, ', ') into v_bad
    from information_schema.role_table_grants
   where grantee='hr_engine' and table_schema='public';
  if v_bad is not null then
    raise exception 'hr_engine gained table privileges (%) — the capability pin is broken', v_bad;
  end if;

  -- ⚠ "hr_apply cannot write a level" IS NOT ASSERTED HERE. §0 asserts it as a
  --   biconditional over the source, and §8(k) proves it by CALLING hr_apply
  --   with a control on the next line. A LIKE over pg_get_functiondef is the
  --   "source-text regex standing in for an assertion" family this repo has
  --   recorded eighteen instances of.
  raise notice 'b352 §7 PASSED: the seam contract, both ACLs, the search_path pin, the trigger, the '
               'engine capability pin and the player_progress write posture.';
end $$;

-- ── 8. BEHAVIOUR — every refusal paired with a control ───────────────────
-- "The trigger exists" is a catalog row. "A forged rung is refused" and "an
-- absent row locks the recipe" are the claims the game depends on, and a test
-- that only proves the guard says NO would pass just as happily against one
-- that says no to everything — including to the legal grant. So each refusal is
-- bracketed by the nearest LEGAL write, which must succeed.
do $$
declare
  v_uid   uuid := '00000000-0000-4000-8000-000000b35201';
  v_r     jsonb;
  v_ver   bigint;
  v_val   bigint;
  v_room  text;
  v_room2 text;
  v_top   int;
  v_rec   text;
  v_hit   boolean;
  v_n     int;
begin
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception '§8 CANNOT RUN: hr_create_character is missing — apply '
                    '2026-08-14-character-bootstrap.sql first. A skipped check is not a passed one.';
  end if;

  -- Drive the REAL catalogue, never an invented id. If the shop tables change,
  -- these follow them.
  select u.unlock_id, u.max_value into v_room, v_top
    from public.hr_unlocks u
   where u.merge='max' and array_length(u.rungs,1) >= 3
   order by array_length(u.rungs,1) desc, u.unlock_id limit 1;
  if v_room is null then
    raise exception '§8 CANNOT RUN: no level unlock with 3+ rungs — the catalogue did not load and '
                    'every refusal below would pass for the wrong reason';
  end if;
  -- A SECOND level unlock whose ladder EXCLUDES 0, for the off-ladder probe.
  select u.unlock_id into v_room2 from public.hr_unlocks u
   where u.merge='max' and u.unlock_id <> v_room and not (0 = any (u.rungs))
     and coalesce(u.max_value,0) > 0
   order by u.unlock_id limit 1;
  if v_room2 is null then
    raise exception '§8 CANNOT RUN: no second level unlock whose ladder excludes 0 — the off-ladder '
                    'probe would have nothing to prove';
  end if;
  select u.unlock_id into v_rec from public.hr_unlocks u
   where u.namespace='recipe' order by u.unlock_id limit 1;
  if v_rec is null then raise exception '§8 CANNOT RUN: no recipe unlock in the catalogue'; end if;

  begin  -- ── SUBTRANSACTION, rolled back ────────────────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if coalesce(v_r->>'ok', v_r->>'created', 'false') <> 'true' then
      raise exception '§8: no probe character: %', v_r;
    end if;

    -- (a) THE DEGRADE PATH. A fresh character reads EMPTY on both shapes. This
    --     is the fail-closed default, and it is the shape's default rather than
    --     a branch: no row, no key, locked recipe, full burn.
    v_r := public.hr_perks_of(v_uid, 0);
    if v_r->>'ok' <> 'true' then raise exception '§8(a): %', v_r; end if;
    if v_r->'rooms' is distinct from '{}'::jsonb
       or v_r->'unlockedRecipes' is distinct from '{}'::jsonb then
      raise exception '§8(a): a fresh character reads rooms=% unlockedRecipes=% — expected both '
                      'empty. A non-empty default grants a recipe nobody earned.',
                      v_r->'rooms', v_r->'unlockedRecipes';
    end if;
    if v_r->'sources'->>'recipes' is null then
      raise exception '§8(a): the sources census does not declare where recipes come from — a '
                      'zero-recipe night would be unexplainable from the outside';
    end if;

    -- (b) CONTROL — a legal rung lands, and REACHES THE ENVELOPE. 0.25 noBurn at
    --     Kitchen 3 is the difference between a server that cooks burn-proof and
    --     one that destroys a quarter of the input.
    insert into public.player_progress (user_id, slot, kind, key, period_key, value)
      values (v_uid, 0, 'unlock', v_room, '', 2),
             (v_uid, 0, 'unlock', 'room:kitchen', '', 3);
    v_r := public.hr_perks_of(v_uid, 0);
    if (v_r->'rooms'->>'kitchen')::int is distinct from 3 then
      raise exception '§8(b): rooms.kitchen reads % — expected 3. noBurn does not reach the engine '
                      'and artisan accrual stays blocked.', coalesce(v_r->'rooms'->>'kitchen','ABSENT');
    end if;

    -- (c) THE RECIPE GATE, THROUGH THE REAL WRITE PATH. Granted by hr_apply as a
    --     `flag` progress op — exactly what the accrual engine will propose when
    --     its own drop roll yields the scroll — and then read back off the
    --     envelope under the CLIENT'S OWN wire shape.
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object(
               'progress', jsonb_build_array(jsonb_build_object(
                 'kind','flag','key',v_rec,'add',1)),
               'journal', jsonb_build_object('kind','accrue','intent','recipe:probe')));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception '§8(c) THE WRITE PATH IS BROKEN: hr_apply refused a flag progress op for % '
                      '(%). unlockedRecipes has no writer and every gated recipe is unreachable '
                      'server-side.', v_rec, v_r;
    end if;
    v_r := public.hr_perks_of(v_uid, 0);
    if not (v_r->'unlockedRecipes' ? substring(v_rec from 8)) then
      raise exception '§8(c): % was granted but unlockedRecipes reads % — the projection does not '
                      'carry it, so gateOk would refuse a recipe the player has earned.',
                      v_rec, v_r->'unlockedRecipes';
    end if;
    if (v_r->'unlockedRecipes'->>substring(v_rec from 8)) <> 'true' then
      raise exception '§8(c): the wire shape is % — the client writes { id: true } and '
                      'src/core/artisan.js gateOk reads it as such.',
                      v_r->'unlockedRecipes';
    end if;

    -- (d) A RECIPE UNLOCK DOES NOT LEAK INTO THE PERK MAPS. A prefix-blind seam
    --     would forward it into `rooms`, where src/core/perks.js drops it
    --     silently — invisible until a scroll id collided with a room id.
    if v_r->'rooms' ? v_rec or v_r->'plots' ? v_rec then
      raise exception '§8(d): a recipe unlock leaked into the perk maps: % / %',
                      v_r->'rooms', v_r->'plots';
    end if;
    select count(*) into v_n from jsonb_object_keys(v_r->'rooms');
    if v_n <> 2 then
      raise exception '§8(d) CONTROL: rooms holds % keys, expected 2 — the seam stopped returning '
                      'rooms and (d) proves nothing', v_n;
    end if;

    -- (e) A RUNG ABOVE THE LADDER IS REFUSED.
    v_hit := false;
    begin
      update public.player_progress set value = v_top + 5
       where user_id=v_uid and slot=0 and kind='unlock' and key=v_room;
    exception when check_violation then v_hit := true;
    end;
    if not v_hit then raise exception '§8(e): a rung above the ceiling was accepted'; end if;

    -- (f) A VALUE OFF THE LADDER IS REFUSED — and this probe ISOLATES that
    --     guard rather than being refused by any guard. The obvious form
    --     (`set value = 0` on v_room) is worthless: 0 is below the current
    --     value, so the MONOTONIC check catches it and the probe still passes
    --     with the ladder check deleted. So: an INSERT (no `old` row, so
    --     monotonic cannot fire) on a FRESH key, at a value inside the ceiling.
    --     Rung 0 is on no ladder — the generated catalogue asserts that.
    v_hit := false;
    begin
      insert into public.player_progress (user_id, slot, kind, key, period_key, value)
        values (v_uid, 0, 'unlock', v_room2, '', 0);
    exception when check_violation then v_hit := true;
    end;
    if not v_hit then
      raise exception '§8(f): value 0 is on no rung ladder, is inside the ceiling, and was accepted '
                      'on an INSERT — the rung check is not firing';
    end if;

    -- (g) A LEVEL NEVER GOES BACKWARDS.
    v_hit := false;
    begin
      update public.player_progress set value = 1
       where user_id=v_uid and slot=0 and kind='unlock' and key=v_room;
    exception when check_violation then v_hit := true;
    end;
    if not v_hit then raise exception '§8(g): a level regressed 2 -> 1 without complaint'; end if;

    -- (h) CONTROL — going UP still works, so (e)(f)(g) are not "refuses all".
    update public.player_progress set value = 3
     where user_id=v_uid and slot=0 and kind='unlock' and key=v_room;
    select value into v_val from public.player_progress
     where user_id=v_uid and slot=0 and kind='unlock' and key=v_room;
    if v_val <> 3 then raise exception '§8(h) CONTROL FAILED: a legal upgrade to 3 did not land'; end if;

    -- (i) THE MERGE-RULE PIN, BOTH WAYS.
    --     i-1: a LEVEL filed as a FLAG would inherit hr_apply's additive merge.
    v_hit := false;
    begin
      insert into public.player_progress (user_id, slot, kind, key, period_key, value)
        values (v_uid, 0, 'flag', v_room, '', 1);
    exception when check_violation then v_hit := true;
    end;
    if not v_hit then
      raise exception '§8(i-1): a level unlock was accepted as kind=''flag''. It would then merge '
                      'ADDITIVELY through hr_apply and two cheap rungs would buy an expensive one.';
    end if;
    --     i-2: a RECIPE filed as an UNLOCK puts itself beyond hr_apply's reach,
    --     so the engine could never grant the scroll it rolled.
    v_hit := false;
    begin
      insert into public.player_progress (user_id, slot, kind, key, period_key, value)
        values (v_uid, 0, 'unlock', v_rec, '', 1);
    exception when check_violation then v_hit := true;
    end;
    if not v_hit then
      raise exception '§8(i-2): a recipe unlock was accepted as kind=''unlock''. hr_apply cannot '
                      'write that kind, so the accrual engine could never grant the scroll it '
                      'rolled and the recipe would be permanently locked.';
    end if;

    -- (j) AN UNKNOWN UNLOCK ID IS REFUSED…
    v_hit := false;
    begin
      insert into public.player_progress (user_id, slot, kind, key, period_key, value)
        values (v_uid, 0, 'unlock', 'room:not_a_real_room', '', 1);
    exception when check_violation then v_hit := true;
    end;
    if not v_hit then raise exception '§8(j): an unlock id absent from the catalogue was accepted'; end if;

    --     …AND SO IS ONE THE CATALOGUE SAYS HAS NO HOME.
    v_hit := false;
    begin
      insert into public.player_progress (user_id, slot, kind, key, period_key, value)
        select v_uid, 0, 'unlock', unlock_id, '', 1
          from public.hr_unlocks where merge='none' order by unlock_id limit 1;
    exception when check_violation then v_hit := true;
    end;
    if not v_hit then
      raise exception '§8(j): a merge=''none'' grant was stored. Those are one-shot actions; a '
                      'player could bank 50 dungeon entries with nothing that spends them.';
    end if;

    -- (k) CONTROL — ordinary progress rows are untouched by all of this.
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
      values (v_uid, 0, 'quest', 'probe:some_quest', '', 1, 'active');
    insert into public.player_progress (user_id, slot, kind, key, period_key, value)
      values (v_uid, 0, 'daily', 'probe:some_daily', '2026-08-16', 1);
    if (select count(*) from public.player_progress
         where user_id=v_uid and slot=0 and key like 'probe:%') <> 2 then
      raise exception '§8(k) CONTROL FAILED: the guard is refusing ordinary progress rows';
    end if;

    -- (l) THE ARCHITECTURAL CLAIM, PROVEN THROUGH hr_apply ITSELF: a level
    --     unlock cannot be written by the additive progress delta. The control
    --     at (c) above already proved the same call shape WORKS for a flag, so
    --     this is not "hr_apply refuses progress".
    select version into v_ver from public.player_state where user_id=v_uid and slot=0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object(
               'progress', jsonb_build_array(jsonb_build_object(
                 'kind','unlock','key',v_room,'add',1)),
               'journal', jsonb_build_object('kind','accrue','intent','unlock:probe:level')));
    if coalesce(v_r->>'ok','false') = 'true' then
      raise exception '§8(l) FAILED: hr_apply APPLIED a kind=''unlock'' progress op (%). Its merge is '
                      '`value = value + add`, so a player could buy rung 1 twice and stand in rung 2.',
                      v_r;
    end if;
    if v_r->>'error' is distinct from 'bad_progress_kind' then
      raise exception '§8(l): hr_apply refused the unlock op with % — expected bad_progress_kind. A '
                      'different refusal means it is being rejected for the wrong reason and the '
                      'protection is accidental.', v_r;
    end if;

    raise exception using errcode = 'HR352', message = 'b352 §8 complete — rolling back';
  exception when sqlstate 'HR352' then
    null;   -- the subtransaction is discarded; nothing above it survives
  end;

  -- The rollback is ASSERTED, not assumed.
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception '§8 LEAKED a probe row';
  end if;

  raise notice 'ARTISAN PROGRESS MODEL OK — a fresh character reads EMPTY on both shapes; a Kitchen '
               'rung reaches the envelope; hr_apply GRANTS a recipe flag and the projection carries '
               'it in the client''s own wire shape; recipes do not leak into the perk maps; the rung '
               'ladder, monotonicity, both directions of the merge-rule pin, the unknown-id and '
               'no-home refusals all bite; hr_apply cannot write a level. Every refusal paired with '
               'a control. Zero residue.';
end $$;

-- ── 9. WHAT IS LEFT, AND WHO OWNS IT ─────────────────────────────────────
-- Stated in the file rather than only in a report, because the next author
-- reads the migration.
--
-- (1) THE RECIPE WRITE PATH IS COMPLETE IN SQL AND UNWIRED IN THE ENGINE.
--     hr_apply grants the row today (§8(c) proves it end to end). What is
--     missing is the proposal: `supabase/functions/hr-accrue/accrual.js` must
--     turn a simulated drop of a recipe-scroll item into a progress op instead
--     of an inventory entry —
--         if (ITEMS[id] && ITEMS[id].recipe)
--           progress.push({ kind:'flag', key:`recipe:${id}`, period:'', add:1 });
--         else items[id] = (items[id] || 0) + n;
--     — mirroring src/legacy.js's addItem wrapper, which unlocks and consumes.
--     That file is held by another agent for the gather wiring, so the patch is
--     reported rather than applied.
--
-- (2) THE ROOM WRITE PATH DOES NOT EXIST, DELIBERATELY. No RPC writes a
--     kind='unlock' row. The contract for whoever builds it:
--         hr_shop_buy(p_slot int, p_offer_id text, p_idem uuid)
--           · price and grant read from a server-side offer catalogue
--           · gold/gems debited in the same transaction as the grant
--           · the unlock row written as
--               kind = hr_unlocks.progress_kind, period_key = '',
--               value = GREATEST(existing, granted_amount)   -- never +=
--           · journalled to player_ledger; idempotency key; per-day clamp
--       The guard installed here is what makes that RPC hard to get wrong: it
--       cannot write an off-ladder rung, cannot regress one, and cannot file a
--       level under a kind that would make it additive.
--
-- (3) ⛔ THE GATE ON 'artisan' IN PAYABLE_KINDS — read this before widening it.
--     This file makes the server able to READ a Kitchen rung. It does not make
--     the server the OWNER of room purchases. Until (2) ships, a player who
--     buys a Kitchen in today's client has no server row, the server reads
--     noBurn 0, and a cooked night DESTROYS input the client would have kept.
--     That is fail-closed in the sense that nothing is minted, and it is still
--     an item loss. So:
--         'artisan' may enter PAYABLE_KINDS when (1) has landed AND room
--         purchase is server-owned — OR when cooking specifically is excluded
--         until it is.
--     After the cutover wipe, no character owns a room at all, so the two
--     sides agree by construction from an empty state; the risk begins at the
--     first room a player buys.
-- ════════════════════════════════════════════════════════════════════════
-- Said out loud at apply time too, because the operator applying this file is
-- the person most likely to assume it switched artisan on.
do $$
begin
  raise notice 'ARTISAN PROGRESS MODEL APPLIED. The server can now READ both shapes. It is NOT '
               'switched on: ''artisan'' is still absent from PAYABLE_KINDS/SETTABLE_KINDS, the '
               'accrual engine does not yet PROPOSE a recipe-scroll grant, and no RPC writes a room '
               'rung. See §9 of this file for the three remaining steps and who owns each.';
end $$;
