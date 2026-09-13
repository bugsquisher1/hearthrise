-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-13-consumable-buffs.sql — THE SERVER OWNS THE BUFF CLOCK.
--
-- STEP 1 OF THREE, AND IT IS DELIBERATELY A SERVER THAT PAYS A BUFF IT NEVER
-- RECEIVES. This file adds the column, the catalogue lookup, the delta key, the
-- projection and the guards. The EAT PATH that emits `buff_apply`
-- (supabase/functions/hr-accrue/eat.js) is step 2 and is NOT wired here, so on
-- the day this applies every character's queue is `[]`, every accrual is
-- byte-identical to today's, and the only behaviour change is that a forged
-- buff has nowhere left to live (see §5). Honest UNDER-pay, never over-pay: the
-- direction this schema is allowed to be wrong in.
--
-- ── WHY THIS EXISTS ────────────────────────────────────────────────────────
-- Consumable buffs have paid NOTHING server-side since the cutover. A player
-- eats a Fisher's Pie, the client shows "+2% damage" and ticks it down with a
-- setInterval, and the server — which computes every kill, every drop and every
-- XP grant — has never heard of it. Two consequences, and the second is worse:
--   · the tooltip lies (the b341 UI-says-one-thing-engine-does-another class);
--   · the only copy of the buff lived in `client_state` (RESIDUE_FIELDS
--     'buffs'), a bag the PLAYER writes. The residue is hydrated into G and G
--     feeds the client's getBonus chain, so the shadow copy was a forgeable
--     input to a display the player reads as truth. §5's companion migration
--     moves `buffs` onto hr_put_client_state's authority deny-list; this file is
--     what makes that possible without losing the feature.
--
-- ── THE MODEL: AN ABSOLUTE `until`, AND WHY IT IS NOT A `remainingMs` ──────
--   player_state.buffs = [{type, magnitude, until}]   (jsonb, not null, '[]')
--
-- `until` is an ABSOLUTE timestamptz. A stored `remainingMs` has to be ticked by
-- somebody, and "somebody" is exactly the `setInterval` that src/core/buffs.js's
-- header is an autopsy of: an interval only runs in a live tab, so a ten-minute
-- buff read 10:00 after a twelve-hour absence and then paid the whole night. An
-- absolute expiry needs no ticker. Nothing has to be running for it to be true,
-- which is the only property that survives a process that is not running.
--
-- DRAIN SEMANTICS: WALL-CLOCK (game-designer, final, 2026-09-13). A Feast is
-- true while you sleep and runs out at the instant it would have run out had you
-- sat and watched. The rule is ONE NAMED CONSTANT — `BUFF_DRAIN_RULE` in
-- src/core/buffs.js, with `remainingAtMs` as its only derivation — so a ruling
-- the other way is a one-line change rather than a sweep. Copy for step 3:
-- "Lasts 10 min of real time — awake or away."
--
-- ── THE CONTRACT: `buff_apply` CARRIES ONE FIELD, AND IT IS AN ITEM ID ────
--     delta.buff_apply = { item: <item_id> }        ← and NOTHING else
--
-- Not the type. Not the magnitude. Not the duration. Above all not `until`.
-- Every one of those is resolved HERE, under the character lock, from
-- hr_item_buffs (generated from src/data/items.js by tools/gen-catalogues.mjs)
-- and from now(). An OBJECT with any key other than `item` is REFUSED BY NAME
-- with `bad_buff_item` / why=forbidden_key — refused, not stripped, because a
-- caller sending `until` is either forging or badly broken and both are worth a
-- loud answer. That is the difference between "the client cannot influence the
-- expiry" and "the client's expiry happens to be ignored today".
--
-- ── STACKING (game-designer, final, 2026-09-13) ────────────────────────────
-- Same type merges, NEVER replaces:
--     magnitude = max(old, new)            a weaker dish cannot dilute a Feast
--     until     = max(now, old.until) + duration       the tail is EXTENDED
--     until     ≤ now() + c_buff_max_ms (3,600,000 ms)          the hard cap
-- and if the cap would swallow (all but a sliver of) the duration, the consume is
-- REFUSED with `buff_at_max` rather than eating the item for nothing: a consume
-- must buy at least `c_buff_min_gain_frac` (10%) of what it promises. A partial
-- clamp still applies (you get the minutes that fit). Both branches are asserted
-- by execution in §4 AND by tests/buff-queue.mjs.
--   ⚠ THE FRACTION IS NOT DECORATION. The first draft refused only on
--     `base >= cap`, which is UNREACHABLE in production: the cap is
--     `now() + 3,600,000 ms`, so it moves with the clock and a queue sitting on the
--     ceiling still buys a second every second. §4 passed anyway — a migration
--     applies inside ONE transaction, where now() is frozen and the equality does
--     hold — and only tests/buff-queue.mjs, which calls hr_apply the way
--     production does (a transaction per call), showed 200 consumes with no
--     refusal at all. An assertion that can only pass in the harness is the class
--     this schema has been bitten by twelve times.
--
-- THE CAP IS ALSO THE BLAST RADIUS. Merge-by-type bounds the queue to one row
-- per type (nine today) and the cap bounds the value of a queue to sixty minutes
-- of buff, so "eat 400 pies before a raid" cannot bank eight hours of +damage
-- into an away night. There is no per-day clamp and none is needed: the ceiling
-- is on the STOCK, not the flow.
--
-- ── WHAT IS NOT HERE, DELIBERATELY ─────────────────────────────────────────
-- NO LEDGER ROW PER BUFF. A buff moves no gold, no gems, no XP and nothing
-- tradeable; the consumed food is journalled by the apply row that debits it
-- (`meta.k` names the delta keys, so a buff_apply is already identifiable). One
-- row per eaten pie is the game_events mistake (1.6M rows / 229 MB from six
-- players in four days) at ledger scale. §4 asserts the absence.
-- NO SECOND ENGINE. combat-sim.js / skill-sim.js / artisan-sim.js are UNTOUCHED
-- — they have drained `state.buffs` since b326 and the accrual engine simply
-- stops handing them an empty array. One combat engine (AWAY-12).
-- NO `buffs` KEY THE ENGINE CAN WRITE WHOLESALE. `buff_apply` is the only way
-- the column moves, so there is no shape in which a compromised engine can post
-- an arbitrary queue.
--
-- RESTATEMENT-DEBT-ACK: an agent cannot read the LIVE body of hr_apply or
--   hr_state_of (tools/apply-migration.mjs and tests/live-hash-drift.baseline.json
--   are Coordinator-only), so a restatement authored from the repo replay would
--   blind-overwrite whichever file patched production last — the b484-b487 class,
--   on the economy's single write path. Every anchor here is asserted EXACTLY ONCE
--   before anything is written and every splice is re-entrant; the paydown
--   (restate each body once from pg_get_functiondef of the LIVE body, then re-pin
--   live-hash-drift) is the Coordinator's, scheduled, not discovered.
-- hr_apply (134 KB, ~14 programmatic patches deep) and hr_state_of are PATCHED
-- at anchors, not restated, for the reason 2026-09-12-worker-hired-at-
-- projection.sql states at length: an agent cannot read the LIVE body
-- (apply-migration and the live-hash baseline are Coordinator-only), and a
-- restatement authored from the repo replay is the b484–b487 class where the
-- restated body silently reverts whichever file patched last. Every anchor is
-- asserted EXACTLY ONCE before anything is written (§0), every patch is
-- re-entrant (a second apply is a notice + return), and §4 asserts that no
-- predecessor's block was eaten. The paydown — restate each body ONCE from
-- pg_get_functiondef of the LIVE body, then re-pin live-hash-drift — stays the
-- Coordinator's, scheduled, not discovered.
--
-- ── COST AT 100× PLAYERS ──────────────────────────────────────────────────
-- One jsonb column on player_state holding at most nine short objects (~90 B
-- per row worst case, typically 0–1 entries ≈ 2 B for '[]'). No new index (every
-- read is by the primary key the envelope already fetches). No new table row per
-- action, no per-tick write: the column is rewritten only by an apply that
-- carries `buff_apply`, i.e. once per food eaten, inside an UPDATE that was
-- already happening. hr_item_buffs is 30 rows, read once per buff_apply by
-- primary key. The projection adds one `jsonb_array_elements` over ≤9 elements
-- to hr_state_of — measured below the noise floor against the 1.5 ms envelope.
-- Rows added at 100× players: ZERO.
--
-- ── REVERSIBILITY ─────────────────────────────────────────────────────────
-- Additive in every direction. To revert behaviour, stop emitting `buff_apply`
-- (step 2 is the only emitter): the column then stays whatever it was, decays to
-- nothing by wall clock, and the engine pays nobody. To revert the bodies,
-- re-apply the previous last-toucher of each (2026-09-13-reed-and-tide.sql /
-- 2026-09-13-town-presence.sql for hr_state_of; 2026-09-13-prayer-ladder-and-
-- item-gates.sql for hr_apply) — nothing is dropped and no data is destroyed.
-- THE TWO HALVES ARE SAFE IN EITHER ORDER: the Edge reads `buffs` presence-of-key
-- off the envelope and seeds `null` when it is absent, so an Edge deployed ahead
-- of this migration never pays a buff, and this migration applied ahead of the
-- Edge is a column of '[]' that nothing writes.
--
-- ⚠ AFTER APPLYING: hr_apply AND hr_state_of are LIVE-HASH-TRACKED bodies
--   (tests/live-hash-drift.baseline.json). This file patches BOTH
--   PROGRAMMATICALLY, so the Coordinator must re-seed with
--   `node tests/live-hash-drift.mjs --live --write` after the apply and write
--   the whys from `--codediff`. It carries no literal
--   `create or replace function public.hr_apply(` / `public.hr_state_of(`
--   header and takes over no last-toucher role in the derivation tools.
--
-- ⚠ THE OTHER HALF IS A SEPARATE FILE, AND IT IS REQUIRED.
--   2026-09-13-client-state-buffs-denylist.sql moves `buffs` onto
--   hr_put_client_state's AUTHORITY deny-list, and src/net/client-state.js drops it
--   from RESIDUE_FIELDS in the same commit. The two MUST ship together: the server
--   refuses the WHOLE patch on a forbidden key, so a build where `buffs` is on both
--   lists stops every residue field from saving for every player.
--   tests/arm-homing-guard.mjs asserts that collision across both migrations.
--   (This note lived at the FOOT of the file until 2026-09-13 and made the last
--   line prose, which tests/run-smoke.mjs migrationGuard reads as a truncated
--   file — a whole-suite red. A migration ends on a terminator.)
--
-- ⚠ APPLY ORDER: 2026-09-13-item-buffs-catalogue.generated.sql FIRST. §0 refuses
--   to install without hr_item_buffs, because a `buff_apply` block that resolves
--   against a missing table would answer `bad_buff_item` for every real food —
--   a control that reads as present in review and fires for nobody.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED, AND EVERY ANCHOR EXACTLY ONCE ──────────
-- A `replace()` whose anchor is absent is a silent no-op that leaves a function
-- half-patched and a migration reporting success; an anchor that matches TWICE
-- lands the insert in whichever arm came first, which is worse. Counted with
-- (length - length(replace(...))) so an anchor full of regex metacharacters
-- cannot be mis-counted.
do $mig$
declare
  v_apply text; v_state text; v_n int;
  c_a_keys  constant text := $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',$anc$;
  c_a_codes constant text := $anc$  c_release_codes constant text[] := array[$anc$;
  c_a_decl  constant text := $anc$  v_fight jsonb;$anc$;
  c_a_valid constant text := $anc$    if p_delta ? 'workers' then$anc$;
  c_a_set   constant text := $anc$       set gold = v_new_gold,$anc$;
  c_a_proj  constant text := $anc$    'now', now(),$anc$;
begin
  if to_regclass('public.player_state') is null then
    raise exception 'player_state is missing — apply the player-state chain first'; end if;
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null then
    raise exception 'hr_apply(uuid,int,bigint,uuid,jsonb) is missing — apply 2026-08-11-apply-engine.sql '
                    'and its chain first'; end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_state_of is missing — apply the player-state chain first'; end if;
  if to_regprocedure('public.hr_reject(text,jsonb)') is null then
    raise exception 'hr_reject is missing — apply the apply-engine chain first'; end if;

  -- THE CATALOGUE. Present AND non-empty: an empty hr_item_buffs would make
  -- every honest food answer bad_buff_item while every check in this file passed.
  if to_regclass('public.hr_item_buffs') is null then
    raise exception 'hr_item_buffs is missing — apply 2026-09-13-item-buffs-catalogue.generated.sql '
                    'BEFORE this file. A buff_apply block with no catalogue refuses every real food.'; end if;
  if (select count(*) from public.hr_item_buffs) = 0 then
    raise exception 'hr_item_buffs is EMPTY — regenerate with tools/gen-catalogues.mjs and apply '
                    '2026-09-13-item-buffs-catalogue.generated.sql first'; end if;
  -- …and every row names a real item, or the eat path could never reach it.
  if exists (select 1 from public.hr_item_buffs b
              where not exists (select 1 from public.hr_items i where i.item_id = b.item_id)) then
    raise exception 'hr_item_buffs names an item that is not in hr_items — the catalogues disagree; '
                    'regenerate both from src/data/items.js'; end if;

  select pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure) into v_apply;
  select pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure) into v_state;
  v_apply := replace(v_apply, chr(13), '');
  v_state := replace(v_state, chr(13), '');

  v_n := (length(v_apply) - length(replace(v_apply, c_a_keys, ''))) / length(c_a_keys);
  if v_n <> 1 then raise exception 'hr_apply: the c_delta_keys anchor appears % time(s), expected exactly 1', v_n; end if;
  v_n := (length(v_apply) - length(replace(v_apply, c_a_codes, ''))) / length(c_a_codes);
  if v_n <> 1 then raise exception 'hr_apply: the c_release_codes anchor appears % time(s), expected exactly 1', v_n; end if;
  v_n := (length(v_apply) - length(replace(v_apply, c_a_decl, ''))) / length(c_a_decl);
  if v_n <> 1 then raise exception 'hr_apply: the declare anchor appears % time(s), expected exactly 1', v_n; end if;
  v_n := (length(v_apply) - length(replace(v_apply, c_a_valid, ''))) / length(c_a_valid);
  if v_n <> 1 then raise exception 'hr_apply: the validation-block anchor appears % time(s), expected '
                                  'exactly 1 (apply 2026-08-25-workers.sql first)', v_n; end if;
  v_n := (length(v_apply) - length(replace(v_apply, c_a_set, ''))) / length(c_a_set);
  if v_n <> 1 then raise exception 'hr_apply: the SET-clause anchor appears % time(s), expected exactly 1', v_n; end if;
  v_n := (length(v_state) - length(replace(v_state, c_a_proj, ''))) / length(c_a_proj);
  if v_n <> 1 then raise exception 'hr_state_of: the `now` anchor appears % time(s), expected exactly 1', v_n; end if;

  -- The predecessors whose work this file must NOT be able to erase. Named here
  -- so an apply against an unexpected body fails BEFORE it writes, and asserted
  -- again in §4 after the patch.
  if strpos(v_apply, $q$p_delta ? 'consec_falls'$q$) = 0
     or strpos(v_apply, $q$p_delta ? 'workers'$q$) = 0
     or strpos(v_apply, $q$p_delta ? 'tool_carry'$q$) = 0 then
    raise exception 'hr_apply is not the body this file was derived against (a predecessor block is '
                    'missing) — diff the live hr_apply against the repo chain before patching';
  end if;
end $mig$;

-- ── 1. THE COLUMN ──────────────────────────────────────────────────────────
-- `not null default '[]'` so there is no "present but null" state for a reader
-- to guess at, and so every existing character starts with an EMPTY queue rather
-- than an unknown one. Written ONLY by hr_apply's buff_apply block (§3); §4
-- asserts player_state has no client write policy and that no browser role can
-- execute the writer.
alter table public.player_state
  add column if not exists buffs jsonb not null default '[]'::jsonb;

-- The schema's own half of the blast radius, so the invariant survives a future
-- writer that skips hr_apply. An ARRAY (the simulators iterate it; an object
-- would throw inside the away replay), and at most 64 entries — merge-by-type
-- bounds an honest queue to ONE row per buff type (nine today), so 64 is ~7×
-- headroom and still stops a compromised writer parking a megabyte in a column
-- the envelope carries on every load. NOT VALID is not used: the column was
-- created with a default of '[]' one statement ago, so every existing row already
-- satisfies it and a full validate is a scan of a table with tens of rows.
do $mig$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_state'::regclass
                    and conname = 'player_state_buffs_sane') then
    alter table public.player_state
      add constraint player_state_buffs_sane
      check (jsonb_typeof(buffs) = 'array' and jsonb_array_length(buffs) <= 64);
  end if;
end $mig$;

-- ── 2. hr_state_of — PROJECT `buffs` AS ITS OWN TOP-LEVEL BLOCK ────────────
-- TOP LEVEL, beside `place` / `dungeon_cooldowns` / `renown_high`, and NOT inside
-- `state`: the `state` object is the version-gated authoritative merge the client
-- applies wholesale, and a buff queue is a TIMER — it changes without a version
-- bump (by the clock alone) and the client must be able to re-read it on any
-- envelope without that looking like a conflict. Same posture as
-- dungeon_cooldowns, which is the same kind of fact.
--
-- SHAPE (the step-2 client half reads exactly this):
--   buffs: [ { type, magnitude, until, remaining_ms } ]  ordered by `until`
-- `until` is the authority (absolute ISO-8601, the column's own value) and
-- `remaining_ms` is the SERVER's own subtraction against the SAME now() the
-- envelope reports, so the client renders a countdown without its clock ever
-- being an input. Expired entries are kept with remaining_ms = 0 rather than
-- filtered: the AWAY engine must still see a buff that was alive at the START of
-- the window it is pricing (wall-clock drain pays the slice it was alive for),
-- and a reader that wants only live ones filters on remaining_ms > 0. Filtering
-- here would have silently under-paid every absence that outlived a buff.
-- `[]` on a fresh character, never null.
do $mig$
declare
  v_def text;
  c_anchor constant text := $anc$    'now', now(),$anc$;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'buffs', coalesce($q$) > 0 then
    raise notice 'hr_state_of already projects buffs — patch skipped'; return; end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_state_of `now` anchor did not match exactly once — its shape is not '
                    'the one this file was derived against. Do NOT patch a body you cannot account for.';
  end if;
  v_def := replace(v_def, c_anchor, $new$    'now', now(),
    -- CONSUMABLE BUFFS (2026-09-13). The character's own timed-consumable queue,
    -- written only by hr_apply's buff_apply block from hr_item_buffs + now().
    -- `until` is the authority; `remaining_ms` is the server's own subtraction
    -- against the same now() this envelope reports, so no client clock is ever an
    -- input to how long a buff has left. Ordered by expiry so the soonest is
    -- first. Expired entries are carried with remaining_ms = 0 — the away engine
    -- needs a buff that was alive at the START of the window it prices, and the
    -- renderer filters on remaining_ms > 0.
    'buffs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', e.v->>'type',
               'magnitude', (e.v->>'magnitude')::numeric,
               'until', e.v->>'until',
               'remaining_ms', greatest(0, floor(
                 extract(epoch from ((e.v->>'until')::timestamptz - now())) * 1000))::bigint)
               order by (e.v->>'until')::timestamptz)
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
    ), '[]'::jsonb),$new$);
  execute v_def;
  raise notice 'hr_state_of patched: the envelope projects the buff queue';
end $mig$;
-- create-or-replace preserves an ACL; be explicit anyway (the repo convention is
-- that every restatement re-states the revoke). No client executes it — it takes
-- an ARBITRARY uuid.
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 3. hr_apply — ALLOWLIST + RESOLVE + MERGE + WRITE ──────────────────────
do $mig$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure),
                   chr(13), '');
  if strpos(v_def, $q$p_delta ? 'buff_apply'$q$) > 0 then
    raise notice 'hr_apply already handles buff_apply — patch skipped'; return; end if;

  -- 3a. THE ALLOWLIST. Inserted at the HEAD of the array rather than appended to
  --     its terminator, for the reason 2026-09-06-recovering-until.sql states:
  --     the terminator is whatever the most recent programmatic patcher left
  --     there, and an anchor that moves with every future slice is an anchor that
  --     eventually matches nothing and no-ops IN SILENCE.
  v_def := replace(v_def,
    $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',$anc$,
    $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',
    -- CONSUMABLE BUFFS (2026-09-13): an OBJECT carrying ONE field, `item`. AT
    -- MOST ONE PER APPLY. The type, the magnitude, the duration and the expiry
    -- are resolved at (4a-b) from hr_item_buffs and now(); an object carrying any
    -- other key is REFUSED BY NAME, so there is no representation in which a
    -- client authors a buff's strength or its end. Nothing here moves a
    -- tradeable, rankable or contributable value.
    'buff_apply',$anc$);

  -- 3b. THE RELEASE CODES. Both refusals are answers about the delta and the
  --     LOCKED row, and neither wrote anything (hr_reject raises; the block rolls
  --     back), so releasing the idempotency key is harmless — and withholding it
  --     would brick that key for up to 25 hours. `buff_at_max` in particular MUST
  --     release: the honest client response is "wait for the buff to drain and
  --     eat it later", and that is the same intent with the same key.
  v_def := replace(v_def,
    $anc$  c_release_codes constant text[] := array[$anc$,
    $anc$  c_release_codes constant text[] := array[
    'bad_buff_item', 'buff_at_max',$anc$);

  -- 3c. THE DECLARES + THE CAP. c_buff_max_ms is the SERVER's ceiling on how far
  --     ahead an expiry may be stamped, and it is the whole answer to "eat 400
  --     pies before logging out": sixty minutes of buff is the most a queue can
  --     ever be worth. tools/gen-catalogues.mjs refuses to emit a food longer
  --     than it, so no honest consume is ever clamped to nothing by surprise.
  --     c_buff_scale is the ONE place a future "Feast Mastery" perk would
  --     lengthen a duration; it is 1 in this step and is a SERVER constant, never
  --     a delta field.
  v_def := replace(v_def,
    $anc$  v_fight jsonb;$anc$,
    $anc$  -- CONSUMABLE BUFFS (2026-09-13). Resolved from hr_item_buffs under the
  -- character lock at (4a-b); written in the SET clause. No client value reaches
  -- any of them except the ITEM ID, which is looked up rather than trusted.
  c_buff_max_ms constant bigint  := 3600000;   -- the expiry cap AND the blast radius
  c_buff_scale  constant numeric := 1;         -- duration multiplier (perk hook; 1 today)
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
  v_buff_old    jsonb;
  v_buffs_new   jsonb;
  v_fight jsonb;$anc$);

  -- 3d. THE VALIDATION + RESOLUTION BLOCK, inserted before the worker block —
  --     i.e. AFTER the row is locked (`select * into v_st … for update`) and the
  --     version is checked, so every number below comes from the LOCKED row and
  --     the server clock. Server authority §1: the Edge decides WHAT should
  --     happen, Postgres decides WHETHER IT MAY.
  v_def := replace(v_def,
    $anc$    if p_delta ? 'workers' then$anc$,
    $anc$    -- ── (4a-b) CONSUMABLE BUFFS ─────────────────────────────────────────
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
        perform public.hr_reject('bad_buff_item',
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

      v_buff_now := now();                                    -- SERVER CLOCK, always
      v_buff_cap := v_buff_now + make_interval(secs => c_buff_max_ms / 1000.0);
      -- The LIVE entry of this type on the locked row, if any. `until > now()` so
      -- an expired entry cannot extend anything: a buff that ran out yesterday
      -- must not make today's pie last two hours.
      select e.v into v_buff_old
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
       where e.v->>'type' = v_buff_type
         and (e.v->>'until')::timestamptz > v_buff_now
       order by (e.v->>'until')::timestamptz desc
       limit 1;

      v_buff_base := greatest(v_buff_now,
                              coalesce((v_buff_old->>'until')::timestamptz, v_buff_now));
      -- ⚠ buff_at_max (game-designer, 2026-09-13). If the cap would swallow (all
      --   but a token sliver of) the duration there is nothing worth buying, so
      --   REFUSE the consume instead of eating the item for nothing. A PARTIAL
      --   clamp still applies — a consume that fits most of the way still buys the
      --   minutes that fit; only one that would buy less than
      --   c_buff_min_gain_frac of what it promises is refused. See the declare
      --   block for why this is a FRACTION and not `base >= cap` (that form is
      --   unreachable outside a single transaction, and it was MEASURED as such).
      v_buff_gain := greatest(0, floor(extract(epoch from (v_buff_cap - v_buff_base)) * 1000))::bigint;
      v_buff_need := ceil((v_buff_dur * c_buff_scale) * c_buff_min_gain_frac)::bigint;
      if v_buff_gain < v_buff_need then
        perform public.hr_reject('buff_at_max',
          jsonb_build_object('type', v_buff_type, 'until', v_buff_base,
                             'cap', v_buff_cap, 'max_ms', c_buff_max_ms,
                             'gain_ms', v_buff_gain, 'need_ms', v_buff_need));
      end if;
      v_buff_until := least(v_buff_base
                              + make_interval(secs => (v_buff_dur * c_buff_scale) / 1000.0),
                            v_buff_cap);
      -- MAGNITUDE = max(old, new). Never a sum (two pies would be +4% forever)
      -- and never a replace (a Roasted Carrot must not dilute a Void Banquet).
      v_buff_newmag := greatest(v_buff_mag, coalesce((v_buff_old->>'magnitude')::numeric, 0));
      -- THE MERGED QUEUE: every OTHER type still running, plus this one. Expired
      -- entries of other types are dropped here — pruning on write is what keeps
      -- the column bounded without a sweeper job, and merge-by-type is what keeps
      -- it at one row per type.
      select coalesce(jsonb_agg(e.v order by (e.v->>'until')::timestamptz), '[]'::jsonb)
        into v_buffs_new
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
       where e.v->>'type' <> v_buff_type
         and (e.v->>'until')::timestamptz > v_buff_now;
      v_buffs_new := v_buffs_new || jsonb_build_array(jsonb_build_object(
        'type', v_buff_type,
        'magnitude', v_buff_newmag,
        'until', to_jsonb(v_buff_until)));
    end if;

    if p_delta ? 'workers' then$anc$);

  -- 3e. THE WRITE. ABSOLUTE and WHOLESALE: the block above rebuilt the entire
  --     queue from the locked row, so this is a set, not a merge.
  --     ⚠ AND IT IS DELIBERATELY *NOT* VOIDED BY AN `activity` KEY (unlike
  --       `fight` in the same SET clause). A buff is PERSONAL — something the
  --       player did to their own character — and switching from slimes to fishing
  --       does not un-eat a pie. Voiding here would also mean every away settle
  --       that idles an exhausted node silently ate the player's Feast. §4(c)
  --       asserts the absence, because an absence is not otherwise reviewable.
  v_def := replace(v_def,
    $anc$       set gold = v_new_gold,$anc$,
    $anc$       set gold = v_new_gold,
           -- CONSUMABLE BUFFS (2026-09-13): the queue rebuilt at (4a-b) from the
           -- LOCKED row + the server clock. Absent key = untouched; present = set.
           -- NOT voided by an `activity` key (see 3e).
           buffs = case when p_delta ? 'buff_apply' then v_buffs_new else buffs end,$anc$);

  execute v_def;
  raise notice 'hr_apply patched: buff_apply resolves hr_item_buffs under the lock and merges by type';
end $mig$;
-- create-or-replace preserves an ACL; be explicit anyway. If the browser could
-- call hr_apply it could author its own delta, so this is re-asserted on every
-- toucher.
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
grant  execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 3b. THE OTHER HALF IS A SEPARATE FILE, AND IT IS REQUIRED ─────────────
-- 2026-09-13-client-state-buffs-denylist.sql moves `buffs` onto
-- hr_put_client_state's AUTHORITY deny-list, and src/net/client-state.js drops it
-- from RESIDUE_FIELDS in the same commit. The two MUST ship together: the server
-- refuses the WHOLE patch on a forbidden key, so a build where `buffs` is on both
-- lists stops every residue field from saving for every player.
-- tests/arm-homing-guard.mjs asserts that collision across both migrations.

-- ── 4. SELF-CHECK (§4) — THE LOAD-BEARING PROPERTIES, BY EXECUTION ─────────
-- A migration that cannot prove its own claims is a claim. The text checks below
-- exist only to name WHICH block is missing; every behavioural property is
-- EXECUTED against a fabricated character inside a subtransaction that is
-- discarded by a sentinel raise (HR824), so this block is net-zero on production
-- and CLAUDE.md §2's "player state is never fabricated" is respected — the probe
-- character is a uuid no human owns and it is deleted with the rollback.
do $mig$
declare
  v_apply text; v_state text; v_expr text; v_ok boolean; v_cnt int;
  v_env   jsonb; v_r jsonb; v_row jsonb;
  v_ver   bigint; v_until1 timestamptz; v_until2 timestamptz; v_cap timestamptz;
  v_item  text;  v_item2 text; v_type text; v_type2 text; v_dur bigint;
  v_mag   numeric; v_big text; v_bigmag numeric;
  v_i     int; v_refused text; v_last timestamptz; v_gold bigint;
  v_uid   constant uuid := '000000b0-0000-0000-0000-0000000000b0';
  v_slot  constant int  := 0;
  c_j     constant jsonb := '{"kind":"admin","intent":"consumable-buffs:probe"}'::jsonb;
  c_max   constant bigint := 3600000;
begin
  -- (a) THE COLUMN: present, jsonb, NOT NULL, defaulted to '[]'.
  select count(*) into v_cnt from information_schema.columns
   where table_schema = 'public' and table_name = 'player_state'
     and column_name = 'buffs' and is_nullable = 'NO' and data_type = 'jsonb'
     and column_default like '''[]''%';
  if v_cnt <> 1 then
    raise exception 'buffs self-check (a): player_state.buffs is missing, nullable, not jsonb, or not '
                    'defaulted to ''[]'' (%)', v_cnt;
  end if;
  -- NOBODY WAS GIVEN A BUFF BY THIS MIGRATION. Every existing row reads '[]'.
  select count(*) into v_cnt from public.player_state where buffs <> '[]'::jsonb;
  if v_cnt <> 0 then
    raise exception 'buffs self-check (a): % row(s) start with a non-empty queue — this migration '
                    'fabricated player state', v_cnt;
  end if;
  -- THE CHECK CONSTRAINT BITES, proven by EVALUATING THE INSTALLED EXPRESSION
  -- (not by reading its text, and not by inserting a row — player_state.user_id
  -- carries an FK, so a throwaway row is refused before the CHECK is consulted
  -- and a `when others` would report a widened constraint as working).
  select pg_get_expr(conbin, conrelid) into v_expr from pg_constraint
   where conrelid = 'public.player_state'::regclass and conname = 'player_state_buffs_sane';
  if v_expr is null then
    raise exception 'buffs self-check (a): player_state_buffs_sane is missing'; end if;
  execute format('select (%s)', replace(v_expr, 'buffs', $$('{"a":1}'::jsonb)$$)) into v_ok;
  if v_ok is not false then
    raise exception 'buffs self-check (a): the CHECK admits a non-ARRAY queue (%) — the away replay '
                    'iterates it and would throw mid-absence', v_expr;
  end if;
  -- A BLAST RADIUS EXISTS, without pinning its VALUE here. This file installed 64;
  -- 2026-09-13-buff-segments.sql widens it to 256 because per-segment stacking
  -- makes the honest worst case 8 segments x 9 types = 72, and THAT file asserts
  -- the exact bound (admits 72, refuses 257). Pinning 65 here would make this
  -- re-appliable file fail against the schema its own successor installs — which it
  -- did, and tests/buff-queue.mjs [14] is what caught it. What must hold FOREVER is
  -- that the CHECK is not open-ended.
  execute format('select (%s)',
    replace(v_expr, 'buffs',
            $$(select jsonb_agg(1) from generate_series(1, 10000))$$)) into v_ok;
  if v_ok is not false then
    raise exception 'buffs self-check (a): the CHECK admits an UNBOUNDED queue (%) — a compromised '
                    'writer could park a megabyte in a column the envelope carries on every load', v_expr;
  end if;
  execute format('select (%s)',
    replace(v_expr, 'buffs',
            $$('[{"type":"damage","magnitude":2,"until":"2030-01-01T00:00:00Z"}]'::jsonb)$$)) into v_ok;
  if v_ok is not true then
    raise exception 'buffs self-check (a): the CHECK refuses an HONEST one-entry queue (%) — every '
                    'consume would fail', v_expr;
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_state'::regclass
                    and conname = 'player_state_buffs_sane' and convalidated) then
    raise exception 'buffs self-check (a): player_state_buffs_sane is missing or NOT VALID'; end if;

  v_apply := replace(pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  v_state := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');

  -- (b) ACCEPTED, VALIDATED, WRITTEN, RELEASED — four separate facts. A body that
  --     accepts the key without validating it is worse than one that rejects it,
  --     because it looks like it works.
  if strpos(v_apply, $q$    'buff_apply',$q$) = 0 then
    raise exception 'buffs self-check (b): c_delta_keys does not carry buff_apply — every eat would '
                    '409 unknown_delta_key'; end if;
  if strpos(v_apply, $q$if p_delta ? 'buff_apply' then$q$) = 0
     or strpos(v_apply, 'bad_buff_item') = 0 then
    raise exception 'buffs self-check (b): the (4a-b) validation block is missing'; end if;
  if strpos(v_apply, $q$buffs = case when p_delta ? 'buff_apply'$q$) = 0 then
    raise exception 'buffs self-check (b): the SET clause does not write buffs'; end if;
  -- MEMBERSHIP, not adjacency. This pinned the literal `'bad_buff_item',
  -- 'buff_at_max',` and broke the moment a later file in the same lane inserted a
  -- THIRD buff code between them (2026-09-13-buff-shape-code.sql's
  -- `bad_buff_shape`) — a re-appliable file must assert the PROPERTY, which is
  -- that each code is in the release array, not where its neighbours sit. Caught
  -- by tests/buff-queue.mjs [14], which re-applies this file on a rebuilt chain.
  declare v_rel text;
  begin
    v_rel := substring(v_apply from 'c_release_codes constant text\[\] := array\[([^\]]*)\]');
    if v_rel is null then
      raise exception 'buffs self-check (b): c_release_codes could not be read out of the installed '
                      'body — the release-code assertion did NOT run'; end if;
    if position($q$'bad_buff_item'$q$ in v_rel) = 0 or position($q$'buff_at_max'$q$ in v_rel) = 0 then
      raise exception 'buffs self-check (b): a buff code is not a release code (%) — a refused eat '
                      'would brick its idempotency key for 25h', v_rel;
    end if;
  end;
  -- THE THREE SERVER-SIDE DERIVATIONS, named individually because each is a
  -- different way the client could have been let in.
  if strpos(v_apply, 'from public.hr_item_buffs b where b.item_id = v_buff_item') = 0 then
    raise exception 'buffs self-check (b): the buff is not resolved from hr_item_buffs — it is being '
                    'sourced from somewhere the client can reach'; end if;
  if strpos(v_apply, 'v_buff_now := now();') = 0 then
    raise exception 'buffs self-check (b): the expiry is not stamped from the SERVER clock'; end if;
  if strpos(v_apply, $q$where t.bk <> 'item'$q$) = 0 then
    raise exception 'buffs self-check (b): a buff_apply carrying a forged `until`/`magnitude` key is '
                    'no longer refused BY NAME — "ignored today" is one edit from "read tomorrow"'; end if;
  if strpos(v_apply, 'c_buff_max_ms constant bigint  := 3600000;') = 0 then
    raise exception 'buffs self-check (b): hr_apply does not carry the stated expiry cap'; end if;
  -- THE MINIMUM-GAIN FUSE. Without it buff_at_max is unreachable in production
  -- (the cap moves with now(), so `base >= cap` is never true across two
  -- transactions) and a player at the ceiling eats food for a few milliseconds of
  -- buff. Asserted here by name and by EXECUTION at (f7).
  if strpos(v_apply, 'v_buff_gain < v_buff_need') = 0
     or strpos(v_apply, 'c_buff_min_gain_frac constant numeric := 0.10;') = 0 then
    raise exception 'buffs self-check (b): the minimum-gain fuse is gone — buff_at_max would be '
                    'unreachable outside a single transaction and a consume at the ceiling would be free';
  end if;
  -- NO LEDGER ROW PER BUFF (the game_events mistake at ledger scale). The BUFF
  -- BLOCK ITSELF — the text between its own `if` and the worker block that
  -- follows it, so a neighbouring block's ledger write cannot be mistaken for
  -- this one's — must not insert into player_ledger at all.
  if substring(v_apply
                 from position($q$if p_delta ? 'buff_apply' then$q$ in v_apply)
                 for (position($q$    if p_delta ? 'workers' then$q$ in v_apply)
                      - position($q$if p_delta ? 'buff_apply' then$q$ in v_apply)))
       ~* 'insert into public\.player_ledger' then
    raise exception 'buffs self-check (b): the buff block writes a player_ledger row — a buff moves no '
                    'value and one row per eaten pie is the game_events mistake at ledger scale';
  end if;

  -- (c) THE ABSENCE THAT MATTERS. `buffs` must NOT be voided by an activity key:
  --     a buff is personal, and every away settle that idles an exhausted node
  --     carries `activity` — so a void here would eat the player's Feast on the
  --     most ordinary event in the game.
  if v_apply ~ $q$buffs = case when p_delta \? 'activity'$q$ then
    raise exception 'buffs self-check (c): buffs is voided by an activity switch — switching from '
                    'slimes to fishing would un-eat a pie';
  end if;

  -- (d) THE PROJECTION, and the predecessors it must not have eaten.
  if strpos(v_state, $q$'buffs', coalesce($q$) = 0 then
    raise exception 'buffs self-check (d): hr_state_of does not project buffs — the engine can never '
                    'learn the column exists and the feature is inert'; end if;
  if strpos(v_state, $q$'renown_high', coalesce(v_st.renown_high$q$) = 0
     or strpos(v_state, $q$'dungeon_cooldowns', public.hr_dungeon_cooldowns$q$) = 0
     or strpos(v_state, $q$'place', jsonb_build_object($q$) = 0
     or strpos(v_state, $q$'total_level', public.hr_total_level$q$) = 0
     or strpos(v_state, 'recovering_until') = 0 or strpos(v_state, 'consec_falls') = 0 then
    raise exception 'buffs self-check (d): hr_state_of LOST a projection — the splice was not additive';
  end if;
  if strpos(v_apply, $q$p_delta ? 'workers'$q$) = 0 or strpos(v_apply, $q$p_delta ? 'fight'$q$) = 0
     or strpos(v_apply, $q$p_delta ? 'tool_carry'$q$) = 0
     or strpos(v_apply, $q$p_delta ? 'consec_falls'$q$) = 0
     or strpos(v_apply, 'v_out := public.hr_state_of(v_uid, v_slot);') = 0 then
    raise exception 'buffs self-check (d): hr_apply LOST a block — the patch was not additive';
  end if;

  -- (e) NOTHING BECAME CLIENT-REACHABLE.
  if has_function_privilege('authenticated', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('service_role', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_state_of(uuid,int)', 'execute')
     or has_function_privilege('anon', 'public.hr_state_of(uuid,int)', 'execute') then
    raise exception 'buffs self-check (e): hr_apply / hr_state_of are executable by a client role';
  end if;
  if not has_function_privilege('hr_engine', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or not has_function_privilege('hr_engine', 'public.hr_state_of(uuid,int)', 'execute') then
    raise exception 'buffs self-check (e): hr_engine lost execute on the engine path — the game is dead';
  end if;
  select count(*) into v_cnt from pg_policy
   where polrelid = 'public.player_state'::regclass and polcmd <> 'r';
  if v_cnt <> 0 then
    raise exception 'buffs self-check (e): player_state has a non-read RLS policy — the buff clock '
                    'would be client-authored'; end if;
  select count(*) into v_cnt from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'hr_item_buffs'
     and grantee in ('anon','authenticated','service_role','PUBLIC')
     and privilege_type <> 'SELECT';
  if v_cnt <> 0 then
    raise exception 'buffs self-check (e): a client role holds a WRITE grant on hr_item_buffs — the '
                    'catalogue every buff is priced from would be editable'; end if;

  -- ── (f) EXECUTED. Discarded subtransaction; every number is read back. ────
  begin
    -- The fixture: two DIFFERENT buff types, plus the biggest magnitude of the
    -- first type, all chosen from the catalogue rather than hard-coded so a
    -- balance change cannot make this block vacuous.
    select b.item_id, b.type, b.magnitude, b.duration_ms
      into v_item, v_type, v_mag, v_dur
      from public.hr_item_buffs b order by b.duration_ms desc, b.item_id limit 1;
    select b.item_id, b.type into v_item2, v_type2
      from public.hr_item_buffs b where b.type <> v_type order by b.item_id limit 1;
    select b.item_id, b.magnitude into v_big, v_bigmag
      from public.hr_item_buffs b where b.type = v_type
     order by b.magnitude desc, b.item_id limit 1;
    if v_item is null or v_item2 is null then
      raise exception 'buffs self-check (f): FIXTURE — the catalogue does not carry two distinct buff '
                      'types, so the merge assertions below would prove nothing';
    end if;

    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to)
      values (v_uid, v_slot, 1000, 0, 10, 10, 1, now() - interval '30 minutes')
      on conflict (user_id, slot) do update
        set gold = 1000, version = 1, buffs = '[]'::jsonb;
    -- THE PROBE BAG. Every honest consume below sends `items[<food>] = -1`, because
    -- 2026-09-13-buff-apply-coupling.sql (F3, Security's follow-up) refuses a
    -- buff_apply that is not PAID FOR in the same delta. The debits are harmless on
    -- a body without that coupling — an items delta is an items delta — so this §4
    -- passes both BEFORE and AFTER the coupling lands, which is the property a
    -- re-appliable file needs. (Added after this file was applied to production at
    -- 05:19 UTC; the SELF-CHECK only, no body text changed.)
    insert into public.player_inventory (user_id, slot, item_id, qty)
      select v_uid, v_slot, b.item_id, 500 from public.hr_item_buffs b
      on conflict (user_id, slot, item_id) do update set qty = 500;

    -- (f1) A FRESH CHARACTER PROJECTS AN EMPTY ARRAY — present, never null.
    v_env := public.hr_state_of(v_uid, v_slot);
    if not (v_env ? 'buffs') then
      raise exception 'buffs self-check (f1): the envelope has no buffs key at all'; end if;
    if v_env->'buffs' <> '[]'::jsonb then
      raise exception 'buffs self-check (f1): a fresh character projects % (expected [])', v_env->'buffs';
    end if;

    -- (f2) A FORGED `until` / `magnitude` / `type` IS REFUSED BY NAME, and NOTHING
    --      moves. This is the property the whole file exists for.
    for v_r in select x from jsonb_array_elements(jsonb_build_array(
        jsonb_build_object('item', v_item, 'until', '2099-01-01T00:00:00Z'),
        jsonb_build_object('item', v_item, 'magnitude', 9999),
        jsonb_build_object('item', v_item, 'type', 'damage'),
        jsonb_build_object('item', v_item, 'duration_ms', 86400000))) as t(x)
    loop
      select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
      v_row := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
                               jsonb_build_object('buff_apply', v_r, 'journal', c_j));
      -- EITHER CODE IS A PASS HERE, and the distinction is asserted where it is
      -- owned. This file raised `bad_buff_item` for a forged key;
      -- 2026-09-13-buff-shape-code.sql (Security) splits it into `bad_buff_shape`
      -- so the rejections journal can call an invented field an INCIDENT without
      -- flagging every player who ate a Trout. What THIS file asserts is the
      -- property it installed — the forgery is REFUSED and nothing moves — so it
      -- accepts either name and stays re-appliable against its own successor.
      -- The exact code is pinned by that file's §2 and by tests/buff-queue.mjs [4].
      if coalesce(v_row->>'ok', 'true') <> 'false'
         or v_row->>'error' not in ('bad_buff_item', 'bad_buff_shape') then
        raise exception 'buffs self-check (f2): a buff_apply carrying a forged key (%) was NOT refused '
                        'as bad_buff_item/bad_buff_shape — got %', v_r, v_row;
      end if;
      if (select buffs from public.player_state where user_id = v_uid and slot = v_slot) <> '[]'::jsonb then
        raise exception 'buffs self-check (f2): a REFUSED forged apply moved the queue — the rejection '
                        'must roll the block back, not merely report';
      end if;
    end loop;

    -- (f3) AN UNKNOWN ITEM, A NON-BUFF ITEM, AND A NON-OBJECT ARE ALL REFUSED.
    for v_r in select x from jsonb_array_elements(jsonb_build_array(
        jsonb_build_object('item', 'no_such_item_at_all'),
        jsonb_build_object('item', (select i.item_id from public.hr_items i
                                     where not exists (select 1 from public.hr_item_buffs b
                                                        where b.item_id = i.item_id)
                                     order by i.item_id limit 1)),
        jsonb_build_object('item', 42),
        to_jsonb('a string'::text),
        '[]'::jsonb)) as t(x)
    loop
      select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
      v_row := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
                               jsonb_build_object('buff_apply', v_r, 'journal', c_j));
      if coalesce(v_row->>'ok', 'true') <> 'false' or v_row->>'error' <> 'bad_buff_item' then
        raise exception 'buffs self-check (f3): buff_apply % was not refused as bad_buff_item — got %',
                        v_r, v_row;
      end if;
    end loop;

    -- (f4) A VALID APPLY STAMPS `until` FROM THE SERVER CLOCK, and the projection
    --      carries it with a server-derived remaining_ms.
    select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
    v_cap := now() + make_interval(secs => c_max / 1000.0);
    v_row := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
                             jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                                'items', jsonb_build_object(v_item, -1),
                                                'journal', c_j));
    if coalesce(v_row->>'ok', 'false') <> 'true' then
      raise exception 'buffs self-check (f4): an honest buff_apply was refused: %', v_row; end if;
    select (e.v->>'until')::timestamptz into v_until1
      from public.player_state ps, jsonb_array_elements(ps.buffs) as e(v)
     where ps.user_id = v_uid and ps.slot = v_slot and e.v->>'type' = v_type;
    if v_until1 is null then
      raise exception 'buffs self-check (f4): the queue holds no % entry after a valid apply', v_type; end if;
    if v_until1 <= now() or v_until1 > v_cap then
      raise exception 'buffs self-check (f4): until = % is not inside (now, now+cap] — the expiry is '
                      'not being stamped from the server clock', v_until1;
    end if;
    if abs(extract(epoch from (v_until1 - now())) * 1000 - v_dur) > 5000 then
      raise exception 'buffs self-check (f4): until is % ms out from the catalogue duration of % ms',
                      extract(epoch from (v_until1 - now())) * 1000 - v_dur, v_dur;
    end if;
    -- The envelope: one entry, with the authority AND the server''s own countdown.
    v_env := public.hr_state_of(v_uid, v_slot);
    if jsonb_array_length(v_env->'buffs') <> 1 then
      raise exception 'buffs self-check (f4): the envelope projects % entries (expected 1): %',
                      jsonb_array_length(v_env->'buffs'), v_env->'buffs'; end if;
    if (v_env->'buffs'->0->>'type') <> v_type
       or ((v_env->'buffs'->0->>'remaining_ms')::bigint) <= 0
       or (v_env->'buffs'->0->>'until') is null
       or (v_env->'buffs'->0->>'magnitude') is null then
      raise exception 'buffs self-check (f4): the projected entry is malformed: %', v_env->'buffs'->0;
    end if;

    -- (f5) REPLAYING THE SAME INTENT BUFFS ONCE. Idempotency is a requirement,
    --      not polish: a client retry after a dropped response must not double a
    --      buff''s tail.
    select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
    declare v_key uuid := gen_random_uuid();
    begin
      v_row := public.hr_apply(v_uid, v_slot, v_ver, v_key,
                               jsonb_build_object('buff_apply', jsonb_build_object('item', v_item2),
                                                  'items', jsonb_build_object(v_item2, -1),
                                                  'journal', c_j));
      if coalesce(v_row->>'ok', 'false') <> 'true' then
        raise exception 'buffs self-check (f5): the second-type apply was refused: %', v_row; end if;
      select (e.v->>'until')::timestamptz into v_until2
        from public.player_state ps, jsonb_array_elements(ps.buffs) as e(v)
       where ps.user_id = v_uid and ps.slot = v_slot and e.v->>'type' = v_type2;
      -- the SAME key again, with the SAME (stale) version
      v_row := public.hr_apply(v_uid, v_slot, v_ver, v_key,
                               jsonb_build_object('buff_apply', jsonb_build_object('item', v_item2),
                                                  'items', jsonb_build_object(v_item2, -1),
                                                  'journal', c_j));
      if coalesce(v_row->>'replayed', 'false') <> 'true' then
        raise exception 'buffs self-check (f5): a repeated intent_id was not answered as a REPLAY: %', v_row;
      end if;
      if (select (e.v->>'until')::timestamptz
            from public.player_state ps, jsonb_array_elements(ps.buffs) as e(v)
           where ps.user_id = v_uid and ps.slot = v_slot and e.v->>'type' = v_type2) <> v_until2 then
        raise exception 'buffs self-check (f5): a REPLAYED intent extended the buff — the same eaten '
                        'pie was paid twice';
      end if;
    end;
    -- …and the first type survived the second type''s apply (merge, not replace).
    if (select count(*) from public.player_state ps, jsonb_array_elements(ps.buffs) as e(v)
         where ps.user_id = v_uid and ps.slot = v_slot) <> 2 then
      raise exception 'buffs self-check (f5): the queue does not hold BOTH types — a second buff '
                      'replaced the first instead of joining it';
    end if;

    -- (f6) MERGE BY TYPE: magnitude = max(old,new), until EXTENDS, one row per type.
    if v_bigmag > v_mag then
      select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
      v_row := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
                               jsonb_build_object('buff_apply', jsonb_build_object('item', v_big),
                                                  'items', jsonb_build_object(v_big, -1),
                                                  'journal', c_j));
      if coalesce(v_row->>'ok', 'false') <> 'true' then
        raise exception 'buffs self-check (f6): the stronger same-type apply was refused: %', v_row; end if;
      if (select count(*) from public.player_state ps, jsonb_array_elements(ps.buffs) as e(v)
           where ps.user_id = v_uid and ps.slot = v_slot and e.v->>'type' = v_type) <> 1 then
        raise exception 'buffs self-check (f6): the same type now occupies more than one row — the '
                        'merge is an append';
      end if;
      if (select (e.v->>'magnitude')::numeric
            from public.player_state ps, jsonb_array_elements(ps.buffs) as e(v)
           where ps.user_id = v_uid and ps.slot = v_slot and e.v->>'type' = v_type) <> v_bigmag then
        raise exception 'buffs self-check (f6): magnitude is not max(old,new)';
      end if;
      if (select (e.v->>'until')::timestamptz
            from public.player_state ps, jsonb_array_elements(ps.buffs) as e(v)
           where ps.user_id = v_uid and ps.slot = v_slot and e.v->>'type' = v_type) <= v_until1 then
        raise exception 'buffs self-check (f6): a second helping did not EXTEND the tail';
      end if;
    else
      raise notice 'buffs self-check (f6): SKIPPED — no stronger same-type food exists in the '
                   'catalogue (max magnitude for % is %)', v_type, v_mag;
    end if;

    -- (f7) THE CAP: a PARTIAL clamp applies and lands exactly on the cap; a TOTAL
    --      clamp REFUSES with buff_at_max and debits nothing (designer ruling).
    v_refused := null;
    for v_i in 1..200 loop
      select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
      select gold into v_gold from public.player_state where user_id = v_uid and slot = v_slot;
      v_row := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
                               jsonb_build_object('buff_apply', jsonb_build_object('item', v_item),
                                                  'items', jsonb_build_object(v_item, -1),
                                                  'gold', -1, 'journal', c_j));
      if coalesce(v_row->>'ok', 'false') = 'true' then
        select (e.v->>'until')::timestamptz into v_last
          from public.player_state ps, jsonb_array_elements(ps.buffs) as e(v)
         where ps.user_id = v_uid and ps.slot = v_slot and e.v->>'type' = v_type;
        if v_last > now() + make_interval(secs => c_max / 1000.0) + interval '2 seconds' then
          raise exception 'buffs self-check (f7): until ran PAST the cap (% vs cap %)',
                          v_last, now() + make_interval(secs => c_max / 1000.0);
        end if;
      else
        v_refused := v_row->>'error';
        -- THE REFUSAL DEBITED NOTHING. The same delta carried a gold cost, which
        -- is the step-2 eat path''s shape (an item leaves the bag), so this is the
        -- assertion that a buff_at_max does not eat the food for nothing.
        if (select gold from public.player_state where user_id = v_uid and slot = v_slot) <> v_gold then
          raise exception 'buffs self-check (f7): a buff_at_max refusal still moved gold — the whole '
                          'block must roll back or the player pays for nothing';
        end if;
        exit;
      end if;
    end loop;
    if v_refused is distinct from 'buff_at_max' then
      raise exception 'buffs self-check (f7): repeated consumes never hit the cap (last refusal %) — '
                      'either the clamp is missing or the fixture cannot reach it in 200 applies',
                      coalesce(v_refused, '<none>');
    end if;
    -- The last SUCCESSFUL stamp must sit exactly on the cap (the partial clamp),
    -- within a couple of seconds of clock drift across the loop.
    if v_last is null
       or abs(extract(epoch from (v_last - (now() + make_interval(secs => c_max / 1000.0))))) > 5 then
      raise exception 'buffs self-check (f7): the partial clamp did not land on the cap (last until %, '
                      'cap %)', v_last, now() + make_interval(secs => c_max / 1000.0);
    end if;

    -- (f8) AN ACTIVITY SWITCH DOES NOT UN-EAT THE QUEUE (the (c) absence, executed).
    select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
    v_row := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
                             jsonb_build_object('activity', jsonb_build_object('kind', 'idle', 'id', null),
                                                'journal', c_j));
    if coalesce(v_row->>'ok', 'false') <> 'true' then
      raise exception 'buffs self-check (f8): an activity delta was refused: %', v_row; end if;
    if (select count(*) from public.player_state ps, jsonb_array_elements(ps.buffs) as e(v)
         where ps.user_id = v_uid and ps.slot = v_slot) < 1 then
      raise exception 'buffs self-check (f8): an activity switch EMPTIED the buff queue';
    end if;

    -- (f9) NO LEDGER ROW WAS WRITTEN FOR A BUFF. Every apply above carried a
    --      journal, so the ledger holds the apply rows; none may be a buff row.
    if exists (select 1 from public.player_ledger
                where user_id = v_uid and intent in ('buff', 'buff_apply')) then
      raise exception 'buffs self-check (f9): a buff wrote its own ledger row — one row per eaten pie '
                      'is the game_events mistake at ledger scale';
    end if;

    raise exception using errcode = 'HR824', message = 'consumable-buffs §4(f) complete — rolling back';
  exception when sqlstate 'HR824' then null;
  end;

  -- NET-ZERO ON PRODUCTION, checked against every table the probe touched.
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'buffs self-check: §4(f) LEAKED a probe row'; end if;

  raise notice 'consumable-buffs self-check PASSED: player_state.buffs is a not-null jsonb array '
               'defaulting to [] with a VALIDATED check that was FIRED and bit; every existing row '
               'reads [] (no player state fabricated); buff_apply is allowlisted, resolved from '
               'hr_item_buffs under the lock, stamped from the server clock, merged by type with '
               'magnitude = max(old,new) and an extending tail, clamped to the 60-minute cap, refused '
               'as buff_at_max when the cap would swallow the whole duration (debiting nothing), '
               'refused BY NAME for a forged until/magnitude/type/duration key, refused for an '
               'unknown or non-buff item, idempotent under a replayed intent_id, NOT voided by an '
               'activity switch, journalled by no extra ledger row, projected top-level with a '
               'server-derived remaining_ms, and reachable by no client role';
end $mig$;

