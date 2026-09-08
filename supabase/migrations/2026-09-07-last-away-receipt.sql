-- RESTATEMENT-DEBT-ACK: applied to production 2026-09-07 18:30 UTC (Security GO F1–F5) as anchored patches on hr_apply (depth 10 → 11) and hr_state_of (depth 12 → 13); authored before tests/patch-chain-guard.mjs existed. A restatement of either body is cleanup slice 7's first target; this header changes no function body (live-hash bodies unchanged).
-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-07-last-away-receipt.sql — THE AWAY RECEIPT THE SERVER PAID FOR
--                                    AND THEN FORGOT.
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. The Coordinator applies this by hand
--     (`node tools/apply-migration.mjs supabase/migrations/2026-09-07-last-away-receipt.sql`,
--     ONE file, ONE transaction) after the Security review. It adds ONE nullable
--     column, ONE allowlisted engine-only delta key and ONE projection. It adds
--     no client grant, no client policy, no new RPC and no new ledger row.
--
--   Companion engine:  supabase/functions/hr-accrue/index.ts  (attaches
--                      `delta.last_away_receipt` on AWAY-classified settles ONLY)
--                      — EDGE REDEPLOY REQUIRED, and the edge half must not ship
--                      before this file is applied (an unknown delta key is a
--                      REJECTION, not an ignore: every away settle would 409).
--   Companion client:  src/net/accrue.js reconcileAwayReceipt (boot seed only)
--   Companion guard:   tests/away-receipt-journal.mjs (--selftest)
--
-- ⚠ AFTER APPLYING: hr_apply and hr_state_of are LIVE-HASH-TRACKED bodies
--   (tests/live-hash-drift.baseline.json). This file patches BOTH
--   PROGRAMMATICALLY, so both md5s move and the Coordinator MUST re-seed with
--     node tests/live-hash-drift.mjs --live --write
--   and then FILL the `why` REVIEW placeholders. It carries no literal
--   `create or replace function public.hr_apply(` header, so it takes over no
--   last-toucher role; it joins `touched_by` only.
--
-- ── THE RULING (Principal Game Designer, 2026-09-07) ────────────────────────
-- THE REALM KEEPS THE LAST AWAY-CLASSIFIED RECEIPT. A receipt the server PAID
-- is progression, not preference: it is the only statement of what happened to
-- the character while nobody was watching, and it is the answer to the support
-- question "where did my Cooked Shark stack go / why am I on 40% HP".
--
-- ── WHAT IS BROKEN TODAY, STATED AS MEASURED ────────────────────────────────
-- `G.lastOfflineSummary` is the ONLY copy of the away receipt, and it is a
-- NO_SYNC field (src/net/events.js:93 — "transient UI / derived"). So it lives
-- for exactly one page life. Reload once and the Home "While you were away"
-- card, the welcome-back modal (legacy.js:14291) and the combat-screen recap
-- (combat-screens.js:309) all render nothing — for a night the server has
-- already paid, journalled and banked. The player is told nothing about twelve
-- hours of their own game.
--
-- This is the residue class stated in CLAUDE.md §6 pointed the other way:
-- "Anything a player would miss after a reload must live in a server column/row
-- and be projected — not added to the residue as a shortcut." The receipt
-- CANNOT go in the residue: the residue is client-authored, and a client that
-- can author its own away receipt can author "+9,999,999 gold while you were
-- away" onto its own Home screen. The server states it or nobody does.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
--
-- COLUMN   public.player_state.last_away_receipt  jsonb  NULL, no default.
--          Per (user_id, slot) — the receipt is a CHARACTER's night, not an
--          account's, and a slot switch must never show another hero's death.
--          Nullable with no default so "this database predates the receipt" and
--          "this character has never been away" are the same honest silence,
--          and neither is a fabricated night.
--
-- DELTA    `last_away_receipt` — ENGINE-ONLY, like tool_carry / fight /
--   KEY    recovering_until. It is not on any client RPC surface; the only
--          caller that can reach hr_apply is the hr_engine role, and the only
--          code that runs as hr_engine is the Edge Function. ABSOLUTE, not a
--          delta: absent = untouched, present = SET (including to an explicit
--          `null` void). Written ~ONCE PER SESSION — never on the 90 s settle
--          cadence — which is the whole reason this is a COLUMN and not a table
--          (journal rule 6, the game_events lesson: 1.6M rows / 229 MB from six
--          players in four days by writing a row per event).
--
-- VALIDATION (all of it re-derived server-side; nothing is taken on the
--             engine's word — architectural law 1, "Edge decides WHAT should
--             happen, Postgres decides WHETHER IT MAY"):
--   V1  jsonb OBJECT, or an explicit null void. Anything else -> bad_receipt.
--   V2  pg_column_size <= 2048 bytes. A blast radius, not a balance number: it
--       is what stops a compromised engine parking a megabyte of text in a
--       column every player's boot envelope carries.
--   V3  KEYS ARE AN ALLOWLIST of nineteen. An unknown key is REFUSED, never
--       stripped: silently repairing an impossible value is how a compromised
--       engine's bug becomes the server's opinion (the bad_tool_carry posture).
--   V4  Every numeric field is a jsonb `number`, >= 0, and under its own
--       ceiling. (JSON cannot express NaN or Infinity, so "a number" IS finite;
--       the ceiling is the part that has to be checked.)
--   V5  Every string field is a string or null and <= 64 chars. A stop is a
--       STRING OR IT IS NOTHING — the same rule index.ts and summaryFromAway
--       already state, restated here because the server is the last word.
--   V6  `recoverLadder` <= 24 entries (c_max_death_rows, the same bound the
--       death ledger is held to), each in [0, 4,200,000] (c_max_recover_ms).
--   V7  `xp` / `items` are flat objects of <= 64 numeric entries. `items` is
--       SIGNED (auto-eat debits food); `xp` is not.
--   V8  THE WINDOW. `grantMs`, `awayMs` and `paidMs` may not exceed the window
--       this delta accompanies, and `paidMs` <= `awayMs`.
--
--       ⚠ HOW hr_apply KNOWS THE WINDOW, precisely. At the top of the write
--         block it has already done
--             select * into v_st from public.player_state
--               where user_id = v_uid and slot = v_slot for update;
--         (the effective body's line ~428). `v_st.accrued_to` is therefore the
--         OLD watermark — the instant the server had last PAID this character up
--         to — READ UNDER THE ROW LOCK, so no concurrent settle can move it
--         underneath this check. The widest window any delta applied in this
--         call can possibly be crediting is
--             now() - v_st.accrued_to
--         because hr_apply itself clamps the NEW watermark into
--         [v_st.accrued_to, now()] a few dozen lines below (`v_accrued := least(
--         now(), greatest(v_st.accrued_to, v_accrued))`). Both ends are SERVER
--         values: one from the locked row, one from now(). No client or engine
--         number enters the bound. A minute of slack is allowed for the gap
--         between the engine reading the row and this statement committing.
--
--         Consequence, and it is the point: a receipt claiming "you were away
--         for nine hours" cannot be written against a ninety-second window. The
--         card can never narrate a night that did not elapse.
--
--   V9  IT MUST ACCOMPANY AN ACCRUAL. `last_away_receipt` without `accrued_to`
--       is refused — a delta that does not move the watermark has no window for
--       V8 to bound against, and a receipt for a window nobody paid is exactly
--       the "no renderer can invent a bonus that was not applied" clause.
--   V10 IT MUST CLASSIFY AS AWAY, AND THE SERVER DECIDES THAT, NOT THE EDGE.
--       `awayMs >= 600,000` (SYNC_MAX_MS, src/net/accrue.js:3545 — the one
--       classifier, mirrored here) OR the night carried a death (`died` true or
--       `deaths >= 1`, the b343 rule that a death always speaks). A SYNC-SIZED
--       receipt is REFUSED. Both sides are asserted: §4(e) proves the server
--       refuses it, tests/away-receipt-journal.mjs proves the edge does not send
--       it. Neither half is trusted to be the only one.
--   V11 `gold` MAY NOT EXCEED WHAT THIS APPLY ACTUALLY MOVED. The receipt is a
--       statement about the delta it rides on; a card that could claim more gold
--       than hr_apply credited is a player-facing lie with a number on it.
--       (`xp`/`items` are per-key maps and are held to hr_apply's own per-call
--       clamps instead — the tie that matters for honesty is the headline.)
--
-- RELEASE CODE  `bad_receipt` joins version_conflict / bad_recovering /
--   POSTURE     bad_deaths on the intent-key RELEASE list. It is a SHAPE
--               refusal whose answer depends on nothing but the delta, so
--               releasing the claimed key is harmless (the block rolled back)
--               and withholding it would brick that key for up to 25 hours over
--               an engine bug a redeploy fixes.
--
-- NOT DEGRADABLE, AND IT DOES NOT NEED TO BE. index.ts recomputes the
-- classification on EVERY degrade attempt, so a halved span that drops under
-- SYNC_MAX_MS simply omits the key rather than 409ing a night — the receipt is
-- the first thing to go, which is the correct order (pay the player, then tell
-- them). Adding `bad_receipt` to DEGRADABLE would be wrong: shortening the span
-- cannot fix a malformed object.
--
-- PROJECTION  hr_state_of gains `state.last_away_receipt`, RAW. Not translated,
--             not merged, not defaulted: the client's `summaryFromAway` is the
--             ONE translator (src/net/accrue.js:3354) and a second one on the
--             SQL side would be the two-copies-of-the-game-data mistake in
--             another costume. hr_state_of is per-(user, slot) throughout, so
--             the projection is per-user and per-character by construction.
--
-- COST AT 100x PLAYERS. Zero new rows. One jsonb column, <= 2 KB hard-bounded,
-- realistically ~400 bytes, on a table that already has one row per character:
-- 600 characters today -> ~240 KB; 60,000 characters -> ~24 MB, TOAST-eligible.
-- Writes: ~1 per session per character, not 40/hour. Reads: it rides an envelope
-- hr_state_of already builds. Compare the alternative that was NOT chosen — an
-- append-only `away_receipts` table — which at one row per session per character
-- is the game_events curve again with a longer fuse.
--
-- REVERSIBILITY. `alter table public.player_state drop column last_away_receipt;`
-- plus re-applying the previous hr_apply / hr_state_of bodies. The column is
-- nullable with no default and nothing reads it as authority: dropping it
-- degrades the Home card to today's behaviour (silence after a reload) and
-- costs no progression, because the receipt DESCRIBES value that was moved by
-- other keys in the same delta and never moves any itself.
--
-- Governing rules: CLAUDE.md §1 (server authority), §6 (persistence), §4
-- (testing). House pattern: 2026-08-08-clan-seat.sql, and the programmatic
-- hr_apply patch shape of 2026-09-06-recovering-until.sql.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS ────────────────────────────────────────────────────────
-- Measured, never assumed. A migration that no-ops because its target is absent
-- is a migration that reports success for work it did not do.
do $mig$
begin
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null then
    raise exception 'hr_apply is missing - apply 2026-08-11-apply-engine.sql first';
  end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_state_of is missing - apply 2026-08-11-apply-engine.sql first';
  end if;
  -- The predecessor this file's anchors sit inside. Without it every replace()
  -- below matches nothing and this migration applies as a silent no-op.
  if strpos(pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure),
            'recovering_until') = 0 then
    raise exception 'hr_apply predates 2026-09-06-recovering-until.sql - apply that first (this file anchors on it)';
  end if;
end $mig$;

-- ── 1. THE COLUMN ───────────────────────────────────────────────────────────
-- NULLABLE, NO DEFAULT. `null` = "this character has no away receipt", which is
-- the truthful state of every character until the first absence and is exactly
-- what a fresh hero should show: nothing. A default would be a fabricated night.
alter table public.player_state
  add column if not exists last_away_receipt jsonb;

-- A structural bound as well as a procedural one. V2 in hr_apply is the door;
-- this is the wall, and it holds even if a future migration restates hr_apply
-- from a stale template and loses the check. 2048 bytes is the same number.
do $mig$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_state'::regclass
                    and conname = 'player_state_last_away_receipt_bounded') then
    alter table public.player_state
      add constraint player_state_last_away_receipt_bounded
      check (last_away_receipt is null
             or (jsonb_typeof(last_away_receipt) = 'object'
                 and pg_column_size(last_away_receipt) <= 2048))
      not valid;
    -- NOT VALID then VALIDATE: the validate takes only a SHARE UPDATE EXCLUSIVE
    -- lock and every existing row is NULL anyway, so this cannot block a live
    -- settle for longer than the scan.
    alter table public.player_state
      validate constraint player_state_last_away_receipt_bounded;
  end if;
end $mig$;

-- ── 2. hr_state_of — PROJECT THE RECEIPT (programmatic, additive) ───────────
-- RAW. The client's summaryFromAway is the one translator; a second one here
-- would be a second opinion about a night that is already settled.
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  if strpos(v_def, 'last_away_receipt') > 0 then
    raise notice 'hr_state_of already projects last_away_receipt - skipping';
  else
    v_def := replace(v_def,
      $anc$      'recovering_until', v_st.recovering_until,$anc$,
      $anc$      'recovering_until', v_st.recovering_until,
      -- THE LAST AWAY-CLASSIFIED RECEIPT (2026-09-07 ruling). Projected RAW and
      -- FLAT, like every other watermark on this envelope. NULL means "this
      -- character has never been away"; an ABSENT KEY means "this database
      -- predates the receipt" - and the client distinguishes those two by
      -- PRESENCE, never by coalescing, so an older deployment renders silence
      -- rather than a fabricated empty night.
      'last_away_receipt', v_st.last_away_receipt,$anc$);
    execute v_def;
  end if;
end $mig$;

-- ── 3. hr_apply — ALLOWLIST + VALIDATE + WRITE (programmatic, additive) ─────
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure);
  if strpos(v_def, 'last_away_receipt') > 0 then
    raise notice 'hr_apply already handles last_away_receipt - skipping';
  else
    -- 3a. THE ALLOWLIST. Inserted at the HEAD of the array, never appended to
    --     its terminator: the terminator is whatever the most recent
    --     programmatic patcher left there, and an anchor that moves with every
    --     slice is an anchor that eventually matches nothing in silence.
    v_def := replace(v_def,
      $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',$anc$,
      $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',
    -- 2026-09-07 ruling: THE LAST AWAY-CLASSIFIED RECEIPT. An ABSOLUTE jsonb
    -- object, or an explicit null VOID. ENGINE OUTPUT, never client input:
    -- validated at (4a-r) below against the LOCKED row and the server clock,
    -- and written in the SET clause. It moves NO VALUE - it DESCRIBES the value
    -- the rest of this same delta moved - so it enters no conservation sum.
    'last_away_receipt',$anc$);

    -- 3b. THE RELEASE CODE. A shape refusal, so it takes the bad_fight /
    --     bad_recovering posture: release the claimed key.
    v_def := replace(v_def,
      $anc$'bad_recovering', 'bad_deaths',$anc$,
      $anc$'bad_recovering', 'bad_deaths', 'bad_receipt',$anc$);

    -- 3c. THE DECLARES AND THE BLAST RADII. Every one of these is a blast
    --     radius, not a balance number: it is what a COMPROMISED ENGINE is
    --     bounded to, not what an honest night is expected to produce.
    v_def := replace(v_def,
      $anc$  v_fight jsonb;$anc$,
      $anc$  -- 2026-09-07 ruling: the validated away receipt. NULL here means either
  -- "the key was absent" or "the key was an explicit void"; the SET clause tells
  -- those apart with `p_delta ? 'last_away_receipt'`, never with this variable.
  v_receipt jsonb;
  v_rkey text;
  v_rval jsonb;
  -- The window this delta may credit, in ms, derived from the LOCKED row
  -- (v_st.accrued_to) and now(). See V8 in the header.
  v_window_ms bigint;
  -- 2 KB. Enough for nineteen fields plus a modest xp/items map; nothing like a
  -- place to park text in an envelope every boot carries.
  c_max_receipt_bytes constant int := 2048;
  -- SYNC_MAX_MS, mirrored from src/net/accrue.js:3545. The classifier lives in
  -- one place on each side and the server's copy is the one that decides.
  c_sync_max_ms constant bigint := 600000;
  -- A minute of slack between the engine reading the row and this statement
  -- committing. Not a balance number; the honest span is bounded by the window.
  c_receipt_slack_ms constant bigint := 60000;
  -- Blast radii on the counts. Nothing an honest night approaches.
  c_max_receipt_count constant bigint := 100000000;
  c_max_receipt_keys constant int := 64;
  c_receipt_keys constant text[] := array[
    -- the span, as three separate honest numbers (grantMs = paid window,
    -- awayMs = credited span, paidMs = the part of it that actually earned)
    'grantMs','awayMs','paidMs','at',
    -- the credited totals the card prints
    'gold','xp','items','kills','crits',
    -- why the run ended before the absence did
    'burnt','stoppedBy','stoppedById','stoppedSkill','stoppedPerHour',
    -- death, and why nothing healed them
    'died','diedTo','deaths','recoverMs','recoverLadder','foodEaten','autoEat',
    -- what the night was priced at
    'blessed','featuredMs'];
  c_receipt_ms_keys constant text[] := array['grantMs','awayMs','paidMs'];
  c_receipt_count_keys constant text[] := array[
    'gold','kills','crits','burnt','stoppedPerHour','foodEaten','featuredMs','recoverMs'];
  c_receipt_str_keys constant text[] := array['stoppedBy','stoppedById','stoppedSkill','diedTo'];
  c_receipt_bool_keys constant text[] := array['died','blessed'];
  -- autoEat is an OBJECT, not a boolean - see the (V7b) block.
  c_receipt_autoeat_keys constant text[] := array['enabled','pct','hadFood'];
  v_fight jsonb;$anc$);

    -- 3d. THE VALIDATION BLOCK (4a-r), inserted before the worker block - i.e.
    --     AFTER the `select * into v_st ... for update`, which is what makes
    --     v_st.accrued_to a locked read rather than a racy one.
    v_def := replace(v_def,
      $anc$    if p_delta ? 'workers' then$anc$,
      $anc$    -- (4a-r) THE LAST AWAY-CLASSIFIED RECEIPT (2026-09-07 ruling).
    -- A receipt the server PAID is progression, not preference: it is the only
    -- statement of what happened to this character while nobody was watching,
    -- and G.lastOfflineSummary (the only copy today) is a NO_SYNC field that
    -- dies on reload. Every rule below is re-derived from the LOCKED player_state
    -- row and now(); not one number is taken on the engine's word.
    if p_delta ? 'last_away_receipt' then
      if jsonb_typeof(p_delta->'last_away_receipt') = 'null' then
        -- The explicit VOID: "this character has no away receipt". Sent when a
        -- receipt is deliberately cleared; an honest statement, not an absence.
        v_receipt := null;
      elsif jsonb_typeof(p_delta->'last_away_receipt') <> 'object' then
        perform public.hr_reject('bad_receipt',
          jsonb_build_object('why', 'not an object',
                             'type', jsonb_typeof(p_delta->'last_away_receipt')));
      else
        v_receipt := p_delta->'last_away_receipt';
        -- (V2) SIZE. The door; the table constraint is the wall.
        if pg_column_size(v_receipt) > c_max_receipt_bytes then
          perform public.hr_reject('bad_receipt',
            jsonb_build_object('why', 'too large', 'bytes', pg_column_size(v_receipt),
                               'limit', c_max_receipt_bytes));
        end if;
        -- (V3) KEYS. REFUSED, never stripped: quietly repairing an impossible
        -- object is how a compromised engine's bug becomes the server's opinion.
        for v_rkey in select t.rk from jsonb_object_keys(v_receipt) as t(rk) loop
          if not (v_rkey = any(c_receipt_keys)) then
            perform public.hr_reject('bad_receipt',
              jsonb_build_object('why', 'unknown key', 'key', left(v_rkey, 64)));
          end if;
        end loop;
        -- (V4) NUMBERS. A jsonb `number` cannot be NaN or Infinity, so the type
        -- test IS the finiteness test; the ceiling is the part that has to be
        -- checked. Everything here is non-negative - a negative count on a
        -- receipt is a renderer printing a refund that never happened.
        foreach v_rkey in array (c_receipt_ms_keys || c_receipt_count_keys || array['deaths','at']) loop
          if v_receipt ? v_rkey then
            if jsonb_typeof(v_receipt->v_rkey) <> 'number' then
              perform public.hr_reject('bad_receipt',
                jsonb_build_object('why', 'not a number', 'key', v_rkey,
                                   'type', jsonb_typeof(v_receipt->v_rkey)));
            end if;
            if (v_receipt->>v_rkey)::numeric < 0 then
              perform public.hr_reject('bad_receipt',
                jsonb_build_object('why', 'negative', 'key', v_rkey, 'value', v_receipt->v_rkey));
            end if;
          end if;
        end loop;
        foreach v_rkey in array c_receipt_count_keys loop
          if coalesce((v_receipt->>v_rkey)::numeric, 0) > c_max_receipt_count then
            perform public.hr_reject('bad_receipt',
              jsonb_build_object('why', 'count out of range', 'key', v_rkey,
                                 'value', v_receipt->v_rkey, 'limit', c_max_receipt_count));
          end if;
        end loop;
        -- Deaths are bounded by the SAME cap the death ledger is (c_max_death_rows):
        -- the recovery ladder doubles to a 64-minute cap, so a twelve-hour night
        -- cannot hold more falls than that, and a receipt claiming otherwise is
        -- describing a night the simulation cannot produce.
        if coalesce((v_receipt->>'deaths')::bigint, 0) > c_max_death_rows then
          perform public.hr_reject('bad_receipt',
            jsonb_build_object('why', 'too many deaths', 'n', v_receipt->'deaths',
                               'limit', c_max_death_rows));
        end if;
        -- (V5) STRINGS. A STOP IS A STRING OR IT IS NOTHING: a non-string truthy
        -- value reaches a renderer as "something stopped" with nothing to say
        -- about it, which is worse than silence.
        foreach v_rkey in array c_receipt_str_keys loop
          if v_receipt ? v_rkey then
            if jsonb_typeof(v_receipt->v_rkey) not in ('string', 'null') then
              perform public.hr_reject('bad_receipt',
                jsonb_build_object('why', 'not a string', 'key', v_rkey,
                                   'type', jsonb_typeof(v_receipt->v_rkey)));
            end if;
            if length(coalesce(v_receipt->>v_rkey, '')) > 64 then
              perform public.hr_reject('bad_receipt',
                jsonb_build_object('why', 'string too long', 'key', v_rkey));
            end if;
          end if;
        end loop;
        foreach v_rkey in array c_receipt_bool_keys loop
          if v_receipt ? v_rkey and jsonb_typeof(v_receipt->v_rkey) <> 'boolean' then
            perform public.hr_reject('bad_receipt',
              jsonb_build_object('why', 'not a boolean', 'key', v_rkey,
                                 'type', jsonb_typeof(v_receipt->v_rkey)));
          end if;
        end loop;
        -- (V6) THE RECOVERY LADDER, AS CHARGED. One entry per fall, held to the
        -- same two bounds the ladder itself is: at most c_max_death_rows entries,
        -- each within the recovery blast radius.
        if v_receipt ? 'recoverLadder' then
          if jsonb_typeof(v_receipt->'recoverLadder') <> 'array' then
            perform public.hr_reject('bad_receipt', jsonb_build_object('why', 'recoverLadder not an array'));
          end if;
          if jsonb_array_length(v_receipt->'recoverLadder') > c_max_death_rows then
            perform public.hr_reject('bad_receipt',
              jsonb_build_object('why', 'recoverLadder too long',
                                 'n', jsonb_array_length(v_receipt->'recoverLadder')));
          end if;
          for v_rval in select t.rv from jsonb_array_elements(v_receipt->'recoverLadder') as t(rv) loop
            if jsonb_typeof(v_rval) <> 'number'
               or (v_rval#>>'{}')::numeric < 0
               or (v_rval#>>'{}')::numeric > c_max_recover_ms then
              perform public.hr_reject('bad_receipt',
                jsonb_build_object('why', 'recoverLadder rung out of range', 'rung', v_rval));
            end if;
          end loop;
        end if;
        -- (V7) THE CREDITED MAPS. Flat, bounded, numeric. `items` is SIGNED
        -- (auto-eat debits the food it ate); `xp` is not.
        foreach v_rkey in array array['xp','items'] loop
          if v_receipt ? v_rkey then
            if jsonb_typeof(v_receipt->v_rkey) <> 'object' then
              perform public.hr_reject('bad_receipt',
                jsonb_build_object('why', 'not an object', 'key', v_rkey));
            end if;
            if (select count(*) from jsonb_object_keys(v_receipt->v_rkey) as t(rk)) > c_max_receipt_keys then
              perform public.hr_reject('bad_receipt',
                jsonb_build_object('why', 'too many entries', 'key', v_rkey));
            end if;
          end if;
        end loop;
        for v_rkey, v_rval in select t.rk, t.rv from jsonb_each(coalesce(v_receipt->'xp', '{}'::jsonb)) as t(rk, rv) loop
          if jsonb_typeof(v_rval) <> 'number' or (v_rval#>>'{}')::numeric < 0
             or (v_rval#>>'{}')::numeric > c_max_xp_delta then
            perform public.hr_reject('bad_receipt',
              jsonb_build_object('why', 'xp entry out of range', 'skill', left(v_rkey, 64)));
          end if;
        end loop;
        for v_rkey, v_rval in select t.rk, t.rv from jsonb_each(coalesce(v_receipt->'items', '{}'::jsonb)) as t(rk, rv) loop
          if jsonb_typeof(v_rval) <> 'number' or abs((v_rval#>>'{}')::numeric) > c_max_item_delta then
            perform public.hr_reject('bad_receipt',
              jsonb_build_object('why', 'item entry out of range', 'item', left(v_rkey, 64)));
          end if;
        end loop;
        -- (V7b) THE AUTO-EAT STATE, AS THE ENGINE RAN THE SPAN. An OBJECT, not a
        -- boolean: "auto-eat was off", "your threshold was 20%" and "your bag was
        -- empty" are three different sentences and only the third names the fix
        -- (src/net/accrue.js summaryFromAway reads {enabled, pct, hadFood}).
        if v_receipt ? 'autoEat' then
          if jsonb_typeof(v_receipt->'autoEat') <> 'object' then
            perform public.hr_reject('bad_receipt', jsonb_build_object('why', 'autoEat not an object'));
          end if;
          for v_rkey in select t.rk from jsonb_object_keys(v_receipt->'autoEat') as t(rk) loop
            if not (v_rkey = any(c_receipt_autoeat_keys)) then
              perform public.hr_reject('bad_receipt',
                jsonb_build_object('why', 'unknown autoEat key', 'key', left(v_rkey, 64)));
            end if;
          end loop;
          foreach v_rkey in array array['enabled','hadFood'] loop
            if (v_receipt->'autoEat') ? v_rkey
               and jsonb_typeof(v_receipt->'autoEat'->v_rkey) <> 'boolean' then
              perform public.hr_reject('bad_receipt',
                jsonb_build_object('why', 'autoEat field not a boolean', 'key', v_rkey));
            end if;
          end loop;
          if (v_receipt->'autoEat') ? 'pct'
             and (jsonb_typeof(v_receipt->'autoEat'->'pct') <> 'number'
                  or (v_receipt->'autoEat'->>'pct')::numeric < 0
                  or (v_receipt->'autoEat'->>'pct')::numeric > 100) then
            perform public.hr_reject('bad_receipt',
              jsonb_build_object('why', 'autoEat pct out of range', 'pct', v_receipt->'autoEat'->'pct'));
          end if;
        end if;
        -- (V9) IT MUST ACCOMPANY AN ACCRUAL. Without `accrued_to` there is no
        -- window to bound the span against, and a receipt for a window nobody
        -- paid is a card narrating a night that did not happen.
        if not (p_delta ? 'accrued_to') then
          perform public.hr_reject('bad_receipt', jsonb_build_object('why', 'no accrual window'));
        end if;
        -- (V8) THE WINDOW. v_st is the row this function already holds under
        -- `for update` (see the select at the head of this block), so
        -- v_st.accrued_to is the OLD watermark read under the row lock and
        -- cannot move underneath this check. now() is the server clock. The
        -- widest window this call can credit is the difference, because hr_apply
        -- clamps the new watermark into [v_st.accrued_to, now()] below.
        v_window_ms := (extract(epoch from (now() - v_st.accrued_to)) * 1000)::bigint
                       + c_receipt_slack_ms;
        foreach v_rkey in array c_receipt_ms_keys loop
          if coalesce((v_receipt->>v_rkey)::bigint, 0) > v_window_ms then
            perform public.hr_reject('bad_receipt',
              jsonb_build_object('why', 'span exceeds the window', 'key', v_rkey,
                                 'value', v_receipt->v_rkey, 'window_ms', v_window_ms));
          end if;
        end loop;
        -- paidMs is the part of awayMs that actually EARNED; it cannot exceed it.
        if coalesce((v_receipt->>'paidMs')::bigint, 0)
           > coalesce((v_receipt->>'awayMs')::bigint, 0) + c_receipt_slack_ms then
          perform public.hr_reject('bad_receipt', jsonb_build_object('why', 'paidMs exceeds awayMs'));
        end if;
        -- `at` is an EPOCH-MS instant and is held to the same clock: never in the
        -- future, never older than the window it describes plus a day of slack.
        if v_receipt ? 'at' then
          if (v_receipt->>'at')::numeric > (extract(epoch from now()) * 1000)::numeric + c_receipt_slack_ms
             or (v_receipt->>'at')::numeric
                < (extract(epoch from (v_st.accrued_to - interval '1 day')) * 1000)::numeric then
            perform public.hr_reject('bad_receipt',
              jsonb_build_object('why', 'at is not on the server clock', 'at', v_receipt->'at'));
          end if;
        end if;
        -- (V10) IT MUST CLASSIFY AS AWAY, AND THE SERVER DECIDES THAT. A
        -- sync-sized receipt is REFUSED, not stored: the 90 s settle cadence must
        -- never write this column (that is the difference between ~1 write per
        -- session and 40 per hour per character - journal rule 6). A DEATH always
        -- classifies away regardless of span (b343: a death always speaks).
        if coalesce((v_receipt->>'awayMs')::bigint, 0) < c_sync_max_ms
           and coalesce((v_receipt->>'died')::boolean, false) is not true
           and coalesce((v_receipt->>'deaths')::bigint, 0) < 1 then
          perform public.hr_reject('bad_receipt',
            jsonb_build_object('why', 'sync-sized', 'awayMs', v_receipt->'awayMs',
                               'sync_max_ms', c_sync_max_ms));
        end if;
        -- (V11) THE HEADLINE MAY NOT EXCEED WHAT THIS APPLY MOVED. A card that
        -- can claim more gold than hr_apply credited is a lie with a number on it.
        if jsonb_typeof(p_delta->'gold') = 'number'
           and coalesce((v_receipt->>'gold')::numeric, 0) > greatest(0, (p_delta->>'gold')::numeric) then
          perform public.hr_reject('bad_receipt',
            jsonb_build_object('why', 'gold exceeds the delta', 'receipt', v_receipt->'gold',
                               'delta', p_delta->'gold'));
        elsif jsonb_typeof(p_delta->'gold') <> 'number'
              and coalesce((v_receipt->>'gold')::numeric, 0) > 0 then
          perform public.hr_reject('bad_receipt',
            jsonb_build_object('why', 'gold claimed with no gold in the delta',
                               'receipt', v_receipt->'gold'));
        end if;
      end if;
    end if;

    if p_delta ? 'workers' then$anc$);

    -- 3e. THE WRITE. ABSOLUTE: absent key = untouched, present = set, INCLUDING
    --     to null. Deliberately NOT voided by an `activity` key (unlike
    --     `fight`): the receipt is a statement about a night that already
    --     happened, and switching to fishing does not un-happen it. §4(f)
    --     asserts that absence, because an absence is not otherwise reviewable.
    v_def := replace(v_def,
      $anc$           recovering_until = case when p_delta ? 'recovering_until'$anc$,
      $anc$           -- The last away-classified receipt (2026-09-07 ruling). An ABSOLUTE,
           -- validated at (4a-r). Absent key = untouched; present = set,
           -- INCLUDING to null. NOT voided by an activity switch: the night
           -- already happened and a pointer change does not un-happen it.
           last_away_receipt = case when p_delta ? 'last_away_receipt'
                                    then v_receipt else last_away_receipt end,
           recovering_until = case when p_delta ? 'recovering_until'$anc$);

    execute v_def;
  end if;
end $mig$;

-- ── 4. §4 SELF-CHECK — PROPERTIES ASSERTED BY EXECUTING SQL ─────────────────
-- CLAUDE.md §4: "properties asserted by executing SQL, not by markers". The
-- eight probes below actually CALL hr_apply on a throwaway character inside a
-- subtransaction that is then rolled back, so a check cannot pass because a
-- string happened to appear in a function body.
--
-- It is skipped LOUDLY, never silently, if the fixtures it needs are absent: a
-- self-check that switches itself off is worse than no self-check (the precedent
-- is apply-engine §6(g), whose gate predicate was MEASURED before the apply).
do $mig$
declare
  v_uid    uuid := gen_random_uuid();
  v_slot   int  := 0;
  v_ver    bigint;
  v_r      jsonb;
  v_cnt    int;
  v_kit    int;
  v_apply  text := pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure);
  v_state  text := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  v_got    jsonb;
  v_code   text;
  -- The honest away receipt every probe below is a mutation of.
  c_ok jsonb := jsonb_build_object(
    'grantMs', 10800000, 'awayMs', 10800000, 'paidMs', 9000000,
    'gold', 1234, 'xp', jsonb_build_object('attack', 5000),
    'items', jsonb_build_object('raw_shrimp', -8), 'kills', 42, 'crits', 3,
    'burnt', 0, 'stoppedBy', 'out_of_supply', 'stoppedById', 'raw_shrimp',
    'stoppedSkill', 'cooking', 'stoppedPerHour', 940,
    'died', false, 'diedTo', null, 'deaths', 0, 'recoverMs', 0,
    'recoverLadder', '[]'::jsonb, 'foodEaten', 8,
    'autoEat', jsonb_build_object('enabled', true, 'pct', 50, 'hadFood', true),
    'blessed', false, 'featuredMs', 0);
begin
  -- ── (a) THE COLUMN: present, nullable, no default, bounded. ───────────────
  select count(*) into v_cnt from information_schema.columns
   where table_schema = 'public' and table_name = 'player_state'
     and column_name = 'last_away_receipt' and data_type = 'jsonb'
     and is_nullable = 'YES' and column_default is null;
  if v_cnt <> 1 then
    raise exception 'receipt self-check (a): last_away_receipt is missing, not jsonb, not-null, or defaulted (%)', v_cnt;
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_state'::regclass
                    and conname = 'player_state_last_away_receipt_bounded'
                    and convalidated) then
    raise exception 'receipt self-check (a): the 2 KB structural bound is missing or NOT VALID';
  end if;

  -- ── (b) THE PROJECTION AND THE ALLOWLIST EXIST AT ALL. ────────────────────
  if strpos(v_state, $q$'last_away_receipt', v_st.last_away_receipt$q$) = 0 then
    raise exception 'receipt self-check (b): hr_state_of does not project last_away_receipt - the card would still die on reload';
  end if;
  if strpos(v_apply, $q$    'last_away_receipt',$q$) = 0 then
    raise exception 'receipt self-check (b): c_delta_keys does not carry last_away_receipt - every away settle would 409 unknown_delta_key';
  end if;
  if strpos(v_apply, $q$'bad_recovering', 'bad_deaths', 'bad_receipt',$q$) = 0 then
    raise exception 'receipt self-check (b): bad_receipt is not a release code - a malformed receipt would brick an intent key for 25 hours';
  end if;

  -- ── (c) NO CLIENT WRITE PATH, NO CLIENT EXECUTE. ──────────────────────────
  -- The whole point of a server-owned receipt is that the client cannot author
  -- its own. Both doors are checked: the table and the function.
  select count(*) into v_cnt from pg_policies
   where schemaname = 'public' and tablename = 'player_state'
     and cmd in ('UPDATE','INSERT','ALL')
     and ('authenticated' = any(roles) or 'anon' = any(roles) or 'public' = any(roles));
  if v_cnt <> 0 then
    raise exception 'receipt self-check (c): player_state has % client write policy(ies) - the client could author its own away receipt', v_cnt;
  end if;
  if has_function_privilege('authenticated', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_state_of(uuid,int)', 'execute')
     or has_function_privilege('anon', 'public.hr_state_of(uuid,int)', 'execute') then
    raise exception 'receipt self-check (c): hr_apply / hr_state_of are executable by a client role';
  end if;

  -- ── THE EXECUTING PROBES ──────────────────────────────────────────────────
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'receipt self-check: hr_create_character missing - apply 2026-08-14-character-bootstrap.sql first';
  end if;
  select count(*) into v_kit from public.hr_start_kit;
  if v_kit <> 1 then
    raise exception 'receipt self-check CANNOT RUN: hr_start_kit holds % rows - re-apply the catalogue', v_kit;
  end if;

  begin  -- ── SUBTRANSACTION (rolled back at the end) ──────────────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    if auth.uid() is distinct from v_uid then
      raise exception 'receipt HARNESS: auth.uid() did not pick up the probe identity';
    end if;
    v_r := public.hr_create_character(v_slot);
    if v_r->>'created' <> 'true' then
      raise exception 'receipt HARNESS: could not create the probe character: %', v_r;
    end if;
    -- A THREE-HOUR unpaid window, so the honest receipt above has room to be true.
    update public.player_state
       set accrued_to = now() - interval '3 hours',
           active_kind = 'combat', active_id = 'rat', active_since = now() - interval '3 hours'
     where user_id = v_uid and slot = v_slot;

    -- (d) THE CONTROL: A VALID AWAY RECEIPT LANDS, AND IS PROJECTED.
    select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
    v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
             jsonb_build_object('accrued_to', 'now', 'gold', 2000,
               'journal', jsonb_build_object('kind','admin','intent','selfcheck:receipt'),
               'last_away_receipt', c_ok));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'receipt self-check (d) CONTROL: an HONEST away receipt was REFUSED (%) - every probe below would then prove nothing', v_r;
    end if;
    select last_away_receipt into v_got from public.player_state where user_id = v_uid and slot = v_slot;
    if v_got is null or (v_got->>'kills')::int <> 42 then
      raise exception 'receipt self-check (d): the receipt did not land in the column (%)', v_got;
    end if;
    v_got := public.hr_state_of(v_uid, v_slot);
    if v_got->'state'->'last_away_receipt' is null
       or (v_got->'state'->'last_away_receipt'->>'kills')::int <> 42 then
      raise exception 'receipt self-check (d): hr_state_of did not project the receipt it just stored';
    end if;
    -- ⚠ AND IT SURVIVES A LATER SETTLE THAT DOES NOT CARRY THE KEY. This is the
    --   whole ruling: absent = untouched. A cadence settle must not wipe it.
    select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
    v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
             jsonb_build_object('accrued_to','now','gold',1,
               'journal', jsonb_build_object('kind','admin','intent','selfcheck:cadence')));
    select last_away_receipt into v_got from public.player_state where user_id = v_uid and slot = v_slot;
    if v_got is null or (v_got->>'kills')::int <> 42 then
      raise exception 'receipt self-check (d): a settle WITHOUT the key erased the stored receipt - the key is not absolute';
    end if;

    -- (f) NOT VOIDED BY AN ACTIVITY SWITCH. `fight` is; this is not. An absence
    --     is not otherwise reviewable, so it is asserted.
    select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
    v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
             jsonb_build_object('activity', jsonb_build_object('kind','combat','id','rat','restart',true),
               'journal', jsonb_build_object('kind','admin','intent','selfcheck:switch')));
    select last_away_receipt into v_got from public.player_state where user_id = v_uid and slot = v_slot;
    if v_got is null then
      raise exception 'receipt self-check (f): an activity switch voided the away receipt - the night already happened';
    end if;

    -- (e) THE REFUSALS. Each one re-backdates the watermark first (the control
    --     above stamped accrued_to = now()), then mutates ONE field of the same
    --     honest receipt. A probe that passed for the wrong reason would show up
    --     as the WRONG CODE, not as a silent success.
    <<refusals>>
    declare
      v_probe text;
      v_bad   jsonb;
    begin
      foreach v_probe in array array['oversized','too_many_entries','unknown_key','negative','sync','window','not_object','no_accrual','gold_over'] loop
        update public.player_state
           set accrued_to = now() - interval '3 hours'
         where user_id = v_uid and slot = v_slot;
        select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
        v_bad := case v_probe
          -- 400 entries: ~10 KB, so it trips the SIZE door (V2) - measured, not
          -- assumed. V2 is checked BEFORE V7, which is why the entry cap needs a
          -- probe of its own directly below rather than sharing this one.
          when 'oversized'  then c_ok || jsonb_build_object('items',
                                   (select jsonb_object_agg('pad_' || g, g)
                                      from generate_series(1, 400) g))
          -- (V7) THE ENTRY CAP, WHICH NOTHING ELSE REACHES. 65 SHORT names
          -- serialise to well under the 2 KB door (~900 bytes measured), so this
          -- is the only shape that gets past V2 to be refused by V7 at all. Its
          -- 64-entry twin is applied as a CONTROL after the loop: a cap that
          -- refused 64 as well would be an off-by-one that 409s an honest night
          -- with a full bag, and "refused" alone cannot tell the two apart.
          when 'too_many_entries' then c_ok || jsonb_build_object('items',
                                   (select jsonb_object_agg('i' || g, g)
                                      from generate_series(1, 65) g))
          when 'unknown_key' then c_ok || jsonb_build_object('freeGold', 999999)
          when 'negative'    then c_ok || jsonb_build_object('kills', -1)
          -- Sync-sized and nobody died: the 90 s cadence must never write here.
          when 'sync'        then c_ok || jsonb_build_object('awayMs', 300000, 'paidMs', 300000,
                                                             'grantMs', 300000, 'died', false, 'deaths', 0)
          -- Nine days of "absence" against a three-hour window.
          when 'window'      then c_ok || jsonb_build_object('awayMs', 777600000, 'grantMs', 777600000)
          when 'not_object'  then jsonb_build_object('x', 1)   -- replaced below
          when 'no_accrual'  then c_ok
          when 'gold_over'   then c_ok || jsonb_build_object('gold', 999999999)
          end;
        -- ⚠ hr_apply CATCHES its own HR000 and RETURNS `{ok:false, error:<code>}`
        --   (its `exception when sqlstate 'HR000'` handler). So the refusal is
        --   read off the RESULT, not off a raised exception. The exception arm
        --   below is belt-and-braces for a refusal that ever escapes the handler
        --   — if it fires, the code is still compared, so neither shape can pass
        --   for the wrong reason.
        v_code := null;
        v_r := null;
        begin
          if v_probe = 'not_object' then
            v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
                     jsonb_build_object('accrued_to','now','gold',2000,
                       'journal', jsonb_build_object('kind','admin','intent','selfcheck:receipt'),
                       'last_away_receipt', to_jsonb('a string'::text)));
          elsif v_probe = 'no_accrual' then
            -- No `accrued_to`: there is no window for the span to be bounded
            -- against, so the receipt has nothing to be true about.
            v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
                     jsonb_build_object('gold', 2000,
                       'journal', jsonb_build_object('kind','admin','intent','selfcheck:receipt'),
                       'last_away_receipt', v_bad));
          else
            v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
                     jsonb_build_object('accrued_to','now','gold',2000,
                       'journal', jsonb_build_object('kind','admin','intent','selfcheck:receipt'),
                       'last_away_receipt', v_bad));
          end if;
        exception when sqlstate 'HR000' then
          v_code := sqlerrm;
        end;
        if v_code is null then
          v_code := case when coalesce(v_r->>'ok','false') = 'true'
                         then '<APPLIED>' else coalesce(v_r->>'error', '<no error>') end;
        end if;
        if v_code is distinct from 'bad_receipt' then
          raise exception 'receipt self-check (e) [%]: expected bad_receipt, got % (result %)',
            v_probe, v_code, v_r;
        end if;
      end loop;
      -- (e-ii) THE CONTROL FOR THE ENTRY CAP. Exactly c_max_receipt_keys entries,
      --        the same shape and the same short names: it must be ACCEPTED. A
      --        refusal here is an off-by-one that 409s an honest night whose bag
      --        happens to be full, and the loop above cannot see the difference.
      update public.player_state
         set accrued_to = now() - interval '3 hours'
       where user_id = v_uid and slot = v_slot;
      select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
      v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
               jsonb_build_object('accrued_to','now','gold',2000,
                 'journal', jsonb_build_object('kind','admin','intent','selfcheck:receipt'),
                 'last_away_receipt', c_ok || jsonb_build_object('items',
                   (select jsonb_object_agg('i' || g, g)
                      from generate_series(1, 64) g))));
      if coalesce(v_r->>'ok','false') <> 'true' then
        raise exception 'receipt self-check (e-ii): a receipt with exactly 64 map entries was REFUSED (%) - the entry cap is off by one and an honest full-bag night would 409', v_r;
      end if;
    end refusals;

    -- (g) A DEATH ALWAYS CLASSIFIES AWAY, WHATEVER THE SPAN (b343). The sync
    --     rule must not swallow the one receipt that always has to speak.
    update public.player_state
       set accrued_to = now() - interval '3 hours'
     where user_id = v_uid and slot = v_slot;
    select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
    v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
             jsonb_build_object('accrued_to','now','gold',2000,
               'journal', jsonb_build_object('kind','admin','intent','selfcheck:receipt'),
               'last_away_receipt', c_ok || jsonb_build_object(
                 'awayMs', 120000, 'paidMs', 120000, 'grantMs', 120000,
                 'died', true, 'diedTo', 'ancient_bear', 'deaths', 1,
                 'recoverMs', 120000, 'recoverLadder', '[120000]'::jsonb)));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'receipt self-check (g): a DEATH receipt under SYNC_MAX_MS was refused (%) - a death always speaks', v_r;
    end if;

    -- (h) THE EXPLICIT VOID. `null` is a legal, meaningful value.
    update public.player_state set accrued_to = now() - interval '3 hours'
     where user_id = v_uid and slot = v_slot;
    select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
    v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
             jsonb_build_object('accrued_to','now',
               'journal', jsonb_build_object('kind','admin','intent','selfcheck:void'))
             || jsonb_build_object('last_away_receipt', null::jsonb));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'receipt self-check (h): the explicit null void was refused (%)', v_r;
    end if;
    select last_away_receipt into v_got from public.player_state where user_id = v_uid and slot = v_slot;
    if v_got is not null then
      raise exception 'receipt self-check (h): the void did not clear the column (%)', v_got;
    end if;

    -- (i) NO PER-TICK LEDGER. The receipt rides the apply row hr_apply already
    --     writes; it must not have added a row of its own (journal rule 6 -
    --     game_events reached 1.6M rows / 229 MB from six players in four days).
    select count(*) into v_cnt from public.player_ledger
     where user_id = v_uid and intent like 'receipt%';
    if v_cnt <> 0 then
      raise exception 'receipt self-check (i): the receipt wrote % ledger row(s) of its own', v_cnt;
    end if;

    raise exception using errcode = 'HR907', message = 'receipt §4 complete - rolling back';
  exception when sqlstate 'HR907' then
    null;
  end;

  -- ROLLBACK PROOF. If the subtransaction had committed, this migration would
  -- have written a character into production as a side effect of verifying itself.
  if exists (select 1 from public.player_state where user_id = v_uid) then
    raise exception 'receipt self-check LEAKED a player_state row';
  end if;
  if exists (select 1 from auth.users where id = v_uid) then
    raise exception 'receipt self-check LEAKED an auth.users row';
  end if;

  raise notice 'receipt self-check PASSED: nullable no-default jsonb column with a validated 2 KB structural bound; projected raw by hr_state_of; allowlisted, size/key/type/range/window/classification-validated and written ABSOLUTE by hr_apply; released on a shape refusal; survives a settle that does not carry it; NOT voided by an activity switch; a death speaks under SYNC_MAX_MS; the explicit void clears it; oversized / unknown-key / negative / sync-sized / over-window / non-object / window-less / gold-over-delta receipts are all refused with bad_receipt; no client write policy, no client execute, and no ledger row of its own.';
end $mig$;
