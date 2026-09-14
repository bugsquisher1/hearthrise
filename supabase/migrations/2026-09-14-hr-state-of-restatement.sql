-- ══════════════════════════════════════════════════════════════════════════
-- 2026-09-14-hr-state-of-restatement.sql
-- THE ENVELOPE EVERY CLIENT RENDERS IS IN A FILE AGAIN.
--
-- Slice 7's second target, and the deepest chain left. `node tests/patch-chain-guard.mjs --report`
-- on the tree this was cut from:
--
--     public.hr_state_of    24 anchored patches    23 files    last full restatement
--                                                                2026-08-26-marks-record.sql
--
-- Twenty-four programmatic `replace()`-and-`execute` edits since the last full
-- `create or replace`. Each one is careful — each checks its anchor matched
-- exactly once and raises rather than patching blind — and that was never the
-- problem. The problem is that the text production actually runs existed in NO
-- FILE. hr_state_of is the ONLY statement of what the server owns: CLAUDE.md §6
-- says the envelope the client applies is truth, and a reviewer asking "what
-- does the server actually tell the client?" had to REPLAY twenty-three
-- migrations to find out. The last files to touch it shipped under a
-- RESTATEMENT-DEBT-ACK waiver saying, in the diff, that this was owed.
--
-- This file pays it. After it, hr_state_of's chain depth is 0 and the ACK is
-- retired.
--
-- ── WHAT THIS FILE IS, AND HOW IT WAS MADE ──────────────────────────────────
-- The body below was NOT typed. It is `pg_get_functiondef` taken at CHAIN END —
-- the full repo chain replayed into PGlite in apply order, the installed text
-- read back — and then cleaned in exactly two mechanical ways, BOTH OF WHICH
-- TOUCH ONLY COMMENTS:
--
--   1. A SECTION INDEX (below) and, on each of the 41 sections, two lines
--      naming the section and the migration that INTRODUCED it. The
--      archaeology is the expensive part of this body — twenty-four patches of
--      it are about WHY a key is flat, why an entitlement is never truncated,
--      why peers are never in this envelope — and a restatement that dropped
--      that would trade one kind of unreadable for another. NOTHING WAS
--      DELETED. Attribution was DERIVED, not typed: the chain was replayed
--      `upTo` each of the 60 migrations that mention hr_state_of, a probe
--      character's envelope read at each step, and each key attributed to the
--      FIRST migration at which it appeared in a real envelope. (A grep would
--      have been wrong: it put `bounty` on 2026-08-11-player-state.sql, which
--      merely contains the word.)
--
--   2. ONE COMMENT MOVED. The four-line Phase-0 prose for `state.fight` sat
--      above `hearthfind_ready`, forty lines from the key it describes —
--      2026-09-08-hearthfind.sql spliced four keys between a comment and its
--      code, which is the ordinary consequence of anchored patching. It is
--      moved back onto `'fight', v_st.fight,`. No other line moved.
--
-- NO CODE CHANGED AT ALL. Not a key, not a coalesce, not a clamp, not a filter,
-- not an order-by. This restatement removes no declaration, because there is
-- none to remove: the body declares exactly one variable (`v_st`) and reads it.
-- §0 PROVES that by execution rather than asserting it in prose.
--
-- ── THE PROOF OF NO BEHAVIOUR CHANGE (measured, not asserted) ────────────────
-- Both hashes below are over `pg_get_functiondef`, which is what every guard in
-- this repo hashes.
--
--   normalised md5 = md5(regexp_replace(def, '[[:space:]]+', ' ', 'g'))
--   code md5       = the same after `--`-to-end-of-line comments are removed
--                    (tests/live-hash-drift.mjs `stripSqlComments`, the function
--                    behind --codediff)
--
--   chain end, before any cleanup     norm 9af380d13bb106b3573adee1fda9be9e
--   THIS FILE'S BODY, before cleanup  norm 9af380d13bb106b3573adee1fda9be9e
--                                     ^ byte-for-byte the same body. The capture
--                                       is faithful; that is step one and it is
--                                       measured, not claimed.
--
--   chain end, code only              88b814f1226c46971443d382eb369113  7406 ch
--   THIS FILE, after cleanup, code    88b814f1226c46971443d382eb369113  7406 ch
--
-- The code hash does not move, because the cleanup is comment-only. That is the
-- strongest form this proof can take, and it is also why §0 and §3(a) pin ONE
-- constant instead of two: the body this file REPLACES and the body it INSTALLS
-- are the same code. There is therefore no "re-apply" escape hatch to get wrong
-- (Security C2, 2026-09-14) — the hash branch that recognises an untouched body
-- is the SAME branch that recognises the predecessor, and everything else
-- raises. A later anchored patch moves the hash and this file refuses.
--
-- ── LIVE vs REPLAY, STATED PLAINLY ──────────────────────────────────────────
-- tests/live-hash-drift.baseline.json (2026-09-14 03:07 UTC) records:
--     hr_state_of   live 740aefe5b3739db367010ee5fdfda85a
--                   replay 9af380d13bb106b3573adee1fda9be9e
--                   --codediff: CODE-IDENTICAL
-- and that was RE-MEASURED read-only against production while this file was
-- authored: live code md5 = 88b814f1226c46971443d382eb369113, 7406 code chars,
-- owner postgres — byte-identical to the replay's code, so the 24,615-vs-live
-- normalised delta is comment/whitespace carry-over in the deployed text, not
-- code. This restatement is authored against the REPLAY text, because the
-- replay text is the repo's own chain. After it applies, live == replay
-- EXACTLY: the carry-over dies with the restatement, because the body is no
-- longer spliced into whatever production happened to be holding.
--
-- ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────────
-- It does not touch hr_apply (restated 2026-09-14, depth 0) or any of the other
-- grandfathered chains. It adds no key, no column, no capability, no grant. It
-- is reversible in the only sense a restatement can be: the previous body is a
-- replay of the chain WITHOUT this file, and the proof that they are the same
-- is that this file's pre-cleanup capture hashes identically to it.
--
-- ⚠ THE GUARD ARMS. This file now owns every line of hr_state_of's text, so a
--   mutation arm that plants into an EARLIER migration is mutating a draft and
--   is VACUOUS. tests/hr-state-of-final-body.mjs holds the constants and the
--   blinds; every arm that planted into the projection was re-pointed HERE in
--   the same commit. The failure is loud rather than silent: §0 refuses a body
--   it cannot name, so a stale arm reads "the repo cannot rebuild the database"
--   rather than quietly stopping to bite.
--
-- ── SECTIONS, IN EXECUTION ORDER ────────────────────────────────────────────
-- Line numbers are relative to the first line of the body (the restatement
-- banner is 1; `declare` is 5). Every section header in the body names the file
-- that introduced it; this is the same list in one place, so the shape of the
-- envelope is readable without scrolling 500 lines.
--
--     9  THE CHARACTER ROW, AND THE ENVELOPE ROOT (ok / version / now)  2026-08-11-apply-engine.sql
--    28  buffs — THE CONSUMABLE QUEUE, with a SERVER-derived remaining… 2026-09-13-consumable-buffs.sql
--    54  place — THE CHARACTER'S OWN POSITION. PEERS ARE NEVER HERE     2026-09-13-town-presence.sql
--    70  dungeon_cooldowns — the ACTIVE windows, per dungeon and per m… 2026-09-12-dungeon-cooldown.sql
--    73  state — THE FLAT SCALAR BAG (opens here, closes at combat_sty… 2026-08-11-apply-engine.sql
--    82  state.marks — the Bounty-Marks currency                        2026-08-26-marks-record.sql
--    90  state.dungeon_scrip — the Dungeon Scrip currency               2026-09-10-dungeon-scrip.sql
--    93  state — tokens, hit points, the bank cap and the activity poi… 2026-08-11-apply-engine.sql
--   103  state.workers_accrued_to — the hired crew's own watermark      2026-08-25-workers.sql
--   106  state.combat_xp_accrued_to — the combat-XP cadence watermark   2026-08-31-combat-xp-credit.sql
--   113  state.rested_xp / rested_at — the rested bank and its waterma… 2026-08-22-rested-record.sql
--   121  state.auto_eat_* — FLAT, never nested                          2026-08-15-auto-eat.sql
--   130  state.tool_carry — the gathering carry the SERVER owns         2026-08-15-tool-carry.sql
--   136  state.hearthfind_* — the switch, the day’s find, the titles, … 2026-09-08-hearthfind.sql
--   186  state.fight — the IN-FLIGHT fight the server owns              2026-08-17-fight-carry.sql
--   195  state.recovering_until — the Recovery line (a death is never … 2026-09-06-recovering-until.sql
--   204  state.consec_falls — the Retreat counter (Recovery rev. 3)     2026-09-07-retreat.sql
--   213  state.last_away_receipt — projected RAW; NULL and ABSENT diff… 2026-09-07-last-away-receipt.sql
--   226  state.deaths_* — the ladder's two anchors, read DIRECTLY (nev… 2026-09-06-recovering-until.sql
--   240  state.auto_eat_touched — a boolean, never the instant          2026-09-06-recovering-until.sql
--   246  state.streak_days — the daily settle streak                    2026-08-21-streak-state.sql
--   255  state.plot_level — the SERVER-owned farm plot tier             2026-09-06-state-of-farm-projection.sql
--   258  state.streak_day_key — the streak’s UTC day key                2026-08-21-streak-state.sql
--   267  state.combat_style — the per-family style choice (CLOSES `sta… 2026-08-24-combat-style.sql
--   270  skills / inventory — the two maps the client renders from      2026-08-11-apply-engine.sql
--   284  bank — the server-owned bank container, beside `inventory`     2026-08-27-bank-store.sql
--   289  equipment — the worn set                                       2026-08-11-apply-engine.sql
--   298  enchant — ELEMENTS v1, the server-owned weapon enchant         2026-08-18-enchant.sql
--   304  workers — the hired crew (hired_at added 2026-09-12-worker-hi… 2026-08-25-workers.sql
--   319  farm — the plots, with the FULL waterings array (Q-5)          2026-08-11-apply-engine.sql
--   336  progress / progress_truncated — capped at 1000 rows, and it S… 2026-08-11-apply-engine.sql
--   361  client_state — the denylisted client-preference bag            2026-08-28-client-state.sql
--   364  total_level — derived server-side                              2026-08-11-apply-engine.sql
--   373  unlocked_recipes — the gated recipes THIS character has learn… 2026-09-14-recipe-learn.sql
--   385  gem_unlocks — the ACCOUNT’s entitlements. NEVER truncated      2026-09-14-gem-unlock-buy.sql
--   398  renown_high — the SERVER’s counted renown, display only        2026-09-12-renown-high-projection.sql
--   408  bounty — the active contract and the SERVER’s own progress ar… 2026-09-09-bounty-progress-projection.sql
--   431  hero_slots — ACCOUNT-scoped entitlement. NEVER truncated       2026-09-08-hero-slot-buy.sql
--   440  traits — owned permanent traits, read UNFILTERED               2026-08-23-trait-buy.sql
--   454  companions — the FULL roster (equipped + owned + per-id XP)    2026-08-22-companion-record.sql
--   493  inventory_complete — the STAMPED completeness signal, fail-cl… 2026-08-24-inventory-complete.sql
--
-- ── §0 PREFLIGHT — WHAT ARE WE REPLACING? ───────────────────────────────────
-- A restatement is the one migration shape that can silently DISCARD work: it
-- overwrites a body wholesale, so if production had drifted from the chain — a
-- hotfix, a patch applied out of order, a file this branch has not seen — the
-- drift would vanish without a trace and without an error. So this file refuses
-- to run unless the body it is about to replace is the ONE body it can name.
--
-- ⚠ ONE CONSTANT, NOT TWO, AND NO BANNER SKIP (Security C2, 2026-09-14). The
--   hr_apply restatement needed a separate re-apply branch because it deleted
--   two dead declarations, so the body it replaced and the body it installed
--   differed. This one is comment-only, so they are the same code and the
--   re-apply case IS the predecessor case. Nothing is keyed on the banner
--   comment: a future anchored patch would leave a banner intact while moving
--   the code underneath it, and a banner-keyed skip would then discard that
--   patch — exactly the failure the pin exists to stop.
--
-- The pin is over CODE (comments stripped), so the live body's comment-byte
-- carry-over passes and any executable difference does not. If this block ever
-- raises, do NOT edit the constant: re-derive the restatement from the chain
-- (`node tests/schema-replay.mjs` + pg_get_functiondef) and review the diff.
--
-- The second half of the block is the NO-REMOVAL proof. This file removes no
-- declaration, and rather than say so it proves the removal set is empty by
-- EXECUTION: the body's whole `declare` list is compared against the one
-- variable it is allowed to hold, and the body is shown to contain no dynamic
-- `execute` in which a reader could hide from a textual count.
do $$
declare
  v_def  text;
  v_code text;
  v_decl text;
  c_sig  constant text := 'public.hr_state_of(uuid,int)';
  -- The body at chain end (= production, code-identically) on 2026-09-14, AND
  -- the body §1 installs. One constant, because the cleanup is comment-only.
  c_code constant text := '88b814f1226c46971443d382eb369113';
  -- The body's ENTIRE declare list. Removing a declaration means changing THIS.
  c_decl constant text := 'declare v_st public.player_state%rowtype;';
begin
  if to_regprocedure(c_sig) is null then
    raise exception 'hr-state-of-restatement §0: hr_state_of does not exist — this file RESTATES a body, '
                    'it does not create one. Apply the chain first (tests/schema-apply-order.json).';
  end if;
  v_def  := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');
  -- `--` never occurs inside a string literal in this body (verified over the
  -- chain-end text before this file was cut), so a line-comment strip is exact.
  v_code := btrim(regexp_replace(
              regexp_replace(v_def, '--[^' || chr(10) || ']*', '', 'g'),
              '[[:space:]]+', ' ', 'g'));

  -- `is distinct from`, not `<>`, so this gate's text differs from §3(a)'s and
  -- each can be blinded on its own in a mutation proof (tests/hr-state-of-final-body.mjs).
  if md5(v_code) is distinct from c_code then
    raise exception 'hr-state-of-restatement §0: the installed hr_state_of is NEITHER the body this file '
                    'was cut from NOR the body it installs (they are the same code, %) — it is % (code '
                    'length %). Something else has patched it. A restatement applied over a body it '
                    'cannot name would DISCARD whatever made them differ. Re-derive the restatement from '
                    'the chain instead of editing a constant.', c_code, md5(v_code), length(v_code);
  end if;

  if strpos(lower(v_code), 'execute ') > 0 then
    raise exception 'hr-state-of-restatement §0: the body contains dynamic SQL — a textual count can no '
                    'longer prove what this body declares and reads';
  end if;

  -- THE NO-REMOVAL PROOF, BY EXECUTION. Everything between `declare` and the
  -- first `begin` of the comment-stripped body, compared against the single
  -- declaration this file carries forward.
  v_decl := btrim(substring(v_code from 'declare .*? begin '));
  v_decl := btrim(regexp_replace(v_decl, ' begin$', ''));
  if v_decl is distinct from c_decl then
    raise exception 'hr-state-of-restatement §0: the body declares "%" but this file carries forward "%". '
                    'A restatement may only drop a declaration with a proof that nothing reads it — and '
                    'this one drops none.', v_decl, c_decl;
  end if;
  if (length(v_code) - length(replace(v_code, 'v_st', ''))) / length('v_st') < 2 then
    raise exception 'hr-state-of-restatement §0: v_st is declared and never read — the one declaration '
                    'this body has is dead, which is not the body this file was cut from';
  end if;
  raise notice 'hr-state-of-restatement §0: body recognised (code %); it declares only v_st, reads it, '
               'and contains no dynamic SQL — the removal set is empty', c_code;
end $$;

-- ── §1 THE RESTATEMENT ──────────────────────────────────────────────────────────
-- hr_state_of restated 2026-09-14 — chain depth 0. Do not patch this body with
-- an anchored replace(); edit it HERE, in the file, where a reviewer can read it.

create or replace function public.hr_state_of(p_user uuid, p_slot integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
-- hr_state_of restated 2026-09-14 (2026-09-14-hr-state-of-restatement.sql) — chain depth 0.
-- This body is AUTHORED HERE. Do not add an anchored programmatic patch to it:
-- tests/patch-chain-guard.mjs refuses a third one, and twenty-four of them are
-- how the envelope every client renders came to exist in no file at all.
declare v_st public.player_state%rowtype;
begin
  -- ── THE CHARACTER ROW, AND THE ENVELOPE ROOT (ok / version / now) ──
  --    introduced by 2026-08-11-apply-engine.sql
  select * into v_st from public.player_state
   where user_id = p_user and slot = coalesce(p_slot, 0);
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;

  return jsonb_build_object(
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
    'buffs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', e.v->>'type',
               'magnitude', (e.v->>'magnitude')::numeric,
               'until', e.v->>'until',
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
    'dungeon_cooldowns', public.hr_dungeon_cooldowns(p_user, v_st.slot),
    -- ── state — THE FLAT SCALAR BAG (opens here, closes at combat_style) ──
    --    introduced by 2026-08-11-apply-engine.sql
    'state', jsonb_build_object(
      'slot', v_st.slot, 'gold', v_st.gold, 'gems', v_st.gems,
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
      'hearth_tokens', v_st.hearth_tokens,
      'hp', v_st.hp, 'max_hp', v_st.max_hp, 'bank_cap', v_st.bank_cap,
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
      -- AUTO-EAT. Flat keys rather than a nested object because the accrual
      -- shell reads them field by field off `st` and a nested bag would be one
      -- more place a `?? {}` could quietly turn a missing column into a
      -- default. `auto_eat_enabled` is the purchased-trait receipt.
      -- ── state.auto_eat_* — FLAT, never nested ──
      --    introduced by 2026-08-15-auto-eat.sql
      'auto_eat_enabled', v_st.auto_eat_enabled,
      'auto_eat_food', v_st.auto_eat_food,
      'auto_eat_pct', v_st.auto_eat_pct,
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
      -- First-Night Idle Rescue: THE RECOVERY LINE. An absolute server instant
      -- before which the character is Knocked Out - no swing, no gather, no XP,
      -- no loot, no food. Flat, like every other watermark, so a nested bag
      -- cannot hide a missing column behind a default. NULL here means "up";
      -- an ABSENT KEY means "this database predates Recovery", and the engine
      -- distinguishes those two by presence, never by coalescing.
      -- ── state.recovering_until — the Recovery line (a death is never a free heal) ──
      --    introduced by 2026-09-06-recovering-until.sql
      'recovering_until', v_st.recovering_until,
      -- THE RETREAT (Recovery rev. 3): CONSECUTIVE falls with no kill between
      -- them. Flat, beside the recovery line, because they are two halves of one
      -- survival rule and a nested bag would let a missing column hide behind a
      -- default. It is `not null default 0`, so unlike recovering_until there is
      -- no "present but null" state to distinguish - the KEY'S PRESENCE alone is
      -- the engine's switch, and its absence is the pre-Retreat behaviour.
      -- ── state.consec_falls — the Retreat counter (Recovery rev. 3) ──
      --    introduced by 2026-09-07-retreat.sql
      'consec_falls', v_st.consec_falls,
      -- THE LAST AWAY-CLASSIFIED RECEIPT (2026-09-07 ruling). Projected RAW and
      -- FLAT, like every other watermark on this envelope. NULL means "this
      -- character has never been away"; an ABSENT KEY means "this database
      -- predates the receipt" - and the client distinguishes those two by
      -- PRESENCE, never by coalescing, so an older deployment renders silence
      -- rather than a fabricated empty night.
      -- ── state.last_away_receipt — projected RAW; NULL and ABSENT differ ──
      --    introduced by 2026-09-07-last-away-receipt.sql
      'last_away_receipt', v_st.last_away_receipt,
      -- Recovery rev. 2: THE LADDER'S TWO ANCHORS, projected as SCALARS.
      -- They are the same two player_progress rows the accrual delta writes
      -- (kind='stat' key='deaths', period='' and period=<UTC day>), read here
      -- DIRECTLY rather than left to be dug out of the 'progress' array above
      -- - that array is `limit 1000` and carries `progress_truncated`, and a
      -- character with enough collection rows would silently read as one who
      -- has never died and get a free fall on every settle. A survival
      -- mechanic must not depend on a truncatable read. The day key is
      -- hr_utc_day_key, the SAME spelling src/core/goals.js utcDayKey
      -- produces, so the row the engine writes is the row this reads.
      -- ── state.deaths_* — the ladder's two anchors, read DIRECTLY (never off the truncatable `progress` array) ──
      --    introduced by 2026-09-06-recovering-until.sql
      'deaths_lifetime', coalesce((select pp.value from public.player_progress pp
                                    where pp.user_id = p_user and pp.slot = v_st.slot
                                      and pp.kind = 'stat' and pp.key = 'deaths'
                                      and pp.period_key = ''), 0),
      'deaths_today',    coalesce((select pp.value from public.player_progress pp
                                    where pp.user_id = p_user and pp.slot = v_st.slot
                                      and pp.kind = 'stat' and pp.key = 'deaths'
                                      and pp.period_key = public.hr_utc_day_key(now())), 0),
      -- HAS THE AUTO-EAT SWITCH EVER BEEN TOUCHED? A boolean, never the
      -- timestamp: the client only needs to know whether to make the one-time
      -- switch-on offer, and projecting the instant would invite a renderer to
      -- do arithmetic on it.
      -- ── state.auto_eat_touched — a boolean, never the instant ──
      --    introduced by 2026-09-06-recovering-until.sql
      'auto_eat_touched', (v_st.auto_eat_set_at is not null),
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
      'streak_day_key', v_st.streak_day_key,
      -- combat-style slice: the player's per-weapon-family style choice, e.g.
      -- {"sword":"defensive"}. Written ONLY by hr_set_style. The accrual engine
      -- reads it as `st.combat_style` and passes it through
      -- normaliseStyleKeys -> resolveStyle, which is what makes an AWAY fight
      -- train the skill the player actually picked. A PARTIAL map is normal;
      -- `{}` means "chosen nothing" and every family falls to its default.
      -- ── state.combat_style — the per-family style choice (CLOSES `state`) ──
      --    introduced by 2026-08-24-combat-style.sql
      'combat_style', coalesce(v_st.combat_style, '{}'::jsonb)),
    -- ── skills / inventory — the two maps the client renders from ──
    --    introduced by 2026-08-11-apply-engine.sql
    'skills', coalesce((
      select jsonb_object_agg(skill_id, jsonb_build_object(
               'xp', xp, 'level', public.hr_level_from_xp(xp)))
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
               order by period_key, kind, key
               limit 1000) p), '[]'::jsonb),
    'progress_truncated', (
      select count(*) > 1000 from (
        select 1 from public.player_progress
         where user_id = p_user and slot = v_st.slot
           and (period_key = '' or updated_at >= now() - interval '31 days')
           and key not like 'ev:kill_monster:%'
           and key not like 'ev:loot:%'
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
           and pp.key like 'companion_xp:%'), '{}'::jsonb)),
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
end 
$$;

-- ── §2 THE GRANT POSTURE ────────────────────────────────────────────────────────
-- `create or replace` PRESERVES an existing ACL, so these two lines are not what
-- keeps the envelope out of the browser today — §3(b) proves that by asking
-- has_function_privilege rather than by trusting them. They are here because a
-- restatement is the file a future operator will copy when they restate the next
-- body, and a template that omits the revoke is how one gets omitted for real.
-- `revoke ... from public` FIRST, then the single grant (CLAUDE.md §2). The
-- client never calls this directly: it reaches the envelope through hr_rpc_gate,
-- which runs as hr_engine.
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── §3 SELF-CHECK (§4) — BY EXECUTION, WITH CONTROLS ───────────────────────────
-- A restatement's failure mode is SUBTRACTION: a section silently missing from
-- the rewritten body. Markers alone cannot see that (a marker can be present in
-- a block that no longer runs), and a key-set probe alone cannot see it either
-- (deleting `and key not like 'ev:loot:%'` drops no key and floods the envelope).
-- So this block does both, in this order:
--
--   (a) THE PIN AND THE SECTIONS. The installed body's CODE hash equals the
--       value this file says it installs, and one DERIVED, section-unique marker
--       per section is present IN THE COMMENT-STRIPPED TEXT. The pin is the
--       strong half — a statement about the whole body, not about forty-odd
--       strings — and the markers are what names the section that went missing.
--   (b) REACHABILITY AND IDENTITY. No client role can execute hr_state_of,
--       hr_engine still can, the body is still owned by postgres, still SECURITY
--       DEFINER and still pinned to search_path=public. Without this, every
--       assertion below is decoration: a SECURITY DEFINER body runs as its OWNER,
--       so a restatement under a different role would be answering a different
--       question about every RLS policy beneath it.
--   (c) THE NO-REMOVAL PROOF, restated on the INSTALLED body: the declare list is
--       still the one variable, and the code hash is still the predecessor's —
--       i.e. this file changed no code at all, which is the whole claim.
--   (d) THE PROBE. A real character, a real envelope, under a sentinel rollback.
--       It asserts the EXACT key sets tests/no-client-copy-of-projection.baseline
--       .json pins — 26 top-level and 36 under `state` — because that guard is
--       what stands between the server's projection and a client that keeps its
--       own copy of a number, and a restatement that dropped a key would make it
--       pass by agreeing with a smaller truth. The block is NET-ZERO on
--       production and the leak check at the end says so rather than assuming it.
do $$
declare
  v_def text; v_code text; v_decl text; v_env jsonb; v_missing text := '';
  v_item text; v_top text[]; v_state text[];
  v_uid  constant uuid := '000000c4-0000-0000-0000-0000000000c4';
  c_sig  constant text := 'public.hr_state_of(uuid,int)';
  -- The body THIS FILE installs, comment-stripped — the same constant §0 pins,
  -- because this restatement is comment-only.
  c_code constant text := '88b814f1226c46971443d382eb369113';
  c_decl constant text := 'declare v_st public.player_state%rowtype;';
  -- THE PROJECTION CONTRACT, copied from tests/no-client-copy-of-projection
  -- .baseline.json. An EXACT set, not a subset: a key that APPEARS is as much a
  -- contract change as one that vanishes, and the guard that pins these two
  -- lists is the one that keeps a client from holding its own copy.
  c_top   constant text[] := array['bank', 'bounty', 'buffs', 'client_state', 'companions', 'dungeon_cooldowns', 'enchant', 'equipment', 'farm', 'gem_unlocks', 'hero_slots', 'inventory', 'inventory_complete', 'now', 'ok', 'place', 'progress', 'progress_truncated', 'renown_high', 'skills', 'state', 'total_level', 'traits', 'unlocked_recipes', 'version', 'workers'];
  c_state constant text[] := array['accrued_to', 'active_id', 'active_kind', 'active_since', 'auto_eat_enabled', 'auto_eat_food', 'auto_eat_pct', 'auto_eat_touched', 'bank_cap', 'combat_style', 'combat_xp_accrued_to', 'consec_falls', 'deaths_lifetime', 'deaths_today', 'dungeon_scrip', 'fight', 'gems', 'gold', 'hearth_tokens', 'hearthfind_last', 'hearthfind_plinth', 'hearthfind_ready', 'hearthfind_titles', 'hp', 'last_away_receipt', 'marks', 'max_hp', 'plot_level', 'recovering_until', 'rested_at', 'rested_xp', 'slot', 'streak_day_key', 'streak_days', 'tool_carry', 'workers_accrued_to'];
  -- ── §3(a)'s MARKERS (Security C1, 2026-09-14) ──────────────────────────
  -- ONE PER SECTION OF THE BODY, in execution order, DERIVED rather than typed:
  -- each is the first line of its section, normalised, WIDENED line by line
  -- until it occurs EXACTLY ONCE in the whole comment-stripped body. Both halves
  -- are load-bearing. A marker that lives in a COMMENT cannot detect the deletion
  -- of the code it describes (which is why they are matched against v_code), and
  -- a marker that also occurs in another section survives that section's
  -- deletion. Regenerated with the body, so the list cannot rot behind it.
  c_markers constant text[] := array[
      -- THE CHARACTER ROW, AND THE ENVELOPE ROOT (ok / version / now)
    'select * into v_st from public.player_state',
      -- buffs — THE CONSUMABLE QUEUE, with a SERVER-derived remaining_ms
    '''buffs'', coalesce((',
      -- place — THE CHARACTER'S OWN POSITION. PEERS ARE NEVER HERE
    '''place'', jsonb_build_object(',
      -- dungeon_cooldowns — the ACTIVE windows, per dungeon and per mode
    '''dungeon_cooldowns'', public.hr_dungeon_cooldowns(p_user, v_st.slot),',
      -- state — THE FLAT SCALAR BAG (opens here, closes at combat_style)
    '''state'', jsonb_build_object(',
      -- state.marks — the Bounty-Marks currency
    '''marks'', v_st.marks,',
      -- state.dungeon_scrip — the Dungeon Scrip currency
    '''dungeon_scrip'', v_st.dungeon_scrip,',
      -- state — tokens, hit points, the bank cap and the activity pointer
    '''hearth_tokens'', v_st.hearth_tokens,',
      -- state.workers_accrued_to — the hired crew's own watermark
    '''workers_accrued_to'', v_st.workers_accrued_to,',
      -- state.combat_xp_accrued_to — the combat-XP cadence watermark
    '''combat_xp_accrued_to'', v_st.combat_xp_accrued_to,',
      -- state.rested_xp / rested_at — the rested bank and its watermark
    '''rested_xp'', v_st.rested_xp,',
      -- state.auto_eat_* — FLAT, never nested
    '''auto_eat_enabled'', v_st.auto_eat_enabled,',
      -- state.tool_carry — the gathering carry the SERVER owns
    '''tool_carry'', v_st.tool_carry,',
      -- state.hearthfind_* — the switch, the day’s find, the titles, the pl…
    '''hearthfind_ready'', true,',
      -- state.fight — the IN-FLIGHT fight the server owns
    '''fight'', v_st.fight,',
      -- state.recovering_until — the Recovery line (a death is never a free…
    '''recovering_until'', v_st.recovering_until,',
      -- state.consec_falls — the Retreat counter (Recovery rev. 3)
    '''consec_falls'', v_st.consec_falls,',
      -- state.last_away_receipt — projected RAW; NULL and ABSENT differ
    '''last_away_receipt'', v_st.last_away_receipt,',
      -- state.deaths_* — the ladder's two anchors, read DIRECTLY (never off…
    '''deaths_lifetime'', coalesce((select pp.value from public.player_progress pp',
      -- state.auto_eat_touched — a boolean, never the instant
    '''auto_eat_touched'', (v_st.auto_eat_set_at is not null),',
      -- state.streak_days — the daily settle streak
    '''streak_days'', v_st.streak_days,',
      -- state.plot_level — the SERVER-owned farm plot tier
    '''plot_level'', v_st.plot_level,',
      -- state.streak_day_key — the streak’s UTC day key
    '''streak_day_key'', v_st.streak_day_key,',
      -- state.combat_style — the per-family style choice (CLOSES `state`)
    '''combat_style'', coalesce(v_st.combat_style, ''{}''::jsonb)),',
      -- skills / inventory — the two maps the client renders from
    '''skills'', coalesce((',
      -- bank — the server-owned bank container, beside `inventory`
    '''bank'', coalesce((',
      -- equipment — the worn set
    '''equipment'', coalesce((',
      -- enchant — ELEMENTS v1, the server-owned weapon enchant
    '''enchant'', coalesce(v_st.enchant, ''{}''::jsonb),',
      -- workers — the hired crew (hired_at added 2026-09-12-worker-hired-at…
    '''workers'', coalesce((',
      -- farm — the plots, with the FULL waterings array (Q-5)
    '''farm'', coalesce((',
      -- progress / progress_truncated — capped at 1000 rows, and it SAYS wh…
    '''progress'', coalesce((',
      -- client_state — the denylisted client-preference bag
    '''client_state'', coalesce(v_st.client_state, ''{}''::jsonb),',
      -- total_level — derived server-side
    '''total_level'', public.hr_total_level(p_user, v_st.slot),',
      -- unlocked_recipes — the gated recipes THIS character has learned
    '''unlocked_recipes'', public.hr_recipes_of(p_user, v_st.slot),',
      -- gem_unlocks — the ACCOUNT’s entitlements. NEVER truncated
    '''gem_unlocks'', public.hr_gem_unlocks_of(p_user, v_st.slot),',
      -- renown_high — the SERVER’s counted renown, display only
    '''renown_high'', coalesce(v_st.renown_high, 0),',
      -- bounty — the active contract and the SERVER’s own progress arithmet…
    '''bounty'', (select jsonb_build_object(',
      -- hero_slots — ACCOUNT-scoped entitlement. NEVER truncated
    '''hero_slots'', public.hr_hero_slots_of(p_user),',
      -- traits — owned permanent traits, read UNFILTERED
    '''traits'', coalesce((',
      -- companions — the FULL roster (equipped + owned + per-id XP)
    '''companions'', jsonb_build_object(',
      -- inventory_complete — the STAMPED completeness signal, fail-closed
    '''inventory_complete'', ('
  ];
begin
  v_def  := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');
  v_code := btrim(regexp_replace(
              regexp_replace(v_def, '--[^' || chr(10) || ']*', '', 'g'),
              '[[:space:]]+', ' ', 'g'));

  -- ── (a) THE PIN, AND ONE MARKER PER SECTION ─────────────────────────────
  if md5(v_code) <> c_code then
    raise exception 'hr-state-of-restatement §3(a): the installed body is not the one this file states it '
                    'installs (code md5 %, expected %). Regenerate the file; do not edit the constant.',
                    md5(v_code), c_code;
  end if;
  foreach v_item in array c_markers loop
    -- v_code, NOT v_def: a comment is not evidence that code exists.
    if strpos(v_code, v_item) = 0 then v_missing := v_missing || v_item || ' | '; end if;
  end loop;
  if v_missing <> '' then
    raise exception 'hr-state-of-restatement §3(a): the restatement DROPPED a section — missing marker(s): %',
                    v_missing;
  end if;
  -- The banner is a COMMENT and is checked as one, against the raw text. It is
  -- what a future author meets before reaching for replace()-and-execute again;
  -- it proves nothing about behaviour and is deliberately not in the array.
  if strpos(v_def, 'hr_state_of restated 2026-09-14') = 0 then
    raise exception 'hr-state-of-restatement §3(a): the restatement banner is gone from the installed body';
  end if;

  -- ── (b) REACHABILITY AND IDENTITY ───────────────────────────────────────
  if has_function_privilege('authenticated', c_sig, 'execute')
     or has_function_privilege('anon', c_sig, 'execute')
     or has_function_privilege('service_role', c_sig, 'execute') then
    raise exception 'hr-state-of-restatement §3(b): a client role can execute the projection directly';
  end if;
  if not has_function_privilege('hr_engine', c_sig, 'execute') then
    raise exception 'hr-state-of-restatement §3(b): hr_engine cannot execute hr_state_of — the '
                    'restatement would have taken every client envelope offline';
  end if;
  select pg_get_userbyid(pr.proowner) into v_item from pg_proc pr where pr.oid = c_sig::regprocedure;
  if v_item is distinct from 'postgres' then
    raise exception 'hr-state-of-restatement §3(b): hr_state_of is owned by % — a SECURITY DEFINER body '
                    'runs as its owner, so the restatement changed who the projection IS', v_item;
  end if;
  if not exists (select 1 from pg_proc pr where pr.oid = c_sig::regprocedure and pr.prosecdef) then
    raise exception 'hr-state-of-restatement §3(b): hr_state_of is no longer SECURITY DEFINER';
  end if;
  if not exists (select 1 from pg_proc pr
                  where pr.oid = c_sig::regprocedure
                    and pr.proconfig @> array['search_path=public']) then
    raise exception 'hr-state-of-restatement §3(b): hr_state_of lost its pinned search_path — a SECURITY '
                    'DEFINER body with a caller-controlled search_path is a privilege escalation';
  end if;

  -- ── (c) THE NO-REMOVAL PROOF, ON THE INSTALLED BODY ─────────────────────
  v_decl := btrim(regexp_replace(btrim(substring(v_code from 'declare .*? begin ')), ' begin$', ''));
  if v_decl is distinct from c_decl then
    raise exception 'hr-state-of-restatement §3(c): the installed body declares "%", not "%" — this '
                    'restatement claims to change NO code', v_decl, c_decl;
  end if;

  begin
    -- ── (d) THE PROBE ───────────────────────────────────────────────────────
    -- A real character, a real envelope. Every projection helper this body calls
    -- (hr_town_zone, hr_dungeon_cooldowns, hr_recipes_of, hr_gem_unlocks_of,
    -- hr_hero_slots_of, hr_total_level, hr_level_from_xp, hr_bounty_kills) runs
    -- for real, so a restatement that lost one fails HERE rather than on the
    -- first player to load.
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot) values (v_uid, 0)
      on conflict (user_id, slot) do nothing;

    v_env := public.hr_state_of(v_uid, 0);
    if coalesce(v_env->>'ok', 'false') <> 'true' then
      raise exception 'hr-state-of-restatement §3(d): the envelope for a fresh character is not ok: %',
                      v_env; end if;
    if jsonb_typeof(v_env->'state') <> 'object' then
      raise exception 'hr-state-of-restatement §3(d): the envelope carries no `state` object'; end if;

    v_top   := array(select * from jsonb_object_keys(v_env) as k order by 1);
    v_state := array(select * from jsonb_object_keys(v_env->'state') as k order by 1);
    if v_top is distinct from array(select unnest(c_top) order by 1) then
      raise exception 'hr-state-of-restatement §3(d): the envelope projects a DIFFERENT top-level key set. '
                      'missing %, unexpected % — tests/no-client-copy-of-projection.baseline.json pins '
                      '26 keys, and a key that vanishes here becomes a number the client keeps its own '
                      'copy of',
                      array(select unnest(c_top) except select unnest(v_top)),
                      array(select unnest(v_top) except select unnest(c_top)); end if;
    if v_state is distinct from array(select unnest(c_state) order by 1) then
      raise exception 'hr-state-of-restatement §3(d): `state` projects a DIFFERENT key set. missing %, '
                      'unexpected % — the baseline pins 36',
                      array(select unnest(c_state) except select unnest(v_state)),
                      array(select unnest(v_state) except select unnest(c_state)); end if;
    -- The two ENTITLEMENT arrays must be ARRAYS, never null: "you own nothing"
    -- is the one wrong answer an entitlement projection can give.
    if jsonb_typeof(v_env->'hero_slots') <> 'array' or jsonb_typeof(v_env->'gem_unlocks') <> 'array' then
      raise exception 'hr-state-of-restatement §3(d): hero_slots/gem_unlocks are not arrays (%, %) — an '
                      'entitlement must never read as "you own nothing"',
                      jsonb_typeof(v_env->'hero_slots'), jsonb_typeof(v_env->'gem_unlocks'); end if;
    -- A character that does not exist is refused by NAME, not by a null envelope.
    if coalesce(public.hr_state_of(v_uid, 7)->>'error', '') <> 'no_character' then
      raise exception 'hr-state-of-restatement §3(d): a missing character no longer returns no_character'; end if;

    raise exception using errcode = 'HR842', message = 'hr-state-of-restatement §3 complete — rolling back';
  exception when sqlstate 'HR842' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'hr-state-of-restatement §3: LEAKED a probe row — the self-check is not net-zero';
  end if;

  raise notice 'hr-state-of-restatement §3 PASSED: the installed body is the one this file states it '
               'installs (code pin), all 41 sections are present in the CODE, no client role can '
               'execute it, it is still SECURITY DEFINER owned by postgres with search_path=public, it '
               'declares only v_st, and a real fresh character''s envelope carries EXACTLY the 26 '
               'top-level and 36 state keys the projection baseline pins, with hero_slots and '
               'gem_unlocks as arrays and a missing character refused by name';
end $$;
