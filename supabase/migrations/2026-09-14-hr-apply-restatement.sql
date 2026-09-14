-- ════════════════════════════════════════════════════════════════════════════
-- 2026-09-14-hr-apply-restatement.sql
-- THE BODY THAT MOVES GOLD IS IN A FILE AGAIN.
--
-- Slice 7's first and largest target. `node tests/patch-chain-guard.mjs --report`
-- on the tree this was cut from:
--
--     public.hr_apply    44 anchored patches    13 files    last full restatement
--                                                            2026-08-25-workers.sql
--
-- Forty-four programmatic `replace()`-and-`execute` edits since the last full
-- `create or replace`. Every one of them is careful — each checks its anchor
-- matched exactly once and raises rather than patching blind — and that was
-- never the problem. The problem is that the text production actually runs
-- existed in NO FILE. To read the engine that moves every gold piece in the
-- realm you had to REPLAY the chain; to review it you had to replay the chain;
-- and each new patch had to anchor on a string some earlier patch happened to
-- leave behind, which is why 2026-09-06-recovering-until.sql had to write down
-- that the array terminator it anchors on is "whatever the most recent
-- programmatic patcher left there" and that anchoring on it would one day match
-- nothing AND NO-OP IN SILENCE. The last three files to touch this body shipped
-- under a RESTATEMENT-DEBT-ACK waiver saying, in the diff, that this was owed.
--
-- This file pays it. After it, hr_apply's chain depth is 0 and the ACK is
-- retired.
--
-- ── WHAT THIS FILE IS, AND HOW IT WAS MADE ──────────────────────────────────
-- The body below was NOT typed. It is `pg_get_functiondef` taken at CHAIN END —
-- the full repo chain replayed into PGlite in apply order, the installed text
-- read back — and then cleaned in exactly two mechanical ways:
--
--   1. COMMENTS. A section index (below) and, on each section header that did
--      not already name one, one line naming the migration that INTRODUCED that
--      section. The archaeology is the expensive part of this body; forty-four
--      patches of it are about WHY a rule exists and which incident bought it,
--      and a restatement that dropped that would trade one kind of unreadable
--      for another. Nothing was deleted. Attribution was DERIVED, by finding
--      which migration's own text carries each header line.
--
--   2. TWO DEAD DECLARATIONS, and nothing else:
--        c_max_hf_per_apply  (2026-09-08-hearthfind.sql) — declared, read by
--                            nothing. The rule it names is real and structural:
--                            the `hearthfind` key is an OBJECT, so the body
--                            cannot see two. The prose stays; the constant goes.
--        v_buff_old          (2026-09-13-consumable-buffs.sql) — orphaned when
--                            2026-09-13-buff-segments.sql replaced the max()
--                            merge with per-segment stacking. That file's own
--                            header says it: "`v_buff_old` keeps its declare and
--                            stops being read."
--      Neither has a reader and neither has a side-effecting initialiser, so
--      removing them cannot change behaviour — and §0 below PROVES it by
--      execution rather than by assertion in prose: it counts each identifier in
--      the comment-stripped text of the body it is about to replace and refuses
--      the whole migration unless the count is exactly 1 (the declaration
--      itself). §0 also proves the body contains no dynamic `execute`, which is
--      the only place a reader could have hidden from a textual count.
--
-- NO OTHER CODE CHANGED. Not a clamp, not a gate, not an order of operations.
--
-- ── THE PROOF OF NO BEHAVIOUR CHANGE (measured, not asserted) ───────────────
-- Both hashes below are over `pg_get_functiondef`, which is what every guard in
-- this repo hashes.
--
--   normalised md5 = md5(regexp_replace(def, '[[:space:]]+', ' ', 'g'))
--   code md5       = the same after `--`-to-end-of-line comments are removed
--                    (tests/live-hash-drift.mjs `stripSqlComments`, the function
--                    behind --codediff)
--
--   chain end, before any cleanup     norm 85d9687cdd8f19b3c773b660ebea9117
--   THIS FILE'S BODY, before cleanup  norm 85d9687cdd8f19b3c773b660ebea9117
--                                     ^ byte-for-byte the same body. The capture
--                                       is faithful; that is step one and it is
--                                       measured, not claimed.
--
--   chain end, code only              3f0c3a95621d3132bebb85c2f16df333  53962 ch
--   THIS FILE, after cleanup, code    820c455ab559cbdd8fe364d264e4260c  53906 ch
--
-- The code hash moves by exactly the two deleted declaration lines and nothing
-- else; the comment-only half of the cleanup does not move it at all. Measured
-- as a TOKEN DIFF, not inferred from the 56-character delta:
--
--   only in the chain-end body:  `c_max_hf_per_apply constant int := 1;`
--                                `v_buff_old jsonb;`
--   only in the restatement:     (nothing)
--
-- Everything either side of those two declarations is byte-identical. §0 pins
-- the FIRST of those code hashes (the body being replaced) and §3 pins the
-- SECOND (the body installed), so this file refuses to run against a body it
-- does not recognise and refuses to claim success if it installed something
-- else. Both pins are over CODE, not raw text, deliberately: a comment may be
-- improved without ceremony, and any executable change fails loudly.
--
-- ── LIVE vs REPLAY, STATED PLAINLY ──────────────────────────────────────────
-- tests/live-hash-drift.baseline.json, measured 2026-09-14 01:17 UTC:
--     hr_apply   live 44ea47b512756fda643335e6913bbb88  (norm_len 133031)
--                replay 85d9687cdd8f19b3c773b660ebea9117 (norm_len 133762)
--                --codediff: CODE-IDENTICAL, 53962 code chars; the 731-char
--                delta is a pre-existing COMMENT/whitespace carry-over in the
--                deployed text (mojibake from an old apply), not code.
--
-- This restatement is authored against the REPLAY text, because the replay text
-- is the repo's own chain and the live text is the same executable text with
-- damaged comment bytes. 53962 is also the code length this file's own capture
-- measures, which is the cross-check that the two really are the same code.
-- After this file applies, live == replay EXACTLY: the carry-over dies with the
-- restatement, because the body is no longer spliced into whatever production
-- happened to be holding — it is written whole, from this file.
--
-- ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────────
-- It does not touch hr_state_of (24 deep, slice 7's next target), or any of the
-- eleven other grandfathered chains. It adds no capability, no key, no clamp and
-- no column. It is reversible in the only sense a restatement can be: the
-- previous body is `git show` on any of the thirteen files that built it plus a
-- replay, and re-applying the chain WITHOUT this file rebuilds it exactly — the
-- proof being that this file's pre-cleanup capture hashes identically to it.
--
-- ── SECTIONS, IN EXECUTION ORDER ────────────────────────────────────────────
-- Line numbers are relative to the first line of the body (the restatement
-- marker is 1; `declare` is 5).
-- Every section header in the body names the file that introduced it; this is
-- the same list, in one place, so the shape of the engine is readable without
-- scrolling 2,600 lines.
--
--     11  WHAT THESE CLAMPS ACTUALLY BUY, STATED HONESTLY (Security, 2026-08  2026-08-11-apply-engine.sql
--    419  (0) THE IDENTITY SEAM (review S1)                                   2026-08-11-apply-engine.sql
--    473  (1) Rate limit. OUTSIDE the protected block on purpose: a rejected  2026-08-11-apply-engine.sql
--    500  (2) Serialise this character. hashtextextended over user+slot; the  2026-08-11-apply-engine.sql
--    505  (3) IDEMPOTENCY (review S8). Under the lock, so the check and the   2026-08-11-apply-engine.sql
--    526  ONE NAMESPACE, TWO KINDS OF KEY (review S6)                         2026-08-11-apply-engine.sql
--    555    AND A REPLAY MUST BE A REPLAY ON THE SAME CHARACTER (b346)        2026-08-15-intent-key-hygiene.sql
--    614  THE PROTECTED BLOCK                                                 2026-08-11-apply-engine.sql
--    624    (4) OPTIMISTIC CONCURRENCY — MANDATORY (review S9). Revision 1 s  2026-08-11-apply-engine.sql
--    632    GOLD                                                              2026-08-11-apply-engine.sql
--    647    GEMS (review S5)                                                  2026-08-11-apply-engine.sql
--    665    ITEMS ─ the delta is signed; a spend and a gain are the same cod  2026-08-11-apply-engine.sql
--    704    XP ─ monotonic. A negative XP delta is a caller bug, and accepti  2026-08-11-apply-engine.sql
--    754    EQUIPMENT (review S4)                                             2026-08-11-apply-engine.sql
--    847    ENCHANTING (ELEMENTS v1)                                          2026-08-18-enchant.sql
--    918    BANK CAP ─ counted once, AFTER items and equipment, because both  2026-08-11-apply-engine.sql
--    938    FARM ─ planting stamps the SERVER clock. `planted_at` can never   2026-08-11-apply-engine.sql
--    972    PROGRESS (review S13)                                             2026-08-11-apply-engine.sql
--   1014    PROGRESS CLAIM ─ the only path to 'claimed', and it requires the  2026-08-11-apply-engine.sql
--   1037    ACTIVITY                                                          2026-08-11-apply-engine.sql
--   1087    (4a-ii) THE GATHERING TOOL CARRY (b348)                           2026-08-15-tool-carry.sql
--   1131    (4a-iii) THE IN-FLIGHT FIGHT (Phase 0)                            2026-08-17-fight-carry.sql
--   1214    (4a-iv) HIRED-WORKER PRODUCTION (worker-settlement slice)         2026-08-25-workers.sql
--   1227    (4a-v) THE RECOVERY LINE (First-Night Idle Rescue). A death inte  2026-09-06-recovering-until.sql
--   1289    (4a-d) THE DEATH LEDGER (rev. 2, N3). SHAPE ONLY, and refused ra  2026-09-06-recovering-until.sql
--   1322    (4a-r) THE LAST AWAY-CLASSIFIED RECEIPT (2026-09-07 ruling).      2026-09-07-last-away-receipt.sql
--   1551    (4a-c) THE RETREAT COUNTER (Recovery rev. 3). Consecutive falls   2026-09-07-retreat.sql
--   1585    (4a-h) THE HEARTHFIND. Shape first, then the catalogue, then the  2026-09-08-hearthfind.sql
--   1663    (4a-h2) THE ONE DOOR. A hearthfind trophy may NOT be minted thro  2026-09-08-hearthfind.sql
--   1679    (4a-b) CONSUMABLE BUFFS                                           2026-09-13-consumable-buffs.sql
--   1724      (4a-b2) THE BUFF MUST BE PAID FOR (F3, Security 2026-09-13)     2026-09-13-buff-apply-coupling.sql
--   1798      THE CELLAR (2026-09-13 step 3)                                  2026-09-13-buff-cellar-scale.sql
--   1941    (4b) THE LEDGER-DERIVED DAILY BUDGET (C5 / X3)                    2026-08-11-apply-engine.sql
--   2011    ACCRUAL WATERMARK (review S19)                                    2026-08-11-apply-engine.sql
--   2030    S5 (HALF) — AN EQUIPMENT OR ACTIVITY CHANGE CLOSES THE WINDOW     2026-08-11-apply-engine.sql
--   2063    (4c) THE DAILY SETTLE STREAK (Slice 3)                            2026-08-21-streak-state.sql
--   2187    THE VOID (Phase 0) — the SECOND, INDEPENDENT half of the rule     2026-08-17-fight-carry.sql
--   2208    JOURNAL ─ ONE row per apply. Per-item rows would multiply the wr  2026-08-11-apply-engine.sql
--   2302      (0) THE DISCARD, JOURNALLED. If the engine rolled more than on  2026-09-08-hearthfind.sql
--   2440    THE SERVER'S COUNTED RENOWN, RATCHETED HERE (2026-09-12)          2026-09-12-renown-high-projection.sql
--   2522  (5) Record the DECISION under the idempotency key. This statement   2026-08-11-apply-engine.sql
--   2530  ONE EXCEPTION: A VERSION CONFLICT RELEASES THE KEY (b346)           2026-08-15-intent-key-hygiene.sql
--   2573  (6) THE REJECTION RECORD (review R4). Also outside the protected b  2026-08-11-apply-engine.sql
--
-- ── §0 PREFLIGHT — WHAT ARE WE REPLACING, AND ARE THE TWO REMOVALS DEAD? ────
-- A restatement is the one migration shape that can silently DISCARD work: it
-- overwrites a body wholesale, so if production had drifted from the chain — a
-- hotfix, a patch applied out of order, a file this branch has not seen — the
-- drift would vanish without a trace and without an error. So this file refuses
-- to run unless the body it is about to replace is one of exactly TWO bodies it
-- can name: its PREDECESSOR, or the body it installs itself (a re-apply).
--
-- ⚠ THE RE-APPLY BRANCH KEYS ON THE HASH, NOT ON A BANNER (Security C2,
--   2026-09-14). The first draft skipped the pin whenever the installed text
--   carried this file's banner comment — which a future anchored patch would
--   leave intact while changing the code underneath it, so a re-apply would have
--   silently discarded that patch: exactly the failure the pin exists to stop,
--   reintroduced through its own escape hatch. Now the skip requires the
--   installed CODE to equal what this file installs, and anything else raises.
--
-- Both pins are over CODE (comments stripped), so the live body's comment-byte
-- carry-over passes and any executable difference does not. If this block ever
-- raises, do NOT edit a constant: re-derive the restatement from the chain
-- (`node tests/schema-replay.mjs` + pg_get_functiondef) and review the diff.
--
-- The second half of the block is the dead-code proof. It is executed, not
-- argued: each identifier must appear EXACTLY ONCE in the comment-stripped body
-- (its own declaration), and the body must contain no dynamic `execute` in which
-- a reader could hide from a textual count.
do $pre$
declare
  v_def  text;
  v_code text;
  v_n    int;
  c_sig  constant text := 'public.hr_apply(uuid,int,bigint,uuid,jsonb)';
  -- The body at chain end (= production, code-identically) on 2026-09-14.
  c_code_before constant text := '3f0c3a95621d3132bebb85c2f16df333';
  -- …and the body §1 installs. Kept in step with §3(a)'s constant by the
  -- generator; a re-apply is recognised by THIS and by nothing else.
  c_code_after  constant text := '820c455ab559cbdd8fe364d264e4260c';
begin
  if to_regprocedure(c_sig) is null then
    raise exception 'hr-apply-restatement §0: hr_apply does not exist — this file RESTATES a body, it '
                    'does not create one. Apply the chain first (tests/schema-apply-order.json).';
  end if;
  v_def  := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');
  -- `--` never occurs inside a string literal in this body (verified over the
  -- chain-end text before this file was cut), so a line-comment strip is exact.
  v_code := btrim(regexp_replace(
              regexp_replace(v_def, '--[^' || chr(10) || ']*', '', 'g'),
              '[[:space:]]+', ' ', 'g'));

  if md5(v_code) = c_code_after then
    -- A RE-APPLY. The installed code IS what §1 installs, so there is no
    -- predecessor left to pin and nothing to prove dead. Idempotent by hash.
    raise notice 'hr-apply-restatement §0: already restated (code %) — re-applying is a no-op',
                 c_code_after;
  elsif md5(v_code) <> c_code_before then
    raise exception 'hr-apply-restatement §0: the installed hr_apply is NEITHER the body this file was '
                    'cut from (%) NOR the body it installs (%) — it is % (code length %). Something '
                    'else has patched it. A restatement applied over a body it cannot name would '
                    'DISCARD whatever made them differ. Re-derive the restatement from the chain '
                    'instead of editing a constant.',
                    c_code_before, c_code_after, md5(v_code), length(v_code);
  else
    if strpos(lower(v_code), 'execute ') > 0 then
      raise exception 'hr-apply-restatement §0: the body contains dynamic SQL — a textual count can no '
                      'longer prove a declaration is unread, so the two removals are not proven dead';
    end if;

    -- THE TWO REMOVALS, PROVEN DEAD BY EXECUTION.
    v_n := (length(v_code) - length(replace(v_code, 'c_max_hf_per_apply', ''))) / length('c_max_hf_per_apply');
    if v_n <> 1 then
      raise exception 'hr-apply-restatement §0: c_max_hf_per_apply occurs % time(s) in the code text, '
                      'expected exactly 1 (its declaration). Something READS it — removing it would be '
                      'a behaviour change.', v_n;
    end if;
    v_n := (length(v_code) - length(replace(v_code, 'v_buff_old', ''))) / length('v_buff_old');
    if v_n <> 1 then
      raise exception 'hr-apply-restatement §0: v_buff_old occurs % time(s) in the code text, expected '
                      'exactly 1 (its declaration). Something READS it — removing it would be a '
                      'behaviour change.', v_n;
    end if;
    raise notice 'hr-apply-restatement §0: predecessor recognised (code %), and both removals are unread',
                 c_code_before;
  end if;
end $pre$;

-- ── §1 THE RESTATEMENT ──────────────────────────────────────────────────────
-- hr_apply restated 2026-09-14 — chain depth 0. Do not patch this body with an
-- anchored replace(); edit it HERE, in the file, where a reviewer can read it.

create or replace function public.hr_apply(p_user uuid, p_slot integer, p_version bigint, p_intent_id uuid, p_delta jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $hr_apply$
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
    -- THE RETREAT (Recovery rev. 3): consecutive falls with no kill between
    -- them. An ABSOLUTE non-negative integer. Engine output, never client input;
    -- validated at (4a-c) below and written in the SET clause. It moves NO VALUE
    -- - it gates nothing a player wants and enters no conservation sum - so it
    -- is checked for SHAPE and BLAST RADIUS only. See the file header's
    -- "raise/clamp rule" for why it is not raise-only.
    'consec_falls',
    -- 2026-09-07 ruling: THE LAST AWAY-CLASSIFIED RECEIPT. An ABSOLUTE jsonb
    -- object, or an explicit null VOID. ENGINE OUTPUT, never client input:
    -- validated at (4a-r) below against the LOCKED row and the server clock,
    -- and written in the SET clause. It moves NO VALUE - it DESCRIBES the value
    -- the rest of this same delta moved - so it enters no conservation sum.
    'last_away_receipt',
    -- First-Night Idle Rescue: THE RECOVERY LINE. An ABSOLUTE timestamptz, or an
    -- explicit null VOID meaning "back on your feet". Engine output, never
    -- client input; validated at (4a-v) below and written in the SET clause.
    'recovering_until',
    -- Recovery rev. 2 (N3): THE DEATH LEDGER. An ARRAY of server-derived death
    -- records, fanned out to one player_ledger row each at (4z). Engine output.
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
    'version_conflict', 'bad_consec_falls', 'bad_recovering', 'bad_deaths', 'bad_receipt',
    'bad_fight', 'bad_fight_hp', 'bad_fight_kills', 'unknown_monster',
    'unknown_skill', 'unknown_item', 'unknown_activity',
    'bad_equip', 'unknown_equip_slot', 'wrong_slot', 'requirement_not_met',
    'too_many_equip_ops', 'bad_enchant'];
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
  v_new_gold bigint; v_new_gems bigint;
  v_act   jsonb; v_accrued timestamptz; v_rows int;
  v_meta  jsonb;
  v_carry jsonb;
  -- Phase 0. The proposed in-flight fight, and the ceiling its HP is re-derived
  -- against. `v_fight_max` comes out of hr_activities — the GENERATED
  -- catalogue — so the clamp is a fact about src/data/monsters.js rather than a
  -- number somebody typed into SQL and stopped maintaining.
  -- First-Night Idle Rescue: the validated recovery line. NULL here means
  -- either "the key was absent" or "the key was an explicit void"; the SET
  -- clause distinguishes those with `p_delta ? 'recovering_until'`, never with
  -- this variable. c_max_recover_ms is the blast radius on how far ahead a line
  -- may be stamped: the ladder's own cap is 3,840,000 ms (64 minutes) and this
  -- is 70 minutes - the cap plus commit slack, and nothing like a week.
  v_recover timestamptz;
  c_max_recover_ms constant int := 4200000;
  -- Recovery rev. 2 (N3): the death-ledger fan-out's loop variable and its
  -- ceiling. 24 is above the ~20 deaths the ladder's own 64-minute cap permits
  -- in a twelve-hour night, so an honest span is never truncated and a
  -- pathological one is bounded rather than able to write a row per tick.
  v_death jsonb;
  c_max_death_rows constant int := 24;
  -- 2026-09-07 ruling: the validated away receipt. NULL here means either
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
  -- Recovery rev. 3: the validated retreat counter. c_max_consec_falls is a
  -- BLAST RADIUS, not a balance number - the rungs live in src/core/away.js
  -- (RETREAT_FOODLESS_FALLS 3, RETREAT_ANY_FALLS 6) and a designer must be able
  -- to move them without an SQL migration. This only stops a compromised engine
  -- parking an absurd number in a column the client reads.
  v_consec numeric;
  c_max_consec_falls constant int := 64;
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
    v_new_gems := v_st.gems;
    if p_delta ? 'gems' then
      v_n := coalesce((p_delta->>'gems')::bigint, 0);
      if abs(v_n) > c_max_gem_delta then
        perform public.hr_reject('gem_clamp', jsonb_build_object('limit', c_max_gem_delta));
      end if;
      v_new_gems := v_st.gems + v_n;
      if v_new_gems < 0 then
        perform public.hr_reject('insufficient_gems',
                                 jsonb_build_object('have', v_st.gems, 'need', -v_n));
      end if;
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
        if not exists (select 1 from public.hr_activities
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
    --    introduced by 2026-09-06-recovering-until.sql
    -- (4a-v) THE RECOVERY LINE (First-Night Idle Rescue). A death interrupts
    -- a run; it does not terminate it. The character is Knocked Out until this
    -- ABSOLUTE instant, and both callers - the away span (src/core/combat-sim.js
    -- simulateSpan) and the live combat-start intent (set-activity.js) - simply
    -- refuse to swing while it runs. One column, one rule, no second code path.
    --
    -- `null` is a legal and MEANINGFUL value: the explicit VOID that says "this
    -- character is up". The engine sends it on every window that ended with
    -- nobody face-down, exactly as it sends `fight = {}` for "no fight in
    -- flight" - the honest statement, not merely the absence of one. Without it
    -- a stale line would survive forever and a character could stay knocked out.
    if p_delta ? 'recovering_until' then
      if jsonb_typeof(p_delta->'recovering_until') = 'null' then
        v_recover := null;
      elsif jsonb_typeof(p_delta->'recovering_until') <> 'string' then
        perform public.hr_reject('bad_recovering',
          jsonb_build_object('type', jsonb_typeof(p_delta->'recovering_until')));
      else
        begin
          v_recover := (p_delta->>'recovering_until')::timestamptz;
        exception when others then
          perform public.hr_reject('bad_recovering', jsonb_build_object('why', 'unparseable'));
        end;
        -- THE CEILING, against the SERVER CLOCK. now(), never a delta value.
        if v_recover > now() + make_interval(secs => c_max_recover_ms / 1000.0) then
          perform public.hr_reject('bad_recovering',
            jsonb_build_object('why', 'too far ahead', 'until', p_delta->'recovering_until'));
        end if;
      end if;

      -- SECURITY F1 - THE NO-SHORTENING FLOOR. The ceiling above answers "is
      -- this line too far ahead"; nothing answered "may this call SHORTEN or
      -- CANCEL a knockout that is still running", and the answer used to live
      -- only in the engine (src/core/combat-sim.js:632/694 preserve-or-clear).
      -- An invariant enforced solely in the Edge Function is an invariant a
      -- forged or compromised caller does not have: one settle carrying
      -- recovering_until = null while 60 minutes remained would void the column
      -- that arms 1 and 2 of this very file are built on, and the Recovery Rule
      -- with it.
      --   REJECT when the STORED line is still in the future and the proposal
      --   is NULL or EARLIER. Raise-forward stays legal (a later instant is a
      --   NEW death, already bounded by the ceiling above) and so does equality
      --   (the ordinary settle re-states the stored line). A line that has
      --   ALREADY EXPIRED is freely clearable, which is the engine's honest
      --   "this character is up" and needs no privilege.
      --   THE SANCTIONED CURE DOES NOT COME THROUGH HERE: hr_rest takes the
      --   same advisory key, charges real provisions and issues its OWN update
      --   (recovering_until = null) at its step (f), so this floor needs no
      --   exception and can be absolute.
      --   v_st is the row this function already holds under "for update", and
      --   now() is the server clock — no extra query, no client instant.
      if v_st.recovering_until is not null
         and v_st.recovering_until > now()
         and (v_recover is null or v_recover < v_st.recovering_until) then
        perform public.hr_reject('bad_recovering',
          jsonb_build_object('why', 'would shorten an active knockout',
                             'stored', v_st.recovering_until,
                             'proposed', p_delta->'recovering_until'));
      end if;
    end if;

    --    introduced by 2026-09-06-recovering-until.sql
    -- (4a-d) THE DEATH LEDGER (rev. 2, N3). SHAPE ONLY, and refused rather than
    -- truncated: an over-long array means the engine proposed something the
    -- ladder cannot produce, and quietly writing the first 24 of it would turn
    -- an engine bug into a plausible-looking audit trail. Every FIELD is
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
        -- The recovery a row CLAIMS may not exceed the same blast radius the
        -- line itself is held to. One ceiling, two readers.
        if coalesce((v_death->>'recovery_ms')::bigint, 0) < 0
           or coalesce((v_death->>'recovery_ms')::bigint, 0) > c_max_recover_ms then
          perform public.hr_reject('bad_deaths',
            jsonb_build_object('why', 'recovery_ms out of range', 'ms', v_death->'recovery_ms'));
        end if;
      end loop;
    end if;

    --    introduced by 2026-09-07-last-away-receipt.sql
    -- (4a-r) THE LAST AWAY-CLASSIFIED RECEIPT (2026-09-07 ruling).
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

    --    introduced by 2026-09-07-retreat.sql
    -- (4a-c) THE RETREAT COUNTER (Recovery rev. 3). Consecutive falls with no
    -- kill between them; ANY kill resets it to 0, which is what makes the rule
    -- "consecutive" rather than "N a day". Both callers - the away span
    -- (src/core/combat-sim.js simulateSpan) and the live tick through the same
    -- resolveDeath - move it through ONE engine, so there is no second code path
    -- and no second opinion about what the count is.
    --
    -- It may go DOWN as well as up, unlike recovering_until (which is
    -- raise-forward-only while running, 2026-09-06-cadence-recovery-floor.sql):
    -- a kill legitimately resets it to zero and a raise-only column could not
    -- express the rule. That is safe because the column moves no value - see the
    -- file header's "raise/clamp rule" for the full security argument.
    --
    -- FRACTIONS ARE REFUSED, not truncated. `::int` would silently accept 2.9 as
    -- 2 and the engine would be one fall out with nothing to show for it; a
    -- fractional count is an engine bug and must surface as one.
    if p_delta ? 'consec_falls' then
      if jsonb_typeof(p_delta->'consec_falls') <> 'number' then
        perform public.hr_reject('bad_consec_falls',
          jsonb_build_object('type', jsonb_typeof(p_delta->'consec_falls')));
      end if;
      v_consec := (p_delta->>'consec_falls')::numeric;
      if v_consec <> trunc(v_consec) then
        perform public.hr_reject('bad_consec_falls',
          jsonb_build_object('why', 'not an integer', 'n', p_delta->'consec_falls'));
      end if;
      if v_consec < 0 or v_consec > c_max_consec_falls then
        perform public.hr_reject('bad_consec_falls',
          jsonb_build_object('why', 'out of range', 'n', p_delta->'consec_falls',
                             'limit', c_max_consec_falls));
      end if;
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
        'scale', to_jsonb(v_buff_scale)));
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
           gems = v_new_gems,
           hp   = case when p_delta ? 'hp'
                       then greatest(0, least(max_hp, coalesce((p_delta->>'hp')::int, hp)))
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
           -- First-Night Idle Rescue: an ABSOLUTE, validated at (4a-v). Absent
           -- key = untouched; present = set, INCLUDING to null (the explicit
           -- void that means "back on your feet").
           -- NOT voided by an `activity` key, unlike `fight` immediately below:
           -- being knocked out is a property of the CHARACTER, so a player who
           -- switches to fishing while face-down is still face-down. Clearing it
           -- on a switch would make "switch away, switch back" a free cure.
           -- The last away-classified receipt (2026-09-07 ruling). An ABSOLUTE,
           -- validated at (4a-r). Absent key = untouched; present = set,
           -- INCLUDING to null. NOT voided by an activity switch: the night
           -- already happened and a pointer change does not un-happen it.
           last_away_receipt = case when p_delta ? 'last_away_receipt'
                                    then v_receipt else last_away_receipt end,
           recovering_until = case when p_delta ? 'recovering_until'
                                   then v_recover else recovering_until end,
           -- Recovery rev. 3: an ABSOLUTE count, validated at (4a-c). Absent key =
           -- untouched; present = set. NOT voided by an `activity` key (see 3e).
           consec_falls = case when p_delta ? 'consec_falls'
                               then v_consec::int else consec_falls end,
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
            or active_id is distinct from (fight->>'monster'));

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
              where dk <> all (array['gold','gems','items','xp','equip','journal']))
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
       v_gold_in, v_xp_in, v_qty_in, v_gems_in,
       jsonb_build_object('delta', v_meta) || coalesce(v_j->'meta', '{}'::jsonb));

    if p_delta ? 'deaths' then
      for v_death in select value from jsonb_array_elements(p_delta->'deaths') loop
        insert into public.player_ledger
          (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, meta)
        values
          (v_uid, v_slot, 'combat', 'death', 0, 0, 0, 0,
           jsonb_build_object(
             'monster',          left(coalesce(v_death->>'monster', ''), 64),
             'recovery_ms',      coalesce((v_death->>'recovery_ms')::bigint, 0),
             'deaths_today',     coalesce((v_death->>'deaths_today')::bigint, 0),
             'deaths_lifetime',  coalesce((v_death->>'deaths_lifetime')::bigint, 0),
             'resume_hp',        coalesce((v_death->>'resume_hp')::bigint, 0),
             'auto_eat_enabled', coalesce((v_death->>'auto_eat_enabled')::boolean, false),
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
        select count(*) + 1 into v_hf_nth
          from public.player_ledger
         where kind = 'hearthfind' and item_id = v_hf_item;

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
        select count(distinct item_id) into v_hf_set
          from public.player_ledger
         where user_id = v_uid and slot = v_slot and kind = 'hearthfind';
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

  return v_out;
end $hr_apply$;

-- ── §2 THE GRANT POSTURE ────────────────────────────────────────────────────
-- `create or replace` PRESERVES an existing ACL, so these three lines are not
-- what keeps the engine out of the browser today — §3(b) proves that by asking
-- has_function_privilege rather than by trusting them. They are here because a
-- restatement is the file a future operator will copy when they restate the next
-- body, and a template that omits the revoke is how one gets omitted for real.
-- `revoke ... from public` FIRST, then the single grant (CLAUDE.md §2).
revoke all    on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
grant  execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── §3 SELF-CHECK (§4) — BY EXECUTION, WITH CONTROLS ───────────────────────
-- A restatement's failure mode is SUBTRACTION: a section silently missing from
-- the rewritten body. Markers alone cannot see that (a marker can be present in
-- a block that no longer runs), and execution alone cannot see it either (a
-- delta kind nobody drives is a delta kind nobody notices). So this block does
-- both, in this order:
--
--   (a) THE PIN AND THE SECTIONS. The installed body's CODE hash equals the
--       value this file says it installs, and one DERIVED, section-unique marker
--       per section is present IN THE COMMENT-STRIPPED TEXT. The pin is the
--       strong half — it is a statement about the whole body, not about forty-odd
--       strings — and the markers are what names the section that went missing.
--   (b) REACHABILITY AND IDENTITY. No client role can execute hr_apply, hr_engine
--       still can, and the body is still owned by postgres — SECURITY DEFINER
--       runs as its owner. Without this, every assertion below is decoration.
--   (c) THE TWO REMOVALS are gone, and the prose that replaced them is not.
--   (d)-(l) A REPRESENTATIVE DELTA OF EVERY KIND, driven at the restated body
--       inside a subtransaction discarded by a sentinel raise (HR841), so the
--       whole block is NET-ZERO on production and the leak check at the end says
--       so rather than assuming it.
--   (m) THE FORGED-KEY REFUSALS, BY NAME. A delta that names a key the contract
--       does not know, a buff that tries to author its own strength, a
--       hearthfind that names an item the catalogue does not carry, and a stale
--       version. Each must be refused with the CODE it was refused with before
--       the restatement — the error taxonomy is a contract the Edge degrade
--       ladder reads, and a restatement that renamed one would break recovery
--       while every happy path stayed green.
do $mig$
declare
  v_def text; v_code text; v_r jsonb; v_ver bigint; v_rows int; v_n int;
  v_item text; v_food text; v_seed text; v_crop text; v_prod text;
  v_rune text; v_elem text; v_wear text; v_wslot text; v_akind text; v_aid text; v_skill text;
  v_qty bigint; v_gold bigint; v_xp bigint; v_led_hi bigint; v_meta jsonb;
  v_missing text := '';
  v_uid  constant uuid := '000000a9-0000-0000-0000-0000000000a9';
  c_sig  constant text := 'public.hr_apply(uuid,int,bigint,uuid,jsonb)';
  c_j    constant jsonb := '{"kind":"admin","intent":"hr-apply-restatement:probe"}'::jsonb;
  -- The body THIS FILE installs, comment-stripped. Its predecessor's is pinned
  -- in §0; the two differ by the two dead declarations and by comments only.
  c_code_after constant text := '820c455ab559cbdd8fe364d264e4260c';
  -- ── §3(a)'s MARKERS (Security C1, 2026-09-14) ────────────────────────────
  -- ONE PER SECTION OF THE BODY, in execution order, DERIVED rather than typed:
  -- each is the first executable line inside its section whose normalised form
  -- occurs EXACTLY ONCE in the whole comment-stripped body. Both halves are
  -- load-bearing. A marker that lives in a COMMENT cannot detect the deletion of
  -- the code it describes, and a marker that also occurs in another section
  -- survives that section's deletion — the hand-typed first draft had both
  -- faults (`hr_rate_gate` occurred nowhere at all; the body calls hr_rate_ok).
  -- They are matched against v_code, the comment-STRIPPED text, for the same
  -- reason. Regenerated with the body, so the list cannot rot behind it.
  c_markers constant text[] := array[
      -- WHAT THESE CLAMPS ACTUALLY BUY, STATED HONESTLY (Security, 2026-08-1
    'c_max_gold_delta constant bigint := 50000000;',
      -- (0) THE IDENTITY SEAM (review S1)
    'v_role := coalesce(nullif(current_setting(''role'', true), ''none''), session_user);',
      -- (1) Rate limit. OUTSIDE the protected block on purpose: a rejected c
    'if not public.hr_rate_ok(v_uid, ''apply'', 240, interval ''1 minute'') then',
      -- (2) Serialise this character. hashtextextended over user+slot; the l
    'perform pg_advisory_xact_lock(hashtextextended(v_uid::text || '':'' || v_slot::text, 0));',
      -- (3) IDEMPOTENCY (review S8). Under the lock, so the check and the cl
    'v_this_intent := p_delta #>> ''{journal,intent}'';',
      -- ONE NAMESPACE, TWO KINDS OF KEY (review S6)
    'select result, intent, slot into v_prev, v_prev_intent, v_prev_slot',
      -- AND A REPLAY MUST BE A REPLAY ON THE SAME CHARACTER (b346)
    'if v_prev_intent is distinct from v_this_intent',
      -- THE PROTECTED BLOCK
    'select * into v_st from public.player_state',
      -- (4) OPTIMISTIC CONCURRENCY — MANDATORY (review S9). Revision 1 skipp
    'if p_version is null or p_version <> v_st.version then',
      -- GOLD
    'v_new_gold := v_st.gold;',
      -- GEMS (review S5)
    'v_new_gems := v_st.gems;',
      -- ITEMS ─ the delta is signed; a spend and a gain are the same code ─
    'if p_delta ? ''items'' then',
      -- XP ─ monotonic. A negative XP delta is a caller bug, and accepting o
    'if jsonb_typeof(p_delta->''xp'') <> ''object'' then perform public.hr_reject(''bad_xp''); end if;',
      -- EQUIPMENT (review S4)
    'if p_delta ? ''equip'' then',
      -- ENCHANTING (ELEMENTS v1)
    'if p_delta ? ''enchant'' then',
      -- BANK CAP ─ counted once, AFTER items and equipment, because both can
    'if (p_delta ? ''items'') or (p_delta ? ''equip'') then',
      -- FARM ─ planting stamps the SERVER clock. `planted_at` can never be
    'if p_delta ? ''farm'' then',
      -- PROGRESS (review S13)
    'if p_delta ? ''progress'' then',
      -- PROGRESS CLAIM ─ the only path to 'claimed', and it requires the row
    'if p_delta ? ''progress_claim'' then',
      -- ACTIVITY
    'v_act := p_delta->''activity'';',
      -- (4a-ii) THE GATHERING TOOL CARRY (b348)
    'if p_delta ? ''tool_carry'' then',
      -- (4a-iii) THE IN-FLIGHT FIGHT (Phase 0)
    'if p_delta ? ''fight'' then',
      -- (4a-iv) HIRED-WORKER PRODUCTION (worker-settlement slice)
    'if p_delta ? ''recovering_until'' then',
      -- (4a-v) THE RECOVERY LINE (First-Night Idle Rescue). A death interrup
    'if jsonb_typeof(p_delta->''recovering_until'') = ''null'' then',
      -- (4a-d) THE DEATH LEDGER (rev. 2, N3). SHAPE ONLY, and refused rather
    'if jsonb_typeof(p_delta->''deaths'') <> ''array'' then',
      -- (4a-r) THE LAST AWAY-CLASSIFIED RECEIPT (2026-09-07 ruling).
    'if p_delta ? ''last_away_receipt'' then',
      -- (4a-c) THE RETREAT COUNTER (Recovery rev. 3). Consecutive falls with
    'if p_delta ? ''consec_falls'' then',
      -- (4a-h) THE HEARTHFIND. Shape first, then the catalogue, then the pai
    'v_hf := p_delta->''hearthfind'';',
      -- (4a-h2) THE ONE DOOR. A hearthfind trophy may NOT be minted through 
    'if p_delta ? ''items'' and jsonb_typeof(p_delta->''items'') = ''object'' then',
      -- (4a-b) CONSUMABLE BUFFS
    'if p_delta ? ''buff_apply'' then',
      -- (4a-b2) THE BUFF MUST BE PAID FOR (F3, Security 2026-09-13)
    'if coalesce(jsonb_typeof(p_delta->''items''), '''') <> ''object''',
      -- THE CELLAR (2026-09-13 step 3)
    'select coalesce(max(u.level), 0) into v_buff_rung',
      -- (4b) THE LEDGER-DERIVED DAILY BUDGET (C5 / X3)
    'v_gold_in := greatest(0, coalesce((p_delta->>''gold'')::bigint, 0));',
      -- ACCRUAL WATERMARK (review S19)
    'v_accrued := v_st.accrued_to;',
      -- S5 (HALF) — AN EQUIPMENT OR ACTIVITY CHANGE CLOSES THE WINDOW
    'if p_delta ? ''equip'' or p_delta ? ''activity'' or p_delta ? ''enchant'' then',
      -- (4c) THE DAILY SETTLE STREAK (Slice 3)
    'v_streak_day := v_st.streak_day_key;',
      -- THE VOID (Phase 0) — the SECOND, INDEPENDENT half of the rule
    'and fight <> ''{}''::jsonb',
      -- JOURNAL ─ ONE row per apply. Per-item rows would multiply the write
    'v_j := coalesce(p_delta->''journal'', ''{}''::jsonb);',
      -- (0) THE DISCARD, JOURNALLED. If the engine rolled more than one find
    'if coalesce(v_hf_drop, 0) > 0 then',
      -- THE SERVER'S COUNTED RENOWN, RATCHETED HERE (2026-09-12)
    'update public.player_state ps',
      -- (5) Record the DECISION under the idempotency key. This statement is
    'and coalesce(v_out->>''ok'', ''false'') <> ''true''',
      -- ONE EXCEPTION: A VERSION CONFLICT RELEASES THE KEY (b346)
    'and v_out->>''error'' = any (c_release_codes) then',
      -- (6) THE REJECTION RECORD (review R4). Also outside the protected blo
    'if coalesce(v_out->>''ok'', ''false'') <> ''true'' then'
  ];
begin
  v_def  := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');
  v_code := btrim(regexp_replace(
              regexp_replace(v_def, '--[^' || chr(10) || ']*', '', 'g'),
              '[[:space:]]+', ' ', 'g'));

  -- ── (a) THE PIN, AND ONE MARKER PER SECTION ─────────────────────────────
  if md5(v_code) <> c_code_after then
    raise exception 'hr-apply-restatement §3(a): the installed body is not the one this file states it '
                    'installs (code md5 %, expected %). Regenerate the file; do not edit the constant.',
                    md5(v_code), c_code_after;
  end if;
  foreach v_item in array c_markers loop
    -- v_code, NOT v_def: a comment is not evidence that code exists.
    if strpos(v_code, v_item) = 0 then v_missing := v_missing || v_item || ' | '; end if;
  end loop;
  if v_missing <> '' then
    raise exception 'hr-apply-restatement §3(a): the restatement DROPPED a section — missing marker(s): %',
                    v_missing;
  end if;
  -- The banner is a COMMENT and is checked as one, against the raw text. It is
  -- what a future author meets before reaching for replace()-and-execute again;
  -- it proves nothing about behaviour and is deliberately not in the array.
  if strpos(v_def, 'hr_apply restated 2026-09-14') = 0 then
    raise exception 'hr-apply-restatement §3(a): the restatement banner is gone from the installed body';
  end if;

  -- ── (b) REACHABILITY ────────────────────────────────────────────────────
  if has_function_privilege('authenticated', c_sig, 'execute')
     or has_function_privilege('anon', c_sig, 'execute')
     or has_function_privilege('service_role', c_sig, 'execute') then
    raise exception 'hr-apply-restatement §3(b): a client role can execute the apply engine';
  end if;
  if not has_function_privilege('hr_engine', c_sig, 'execute') then
    raise exception 'hr-apply-restatement §3(b): hr_engine cannot execute the apply engine — the '
                    'restatement would have taken the game offline';
  end if;
  -- THE OWNER, because SECURITY DEFINER runs AS the owner: a body restated under
  -- a different role would execute with that role's privileges, and every RLS
  -- policy and every grant below it would be answering a different question.
  select pg_get_userbyid(p.proowner) into v_item from pg_proc p where p.oid = c_sig::regprocedure;
  if v_item is distinct from 'postgres' then
    raise exception 'hr-apply-restatement §3(b): hr_apply is owned by % — a SECURITY DEFINER body runs '
                    'as its owner, so the restatement changed who the engine IS', v_item;
  end if;

  -- ── (c) THE TWO REMOVALS ────────────────────────────────────────────────
  if strpos(v_code, 'c_max_hf_per_apply') > 0 or strpos(v_code, 'v_buff_old') > 0 then
    raise exception 'hr-apply-restatement §3(c): a declaration §0 proved dead is still in the code text';
  end if;
  if strpos(v_def, 'c_max_hf_per_apply') = 0 or strpos(v_def, 'v_buff_old') = 0 then
    raise exception 'hr-apply-restatement §3(c): the PROSE explaining why each removal is safe was '
                    'deleted with the code — the next reader has no way to know it was deliberate';
  end if;

  begin
    -- ── THE FIXTURE ───────────────────────────────────────────────────────
    -- Every id is READ FROM THE SERVER CATALOGUE, never typed: a self-check with
    -- a hardcoded item id passes on the day the catalogue drops it.
    select b.item_id into v_food from public.hr_item_buffs b order by b.item_id limit 1;
    select i.item_id into v_item from public.hr_items i
      where i.item_id not in (select item_id from public.hr_item_slots)
        and i.item_id not in (select item_id from public.hr_item_buffs)
        and i.req_skill is null order by i.item_id limit 1;
    select c.crop_id, c.seed_item, c.prod_item into v_crop, v_seed, v_prod
      from public.hr_crops c where c.req_lv <= 1 order by c.crop_id limit 1;
    select r.rune_id, r.element into v_rune, v_elem from public.hr_runes r order by r.rune_id limit 1;
    select i.item_id, s.equip_slot into v_wear, v_wslot
      from public.hr_items i join public.hr_item_slots s on s.item_id = i.item_id
     where coalesce(i.req_lv, 1) <= 1 and s.equip_slot = 'body' order by i.item_id limit 1;
    select a.kind, a.activity_id into v_akind, v_aid from public.hr_activities a
     where a.kind = 'gather' and coalesce(a.req_lv, 1) <= 1 order by a.activity_id limit 1;
    select s.skill_id into v_skill from public.hr_skills s where s.skill_id = 'woodcutting';
    if v_food is null or v_item is null or v_crop is null or v_rune is null or v_wear is null
       or v_aid is null or v_skill is null then
      raise exception 'hr-apply-restatement §3: FIXTURE — the catalogue is missing food/item/crop/rune/wearable/'
                      'activity/skill (%, %, %, %, %, %, %)',
                      v_food, v_item, v_crop, v_rune, v_wear, v_aid, v_skill;
    end if;

    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to)
      values (v_uid, 0, 1000000, 1000, 50, 50, 1, now() - interval '1 hour')
      on conflict (user_id, slot) do update set version = 1;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      values (v_uid, 0, v_food, 100), (v_uid, 0, v_seed, 100), (v_uid, 0, v_wear, 2),
             (v_uid, 0, v_rune, 5)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    insert into public.player_farm (user_id, slot, plot_idx) values (v_uid, 0, 0)
      on conflict (user_id, slot, plot_idx) do update set crop_id = null, planted_at = null;

    -- ── (d) GATHER — items + xp + activity + accrued_to + tool_carry ───────
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    select coalesce(max(id), 0) into v_led_hi from public.player_ledger where user_id = v_uid;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
             'items', jsonb_build_object(v_item, 7),
             'xp', jsonb_build_object(v_skill, 120),
             'tool_carry', jsonb_build_object(v_skill, 0.5),
             'activity', jsonb_build_object('kind', v_akind, 'id', v_aid, 'restart', false),
             'accrued_to', to_jsonb(now()), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'hr-apply-restatement §3(d): a plain GATHER delta was refused: %', v_r; end if;
    select qty into v_qty from public.player_inventory
      where user_id = v_uid and slot = 0 and item_id = v_item;
    if coalesce(v_qty, 0) <> 7 then
      raise exception 'hr-apply-restatement §3(d): the gather credited % of %, expected 7', v_qty, v_item; end if;
    -- ONE VALUE ROW PER APPLY. Counted as "rows carrying the delta", because the
    -- renown ratchet legitimately writes its OWN kind='renown' row the first time
    -- a character's counted high moves — a per-APPLY row is the rule, a per-tick
    -- row is the failure (game_events reached 1.6M rows / 229 MB from six players
    -- in four days by journalling every kill and every gather).
    select count(*) into v_rows from public.player_ledger
     where user_id = v_uid and id > v_led_hi and meta ? 'delta';
    if v_rows <> 1 then
      raise exception 'hr-apply-restatement §3(d): one apply wrote % value rows, expected 1 — the '
                      'journal is per-tick again', v_rows; end if;
    if not exists (select 1 from public.player_ledger
                    where user_id = v_uid and id > v_led_hi and kind = 'renown') then
      raise exception 'hr-apply-restatement §3(d): the renown ratchet did not fire on a first credit — '
                      'the leaderboard source is gone'; end if;

    -- ── (e) ARTISAN — progress, then the only path to `claimed` ───────────
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
             'progress', jsonb_build_array(jsonb_build_object(
               'kind', 'daily', 'key', 'restatement_probe', 'period', '2026-09-14', 'add', 3)),
             'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'hr-apply-restatement §3(e): a PROGRESS delta was refused: %', v_r; end if;
    select value into v_n from public.player_progress
      where user_id = v_uid and slot = 0 and kind = 'daily' and key = 'restatement_probe'
        and period_key = '2026-09-14';
    if coalesce(v_n, 0) <> 3 then
      raise exception 'hr-apply-restatement §3(e): progress is % , expected 3', v_n; end if;

    -- ── (f) COMBAT — hp + loot + death ledger + retreat + recovery + receipt ─
    -- The receipt is bounded by the character's OWN unpaid window, and (d) just
    -- paid it up to now(), so the probe re-opens one. That clamp is the point of
    -- (V-span): a receipt can never narrate more time than the server owes.
    -- (f1) A PLAIN WOUND. `hp` is an ABSOLUTE, not a delta — the engine states the
    -- hit points it simulated and the server CLAMPS into [0, max_hp]. Asserting
    -- that is the point: a body that started ADDING it would double every heal.
    select version, hp into v_ver, v_n from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('hp', v_n - 12, 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'hr-apply-restatement §3(f1): a plain damage delta was refused: %', v_r; end if;
    if (select hp from public.player_state where user_id = v_uid and slot = 0) <> v_n - 12 then
      raise exception 'hr-apply-restatement §3(f1): hp went % → %, expected the ABSOLUTE % the delta '
                      'stated', v_n,
                      (select hp from public.player_state where user_id = v_uid and slot = 0), v_n - 12; end if;
    -- …and the clamp: an absolute above max_hp is CLAMPED, never stored.
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('hp', 999999, 'journal', c_j));
    if (select hp from public.player_state where user_id = v_uid and slot = 0)
       <> (select max_hp from public.player_state where user_id = v_uid and slot = 0) then
      raise exception 'hr-apply-restatement §3(f1): an hp absolute above max_hp was not clamped'; end if;

    -- (f2) THE DEATH SETTLE. The receipt is bounded by the character's OWN unpaid
    -- window, and (d) just paid it up to now(), so the probe re-opens one — a
    -- receipt can never narrate more time than the server owes.
    update public.player_state set accrued_to = now() - interval '2 hours'
      where user_id = v_uid and slot = 0;
    select version, hp into v_ver, v_n from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
             'hp', 0, 'items', jsonb_build_object(v_item, 2),
             'xp', jsonb_build_object('attack', 300, 'hitpoints', 100),
             'consec_falls', 1,
             'recovering_until', to_jsonb(now() + interval '5 minutes'),
             -- (4a-d) the death ledger: shape-only, audit-only, moves no value.
             'deaths', jsonb_build_array(jsonb_build_object('monster', 'probe_monster',
                                                           'recovery_ms', 300000)),
             -- (V10) the receipt must classify AWAY, and the server decides that:
             -- a sync-sized span is refused, a death always speaks.
             'last_away_receipt', jsonb_build_object('grantMs', 3600000, 'awayMs', 3600000,
                                                     'paidMs', 3600000, 'gold', 0,
                                                     'died', true, 'deaths', 1),
             -- (V9): a receipt must accompany the accrual it narrates.
             'accrued_to', to_jsonb(now()),
             'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'hr-apply-restatement §3(f2): a COMBAT settle was refused: %', v_r; end if;
    -- A DEATH IS NEVER A FREE HEAL (Recovery Rule rev. 2): hp floors at 0 and the
    -- character resumes from there — it is not restored to max by dying.
    if (select hp from public.player_state where user_id = v_uid and slot = 0) <> 0 then
      raise exception 'hr-apply-restatement §3(f2): a fatal delta left hp at % — a death healed',
                      (select hp from public.player_state where user_id = v_uid and slot = 0); end if;
    if (select last_away_receipt from public.player_state
         where user_id = v_uid and slot = 0) is null then
      raise exception 'hr-apply-restatement §3(f2): the away receipt was not stored'; end if;
    if (select recovering_until from public.player_state where user_id = v_uid and slot = 0) is null then
      raise exception 'hr-apply-restatement §3(f2): the recovery line was not written — a death would be '
                      'a free heal again'; end if;
    if (select consec_falls from public.player_state where user_id = v_uid and slot = 0) <> 1 then
      raise exception 'hr-apply-restatement §3(f2): the retreat counter was not written'; end if;

    -- ── (g) BUFF — paid, queued, and the food actually leaves the bag ──────
    update public.player_state set recovering_until = null, buffs = '[]'::jsonb
      where user_id = v_uid and slot = 0;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
             'buff_apply', jsonb_build_object('item', v_food),
             'items', jsonb_build_object(v_food, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'hr-apply-restatement §3(g): a PAID buff was refused: %', v_r; end if;
    if (select jsonb_array_length(buffs) from public.player_state where user_id = v_uid and slot = 0) < 1 then
      raise exception 'hr-apply-restatement §3(g): the buff was paid for and never queued'; end if;
    if (select qty from public.player_inventory
         where user_id = v_uid and slot = 0 and item_id = v_food) <> 99 then
      raise exception 'hr-apply-restatement §3(g): the food was not spent'; end if;

    -- ── (h) FARM — the SERVER clock stamps planted_at ──────────────────────
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
             'farm', jsonb_build_array(jsonb_build_object('i', 0, 'plant', true, 'crop', v_crop)),
             'items', jsonb_build_object(v_seed, -1), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'hr-apply-restatement §3(h): a FARM plant was refused: %', v_r; end if;
    if (select planted_at from public.player_farm
         where user_id = v_uid and slot = 0 and plot_idx = 0) is null then
      raise exception 'hr-apply-restatement §3(h): the plot carries no SERVER plant stamp'; end if;

    -- ── (i) EQUIP + ENCHANT — the transfer, then the server-resolved element ─
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
             'equip', jsonb_build_object(v_wslot, v_wear), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'hr-apply-restatement §3(i): an EQUIP delta was refused: %', v_r; end if;
    if (select item_id from public.player_equipment
         where user_id = v_uid and slot = 0 and equip_slot = v_wslot) is distinct from v_wear then
      raise exception 'hr-apply-restatement §3(i): the equip transfer did not land'; end if;

    -- ── (j) GOLD + GEMS — a spend, and the refusal when the purse is short ─
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    select gold into v_gold from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('gold', -1000, 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'hr-apply-restatement §3(j): a GOLD spend was refused: %', v_r; end if;
    if (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold - 1000 then
      raise exception 'hr-apply-restatement §3(j): gold did not move by the delta'; end if;
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    -- UNAFFORDABLE (inside the blast radius) — the PURSE refuses it.
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('gold', -(v_gold + 1000000), 'journal', c_j));
    if coalesce(v_r->>'error', '') <> 'insufficient_gold' then
      raise exception 'hr-apply-restatement §3(j): an unaffordable spend returned % — a negative purse '
                      'is one refusal away', v_r; end if;
    -- OVER THE BLAST RADIUS — the CLAMP refuses it first, which is the control
    -- that stops one wrong delta from an honest-but-buggy engine.
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('gold', 999999999999::bigint, 'journal', c_j));
    if coalesce(v_r->>'error', '') <> 'gold_clamp' then
      raise exception 'hr-apply-restatement §3(j): a gold delta far over the blast radius returned % '
                      '— the per-call clamp is gone', v_r; end if;
    if (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold - 1000 then
      raise exception 'hr-apply-restatement §3(j): a refused call still moved gold'; end if;

    -- ── (k) WORKERS + THE RESTED BANK ─────────────────────────────────────
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
             'rested_xp', 500, 'rested_at', to_jsonb(now()),
             'workers_accrued_to', to_jsonb(now()), 'journal', c_j));
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'hr-apply-restatement §3(k): a RESTED/WORKER watermark delta was refused: %', v_r; end if;

    -- ── (l) IDEMPOTENCY — the same key twice is one movement ──────────────
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    select coalesce(max(id), 0) into v_led_hi from public.player_ledger where user_id = v_uid;
    v_meta := jsonb_build_object('gold', -7, 'journal', c_j);
    v_r := public.hr_apply(v_uid, 0, v_ver, '000000a9-0000-0000-0000-00000000dead'::uuid, v_meta);
    if coalesce(v_r->>'ok', 'false') <> 'true' then
      raise exception 'hr-apply-restatement §3(l): the first call under a fresh key was refused: %', v_r; end if;
    select gold into v_gold from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, '000000a9-0000-0000-0000-00000000dead'::uuid, v_meta);
    if (select gold from public.player_state where user_id = v_uid and slot = 0) <> v_gold then
      raise exception 'hr-apply-restatement §3(l): a REPLAY moved value a second time — every retry '
                      'storm is now a mint'; end if;
    select count(*) into v_rows from public.player_ledger
     where user_id = v_uid and id > v_led_hi and meta ? 'delta';
    if v_rows <> 1 then
      raise exception 'hr-apply-restatement §3(l): a call plus its replay wrote % value rows, expected 1',
                      v_rows; end if;

    -- ── (m) THE FORGED-KEY REFUSALS, BY NAME ──────────────────────────────
    select version into v_ver from public.player_state where user_id = v_uid and slot = 0;
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('renown', 999999, 'journal', c_j));
    if coalesce(v_r->>'error', '') <> 'unknown_delta_key' then
      raise exception 'hr-apply-restatement §3(m): a delta carrying a key the contract does not know '
                      'returned % — the allowlist is not closed', v_r; end if;

    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
             'buff_apply', jsonb_build_object('item', v_food, 'magnitude', 99, 'scale', 9),
             'items', jsonb_build_object(v_food, -1), 'journal', c_j));
    if coalesce(v_r->>'error', '') <> 'bad_buff_shape' then
      raise exception 'hr-apply-restatement §3(m): a buff that authors its own strength returned % — '
                      'the client would own the number', v_r; end if;

    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
             'hearthfind', jsonb_build_object('item', 'not_a_real_trophy',
               'source_kind', 'gather', 'source_id', 'oak'), 'journal', c_j));
    if coalesce(v_r->>'error', '') not in ('bad_hearthfind', 'unknown_item') then
      raise exception 'hr-apply-restatement §3(m): a forged hearthfind returned % — a trophy could be '
                      'minted by naming it', v_r; end if;

    v_r := public.hr_apply(v_uid, 0, v_ver - 1, gen_random_uuid(),
             jsonb_build_object('gold', 1, 'journal', c_j));
    if coalesce(v_r->>'error', '') <> 'version_conflict' then
      raise exception 'hr-apply-restatement §3(m): a STALE version returned % — the optimistic '
                      'concurrency control is gone', v_r; end if;

    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(),
             jsonb_build_object('xp', jsonb_build_object('attack', 99999999999::bigint), 'journal', c_j));
    if coalesce(v_r->>'error', '') <> 'xp_clamp' then
      raise exception 'hr-apply-restatement §3(m): an XP delta three orders of magnitude over the blast '
                      'radius returned % — the clamp is gone', v_r; end if;

    raise exception using errcode = 'HR841', message = 'hr-apply-restatement §3 complete — rolling back';
  exception when sqlstate 'HR841' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state     where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_equipment where user_id = v_uid)
     or exists (select 1 from public.player_progress  where user_id = v_uid)
     or exists (select 1 from public.player_farm      where user_id = v_uid)
     or exists (select 1 from public.player_intents   where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from auth.users             where id = v_uid) then
    raise exception 'hr-apply-restatement §3: LEAKED a probe row — the self-check is not net-zero';
  end if;

  raise notice 'hr-apply-restatement §3 PASSED: the installed body is the one this file states it '
               'installs (code pin), every delta-key section is present, no client role can execute it, '
               'both proven-dead declarations are gone and their prose is not; a gather, an artisan '
               'progress, a combat settle with recovery/retreat/receipt, a paid buff, a farm plant, an '
               'equip transfer, a gold spend, a rested/worker watermark and an idempotent replay all '
               'behave, and an unknown key, a self-authored buff, a forged hearthfind, a stale version '
               'and an over-clamp XP delta are each refused BY NAME';
end $mig$;
