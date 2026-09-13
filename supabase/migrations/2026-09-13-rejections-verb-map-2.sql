-- 2026-09-13-rejections-verb-map-2.sql
--
-- STAGED — REVIEW ONLY, NOT AUTO-APPLIED.
-- The Coordinator applies this by hand (tools/apply-migration.mjs, one file,
-- one txn) AFTER a Security GO. It moves no player row, changes no price, no
-- payout and no verdict. It RESTATES one function — public.hr_record_rejection,
-- the anomaly recorder — and adds three helpers and one bounded jsonb column to
-- public.hr_rejections. No client-callable body is touched, no grant moves, no
-- ledger row is written. It is an OBSERVABILITY change on a security surface,
-- which is exactly the combination that has to be reviewed rather than assumed.
--
-- Ships with: tests/rejections-journal.mjs (arms P14–P19 + six mutations)
--             tools/vitals.mjs (--refusals gains the `whys` column)
--
-- ==========================================================================
-- WHAT THE BRIEF SAID, AND WHAT IS ACTUALLY TRUE — MEASURED FIRST
-- ==========================================================================
-- The ops brief for this lane listed six refusal codes as "invisible to
-- tools/vitals.mjs --refusals". Three of the six claims are FALSE, and they were
-- measured false before a line of this file was written, by replaying the whole
-- migration chain in PGlite (tests/schema-replay.mjs, no `upTo`) and CALLING the
-- verbs as a real signed-in player. Writing the measurement down is the point:
-- the previous lane's header had to do the same thing for the same table, and a
-- second observability migration built on a premise nobody checked would have
-- added a code→verb table for codes that already carry their verb.
--
--   MEASURED, chain end, 2026-09-13:
--     select public.hr_put_client_state(0, '{"gold":999}', <uuid>)
--       -> {"ok":false,"error":"forbidden_field","field":"gold"}
--       -> hr_rejections: code=forbidden_field, slot=0, intent=hr_put_client_state,
--          n=1, verbs={"hr_put_client_state": 1}
--     select public.hr_town_of('__nope__')
--       -> {"ok":false,"error":"bad_zone"}
--       -> hr_rejections: code=bad_zone, slot=0, intent=hr_town_of,
--          n=1, verbs={"hr_town_of": 1}
--
--   SO: `forbidden_field` IS journalled WITH ITS VERB. The brief's "not
--   journalled at all … silent on both ends" is wrong, and the reason it is
--   wrong is the reason §6 of 2026-09-12-hr-rejections-journal.sql discovers
--   wrappers BY SHAPE instead of from a list: hr_put_client_state has an
--   `__ungated` twin, both halves return jsonb, and it has exactly one inner
--   call site — so the sweep decorated it without anyone naming it. That is the
--   list-free design paying for itself, and it is also the answer to the brief's
--   "check why P6 does not already list it": P6 does not list ANY wrapper. It
--   enumerates every jsonb gated wrapper in `public` at CHAIN END and requires
--   exactly one seam in each, so hr_put_client_state has been inside P6's set
--   since the day P6 existed. A hand-written seam here would be churn on a
--   client-facing verb, a new last-toucher on the residue write path, and a
--   SECOND `hr_note_rejection(` occurrence that P6 would then fail on.
--   THIS FILE THEREFORE ADDS NO SEAM. It adds the EXECUTED probe that was
--   missing — §5(f) drives a real forbidden_field PUT and asserts the row — so
--   the claim is pinned by a test instead of by this paragraph.
--
--   Likewise `bad_zone` and `no_character` from the town verbs: journalled with
--   their verbs since 2026-09-13-town-presence-journal.sql, whose §4(d2)/(d4)
--   already execute exactly that. Nothing to add.
--
-- WHAT IS REALLY MISSING, and is what this file fixes:
--
--   G1. `bad_zone` NEVER ESCALATES. (Security P3, and it is real.) It is in
--       neither c_incident nor c_escalating, so it stays severity 'normal' at
--       any n — and it is the one code in the town family that a client can
--       ONLY produce by probing: hr_town_of's zone argument is the sole
--       free-text parameter on the presence surface, the wrapper decides the
--       refusal before any read happens, and the refusal is the cheapest call
--       in the database. Enumerating zone names is the reconnaissance move, and
--       today it is indistinguishable from a typo forever. It gets the
--       rate_limited/intent_mismatch profile, NOT c_incident: one is a stale
--       bookmark or a client shipped ahead of a zone, fifty in one day on one
--       character is a signature an honest client cannot produce, because the
--       client sends a zone from a server-projected list.
--
--   G2. `buff_at_max` FOLDS TWO DIFFERENT REFUSALS INTO ONE AGGREGATE. The
--       installed hr_apply raises it from two unrelated fuses:
--         (i)  the SEGMENT BUDGET — a ninth live segment of one type
--              (c_buff_max_segments = 8), detail carries why='segment_budget';
--         (ii) the MINIMUM-GAIN fuse — the 60-minute cap would swallow (almost)
--              the whole duration, detail carries until/cap/max_ms/gain_ms and
--              NO `why` at all.
--       (i) is a cost fuse on jsonb size that a player hits by eating a lot of
--       one food. (ii) is the game-designer's "do not eat the pie for nothing"
--       rule. They want opposite responses — (i) is a balance signal, (ii) is a
--       UI gap — and the aggregate key is (user, slot, day, code), so they share
--       one row and the only discriminator, `why`, lives in `last_detail`, which
--       is LAST-WRITER-WINS. Two fuses, one number, no way to split it: D1 of
--       the previous lane's header, one level down.
--
--   G3. A REFUSAL RAISED INSIDE hr_apply IS LABELLED BY THE DELTA, NOT BY THE
--       GESTURE. hr_apply's §6 records with
--           coalesce(p_delta #>> '{journal,intent}', 'apply')
--       so a buff refusal on a delta with no journal label is filed under the
--       verb 'apply' — which names the RPC, not the thing the player did. The
--       buff family (bad_buff_item / buff_at_max / buff_not_paid) is reachable
--       ONLY through the `buff_apply` delta key, so the server already knows the
--       verb from the code and does not need the client to tell it.
--
-- ==========================================================================
-- THE SHAPE — A SECOND BOUNDED MAP, NOT A SECOND CODE AND NOT A SECOND ROW
-- ==========================================================================
--   V1  hr_rejection_why(jsonb) -> a BOUNDED why token taken from the detail's
--       `why` key, same character/length bound as hr_rejection_verb, and the
--       literal '(none)' when the detail carries no why. '(none)' is a real
--       answer, not a gap: it is what makes the map's values SUM TO `n`, so
--       buff_at_max reads {"segment_budget":3,"(none)":2} and the cap arm's
--       count is exact rather than inferred.
--   V2  hr_rejections.whys jsonb not null default '{}' — maintained by the SAME
--       hr_verb_bump primitive the verbs map uses (cap 12), on both the insert
--       and the conflict path. It CANNOT add a row and it cannot exceed 13 keys.
--   V3  hr_rejection_verb_for(code, intent) -> the verb, with a SERVER-AUTHORED
--       code→verb FALLBACK that fires ONLY when the caller's label is
--       unattributable ('apply' or '(none)'). A real label is never overridden —
--       `no_character` comes from a dozen verbs and overriding it would destroy
--       the information the previous lane added.
--   V4  hr_record_rejection is RESTATED IN FULL (see below) with `bad_zone` and
--       `buff_not_paid` added to c_escalating (Security, 2026-09-13) and the two
--       maps maintained through V1/V3.
--
-- ── WHY A `whys` MAP AND NOT A SECOND ERROR CODE ────────────────────────────
-- The brief offered both: carry `why` into the aggregate key, or split
-- buff_at_max into buff_at_max / buff_segment_budget at the source with an
-- anchored patch on hr_apply. The map is the better trade, and the reasons are
-- ordered by how much they would have cost:
--   1. THE SPLIT TOUCHES hr_apply. hr_apply is the economy's single write path,
--      is 36 anchored patches deep, is live-hash-tracked, and three migrations
--      applied TODAY (consumable-buffs 05:19, buff-apply-coupling, buff-segments
--      06:02 UTC) are its most recent touchers. Re-patching it for an
--      observability split buys a Security review of the gold path, a live-hash
--      re-seed, and a 37th link in the chain the patch-chain guard exists to
--      stop — to separate two counters.
--   2. A CODE IS A CONTRACT WITH THE CLIENT; A `why` IS NOT. `error` is what the
--      player's client switches on. Splitting one code into two means every
--      present and future consumer must learn the second name or silently stop
--      handling the case. There is no buff_apply emitter yet (step 2 of the buff
--      program is unwired, measured: zero matches for `buff_apply` in src/** and
--      supabase/functions/**), so the split is cheap TODAY and expensive the
--      moment it is not — and `why` is already in the envelope either way.
--   3. THE MAP GENERALISES AND THE SPLIT DOES NOT. Every code that carries a
--      `why` gets the breakdown for free: bad_buff_item already distinguishes
--      why='forbidden_key' (a forged buff shape — an honest client cannot send
--      it) from why='not an object' (a client bug) from no-why (an item that
--      simply carries no buff). Those are three different mornings, and splitting
--      codes one pair at a time would never have reached them.
--   4. IT COSTS NOTHING AT SCALE. Same property the verbs map has: at most
--      13 keys × ~32 bytes ≈ under 0.5 KB per EXISTING row, and it cannot create
--      a row. Rows at 100× players are unchanged — players × slots × days ×
--      codes, pruned at 180 days (measured today: 163 rows from a month of six
--      players; worst case 600 × 3 × ~16 × 365 = 10.5M/year if every player trips
--      every code on every character every day, three orders of magnitude above
--      anything observed).
-- The one thing the map does NOT give is a distinct MACHINE NAME for the segment
-- fuse, and one improvement is left for the owner of hr_apply rather than taken
-- here: the minimum-gain arm raises buff_at_max with no `why`, so it reads as
-- '(none)'. Adding `'why','duration_cap'` to that single hr_reject call is a
-- one-token edit on a body that lane already owns, and §5(e) below asserts the
-- CURRENT shape so that if they do it, this file's re-apply says so out loud
-- instead of silently re-labelling a counter.
--
-- ── WHY hr_record_rejection IS RESTATED, NOT PATCHED ────────────────────────
-- tests/patch-chain-guard.mjs's standing rule is "do not add a patch to a chain
-- already two deep; restate the body instead". hr_record_rejection measures
-- depth 1 (one anchored patcher since 2026-08-11-player-state.sql: the S4 block
-- of 2026-09-12-hr-rejections-journal.sql, four replace() calls). A patch here
-- would be legal and would leave the body at depth 2 — i.e. at the rule's floor,
-- with the text that actually runs existing in no file, on the function that
-- decides what `severity = 'incident'` means. It is restated instead, which
-- takes the chain to ZERO and is the only chain in the tree that slice 7 can
-- close as a side effect of a feature.
--
-- ⚠ THE RESTATEMENT RISK IS REAL AND IS ASSERTED, NOT ARGUED. The previous
-- lane's header refused to restate this body for a named reason: the
-- incident/escalating CATALOGUES live here, four separate Security rulings have
-- added codes to them (2026-09-03-intent-mismatch-escalates.sql,
-- 2026-09-06-companion-grant-hardening.sql, 2026-09-07-companion-codes-
-- severity.sql), and a restatement from a stale template SILENTLY DROPS whichever
-- ruling landed last — the b484–b487 class. So §0 reads the INSTALLED arrays out
-- of pg_get_functiondef BEFORE replacing anything, stores them in a session GUC,
-- and §5(a) fails the file unless the restated arrays are a STRICT SUPERSET of
-- what was there. A dropped code cannot reach production through this file: it
-- aborts the transaction. That check is generic, so it also protects the NEXT
-- restatement of this body.
--
-- ⚠ AND A RESTATEMENT RELOCATES PROPERTIES, WHICH BLINDS GUARDS THAT NAME THE
-- OLD PLACE. Concretely: `c_cap constant text := '24';` in
-- 2026-09-12-hr-rejections-journal.sql is now DEAD TEXT at chain end — its patch
-- still splices 24 into the recorder and §4 of this file then overwrites the
-- whole body with its own `c_verb_cap constant int := 24`. That is not
-- hypothetical: tests/rejections-journal.mjs's `cap_loosened` mutation, which
-- had been catching an unbounded verb map, went MISSED on the first --selftest
-- run after this file landed, because it was editing the dead copy. The
-- mutation was moved to anchor on the live literal (and the reason is written
-- into the catalogue entry, not just here). ANY future restatement of any body
-- in this tree should expect the same and re-run --selftest, which is precisely
-- why this guard replays the WHOLE chain instead of `upTo` its own file.
--
-- ── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────────
-- IT CARRIES EXACTLY TWO SEVERITY RULINGS, BOTH SECURITY'S, BOTH ESCALATING.
-- The first draft of this file shipped only G1 (`bad_zone`) and deliberately
-- DECLINED to classify the two buff shapes an honest client cannot produce,
-- because a classification is a Security call and not a backend one. Their
-- GO-WITH-CHANGES (2026-09-13) on this file made one of them a condition:
--   `buff_not_paid` (a buff_apply with no matching −1 debit) joins c_escalating
--   at the shared n=50. NOT c_incident, for the reason recorded beside the array
--   in §4: it is a RELEASE code on an emitter that does not exist yet, so a
--   first-version eat path that forgot the debit would make the FIRST honest eat
--   an incident for every player at once. §5(f3b) executes 49-then-50.
--   `bad_buff_item`/why=forbidden_key (a delta naming a buff's magnitude or
--   expiry — the forgery) was ruled to need its OWN code, `bad_buff_shape`,
--   classified c_incident and raised by the owner of hr_apply, not here. Filed
--   as F3 in docs/DISCOVERIES.md; it is NOT in this file, because putting a
--   forgery signature and a content gap under one code is the defect this file
--   exists to fix, and re-using `bad_buff_item` for it would repeat it.
-- IT ADDS NO CLIENT-READABLE SURFACE and no policy. hr_rejections stays RLS-on /
-- zero-policy / zero-grant, and §5(b) asserts it.
-- IT TOUCHES NO EDGE FUNCTION and needs no ?v= bump. supabase/functions/** does
-- not move; tools/vitals.mjs is a read-only ops tool outside the bundle.

-- ========================================================================
-- 0.  PRECONDITIONS — fail closed, and capture the catalogues BEFORE replacing
-- ========================================================================
do $$
declare
  v_src text;
  v_inc text;
  v_esc text;
begin
  if to_regclass('public.hr_rejections') is null then
    raise exception 'hr_rejections is absent — apply 2026-08-11-player-state.sql first';
  end if;
  if to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 'hr_record_rejection(uuid,int,text,text,jsonb,bigint) is absent — apply '
                    '2026-08-11-player-state.sql first';
  end if;
  -- The three primitives this restatement CALLS. Restating the recorder against
  -- a database that has not had 2026-09-12-hr-rejections-journal.sql applied
  -- would install a body referring to functions that do not exist — it would
  -- compile (plpgsql resolves at first execution) and then fail on the first
  -- refusal in production, turning every clean refusal into a 500 for the
  -- duration. Fail here instead.
  if to_regprocedure('public.hr_verb_bump(jsonb,text,bigint,int)') is null
     or to_regprocedure('public.hr_rejection_verb(text)') is null
     or to_regprocedure('public.hr_detail_bound(jsonb)') is null then
    raise exception 'hr_verb_bump / hr_rejection_verb / hr_detail_bound missing — apply '
                    '2026-09-12-hr-rejections-journal.sql first; this file restates the recorder '
                    'that calls all three';
  end if;
  if to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null then
    raise exception 'hr_note_rejection is absent — apply 2026-09-12-hr-rejections-journal.sql first';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'hr_rejections' and column_name = 'verbs') <> 1 then
    raise exception 'hr_rejections.verbs is absent — apply 2026-09-12-hr-rejections-journal.sql first; '
                    'the whys map is its twin and the two are maintained by one expression pair';
  end if;

  -- THE SUPERSET EVIDENCE. Read the arrays out of the installed body and stash
  -- them for §5(a). CR is stripped: the migrations are checked in with CRLF and
  -- the apply path posts file bytes, so prosrc on production can carry CR.
  v_src := replace(pg_get_functiondef(
             'public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)'::regprocedure), chr(13), '');
  v_inc := substring(v_src from 'c_incident constant text\[\] := array\[([^\]]*)\]');
  v_esc := substring(v_src from 'c_escalating constant text\[\] := array\[([^\]]*)\]');
  if v_inc is null or v_esc is null then
    raise exception 'could not read c_incident / c_escalating out of the installed '
                    'hr_record_rejection — this file restates the body and CANNOT prove it preserves '
                    'the severity catalogues without them. Refusing to replace it blind.';
  end if;
  -- Stored as the raw array literal text. §5(a) re-parses both sides the same
  -- way, so comment text between the entries is irrelevant to the comparison.
  perform set_config('hearthrise.rvm2_incident_before', v_inc, false);
  perform set_config('hearthrise.rvm2_escalating_before', v_esc, false);
  raise notice 'rejections-verb-map-2: captured the severity catalogues before the restatement '
               '(% incident entries, % escalating entries)',
               (select count(*) from regexp_matches(v_inc, '''([a-z0-9_]+)''', 'g')),
               (select count(*) from regexp_matches(v_esc, '''([a-z0-9_]+)''', 'g'));
end $$;

-- ========================================================================
-- 1.  V1 — THE BOUNDED `why` TOKEN
-- ========================================================================
-- Same posture as hr_rejection_verb: this value becomes a jsonb MAP KEY, so it
-- is bounded by CONSTRUCTION rather than by trusting its origin. Today every
-- `why` in the tree is a server literal; the detail jsonb as a whole is not
-- (hr_apply passes `v_out - 'ok' - 'error'`, which on some paths echoes shapes
-- derived from the delta), and a key an operator reads in a terminal must not be
-- able to carry control characters, quotes or 4 KB of anything.
--
-- '(none)' rather than NULL when there is no why: hr_verb_bump skips an empty
-- key, so a NULL would leave the map's values summing to LESS than `n` and the
-- missing arm of a two-fuse code would have to be inferred by subtraction. The
-- literal makes the breakdown exact and self-describing — which is the only
-- reason this column is worth adding at all.
create or replace function public.hr_rejection_why(p_detail jsonb)
returns text language sql immutable set search_path = public, pg_catalog as $$
  select case when w is null or w = '' then '(none)' else w end
    from (
      select nullif(left(regexp_replace(
               lower(coalesce(case when jsonb_typeof(p_detail) = 'object'
                                   then p_detail ->> 'why' end, '')),
               '[^a-z0-9_.-]', '', 'g'), 24), '') as w
    ) q
$$;
revoke execute on function public.hr_rejection_why(jsonb)
  from public, anon, authenticated, service_role;

-- ========================================================================
-- 2.  V3 — THE VERB, WITH A SERVER-AUTHORED FALLBACK
-- ========================================================================
-- G3: a refusal raised inside hr_apply is labelled by the DELTA, and a delta
-- with no `journal.intent` is labelled 'apply' — the RPC's name, not the
-- player's gesture. For a code that is reachable from exactly ONE gesture the
-- server can supply the verb itself, and it is strictly better that it does:
-- the label cannot go missing, and WHEN THE CALLER SUPPLIES NO LABEL it is
-- unforgeable (Security F4, 2026-09-13: scope this claim, do not overstate it).
-- The map does NOT make the `verbs` column unforgeable in general — it is
-- fallback-only by design, so a caller that DOES supply a label still chooses
-- its own bucket, and hr_apply's label is request-derived
-- (`p_delta #>> '{journal,intent}'`). What the map guarantees is narrower and
-- is the part that matters here: the two UNATTRIBUTABLE labels can no longer
-- swallow a code whose gesture the server already knows. Bounding the damage a
-- chosen label can do is hr_rejection_verb's job (24 filtered characters, two
-- segments, a capped map) and remains so.
--
-- THE RULE IS FALLBACK-ONLY, AND THAT IS THE LOAD-BEARING PART. An override
-- would be a regression: `no_character` is answered by a dozen verbs and
-- `forbidden_field` would lose nothing today but would lose everything the day a
-- second verb grows a deny-list. So the map fires only when the caller's label
-- is one of the two UNATTRIBUTABLE ones — '(none)' (no label at all) and 'apply'
-- (hr_apply's own fallback). A real verb always wins.
--
-- THE MAP IS A LIST, WHICH IS A LIABILITY, SO IT IS SHORT AND EVERY ENTRY PAYS:
--   bad_buff_item / buff_at_max / buff_not_paid  ->  buff_apply
--       All three are raised ONLY inside hr_apply's `buff_apply` block (measured
--       from the installed body), so the code implies the gesture with no
--       ambiguity whatsoever.
--   bad_zone       ->  hr_town_of     (the only emitter; belt-and-braces, since
--                                      the wrapper already supplies the label)
--   forbidden_field->  hr_put_client_state   (likewise — the only deny-list)
-- A code reachable from two verbs must NEVER be added here. §5(c) asserts the
-- map's domain against that rule by checking it contains no code that the tree's
-- own bodies emit from more than one place.
create or replace function public.hr_rejection_verb_for(p_code text, p_intent text)
returns text language sql immutable set search_path = public, pg_catalog as $$
  select case
    when v in ('(none)', 'apply') then coalesce(
      case lower(coalesce(p_code, ''))
        when 'bad_buff_item'   then 'buff_apply'
        when 'buff_at_max'     then 'buff_apply'
        when 'buff_not_paid'   then 'buff_apply'
        when 'bad_zone'        then 'hr_town_of'
        when 'forbidden_field' then 'hr_put_client_state'
        else null
      end, v)
    else v
  end
  from (select public.hr_rejection_verb(p_intent) as v) q
$$;
revoke execute on function public.hr_rejection_verb_for(text, text)
  from public, anon, authenticated, service_role;

-- ========================================================================
-- 3.  V2 — THE COLUMN
-- ========================================================================
-- Additive, defaulted, NOT NULL: an existing row reads '{}' and says "this row
-- predates the breakdown", which is honest. No backfill — there is nothing to
-- back-fill from, because the discriminator was never stored.
alter table public.hr_rejections
  add column if not exists whys jsonb not null default '{}'::jsonb;

-- ========================================================================
-- 4.  V4 — hr_record_rejection, RESTATED IN FULL (chain depth 1 -> 0)
-- ========================================================================
-- Every comment in the two catalogues below is carried forward verbatim from the
-- body this replaces. They are four Security rulings, they are the only record
-- of WHY each code sits where it sits, and dropping them to shorten a
-- restatement is how the ruling gets re-litigated in six weeks.
create or replace function public.hr_record_rejection(
  p_user uuid, p_slot int, p_intent text, p_code text, p_detail jsonb default '{}'::jsonb,
  p_count bigint default 1)
returns void language plpgsql security definer set search_path = public as $$
declare
  -- A rejection is an INCIDENT when it means a caller proposed something an
  -- honest game loop cannot propose. Everything else is ordinary contention or
  -- an ordinary "you cannot afford that".
  c_incident constant text[] := array[
    'gold_clamp','gem_clamp','item_clamp','xp_clamp','progress_clamp',
    'too_many_item_kinds','too_many_equip_ops','too_many_farm_ops',
    'too_many_progress_ops','unknown_item','unknown_skill','unknown_activity',
    'unknown_crop','unknown_equip_slot','unknown_delta_key','wrong_slot',
    'requirement_not_met','activity_locked','bad_progress_state','overflow',
    'seller_unavailable','forbidden_impersonation',
    -- unknown_unlock (2026-08-31, Security ruling C6 on the companion-grant
    -- hardening sign-off). NEVER player behaviour, and no forgery can produce
    -- it: hr_companion_grant emits this code only when the companion:<id> row
    -- is MISSING from public.hr_unlocks, which is a SERVER catalogue defect.
    -- One occurrence means the unlock catalogue has been destroyed again (the
    -- b453 wholesale delete class, which production sat in from 2026-08-23 to
    -- 2026-08-30 while players silently lost companions). After the reseed the
    -- row set is COMPLETE, so the steady state is zero and a first-occurrence
    -- alarm is not a noisy detector here. It is the only useful kind: the
    -- damage lands on call ONE, so a threshold would watch fifty players lose
    -- a companion before it spoke. NOT c_escalating: the counter is PER
    -- PLAYER, so a catalogue destroyed on a quiet day never reaches fifty.
    'unknown_unlock'];
  -- ESCALATING CODES (security review C2). `rate_limited` is deliberately NOT
  -- an incident on its own: one player behind a flaky connection retrying a
  -- burst will trip 240 applies/min honestly, and marking that an incident
  -- would flood hr_rejections_incident_idx — the index exists so that "show me
  -- every incident this week" is answerable, and an alert that fires for normal
  -- play is an alert nobody reads. But SUSTAINED rate limiting is the loudest
  -- automation signal the server produces, so it escalates on the DAILY
  -- counter this table already keeps: past the threshold the same row is
  -- promoted to 'incident' in place. One row per player per day either way.
  --
  -- `own_listing` joins the list (review S9). Buying your own listing once is a
  -- misclick; doing it over and over is the wash-trading signature — the shape
  -- of someone probing for a way to launder gold between two accounts they
  -- control, or testing whether the self-trade guard can be raced. It was
  -- returning silently, so it left no trace at all.
  -- 'intent_mismatch' (2026-09-03, Security ruling on finding #7). ONE is a
  -- stale retry — a reload mid-gesture, a bfcache restore, a queued request
  -- replayed after a slot switch. FIFTY in a day is a signature an honest
  -- client cannot produce, because every client site mints a fresh uuid per
  -- gesture. That is this array's profile exactly, and NOT c_incident's,
  -- which fires on the first occurrence and would make every late retry an
  -- alarm. The row was always written; now the severity is earned.
  -- missing_req_item (2026-08-31, Security ruling C6). TODAY only a forged
  -- local inventory can produce it: dragon_egg is in no catalogue, no drop
  -- table, no recipe and no shop, so no honest client can ask to hatch one.
  -- That argues for c_incident only while it stays true. The moment dragon_egg
  -- ships client-side ahead of server-side, an HONEST client holding a local
  -- egg the server cannot see answers this on every hatch: state divergence,
  -- our content gap, not abuse. Escalating is safe in BOTH worlds, which is
  -- why it is chosen: ONE is a stale client, FIFTY in a day is a signature an
  -- honest client cannot produce. Same reasoning as intent_mismatch above.
  -- 'bad_zone' (2026-09-13, Security P3 on the town-presence sign-off).
  -- hr_town_of's `p_zone` is the only free-text parameter on the presence
  -- surface; the wrapper refuses an unknown zone BEFORE it reads anything, so
  -- the refusal is the cheapest call in the database and enumerating zone names
  -- is the obvious reconnaissance move. ONE is a stale bookmark or a client
  -- shipped ahead of a zone; FIFTY on one character in one day is a signature
  -- an honest client cannot produce, because it picks zones from a
  -- server-projected list. NOT c_incident, for the intent_mismatch reason: a
  -- first-occurrence alarm on a typo is an alarm nobody reads.
  -- 'buff_not_paid' (2026-09-13, Security GO-WITH-CHANGES on this file).
  -- hr_apply refuses a `buff_apply` that is not PAID FOR in the same delta —
  -- items[<food>] must be exactly -1 — so one occurrence is a client that asked
  -- for a buff without spending the item, which an honest emitter never does.
  -- ESCALATING AND NOT c_incident, which was considered and rejected for a
  -- named reason: buff_not_paid is a RELEASE CODE (2026-09-13-buff-apply-
  -- coupling.sql), i.e. the intent row is deleted so the client may retry, and
  -- the eat path that emits it is unwritten. A first-version emitter bug that
  -- forgot the debit would therefore make EVERY honest eat an incident on its
  -- first call, for every player, and an alert that fires for normal play is an
  -- alert nobody reads. FIFTY on one character in one day is the signature
  -- instead: a deliberate attempt to get a buff for free, which the coupling
  -- rule exists to stop.
  c_escalating constant text[] := array[
    'rate_limited','own_listing','intent_mismatch','missing_req_item','bad_zone',
    'buff_not_paid'];
  c_escalate_at constant bigint := 50;
  -- The key caps on the two bounded maps. The verbs cap is carried forward from
  -- 2026-09-12-hr-rejections-journal.sql unchanged. The whys cap is smaller on
  -- purpose: a `why` is authored by the body that raises the code, so a code with
  -- more than a dozen of them is a defect in that body, and '(other)' saying so
  -- is the right answer.
  c_verb_cap constant int := 24;
  c_why_cap  constant int := 12;
begin
  if p_user is null or p_code is null then return; end if;
  perform set_config('hearthrise.rejection_noted', '1', true);
  -- p_count is the number of real occurrences this call REPRESENTS. It is 1 for
  -- everything except a sampled rate-limit record, where the caller passes the
  -- gap since the previous sample so that `n` — and therefore the escalation
  -- threshold above — keeps counting actual events rather than samples. See
  -- hr_rate_sample_weight() in §6c. (Review S6.)
  insert into public.hr_rejections as r
    (user_id, slot, day, code, severity, intent, n, last_detail, verbs, whys)
  values (p_user, coalesce(p_slot, 0), current_date, p_code,
          case when p_code = any (c_incident) then 'incident' else 'normal' end,
          left(coalesce(p_intent, ''), 64), greatest(1, coalesce(p_count, 1)),
          public.hr_detail_bound(p_detail),
          public.hr_verb_bump('{}'::jsonb, public.hr_rejection_verb_for(p_code, p_intent),
                              greatest(1, coalesce(p_count, 1)), c_verb_cap),
          public.hr_verb_bump('{}'::jsonb, public.hr_rejection_why(p_detail),
                              greatest(1, coalesce(p_count, 1)), c_why_cap))
  on conflict (user_id, slot, day, code) do update
    set n = r.n + greatest(1, coalesce(p_count, 1)),
        last_at = now(), last_detail = excluded.last_detail,
        -- excluded.intent is already the left(...,64) form the insert list built,
        -- so the verb derives from the same expression on both paths. The `why`
        -- cannot come from `excluded` — last_detail is bounded and may have been
        -- replaced by {"truncated": n} — so it is re-derived from p_detail, which
        -- is the same value the insert path read.
        verbs = public.hr_verb_bump(r.verbs, public.hr_rejection_verb_for(p_code, excluded.intent),
                                    greatest(1, coalesce(p_count, 1)), c_verb_cap),
        whys  = public.hr_verb_bump(r.whys, public.hr_rejection_why(p_detail),
                                    greatest(1, coalesce(p_count, 1)), c_why_cap),
        intent = excluded.intent,
        -- Severity only ever ratchets UP, and only for a code that is on the
        -- escalating list. It is never downgraded by a later hit.
        severity = case
          when r.severity = 'incident' then 'incident'
          when p_code = any (c_escalating)
               and r.n + greatest(1, coalesce(p_count, 1)) >= c_escalate_at then 'incident'
          else r.severity end;
exception when others then
  -- Recording a rejection must NEVER turn a clean rejection into a 500. If the
  -- bookkeeping fails we lose one observation, not the player's request.
  null;
end $$;
revoke execute on function public.hr_record_rejection(uuid, int, text, text, jsonb, bigint)
  from public, anon, authenticated, service_role;

-- ========================================================================
-- 5.  SELF-VERIFYING COMMIT GATE (CLAUDE.md §4)
-- ========================================================================
-- Properties proven by EXECUTING SQL, not by markers. The apply is atomic, so a
-- raise here reverts §1–§4. The row-writing probes live in a subtransaction
-- discarded by a sentinel raise (HR813), so this block is net-zero on
-- production — asserted after the rollback, on four tables.
do $$
declare
  v_inc_before  text;
  v_esc_before  text;
  v_missing     text;
  v_bad         text;
  v_n           int;
  v_row         record;
  v_res         jsonb;
  v_i           int;
  v_uid   constant uuid := '000000cd-0000-0000-0000-0000000000b1';
  v_other constant uuid := '000000cd-0000-0000-0000-0000000000b2';
  v_src         text;
begin
  -- ── (a) THE RESTATEMENT IS A STRICT SUPERSET ───────────────────────────
  -- The named reason the previous lane refused to restate this body. A code
  -- dropped from either catalogue is a Security ruling silently reverted, so it
  -- aborts the transaction rather than reaching production.
  v_inc_before := current_setting('hearthrise.rvm2_incident_before', true);
  v_esc_before := current_setting('hearthrise.rvm2_escalating_before', true);
  if coalesce(v_inc_before, '') = '' or coalesce(v_esc_before, '') = '' then
    raise exception 'GATE(a): §0 did not capture the severity catalogues — this file RESTATES the '
                    'recorder and cannot prove it preserved four Security rulings, so it refuses to '
                    'claim it';
  end if;
  v_src := replace(pg_get_functiondef(
             'public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)'::regprocedure), chr(13), '');
  select string_agg(c, ', ' order by c) into v_missing from (
    select m[1] as c from regexp_matches(v_inc_before, '''([a-z0-9_]+)''', 'g') m
     except
    select m[1] from regexp_matches(
      substring(v_src from 'c_incident constant text\[\] := array\[([^\]]*)\]'),
      '''([a-z0-9_]+)''', 'g') m) q;
  if v_missing is not null then
    raise exception 'GATE(a): the restated c_incident DROPPED %. Each of those is a Security ruling '
                    'and this is the b484-b487 class on the severity catalogue.', v_missing;
  end if;
  select string_agg(c, ', ' order by c) into v_missing from (
    select m[1] as c from regexp_matches(v_esc_before, '''([a-z0-9_]+)''', 'g') m
     except
    select m[1] from regexp_matches(
      substring(v_src from 'c_escalating constant text\[\] := array\[([^\]]*)\]'),
      '''([a-z0-9_]+)''', 'g') m) q;
  if v_missing is not null then
    raise exception 'GATE(a): the restated c_escalating DROPPED %', v_missing;
  end if;
  -- ...and the two additions this file is FOR are present, in the right array.
  -- Both were ruled ESCALATING and both had c_incident considered and REJECTED,
  -- so the absence from c_incident is asserted as loudly as the presence.
  for v_bad in select unnest(array['bad_zone', 'buff_not_paid']) loop
    if position('''' || v_bad || '''' in
                substring(v_src from 'c_escalating constant text\[\] := array\[([^\]]*)\]')) = 0 then
      raise exception 'GATE(a): % is not in c_escalating after the restatement — the G1 half of this '
                      'file and Security''s GO-WITH-CHANGES condition', v_bad;
    end if;
    if position('''' || v_bad || '''' in
                substring(v_src from 'c_incident constant text\[\] := array\[([^\]]*)\]')) > 0 then
      raise exception 'GATE(a): % reached c_incident — that classification was considered and REJECTED '
                      '(bad_zone: a first-occurrence alarm on a zone typo is an alarm nobody reads; '
                      'buff_not_paid: it is a RELEASE code on an unwritten emitter, so a first-version '
                      'bug that forgot the debit would make every honest eat an incident)', v_bad;
    end if;
  end loop;
  -- The chain is now ZERO deep, which is only true if the installed text is THIS
  -- file's. A positive control on the restatement itself: the body must call the
  -- new fallback resolver, or the restatement silently kept the old expression.
  if position('hr_rejection_verb_for' in v_src) = 0 or position('hr_rejection_why' in v_src) = 0 then
    raise exception 'GATE(a): the installed recorder does not call hr_rejection_verb_for / '
                    'hr_rejection_why — the restatement did not take';
  end if;
  if position('hearthrise.rejection_noted' in v_src) = 0 then
    raise exception 'GATE(a): the restatement LOST the once-per-transaction flag — a body that records '
                    'its own specific refusal would be recorded again by its wrapper, counts would '
                    'inflate and the 50-threshold would fire on honest play';
  end if;
  if position('hr_detail_bound' in v_src) = 0 then
    raise exception 'GATE(a): the restatement LOST the detail bound';
  end if;

  -- ── (b) NOTHING THIS FILE CREATES IS CLIENT-REACHABLE ──────────────────
  -- revoke-before-grant, asserted from the catalogue. A client grant on the
  -- recorder is a way to forge another player's abuse record; a grant on the
  -- resolvers is a way to read the code->verb map and therefore the detector's
  -- shape.
  for v_bad in select unnest(array[
      'public.hr_record_rejection(uuid,integer,text,text,jsonb,bigint)',
      'public.hr_rejection_why(jsonb)',
      'public.hr_rejection_verb_for(text,text)']) loop
    if to_regprocedure(v_bad) is null then
      raise exception 'GATE(b): % did not install', v_bad; end if;
    select string_agg(r, ',') into v_missing
      from unnest(array['anon', 'authenticated', 'service_role', 'hr_engine']) r
     where has_function_privilege(r, v_bad, 'execute');
    if v_missing is not null then
      raise exception 'GATE(b): % is executable by % — a privileged recorder left callable by a client '
                      'role is the whole game', v_bad, v_missing;
    end if;
    if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                where p.oid = to_regprocedure(v_bad)
                  and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'GATE(b): PUBLIC holds EXECUTE on %', v_bad; end if;
  end loop;
  -- The journal stays ops-only: RLS on, no policy, no grant. Unchanged by this
  -- file, asserted because the file adds a COLUMN to it.
  if not (select relrowsecurity from pg_class where oid = 'public.hr_rejections'::regclass) then
    raise exception 'GATE(b): RLS is off on hr_rejections'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_rejections') then
    raise exception 'GATE(b): a policy appeared on hr_rejections — the journal is ops-only by design';
  end if;
  select string_agg(coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type, ', ') into v_bad
    from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    left join pg_roles r on r.oid = a.grantee
   where c.oid = 'public.hr_rejections'::regclass
     and (a.grantee = 0 or r.rolname in ('anon', 'authenticated'));
  if v_bad is not null then
    raise exception 'GATE(b): hr_rejections is reachable by a client role (%)', v_bad; end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'hr_rejections' and column_name = 'whys') <> 1 then
    raise exception 'GATE(b): hr_rejections.whys did not install'; end if;

  -- ── (c) THE FALLBACK MAP IS FALLBACK-ONLY, AND ITS DOMAIN IS LAWFUL ────
  -- A real verb must never be overridden: that is what stops the map destroying
  -- the resolution the previous lane added.
  if public.hr_rejection_verb_for('bad_zone', 'hr_town_of') <> 'hr_town_of'
     or public.hr_rejection_verb_for('forbidden_field', 'hr_put_client_state')
        <> 'hr_put_client_state'
     or public.hr_rejection_verb_for('buff_at_max', 'eat:roast_carrot') <> 'eat:roast_carrot' then
    raise exception 'GATE(c): the code->verb map OVERRODE a real label — it must fire only on the two '
                    'unattributable ones';
  end if;
  if public.hr_rejection_verb_for('buff_at_max', 'apply') <> 'buff_apply'
     or public.hr_rejection_verb_for('buff_not_paid', null) <> 'buff_apply'
     or public.hr_rejection_verb_for('bad_buff_item', 'apply') <> 'buff_apply' then
    raise exception 'GATE(c): a buff code under an unattributable label did not resolve to buff_apply';
  end if;
  -- An unmapped code under an unattributable label keeps the label: the map must
  -- not invent a verb it does not know.
  if public.hr_rejection_verb_for('version_conflict', 'apply') <> 'apply'
     or public.hr_rejection_verb_for('no_character', 'apply') <> 'apply' then
    raise exception 'GATE(c): the map invented a verb for an unmapped code';
  end if;
  -- ...and every label it CAN produce must survive hr_rejection_verb's own
  -- bound, or the journal names a verb that is not the verb.
  for v_bad in select unnest(array['buff_apply', 'hr_town_of', 'hr_put_client_state']) loop
    if public.hr_rejection_verb(v_bad) <> v_bad then
      raise exception 'GATE(c): the label % does not round-trip through hr_rejection_verb (-> %)',
                      v_bad, public.hr_rejection_verb(v_bad);
    end if;
  end loop;
  -- THE DOMAIN RULE, executed: a code in the map must be emitted from exactly
  -- ONE function in `public`. The moment a second body can answer it, the
  -- fallback would file two verbs' refusals under one name. The journal's own
  -- machinery is excluded by name — the recorder now carries 'bad_zone' in
  -- c_escalating and the resolver carries all five as map keys, and counting
  -- those as emitters would make this check fail on its own file.
  select string_agg(x.code || '=' || x.n::text, ', ' order by x.code) into v_bad
    from (select c as code, (select count(*) from pg_proc p join pg_namespace ns
                              on ns.oid = p.pronamespace
                             where ns.nspname = 'public' and p.prokind = 'f'
                               and p.proname not in ('hr_record_rejection', 'hr_rejection_verb_for')
                               and p.prosrc like '%''' || c || '''%') as n
            from unnest(array['bad_buff_item','buff_at_max','buff_not_paid','bad_zone',
                              'forbidden_field']) c) x
   where x.n <> 1;
  if v_bad is not null then
    raise exception 'GATE(c): a mapped code does not have exactly ONE emitting body (%) — a code->verb '
                    'fallback is only sound while the code has one emitter. Drop it from the map in '
                    'section 2, or name the second emitter there.', v_bad;
  end if;

  -- ── (d) THE `why` TOKEN IS BOUNDED BY CONSTRUCTION ─────────────────────
  if public.hr_rejection_why(null) <> '(none)'
     or public.hr_rejection_why('{}'::jsonb) <> '(none)'
     or public.hr_rejection_why('[1,2]'::jsonb) <> '(none)'
     or public.hr_rejection_why('{"why":null}'::jsonb) <> '(none)' then
    raise exception 'GATE(d): a detail with no usable why did not fold to (none) — the whys map would '
                    'stop summing to n';
  end if;
  if public.hr_rejection_why('{"why":"segment_budget"}'::jsonb) <> 'segment_budget' then
    raise exception 'GATE(d): the real why did not survive'; end if;
  if public.hr_rejection_why('{"why":"Vault''; DROP TABLE x --"}'::jsonb) <> 'vaultdroptablex--' then
    raise exception 'GATE(d): a hostile why was not character-filtered (-> %) — the key ends up in a '
                    'terminal an operator reads', public.hr_rejection_why('{"why":"Vault''; DROP TABLE x --"}'::jsonb);
  end if;
  if length(public.hr_rejection_why(jsonb_build_object('why', repeat('a', 400)))) <> 24 then
    raise exception 'GATE(d): a 400-character why was not cut to 24 — it would become part of a map '
                    'key on a table an attacker can write to by being refused';
  end if;

  -- ── (e) THE TWO buff_at_max FUSES, AS THE INSTALLED hr_apply RAISES THEM ──
  -- This is a SHAPE PIN on a body this file does not own, and it is the thing
  -- that makes the `whys` breakdown meaningful rather than decorative: the
  -- segment fuse carries why='segment_budget' and the minimum-gain fuse carries
  -- no why at all, so '(none)' on buff_at_max MEANS the duration cap. If the
  -- buff lane later gives that arm its own why, this raises on re-apply and the
  -- sentence above gets corrected instead of quietly becoming false.
  if to_regprocedure('public.hr_apply(uuid,int,bigint,uuid,jsonb)') is not null then
    v_src := replace(pg_get_functiondef(
               'public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
    if position('buff_at_max' in v_src) > 0 then
      if position('''why'', ''segment_budget''' in v_src) = 0 then
        raise exception 'GATE(e): the installed hr_apply raises buff_at_max but carries no '
                        'why=segment_budget — the whys map cannot separate the segment fuse from the '
                        'duration cap, which is the G2 half of this file. Re-read the buff block.';
      end if;
      v_n := (select count(*) from regexp_matches(v_src, 'hr_reject\(''buff_at_max''', 'g'));
      if v_n <> 2 then
        raise exception 'GATE(e): hr_apply raises buff_at_max from % site(s), not the 2 this file '
                        'measured (segment budget + minimum gain). The (none) bucket no longer means '
                        '"duration cap" and the header must be corrected.', v_n;
      end if;
    end if;
  end if;

  -- ── (f) EXECUTED, on synthetic accounts, in a discarded subtransaction ──
  begin
    insert into auth.users (id) values (v_uid), (v_other) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_uid, 'RvmOne'), (v_other, 'RvmTwo')
      on conflict (id) do update set display_name = excluded.display_name;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, 0, 0, 0, 3), (v_other, 0, 0, 0, 3)
      on conflict (user_id, slot) do update set version = 3;

    -- (f1) THE whys BREAKDOWN. Two fuses of ONE code stay ONE row, both counted,
    --      and the map's values SUM TO n — the property '(none)' exists for.
    perform set_config('hearthrise.rejection_noted', '', true);
    perform public.hr_record_rejection(v_uid, 0, 'apply', 'buff_at_max',
      jsonb_build_object('type', 'gather_speed', 'why', 'segment_budget', 'segments', 8), 1);
    perform public.hr_record_rejection(v_uid, 0, 'apply', 'buff_at_max',
      jsonb_build_object('type', 'gather_speed', 'why', 'segment_budget', 'segments', 8), 1);
    perform public.hr_record_rejection(v_uid, 0, 'apply', 'buff_at_max',
      jsonb_build_object('type', 'gather_speed', 'cap', 3600000, 'gain_ms', 12), 1);
    select count(*) into v_n from public.hr_rejections
     where user_id = v_uid and code = 'buff_at_max';
    if v_n <> 1 then
      raise exception 'GATE(f1): three occurrences of one code produced % rows — the aggregate is not '
                      'folding and this file just rebuilt game_events inside the journal', v_n;
    end if;
    select * into v_row from public.hr_rejections where user_id = v_uid and code = 'buff_at_max';
    if v_row.n <> 3 then
      raise exception 'GATE(f1): the folded row counts % of 3 occurrences', v_row.n; end if;
    if coalesce((v_row.whys ->> 'segment_budget')::bigint, 0) <> 2
       or coalesce((v_row.whys ->> '(none)')::bigint, 0) <> 1 then
      raise exception 'GATE(f1): the whys breakdown reads % — the two buff_at_max fuses are still one '
                      'number, which is the defect this file exists for', v_row.whys;
    end if;
    if (select sum(value::bigint) from jsonb_each_text(v_row.whys)) <> v_row.n then
      raise exception 'GATE(f1): the whys map sums to % but n is % — the breakdown is not exact',
                      (select sum(value::bigint) from jsonb_each_text(v_row.whys)), v_row.n;
    end if;

    -- (f2) THE VERB FALLBACK, through the real recorder. 'apply' is not a verb a
    --      player performs; the code implies the gesture and the SERVER supplies
    --      it, so the label cannot be forged or lost.
    if not (v_row.verbs ? 'buff_apply') or (v_row.verbs ? 'apply') then
      raise exception 'GATE(f2): a buff refusal under the unattributable label "apply" was filed as % '
                      '— vitals --refusals would name the RPC instead of the gesture', v_row.verbs;
    end if;
    --      ...and a REAL label still wins, on the conflict path as well as the
    --      insert path. This is the regression the map could cause.
    perform set_config('hearthrise.rejection_noted', '', true);
    perform public.hr_record_rejection(v_uid, 0, 'eat:roast_carrot', 'buff_at_max',
      jsonb_build_object('why', 'segment_budget'), 1);
    select * into v_row from public.hr_rejections where user_id = v_uid and code = 'buff_at_max';
    if not (v_row.verbs ? 'eat:roast_carrot') then
      raise exception 'GATE(f2): a REAL verb label was overridden by the code map (%) — the map must be '
                      'fallback-only', v_row.verbs;
    end if;

    -- (f3) bad_zone ESCALATES AT 50, AND NOT BEFORE. G1, executed on the
    --      counter rather than read off the array.
    perform set_config('hearthrise.rejection_noted', '', true);
    for v_i in 1 .. 49 loop
      perform set_config('hearthrise.rejection_noted', '', true);
      perform public.hr_record_rejection(v_uid, 0, 'hr_town_of', 'bad_zone',
        jsonb_build_object('zone', 'probe'), 1);
    end loop;
    select * into v_row from public.hr_rejections where user_id = v_uid and code = 'bad_zone';
    if v_row.n <> 49 then
      raise exception 'GATE(f3): 49 refusals counted %', v_row.n; end if;
    if v_row.severity <> 'normal' then
      raise exception 'GATE(f3): bad_zone was promoted at n=49 — it must have the ESCALATING profile, '
                      'not the incident one; a first-occurrence alarm on a typo is an alarm nobody '
                      'reads';
    end if;
    perform set_config('hearthrise.rejection_noted', '', true);
    perform public.hr_record_rejection(v_uid, 0, 'hr_town_of', 'bad_zone',
      jsonb_build_object('zone', 'probe'), 1);
    select * into v_row from public.hr_rejections where user_id = v_uid and code = 'bad_zone';
    if v_row.n <> 50 or v_row.severity <> 'incident' then
      raise exception 'GATE(f3): the 50th bad_zone left n=% severity=% — sustained zone enumeration is '
                      'still invisible to "show me every incident this week"', v_row.n, v_row.severity;
    end if;

    -- (f3b) buff_not_paid ESCALATES AT 50, AND NOT BEFORE (Security
    --       GO-WITH-CHANGES, 2026-09-13). Mirrors (f3) exactly, on the counter
    --       rather than on the array, because the array is the claim and the
    --       counter is the behaviour. The 49 matters more here than it does for
    --       bad_zone: this code is a RELEASE code on an emitter that does not
    --       exist yet, so if the classification had landed in c_incident the
    --       FIRST honest eat of a first-version emitter with a missing debit
    --       would be an incident for every player at once.
    perform set_config('hearthrise.rejection_noted', '', true);
    for v_i in 1 .. 49 loop
      perform set_config('hearthrise.rejection_noted', '', true);
      perform public.hr_record_rejection(v_uid, 0, 'apply', 'buff_not_paid',
        jsonb_build_object('item', 'roast_carrot', 'need', -1), 1);
    end loop;
    select * into v_row from public.hr_rejections where user_id = v_uid and code = 'buff_not_paid';
    if v_row.n <> 49 then
      raise exception 'GATE(f3b): 49 refusals counted %', v_row.n; end if;
    if v_row.severity <> 'normal' then
      raise exception 'GATE(f3b): buff_not_paid was promoted at n=49 — it is a RELEASE code on an '
                      'unwritten emitter, so the incident profile would make a first-version client '
                      'bug an alarm on every honest eat';
    end if;
    --       ...and it still carries the gesture, because 'apply' is hr_apply's
    --       unattributable label and this code is raised nowhere else.
    if not (v_row.verbs ? 'buff_apply') then
      raise exception 'GATE(f3b): the buff_not_paid row names % instead of the gesture', v_row.verbs;
    end if;
    perform set_config('hearthrise.rejection_noted', '', true);
    perform public.hr_record_rejection(v_uid, 0, 'apply', 'buff_not_paid',
      jsonb_build_object('item', 'roast_carrot', 'need', -1), 1);
    select * into v_row from public.hr_rejections where user_id = v_uid and code = 'buff_not_paid';
    if v_row.n <> 50 or v_row.severity <> 'incident' then
      raise exception 'GATE(f3b): the 50th buff_not_paid left n=% severity=% — fifty attempts in one '
                      'day to get a buff without spending the item is the signature the coupling rule '
                      'exists to stop, and it is still invisible to "show me every incident this week"',
                      v_row.n, v_row.severity;
    end if;

    -- (f4) THE whys CAP. However many whys a body invents, the map is bounded and
    --      `n` stays exact — the same property that made the verbs map safe.
    perform set_config('hearthrise.rejection_noted', '', true);
    for v_i in 1 .. 30 loop
      perform set_config('hearthrise.rejection_noted', '', true);
      perform public.hr_record_rejection(v_uid, 0, 'hr_town_of', 'capprobe',
        jsonb_build_object('why', 'w' || v_i::text), 1);
    end loop;
    select * into v_row from public.hr_rejections where user_id = v_uid and code = 'capprobe';
    if (select count(*) from jsonb_object_keys(v_row.whys)) > 13 then
      raise exception 'GATE(f4): the whys map holds % keys — the cap is 12 + (other)',
                      (select count(*) from jsonb_object_keys(v_row.whys));
    end if;
    if (select sum(value::bigint) from jsonb_each_text(v_row.whys)) <> v_row.n then
      raise exception 'GATE(f4): past the cap the map stopped summing to n (% vs %) — overflow must be '
                      'COUNTED under (other), not dropped',
                      (select sum(value::bigint) from jsonb_each_text(v_row.whys)), v_row.n;
    end if;

    -- (f5) AN ACCEPTED CALL STILL WRITES NOTHING, and the decorator still
    --      returns its argument byte-identical. The recorder was restated; the
    --      seam's contract is what every refusing RPC in the database depends on.
    select count(*) into v_n from public.hr_rejections where user_id = v_uid;
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    perform set_config('hearthrise.rejection_noted', '', true);
    if public.hr_note_rejection('hr_town_of', 0, '{"ok":true,"slot":0}'::jsonb)
       <> '{"ok":true,"slot":0}'::jsonb then
      raise exception 'GATE(f5): the decorator altered an ACCEPTED envelope'; end if;
    if (select count(*) from public.hr_rejections where user_id = v_uid) <> v_n then
      raise exception 'GATE(f5): an ACCEPTED call journalled a row';
    end if;
    perform set_config('hearthrise.rejection_noted', '', true);
    if public.hr_note_rejection('hr_town_of', 0, '{"ok":false,"error":"rate_limited"}'::jsonb)
       <> '{"ok":false,"error":"rate_limited"}'::jsonb then
      raise exception 'GATE(f5): the decorator altered a refusal envelope'; end if;
    if (select count(*) from public.hr_rejections where user_id = v_uid) <> v_n then
      raise exception 'GATE(f5): the seam journalled rate_limited — hr_rpc_gate owns and SAMPLES that '
                      'code, and a retry storm would become a durable upsert per call (R1)';
    end if;

    -- (f6) forbidden_field IS JOURNALLED WITH ITS VERB — the brief's third
    --      claim, which measurement contradicted. Proven by CALLING the verb a
    --      player calls, not by reading the wrapper: the seam on
    --      hr_put_client_state exists because §6 of the rejections journal
    --      discovers wrappers by SHAPE, and this is the executed probe that was
    --      missing. If a future migration restates that wrapper without the
    --      seam, THIS raises on re-apply as well as P6 going red.
    if to_regprocedure('public.hr_put_client_state(integer,jsonb,uuid)') is not null then
      delete from public.hr_rate_counters where user_id = v_uid;
      delete from public.hr_rejections where user_id = v_uid;
      v_res := public.hr_put_client_state(0, '{"gold":999999}'::jsonb, gen_random_uuid());
      if coalesce(v_res->>'error', '') <> 'forbidden_field' then
        raise exception 'GATE(f6): a PUT naming an AUTHORITY key was answered % — the deny-list is the '
                        'control, not the journal', v_res;
      end if;
      select * into v_row from public.hr_rejections
       where user_id = v_uid and code = 'forbidden_field';
      if not found then
        raise exception 'GATE(f6): a whole-PUT refusal journalled NOTHING — the residue write path '
                        'refuses silently on both ends';
      end if;
      if not (v_row.verbs ? 'hr_put_client_state') then
        raise exception 'GATE(f6): the forbidden_field row names no verb (%)', v_row.verbs; end if;
      if v_row.whys ->> '(none)' is null then
        raise exception 'GATE(f6): the forbidden_field row has no whys entry (%) — every row must have '
                        'one, or the map stops summing to n', v_row.whys;
      end if;
      -- the honest PUT still saves: a deny-list's most dangerous failure mode
      delete from public.hr_rate_counters where user_id = v_uid;
      v_res := public.hr_put_client_state(0, '{"lootFilter":{"a":1}}'::jsonb, gen_random_uuid());
      if coalesce(v_res->>'ok', '') <> 'true' then
        raise exception 'GATE(f6): an HONEST residue PUT was refused % — this file must not have '
                        'touched that path at all', v_res;
      end if;
    end if;

    -- (f7) ANOTHER PLAYER IS UNTOUCHED. The recorder takes a user argument, so
    --      "it only ever writes the caller's row" is a property of its CALLERS —
    --      but a restatement that cross-wrote would be catastrophic and silent.
    if exists (select 1 from public.hr_rejections where user_id = v_other) then
      raise exception 'GATE(f7): one account''s refusals were filed against another';
    end if;

    raise exception using errcode = 'HR813',
      message = 'rejections-verb-map-2 §5 complete — rolling back the probes';
  exception when sqlstate 'HR813' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  -- NET-ZERO, on every table the probes could have touched.
  if exists (select 1 from public.hr_rejections where user_id in (v_uid, v_other))
     or exists (select 1 from public.player_state where user_id in (v_uid, v_other))
     or exists (select 1 from public.profiles where id in (v_uid, v_other))
     or exists (select 1 from public.hr_rate_counters where user_id in (v_uid, v_other))
     or exists (select 1 from public.player_intents where user_id in (v_uid, v_other))
     or exists (select 1 from auth.users where id in (v_uid, v_other)) then
    raise exception 'GATE: §5 LEAKED a probe row';
  end if;

  raise notice 'rejections-verb-map-2: hr_record_rejection is RESTATED (patch chain 1 -> 0) with both '
               'severity catalogues proven a strict superset of the installed ones, bad_zone added to '
               'c_escalating and absent from c_incident, the code->verb fallback proven fallback-only '
               'with a single-emitter domain, the why token bounded at 24 filtered characters, the '
               'two buff_at_max fuses pinned at the source shape, and EXECUTED: three occurrences of '
               'one code stay ONE row whose whys map reads segment_budget=2 / (none)=1 and sums to n, '
               'a buff refusal labelled "apply" files under buff_apply while a real label wins, the '
               '50th bad_zone flips to incident and the 49th does not, the 50th buff_not_paid does the '
               'same while still naming buff_apply, a 30-why storm stays under the '
               'cap and still sums to n, an accepted call journals nothing and rate_limited is never '
               'journalled, a forbidden_field PUT lands one row naming hr_put_client_state while an '
               'honest residue PUT still saves, no other account was touched and no probe row '
               'survived — all green';
end $$;
