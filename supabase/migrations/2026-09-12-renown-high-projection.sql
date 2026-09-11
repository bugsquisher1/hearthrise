-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-12-renown-high-projection.sql
--
-- PROJECT THE SERVER'S COUNTED RENOWN ON THE ENVELOPE, AND KEEP IT FRESH.
-- Two anchored splices, no new table, no new column, no new RPC, no grant
-- change, no value moved:
--   §1  hr_apply  — ratchet `player_state.renown_high` from hr_renown_of on a
--                   SUCCESSFUL apply (the settle path), raise-only, journalled.
--   §2  hr_state_of — project `renown_high` as a TOP-LEVEL envelope key.
--
-- RESTATEMENT-DEBT-ACK: both bodies are PATCHED, not restated, for the reason
-- 2026-09-12-worker-hired-at-projection.sql states at length — an agent cannot
-- read the LIVE body (apply-migration and the live-hash baseline are
-- Coordinator-only), and a restatement authored from the repo replay is exactly
-- the b484-b487 class where the restated body silently reverts whichever file
-- patched last. hr_apply is 131 KB and its live md5 ALREADY differs from the
-- replay's, so a restatement of it would be a blind overwrite of the economy's
-- single write path. Both splices are anchored, exactly-once-asserted and
-- re-entrant (a second apply is a notice + return), and the paydown — restate
-- each body ONCE from pg_get_functiondef of the LIVE body, then re-pin
-- live-hash-drift — stays the Coordinator's, scheduled, not discovered.
--
-- ── WHY (the player-visible gap b535 left open) ─────────────────────────────
-- b535 made the renown headline and the rank-up card read a SERVER mirror
-- (src/features/renown.js `noteServerRenown` / `serverRenownHigh`). That mirror
-- has exactly two sources today: a claim VERDICT (`renown_high`, exact), and the
-- `renown_claim:<rank>` once-guard flags in `progress` — a FLOOR at the last
-- rank the player actually paid for. hr_state_of projects no renown at all, so
-- after a reload the headline falls back to the floor:
--
--   MEASURED LIVE (QA account, 2026-09-11): headline 400 (the Serf floor) while
--   the server had counted 779 toward Squire (900). The player cannot see any
--   progress toward the next rank until they click Claim — and clicking Claim is
--   the ONLY thing that moves the number, so the display is dark exactly when it
--   matters. Under-reporting is the safe direction; it is still a dead display.
--
-- ── WHY THE NUMBER IS CACHED AND NOT COMPUTED PER ENVELOPE (MEASURED) ───────
-- The obvious projection is `greatest(renown_high, hr_renown_of(...))`, computed
-- in hr_state_of. Measured on the repo chain in PGlite (real PostgreSQL), one
-- character, all skills, 628 permanent progress rows, 108 combat activities:
--
--     hr_state_of, today ................ 1.541 ms/call
--     hr_renown_of alone ................ 5.262 ms/call   ← 3.4x the envelope
--     greatest(renown_high, renown_of) .. 5.321 ms/call
--     player_state.renown_high alone .... 0.270 ms/call
--
-- hr_renown_of is expensive for a structural reason that will not improve with
-- scale: the bossKill term joins every `ev:kill_monster:%` row to hr_activities
-- through `substring(pp.key from 17)` (unindexable), and the collection term
-- scans every `ev:loot:%` row. Both populations GROW with play. Putting that on
-- hr_state_of would make the single most-called body in the schema ~4.5x more
-- expensive — hr_state_of is read on every boot load, every settle, every
-- activity switch, every claim.
--
-- So the number is cached on the column that already exists for it. The cache is
-- FREE to project: hr_state_of already does `select * into v_st from
-- player_state`, so `v_st.renown_high` costs ZERO additional reads (the 0.270 ms
-- row above is a standalone query; inside hr_state_of it is already in hand).
-- The recompute moves to hr_apply, which runs at most once per intent and is
-- floored at ACCRUE_MIN_MS = 60 s for the accrual settle.
--
--   COST DELTA, stated for 100x players: +1 hr_renown_of call per SUCCESSFUL
--   hr_apply (≈2.9 ms on production PG17 per the smoke measurement, 5.3 ms in
--   PGlite) and +0 ms per envelope read. At 600 players x ~2 applies/min that is
--   ~3.5 s CPU/min (≈6 % of one core); at 10,000 players it is ~1 core and the
--   right answer then is to make hr_renown_of cheap (a materialisation keyed off
--   the kill counters), not to move this back onto the envelope.
--   WRITES: the ratchet is raise-only in the WHERE (C1), so an apply that raised
--   nothing touches NO row at all — strictly fewer writes than the first draft,
--   which rewrote player_state every time. ROWS: one player_ledger row per REAL
--   raise (C2), never per apply. A raise needs the score to actually increase, so
--   the population is bounded by progression, not by traffic: measured on the
--   fixture, three applies produced one row. Ballpark at 100x players: a few tens
--   of rows per character per day early on, falling toward zero as the curve
--   flattens — ~120 bytes each, i.e. single-digit MB/year for the whole beta
--   population. That is deliberately NOT the game_events shape (1.6M rows /
--   229 MB from six players in four days by logging every kill).
--
-- ── WHY renown_high AND NOT A SECOND "DISPLAY" COLUMN ───────────────────────
-- Considered and rejected: cache a display-only `renown_counted` and leave
-- `renown_high` (the claim authority) untouched. That produces a headline the
-- claim path can DISAGREE with — the player reads 900, clicks Claim, and
-- hr_claim_rank refuses `not_reached` because ITS high-water is 400. A projected
-- number that the authority does not honour is a worse bug than the dark display
-- this file closes. One quantity, one authority: the projected figure IS the
-- figure hr_claim_rank decides against, and because the claim recomputes
-- `greatest(stored, live)` at claim time, the projection can only ever UNDER-
-- state what is claimable. It can never promise a rank that is then refused.
--
-- ── THIS IS THE SCHEDULED FOLLOW-UP, NOT A NEW IDEA ─────────────────────────
-- 2026-08-22-renown-claim.sql's header: "Closing the gap fully means advancing
-- renown_high inside the accrual settle (hr_apply / hr_perks_of) … and is the
-- scheduled FOLLOW-UP. Recorded so it is scheduled debt, not discovered debt."
-- This is that file. The ratchet source is UNCHANGED — hr_renown_of, the same
-- function hr_claim_rank already ratchets from, including its client-credited-
-- kill discount (2026-09-02-renown-kill-faucet.sql). §0 FAILS CLOSED if that
-- discount is absent, because caching an undiscounted score would make the
-- faucet's damage permanent instead of self-correcting.
--
-- ── SECURITY GO-WITH-CHANGES (2026-09-12) — C1, C2, C3 LANDED HERE ─────────
--   C1 (P1, CONFIRMED BY PROBE) the ratchet sat BARE inside hr_apply's write-
--      bearing block above the handlers, so any raise inside hr_renown_of landed
--      in the bad_delta handler and rolled back the WHOLE delta: a 7,777-gold
--      PAID settle came back ok:false with the gold unchanged. It now runs in its
--      own subtransaction that swallows its failure (`raise warning`), and the
--      write is RAISE-ONLY IN THE WHERE so `found` means exactly "the high-water
--      moved" — which also ends the write amplification of rewriting the row on
--      every apply. §3(c6) proves it by EXECUTING the reviewer's probe.
--   C2 renown_high has NO lowering path anywhere (every writer is a ratchet) and
--      hr_claim_rank pays up to 1,000,000 gold + 500 gems against it, so an
--      inflation that is not journalled is both undetectable and irreversible
--      (probe: 10M fabricated ev:kill_any banked 502,343; deleting the rows left
--      it banked). Every real raise now writes ONE player_ledger row
--      (kind='renown', intent='renown_ratchet', meta {to, intent_id}). Security's
--      ruling: NO per-apply row — one row per real raise only, which is what the
--      raise-only WHERE makes possible. §3(c2b)/(c5) assert both halves.
--   C3 tests/renown-projection.mjs re-anchored and extended: R6 (one row per
--      raise, none for a no-op) and R7 (a raising hr_renown_of must not eat a
--      paid settle), nine defects x gate / gate-blind plus a negative control.
--
-- ⚠ SEMANTIC DELTA — RULED ON, NOT HIDDEN.
--   Today renown_high captures the live score only at the instants a player
--   clicks Claim. After this file it captures the MAXIMUM over every apply. For
--   the monotone terms (levels, skill99, lifetime kills, boss kills, distinct
--   loot) that is identical. Two terms are NOT monotone:
--     · goldLog — `(log10(gold) - 3) * 8`, and only above 1,000 gold. The whole
--       term is ~24 renown at 1,000,000 gold and ~48 at 1,000,000,000, against
--       rank thresholds of 400..120,000. A player who banks a peak and then
--       spends it keeps at most tens of renown.
--     · streakBest x 5 — reads player_state.streak_days, which Slice 3 owns and
--       which MAY be the CURRENT streak (flagged in hr_renown_of's own body). A
--       30-day streak is 150 renown, banked permanently where today it is banked
--       only if the player claimed during the streak.
--   Direction: strictly more generous, bounded by those two terms, and exactly
--   the semantic the client's own `renownHigh` ratchet has always had
--   ("a term reading momentarily low can never DEMOTE a rank the player
--   earned"). No new renown is minted: every input is server-written and the
--   client-credited part is already subtracted. NOTHING about the rank
--   catalogue, the reward amounts, the once-guard or the ledger changes.
--   DESIGN RULING (game-designer, final, 2026-09-12): option 1 — bank the max of
--   the FULL counted score, streak and gold-log included. Rank never goes down;
--   the transient envelope is +174 (19 % of Squire, noise above Knight) and
--   hr_claim_rank already banks the full score at claim time. Security accepts
--   the standing-claim consequence WITH C2's journal.
--   The client half (lane B, NOT built here) owns the lag copy:
--   "Renown N — your best yet. New gains count from your next settle."
--
-- ── WHAT THIS FILE IS NOT ───────────────────────────────────────────────────
-- It does not make hr_renown_of client-executable (it stays revoked; the client
-- sees only the cached scalar for its OWN character, through an engine-only
-- projection). It does not add a rank, change a threshold, or pay anything. It
-- does not make hr_apply write a value any client supplied — the ratchet reads
-- NOTHING from p_delta. And it does not close the "current vs best streak"
-- question, which is Slice 3's and is named above so it cannot be mistaken for
-- fixed.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Additive to two projected/patched bodies; nothing is dropped and no data is
-- destroyed. To revert: re-apply the previous last-toucher of each body
-- (2026-09-09-bounty-progress-projection.sql for hr_state_of,
-- 2026-09-08-hearthfind.sql for hr_apply). `renown_high` values already
-- ratcheted stay — they are a high-water by design and hr_claim_rank would have
-- ratcheted to the same or a higher figure at the next claim.
--
-- ⚠ AFTER APPLYING: hr_state_of AND hr_apply are LIVE-HASH-TRACKED bodies
--   (tests/live-hash-drift.baseline.json). This file patches BOTH
--   PROGRAMMATICALLY, so the Coordinator must re-seed with
--   `node tests/live-hash-drift.mjs --live --write` after the apply and write the
--   whys from `--codediff`. It carries no literal
--   `create or replace function public.hr_state_of(` / `public.hr_apply(` header
--   and takes over no last-toucher role in the derivation tools.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_state_of is missing — apply the player-state chain first'; end if;
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is null then
    raise exception 'hr_apply(uuid,int,bigint,uuid,jsonb) is missing — apply 2026-08-11-apply-engine.sql '
                    'and its chain first'; end if;
  if to_regprocedure('public.hr_renown_of(uuid,int)') is null then
    raise exception 'hr_renown_of is missing — apply 2026-08-20-renown.sql first'; end if;
  if to_regprocedure('public.hr_claim_rank__ungated(text,int)') is null then
    raise exception 'hr_claim_rank__ungated is missing — apply 2026-08-22-renown-claim.sql first; '
                    'this file caches the number THAT rpc decides against'; end if;

  -- The column this file caches into must exist, be the right type, and be NOT
  -- NULL: `greatest(null, x)` is x, but a nullable column would let a future
  -- writer park a null under a projected key and the headline would read absent
  -- instead of zero.
  if (select count(*) from information_schema.columns
       where table_schema='public' and table_name='player_state'
         and column_name='renown_high' and data_type='bigint' and is_nullable='NO') <> 1 then
    raise exception 'player_state.renown_high is missing, not bigint, or nullable — apply '
                    '2026-08-22-renown-claim.sql first';
  end if;

  -- C2's journal needs `kind='renown'` to survive player_ledger's check
  -- constraint. Asserted by EXECUTION against the live constraint (a name scan
  -- would pass on a constraint that had been rewritten), in a subtransaction
  -- that is always discarded.
  begin
    begin
      insert into public.player_ledger (user_id, slot, kind, intent, meta)
      values ('00000000-0000-0000-0000-0000000000ff', 0, 'renown', 'precondition-probe', '{}'::jsonb);
      raise exception using errcode = 'HR823', message = 'kind=renown accepted — rolling back';
    exception
      when sqlstate 'HR823' then null;
      when check_violation then
        raise exception 'player_ledger rejects kind=''renown'' — C2''s ratchet journal cannot be '
                        'written and EVERY raise would vanish into C1''s warning handler. Widen '
                        'player_ledger_kind_check first.';
      when others then
        -- Some OTHER constraint (an FK a later migration added, say) refused the
        -- fabricated row. That says nothing about `kind`, so do not fail the
        -- apply on it — §3(c2) proves the real insert by executing it.
        raise notice 'player_ledger kind probe inconclusive (% / %) — §3(c2) is the real proof',
                     sqlstate, sqlerrm;
    end;
  end;

  -- ⚠ THE ONE THAT MATTERS. hr_renown_of must still SUBTRACT client-credited
  -- kills (2026-09-02-renown-kill-faucet.sql). Caching an undiscounted score
  -- would turn a transient over-count into a permanent high-water — the faucet's
  -- damage would stop self-correcting. Refuse rather than cache a forgeable
  -- number.
  if position('ev:kill_credited_any' in
       pg_get_functiondef('public.hr_renown_of(uuid,int)'::regprocedure)) = 0
     or position('ev:kill_credited:' in
       pg_get_functiondef('public.hr_renown_of(uuid,int)'::regprocedure)) = 0 then
    raise exception 'hr_renown_of does not subtract the client-credited kill counters — apply '
                    '2026-09-02-renown-kill-faucet.sql BEFORE caching its output into a high-water';
  end if;
end $$;

-- ── 1. hr_apply — RATCHET renown_high ON EVERY SUCCESSFUL APPLY ─────────────
-- pg_get_functiondef + a guarded exactly-once anchor replace (the
-- 2026-09-12-worker-hired-at-projection.sql idiom), so this file never restates
-- a body it did not author and cannot delete another file's work.
--
-- WHERE, and why exactly there: immediately BEFORE `v_out := hr_state_of(...)`,
-- which is the ONE place the success path builds its envelope. That position
-- gives three properties for free:
--   · it runs only when the apply SUCCEEDED (it is inside the main block, above
--     the exception handlers that overwrite v_out with a refusal);
--   · the envelope built on the very next line already carries the fresh value,
--     so the settle's own response is never one tick stale;
--   · the REPLAY branch returns far above this line, so a replayed intent does
--     not pay for a recompute — and `greatest()` would make it a no-op anyway.
do $$
declare
  v_def text;
  c_anchor constant text := $anc$v_out := public.hr_state_of(v_uid, v_slot);$anc$;
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure),
                   chr(13), '');
  if strpos(v_def, $q$'renown_ratchet'$q$) > 0 then
    raise notice 'hr_apply already ratchets renown_high — patch skipped'; return; end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_apply envelope anchor (%) did not match exactly once — its shape '
                    'is not the one this file was derived against. Do NOT patch a body you cannot '
                    'account for; diff the live hr_apply against the repo chain first.', c_anchor;
  end if;
  v_def := replace(v_def, c_anchor,
    $new$-- ── THE SERVER'S COUNTED RENOWN, RATCHETED HERE (2026-09-12) ─────────
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

    v_out := public.hr_state_of(v_uid, v_slot);$new$);
  execute v_def;
  raise notice 'hr_apply patched: renown_high ratchets from hr_renown_of on every successful apply';
end $$;
-- create-or-replace preserves an ACL; be explicit anyway (2026-08-15-gem-daily-
-- budget.sql §7's enumeration). If the browser could call hr_apply it could
-- author its own delta, so this is re-asserted on every toucher.
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
grant  execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 2. hr_state_of — PROJECT renown_high (top-level, additive, free) ────────
-- TOP LEVEL, beside `workers` / `bounty` / `total_level` — NOT inside `state` —
-- because that is where src/features/renown.js `pickServerRenown` reads it
-- (`Number(res.renown_high)`), and it is the same shape a claim verdict already
-- carries, so ONE reader handles both statements. `v_st` is already selected, so
-- this key costs zero additional reads.
do $$
declare
  v_def text;
  c_anchor constant text := $anc$'total_level', public.hr_total_level(p_user, v_st.slot),$anc$;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'renown_high', coalesce(v_st.renown_high$q$) > 0 then
    raise notice 'hr_state_of already projects renown_high — patch skipped'; return; end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_state_of total_level anchor did not match exactly once — its shape '
                    'is not the one this file was derived against. Do NOT patch a body you cannot '
                    'account for.';
  end if;
  v_def := replace(v_def, c_anchor, c_anchor || $new$
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
    'renown_high', coalesce(v_st.renown_high, 0),$new$);
  execute v_def;
  raise notice 'hr_state_of patched: the envelope projects the server-counted renown_high';
end $$;
-- create-or-replace preserves an ACL; be explicit anyway. No client executes it.
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 3. SELF-VERIFYING COMMIT GATE (§4) ─────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them, not by matching markers.
-- Apply is atomic, so a raise reverts §1 and §2. The row-writing probe lives in a
-- subtransaction discarded by a sentinel raise (HR822), so this block is
-- net-zero on production.
do $$
declare
  v_sdef  text;
  v_adef  text;
  v_bad   text;
  v_env   jsonb;
  v_r     jsonb;
  v_ver   bigint;
  v_live  bigint;
  v_high  bigint;
  v_proj0 bigint;
  v_proj1 bigint;
  v_proj2 bigint;
  v_proj3 bigint;
  v_rows  bigint;
  v_meta  jsonb;
  v_gold0 bigint;
  v_gold1 bigint;
  v_boss  text;
  v_uid   constant uuid := '000000d7-0000-0000-0000-0000000000d7';
  v_slot  constant int  := 0;
  c_j     constant jsonb := '{"kind":"admin","intent":"renown-high-projection:probe"}'::jsonb;
begin
  -- (a) BOTH SPLICES TOOK, and neither ate its neighbours.
  select prosrc into v_sdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_state_of';
  if position('''renown_high'', coalesce(v_st.renown_high' in v_sdef) = 0 then
    raise exception 'GATE(a): hr_state_of does not project renown_high'; end if;
  if position('''total_level'', public.hr_total_level' in v_sdef) = 0 then
    raise exception 'GATE(a): the splice DROPPED the total_level projection — the anchor was eaten';
  end if;
  if position('''bounty'', (select jsonb_build_object' in v_sdef) = 0 then
    raise exception 'GATE(a): the splice DROPPED the bounty projection — this file restated a stale '
                    'body instead of patching the live one';
  end if;

  v_adef := pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure);
  if position('set renown_high = r.v' in v_adef) = 0 then
    raise exception 'GATE(a): hr_apply does not ratchet renown_high'; end if;
  if position('v_out := public.hr_state_of(v_uid, v_slot);' in v_adef) = 0 then
    raise exception 'GATE(a): the hr_apply splice ate the envelope build — every successful apply '
                    'would return nothing';
  end if;
  -- The ratchet must read the SERVER function, never a counter a client can move.
  if position('public.hr_renown_of(v_uid, v_slot)' in v_adef) = 0 then
    raise exception 'GATE(a): the hr_apply ratchet does not read hr_renown_of — it is sourcing the '
                    'high-water from something else';
  end if;
  -- C1: the ratchet must stay RAISE-ONLY in the WHERE (so `found` means the
  -- high-water moved) and must NOT bump the version the apply owns.
  if position('coalesce(ps.renown_high, 0) < r.v' in v_adef) = 0 then
    raise exception 'GATE(a): the ratchet is no longer raise-only in the WHERE — `found` would be '
                    'true on every apply and C2''s journal would become a per-tick log';
  end if;
  if v_adef ~ 'set renown_high = r\.v[^;]*version' then
    raise exception 'GATE(a): the ratchet bumps version — it would manufacture version_conflict '
                    'against the client that just settled';
  end if;
  -- C1: and it must be wrapped, or a raise inside hr_renown_of rolls back the
  -- whole settle. Asserted BY EXECUTION in (c6) below; this is the cheap read.
  if position('renown ratchet skipped for' in v_adef) = 0 then
    raise exception 'GATE(a): the ratchet has no exception wrapper — a raise inside hr_renown_of '
                    'would land in hr_apply''s bad_delta handler and roll back the player''s settle';
  end if;
  -- C2: one ledger row per real raise.
  if position('''renown_ratchet''' in v_adef) = 0 then
    raise exception 'GATE(a): the ratchet does not journal its raises — an inflation of the rank '
                    'authority would be undetectable and irreversible';
  end if;

  -- (b) NOTHING BECAME CLIENT-REACHABLE. renown_high is the rank authority.
  if has_function_privilege('authenticated', 'public.hr_renown_of(uuid,int)', 'execute')
     or has_function_privilege('anon', 'public.hr_renown_of(uuid,int)', 'execute')
     or has_function_privilege('service_role', 'public.hr_renown_of(uuid,int)', 'execute') then
    raise exception 'GATE(b): hr_renown_of is client-executable — it takes an ARBITRARY uuid';
  end if;
  if has_function_privilege('authenticated', 'public.hr_state_of(uuid,int)', 'execute')
     or has_function_privilege('anon', 'public.hr_state_of(uuid,int)', 'execute')
     or has_function_privilege('service_role', 'public.hr_state_of(uuid,int)', 'execute') then
    raise exception 'GATE(b): hr_state_of became client-executable — it takes an ARBITRARY uuid';
  end if;
  if has_function_privilege('authenticated', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('service_role', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute') then
    raise exception 'GATE(b): hr_apply became client-executable — the browser could author its own delta';
  end if;
  if not has_function_privilege('hr_engine', 'public.hr_state_of(uuid,int)', 'execute')
     or not has_function_privilege('hr_engine', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)', 'execute') then
    raise exception 'GATE(b): hr_engine lost execute on the engine path — the game is dead';
  end if;

  -- …and player_state is still RPC-written only, so renown_high is unforgeable.
  select string_agg(polname || ':' || polcmd::text, ', ') into v_bad
    from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'player_state' and p.polcmd <> 'r'
     and (p.polroles = '{0}'::oid[]
          or p.polroles && (select coalesce(array_agg(oid), '{}'::oid[]) from pg_roles
                             where rolname in ('anon', 'authenticated', 'public')));
  if v_bad is not null then
    raise exception 'GATE(b): a NON-SELECT RLS policy on player_state is reachable by a browser role '
                    '(%) — renown_high would be client-forgeable and every rank with it', v_bad;
  end if;

  -- (c) EXECUTED. Discarded subtransaction; every number below is read back.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version, renown_high, accrued_to)
      values (v_uid, v_slot, 0, 0, 1, 0, now() - interval '60 minutes')
      on conflict (user_id, slot) do update set gold = 0, gems = 0, version = 1, renown_high = 0;

    -- (c1) A FRESH CHARACTER PROJECTS ZERO — present, never null, never absent.
    v_env := public.hr_state_of(v_uid, v_slot);
    if not (v_env ? 'renown_high') then
      raise exception 'GATE(c1): the envelope has no renown_high key at all'; end if;
    v_proj0 := (v_env->>'renown_high')::bigint;
    if v_proj0 <> 0 then
      raise exception 'GATE(c1): a fresh character projects renown_high = % (expected 0)', v_proj0;
    end if;

    -- (c2) A SERVER-SIMULATED HAUL, then ONE apply → the projection equals the
    --      live score exactly. Every row below is the shape a SETTLE writes
    --      (hr_apply's own progress path), with NO credited counter touched.
    select m.monster_id into v_boss
      from public.hr_bounty_monsters m
      join public.hr_activities a
        on a.kind = 'combat' and a.is_boss and a.activity_id = m.monster_id
     order by m.monster_id limit 1;
    if v_boss is null then
      raise exception 'GATE(c2): FIXTURE — no bounty-eligible is_boss monster exists, so the boss '
                      'term cannot be exercised and the client-credit half below would prove nothing';
    end if;
    -- The character must actually BE fighting that boss: hr_credit_kills' cap is
    -- 0 with reason `not_in_combat` otherwise (2026-09-01-kill-daily-credit.sql),
    -- and a zero credit would make (c3) vacuous. This is the honest fixture — a
    -- player at the monster, which is the only state a real credit arrives from.
    update public.player_state
       set active_kind = 'combat', active_id = v_boss,
           active_since = now() - interval '60 minutes'
     where user_id = v_uid and slot = v_slot;
    -- Level 99 across the combat block, the 2026-09-02-renown-kill-faucet.sql
    -- fixture verbatim: hr_credit_kills' physical cap is derived from the
    -- character's own combat ability against the target, so an under-levelled
    -- fixture credits ZERO kills and (c3) below becomes vacuous.
    insert into public.player_skills (user_id, slot, skill_id, xp)
      select v_uid, v_slot, s, 13034431
        from unnest(array['attack','strength','defense','hitpoints','prayer','ranged','magic']) s
      on conflict (user_id, slot, skill_id) do update set xp = 13034431;
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:kill_monster:' || v_boss, 100, '', 'active'),
             (v_uid, v_slot, 'stat', 'ev:kill_any', 100, '', 'active')
      on conflict (user_id, slot, kind, key, period_key)
        do update set value = public.player_progress.value + excluded.value;

    v_live := public.hr_renown_of(v_uid, v_slot);
    if coalesce(v_live, 0) <= 0 then
      raise exception 'GATE(c2): FIXTURE DEGENERATE — the seeded character scores % renown, so '
                      '"the projection equals the score" would be 0 = 0', v_live;
    end if;
    -- …and the stale column still holds 0, so the assertion below is about the
    -- RATCHET and not about a number that was already there.
    if (select renown_high from public.player_state where user_id = v_uid and slot = v_slot) <> 0 then
      raise exception 'GATE(c2): FIXTURE — renown_high moved before the apply'; end if;

    select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
    v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
                           jsonb_build_object('gold', 2000, 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'GATE(c2): the probe apply was refused (%) — the fixture cannot measure the '
                      'ratchet', v_r;
    end if;
    -- The apply's OWN response carries the fresh figure (no stale tick).
    if not (v_r ? 'renown_high') then
      raise exception 'GATE(c2): the apply response has no renown_high — the ratchet ran after the '
                      'envelope was built'; end if;
    v_proj1 := (v_r->>'renown_high')::bigint;
    -- gold moved (2000 > 1000) so the goldLog term is now live; re-read the
    -- score AFTER the apply and require the projection to equal it exactly.
    v_live := public.hr_renown_of(v_uid, v_slot);
    if v_proj1 <> v_live then
      raise exception 'GATE(c2): the apply projected renown_high = % but hr_renown_of scores % — '
                      'the projection is not the number the claim path decides on', v_proj1, v_live;
    end if;
    if (select renown_high from public.player_state where user_id = v_uid and slot = v_slot) <> v_proj1 then
      raise exception 'GATE(c2): the projected figure is not the stored column'; end if;
    -- …and a fresh envelope read agrees with the apply's response.
    if ((public.hr_state_of(v_uid, v_slot))->>'renown_high')::bigint <> v_proj1 then
      raise exception 'GATE(c2): hr_state_of and hr_apply disagree about renown_high'; end if;

    -- (c2b) C2 — THE RAISE IS JOURNALLED, EXACTLY ONCE, WITH THE FIGURE.
    --       renown_high has no lowering path; hr_claim_rank pays up to 1,000,000
    --       gold + 500 gems against it. An unjournalled inflation is undetectable
    --       AND irreversible, so this row is the audit trail.
    select count(*) into v_rows from public.player_ledger
     where user_id = v_uid and slot = v_slot and kind = 'renown' and intent = 'renown_ratchet';
    select meta into v_meta from public.player_ledger
     where user_id = v_uid and slot = v_slot and kind = 'renown' and intent = 'renown_ratchet'
     order by at desc, id desc limit 1;
    if v_rows <> 1 then
      raise exception 'GATE(c2b): a real raise wrote % ledger rows (expected exactly 1)', v_rows;
    end if;
    if (v_meta->>'to')::bigint <> v_proj1 then
      raise exception 'GATE(c2b): the journalled figure is % but the high-water is %',
                      v_meta->>'to', v_proj1;
    end if;
    if v_meta->>'intent_id' is null then
      raise exception 'GATE(c2b): the ratchet row does not record the intent that caused it — the '
                      'raise cannot be tied back to a settle';
    end if;

    -- (c3) A CLIENT KILL CREDIT MOVES NOTHING. The real bounty verb, against the
    --      real boss, then a real apply — and the projected figure must not
    --      budge. This is the property that makes caching the score safe at all;
    --      an undiscounted cache would turn the 2026-09-02 faucet from a
    --      self-correcting over-count into a permanent one.
    --      RUN BEFORE THE CLAIM ON PURPOSE: hr_claim_rank pays gold, gold feeds
    --      the goldLog term, and a fixture that let the reward move the score
    --      could not tell an honest rise from a banked credit.
    v_r := public.hr_accept_bounty__ungated(v_slot, 'rhp', v_boss, 'cull', 'normal', 100);
    if coalesce(v_r->>'ok', '') <> 'true' then
      raise exception 'GATE(c3): FIXTURE — accept failed: %', v_r; end if;
    update public.active_bounty set accepted_at = now() - interval '60 minutes'
      where user_id = v_uid and slot = v_slot;
    v_r := public.hr_credit_kills__ungated(v_slot, v_boss, 400, 'rhp-idem-1');
    if coalesce(v_r->>'ok', '') <> 'true' then
      raise exception 'GATE(c3): FIXTURE — the bounty credit failed: %', v_r; end if;
    if coalesce((v_r->>'credited')::bigint, 0) <= 0 then
      raise exception 'GATE(c3): FIXTURE DEGENERATE — the credit applied nothing (%), so "the '
                      'projection did not move" would prove nothing', v_r->>'credited';
    end if;
    v_proj2 := ((public.hr_state_of(v_uid, v_slot))->>'renown_high')::bigint;
    if v_proj2 <> v_proj1 then
      raise exception 'GATE(c3): a client kill credit of % moved the projected renown from % to % '
                      '(must be 0). A cached score that counts credited kills makes the faucet '
                      'permanent.', v_r->>'credited', v_proj1, v_proj2;
    end if;
    -- …and the RATCHET does not bank it either. A journal-only delta, so nothing
    -- the character owns moves and the only thing that could change the score is
    -- the credit itself.
    select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
    v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
                           jsonb_build_object('journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'GATE(c3): the second probe apply was refused: %', v_r; end if;
    v_proj2 := (v_r->>'renown_high')::bigint;
    if v_proj2 <> v_proj1 then
      raise exception 'GATE(c3): the RATCHET banked a client kill credit — renown went % -> % across '
                      'an apply that followed a credit', v_proj1, v_proj2;
    end if;

    -- (c4) THE CLAIM PATH AGREES. hr_claim_rank ratchets to greatest(stored,
    --      live) and then decides; with the ratchet in place the verdict's
    --      figure must equal what the envelope already showed. If they can
    --      differ, the headline promises a rank the claim can refuse.
    if v_proj2 >= 400 then
      v_r := public.hr_claim_rank__ungated('serf', v_slot);
      if coalesce(v_r->>'ok', 'false') <> 'true' then
        raise exception 'GATE(c4): serf was refused at a projected % (min 400): %', v_proj2, v_r;
      end if;
      v_high := (v_r->>'renown_high')::bigint;
      if v_high <> v_proj2 then
        raise exception 'GATE(c4): the claim verdict says renown_high = % but the envelope projected '
                        '% — the display and the authority are two different numbers', v_high, v_proj2;
      end if;
    else
      raise exception 'GATE(c4): FIXTURE — the seeded character scores % renown, below the serf '
                      'threshold of 400, so the claim-agreement check cannot run', v_proj2;
    end if;

    -- (c5) MONOTONIC. Spend the gold (goldLog is the one term that really falls)
    --      and settle again: the high-water must NOT decrease. A projection that
    --      can fall would demote a rank the player earned.
    update public.player_state set gold = 0 where user_id = v_uid and slot = v_slot;
    if public.hr_renown_of(v_uid, v_slot) >= v_proj2 then
      raise exception 'GATE(c5): FIXTURE — spending the gold did not lower the LIVE score, so the '
                      'monotonicity check is vacuous (live % vs banked %)',
                      public.hr_renown_of(v_uid, v_slot), v_proj2;
    end if;
    select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
    v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
                           jsonb_build_object('journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'GATE(c5): the third probe apply was refused: %', v_r; end if;
    v_proj3 := (v_r->>'renown_high')::bigint;
    if v_proj3 < v_proj2 then
      raise exception 'GATE(c5): the projected renown DECREASED (% -> %) — the ratchet is not holding',
                      v_proj2, v_proj3;
    end if;
    -- …and a settle that raised NOTHING journalled nothing. C2 is one row per
    -- RAISE, not one per apply — three applies have now run and only the first
    -- moved the high-water.
    select count(*) into v_rows from public.player_ledger
     where user_id = v_uid and slot = v_slot and kind = 'renown' and intent = 'renown_ratchet';
    if v_rows <> 1 then
      raise exception 'GATE(c5): % ratchet rows after three applies that raised once — the journal '
                      'is a per-tick log, which is the game_events mistake at ledger scale', v_rows;
    end if;

    -- (c6) C1 — A BROKEN hr_renown_of MUST NOT EAT A PAID SETTLE.
    --      The reviewer's probe, executed: give hr_renown_of a body that raises
    --      (the 22P02 shape a by-name cast on a Slice-3 column produces), then run
    --      a PAID apply. Before C1 this returned ok:false with the gold unchanged,
    --      because the bare ratchet raised inside hr_apply's write-bearing block
    --      and the bad_delta handler rolled the whole delta back. The DDL is
    --      undone with everything else by the HR822 rollback below.
    select gold into v_gold0 from public.player_state where user_id = v_uid and slot = v_slot;
    execute $rb$create or replace function public.hr_renown_of(p_user uuid, p_slot int)
             returns bigint language plpgsql stable security definer
             set search_path = public, pg_temp as $b$
             begin raise exception 'renown probe: invalid input syntax' using errcode = '22P02';
             end $b$;$rb$;
    select version into v_ver from public.player_state where user_id = v_uid and slot = v_slot;
    v_r := public.hr_apply(v_uid, v_slot, v_ver, gen_random_uuid(),
                           jsonb_build_object('gold', 7777, 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'GATE(c6): a raise inside hr_renown_of REFUSED the whole settle (%) — the '
                      'display ratchet is eating the player''s delta (C1)', v_r;
    end if;
    select gold into v_gold1 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_gold1 <> v_gold0 + 7777 then
      raise exception 'GATE(c6): the settle answered ok but the 7,777 gold did NOT land (% -> %) — '
                      'the ratchet rolled back the delta (C1)', v_gold0, v_gold1;
    end if;
    if (select count(*) from public.player_ledger
         where user_id = v_uid and slot = v_slot and kind = 'renown'
           and intent = 'renown_ratchet') <> 1 then
      raise exception 'GATE(c6): a FAILED ratchet still journalled a raise — the row and the write '
                      'must live or die together';
    end if;

    raise exception using errcode = 'HR822', message = 'renown-high-projection §3 complete — rolling back';
  exception when sqlstate 'HR822' then null;
  end;

  -- NET-ZERO ON PRODUCTION, checked against every table the probe touched: the
  -- character, its skills, its progress rows, the bounty it accepted, the credit
  -- log, the intents its applies wrote and the ledger row the claim journalled.
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from public.player_skills where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.player_ledger where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from public.active_bounty where user_id = v_uid)
     or exists (select 1 from public.hr_kill_credit_log where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §3 LEAKED a probe row'; end if;

  raise notice 'renown-high-projection: hr_apply ratchets renown_high from hr_renown_of, hr_state_of '
               'projects it top-level, the claim verdict and the envelope agree, a client kill '
               'credit moves nothing, the high-water never falls, every raise is journalled ONCE '
               '(C2) and a raising hr_renown_of cannot refuse a paid settle (C1), nothing became '
               'client-executable — all green';
end $$;
