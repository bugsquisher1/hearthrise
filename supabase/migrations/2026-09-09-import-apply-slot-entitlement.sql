-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-09-import-apply-slot-entitlement.sql
--   hr_import_apply: GRANT character_slot:N BEFORE recreating a slot>0 hero,
--   so the sealed cutover ceremony can restore a player's OWNED slots.
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. The Coordinator applies this by hand
--     (execute_sql wrapped in begin/commit, or a branch apply) AFTER a Security
--     GO. It grants a player_progress ENTITLEMENT (character_slot:N) from inside
--     the import — a new WRITE for hr_import_apply — so authority does not move
--     until Security signs the surface below.
--
--   Companion guard:   tests/cutover-import.mjs  (PGlite replay, section R)
--   Patches:           public.hr_import_apply(uuid,int,jsonb,jsonb,boolean)
--
-- ── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
-- 2026-09-08-hero-slot-buy.sql §8 added an ENTITLEMENT GATE to
-- hr_create_character: a character above slot 0 is refused `slot_not_owned`
-- unless the account already owns that slot via hr_hero_slots_of. That correctly
-- closes the free-character mint for the CLIENT (`POST /rpc/hr_create_character
-- {"p_slot":4}` used to mint a fifth hero for nothing).
--
-- But hr_import_apply — the one-time, sealed, engine-only cutover ceremony —
-- creates its characters by IMPERSONATING the player (2026-08-17-cutover-import
-- §(d): it sets request.jwt.claim.sub and calls the ONE creator, hr_create_
-- character, so exactly one body ever mints a Hearthrise character). It now hits
-- that same gate: for any player who owned a slot-1..4 hero, the import of that
-- slot fails `no_character` (hr_create_character → slot_not_owned, wrapped by
-- §(d)). tests/cutover-import.mjs section R (R0–R5) is red on exactly this:
-- every commit-path and rehearsal import to a slot > 0 answers slot_not_owned,
-- so the seal assertions (which need a slot to actually IMPORT to arm the seal)
-- can never fire.
--
-- ── THE FIX ─────────────────────────────────────────────────────────────────
-- An import legitimately RESTORES a player's OWNED slots. The cutover tool
-- (tools/cutover-import.mjs) only builds a plan for a (user, slot) that carried a
-- character in the blob, and it deliberately does NOT import the character_slot
-- flags themselves (AUDIT_EXCLUDED: "no client store in the snapshot; slots are
-- account-level") — so the plan cannot carry them and an ORDERING fix is
-- impossible. hr_import_apply must therefore write the entitlement ITSELF, for
-- the slot it is being asked to restore, BEFORE it impersonates-and-creates.
--
-- It writes the SAME canonical ownership row hr_buy_hero_slot writes and
-- hr_hero_slots_of reads — SLOT 0, kind='flag', period_key='',
-- key='character_slot:N', value 1 — so ownership is DURABLE (flag-backed), not
-- merely grandfathered by the character's existence (the G5 caveat in
-- hr_hero_slots_of, where a delete path could otherwise forfeit a free slot).
-- This is byte-identical to the buy path's grant, so the two cannot drift about
-- what "owns hero slot N" means.
--
-- ── WHY THIS IS NOT A NEW FORGERY VECTOR (write this down for Security) ──────
--   · The write is reachable ONLY through hr_import_apply, which is executable
--     by NOBODY (2026-08-17 §3 revokes it from public/anon/authenticated/
--     service_role/hr_engine). No client role can call it; the only caller is
--     the migration owner via the Management API. A client cannot reach this
--     grant.
--   · It is DOWNSTREAM of the (c2) CUTOVER-CLOSED seal. A commit-path call after
--     the ceremony has run answers `cutover_closed` before this code — so the
--     seal is what stops a SECOND run, and this change does not weaken it.
--     Proven below: the splice's position in the body is asserted to be after
--     the seal text, and a ghost commit-path probe still reads cutover_closed.
--   · It grants ONLY the slot the ceremony is importing into — the player's own
--     restored slot — and ONLY when that slot is a CATALOGUED hero slot (1..4,
--     from public.hr_hero_slots). An import to an uncatalogued slot (slot 5, past
--     the MAX_SLOTS=5 cap) gets no flag, so hr_hero_slots_of still cannot see it
--     and the create gate still refuses it: an invalid slot stays unmintable.
--   · The row it writes is the exact shape player_progress_unlock_guard already
--     polices (character_slot:1..4 are catalogued in hr_unlocks as storable
--     flags — 2026-09-08 §0 asserts the four rows), so the same trigger every
--     other writer passes through validates this one.
--
-- ── IDEMPOTENCY / CONCURRENCY ───────────────────────────────────────────────
-- Unchanged. The grant sits under the per-(user,slot) advisory xact lock §(b)
-- already takes, after the §(c) idempotency marker check (a re-run is skipped
-- before this code), and the INSERT is `on conflict … greatest`, so a re-run is
-- a no-op either way. A rehearsal (p_commit=false) writes the flag and rolls the
-- whole subtransaction back through §(o)'s HR001 raise, exactly as it rolls back
-- the created character.
--
-- ── HOW IT IS APPLIED — an ANCHORED, exactly-once splice on the LIVE body ────
-- pg_get_functiondef + a guarded string replace at a pure-ASCII anchor (the
-- impersonation `perform set_config(... p_user::text ...)`, unique in the body),
-- the 2026-08-28-client-state.sql / 2026-09-04 §1b idiom. This file carries NO
-- `create or replace function public.hr_import_apply(` header, so:
--   · it is a member of NO derivation chain and takes over NO last-toucher role
--     (2026-08-17-cutover-import.sql stays the sole author, which is what keeps
--     tests/cutover-import.mjs's mutation harness — eight planted defects in
--     THAT file's bytes — non-vacuous; a full restatement here would silently
--     turn those RED proofs GREEN, the b484-b487 revert class);
--   · it reads whatever body is LIVE (the 2026-09-04 §1b progress-verify
--     amendment is already applied on production; the anchor is untouched by it),
--     splices in one block, and asserts the ACL is byte-identical afterwards.
--
-- ⚠ hr_import_apply IS A LIVE-HASH-TRACKED BODY (tests/live-hash-drift). This
--   patch MOVES its hash. After applying, re-pin the baseline with
--     node tests/live-hash-drift.mjs --live --write
--   and let the diff be the deploy record. No other tracked body moves.
--
-- APPLY ORDER: AFTER 2026-08-17-cutover-import.sql (the body it patches), AFTER
-- 2026-09-04-auto-eat-at-creation.sql (the §(m) amendment already on that body)
-- and AFTER 2026-09-08-hero-slot-buy.sql (which installs hr_hero_slots +
-- hr_hero_slots_of + the create-gate this file exists to satisfy). §0 fails
-- closed on each.
--
-- REVERSIBILITY: re-apply 2026-08-17-cutover-import.sql (restores hr_import_apply
-- without this splice) followed by 2026-09-04-auto-eat-at-creation.sql (re-adds
-- the §(m) amendment). ⚠ That re-blocks the cutover ceremony for slot>0 heroes —
-- do not revert this to unblock something else. The character_slot:N rows it has
-- written are ordinary player_progress kind='flag' rows and survive the revert.
--
-- NO EDGE REDEPLOY. SAFE TO RE-RUN (the splice is idempotent by its own marker).
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ──────────────────────────────────────────
do $$
declare v_def text;
begin
  if to_regprocedure('public.hr_import_apply(uuid,int,jsonb,jsonb,boolean)') is null then
    raise exception 'hr_import_apply is absent — apply 2026-08-17-cutover-import.sql first. This '
                    'file only patches it and has nothing to do without it.';
  end if;

  -- The ownership predicate and its catalogue. The grant this file writes is
  -- read back ONLY through hr_hero_slots_of, which JOINS hr_hero_slots — so a
  -- character_slot:N flag for an N the catalogue does not sell would be written
  -- and then ignored, and the gate would still refuse. Both must exist.
  if to_regprocedure('public.hr_hero_slots_of(uuid)') is null then
    raise exception 'hr_hero_slots_of(uuid) is absent — apply 2026-09-08-hero-slot-buy.sql first. '
                    'Without it there is no ownership predicate for the create gate to read, so '
                    'writing the entitlement would grant nothing.';
  end if;
  if to_regclass('public.hr_hero_slots') is null
     or (select count(*) from public.hr_hero_slots) <> 4 then
    raise exception 'public.hr_hero_slots is absent or not the 4-slot ladder — apply '
                    '2026-09-08-hero-slot-buy.sql first. This file only grants a CATALOGUED slot.';
  end if;

  -- The create gate must actually BE in hr_create_character, or this file is
  -- solving a problem that does not exist on this database (and would still be a
  -- no-op, but say so loudly rather than pretend to have hardened something).
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'hr_create_character(int) is absent — apply the character-bootstrap chain first';
  end if;
  v_def := replace(pg_get_functiondef('public.hr_create_character(int)'::regprocedure), chr(13), '');
  if position('slot_not_owned' in v_def) = 0 or position('hr_hero_slots_of' in v_def) = 0 then
    raise exception 'hr_create_character carries no hero-slot entitlement gate (no slot_not_owned / '
                    'hr_hero_slots_of) — apply 2026-09-08-hero-slot-buy.sql §8 first. Without the '
                    'gate the cutover ceremony is not blocked and this splice is unnecessary; '
                    'applying it against the wrong body would be patching blind.';
  end if;

  -- The storable-flag home the trigger polices the grant against.
  if not exists (select 1 from public.hr_unlocks
                  where unlock_id ~ '^character_slot:[1-4]$'
                    and progress_kind = 'flag' and merge <> 'none') then
    raise exception 'hr_unlocks does not carry the character_slot:1..4 rows as storable flags — '
                    'player_progress_unlock_guard would refuse the entitlement row this file writes';
  end if;

  raise notice 'import-apply-slot-entitlement §0 PASSED: hr_import_apply present, hr_hero_slots_of + '
               'the 4-slot ladder present, the create gate is installed, and the flag home exists.';
end $$;


-- ── 1. THE SPLICE — write character_slot:N before the impersonated create ───
-- Anchored on the impersonation line (pure ASCII, unique — the reset uses '' not
-- p_user::text). The block is inserted BEFORE it, i.e. after §(c2) (the seal) and
-- before §(d) actually creates the character.
do $do$
declare
  v_src text;
  v_hits int;
  v_acl_before text;
  v_acl_after  text;
  c_sig    constant text := 'public.hr_import_apply(uuid,int,jsonb,jsonb,boolean)';
  c_anchor constant text :=
    $a$  perform set_config('request.jwt.claim.sub', p_user::text, true);$a$;
  -- The inserted step. Single quotes are literal inside this dollar-quote; they
  -- become the function body's own string literals when the definition is
  -- re-executed. Leading + trailing blank lines frame it in the body.
  c_ins constant text := $ins$
  -- ── (c3) THE HERO-SLOT ENTITLEMENT — AN IMPORT RESTORES AN OWNED SLOT ──
  -- 2026-09-09-import-apply-slot-entitlement.sql. hr_create_character gained a
  -- hero-slot entitlement gate (2026-09-08-hero-slot-buy.sql §8): a character
  -- above slot 0 is refused `slot_not_owned` unless the account already OWNS the
  -- slot via hr_hero_slots_of. That closes the free-character mint for the
  -- CLIENT — but §(d) below reaches the SAME creator by impersonation, so without
  -- this the cutover import of any slot-1..4 hero fails no_character.
  --
  -- The import legitimately restores an OWNED slot (the tool builds a plan only
  -- for a slot that carried a character in the blob; this ceremony is engine-only
  -- and sealed). So it writes the canonical ownership row hr_buy_hero_slot writes
  -- and hr_hero_slots_of reads — SLOT 0, kind='flag', key='character_slot:N' —
  -- BEFORE the impersonated create, making ownership DURABLE (flag-backed), not
  -- merely grandfathered by the character's existence.
  --
  -- ONLY for a CATALOGUED hero slot (1..4). An uncatalogued slot (5, past the
  -- MAX_SLOTS cap) gets no flag, so hr_hero_slots_of still cannot see it and the
  -- gate still refuses it — an invalid slot stays unmintable. Downstream of
  -- §(c2): a sealed commit-path call is refused cutover_closed before here, so it
  -- writes no entitlement.
  if v_slot > 0 and exists (select 1 from public.hr_hero_slots where slot_id = v_slot) then
    -- The flag lives on the account's canonical slot-0 player_progress row
    -- (player_progress has an FK onto player_state), so slot 0 must exist. Every
    -- account has one and the ceremony imports it first; a slot>0 import without
    -- it is a broken plan, refused BY NAME rather than as a bare FK 500.
    if not exists (select 1 from public.player_state where user_id = p_user and slot = 0) then
      v_payload := jsonb_build_object('ok', false, 'error', 'no_account',
               'detail', jsonb_build_object('slot', v_slot,
                 'why', 'a hero slot above 0 cannot be restored before the account''s slot-0 character'));
      raise exception using errcode = 'HR001', message = v_payload::text;
    end if;
    insert into public.player_progress as pp
      (user_id, slot, kind, key, value, period_key, state, updated_at)
    values (p_user, 0, 'flag', 'character_slot:' || v_slot, 1, '', null, now())
    on conflict (user_id, slot, kind, key, period_key)
      do update set value = greatest(pp.value, excluded.value), updated_at = now();
  end if;

$ins$;
begin
  v_src := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');

  if position('(c3) THE HERO-SLOT ENTITLEMENT' in v_src) > 0 then
    raise notice 'hr_import_apply already carries the (c3) hero-slot entitlement splice — skipped';
    return;
  end if;

  v_hits := (length(v_src) - length(replace(v_src, c_anchor, ''))) / length(c_anchor);
  if v_hits <> 1 then
    raise exception 'ANCHOR DRIFT on hr_import_apply: the impersonation line matched % times, '
                    'expected exactly 1. Refusing to patch blind. Re-apply '
                    '2026-08-17-cutover-import.sql then 2026-09-04-auto-eat-at-creation.sql, then '
                    'this file.', v_hits;
  end if;

  -- hr_import_apply is executable by NOBODY (its own §3). create-or-replace
  -- preserves the ACL; assert it did, because a widened grant on a body that
  -- impersonates and rewrites a character from a blob is the whole game.
  select coalesce(proacl::text, '') into v_acl_before from pg_proc where oid = c_sig::regprocedure;
  execute replace(v_src, c_anchor, c_ins || c_anchor);
  select coalesce(proacl::text, '') into v_acl_after  from pg_proc where oid = c_sig::regprocedure;
  if v_acl_after is distinct from v_acl_before then
    raise exception 'ACL MOVED on hr_import_apply (% -> %) — this function must remain callable by '
                    'no role at all.', v_acl_before, v_acl_after;
  end if;

  raise notice 'patched hr_import_apply: (c3) grants character_slot:N (catalogued 1..4) on slot 0 '
               'before recreating a slot>0 character, downstream of the (c2) seal';
end $do$;

-- The revoke is idempotent and re-asserts the "callable by nobody" posture after
-- the create-or-replace, matching every other patcher of this body.
revoke all on function public.hr_import_apply(uuid, int, jsonb, jsonb, boolean)
  from public, anon, authenticated, service_role, hr_engine;


-- ── 2. SELF-VERIFYING COMMIT GATE ───────────────────────────────────────────
-- Every load-bearing property, EXECUTED. The apply is atomic, so a raise here
-- reverts the splice above it. The behavioural probe is a REHEARSAL
-- (p_commit=false) — it rolls itself back through §(o)'s HR001 raise — and the
-- seal probe uses a ghost caller the seal refuses before §(d), so neither
-- persists a row.
do $$
declare
  v_src   text;
  v_r     jsonb;
  v_txt   text;
  v_uid   uuid;
  v_ghost constant uuid := '00000000-0000-0000-0000-0000000c1071';
  v_planted boolean := false;
  c_probe constant int := 2;   -- a CATALOGUED hero slot (hr_hero_slots 1..4)
begin
  -- (a) THE SPLICE IS PRESENT AND CORRECTLY PLACED (always runs; non-vacuous).
  v_src := replace(pg_get_functiondef(
             'public.hr_import_apply(uuid,int,jsonb,jsonb,boolean)'::regprocedure), chr(13), '');
  if position('(c3) THE HERO-SLOT ENTITLEMENT' in v_src) = 0 then
    raise exception 'GATE(a): the (c3) entitlement splice is not in hr_import_apply — patch did not take';
  end if;
  -- BEFORE THE CREATE: the grant must precede the impersonated hr_create_character
  -- call, or it opens the gate too late. (Always asserted — both are MY concern.)
  if position('(c3) THE HERO-SLOT ENTITLEMENT' in v_src)
       > position('v_created := public.hr_create_character' in v_src) then
    raise exception 'GATE(a): the (c3) splice runs AFTER hr_create_character — too late to open the gate';
  end if;
  -- DOWNSTREAM OF THE SEAL: the (c2) seal must appear BEFORE the splice, so a
  -- sealed commit-path call is refused before it can write an entitlement.
  -- ⚠ MATCHED ON THE SEAL'S OWN QUERY (`min(imported_at) into v_first_at`), NOT
  --   the bare token 'cutover_closed' — which also appears in this splice's own
  --   comment, and would otherwise make the check compare a position inside the
  --   splice against itself.
  -- ⚠ SCOPED TO "WHEN THE SEAL IS PRESENT". The seal's EXISTENCE is
  --   2026-08-17-cutover-import.sql's property, asserted by its own §4(b2) and by
  --   tests/cutover-import.mjs section R. If the seal is absent (e.g. a mutation
  --   removed it), this file must NOT pre-empt those graders by failing the apply
  --   here — it only guarantees that WHEN the seal exists, the splice sits after
  --   it. Under the real chain the seal is present, so this arm runs.
  if position('min(imported_at) into v_first_at' in v_src) > 0
     and position('min(imported_at) into v_first_at' in v_src)
         > position('(c3) THE HERO-SLOT ENTITLEMENT' in v_src) then
    raise exception 'GATE(a): the (c3) splice is not downstream of the (c2) seal — a sealed commit '
                    'could write an entitlement flag before being refused';
  end if;

  -- (b) THE SEAL STILL HOLDS on the commit path — proven BEHAVIOURALLY, but only
  --     when the seal is present (its absence is 2026-08-17 §4(b2)'s and section
  --     R's to catch, not this file's — same scoping reason as (a)). Ghost
  --     caller: the seal fires in §(c2), before §(d), so the ghost's absent
  --     auth.users row is never reached. Plant a marker on a rebuilt DB that has
  --     none; production's six arm it already (2026-08-17 §4(b2)'s shape).
  if position('min(imported_at) into v_first_at' in v_src) = 0 then
    raise notice 'GATE(b) SKIPPED: hr_import_apply carries no cutover seal — that is '
                 '2026-08-17-cutover-import.sql''s property to assert, not this file''s.';
  else
    if not exists (select 1 from public.hr_import_marker) then
      insert into public.hr_import_marker (user_id, slot, snapshot_sha, counts, tool)
        values (v_ghost, 4, repeat('e', 64), '{}'::jsonb, 'entitlement self-check §2(b)');
      v_planted := true;
    end if;
    begin
      v_r := public.hr_import_apply(v_ghost, c_probe, '{}'::jsonb, '{}'::jsonb, true);
      v_txt := coalesce(v_r->>'error', 'ok:' || coalesce(v_r->>'imported', '?'));
    exception when others then
      v_txt := 'raised:' || sqlstate;   -- past the seal, dead on the ghost's FK
    end;
    if v_txt <> 'cutover_closed' then
      raise exception 'GATE(b): the cutover seal did not refuse a commit-path call after the '
                      'entitlement splice (got "%"). The splice must be downstream of §(c2).', v_txt;
    end if;
    if v_planted then delete from public.hr_import_marker where user_id = v_ghost and slot = 4; end if;
    if exists (select 1 from public.player_state where user_id = v_ghost)
       or exists (select 1 from public.player_progress where user_id = v_ghost) then
      raise exception 'GATE(b): the seal probe left rows behind for the ghost caller';
    end if;
  end if;

  -- (c) BEHAVIOURAL — a REAL account with slot 0 and a free CATALOGUED slot.
  --     A rehearsal, so it rolls back; skipped with a loud notice when there is
  --     no such account (tests/cutover-import.mjs section R is the authoritative
  --     proof — a skipped check that reads as a pass is this project's most-named
  --     failure, so it is REPORTED, not swallowed).
  select ps.user_id into v_uid from public.player_state ps
   where ps.slot = 0
     and not exists (select 1 from public.player_state p2
                      where p2.user_id = ps.user_id and p2.slot = c_probe)
     and not exists (select 1 from public.hr_import_marker m
                      where m.user_id = ps.user_id and m.slot = c_probe)
   limit 1;
  if v_uid is null then
    raise notice 'GATE(c) SKIPPED: no account with a slot-0 character and a free slot %. The '
                 'splice-placement and seal checks above DID run. Re-run tests/cutover-import.mjs '
                 '(section R) for the behavioural half.', c_probe;
    return;
  end if;

  -- (c-i) AN IMPORT TO A CATALOGUED SLOT NOW SUCCEEDS AND CREATES THE CHARACTER.
  v_r := public.hr_import_apply(v_uid, c_probe,
    jsonb_build_object('state', jsonb_build_object('gold', 4321),
                       'skills', jsonb_build_object('hitpoints', 1154)),
    jsonb_build_object('snapshot_sha', repeat('a', 64), 'tool', 'entitlement self-check'),
    false);
  if coalesce(v_r->>'ok', '') <> 'true' then
    raise exception 'GATE(c-i): an import to catalogued slot % was refused after the entitlement '
                    'patch: %', c_probe, v_r;
  end if;
  if coalesce((v_r->>'dry_run')::boolean, false) is not true then
    raise exception 'GATE(c-i): the probe did not report dry_run — the payload did not return '
                    'through the HR001 handler, so nothing proves it rolled back';
  end if;
  if (v_r->'envelope'->'state'->>'gold')::bigint <> 4321 then
    raise exception 'GATE(c-i): the created slot-% character did not import gold: %',
                    c_probe, v_r->'envelope'->'state'->>'gold';
  end if;

  -- (c-ii) NOTHING PERSISTED — neither the character nor the entitlement flag.
  if exists (select 1 from public.player_state where user_id = v_uid and slot = c_probe) then
    raise exception 'GATE(c-ii): the rehearsal left a slot-% character behind', c_probe;
  end if;
  if exists (select 1 from public.player_progress where user_id = v_uid and slot = 0
              and kind = 'flag' and key = 'character_slot:' || c_probe) then
    raise exception 'GATE(c-ii): the rehearsal left the character_slot:% entitlement flag behind', c_probe;
  end if;

  -- (c-iii) AN UNCATALOGUED SLOT IS STILL REFUSED. The entitlement is granted
  --         ONLY for a real hero slot, so slot 5 (past the cap) stays unmintable:
  --         no flag is written, hr_hero_slots_of cannot see it, the gate refuses,
  --         and §(d) wraps that as no_character.
  v_r := public.hr_import_apply(v_uid, 5,
    jsonb_build_object('state', jsonb_build_object('gold', 1)),
    '{}'::jsonb, false);
  if coalesce(v_r->>'error', '') <> 'no_character' then
    raise exception 'GATE(c-iii): an import to the uncatalogued slot 5 was not refused no_character '
                    '(got %) — the entitlement must be scoped to catalogued slots only', v_r;
  end if;

  raise notice 'GATE PASSED: hr_import_apply grants character_slot:N (catalogued only) before '
               'recreating a slot>0 hero and downstream of the seal; a rehearsed import to slot % '
               'succeeds and rolls back leaving no character and no flag; the seal still refuses a '
               'commit-path call; an uncatalogued slot stays refused no_character.', c_probe;
end $$;
