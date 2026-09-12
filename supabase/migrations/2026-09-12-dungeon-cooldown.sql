-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-12-dungeon-cooldown.sql — THE DUNGEON RE-ENTRY COOLDOWN BECOMES A
--                                   SERVER FACT THE CLIENT CAN READ.
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. The Coordinator applies this by hand
--     (`node tools/apply-migration.mjs supabase/migrations/2026-09-12-dungeon-cooldown.sql`)
--     AFTER a Security GO. It changes the body of a PROGRESSION writer
--     (hr_dungeon_settle) and of the envelope (hr_state_of).
--
--   Reads:   hr_dungeons.cooldown_s (2026-09-10-dungeon-catalogue.generated.sql)
--            player_ledger kind='dungeon' rows (2026-09-10-dungeon-settle.sql)
--   Patches: hr_dungeon_settle (the gate), hr_state_of (the projection)
--   Client:  src/dungeons.js canRun() — the follow-up lane-A half; see
--            "THE CLIENT HALF" below. NOTHING here needs the client to ship.
--   Test:    tests/dungeon-cooldown.mjs (PGlite replay + mutation proof)
--
-- ── THE FINDING (b536 residue-ahead census, item 5) ─────────────────────────
-- `G.dungeons.lastRun[id]` (src/dungeons.js:422 read, :469 / :766 written with
-- `Date.now()`) is the dungeon re-entry cooldown, kept on the CLIENT CLOCK and
-- persisted in the RESIDUE (`'dungeons'` is RESIDUE_FIELDS[…] in
-- src/net/client-state.js:164) — i.e. a client-authored store. Measured from the
-- code, the situation on production is worse than "forgeable":
--
--   · UNDER ARM (DUNGEON_SETTLE_ARM_ENABLED = true since 2026-09-06) THE CLIENT
--     NEVER STAMPS lastRun AT ALL. runDungeon() returns at the armed branch
--     (`if(_dsArmed()){ settleRunServer(id,'auto',1); return true; }`) BEFORE the
--     `lastRun[id] = Date.now()` on line 469, and showSummary()'s stamp on line
--     766 sits in the DORMANT `else` arm. So `lastRun` stays 0 forever, canRun()
--     always reports "ready", and the cooldown the data authors (cooldownH 4…72)
--     is invisible in the UI.
--   · hr_dungeon_settle DID own an auto-mode cooldown (gate (c), ledger-derived,
--     the b288 lesson) — so an AUTO run is refused server-side while the button
--     says ready: an honest player is told "on cooldown" by an error toast, with
--     no countdown anywhere.
--   · A MANUAL run (mode='manual', the phase mini-game) had NO server cooldown at
--     all. With the client stamp dead, the authored re-entry limit does not exist
--     for manual runs: keys permitting, a player can settle the same dungeon
--     back-to-back up to the 250-settles/day fuse. Dungeon loot is 26 ORDINARY
--     TRADEABLE materials (dungeon-settlement.md), so that is a faucet on tradeable
--     goods, not a self-only convenience — and it needs no clock tampering.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
--   1. hr_dungeon_cooldown_modes() — ONE definition of which modes both PAY and
--      RESPECT the cooldown: {auto, manual}. Scavenger stays exempt, as authored
--      (src/dungeon-scavenger.js:556/584 — "manual scavenger runs do NOT impose a
--      cooldown"); nothing about the scavenger changes.
--   2. hr_dungeon_cooldowns(user, slot) -> jsonb — the ACTIVE windows, derived in
--      ONE pass from the append-only ledger's server-stamped `at` plus the
--      catalogue's cooldown_s. This is the SINGLE source of truth: the gate and
--      the projection both read this function, so the number the player is shown
--      and the number the server enforces cannot drift.
--   3. hr_dungeon_settle gate (c) — refuses `on_cooldown` for EVERY mode in (1),
--      with detail {dungeon, next_entry_at, ready_at, cooldown_s}. `ready_at` is
--      kept beside the new canonical `next_entry_at` so the already-reviewed
--      refusal shape (dungeon-settlement.md §316) still holds for any reader.
--   4. hr_state_of — projects top-level `dungeon_cooldowns`: { dungeon_id: ISO8601 }
--      for ACTIVE windows only, beside the `now` the envelope already carries. A
--      fresh character, and a character whose window has expired, get `{}`.
--
-- NO STORED COOLDOWN COLUMN, DELIBERATELY. The brief proposed a `next_entry_at`
-- column on a per-character dungeon row. There is no such row (the settle writes
-- player_state.dungeon_scrip, player_inventory and player_ledger), and adding one
-- would be a SECOND copy of a fact the append-only ledger already states exactly
-- — the b288 lesson quoted in the settle's own gate (c): "never a stored counter a
-- client can reset". Two copies of a cooldown is two places to disagree and a
-- migration to reconcile them; the ledger derivation cannot drift from the
-- evidence, is replayable for a dispute, and costs ZERO new rows and ZERO new
-- bytes per run. The cost of the derivation is one index (§1) — measured on
-- production 2026-09-12: player_ledger 16,709 rows / 8,448 kB, 2 of them
-- kind='dungeon'; at 100x players the partial index still covers only dungeon
-- settles, which are hard-capped at 250/character/UTC-day by the settle's own fuse.
--
-- ── WHY THIS IS NOT A BALANCE CHANGE (and the one part that is) ──────────────
-- FOR THE GAME DESIGNER, explicitly, because it is a payout-shaped decision:
--   · auto: unchanged (the server already refused; the player can now SEE it).
--   · manual: the server now refuses inside the window. That RESTORES the authored
--     rule — src/dungeons.js canRun() has always blocked a manual start on
--     cooldown, and did so for every player before the arm — but relative to the
--     CURRENTLY LIVE (broken) behaviour it is a NERF: manual back-to-back runs stop.
--     Live exposure is two ledger rows in the game's history (both auto), so the
--     practical impact is nil, and the scarce gate remains the key.
--   · scavenger: untouched and still exempt. If the Designer wants scavenger bound
--     too, it is a ONE-ELEMENT edit to hr_dungeon_cooldown_modes() and nothing else.
--
-- ── THE CLIENT HALF (lane A — NOT in this file) ─────────────────────────────
-- src/dungeons.js canRun(), replacing lines 422-428:
--     var _cd = (window.G._dungeonCooldowns || {})[id];
--     var until = _cd ? Date.parse(_cd) : 0;
--     if(until > Date.now()) return { ok:false,
--       reason:'On cooldown — ' + ((until - Date.now())/3600000).toFixed(1) + 'h remaining' };
-- plus ONE reconcile line where the envelope lands (src/net/dungeon-settle.js
-- reconcileFromEnvelope / src/net/accrue.js):
--     if(body && body.dungeon_cooldowns) window.G._dungeonCooldowns = body.dungeon_cooldowns;
-- `_`-prefixed = scratch, never persisted (CLAUDE.md §6), and the fail-safe when
-- the key is absent is "ready", which is safe because the SERVER refuses: the
-- worst case is one refused intent, never an early entry. Also: delete the two
-- dead `G.dungeons.lastRun[...] = Date.now()` writes and drop `'dungeons'` from
-- RESIDUE_FIELDS once nothing reads it, and fix the now-wrong error string
-- src/net/dungeon-settle.js:73 ("try a manual run" is no longer an escape hatch).
--
-- ── ANTI-FORGERY ────────────────────────────────────────────────────────────
-- The window is derived from `player_ledger.at`, which is `default now()` on an
-- append-only table with no client write grant and no non-SELECT RLS policy, and
-- from `hr_dungeons.cooldown_s`, a generated catalogue with no client grant at all.
-- The settle intent carries NO timestamp parameter (uuid, int, bigint, uuid, text,
-- text, numeric — §4 asserts it), so there is no client clock anywhere on the path;
-- a forged value inside `meta` is never read (§4 proves a planted meta.client_at /
-- meta.next_entry_at moves nothing). The projection is READ-ONLY and self-only.
--
-- RESTATEMENT-DEBT-ACK: hr_state_of is an anchored patch chain — depth 16 before
-- this file and 17 with it, measured by `node tests/patch-chain-guard.mjs`, which
-- also lists it as slice 7's second target; 2026-09-12-worker-hired-at-projection.sql
-- carries the same ack for the same reason. The debt is taken
-- knowingly: a restatement must equal the LIVE body plus one key, an agent cannot
-- apply or re-pin, and a restatement authored from the repo replay is the
-- b484-b487 class where the restated body silently reverts whichever file patched
-- last — on the one function every screen reads. This file adds a single key and
-- ALSO splices hr_dungeon_settle exactly ONCE (that body's first patch, so it
-- starts no chain), against an anchor VERIFIED byte-identical on production
-- 2026-09-12 by reading pg_proc.prosrc read-only. THE PAYDOWN stays where
-- worker-hired-at put it: restate hr_state_of once from pg_get_functiondef of the
-- LIVE body, Coordinator-owned, and the chain resets for everyone.
--
-- ⚠ AFTER APPLYING: hr_state_of is a LIVE-HASH-TRACKED body and hr_dungeon_settle
--   BECOMES one (it is programmatically patched from here on), so the Coordinator
--   must re-seed with `node tests/live-hash-drift.mjs --live --write` and write the
--   whys. This file carries no literal `create or replace function
--   public.hr_state_of(` header and takes over no derivation-chain role; it does
--   become the LAST TOUCHER of both bodies for apply-order honesty.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   1. re-apply 2026-09-10-dungeon-settle.sql (it restates hr_dungeon_settle in
--      full, which un-does §2's splice and returns the gate to auto-only);
--   2. re-apply 2026-09-12-worker-hired-at-projection.sql's hr_state_of patch
--      chain? NO — it patches, it does not restate. To drop the projection re-run
--      the hr_state_of chain from its last full restatement, or simply leave the
--      extra key: an older client ignores it and it grants nothing.
--   3. `drop function public.hr_dungeon_cooldowns(uuid,int);`
--      `drop function public.hr_dungeon_cooldown_modes();`  (only after 1)
--      `drop index if exists public.player_ledger_dungeon_idx;`
--   No player row is written by this file, so there is nothing to claw back.
--
-- SAFE TO RE-RUN. Every step is `if not exists` / idempotent-by-anchor, and §4's
-- probes roll themselves back.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
declare v_def text;
begin
  if to_regclass('public.player_ledger') is null then
    raise exception 'player_ledger missing — apply 2026-08-11-player-state.sql first'; end if;
  if to_regclass('public.hr_dungeons') is null then
    raise exception 'hr_dungeons is absent — apply 2026-09-10-dungeon-catalogue.generated.sql first';
  end if;
  if (select count(*) from public.hr_dungeons where cooldown_s > 0) = 0 then
    raise exception 'no dungeon in hr_dungeons has a cooldown — this file would install a gate that '
                    'can never fire. Regenerate the catalogue (node tools/gen-dungeon-catalogue.mjs).';
  end if;
  if to_regprocedure('public.hr_dungeon_settle(uuid,int,bigint,uuid,text,text,numeric)') is null then
    raise exception 'hr_dungeon_settle is missing — apply 2026-09-10-dungeon-settle.sql first';
  end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_state_of is missing — apply the player-state chain first'; end if;
  if to_regprocedure('public.hr_reject(text,jsonb)') is null then
    raise exception 'hr_reject is missing — apply the apply-engine chain first'; end if;

  -- The ledger column the whole derivation rests on must be server-defaulted. A
  -- nullable / client-defaulted `at` would make the cooldown forgeable by whoever
  -- can write a row.
  if (select count(*) from information_schema.columns
       where table_schema='public' and table_name='player_ledger'
         and column_name='at' and is_nullable='NO'
         and column_default like '%now()%') <> 1 then
    raise exception 'player_ledger.at is not a NOT NULL now()-defaulted column — the cooldown would '
                    'be derived from a value a writer could choose';
  end if;
end $$;

-- ── 1. THE INDEX the derivation reads ───────────────────────────────────────
-- Mirrors player_ledger_bounty_idx (same table, same shape, per-kind partial), so
-- the map query and the settle's per-day fuses are an index scan over a handful of
-- rows instead of a scan of the character's whole ledger. Partial on kind, so it
-- indexes only dungeon settles — 2 rows on production today, and hard-capped at
-- 250/character/UTC-day by the settle's count fuse, so it cannot become large.
-- NOT `concurrently`: an apply runs in one transaction (and must — a half-applied
-- body change is the thing this repo refuses); the build is a sub-second scan of an
-- 8 MB table today and stays cheap because the predicate is selective.
create index if not exists player_ledger_dungeon_idx
  on public.player_ledger (user_id, slot, at desc) where kind = 'dungeon';

-- ── 2. hr_dungeon_cooldown_modes() — the ONE definition of the mode scope ───
-- Which modes both PAY a cooldown and are REFUSED by one. Read by the gate (§4)
-- and by the map (§3), so a change is one edit in one place and can never leave
-- the projection describing a rule the gate does not enforce. `scavenger` is
-- deliberately absent (src/dungeon-scavenger.js: "manual scavenger runs do NOT
-- impose a cooldown"); adding it is a Designer decision, not an engineering one.
create or replace function public.hr_dungeon_cooldown_modes()
returns text[] language sql immutable parallel safe as $$
  select array['auto', 'manual']::text[]
$$;
revoke execute on function public.hr_dungeon_cooldown_modes()
  from public, anon, authenticated, service_role;

-- ── 3. hr_dungeon_cooldowns(user, slot) — THE ACTIVE WINDOWS, SERVER-DERIVED ─
-- ONE pass over the append-only ledger, grouped by dungeon, joined to the
-- catalogue's cooldown_s, filtered to windows that are still open at now(). Only
-- ACTIVE windows are returned, so the envelope carries 0 keys in the ordinary case
-- and at most one per dungeon (6 today, ~250 bytes worst case).
--
--   · `at` is the SERVER clock (default now(), append-only table) — never a value
--     from the payload. `coalesce(meta->>'op','settle') = 'settle'` fails CLOSED:
--     an unrecognised dungeon-kind row is treated AS a settle, i.e. it keeps the
--     player on cooldown rather than clearing one.
--   · a Quartermaster spend row (op='qm_buy') carries no `mode` and is excluded by
--     the mode filter as well as by the op filter — two independent reasons, so a
--     future change to either cannot turn a SPEND into a cooldown reset.
--   · SECURITY DEFINER because it reads player_ledger (per-user RLS) and
--     hr_dungeons (no client grant); owner-only EXECUTE (the revoke below is the
--     load-bearing line — Postgres grants EXECUTE to PUBLIC by default). It is
--     called only from inside two definer bodies, which run as the owner, so no
--     role needs a grant: not hr_engine either.
create or replace function public.hr_dungeon_cooldowns(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(x.dungeon_id, to_jsonb(x.next_entry_at)), '{}'::jsonb)
    from (
      select d.dungeon_id,
             l.last_at + make_interval(secs => d.cooldown_s) as next_entry_at
        from (select meta->>'dungeon' as dungeon_id, max(at) as last_at
                from public.player_ledger
               where user_id = p_user
                 and slot = coalesce(p_slot, 0)
                 and kind = 'dungeon'
                 and coalesce(meta->>'op', 'settle') = 'settle'
                 and meta->>'mode' = any (public.hr_dungeon_cooldown_modes())
               group by 1) l
        join public.hr_dungeons d on d.dungeon_id = l.dungeon_id
       where d.cooldown_s > 0
    ) x
   where x.next_entry_at > now()
$$;
revoke execute on function public.hr_dungeon_cooldowns(uuid, int)
  from public, anon, authenticated, service_role;

-- ── 4. hr_dungeon_settle — THE GATE, for every mode the cooldown binds ──────
-- ONE guarded, exactly-once anchor replace of gate (c) (pg_get_functiondef, the
-- 2026-09-10-dungeon-scrip.sql idiom). The anchor is the block's CURRENT text,
-- comment included — the comment says "auto mode only" and would otherwise become
-- a lie installed on production. Verified byte-identical against production's
-- pg_proc.prosrc on 2026-09-12 (read-only) before this file was written; if it ever
-- fails to match exactly once this apply RAISES and changes nothing.
--
-- The replacement declares its own local `v_next` in a nested block, so the outer
-- DECLARE section (which this file does not own) is untouched; `v_last_auto` stays
-- declared and simply goes unused.
do $$
declare
  v_def text;
  c_anchor constant text := $anc$    -- (c) COOLDOWN — auto mode only, read from now() + the append-only ledger
    --     (never a stored counter a client can reset: the b288 lesson). Manual
    --     and scavenger deliberately have no cooldown; their limiter is the key
    --     debit + the per-day scrip cap.
    if p_mode = 'auto' and v_dun.cooldown_s > 0 then
      select max(at) into v_last_auto from public.player_ledger
       where user_id = v_uid and slot = v_slot and kind = 'dungeon'
         and meta->>'dungeon' = v_dun.dungeon_id and meta->>'mode' = 'auto';
      if v_last_auto is not null
         and now() < v_last_auto + make_interval(secs => v_dun.cooldown_s) then
        perform public.hr_reject('on_cooldown',
          jsonb_build_object('ready_at', v_last_auto + make_interval(secs => v_dun.cooldown_s)));
      end if;
    end if;$anc$;
  c_new constant text := $new$    -- (c) COOLDOWN — SERVER-OWNED, for every mode the cooldown binds
    --     (hr_dungeon_cooldown_modes() = auto + manual; scavenger is exempt by
    --     design). Derived by hr_dungeon_cooldowns from now() + the append-only
    --     ledger's server-stamped `at` — never a stored counter a client can reset
    --     (the b288 lesson) and never a value from the payload (the intent carries
    --     no timestamp at all). THE SAME FUNCTION feeds hr_state_of's
    --     `dungeon_cooldowns` projection, so the countdown the player is shown and
    --     the window the server enforces are one number.
    --     Before 2026-09-12 this gate covered mode='auto' ONLY, while the client
    --     gated manual on a client-clock `G.dungeons.lastRun` that the armed path
    --     had stopped stamping — so the authored re-entry limit did not exist for
    --     manual runs, on a loot table that is mostly TRADEABLE material.
    if p_mode = any (public.hr_dungeon_cooldown_modes()) and v_dun.cooldown_s > 0 then
      declare
        v_next timestamptz;
      begin
        v_next := (public.hr_dungeon_cooldowns(v_uid, v_slot) ->> v_dun.dungeon_id)::timestamptz;
        if v_next is not null then
          perform public.hr_reject('on_cooldown',
            jsonb_build_object('dungeon', v_dun.dungeon_id,
                               'next_entry_at', v_next,
                               -- kept beside the canonical name: the reviewed
                               -- refusal shape (dungeon-settlement.md) says
                               -- ready_at, and a live reader must not break.
                               'ready_at', v_next,
                               'cooldown_s', v_dun.cooldown_s));
        end if;
      end;
    end if;$new$;
begin
  v_def := replace(pg_get_functiondef(
    'public.hr_dungeon_settle(uuid,int,bigint,uuid,text,text,numeric)'::regprocedure), chr(13), '');
  if strpos(v_def, 'public.hr_dungeon_cooldowns(v_uid, v_slot)') > 0 then
    raise notice 'hr_dungeon_settle already reads hr_dungeon_cooldowns — patch skipped'; return; end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_dungeon_settle cooldown block did not match exactly once — its shape '
                    'is not the one this file was derived against (verified byte-identical on '
                    'production 2026-09-12). Do NOT patch a body you cannot account for.';
  end if;
  v_def := replace(v_def, c_anchor, c_new);
  execute v_def;
  raise notice 'hr_dungeon_settle patched: the cooldown gate covers % and reads the shared derivation',
    public.hr_dungeon_cooldown_modes();
end $$;
-- create-or-replace preserves an ACL; be explicit anyway. ENGINE-ONLY — if the
-- browser could call this it could settle a run for itself.
revoke execute on function public.hr_dungeon_settle(uuid, int, bigint, uuid, text, text, numeric)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_dungeon_settle(uuid, int, bigint, uuid, text, text, numeric)
  to hr_engine;

-- ── 5. hr_state_of — PROJECT dungeon_cooldowns (programmatic, additive) ─────
-- Anchored on the top-level `'now', now(),` the envelope already carries (verified
-- exactly-once on production 2026-09-12), so the map lands beside the server clock
-- the client needs to render a skew-free countdown. Top-level, not inside `state`:
-- it is a per-dungeon map like `workers` / `hero_slots` / `bounty`, not a scalar.
do $$
declare
  v_def text;
  c_anchor constant text := $anc$    'now', now(),$anc$;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'dungeon_cooldowns'$q$) > 0 then
    raise notice 'hr_state_of already projects dungeon_cooldowns — patch skipped'; return; end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_state_of `now` anchor did not match exactly once — its shape is not '
                    'the one this file was derived against. Do NOT patch a body you cannot account for.';
  end if;
  v_def := replace(v_def, c_anchor, $new$    'now', now(),
    -- dungeon re-entry cooldown (2026-09-12): the ACTIVE windows only, as
    -- { dungeon_id: next_entry_at }, derived by hr_dungeon_cooldowns from the
    -- append-only ledger + the catalogue — THE SAME function hr_dungeon_settle's
    -- gate (c) refuses on, so the countdown shown and the window enforced are one
    -- number. Was a client-clock `G.dungeons.lastRun` in the residue, which the
    -- armed path had stopped stamping at all. Empty object for a fresh character
    -- and for an expired window; absent key on the client means READY, which is
    -- safe because the SERVER refuses — the worst case is one refused intent.
    'dungeon_cooldowns', public.hr_dungeon_cooldowns(p_user, v_st.slot),$new$);
  execute v_def;
  raise notice 'hr_state_of patched: the envelope projects dungeon_cooldowns';
end $$;
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 6. SELF-VERIFYING COMMIT GATE (§4) ─────────────────────────────────────
-- Properties proven by EXECUTING SQL, not by markers. The apply is atomic, so a
-- raise here reverts §1-§5. The row-writing probe lives in a subtransaction
-- discarded by a sentinel raise (HR822), so this block is net-zero on production.
do $$
declare
  v_def   text;
  v_bad   text;
  v_cds   jsonb;
  v_env   jsonb;
  v_res   jsonb;
  v_at    timestamptz;
  v_uid   constant uuid := '000000d8-0000-0000-0000-0000000000d8';
  v_slot  constant int  := 0;
  c_dgn   constant text := 'crypt_of_bones';
  c_key   constant text := 'bone_key';
  c_xp    constant bigint := 13034431;   -- level 99; combat level clears every req_lv
  v_cd_s  int;
  v_dgn2  text;
  v_key2  text;
  v_cd2   int;
begin
  -- (a) THE HELPERS EXIST and are NOT executable by anything a browser can hold.
  --     MEASURED 2026-09-12 on the replay chain: in THIS database the primary
  --     control is 2026-08-11-anon-execute-lockdown.sql's `alter default privileges
  --     … revoke execute on functions from public`, so a new function is born
  --     owner-only and deleting §2/§3's revokes changes nothing. The revokes stay
  --     (revoke-before-grant is the standing rule, and the default could be
  --     changed by a future file or a platform upgrade); what this gate asserts is
  --     the PROPERTY — no browser-reachable EXECUTE, however it arrived — and
  --     tests/dungeon-cooldown.mjs proves it bites by GRANTING one.
  if to_regprocedure('public.hr_dungeon_cooldowns(uuid,int)') is null
     or to_regprocedure('public.hr_dungeon_cooldown_modes()') is null then
    raise exception 'GATE(a): the cooldown derivation functions are not installed';
  end if;
  -- READ FROM pg_proc.proacl, NOT information_schema.role_routine_grants: the
  -- information_schema view only shows grants involving a CURRENTLY ENABLED role,
  -- so a PUBLIC EXECUTE grant — the default on every new function, and the exact
  -- thing the revokes above exist to remove — does not appear in it at all. The
  -- first draft of this gate used that view and the mutation proof
  -- (tests/dungeon-cooldown.mjs helper_public_execute) STAYED GREEN with the
  -- revoke deleted. coalesce(proacl, acldefault(...)) is load-bearing too: a NULL
  -- proacl IS the default ACL, i.e. EXECUTE to PUBLIC.
  select string_agg(p.proname || ':' || coalesce(r.rolname, 'PUBLIC'), ', ') into v_bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    left join pg_roles r on r.oid = a.grantee
   where n.nspname = 'public'
     and p.proname in ('hr_dungeon_cooldowns', 'hr_dungeon_cooldown_modes')
     and a.privilege_type = 'EXECUTE'
     and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'));
  if v_bad is not null then
    raise exception 'GATE(a): a client-reachable EXECUTE grant exists on the cooldown derivation (%) '
                    '— these are internal helpers called from inside definer bodies', v_bad;
  end if;
  if public.hr_dungeon_cooldown_modes() @> array['scavenger']::text[] then
    raise exception 'GATE(a): scavenger is in the cooldown mode set — that is a Designer decision and '
                    'this file did not make it';
  end if;
  if not (public.hr_dungeon_cooldown_modes() @> array['auto','manual']::text[]) then
    raise exception 'GATE(a): the cooldown mode set does not cover auto AND manual — the gap this file '
                    'exists to close';
  end if;

  -- (b) THE GATE reads the shared derivation, the auto-only filter is GONE, and
  --     the rest of the settle survived the splice (positive controls).
  select prosrc into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_dungeon_settle';
  if position('public.hr_dungeon_cooldowns(v_uid, v_slot)' in v_def) = 0 then
    raise exception 'GATE(b): hr_dungeon_settle does not read hr_dungeon_cooldowns'; end if;
  if position('hr_dungeon_cooldown_modes()' in v_def) = 0 then
    raise exception 'GATE(b): hr_dungeon_settle does not gate on the shared mode set'; end if;
  if position($m$meta->>'mode' = 'auto'$m$ in v_def) > 0 then
    raise exception 'GATE(b): the auto-ONLY cooldown filter is still installed — a manual run would '
                    'still ignore the re-entry window';
  end if;
  if position('''daily_cap''' in v_def) = 0 or position('''insufficient_item''' in v_def) = 0
     or position('dungeon_scrip = dungeon_scrip + v_scrip' in v_def) = 0
     or position('''level_locked''' in v_def) = 0 then
    raise exception 'GATE(b): the splice damaged the settle — a fuse, the key gate, the level gate or '
                    'the scrip credit is missing';
  end if;

  -- (c) THE PROJECTION is in hr_state_of, and the keys the chain before it added
  --     are all still there (the splice must add, never consume).
  select prosrc into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_state_of';
  if position('''dungeon_cooldowns''' in v_def) = 0 then
    raise exception 'GATE(c): hr_state_of does not project dungeon_cooldowns'; end if;
  if position('''now'', now()' in v_def) = 0 then
    raise exception 'GATE(c): the splice consumed the `now` anchor — the client would lose the server '
                    'clock it renders every countdown against';
  end if;
  if position('''dungeon_scrip'', v_st.dungeon_scrip' in v_def) = 0
     or position('''marks'', v_st.marks' in v_def) = 0
     or position('''hired_at'', hired_at' in v_def) = 0 then
    raise exception 'GATE(c): the splice DROPPED an earlier projection (scrip / marks / hired_at) — '
                    'the patch chain is broken';
  end if;

  -- (d) NO CLIENT WRITE on player_ledger. The whole cooldown is derived from it,
  --     so a browser-reachable INSERT/UPDATE/DELETE — by grant or by policy —
  --     would make the window forgeable. RLS + no non-SELECT policy is what holds
  --     the line; the grant check is the second layer.
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'player_ledger' and c.relrowsecurity) then
    raise exception 'GATE(d): RLS is OFF on player_ledger — the cooldown would be player-authored';
  end if;
  select string_agg(polname || ':' || polcmd::text, ', ') into v_bad
    from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'player_ledger' and p.polcmd <> 'r'
     and (p.polroles = '{0}'::oid[]
          or p.polroles && (select coalesce(array_agg(oid), '{}'::oid[]) from pg_roles
                              where rolname in ('anon', 'authenticated', 'public')));
  if v_bad is not null then
    raise exception 'GATE(d): a NON-SELECT RLS policy on player_ledger is reachable by a browser role '
                    '(%) — a player could stamp or erase their own cooldown', v_bad;
  end if;

  -- (e) THE INTENT CARRIES NO TIMESTAMP. Structural, not a hope: the argument list
  --     of the only writer has no date/time type in it, so there is no client clock
  --     on the path at all.
  select pg_get_function_identity_arguments(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_dungeon_settle';
  if position('timestamp' in v_def) > 0 or position('date' in v_def) > 0 then
    raise exception 'GATE(e): hr_dungeon_settle takes a time-typed argument (%) — a client-supplied '
                    'timestamp could reach the cooldown', v_def;
  end if;

  -- (f) EXECUTED, on a real character, in a discarded subtransaction.
  begin
    select cooldown_s into v_cd_s from public.hr_dungeons where dungeon_id = c_dgn;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, dungeon_scrip, version)
      values (v_uid, v_slot, 0, 0, 0, 1)
      on conflict (user_id, slot) do update set dungeon_scrip = 0, version = 1;
    insert into public.player_skills (user_id, slot, skill_id, xp)
      select v_uid, v_slot, s, c_xp
        from unnest(array['attack','strength','defense','hitpoints','prayer','ranged','magic']) s
      on conflict (user_id, slot, skill_id) do update set xp = c_xp;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, v_slot, c_key, 2)
      on conflict (user_id, slot, item_id) do update set qty = 2;

    -- (f1) A FRESH CHARACTER HAS NO COOLDOWN — map and envelope both empty.
    if public.hr_dungeon_cooldowns(v_uid, v_slot) <> '{}'::jsonb then
      raise exception 'GATE(f1): a character with no dungeon history is on cooldown: %',
        public.hr_dungeon_cooldowns(v_uid, v_slot);
    end if;
    v_env := public.hr_state_of(v_uid, v_slot);
    if v_env->'dungeon_cooldowns' is null or v_env->'dungeon_cooldowns' <> '{}'::jsonb then
      raise exception 'GATE(f1): the envelope does not carry an empty dungeon_cooldowns for a fresh '
                      'character: %', v_env->'dungeon_cooldowns';
    end if;

    -- (f2) A SETTLE ROW STAMPS THE WINDOW FROM THE SERVER CLOCK, and the forged
    --      fields planted in its own meta move NOTHING. `at` is defaulted, never
    --      supplied — that is the server clock, by construction.
    insert into public.player_ledger
      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
    values (v_uid, v_slot, 'dungeon', 'dungeon_settle:' || c_dgn || ':auto', 0, 0, 0, 0, 0,
            jsonb_build_object('op', 'settle', 'dungeon', c_dgn, 'mode', 'auto', 'scrip', 15,
                               -- the forgery probe: a client-shaped timestamp in the
                               -- payload, ten days in the past. Nothing may read it.
                               'client_at', (now() - interval '10 days'),
                               'next_entry_at', (now() - interval '10 days')))
    returning at into v_at;
    v_cds := public.hr_dungeon_cooldowns(v_uid, v_slot);
    if (v_cds ->> c_dgn) is null then
      raise exception 'GATE(f2): a settle did not stamp the cooldown: %', v_cds; end if;
    if (v_cds ->> c_dgn)::timestamptz <> v_at + make_interval(secs => v_cd_s) then
      raise exception 'GATE(f2): next_entry_at = % but the ledger says % + %s — the window is not the '
                      'server-stamped row plus the catalogue cooldown',
                      v_cds ->> c_dgn, v_at, v_cd_s;
    end if;
    if (v_cds ->> c_dgn)::timestamptz < now() then
      raise exception 'GATE(f2): the forged meta timestamps WON — next_entry_at is in the past (%)',
        v_cds ->> c_dgn;
    end if;
    v_env := public.hr_state_of(v_uid, v_slot);
    if v_env->'dungeon_cooldowns' <> v_cds then
      raise exception 'GATE(f2): the envelope projection (%) disagrees with the gate derivation (%)',
        v_env->'dungeon_cooldowns', v_cds;
    end if;

    -- (f3) AN ENTRY INSIDE THE WINDOW IS REFUSED — auto AND manual — with the code
    --      and the detail, and it moves nothing (no key spent, no scrip credited).
    v_res := public.hr_dungeon_settle(v_uid, v_slot, 1,
               '000000d8-0000-0000-0000-00000000ad01'::uuid, c_dgn, 'auto', 1);
    if coalesce(v_res->>'error', '') <> 'on_cooldown' then
      raise exception 'GATE(f3): an auto entry inside the window was not refused on_cooldown: %', v_res;
    end if;
    if (v_res->>'next_entry_at') is null or (v_res->>'ready_at') is null
       or (v_res->>'next_entry_at')::timestamptz <> (v_cds ->> c_dgn)::timestamptz then
      raise exception 'GATE(f3): the refusal detail does not carry the projected next_entry_at: %', v_res;
    end if;
    v_res := public.hr_dungeon_settle(v_uid, v_slot, 1,
               '000000d8-0000-0000-0000-00000000ad02'::uuid, c_dgn, 'manual', 1);
    if coalesce(v_res->>'error', '') <> 'on_cooldown' then
      raise exception 'GATE(f3): a MANUAL entry inside the window was not refused — this is exactly the '
                      'gap this file exists to close: %', v_res;
    end if;
    if (select qty from public.player_inventory
         where user_id = v_uid and slot = v_slot and item_id = c_key) <> 2 then
      raise exception 'GATE(f3): a refused entry consumed the entry key'; end if;
    if (select dungeon_scrip from public.player_state
         where user_id = v_uid and slot = v_slot) <> 0 then
      raise exception 'GATE(f3): a refused entry credited scrip'; end if;
    if exists (select 1 from public.player_intents where user_id = v_uid) then
      raise exception 'GATE(f3): a refusal was CACHED as an intent result — the retry would replay a '
                      'refusal instead of being re-decided';
    end if;

    -- (f4) THE WINDOW IS PER-DUNGEON, AND AN ENTRY AFTER IT SUCCEEDS. A SECOND
    --      dungeon, seeded with a settle row backdated past its own cooldown (an
    --      INSERT: player_ledger is append-only, so history is seeded, never
    --      edited). It must be absent from the map while the first dungeon's window
    --      is still active, and its entry must go through.
    select dungeon_id, cost_key, cooldown_s into v_dgn2, v_key2, v_cd2
      from public.hr_dungeons where dungeon_id <> c_dgn and cooldown_s > 0
      order by req_lv asc, dungeon_id asc limit 1;
    if v_dgn2 is null then
      raise exception 'GATE(f4): the catalogue has only one cooldown dungeon — per-dungeon scoping '
                      'cannot be proven here';
    end if;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, v_slot, v_key2, 1)
      on conflict (user_id, slot, item_id) do update set qty = 1;
    insert into public.player_ledger
      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta, at)
    values (v_uid, v_slot, 'dungeon', 'dungeon_settle:' || v_dgn2 || ':auto', 0, 0, 0, 0, 0,
            jsonb_build_object('op', 'settle', 'dungeon', v_dgn2, 'mode', 'auto', 'scrip', 15),
            now() - make_interval(secs => v_cd2 + 60));
    v_cds := public.hr_dungeon_cooldowns(v_uid, v_slot);
    if (v_cds ? v_dgn2) then
      raise exception 'GATE(f4): an EXPIRED window is still projected (%) — the client would show a '
                      'cooldown the server would allow', v_cds;
    end if;
    if not (v_cds ? c_dgn) then
      raise exception 'GATE(f4): the FIRST dungeon''s active window vanished when a second was seeded '
                      '(%) — the window is not per-dungeon', v_cds;
    end if;
    v_res := public.hr_dungeon_settle(v_uid, v_slot, 1,
               '000000d8-0000-0000-0000-00000000ad03'::uuid, v_dgn2, 'auto', 1);
    if coalesce(v_res->>'ok', 'false') <> 'true' then
      raise exception 'GATE(f4): an entry AFTER the window was refused (%) — the gate is a wall, not a '
                      'cooldown', v_res;
    end if;
    -- and the successful entry stamped its OWN window, from the server clock, while
    -- leaving the other dungeon's untouched.
    v_cds := public.hr_dungeon_cooldowns(v_uid, v_slot);
    if not (v_cds ? v_dgn2) or not (v_cds ? c_dgn) then
      raise exception 'GATE(f4): after a successful settle the map is % — the settle did not stamp its '
                      'own window, or it cleared the other one', v_cds;
    end if;

    raise exception using errcode = 'HR822', message = 'dungeon-cooldown §6 complete — rolling back';
  exception when sqlstate 'HR822' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.hr_rejections where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §6 LEAKED a probe row'; end if;

  raise notice 'dungeon-cooldown: the re-entry window is server-derived (ledger at + catalogue '
               'cooldown_s), refuses auto AND manual inside it with next_entry_at, is projected as '
               'dungeon_cooldowns for ACTIVE windows only, ignores a forged payload timestamp, and '
               'lets an entry through after it — all green';
end $$;
