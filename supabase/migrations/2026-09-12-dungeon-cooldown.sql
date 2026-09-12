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
-- (Shape set by the GAME DESIGNER's ruling of 2026-09-12: no exemption may be
--  keyed on a client string, and `scavenger` must be a catalogue fact.)
--   1. hr_dungeon_cooldown_modes() — ONE table of numbers: mode -> DIVISOR,
--      {auto:1, manual:1, scavenger:4}. Every mode is cooldown-bearing; the
--      scavenger's window is the dungeon's `cooldown_s / 4` (crypt 4h -> 1h), not
--      an exemption. hr_dungeon_cooldown_divisor(mode) reads that one table, so
--      the gate and the projection cannot disagree about a number.
--   2. hr_dungeons.scavenger_ok — a CATALOGUE FACT. A `scavenger` intent for a
--      dungeon the catalogue does not author a scavenger run for is refused
--      `bad_mode`, so the string cannot reach ancient_wyrm's 72h table.
--   3. hr_dungeon_cooldowns(user, slot) -> jsonb — the ACTIVE windows, derived in
--      ONE pass from the append-only ledger's server-stamped `at` plus the
--      catalogue's cooldown_s and the divisor table. THE MODEL: a run is a run —
--      `last_at` is the most recent settle in ANY mode, and the window an ENTRY
--      must clear is `last_at + cooldown_s / divisor(that entry's mode)`. So after
--      a scavenger run a scavenger entry waits a quarter window while an auto or
--      manual entry still waits the full one (the Designer's own arm). This is the
--      SINGLE source of truth: the gate and the projection both read it.
--   4. hr_dungeon_settle gate (c) — refuses `bad_mode` for an unauthored scavenger
--      run and `on_cooldown` with {dungeon, mode, next_entry_at, ready_at,
--      cooldown_s} inside the window, BEFORE the key debit (f), so a refused early
--      re-entry costs no key, no items, no scrip and no version bump (§6 asserts
--      it for all three modes). `ready_at` is kept beside the canonical
--      `next_entry_at` so the reviewed refusal shape still holds for any reader.
--   5. hr_state_of — projects top-level `dungeon_cooldowns`, a PER-DUNGEON,
--      PER-MODE map of ACTIVE windows only:
--        { "crypt_of_bones": { "auto": ISO, "manual": ISO, "scavenger": ISO } }
--      An expired mode is omitted; a dungeon with no active mode is omitted; a
--      fresh character gets {}. The client already knows which button it is
--      painting, so it reads `map[id][mode]` — one lookup per button — and the
--      envelope's existing top-level `now` makes the countdown skew-free.
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
-- RESTATEMENT-DEBT-ACK: hr_state_of is an anchored patch chain — depth 16 before
-- this file and 17 with it, measured by `node tests/patch-chain-guard.mjs`, which
-- also lists it as slice 7's second target; 2026-09-12-worker-hired-at-projection.sql
-- carries the same ack for the same reason. The debt is taken knowingly: a
-- restatement must equal the LIVE body plus one key, an agent cannot apply or
-- re-pin, and a restatement authored from the repo replay is the b484-b487 class
-- where the restated body silently reverts whichever file patched last — on the one
-- function every screen reads. This file adds a single key and ALSO splices
-- hr_dungeon_settle exactly ONCE (that body's first patch, so it starts no chain),
-- against an anchor VERIFIED byte-identical on production 2026-09-12 by reading
-- pg_proc.prosrc read-only. THE PAYDOWN stays where worker-hired-at put it: restate
-- hr_state_of once from pg_get_functiondef of the LIVE body, Coordinator-owned, and
-- the chain resets for everyone.
--
-- ── THE PAYOUT CHANGES, NAMED (Designer ruling 2026-09-12) ──────────────────
--   · auto: unchanged in rule (the server already refused); the player can now SEE
--     the window instead of being told "on cooldown" by an error toast.
--   · manual: the server now refuses inside the FULL window. That restores the
--     authored rule — src/dungeons.js canRun() always blocked a manual start on
--     cooldown — but relative to the CURRENTLY LIVE (broken) behaviour it is a nerf.
--   · scavenger: gains a QUARTER window (crypt 4h -> 1h) where it had none. The
--     Designer's reason: an exemption keyed on a client-chosen string is not an
--     exemption, it is an opt-out — `p_mode` is the one thing a tampering client
--     picks freely, so "scavenger has no cooldown" meant "any client that says
--     scavenger has no cooldown". A quarter window keeps the intent (put in the
--     time, run more often) and removes the opt-out.
--   · a scavenger run also moves the FULL window, because `last_at` is the last run
--     in any mode: hourly scavenging therefore keeps auto/manual parked. That is
--     the ruled model ("a run is a run"), not an accident.
--   Live exposure: two kind='dungeon' ledger rows in the game's history, both auto,
--   so the practical impact on existing players is nil and the scarce gate remains
--   the key. The divisors are ONE line (§2) for the Designer to retune.
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
-- (The RESTATEMENT-DEBT-ACK for hr_state_of's patch chain is above, inside the
--  first 120 lines where tests/patch-chain-guard.mjs reads it.)
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
--      `drop function public.hr_dungeon_cooldown_divisor(text);`
--      `drop function public.hr_dungeon_cooldown_modes();`  (only after 1)
--      `drop index if exists public.player_ledger_dungeon_idx;`
--      `alter table public.hr_dungeons drop column scavenger_ok;`  (only after 1 —
--        the generated catalogue does not reference it, so nothing else breaks)
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

-- ── 2. THE DIVISOR TABLE — mode -> how much of the window that mode waits ───
-- The ONE table of numbers, and the only place a cooldown number lives besides the
-- generated catalogue's cooldown_s. Read by the gate (§5) and by the map (§4), so a
-- retune is one edit and the projection can never describe a rule the gate does not
-- enforce. Designer ruling 2026-09-12: every mode is cooldown-bearing — a scavenger
-- run waits cooldown_s / 4 — because an exemption keyed on the client-chosen
-- `p_mode` string is an opt-out, not an exemption. A mode absent from this table has
-- NO cooldown; today none is, and the §7 gate asserts all three are present.
create or replace function public.hr_dungeon_cooldown_modes()
returns jsonb language sql immutable parallel safe as $$
  select jsonb_build_object('auto', 1, 'manual', 1, 'scavenger', 4)
$$;
revoke execute on function public.hr_dungeon_cooldown_modes()
  from public, anon, authenticated, service_role;

-- The divisor for ONE mode, read from that same table (never a second literal).
-- NULL for a mode the table does not name — which the gate reads as "no cooldown"
-- and the map reads as "not a window-bearing row", one behaviour from one fact.
create or replace function public.hr_dungeon_cooldown_divisor(p_mode text)
returns int language sql immutable parallel safe as $$
  select nullif(public.hr_dungeon_cooldown_modes() ->> p_mode, '')::int
$$;
revoke execute on function public.hr_dungeon_cooldown_divisor(text)
  from public, anon, authenticated, service_role;

-- ── 3. hr_dungeons.scavenger_ok — THE SCAVENGER IS A CATALOGUE FACT ─────────
-- Designer ruling 2026-09-12: a `scavenger` intent must be refused for any dungeon
-- the game does not AUTHOR a scavenger run for, so the string cannot reach
-- ancient_wyrm's 72h window and its best-in-game loot table. Today exactly one
-- dungeon has a config.
--
-- ⟦DERIVED⟧ from the authored source — `SCAVENGER_CONFIGS` in
-- src/dungeon-scavenger.js — and NOT hand-authored game data in SQL. The id list
-- below is derived from that file, and tests/dungeon-cooldown.mjs PARSES the same
-- file and fails if the installed flag set differs in either direction, which is
-- the drift guard this repo requires of every catalogue fact. It is not in
-- 2026-09-10-dungeon-catalogue.generated.sql because that file is APPLIED and
-- editing an applied migration is its own hazard, and because
-- tools/gen-dungeon-catalogue.mjs cannot import SCAVENGER_CONFIGS today: it lives in
-- a browser IIFE (src/dungeon-scavenger.js), not in src/data/*.js.
-- THE PAYDOWN (named, not silent): move the scavenger configs' id set into
-- src/data/dungeons.js (or export it), teach tools/gen-dungeon-catalogue.mjs to emit
-- `scavenger_ok`, and regenerate the catalogue — then this §3 becomes a no-op and
-- the drift guard keeps watching.
alter table public.hr_dungeons add column if not exists scavenger_ok boolean not null default false;
do $$
declare
  -- ⟦DERIVED⟧ src/dungeon-scavenger.js SCAVENGER_CONFIGS keys, 2026-09-12.
  c_authored constant text[] := array['crypt_of_bones'];
  v_missing text;
begin
  select string_agg(x, ', ') into v_missing
    from unnest(c_authored) x
   where not exists (select 1 from public.hr_dungeons d where d.dungeon_id = x);
  if v_missing is not null then
    raise exception 'the authored scavenger config names dungeon(s) the catalogue does not have (%) — '
                    'regenerate the catalogue before installing a flag that can never be true', v_missing;
  end if;
  update public.hr_dungeons set scavenger_ok = (dungeon_id = any (c_authored))
   where scavenger_ok is distinct from (dungeon_id = any (c_authored));
  raise notice 'hr_dungeons.scavenger_ok set from the authored config: %', c_authored;
end $$;

-- ── 4. hr_dungeon_cooldowns(user, slot) — THE ACTIVE WINDOWS, SERVER-DERIVED ─
-- ONE pass over the append-only ledger, grouped by dungeon, joined to the
-- catalogue's cooldown_s and to the divisor table, filtered to windows still open
-- at now(). Shape: { dungeon_id: { mode: next_entry_at } }, ACTIVE entries only —
-- an expired mode is omitted, a dungeon with no active mode is omitted, so the
-- ordinary envelope carries `{}` and the worst case is 6 dungeons x 3 modes
-- (~700 bytes, and only for a player who just ran every dungeon in the game).
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
--   · INTEGER division (cooldown_s / divisor). Deterministic and exact for the
--     authored numbers (14400/4 = 3600); a non-divisible cooldown loses at most
--     `divisor - 1` seconds, i.e. fails OPEN by under 3 seconds, which is a
--     rounding choice and not a gate.
create or replace function public.hr_dungeon_cooldowns(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(w.dungeon_id, w.modes), '{}'::jsonb)
    from (
      select l.dungeon_id,
             jsonb_object_agg(m.mode, to_jsonb(l.last_at + make_interval(secs => d.cooldown_s / m.divisor)))
               filter (where l.last_at + make_interval(secs => d.cooldown_s / m.divisor) > now()) as modes
        from (select meta->>'dungeon' as dungeon_id, max(at) as last_at
                from public.player_ledger
               where user_id = p_user
                 and slot = coalesce(p_slot, 0)
                 and kind = 'dungeon'
                 and coalesce(meta->>'op', 'settle') = 'settle'
                 and public.hr_dungeon_cooldown_divisor(meta->>'mode') is not null
               group by 1) l
        join public.hr_dungeons d on d.dungeon_id = l.dungeon_id
        cross join lateral (select e.key as mode, (e.value #>> '{}')::int as divisor
                              from jsonb_each(public.hr_dungeon_cooldown_modes()) e) m
       where d.cooldown_s > 0 and m.divisor > 0
       group by l.dungeon_id
    ) w
   where w.modes is not null
$$;
revoke execute on function public.hr_dungeon_cooldowns(uuid, int)
  from public, anon, authenticated, service_role;

-- ── 5. hr_dungeon_settle — THE GATE, for every mode the cooldown binds ──────
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
  c_new constant text := $new$    -- (c0) THE SCAVENGER IS A CATALOGUE FACT, NOT A CLIENT CLAIM (Designer ruling
    --      2026-09-12). `p_mode` is the one value a tampering client picks freely,
    --      and the scavenger mode carries the cheapest window, so it may only be
    --      used where the game AUTHORS a scavenger run (hr_dungeons.scavenger_ok,
    --      derived from SCAVENGER_CONFIGS). Without this, the string alone would
    --      reach ancient_wyrm's 72h window and its best loot table. Refused BEFORE
    --      the key debit (f), so it costs nothing.
    if p_mode = 'scavenger' and not coalesce(v_dun.scavenger_ok, false) then
      perform public.hr_reject('bad_mode',
        jsonb_build_object('mode', p_mode, 'dungeon', v_dun.dungeon_id,
                           'reason', 'no_scavenger_config'));
    end if;

    -- (c) COOLDOWN — SERVER-OWNED, for EVERY mode, at that mode's share of the
    --     window (hr_dungeon_cooldown_modes() = {auto:1, manual:1, scavenger:4};
    --     nothing is exempt, because an exemption keyed on a client string is an
    --     opt-out). Derived by hr_dungeon_cooldowns from now() + the append-only
    --     ledger's server-stamped `at` — never a stored counter a client can reset
    --     (the b288 lesson) and never a value from the payload (the intent carries
    --     no timestamp at all). THE SAME FUNCTION feeds hr_state_of's
    --     `dungeon_cooldowns` projection, so the countdown the player is shown and
    --     the window the server enforces are one number.
    --     Before 2026-09-12 this gate covered mode='auto' ONLY, while the client
    --     gated manual on a client-clock `G.dungeons.lastRun` that the armed path
    --     had stopped stamping — so the authored re-entry limit did not exist for
    --     manual runs, on a loot table that is mostly TRADEABLE material.
    if public.hr_dungeon_cooldown_divisor(p_mode) is not null and v_dun.cooldown_s > 0 then
      declare
        v_next timestamptz;
      begin
        v_next := (public.hr_dungeon_cooldowns(v_uid, v_slot)
                     #>> array[v_dun.dungeon_id, p_mode])::timestamptz;
        if v_next is not null then
          perform public.hr_reject('on_cooldown',
            jsonb_build_object('dungeon', v_dun.dungeon_id,
                               'mode', p_mode,
                               'next_entry_at', v_next,
                               -- kept beside the canonical name: the reviewed
                               -- refusal shape (dungeon-settlement.md) says
                               -- ready_at, and a live reader must not break.
                               'ready_at', v_next,
                               'cooldown_s', v_dun.cooldown_s
                                 / public.hr_dungeon_cooldown_divisor(p_mode)));
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

-- ── 6. hr_state_of — PROJECT dungeon_cooldowns (programmatic, additive) ─────
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
    'dungeon_cooldowns', public.hr_dungeon_cooldowns(p_user, v_st.slot),$new$);
  execute v_def;
  raise notice 'hr_state_of patched: the envelope projects dungeon_cooldowns';
end $$;
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 7. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ────────────────────────────
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
     or to_regprocedure('public.hr_dungeon_cooldown_modes()') is null
     or to_regprocedure('public.hr_dungeon_cooldown_divisor(text)') is null then
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
     and p.proname in ('hr_dungeon_cooldowns', 'hr_dungeon_cooldown_modes',
                       'hr_dungeon_cooldown_divisor')
     and a.privilege_type = 'EXECUTE'
     and (a.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'));
  if v_bad is not null then
    raise exception 'GATE(a): a client-reachable EXECUTE grant exists on the cooldown derivation (%) '
                    '— these are internal helpers called from inside definer bodies', v_bad;
  end if;

  -- (a2) THE DIVISOR TABLE covers EVERY mode the settle accepts, so no mode can
  --      opt out of the window by being unnamed (the Designer's ruling: an
  --      exemption keyed on a client string is an opt-out), and the scavenger's
  --      share is the ruled quarter.
  if public.hr_dungeon_cooldown_divisor('auto') <> 1
     or public.hr_dungeon_cooldown_divisor('manual') <> 1 then
    raise exception 'GATE(a2): auto/manual no longer wait the FULL window (auto %, manual %)',
      public.hr_dungeon_cooldown_divisor('auto'), public.hr_dungeon_cooldown_divisor('manual');
  end if;
  if coalesce(public.hr_dungeon_cooldown_divisor('scavenger'), 0) <> 4 then
    raise exception 'GATE(a2): the scavenger divisor is % — the ruling is a QUARTER window (4), and a '
                    'NULL would be the exemption the ruling removed',
      public.hr_dungeon_cooldown_divisor('scavenger');
  end if;

  -- (a3) THE SCAVENGER FLAG IS A CATALOGUE FACT, present on the catalogue and true
  --      for exactly the dungeons the game authors a scavenger run for. The
  --      authored set is parsed from src/dungeon-scavenger.js by
  --      tests/dungeon-cooldown.mjs (this block cannot read a JS file); what it
  --      asserts here is that the column exists, is NOT NULL, and is not true for
  --      everything — which is the shape that would make §5's bad_mode vacuous.
  if (select count(*) from information_schema.columns
       where table_schema='public' and table_name='hr_dungeons'
         and column_name='scavenger_ok' and is_nullable='NO') <> 1 then
    raise exception 'GATE(a3): hr_dungeons.scavenger_ok is missing or nullable';
  end if;
  if (select count(*) from public.hr_dungeons where scavenger_ok) = 0 then
    raise exception 'GATE(a3): no dungeon is scavenger_ok — every scavenger run in the game would be '
                    'refused bad_mode';
  end if;
  if (select count(*) from public.hr_dungeons where not scavenger_ok) = 0 then
    raise exception 'GATE(a3): EVERY dungeon is scavenger_ok — the catalogue gate would be vacuous and '
                    'the string would reach the 72h world boss';
  end if;

  -- (b) THE GATE reads the shared derivation, the auto-only filter is GONE, and
  --     the rest of the settle survived the splice (positive controls).
  select prosrc into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_dungeon_settle';
  if position('public.hr_dungeon_cooldowns(v_uid, v_slot)' in v_def) = 0 then
    raise exception 'GATE(b): hr_dungeon_settle does not read hr_dungeon_cooldowns'; end if;
  if position('hr_dungeon_cooldown_divisor(p_mode)' in v_def) = 0 then
    raise exception 'GATE(b): hr_dungeon_settle does not gate on the shared divisor table'; end if;
  if position('v_dun.scavenger_ok' in v_def) = 0 then
    raise exception 'GATE(b): hr_dungeon_settle does not check the catalogue scavenger flag — the mode '
                    'string alone would reach any dungeon'; end if;
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
    if (v_cds #>> array[c_dgn, 'auto']) is null then
      raise exception 'GATE(f2): a settle did not stamp the cooldown: %', v_cds; end if;
    if (v_cds #>> array[c_dgn, 'auto'])::timestamptz <> v_at + make_interval(secs => v_cd_s) then
      raise exception 'GATE(f2): auto next_entry_at = % but the ledger says % + %s — the window is not '
                      'the server-stamped row plus the catalogue cooldown',
                      v_cds #>> array[c_dgn, 'auto'], v_at, v_cd_s;
    end if;
    -- the DIVISOR is applied per mode: the scavenger window is a QUARTER of it.
    if (v_cds #>> array[c_dgn, 'scavenger'])::timestamptz
       <> v_at + make_interval(secs => v_cd_s / 4) then
      raise exception 'GATE(f2): the scavenger window is % but should be % + %s/4 — the divisor table '
                      'is not being applied',
                      v_cds #>> array[c_dgn, 'scavenger'], v_at, v_cd_s;
    end if;
    if (v_cds #>> array[c_dgn, 'auto'])::timestamptz < now() then
      raise exception 'GATE(f2): the forged meta timestamps WON — next_entry_at is in the past (%)',
        v_cds #>> array[c_dgn, 'auto'];
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
       or (v_res->>'next_entry_at')::timestamptz <> (v_cds #>> array[c_dgn, 'auto'])::timestamptz then
      raise exception 'GATE(f3): the refusal detail does not carry the projected next_entry_at: %', v_res;
    end if;
    v_res := public.hr_dungeon_settle(v_uid, v_slot, 1,
               '000000d8-0000-0000-0000-00000000ad02'::uuid, c_dgn, 'manual', 1);
    if coalesce(v_res->>'error', '') <> 'on_cooldown' then
      raise exception 'GATE(f3): a MANUAL entry inside the window was not refused — this is exactly the '
                      'gap this file exists to close: %', v_res;
    end if;
    -- and the SCAVENGER, inside its own quarter window, is refused too: no mode is
    -- exempt (Designer ruling 2026-09-12), and it is refused at ITS window, not the
    -- full one.
    v_res := public.hr_dungeon_settle(v_uid, v_slot, 1,
               '000000d8-0000-0000-0000-00000000ad04'::uuid, c_dgn, 'scavenger', 1);
    if coalesce(v_res->>'error', '') <> 'on_cooldown' then
      raise exception 'GATE(f3): a SCAVENGER entry inside the quarter window was not refused — the '
                      'client-string exemption is back: %', v_res;
    end if;
    if (v_res->>'next_entry_at')::timestamptz <> (v_cds #>> array[c_dgn, 'scavenger'])::timestamptz then
      raise exception 'GATE(f3): the scavenger refusal quotes % but its projected window is % — the gate '
                      'and the projection disagree', v_res->>'next_entry_at',
                      v_cds #>> array[c_dgn, 'scavenger'];
    end if;
    if (v_res->>'cooldown_s')::int <> v_cd_s / 4 then
      raise exception 'GATE(f3): the scavenger refusal reports cooldown_s % (expected %)',
        v_res->>'cooldown_s', v_cd_s / 4;
    end if;

    -- A SCAVENGER RUN THE CATALOGUE DOES NOT AUTHOR is bad_mode, not a cheap window
    -- — the string must not reach a dungeon with no scavenger config.
    select dungeon_id into v_dgn2 from public.hr_dungeons
     where not scavenger_ok and cooldown_s > 0 order by req_lv asc, dungeon_id asc limit 1;
    if v_dgn2 is null then
      raise exception 'GATE(f3): every dungeon is scavenger_ok — bad_mode cannot be proven'; end if;
    v_res := public.hr_dungeon_settle(v_uid, v_slot, 1,
               '000000d8-0000-0000-0000-00000000ad05'::uuid, v_dgn2, 'scavenger', 1);
    if coalesce(v_res->>'error', '') <> 'bad_mode' then
      raise exception 'GATE(f3): a scavenger run on %, which has no authored scavenger config, was not '
                      'refused bad_mode: %', v_dgn2, v_res;
    end if;
    if (v_res->>'reason') <> 'no_scavenger_config' then
      raise exception 'GATE(f3): the bad_mode refusal does not say why: %', v_res; end if;
    v_dgn2 := null;   -- (f4) re-selects its own dungeon; do not carry this one

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
               'cooldown_s / the divisor table), refuses auto, manual AND scavenger inside their own '
               'share with next_entry_at and before the key debit, refuses an unauthored scavenger run '
               'with bad_mode, is projected as dungeon_cooldowns per dungeon per mode for ACTIVE '
               'windows only, ignores a forged payload timestamp, and lets an entry through after the '
               'window — all green';
end $$;
