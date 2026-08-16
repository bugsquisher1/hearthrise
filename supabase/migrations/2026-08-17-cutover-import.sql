-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE CUTOVER IMPORT.  One-time, per-player, trusted ONCE.
--
--   Companion tool:  tools/cutover-import.mjs   (builds the plan, verifies)
--   Companion guard: tests/cutover-import.mjs   (PGlite, synthetic snapshots)
--
-- ── WHY THIS EXISTS ─────────────────────────────────────────────────────
-- Tyler deferred the cutover WIPE (2026-08-15, recorded in
-- docs/design/HANDOFF-server-authority.md "SCOPE CHANGE"). Current players keep
-- their progress with explicit amnesty for any pre-cutover forgery. So the
-- cutover becomes:
--
--     freeze → IMPORT → verify → switch-on
--
-- and this file is the IMPORT half's server side: the ONE moment in the life of
-- this game where a client-authored `game_saves.snapshot` is allowed to become
-- server state. After it, never again.
--
-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  THE ADMISSION RULE — the whole design in one line                   ║
-- ║                                                                      ║
-- ║    A SNAPSHOT FIELD IS IMPORTED IF AND ONLY IF THE SERVER HAS A HOME ║
-- ║    FOR IT THAT `hr_state_of` CAN READ BACK.                          ║
-- ║                                                                      ║
-- ║  Everything else stays client-owned in the (untouched) blob. Two     ║
-- ║  consequences, both deliberate:                                      ║
-- ║   · verification is TOTAL rather than partial — every imported fact  ║
-- ║     is re-read through the envelope the game itself reads, so there  ║
-- ║     is no "imported but unverifiable" category to hide a defect in;  ║
-- ║   · the rule is self-enforcing. Adding a column to player_state      ║
-- ║     without adding it to hr_state_of does not silently create an     ║
-- ║     importable-but-unreadable field; it creates a field this file    ║
-- ║     REFUSES to import, by name.                                      ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- ── WHY NOT LET THE TOOL WRITE THE TABLES ───────────────────────────────
-- Architectural law 1, unchanged for a one-off: the tool computes a PROPOSED
-- plan; ONE `SECURITY DEFINER` RPC takes a per-character lock, re-validates
-- EVERY invariant server-side against the server's own catalogues, applies,
-- reads back, journals, and returns state. A migration script that INSERTed
-- rows straight from a blob would be a client value reaching a table with
-- nothing between them — which is the exact defect the whole program exists to
-- close, executed once at maximum blast radius on the one day nobody is
-- watching the game.
--
-- The tool is therefore allowed to be wrong. The database is not.
--
-- ── WHAT THE SERVER RE-DERIVES RATHER THAN ACCEPTS ──────────────────────
-- The plan may NOT name these, and the function computes them:
--   max_hp        `hr_level_from_xp(hitpoints xp)` — the client's own rule,
--                 evaluated on the XP THIS FUNCTION just wrote. A blob that
--                 says maxHp 5,000 imports as its real level.
--   hp            = max_hp. A full heal, once, stated. `playerHp` is NO_SYNC
--                 (it never reaches the blob), so there is nothing to import
--                 and the alternatives are "1 HP" and "invent a number".
--   accrued_to    `now()`. NEVER the blob's `offlineBudget.at`. A client
--                 watermark of 1970 is an unbounded mint (save-invariant #5),
--                 and the freeze window itself must not be paid.
--   active_kind   'idle'. The import does not resume an activity: `lastActivity`
--                 carries a client `stoppedAt` and resuming from it would pay
--                 the freeze. The player picks an activity on their first
--                 session back, which is one tap.
--   version       bumped. Any client still holding the pre-import version gets
--                 `version_conflict` on its next apply, which is correct: its
--                 world is now stale by an entire import.
--   display name  not imported at all. Names are derived from `profiles`
--                 (law 2); `playerName` in the blob is a client string that
--                 crosses to other players through chat and leaderboards.
--
-- ── IDEMPOTENCY ─────────────────────────────────────────────────────────
-- `hr_import_marker` is the marker, and it is NOT the ledger. The ledger is
-- prunable (hr_ledger_prune rolls up and deletes past the retention window), so
-- a marker that lived there would EXPIRE — and an import whose "have I done
-- this?" answer expires is an import that runs twice. The marker table is
-- never pruned and carries the source snapshot's sha256 + saved_at, so a
-- re-run against a DIFFERENT snapshot is skipped AND reported as a
-- disagreement rather than silently re-importing.
--
-- ── THE DRY RUN IS A REAL RUN THAT IS THROWN AWAY ───────────────────────
-- `p_commit => false` performs the ENTIRE import — every insert, every CHECK,
-- the unlock guard trigger, the read-back through `hr_state_of`, the internal
-- verification — and then raises `HR001` carrying the envelope, which unwinds
-- the subtransaction and returns the payload from the handler. Nothing
-- persists. This is strictly stronger than "compute the mapping and write
-- nothing": a plan that would violate `player_progress_unlock_shape` or trip
-- `hr_unlock_guard` fails in the rehearsal instead of on freeze day.
--   (`tools/cutover-import.mjs --dry-run` is the OTHER, weaker thing: it makes
--   no RPC call at all and is READ-ONLY by construction. `--rehearse` is this.
--   They are named differently on purpose.)
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────
--   drop function public.hr_import_apply(uuid,int,jsonb,jsonb,boolean);
--   drop table public.hr_import_marker;
-- Neither is referenced by anything else. Undoing an APPLIED import is a
-- different question and the answer is PITR — which is why the handoff lists
-- PITR-7 as a gate for this program and not a nice-to-have. There is no
-- "un-import" and this file does not pretend to offer one.
--
-- APPLY ORDER: … → 2026-08-16-unlock-buy.sql → the two grant sweeps → THIS
-- FILE. It reads hr_items / hr_skills / hr_equip_slots / hr_item_slots /
-- hr_crops / hr_unlocks and calls hr_create_character + hr_state_of, and it
-- FAILS CLOSED without any of them.
--
-- SAFE TO RE-RUN. Additive and idempotent.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ───────────────────────────────────────
-- Every catalogue this function validates against, and every function it
-- calls. A missing catalogue would not make the import fail; it would make it
-- ACCEPT EVERYTHING, which is worse than not running, because it reads as a
-- clean run in the report.
do $$
declare v_src text;
begin
  if to_regclass('public.player_state') is null then
    raise exception 'player_state is missing — apply 2026-08-11-player-state.sql first';
  end if;
  if to_regclass('public.game_saves') is null then
    raise exception 'game_saves is missing — there is nothing to import FROM. Apply '
                    '2026-08-10-dr-legacy-cloud-save.sql first.';
  end if;

  -- The five catalogues the re-validation reads. Each is asserted NON-EMPTY,
  -- not merely present: an empty hr_items makes every item id unknown and the
  -- import would silently deliver empty bags to every player, with this file's
  -- own self-check still green (it plants its own items).
  if to_regclass('public.hr_items') is null
     or (select count(*) from public.hr_items) = 0 then
    raise exception 'hr_items is absent or EMPTY — apply 2026-08-11-catalogue.generated.sql. '
                    'Item ids are validated against it; an empty catalogue would drop every '
                    'item in every bag and report a clean run.';
  end if;
  if to_regclass('public.hr_skills') is null
     or (select count(*) from public.hr_skills) = 0 then
    raise exception 'hr_skills is absent or EMPTY — apply 2026-08-11-catalogue.generated.sql';
  end if;
  if to_regclass('public.hr_equip_slots') is null
     or (select count(*) from public.hr_equip_slots) = 0 then
    raise exception 'hr_equip_slots is absent or EMPTY — apply 2026-08-11-catalogue.generated.sql';
  end if;
  if to_regclass('public.hr_item_slots') is null
     or (select count(*) from public.hr_item_slots) = 0 then
    raise exception 'hr_item_slots is absent or EMPTY — apply 2026-08-11-catalogue.generated.sql. '
                    'Without it an item could be imported into a slot it cannot occupy.';
  end if;
  if to_regclass('public.hr_crops') is null
     or (select count(*) from public.hr_crops) = 0 then
    raise exception 'hr_crops is absent or EMPTY — apply 2026-08-11-catalogue.generated.sql';
  end if;
  if to_regclass('public.hr_unlocks') is null
     or (select count(*) from public.hr_unlocks) = 0 then
    raise exception 'hr_unlocks is absent or EMPTY — apply 2026-08-16-unlocks.generated.sql. '
                    'Room rungs, property tiers and recipe gates are validated by '
                    'hr_unlock_guard against it.';
  end if;

  -- THE GUARD MUST BE ARMED. This is the load-bearing precondition of the whole
  -- unlock half of the import: without the trigger, a room rung imports with no
  -- ladder check, no ceiling and no kind pin, and `hr_perks_of` then reads a
  -- rung the shop does not sell. The import is the FIRST bulk writer of
  -- kind='unlock' rows this database has ever had.
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.player_progress'::regclass
                    and tgname  = 'player_progress_unlock_guard'
                    and not tgisinternal) then
    raise exception 'player_progress_unlock_guard is NOT installed — apply '
                    '2026-08-16-artisan-progress-model.sql first. The import is the first bulk '
                    'writer of kind=''unlock'' rows in this database; without the guard a rung '
                    'lands unvalidated and hr_perks_of reads a room the shop does not sell.';
  end if;

  -- The three functions this one calls.
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'hr_create_character is missing — apply 2026-08-14-character-bootstrap.sql. '
                    'The import does NOT create characters itself: a second creator of a '
                    'Hearthrise character is the b338 defect, and the whole point of the '
                    'impersonation in §2 is that there stays exactly one.';
  end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_state_of is missing — apply 2026-08-11-apply-engine.sql';
  end if;
  if to_regprocedure('public.hr_level_from_xp(bigint)') is null then
    raise exception 'hr_level_from_xp is missing — apply 2026-08-11-player-state.sql';
  end if;

  -- hr_state_of must carry the keys this file verifies against. If the envelope
  -- has moved, the verification below would compare against absent keys — and
  -- `null is not distinct from null` passes. That is the assertion-that-asserts-
  -- nothing family, so it is checked here rather than discovered in the report.
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_state_of';
  if v_src !~ 'tool_carry' or v_src !~ 'auto_eat_pct' or v_src !~ 'bank_cap' then
    raise exception 'hr_state_of does not carry tool_carry / auto_eat_pct / bank_cap. This file '
                    'verifies the import THROUGH that envelope; against a shorter one every '
                    'missing key would compare null-to-null and pass.';
  end if;

  raise notice 'cutover-import §0 PASSED: six catalogues loaded, the unlock guard is armed, and '
               'hr_state_of carries the keys the verification reads.';
end $$;


-- ── 1. THE MARKER ────────────────────────────────────────────────────────
-- Deliberately NOT a row in player_ledger. See the header: the ledger is
-- prunable and an expiring idempotency marker is not one.
create table if not exists public.hr_import_marker (
  user_id       uuid not null,
  slot          int  not null,
  -- The SOURCE the import was built from, so a second run against a different
  -- blob is a reportable disagreement rather than an invisible one.
  snapshot_sha  text not null check (snapshot_sha ~ '^[0-9a-f]{64}$'),
  snapshot_at   timestamptz,          -- game_saves.saved_at, for the record
  imported_at   timestamptz not null default now(),
  -- What was written and what was refused. The per-player report, in the
  -- database, so "what happened to my stuff" is answerable a year later
  -- without the tool's output file.
  counts        jsonb not null default '{}'::jsonb,
  tool          text,                 -- tools/cutover-import.mjs @ <git sha>
  primary key (user_id, slot)
);

alter table public.hr_import_marker enable row level security;
-- No policy at all: RLS with zero policies denies every non-owner row access.
-- The marker is operator bookkeeping, not player data, and a player has no
-- reason to read (or to learn the existence of) an import audit row.

-- "revoke all", not a three-verb revoke (Security C1, 2026-08-16). Supabase's
-- default ACL on public also grants TRUNCATE, REFERENCES and TRIGGER, and
-- TRUNCATE bypasses RLS entirely — on the ONE table that decides whether an
-- import runs a second time.
revoke all on public.hr_import_marker from public, anon, authenticated, service_role;


-- ── 2. hr_import_apply — the only writer ─────────────────────────────────
-- p_plan is a PROPOSAL. Nothing in it is trusted; every id is looked up in a
-- catalogue and every magnitude is clamped against a constant declared here.
--
-- SHAPE (unknown top-level keys are REFUSED by name — the b350 declaration-gap
-- lesson: a plan key nobody handles must not be silently ignored):
--   { "state"     : { gold, gems, hearth_tokens, bank_cap, auto_eat_enabled,
--                     auto_eat_food, auto_eat_pct, tool_carry },
--     "skills"    : { skill_id: xp },
--     "inventory" : { item_id: qty },
--     "equipment" : { equip_slot: item_id },
--     "farm"      : [ { i, crop, planted_at, watered_at } ],
--     "progress"  : [ { kind, key, value } ] }
--
-- RETURNS
--   { ok:true, imported:true|false, skipped:<reason>, dry_run:bool,
--     clamps:[…], drops:[…], counts:{…}, envelope:<hr_state_of> }
--   { ok:false, error:<name>, detail:{…} }
--
-- ERROR TAXONOMY (every one is a REFUSAL of that player, never of the batch —
-- the tool catches, reports, and continues):
--   bad_args              null user/slot, slot outside 0..5
--   bad_plan              p_plan is not an object
--   bad_plan_key          a top-level key nothing handles
--   no_character          hr_create_character refused (its own error is echoed)
--   character_already_played  version > 0, or a non-bootstrap ledger row exists.
--                         The import seeds a FRESH server character; running it
--                         over one that has already accrued would clobber real
--                         server-computed progress with a client blob.
--   bad_state_key         an unknown key inside "state"
--   bad_number            a non-number where a number belongs
--   unknown_skill         (dropped, not refused — see DROPS)
--   verify_mismatch       the read-back does not equal what was written. THE
--                         transactional backstop; rolls the player back whole.
--
-- DROPS vs CLAMPS vs REFUSALS, and the rule that decides which:
--   REFUSE  — the plan is structurally wrong (a shape nobody can interpret).
--             One player fails loudly; the batch continues.
--   DROP    — a well-formed entry naming something the catalogue does not know
--             (a renamed or removed item id, a skill that no longer exists).
--             Never guessed, never remapped, reported BY NAME.
--   CLAMP   — a well-formed entry whose MAGNITUDE is outside a structural
--             bound. Amnesty means no forensics; it does not mean accepting
--             1e12 gold, and it certainly does not mean accepting a value that
--             overflows a column and takes the whole run down.
create or replace function public.hr_import_apply(
  p_user   uuid,
  p_slot   int,
  p_plan   jsonb,
  p_meta   jsonb   default '{}'::jsonb,
  p_commit boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  -- ── THE STRUCTURAL BOUNDS ─────────────────────────────────────────────
  -- Each is a bound on what the DATABASE can hold and on what the SERVER's own
  -- honest maximum rate could ever have produced — not a balance opinion. They
  -- are constants in one place so the Game Designer can move one number.
  --
  --   gold      1e9. The largest live balance on 2026-08-15 is 770,182. The
  --             server's own daily budget ceiling is 25,000,000 gold/day, so
  --             1e9 is forty days at the maximum rate the engine will ever pay
  --             — unreachable by play, and 1,300x the largest real balance.
  --             `G.gold = 1e12` (the devtools exploit in CLAUDE.md's trigger)
  --             clamps here and is REPORTED.
  --   gems      1e7. The gem daily budget is 5,000/day (2026-08-15-gem-daily-
  --             budget.sql), so this is 2,000 days.
  --   xp        13,034,431 = xpForLevel(99) from src/core/xp.js. Level 99 is
  --             the top of the curve; the client shows no progress above it
  --             (xpToNext returns 0, xpPct returns 1). Stated cost: a player
  --             who genuinely ground past 99 in a skill loses the overflow.
  --             Nobody in the beta is within 30x of it (highest live: 582,071).
  --   qty       1e8 per stack. Live maximum 65,849.
  --   bank_cap  100,000 — the column's own CHECK.
  c_max_gold      constant bigint := 1000000000;
  c_max_gems      constant bigint := 10000000;
  c_max_tokens    constant bigint := 100000;
  c_max_xp        constant bigint := 13034431;
  c_max_qty       constant bigint := 100000000;
  c_max_bank_cap  constant int    := 100000;
  c_max_stacks    constant int    := 100000;
  c_max_plots     constant int    := 64;
  c_max_progress  constant int    := 512;
  c_max_value     constant bigint := 1000000000;
  -- A farm timestamp is a CLIENT clock. Clamped into a window rather than
  -- trusted: a forged `plantedAt` of 1970 is a plot that is instantly ripe on
  -- the first tick after switch-on, which is a free harvest of every plot.
  c_farm_window   constant interval := interval '30 days';

  c_plan_keys  constant text[] := array['state','skills','inventory','equipment','farm','progress'];
  c_state_keys constant text[] := array['gold','gems','hearth_tokens','bank_cap',
                                        'auto_eat_enabled','auto_eat_food','auto_eat_pct',
                                        'tool_carry'];

  v_slot     int;
  v_marker   public.hr_import_marker%rowtype;
  v_ver      bigint;
  v_ledger_n int;
  v_created  jsonb;
  v_k        text;
  v_v        jsonb;
  v_n        bigint;
  -- F1 (Security, APPLY-blocking): every magnitude is clamped in NUMERIC before
  -- the ::bigint cast. A snapshot value above bigint range (~9.2e18 — a devtools
  -- `G.gold = 1e308`) would otherwise throw 22003 on the cast BEFORE the clamp,
  -- failing that player's import instead of clamping-and-reporting as amnesty
  -- promises. numeric has no meaningful upper bound, so nothing reaches a cast
  -- out of range. `from` in the report is the numeric, so the receipt shows the
  -- real forged value rather than a truncated one.
  v_num      numeric;
  v_i        int;
  v_txt      text;
  v_row      jsonb;

  v_clamps   jsonb := '[]'::jsonb;
  v_drops    jsonb := '[]'::jsonb;

  v_gold     bigint := 0;
  v_gems     bigint := 0;
  v_tokens   bigint := 0;
  v_cap      int    := 100;
  v_ae_on    boolean := false;
  v_ae_food  text;
  v_ae_pct   int := 50;
  v_carry    jsonb := '{}'::jsonb;

  v_hp_xp    bigint := 0;
  v_max_hp   int;
  v_stacks   int := 0;
  v_n_sk     int := 0;
  v_n_inv    int := 0;
  v_n_eq     int := 0;
  v_n_farm   int := 0;
  v_n_prog   int := 0;

  v_env      jsonb;
  v_bad      text;
  v_payload  jsonb;
begin
  -- ── (a) ARGUMENTS ─────────────────────────────────────────────────────
  if p_user is null or p_slot is null then
    return jsonb_build_object('ok', false, 'error', 'bad_args');
  end if;
  v_slot := p_slot;
  if v_slot < 0 or v_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_args', 'detail',
             jsonb_build_object('slot', v_slot));
  end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_plan', 'detail',
             jsonb_build_object('type', jsonb_typeof(p_plan)));
  end if;
  for v_k in select jsonb_object_keys(p_plan) loop
    if not (v_k = any (c_plan_keys)) then
      return jsonb_build_object('ok', false, 'error', 'bad_plan_key', 'detail',
               jsonb_build_object('key', v_k, 'accepted', to_jsonb(c_plan_keys)));
    end if;
  end loop;

  -- ── (b) SERIALISE ─────────────────────────────────────────────────────
  -- Transaction-scoped: released by COMMIT or ROLLBACK, so an early return or
  -- an exception cannot leak it on a pooled connection. Namespaced by a
  -- literal, keyed per (user, slot).
  perform pg_advisory_xact_lock(
    hashtextextended('hr_import_apply:' || p_user::text || ':' || v_slot::text, 0));

  -- ── (c) IDEMPOTENCY ───────────────────────────────────────────────────
  select * into v_marker from public.hr_import_marker
   where user_id = p_user and slot = v_slot;
  if found then
    return jsonb_build_object(
      'ok', true, 'imported', false, 'skipped', 'already_imported',
      'marker', jsonb_build_object(
        'snapshot_sha', v_marker.snapshot_sha, 'snapshot_at', v_marker.snapshot_at,
        'imported_at', v_marker.imported_at, 'counts', v_marker.counts),
      -- The disagreement, if there is one, is REPORTED rather than acted on.
      -- Re-importing over a live character is never the right automatic answer.
      'sha_matches', (v_marker.snapshot_sha = coalesce(p_meta->>'snapshot_sha', '')));
  end if;

  -- ── (d) THE CHARACTER ─────────────────────────────────────────────────
  -- ⚠ IMPERSONATION, AND WHY IT IS THE CONSERVATIVE CHOICE.
  -- hr_create_character reads auth.uid(). This function is called by the
  -- migration owner, where auth.uid() is null. The two available shapes were:
  --   (1) copy the bootstrap's INSERT block into this file, or
  --   (2) set the `sub` claim for the duration of this transaction and call
  --       the one existing creator.
  -- (1) is a SECOND CREATOR of a Hearthrise character — b338 exists because
  -- production once minted characters its own client would never produce, and
  -- the fix was a frozen snapshot plus a guard, not a second literal. (2) keeps
  -- exactly one creator, so the start kit, the conservation rule (equipment is
  -- not also placed in the bag), the plot seeding and the create_character
  -- ledger row all come from the body that is already tested.
  -- `set_config(..., true)` is TRANSACTION-LOCAL, and this function is
  -- executable by nobody (see §3), so the claim cannot be set by a caller who
  -- was not already the owner.
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  begin
    v_created := public.hr_create_character(v_slot);
  exception when others then
    perform set_config('request.jwt.claim.sub', '', true);
    raise;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  if not coalesce((v_created->>'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'no_character',
             'detail', v_created);
  end if;

  -- ── (e) REFUSE TO IMPORT OVER A CHARACTER THAT HAS PLAYED ─────────────
  -- The import SEEDS a fresh server character. If this row has already accrued
  -- server-side, the blob is older than the server's own record and importing
  -- it would roll a real player backwards — the anti-rollback invariant
  -- (save-invariant #1) stated for the server side.
  select version into v_ver from public.player_state
   where user_id = p_user and slot = v_slot for update;
  if v_ver is null then
    return jsonb_build_object('ok', false, 'error', 'no_character',
             'detail', jsonb_build_object('why', 'row absent after create'));
  end if;
  if v_ver > 0 then
    return jsonb_build_object('ok', false, 'error', 'character_already_played',
             'detail', jsonb_build_object('version', v_ver));
  end if;
  select count(*) into v_ledger_n from public.player_ledger
   where user_id = p_user and slot = v_slot
     and coalesce(intent, '') <> 'create_character';
  if v_ledger_n > 0 then
    return jsonb_build_object('ok', false, 'error', 'character_already_played',
             'detail', jsonb_build_object('ledger_rows', v_ledger_n));
  end if;

  -- ── (f) STATE ─────────────────────────────────────────────────────────
  if p_plan ? 'state' then
    if jsonb_typeof(p_plan->'state') <> 'object' then
      return jsonb_build_object('ok', false, 'error', 'bad_plan',
               'detail', jsonb_build_object('at', 'state'));
    end if;
    for v_k in select jsonb_object_keys(p_plan->'state') loop
      if not (v_k = any (c_state_keys)) then
        return jsonb_build_object('ok', false, 'error', 'bad_state_key',
                 'detail', jsonb_build_object('key', v_k, 'accepted', to_jsonb(c_state_keys)));
      end if;
    end loop;

    -- Currencies. `floor` because a fractional gold is a client rounding
    -- artefact, not a decision, and bigint cannot hold it either way.
    if p_plan->'state' ? 'gold' then
      if jsonb_typeof(p_plan->'state'->'gold') <> 'number' then
        return jsonb_build_object('ok', false, 'error', 'bad_number',
                 'detail', jsonb_build_object('at', 'state.gold'));
      end if;
      v_num := floor(greatest(0, (p_plan->'state'->>'gold')::numeric));
      if v_num > c_max_gold then
        v_clamps := v_clamps || jsonb_build_object('field','gold','from',v_num,'to',c_max_gold);
        v_num := c_max_gold;
      end if;
      v_gold := v_num::bigint;
    end if;
    if p_plan->'state' ? 'gems' then
      if jsonb_typeof(p_plan->'state'->'gems') <> 'number' then
        return jsonb_build_object('ok', false, 'error', 'bad_number',
                 'detail', jsonb_build_object('at', 'state.gems'));
      end if;
      v_num := floor(greatest(0, (p_plan->'state'->>'gems')::numeric));
      if v_num > c_max_gems then
        v_clamps := v_clamps || jsonb_build_object('field','gems','from',v_num,'to',c_max_gems);
        v_num := c_max_gems;
      end if;
      v_gems := v_num::bigint;
    end if;
    -- The IAP bond. Its own column and its own bound, and the import is not an
    -- IAP path: the blob carries no hearth-token field today, so this is 0 in
    -- practice and the branch exists so a future one cannot arrive unbounded.
    if p_plan->'state' ? 'hearth_tokens' then
      if jsonb_typeof(p_plan->'state'->'hearth_tokens') <> 'number' then
        return jsonb_build_object('ok', false, 'error', 'bad_number',
                 'detail', jsonb_build_object('at', 'state.hearth_tokens'));
      end if;
      v_num := floor(greatest(0, (p_plan->'state'->>'hearth_tokens')::numeric));
      if v_num > c_max_tokens then
        v_clamps := v_clamps || jsonb_build_object('field','hearth_tokens','from',v_num,'to',c_max_tokens);
        v_num := c_max_tokens;
      end if;
      v_tokens := v_num::bigint;
    end if;
    if p_plan->'state' ? 'bank_cap' then
      if jsonb_typeof(p_plan->'state'->'bank_cap') <> 'number' then
        return jsonb_build_object('ok', false, 'error', 'bad_number',
                 'detail', jsonb_build_object('at', 'state.bank_cap'));
      end if;
      v_num := floor((p_plan->'state'->>'bank_cap')::numeric);
      if v_num < 1 then v_num := 1; end if;
      if v_num > c_max_bank_cap then
        v_clamps := v_clamps || jsonb_build_object('field','bank_cap','from',v_num,'to',c_max_bank_cap);
        v_num := c_max_bank_cap;
      end if;
      v_cap := v_num::int;
    end if;
    if p_plan->'state' ? 'auto_eat_pct' then
      -- Clamped to [0,100] in numeric before the cast, same F1 rule: a devtools
      -- auto_eat_pct of 1e308 must clamp, not throw 22003 on ::bigint.
      v_num := floor(coalesce((p_plan->'state'->>'auto_eat_pct')::numeric, 50));
      if v_num < 0 or v_num > 100 then
        v_clamps := v_clamps || jsonb_build_object('field','auto_eat_pct','from',v_num,
                                                   'to', least(100, greatest(0, v_num)));
        v_num := least(100, greatest(0, v_num));
      end if;
      v_ae_pct := v_num::int;
    end if;
    v_ae_on   := coalesce((p_plan->'state'->>'auto_eat_enabled')::boolean, false);
    v_ae_food := nullif(p_plan->'state'->>'auto_eat_food', '');
    if p_plan->'state' ? 'tool_carry' and jsonb_typeof(p_plan->'state'->'tool_carry') = 'object' then
      v_carry := p_plan->'state'->'tool_carry';
    end if;
  end if;

  -- ── (g) SKILLS ────────────────────────────────────────────────────────
  -- The bootstrap already inserted one row per CATALOGUED skill at the kit's
  -- XP. The import UPDATEs those rows; it never inserts a skill the catalogue
  -- does not have, so `skills.combat` (a client-side derived cache that lives
  -- in the same bag) and any retired skill id are dropped BY NAME rather than
  -- creating a row nothing can read.
  if p_plan ? 'skills' then
    if jsonb_typeof(p_plan->'skills') <> 'object' then
      return jsonb_build_object('ok', false, 'error', 'bad_plan',
               'detail', jsonb_build_object('at', 'skills'));
    end if;
    for v_k, v_v in select key, value from jsonb_each(p_plan->'skills') loop
      if not exists (select 1 from public.hr_skills where skill_id = v_k) then
        v_drops := v_drops || jsonb_build_object('kind','skill','id',v_k,
                                                 'reason','not_in_hr_skills','value',v_v);
        continue;
      end if;
      if jsonb_typeof(v_v) <> 'number' then
        v_drops := v_drops || jsonb_build_object('kind','skill','id',v_k,
                                                 'reason','not_a_number','value',v_v);
        continue;
      end if;
      v_num := floor(greatest(0, (v_v#>>'{}')::numeric));
      if v_num > c_max_xp then
        v_clamps := v_clamps || jsonb_build_object('field','skill:'||v_k,'from',v_num,'to',c_max_xp);
        v_num := c_max_xp;
      end if;
      v_n := v_num::bigint;
      update public.player_skills set xp = v_n
       where user_id = p_user and slot = v_slot and skill_id = v_k;
      if not found then
        insert into public.player_skills (user_id, slot, skill_id, xp)
          values (p_user, v_slot, v_k, v_n);
      end if;
      v_n_sk := v_n_sk + 1;
      if v_k = 'hitpoints' then v_hp_xp := v_n; end if;
    end loop;
  end if;
  if v_hp_xp = 0 then
    select coalesce(xp, 0) into v_hp_xp from public.player_skills
     where user_id = p_user and slot = v_slot and skill_id = 'hitpoints';
  end if;
  -- DERIVED, not accepted. `G.playerMaxHp = levelFromXp(G.skills.hitpoints)` is
  -- the client's own rule, evaluated here on the XP that was just written.
  v_max_hp := greatest(1, public.hr_level_from_xp(coalesce(v_hp_xp, 0)));

  -- ── (h) INVENTORY ─────────────────────────────────────────────────────
  -- The bootstrap seeded the start kit; the import REPLACES the bag wholesale,
  -- because the blob is the whole truth about what the player is holding and a
  -- merge would hand every importing player a second free start kit.
  delete from public.player_inventory where user_id = p_user and slot = v_slot;
  if p_plan ? 'inventory' then
    if jsonb_typeof(p_plan->'inventory') <> 'object' then
      return jsonb_build_object('ok', false, 'error', 'bad_plan',
               'detail', jsonb_build_object('at', 'inventory'));
    end if;
    for v_k, v_v in select key, value from jsonb_each(p_plan->'inventory') loop
      if not exists (select 1 from public.hr_items where item_id = v_k) then
        -- NEVER GUESSED. A renamed or removed id is reported by name; the tool
        -- writes it into the per-player report and the runbook decides.
        v_drops := v_drops || jsonb_build_object('kind','item','id',v_k,
                                                 'reason','not_in_hr_items','value',v_v);
        continue;
      end if;
      if jsonb_typeof(v_v) <> 'number' then
        v_drops := v_drops || jsonb_build_object('kind','item','id',v_k,
                                                 'reason','not_a_number','value',v_v);
        continue;
      end if;
      v_num := floor((v_v#>>'{}')::numeric);
      if v_num <= 0 then
        -- A zero row is deleted, never stored (the column's own CHECK says so).
        continue;
      end if;
      if v_num > c_max_qty then
        v_clamps := v_clamps || jsonb_build_object('field','item:'||v_k,'from',v_num,'to',c_max_qty);
        v_num := c_max_qty;
      end if;
      v_n := v_num::bigint;
      insert into public.player_inventory (user_id, slot, item_id, qty)
        values (p_user, v_slot, v_k, v_n)
        on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
      v_n_inv := v_n_inv + 1;
    end loop;
  end if;

  -- THE BANK CAP MUST FIT WHAT WE JUST WROTE. hr_apply refuses any delta that
  -- would leave more stacks than `bank_cap` (`bank_full`), so importing 115
  -- stacks against a cap of 100 does not lose an item today — it makes EVERY
  -- future accrual fail, permanently, for that player. Measured on live data
  -- 2026-08-15: the largest bag is 115 stacks. Raise the cap and REPORT; the
  -- alternative is deleting a player's items to fit a number the client never
  -- enforced.
  select count(*) into v_stacks from public.player_inventory
   where user_id = p_user and slot = v_slot;
  if v_stacks > v_cap then
    v_clamps := v_clamps || jsonb_build_object('field','bank_cap','from',v_cap,
                                               'to', least(c_max_stacks, v_stacks),
                                               'why','stacks_exceed_cap','stacks',v_stacks);
    v_cap := least(c_max_stacks, v_stacks);
  end if;

  -- ── (i) EQUIPMENT ─────────────────────────────────────────────────────
  delete from public.player_equipment where user_id = p_user and slot = v_slot;
  if p_plan ? 'equipment' then
    for v_k, v_v in select key, value from jsonb_each(p_plan->'equipment') loop
      v_txt := nullif(v_v#>>'{}', '');
      if v_txt is null then continue; end if;
      if not exists (select 1 from public.hr_equip_slots where equip_slot = v_k) then
        v_drops := v_drops || jsonb_build_object('kind','equip_slot','id',v_k,
                                                 'reason','not_in_hr_equip_slots','value',v_txt);
        continue;
      end if;
      if not exists (select 1 from public.hr_items where item_id = v_txt) then
        -- Live example: `companion` holds `phoenix_chick`, which is a COMPANION
        -- and not an item — it is not in hr_items and never was. Dropped by
        -- name; companion OWNERSHIP is imported separately as a flag unlock.
        v_drops := v_drops || jsonb_build_object('kind','equipped_item','id',v_txt,
                                                 'slot',v_k,'reason','not_in_hr_items');
        continue;
      end if;
      -- ...and it must be able to OCCUPY that slot. Without this an import
      -- could put a helmet in the weapon slot and the combat engine would
      -- price a fight nothing in the game can produce.
      if not exists (select 1 from public.hr_item_slots
                      where item_id = v_txt and equip_slot = v_k) then
        v_drops := v_drops || jsonb_build_object('kind','equipped_item','id',v_txt,
                                                 'slot',v_k,'reason','item_not_valid_for_slot');
        continue;
      end if;
      insert into public.player_equipment (user_id, slot, equip_slot, item_id)
        values (p_user, v_slot, v_k, v_txt)
        on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
      v_n_eq := v_n_eq + 1;
    end loop;
  end if;

  -- ── (j) FARM ──────────────────────────────────────────────────────────
  delete from public.player_farm where user_id = p_user and slot = v_slot;
  if p_plan ? 'farm' then
    if jsonb_typeof(p_plan->'farm') <> 'array' then
      return jsonb_build_object('ok', false, 'error', 'bad_plan',
               'detail', jsonb_build_object('at', 'farm'));
    end if;
    for v_row in select value from jsonb_array_elements(p_plan->'farm') loop
      v_i := coalesce((v_row->>'i')::int, -1);
      if v_i < 0 or v_i >= c_max_plots then
        v_drops := v_drops || jsonb_build_object('kind','plot','id',v_i,'reason','index_out_of_range');
        continue;
      end if;
      v_txt := nullif(v_row->>'crop', '');
      if v_txt is not null and not exists (select 1 from public.hr_crops where crop_id = v_txt) then
        v_drops := v_drops || jsonb_build_object('kind','crop','id',v_txt,'plot',v_i,
                                                 'reason','not_in_hr_crops');
        v_txt := null;
      end if;
      insert into public.player_farm (user_id, slot, plot_idx, crop_id, planted_at, watered_at)
        values (
          p_user, v_slot, v_i, v_txt,
          -- CLIENT CLOCKS, CLAMPED. Never trusted: a forged plantedAt of 1970
          -- is an instantly-ripe plot on the first tick after switch-on.
          case when v_txt is null then null
               else least(now(), greatest(now() - c_farm_window,
                                          coalesce((v_row->>'planted_at')::timestamptz, now()))) end,
          case when v_txt is null then null
               else least(now(), greatest(now() - c_farm_window,
                                          coalesce((v_row->>'watered_at')::timestamptz,
                                                   now() - c_farm_window))) end)
        on conflict (user_id, slot, plot_idx) do update
          set crop_id = excluded.crop_id, planted_at = excluded.planted_at,
              watered_at = excluded.watered_at;
      v_n_farm := v_n_farm + 1;
    end loop;
  end if;

  -- ── (k) PROGRESS — including every unlock row ─────────────────────────
  -- The import writes ONLY permanent rows (period_key = ''). Nothing periodic
  -- is imported: a daily counter is a fact about a day that is ending, the
  -- freeze is measured in hours, and a day key imported from a client string
  -- ('Sun Aug 16 2026') is not the database's day key (hr_utc_day_key's FM
  -- format yields '2026-8-16'). See the tool's FIELD MAP entry for `daily`.
  --
  -- ⚠ THE UNLOCK GUARD DOES THE HARD PART, AND THAT IS THE DESIGN. Rung
  --   ladders, ceilings, monotonicity and the kind pin are enforced by
  --   `player_progress_unlock_guard` — the same trigger every other writer goes
  --   through. This function does not restate them; restating a rule is how two
  --   copies of it drift. §0 refuses to install if the trigger is absent.
  if p_plan ? 'progress' then
    if jsonb_typeof(p_plan->'progress') <> 'array' then
      return jsonb_build_object('ok', false, 'error', 'bad_plan',
               'detail', jsonb_build_object('at', 'progress'));
    end if;
    if jsonb_array_length(p_plan->'progress') > c_max_progress then
      return jsonb_build_object('ok', false, 'error', 'bad_plan',
               'detail', jsonb_build_object('at','progress','n',jsonb_array_length(p_plan->'progress'),
                                            'limit', c_max_progress));
    end if;
    for v_row in select value from jsonb_array_elements(p_plan->'progress') loop
      v_k   := v_row->>'kind';
      v_txt := v_row->>'key';
      if v_k is null or v_txt is null or length(v_txt) not between 1 and 64 then
        v_drops := v_drops || jsonb_build_object('kind','progress','id',coalesce(v_txt,'(null)'),
                                                 'reason','bad_shape');
        continue;
      end if;
      v_num := floor(coalesce((v_row->>'value')::numeric, 0));
      if v_num <= 0 then
        -- A zero flag is an absent flag. Writing it would be a row that reads
        -- as "not unlocked" while occupying space and confusing every report.
        continue;
      end if;
      if v_num > c_max_value then
        v_clamps := v_clamps || jsonb_build_object('field','progress:'||v_txt,'from',v_num,'to',c_max_value);
        v_num := c_max_value;
      end if;
      v_n := v_num::bigint;
      begin
        insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
          values (p_user, v_slot, v_k, v_txt, v_n, '', null)
          on conflict (user_id, slot, kind, key, period_key) do update
            -- GREATEST, never `+`. A room rung is a level: two writes of rung 3
            -- must read 3, not 6. This is the merge the catalogue declares for
            -- `max` namespaces, and it is harmless for flags and counts because
            -- the import writes each key exactly once.
            set value = greatest(player_progress.value, excluded.value);
      exception
        -- hr_unlock_guard raises check_violation BY DESIGN (so hr_apply's own
        -- handler can catch it). Here it means the plan proposed a rung the
        -- catalogue does not sell, a kind the catalogue does not store it
        -- under, or an id it has never heard of. That is a DROP, by name, with
        -- the database's own message attached — not a refusal of the player.
        when check_violation then
          v_drops := v_drops || jsonb_build_object('kind','progress','id',v_txt,
                                                   'progress_kind',v_k,'value',v_n,
                                                   'reason','refused_by_guard','detail',sqlerrm);
          continue;
      end;
      v_n_prog := v_n_prog + 1;
    end loop;
  end if;

  -- ── (l) THE STATE ROW ─────────────────────────────────────────────────
  -- auto_eat_enabled is gated on the OWNERSHIP row the import just wrote, not
  -- on the blob's boolean: `hr_set_auto_eat` requires trait:auto_eat, and an
  -- import that switched auto-eat on without the trait would be the one path
  -- into that column that skips its own purchase gate.
  if v_ae_on and not exists (
        select 1 from public.player_progress
         where user_id = p_user and slot = v_slot
           and kind = 'flag' and key = 'trait:auto_eat' and period_key = '' and value > 0) then
    v_drops := v_drops || jsonb_build_object('kind','state','id','auto_eat_enabled',
                                             'reason','no_trait_auto_eat_row');
    v_ae_on := false;
  end if;
  -- ...and the food must be something the catalogue says is auto-eatable.
  if v_ae_food is not null and not exists (
        select 1 from public.hr_items where item_id = v_ae_food and auto_eatable) then
    v_drops := v_drops || jsonb_build_object('kind','state','id','auto_eat_food',
                                             'value',v_ae_food,'reason','not_auto_eatable');
    v_ae_food := null;
  end if;

  update public.player_state
     set gold = v_gold, gems = v_gems, hearth_tokens = v_tokens,
         bank_cap = v_cap,
         max_hp = v_max_hp,
         hp = v_max_hp,                       -- one full heal, stated
         auto_eat_enabled = v_ae_on,
         auto_eat_food = v_ae_food,
         auto_eat_pct = v_ae_pct,
         tool_carry = v_carry,
         active_kind = 'idle', active_id = null, active_since = null,
         accrued_to = now(),                  -- NEVER the blob's watermark
         version = version + 1,
         updated_at = now()
   where user_id = p_user and slot = v_slot;

  -- ── (m) READ BACK AND VERIFY — the transactional backstop ─────────────
  -- Everything above decided what to write. This reads it back through the
  -- SAME envelope the game itself reads and asserts they agree. A mismatch is
  -- an exception, which unwinds this player whole — one player's surprise never
  -- becomes a half-imported character.
  v_env := public.hr_state_of(p_user, v_slot);
  v_bad := null;

  if coalesce((v_env->>'ok')::boolean, false) is not true then
    v_bad := 'hr_state_of refused: ' || coalesce(v_env->>'error', '?');
  elsif (v_env->'state'->>'gold')::bigint is distinct from v_gold then
    v_bad := format('gold %s <> %s', v_env->'state'->>'gold', v_gold);
  elsif (v_env->'state'->>'gems')::bigint is distinct from v_gems then
    v_bad := format('gems %s <> %s', v_env->'state'->>'gems', v_gems);
  elsif (v_env->'state'->>'hearth_tokens')::bigint is distinct from v_tokens then
    v_bad := format('hearth_tokens %s <> %s', v_env->'state'->>'hearth_tokens', v_tokens);
  elsif (v_env->'state'->>'bank_cap')::int is distinct from v_cap then
    v_bad := format('bank_cap %s <> %s', v_env->'state'->>'bank_cap', v_cap);
  elsif (v_env->'state'->>'max_hp')::int is distinct from v_max_hp then
    v_bad := format('max_hp %s <> %s', v_env->'state'->>'max_hp', v_max_hp);
  elsif (v_env->'state'->>'hp')::int is distinct from v_max_hp then
    v_bad := format('hp %s <> %s', v_env->'state'->>'hp', v_max_hp);
  elsif v_env->'state'->>'active_kind' is distinct from 'idle' then
    v_bad := format('active_kind %s <> idle', v_env->'state'->>'active_kind');
  elsif (v_env->'state'->>'auto_eat_enabled')::boolean is distinct from v_ae_on then
    v_bad := 'auto_eat_enabled';
  elsif v_env->'state'->>'auto_eat_food' is distinct from v_ae_food then
    v_bad := 'auto_eat_food';
  elsif (v_env->'state'->>'auto_eat_pct')::int is distinct from v_ae_pct then
    v_bad := 'auto_eat_pct';
  elsif v_env->'state'->'tool_carry' is distinct from v_carry then
    v_bad := 'tool_carry';
  end if;

  -- Row counts. The envelope aggregates, so a count comparison catches the one
  -- failure a spot check cannot: a row that was written and did not arrive.
  if v_bad is null then
    if (select count(*) from jsonb_object_keys(v_env->'inventory'))
         is distinct from (select count(*) from public.player_inventory
                            where user_id = p_user and slot = v_slot) then
      v_bad := 'inventory row count';
    elsif (select count(*) from jsonb_object_keys(v_env->'equipment')) is distinct from v_n_eq then
      v_bad := format('equipment %s <> %s',
                      (select count(*) from jsonb_object_keys(v_env->'equipment')), v_n_eq);
    elsif jsonb_array_length(v_env->'farm')
            is distinct from (select count(*) from public.player_farm
                               where user_id = p_user and slot = v_slot) then
      v_bad := 'farm row count';
    elsif (select count(*) from jsonb_array_elements(v_env->'progress') e
            where e->>'period' = '') is distinct from v_n_prog then
      v_bad := format('progress %s <> %s',
                      (select count(*) from jsonb_array_elements(v_env->'progress') e
                        where e->>'period' = ''), v_n_prog);
    elsif coalesce((v_env->>'progress_truncated')::boolean, false) then
      -- The envelope LIMITs at 1000 rows. If the import produced more than the
      -- game can read back, the import is bigger than the contract.
      v_bad := 'progress_truncated: the import wrote more permanent rows than hr_state_of returns';
    end if;
  end if;

  -- Every imported skill xp, item qty and equipped id, compared one by one.
  if v_bad is null then
    select string_agg(x, '; ') into v_bad from (
      select format('skill %s: env %s <> db %s', s.skill_id,
                    v_env->'skills'->s.skill_id->>'xp', s.xp) x
        from public.player_skills s
       where s.user_id = p_user and s.slot = v_slot
         and coalesce((v_env->'skills'->s.skill_id->>'xp')::bigint, -1) is distinct from s.xp
      union all
      select format('item %s: env %s <> db %s', i.item_id,
                    v_env->'inventory'->>i.item_id, i.qty)
        from public.player_inventory i
       where i.user_id = p_user and i.slot = v_slot
         and coalesce((v_env->'inventory'->>i.item_id)::bigint, -1) is distinct from i.qty
      union all
      select format('equip %s: env %s <> db %s', e.equip_slot,
                    v_env->'equipment'->>e.equip_slot, e.item_id)
        from public.player_equipment e
       where e.user_id = p_user and e.slot = v_slot
         and coalesce(v_env->'equipment'->>e.equip_slot, '') is distinct from e.item_id
      limit 20) t;
  end if;

  if v_bad is not null then
    raise exception 'verify_mismatch: %', v_bad using errcode = 'raise_exception';
  end if;

  -- ── (n) JOURNAL — one row, not one per grant ──────────────────────────
  -- Journal rule 6. `game_events` reached 1.6M rows / 229 MB from six players
  -- in four days by journalling per event; an import that wrote a ledger row
  -- per item would write ~115 rows for one player for one non-recurring
  -- operation. `gold` carries the imported balance so the rollup's `gold_in`
  -- accounts for every gold that has ever entered the economy, including this.
  insert into public.player_ledger (user_id, slot, kind, intent, gold, meta)
    values (p_user, v_slot, 'admin', 'cutover_import', v_gold,
            jsonb_build_object(
              'slot', v_slot,
              'snapshot_sha', p_meta->>'snapshot_sha',
              'snapshot_at', p_meta->>'snapshot_at',
              'tool', p_meta->>'tool',
              'counts', jsonb_build_object('skills', v_n_sk, 'items', v_n_inv,
                                           'equipment', v_n_eq, 'farm', v_n_farm,
                                           'progress', v_n_prog, 'stacks', v_stacks),
              'gems', v_gems, 'hearth_tokens', v_tokens, 'bank_cap', v_cap,
              'max_hp', v_max_hp,
              'clamps', v_clamps, 'drops', v_drops,
              'catalogue', (select digest from public.hr_catalogue_meta)));

  insert into public.hr_import_marker (user_id, slot, snapshot_sha, snapshot_at, counts, tool)
    values (p_user, v_slot,
            coalesce(p_meta->>'snapshot_sha', repeat('0', 64)),
            (p_meta->>'snapshot_at')::timestamptz,
            jsonb_build_object('skills', v_n_sk, 'items', v_n_inv, 'equipment', v_n_eq,
                               'farm', v_n_farm, 'progress', v_n_prog,
                               'clamped', jsonb_array_length(v_clamps),
                               'dropped', jsonb_array_length(v_drops)),
            p_meta->>'tool');

  v_payload := jsonb_build_object(
    'ok', true, 'imported', true, 'dry_run', not p_commit,
    'clamps', v_clamps, 'drops', v_drops,
    'counts', jsonb_build_object('skills', v_n_sk, 'items', v_n_inv, 'equipment', v_n_eq,
                                 'farm', v_n_farm, 'progress', v_n_prog, 'stacks', v_stacks),
    'derived', jsonb_build_object('max_hp', v_max_hp, 'hp', v_max_hp, 'bank_cap', v_cap),
    'envelope', v_env);

  -- ── (o) THE DRY RUN ───────────────────────────────────────────────────
  -- Everything above has happened. Raising here unwinds the ENTIRE
  -- subtransaction — inserts, updates, ledger, marker — and the handler returns
  -- the payload the raise carried. So a rehearsal exercises every CHECK, the
  -- unlock guard, hr_state_of and the verification, and persists nothing.
  if not p_commit then
    raise exception using errcode = 'HR001', message = v_payload::text;
  end if;
  return v_payload;

exception
  when sqlstate 'HR001' then
    -- The payload came back through the error message. Parse it rather than
    -- trusting it: if the round trip mangled it, that is a failure of the
    -- rehearsal mechanism and it must not read as a clean rehearsal.
    begin
      return sqlerrm::jsonb;
    exception when others then
      return jsonb_build_object('ok', false, 'error', 'dry_run_payload_lost',
                                'detail', left(sqlerrm, 400));
    end;
end $fn$;


-- ── 3. GRANTS — revoke from PUBLIC first, and grant to NOBODY ────────────
-- Postgres grants EXECUTE to PUBLIC on every new function and Supabase's
-- default ACL additionally grants it to anon, authenticated and service_role.
-- `create or replace` PRESERVES an existing ACL, so a wrong one would survive a
-- re-apply.
--
-- THERE IS NO MATCHING GRANT, AND THAT IS THE POINT. This function overwrites a
-- character's entire state from a caller-supplied blob. It is reachable only by
-- the owner (postgres), i.e. only through the Management API query endpoint
-- that tools/apply-migration.mjs and tools/cutover-import.mjs use — a path that
-- requires the personal access token in ~/.supabase-token. `hr_engine` is
-- revoked explicitly: the Edge Function must never be one bug away from
-- rewriting a player from a JSON body.
revoke all on function public.hr_import_apply(uuid, int, jsonb, jsonb, boolean)
  from public, anon, authenticated, service_role, hr_engine;


-- ── 4. SELF-VERIFICATION — executed, not asserted ────────────────────────
-- The commit gate. Every load-bearing claim this file makes, run against the
-- database it was just applied to, and rolled back whole.
do $$
declare
  v_uid   uuid;
  v_slot  constant int := 5;
  v_item  text;
  v_item2 text;
  v_slotid text;
  v_food  text;
  v_r     jsonb;
  v_n     bigint;
  v_txt   text;
begin
  -- (a) THE ACL. A privileged RPC left executable by a client role is the whole
  --     game. Asserted for every role that can reach PostgREST.
  foreach v_txt in array array['anon','authenticated','service_role','hr_engine'] loop
    if not exists (select 1 from pg_roles where rolname = v_txt) then continue; end if;
    if has_function_privilege(v_txt, 'public.hr_import_apply(uuid,int,jsonb,jsonb,boolean)', 'execute') then
      raise exception 'hr_import_apply is EXECUTABLE by %. It rewrites a character from a blob; '
                      'the only caller is the migration owner.', v_txt;
    end if;
  end loop;
  -- PUBLIC is a pseudo-role, so has_function_privilege cannot be asked about it
  -- (it raises "role public does not exist"). Read the ACL directly: an entry
  -- whose grantee is 0 IS the grant to PUBLIC, and a NULL proacl means the
  -- built-in default — which for a function IS `EXECUTE TO PUBLIC`.
  if exists (
    select 1 from pg_proc p
     where p.oid = 'public.hr_import_apply(uuid,int,jsonb,jsonb,boolean)'::regprocedure
       and (p.proacl is null
            or exists (select 1 from aclexplode(p.proacl) a
                        where a.grantee = 0 and a.privilege_type = 'EXECUTE'))) then
    raise exception 'hr_import_apply is executable by PUBLIC (or carries the default ACL, which '
                    'means the same thing). The revoke in §3 did not take.';
  end if;

  -- (b) THE MARKER TABLE holds no client write grant.
  foreach v_txt in array array['anon','authenticated','service_role'] loop
    if not exists (select 1 from pg_roles where rolname = v_txt) then continue; end if;
    if has_table_privilege(v_txt, 'public.hr_import_marker', 'insert')
       or has_table_privilege(v_txt, 'public.hr_import_marker', 'update')
       or has_table_privilege(v_txt, 'public.hr_import_marker', 'delete')
       or has_table_privilege(v_txt, 'public.hr_import_marker', 'truncate') then
      raise exception 'hr_import_marker carries a write grant for % — an idempotency marker that a '
                      'client can delete is not one.', v_txt;
    end if;
  end loop;

  -- (c) THE BEHAVIOURAL PROBE. Runs only if there is a real user with a free
  --     slot 5 — the same predicate 2026-08-14-character-bootstrap.sql §6(g)
  --     uses. It is a DRY RUN (p_commit => false), so it writes nothing even
  --     on the way to succeeding, and the guard is reported either way: a
  --     skipped probe that reads as a pass is the failure this project has
  --     named fifteen times.
  select u.id into v_uid from auth.users u
   where not exists (select 1 from public.player_state ps
                      where ps.user_id = u.id and ps.slot = v_slot)
     and not exists (select 1 from public.hr_import_marker m
                      where m.user_id = u.id and m.slot = v_slot)
   limit 1;

  if v_uid is null then
    raise notice '§4(c) SKIPPED: no auth.users row with a free slot 5. The ACL and grant claims '
                 'above DID run. Re-run tests/cutover-import.mjs for the behavioural half.';
    return;
  end if;

  -- Pick real ids out of the catalogues rather than naming any.
  select item_id into v_item  from public.hr_items order by item_id limit 1;
  select i.item_id, s.equip_slot into v_item2, v_slotid
    from public.hr_item_slots s join public.hr_items i on i.item_id = s.item_id
   order by i.item_id limit 1;
  select item_id into v_food from public.hr_items where auto_eatable order by item_id limit 1;

  -- (c-i) A NORMAL IMPORT, rehearsed.
  v_r := public.hr_import_apply(
    v_uid, v_slot,
    jsonb_build_object(
      'state', jsonb_build_object('gold', 1234, 'gems', 7, 'bank_cap', 100,
                                  'auto_eat_pct', 90, 'auto_eat_enabled', true,
                                  'auto_eat_food', v_food),
      'skills', jsonb_build_object('hitpoints', 13363, 'mining', 5000),
      'inventory', jsonb_build_object(v_item, 5),
      'equipment', jsonb_build_object(v_slotid, v_item2),
      'progress', jsonb_build_array(
        jsonb_build_object('kind','unlock','key','room:kitchen','value',3),
        jsonb_build_object('kind','flag','key','trait:auto_eat','value',1))),
    jsonb_build_object('snapshot_sha', repeat('a', 64), 'tool', 'self-check'),
    false);

  if coalesce(v_r->>'ok','') <> 'true' then
    raise exception '§4(c-i): a well-formed rehearsal was refused: %', v_r;
  end if;
  if coalesce((v_r->>'dry_run')::boolean, false) is not true then
    raise exception '§4(c-i): the rehearsal did not report dry_run — the payload did not come back '
                    'through the HR001 handler, so nothing proves it rolled back';
  end if;
  -- The read-back is the point: assert the ENVELOPE, not the plan.
  if (v_r->'envelope'->'state'->>'gold')::bigint <> 1234 then
    raise exception '§4(c-i): envelope gold reads %', v_r->'envelope'->'state'->>'gold';
  end if;
  -- max_hp is DERIVED. 13,363 hitpoints xp is level 30 on the shared curve; the
  -- number is not restated here, it is compared to the function that owns it.
  if (v_r->'envelope'->'state'->>'max_hp')::int <> public.hr_level_from_xp(13363) then
    raise exception '§4(c-i): max_hp % is not hr_level_from_xp(13363) = % — the import accepted a '
                    'client HP instead of deriving it',
                    v_r->'envelope'->'state'->>'max_hp', public.hr_level_from_xp(13363);
  end if;
  if (v_r->'envelope'->'state'->>'hp')::int <> (v_r->'envelope'->'state'->>'max_hp')::int then
    raise exception '§4(c-i): hp is not max_hp after import';
  end if;
  if v_r->'envelope'->'state'->>'active_kind' <> 'idle' then
    raise exception '§4(c-i): the import resumed an activity';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_r->'envelope'->'progress') e
                  where e->>'key' = 'room:kitchen' and (e->>'value')::int = 3) then
    raise exception '§4(c-i): room:kitchen rung 3 did not reach the envelope — hr_perks_of would '
                    'read noBurn 0 and the artisan flip would burn a Kitchen owner''s food. '
                    'progress was: %', v_r->'envelope'->'progress';
  end if;

  -- (c-ii) NOTHING PERSISTED. The whole claim of the dry run.
  if exists (select 1 from public.hr_import_marker where user_id = v_uid and slot = v_slot) then
    raise exception '§4(c-ii): the rehearsal left a marker row — it did NOT roll back';
  end if;
  if exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    raise exception '§4(c-ii): the rehearsal left a player_state row — it did NOT roll back';
  end if;

  -- (c-iii) THE FORGED SAVE. 1e12 gold clamps and is REPORTED. A clamp nobody
  --         can see is indistinguishable from a value that was accepted.
  v_r := public.hr_import_apply(
    v_uid, v_slot,
    jsonb_build_object('state', jsonb_build_object('gold', 1000000000000::bigint),
                       'skills', jsonb_build_object('mining', 999999999::bigint)),
    '{}'::jsonb, false);
  if (v_r->'envelope'->'state'->>'gold')::bigint <> 1000000000 then
    raise exception '§4(c-iii): forged gold read back as % — the clamp did not apply',
                    v_r->'envelope'->'state'->>'gold';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_r->'clamps') c where c->>'field' = 'gold') then
    raise exception '§4(c-iii): gold was clamped SILENTLY. The clamp must appear in the report.';
  end if;
  if (v_r->'envelope'->'skills'->'mining'->>'xp')::bigint <> 13034431 then
    raise exception '§4(c-iii): forged mining xp read back as %',
                    v_r->'envelope'->'skills'->'mining'->>'xp';
  end if;

  -- (c-iii-b) F1 (Security, APPLY-blocking): a value ABOVE bigint range must
  --   CLAMP AND REPORT, not throw 22003 on the ::bigint cast. 1e308 is the
  --   devtools threat model in CLAUDE.md (`G.gold = 1e308`), and it is passed
  --   as a JSON NUMBER — not `::bigint`, which would itself throw before the
  --   RPC ever ran. If this raises 22003 the whole DO block fails, which is the
  --   RED this fixture exists to make impossible.
  v_r := public.hr_import_apply(
    v_uid, v_slot,
    ('{"state":{"gold":1e308,"gems":1e308,"auto_eat_pct":1e308},'
      || '"skills":{"mining":1e308},"inventory":{},'
      || '"progress":[{"kind":"stat","key":"kills","value":1e308}]}')::jsonb,
    '{}'::jsonb, false);
  if coalesce(v_r->>'ok','') <> 'true' then
    raise exception '§4(c-iii-b): an above-bigint snapshot FAILED instead of clamping: %', v_r;
  end if;
  if (v_r->'envelope'->'state'->>'gold')::bigint <> 1000000000 then
    raise exception '§4(c-iii-b): above-bigint gold read back as % — the numeric clamp did not apply',
                    v_r->'envelope'->'state'->>'gold';
  end if;
  if (v_r->'envelope'->'skills'->'mining'->>'xp')::bigint <> 13034431 then
    raise exception '§4(c-iii-b): above-bigint xp read back as %',
                    v_r->'envelope'->'skills'->'mining'->>'xp';
  end if;
  -- The report must carry the REAL forged magnitude, not a truncated one: `from`
  -- is numeric, so 1e308 survives into the receipt.
  if not exists (select 1 from jsonb_array_elements(v_r->'clamps') c
                  where c->>'field' = 'gold' and (c->>'from')::numeric > 9.2e18) then
    raise exception '§4(c-iii-b): the above-bigint clamp did not report the real magnitude: %',
                    v_r->'clamps';
  end if;

  -- (c-iv) AN UNKNOWN ITEM ID IS DROPPED BY NAME, never guessed.
  v_r := public.hr_import_apply(
    v_uid, v_slot,
    jsonb_build_object('inventory', jsonb_build_object('an_item_that_does_not_exist', 4)),
    '{}'::jsonb, false);
  if (v_r->'envelope'->'inventory') ? 'an_item_that_does_not_exist' then
    raise exception '§4(c-iv): an uncatalogued item id reached player_inventory';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_r->'drops') d
                  where d->>'id' = 'an_item_that_does_not_exist'
                    and d->>'reason' = 'not_in_hr_items') then
    raise exception '§4(c-iv): the unknown item was dropped SILENTLY: %', v_r->'drops';
  end if;

  -- (c-v) A ROOM RUNG OFF THE LADDER IS REFUSED BY THE GUARD, not by this
  --       file's own restatement of the rule — which is why the ladder can
  --       change in one place.
  v_r := public.hr_import_apply(
    v_uid, v_slot,
    jsonb_build_object('progress', jsonb_build_array(
      jsonb_build_object('kind','unlock','key','room:kitchen','value', 9))),
    '{}'::jsonb, false);
  if exists (select 1 from jsonb_array_elements(v_r->'envelope'->'progress') e
              where e->>'key' = 'room:kitchen') then
    raise exception '§4(c-v): rung 9 (off the ladder {1,2,3,4,5}) was IMPORTED';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_r->'drops') d
                  where d->>'id' = 'room:kitchen' and d->>'reason' = 'refused_by_guard') then
    raise exception '§4(c-v): the off-ladder rung vanished without a report: %', v_r->'drops';
  end if;

  -- (c-vi) A ROOM RUNG FILED AS A FLAG (the additive-merge escape) is refused.
  v_r := public.hr_import_apply(
    v_uid, v_slot,
    jsonb_build_object('progress', jsonb_build_array(
      jsonb_build_object('kind','flag','key','room:kitchen','value', 1))),
    '{}'::jsonb, false);
  if not exists (select 1 from jsonb_array_elements(v_r->'drops') d
                  where d->>'id' = 'room:kitchen' and d->>'reason' = 'refused_by_guard') then
    raise exception '§4(c-vi): room:kitchen stored as a flag was accepted — hr_apply''s additive '
                    'merge would then climb the ladder';
  end if;

  -- (c-vii) auto_eat_enabled WITHOUT the trait row is refused and reported.
  v_r := public.hr_import_apply(
    v_uid, v_slot,
    jsonb_build_object('state', jsonb_build_object('auto_eat_enabled', true, 'auto_eat_food', v_food)),
    '{}'::jsonb, false);
  if (v_r->'envelope'->'state'->>'auto_eat_enabled')::boolean then
    raise exception '§4(c-vii): auto-eat was switched on without the purchased trait';
  end if;

  -- (c-viii) AN UNKNOWN PLAN KEY FAILS BY NAME. The b350 declaration gap: a key
  --          nothing handles must not be silently ignored.
  v_r := public.hr_import_apply(v_uid, v_slot, jsonb_build_object('renown', 3081), '{}'::jsonb, false);
  if coalesce(v_r->>'error','') <> 'bad_plan_key' then
    raise exception '§4(c-viii): an unhandled plan key was accepted: %', v_r;
  end if;

  raise notice '§4 PASSED: ACL closed on four roles; a rehearsal imports, reads back through '
               'hr_state_of, and rolls back leaving no marker and no player_state; 1e12 gold and '
               'over-99 xp clamp AND report; an unknown item, an off-ladder rung, a mis-kinded '
               'rung and an ungated auto-eat are each refused by name.';
end $$;
