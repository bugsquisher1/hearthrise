-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-14-rejection-field-detail.sql — A REFUSAL THAT NAMES NO KEY IS
-- UNDIAGNOSABLE.
--
-- ⚠ STAGED, NOT APPLIED. Security review required (it edits a body on the
--   security-journal path). It moves no player row, changes no price, no payout
--   and no verdict: it adds two OPTIONAL keys to the jsonb DETAIL that
--   hr_note_rejection already hands the recorder, and returns the caller's
--   envelope byte-identical, exactly as it does today.
--
-- ── THE LIVE DEFECT, MEASURED ─────────────────────────────────────────────
-- Read from nezapsylztqbbwuwembx 15:08 UTC 2026-09-14 (read-only):
--
--   user b94fa8c0 | slot 0 | code forbidden_field | intent hr_put_client_state
--   n=603 | first 2026-09-14 00:00:28Z | last 2026-09-14 15:08:29Z
--   last_detail {}   verbs {"hr_put_client_state": 603}
--   (+ a 127-occurrence row from 2026-09-13 20:48:28Z — the minute
--    2026-09-13-client-state-buffs-denylist.sql was applied — and a 2-occurrence
--    row for user 274a7717 ten minutes later.)
--
-- One tab, running a pre-b544 bundle that still sends `buffs` in the residue
-- patch. hr_put_client_state__ungated refuses the WHOLE patch on a denied key,
-- so that account has saved NO residue for 18+ hours — lootFilter, achievements,
-- bestiary, the daily "already shown" markers, the lot — and the journal records
-- 730 occurrences that say only "some key was forbidden". WHICH key is the one
-- fact an operator needs and the only one not written down. It is not
-- recoverable afterwards: the envelope carried `field`, and the recorder threw
-- it away.
--
-- This matters more tomorrow than today. 2026-09-14-client-state-projection-
-- denylist.sql adds NINE more names (streak, autoEatPct, foodSlot, combatStyle,
-- toolCarry, renownHigh, heroSlotsUnlocked, ownedThemes, ownedCosmetics), and
-- its own header says every tab still on the previous build sends all nine. When
-- that file applies, this row shape is what ops will have to work from.
--
-- ── WHY THIS FILE DOES NOT PATCH hr_put_client_state__ungated ─────────────
-- The obvious shape — splice `field` into the deny-list arm of the function that
-- raises it — was considered and REJECTED, and the reason is worth the ink:
--
--   THE REFUSED KEY IS ALREADY IN THE ENVELOPE. __ungated returns
--   {ok:false, error:'forbidden_field', field:'<name>'}, and the gated wrapper
--   hands that envelope straight to hr_note_rejection (the S6 decorator from
--   2026-09-12-hr-rejections-journal.sql). The information is not missing from
--   the call path; it is dropped by the ONE function that builds the detail.
--
-- Fixing it at the seam instead of at the raise site is strictly better on every
-- axis this codebase cares about:
--   · ONE SEAM, P6 (CLAUDE.md §7 / the 2026-09-12 header's S5). hr_note_rejection
--     is the single new writer path; every current AND future refusal envelope
--     that names a `field` is journalled with it, for free. The deny-list arm is
--     not the only one: any body that answers `field` gets the same resolution
--     the day it is written, with nobody remembering to ask.
--   · IT DOES NOT TOUCH A MONEY-ADJACENT, LIVE-HASH-TRACKED AUTHORITY BODY.
--     hr_put_client_state__ungated decides what a player may store about
--     themselves, it is 3 anchored patches deep, and 2026-09-14-client-state-
--     projection-denylist.sql is its staged chain end. A fourth patcher racing a
--     staged one on the same anchor is how a silent no-op is built.
--   · hr_note_rejection IS WHOLLY OWNED by 2026-09-12-hr-rejections-journal.sql
--     and has not been touched since: measured live 2026-09-14, md5(prosrc) =
--     d377f7f8c58236a870b180b5ac544965 / 1996 bytes — byte-identical to the
--     hash that file's own apply note recorded when it landed at 21:33 UTC on
--     2026-09-11. Production runs exactly what the repo chain rebuilds.
--
-- ── WHAT IT ADDS: TWO KEYS, BOTH BOUNDED ──────────────────────────────────
--   'field'  the refused key, non-printables stripped, cut to 120 — in last_detail.
--   'why'    left(coalesce(p_result ->> 'why', p_result ->> 'field'), 120)
--
-- The strip is Security's (2026-09-14): the key name is CLIENT text and
-- last_detail is read in a terminal and pasted into an incident note, so a key
-- carrying \n, \r or an ANSI escape could forge a line of an operator's log.
-- It costs one regexp and it cannot change an honest key, which by construction
-- is a JSON object key an honest client typed into RESIDUE_FIELDS. The `why`
-- half needs no strip: hr_rejection_why already character-filters to
-- [a-z0-9_.:-], which is a strictly smaller set.
--
-- `why` is the load-bearing half and it is not decoration. `last_detail` is
-- LAST-WRITER-WINS on a row that aggregates a whole day: with `field` alone, a
-- 603-occurrence row tells you which key was refused LAST, not which keys were
-- refused. 2026-09-13-rejections-verb-map-2.sql built exactly the reader for
-- this — `whys`, a bounded map maintained by hr_rejection_why(detail->>'why'),
-- surfaced by `tools/vitals.mjs --refusals` — so the row above would instead
-- read whys {"buffs": 603} and, after the projection deny-list applies,
-- {"buffs": 41, "combatstyle": 41, "streak": 41, …}. THE BREAKDOWN IS THE
-- DIAGNOSIS: it says which build the tab is running.
--
-- An explicit server-authored `why` in the envelope WINS over the field, so a
-- body that already classifies its own refusal keeps its classification; today
-- no envelope reaching this seam carries one (the `why` family is raised through
-- hr_reject / hr_record_rejection directly, which this file does not touch), so
-- the coalesce is a forward promise rather than a behaviour change.
--
-- ── THE KEY IS CLIENT TEXT. IT IS BOUNDED TWICE, ON PURPOSE. ──────────────
-- `field` is a key name the CLIENT chose (jsonb_object_keys of the patch it
-- sent), so it is hostile input and it is treated as such:
--   · in the DETAIL it is cut to 120 characters — the same bound R3 put on
--     `raw_error`, and far under hr_detail_bound's 1000-character fold, so a
--     4 KB forged key name cannot turn the whole detail into {"truncated":true}
--     and blind the diagnosis it exists to provide;
--   · in the MAP it passes through hr_rejection_why, which lower-cases,
--     character-filters to [a-z0-9_.:-] and cuts to 24, and hr_verb_bump caps
--     the map at 12 keys + '(other)'. So a client sending ten thousand distinct
--     forged key names adds ZERO rows and at most 13 map keys.
--   · NEITHER is part of the primary key of hr_rejections
--     (user_id, slot, day, code), so no client string can multiply a row. That
--     was R2/R3's whole lesson and it is not reopened here.
--
-- ── WHAT IT TOUCHES, AND WHAT IT ONLY CALLS ───────────────────────────────
-- IT TOUCHES EXACTLY ONE BODY: public.hr_note_rejection. It is the only body
-- this file reads back with pg_get_functiondef, and the only one it installs.
--
-- It CALLS hr_record_rejection, hr_detail_bound, hr_rejection_why and
-- hr_put_client_state, and it deliberately reads the SOURCE of none of them.
-- That is not fastidiousness, it is a measured guard interaction: sweep() in
-- tests/live-hash-drift.mjs treats ANY pg_get_functiondef / prosrc read of a
-- body as a `pin`, which makes the reading file that body's LAST TOUCHER, and
-- tests/apply-order-honesty.mjs then reads "the last toucher's body agrees
-- live == replay" as "this file is applied". A STAGED file that merely READS an
-- unchanged body therefore reports itself LIVE — the exact lie that guard was
-- built to kill. §0's earlier draft did this to hr_record_rejection and turned
-- apply-order-honesty red. Every property that used to be asserted by reading
-- someone else's source is now asserted by CALLING it (§0's bound probe, §2(i)).
--
-- ── PATCHED, NOT RESTATED ─────────────────────────────────────────────────
-- Anchored on `'raw_error', case when v_code = 'malformed_code'`, asserted to
-- appear EXACTLY ONCE in the LIVE body (verified live 2026-09-14: 1), and
-- re-entrant — a second apply is a notice and a return. A restatement would
-- install the repo's idea of the recorder over production's; the two are
-- measurably identical today, which is precisely why there is nothing to gain
-- and a silent revert to lose (the b484–b487 class).
--
-- ⚠ hr_note_rejection IS LIVE-HASH-TRACKED (tests/live-hash-drift.baseline.json,
--   tracked_by: pin, live 6757d53e…2bbe == replay, agree: true). This file
--   patches it PROGRAMMATICALLY, so from the moment it is registered the replay
--   diverges from production DELIBERATELY until it is applied, and the
--   Coordinator re-seeds with `node tests/live-hash-drift.mjs --live --write`
--   after the apply, writing the why from `--codediff`. The agent does not edit
--   that baseline (CLAUDE.md §2).
--
-- ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
-- No new table, no new column, no new row, no grant, no policy, no edge half, no
-- ?v= bump. It does not make hr_rejections client-readable (2026-09-12 declined
-- that and the reasoning stands: handing an attacker a live view of which probes
-- are recorded buys a player nothing). It does not change any refusal the client
-- sees. The CLIENT half of this lane — a tab that stops retrying a forbidden key
-- and reloads itself once — ships in src/net/client-state.js and needs nothing
-- from this file.
--
-- REVERSIBILITY: re-apply 2026-09-12-hr-rejections-journal.sql §4 (it states the
-- whole hr_note_rejection body as of that date) to drop the two keys. Nothing is
-- destroyed either way; existing rows keep whatever detail they were filed with.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $mig$
declare
  v_def text; v_n int;
  c_anchor constant text := $anc$'raw_error', case when v_code = 'malformed_code'$anc$;
begin
  if to_regprocedure('public.hr_note_rejection(text,int,jsonb)') is null then
    raise exception 'hr_note_rejection is absent — apply 2026-09-12-hr-rejections-journal.sql first';
  end if;
  if to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null
  or to_regprocedure('public.hr_detail_bound(jsonb)') is null then
    raise exception 'the recorder or its detail bound is absent — apply '
                    '2026-09-12-hr-rejections-journal.sql first';
  end if;
  -- The `whys` half is the one that survives a day of aggregation. Without it
  -- this file would add a last-writer-wins key and call the problem solved.
  if to_regprocedure('public.hr_rejection_why(jsonb)') is null
  or not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'hr_rejections'
                    and column_name = 'whys') then
    raise exception 'hr_rejection_why / hr_rejections.whys are absent — apply '
                    '2026-09-13-rejections-verb-map-2.sql first, or the refused key is recorded '
                    'only as the LAST one of the day, which is not a diagnosis';
  end if;
  -- The detail must still be BOUNDED, or a forged 4 KB key name would be carried
  -- verbatim into a table the client can drive writes to. Asserted by CALLING
  -- the bound, never by reading a body this file does not touch: a
  -- pg_get_functiondef on hr_record_rejection would make this file its LAST
  -- TOUCHER in the live-hash derivation, and a STAGED file that pins an
  -- unchanged body is read by tests/apply-order-honesty.mjs as already applied.
  -- (The recorder's USE of the bound is proven by execution in §2(i).)
  if length(public.hr_detail_bound(
       jsonb_build_object('x', repeat('z', 5000)))::text) > 200 then
    raise exception 'hr_detail_bound no longer bounds a 5000-character detail — refusing to widen '
                    'what the journal stores from a client-chosen string';
  end if;
  v_def := replace(pg_get_functiondef(
    'public.hr_note_rejection(text,int,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, 'jsonb_strip_nulls') = 0 then
    raise exception 'hr_note_rejection no longer strips nulls — every non-deny-list refusal in the '
                    'database would gain two null keys in its detail';
  end if;
  v_n := (length(v_def) - length(replace(v_def, c_anchor, ''))) / length(c_anchor);
  if v_n <> 1 then
    raise exception 'the raw_error anchor appears % time(s), expected exactly 1 — the live body is '
                    'not the one this file was derived against. Diff it against the repo chain '
                    'before patching a body you cannot account for.', v_n;
  end if;
end $mig$;

-- ── 1. THE PATCH ───────────────────────────────────────────────────────────
do $mig$
declare
  v_def text; v_new text;
  c_anchor constant text := $anc$'raw_error', case when v_code = 'malformed_code'$anc$;
  c_add constant text := $new$'field',     left(regexp_replace(p_result ->> 'field',
                                  '[^[:print:]]', '', 'g'), 120),
        'why',       left(coalesce(p_result ->> 'why', p_result ->> 'field'), 120),
        $new$;
begin
  v_def := replace(pg_get_functiondef(
    'public.hr_note_rejection(text,int,jsonb)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$p_result ->> 'field'$q$) > 0 then
    raise notice 'hr_note_rejection already journals the refused field — patch skipped'; return; end if;
  v_new := replace(v_def, c_anchor, c_add || c_anchor);
  -- Arithmetic, not faith: the ONLY change is one insertion of known length.
  if length(v_new) <> length(v_def) + length(c_add) then
    raise exception 'the patched hr_note_rejection is not the original plus exactly one insertion '
                    '(% -> %) — refusing', length(v_def), length(v_new);
  end if;
  execute v_new;
  raise notice 'hr_note_rejection: the refused key now reaches the journal as detail.field and '
               'aggregates in the whys map';
end $mig$;
-- create-or-replace preserves an ACL; re-state the lockdown anyway (the repo
-- convention and the grant-hygiene lint). The recorder must never be callable by
-- anything that can choose what it records.
revoke execute on function public.hr_note_rejection(text, int, jsonb)
  from public, anon, authenticated, service_role;

-- ── 2. SELF-CHECK (§4) — BY EXECUTION ──────────────────────────────────────
-- Proven by CALLING the decorator and the real gated wrapper as a signed-in
-- player and READING the journal, not by finding the words in the source. Net
-- zero: everything it writes lives inside a subtransaction discarded by a
-- sentinel raise (HR845), and a three-table leak assertion runs after it.
do $mig$
declare
  v_def  text;
  v_r    jsonb;
  v_row  public.hr_rejections%rowtype;
  v_n    int;
  v_uid  constant uuid := '000000f1-0000-0000-0000-0000000000f1';
begin
  v_def := replace(pg_get_functiondef(
    'public.hr_note_rejection(text,int,jsonb)'::regprocedure), chr(13), '');
  -- (a) THE PATCH INSTALLED AND ATE NOTHING. A patch that replaced the detail
  --     object instead of extending it passes a check that only looks for the
  --     new keys, and would silently stop journalling `raw_error` — R3's bound
  --     kept, its evidence lost.
  if strpos(v_def, $q$'field',     left(regexp_replace(p_result ->> 'field',$q$) = 0
  or strpos(v_def, $q$'[^[:print:]]', '', 'g'), 120)$q$) = 0 then
    raise exception 'rejection-field (a): the `field` key did not install'; end if;
  if strpos(v_def, $q$p_result ->> 'why'$q$) = 0 then
    raise exception 'rejection-field (a): the `why` key did not install — the breakdown that '
                    'survives a day of aggregation is the point of this file'; end if;
  if strpos(v_def, $q$'outcome',   p_result ->> 'outcome'$q$) = 0
  or strpos(v_def, $q$'detail',    p_result -> 'detail'$q$) = 0
  or strpos(v_def, $q$'raw_error', case when v_code = 'malformed_code'$q$) = 0
  or strpos(v_def, 'jsonb_strip_nulls') = 0 then
    raise exception 'rejection-field (a): the patch ATE part of the existing detail'; end if;
  -- The three bounds that make a client-chosen key safe to store must all survive.
  if strpos(v_def, $q$v_slot := case when p_slot between 0 and 5$q$) = 0
  or strpos(v_def, $q$v_err ~ '^[a-z0-9_]{1,64}$'$q$) = 0
  or strpos(v_def, $q$p_result ->> 'error' = 'rate_limited'$q$) = 0 then
    raise exception 'rejection-field (a): R1/R2/R3 did not survive the patch'; end if;

  -- (b) GRANTS UNCHANGED.
  if has_function_privilege('anon', 'public.hr_note_rejection(text,int,jsonb)', 'execute')
  or has_function_privilege('authenticated', 'public.hr_note_rejection(text,int,jsonb)', 'execute')
  or has_function_privilege('service_role', 'public.hr_note_rejection(text,int,jsonb)', 'execute') then
    raise exception 'rejection-field (b): the recorder became client-executable'; end if;
  if not has_function_privilege('authenticated',
       'public.hr_put_client_state(int,jsonb,uuid)', 'execute') then
    raise exception 'rejection-field (b): authenticated LOST execute on hr_put_client_state'; end if;

  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    if auth.uid() is distinct from v_uid then
      raise exception using errcode = 'HR846',
        message = 'rejection-field: the synthetic subject did not take, so every probe below would '
               || 'pass by writing nothing and would prove nothing';
    end if;
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version)
      values (v_uid, 0, 0, 0, 10, 10, 1)
      on conflict (user_id, slot) do update set client_state = '{}'::jsonb;

    -- (c) THE DECORATOR IS STILL A PASS-THROUGH. A journal may not change a
    --     verdict — the property the whole 2026-09-12 design rests on.
    perform set_config('hearthrise.rejection_noted', '', true);
    v_r := public.hr_note_rejection('hr_put_client_state', 0,
      '{"ok":false,"error":"forbidden_field","field":"gold"}'::jsonb);
    if v_r is distinct from '{"ok":false,"error":"forbidden_field","field":"gold"}'::jsonb then
      raise exception using errcode = 'HR846',
        message = format('rejection-field (c): the decorator altered the envelope: %s', v_r);
    end if;
    -- …and the refused key reached BOTH halves of the journal.
    select * into v_row from public.hr_rejections
     where user_id = v_uid and code = 'forbidden_field';
    if v_row.code is null then
      raise exception using errcode = 'HR846',
        message = 'rejection-field (c): a forbidden_field refusal was not journalled at all'; end if;
    if v_row.last_detail ->> 'field' is distinct from 'gold' then
      raise exception using errcode = 'HR846',
        message = format('rejection-field (c): last_detail is %s — the refused key is STILL the one '
                         'fact the journal does not keep', v_row.last_detail);
    end if;
    if coalesce((v_row.whys ->> 'gold')::bigint, 0) <> 1 then
      raise exception using errcode = 'HR846',
        message = format('rejection-field (c): the whys map is %s — the breakdown that survives a '
                         'day of aggregation did not land', v_row.whys);
    end if;

    -- (d) END TO END THROUGH THE REAL GATED WRAPPER, as a signed-in player.
    --     `gold` is deliberate: it has been on the deny-list since
    --     2026-08-22-client-state-denylist.sql and no later file moves it, so
    --     this arm stays honest under every deny-list mutation a guard plants.
    perform set_config('hearthrise.rejection_noted', '', true);
    v_r := public.hr_put_client_state(0, '{"gold":999,"lootFilter":["junk"]}'::jsonb,
                                      gen_random_uuid());
    if coalesce(v_r ->> 'ok', 'true') <> 'false' or v_r ->> 'error' <> 'forbidden_field'
       or v_r ->> 'field' <> 'gold' then
      raise exception using errcode = 'HR846',
        message = format('rejection-field (d): the wrapper did not refuse a forged gold patch: %s', v_r);
    end if;
    select * into v_row from public.hr_rejections
     where user_id = v_uid and code = 'forbidden_field';
    if v_row.intent <> 'hr_put_client_state'
       or v_row.last_detail ->> 'field' is distinct from 'gold'
       or coalesce((v_row.whys ->> 'gold')::bigint, 0) < 2 then
      raise exception using errcode = 'HR846',
        message = format('rejection-field (d): the LIVE path filed intent=%s detail=%s whys=%s — the '
                         'refusal a real stale tab produces is still anonymous',
                         v_row.intent, v_row.last_detail, v_row.whys);
    end if;
    -- The refused patch stored NOTHING, including the honest key beside it —
    -- the property that makes this a data-loss incident and not a nuisance.
    if coalesce((select client_state from public.player_state
                  where user_id = v_uid and slot = 0), '{}'::jsonb) <> '{}'::jsonb then
      raise exception using errcode = 'HR846',
        message = 'rejection-field (d): the refused patch still wrote client_state';
    end if;

    -- (e) AN ACCEPTED PUT IS UNTOUCHED AND WRITES NO ROW. An observability
    --     change that started journalling successes would be a write amplifier
    --     on the busiest RPC in the game.
    select count(*) into v_n from public.hr_rejections where user_id = v_uid;
    perform set_config('hearthrise.rejection_noted', '', true);
    v_r := public.hr_put_client_state(0, '{"lootFilter":["junk"]}'::jsonb, gen_random_uuid());
    if coalesce(v_r ->> 'ok', 'false') <> 'true' then
      raise exception using errcode = 'HR846',
        message = format('rejection-field (e): an HONEST residue put was refused: %s', v_r); end if;
    if (select count(*) from public.hr_rejections where user_id = v_uid) <> v_n then
      raise exception using errcode = 'HR846',
        message = 'rejection-field (e): an ACCEPTED put was journalled'; end if;

    -- (f) A REFUSAL THAT NAMES NO FIELD IS SHAPED EXACTLY AS IT WAS. Every
    --     other verb in the database goes through this seam; jsonb_strip_nulls
    --     must still drop both new keys rather than file two nulls.
    perform set_config('hearthrise.rejection_noted', '', true);
    perform public.hr_note_rejection('farm_water', 0,
      '{"ok":false,"error":"still_watered"}'::jsonb);
    select * into v_row from public.hr_rejections where user_id = v_uid and code = 'still_watered';
    if v_row.last_detail <> '{}'::jsonb then
      raise exception using errcode = 'HR846',
        message = format('rejection-field (f): a fieldless refusal gained keys: %s', v_row.last_detail);
    end if;
    if coalesce((v_row.whys ->> '(none)')::bigint, 0) <> 1 then
      raise exception using errcode = 'HR846',
        message = format('rejection-field (f): a fieldless refusal no longer folds to (none): %s',
                         v_row.whys);
    end if;

    -- (g) THE KEY IS CLIENT TEXT AND IT IS BOUNDED IN BOTH HALVES. A forged
    --     4 KB key name must not truncate the whole detail (hr_detail_bound's
    --     1000-character fold) and must not become a 4 KB map key.
    perform set_config('hearthrise.rejection_noted', '', true);
    perform public.hr_note_rejection('hr_put_client_state', 0,
      jsonb_build_object('ok', false, 'error', 'forbidden_field',
                         'field', repeat('Z', 4000) || $h$'; DROP TABLE x --$h$));
    select * into v_row from public.hr_rejections
     where user_id = v_uid and code = 'forbidden_field';
    if v_row.last_detail ->> 'truncated' is not null then
      raise exception using errcode = 'HR846',
        message = 'rejection-field (g): a forged key name folded the WHOLE detail to truncated — a '
               || 'client can blind the diagnosis this file exists to provide';
    end if;
    if length(v_row.last_detail ->> 'field') <> 120 then
      raise exception using errcode = 'HR846',
        message = format('rejection-field (g): a 4000-character key was stored as %s characters, '
                         'expected 120', length(v_row.last_detail ->> 'field'));
    end if;
    if exists (select 1 from jsonb_object_keys(v_row.whys) k
                where length(k) > 24 or k !~ '^[a-z0-9_.:()-]+$') then
      raise exception using errcode = 'HR846',
        message = format('rejection-field (g): the whys map grew an unbounded or unsanitised key: %s',
                         (select string_agg(left(k, 40), ', ') from jsonb_object_keys(v_row.whys) k));
    end if;
    -- …and no client string multiplied a row: still ONE forbidden_field row.
    if (select count(*) from public.hr_rejections
         where user_id = v_uid and code = 'forbidden_field') <> 1 then
      raise exception using errcode = 'HR846',
        message = 'rejection-field (g): a client-chosen key name became part of the primary key';
    end if;
    if (select sum(value::bigint) from jsonb_each_text(v_row.whys)) <> v_row.n then
      raise exception using errcode = 'HR846',
        message = format('rejection-field (g): the whys map sums to %s but n is %s — the breakdown '
                         'is not exact',
                         (select sum(value::bigint) from jsonb_each_text(v_row.whys)), v_row.n);
    end if;

    -- (g2) THE STORED KEY IS PRINTABLE. last_detail is read in a terminal and
    --      pasted into an incident note; a key carrying a newline or an ANSI
    --      escape could forge a line of an operator's log. An honest key is
    --      unchanged by the strip — asserted here so the regexp cannot quietly
    --      start eating real names.
    perform set_config('hearthrise.rejection_noted', '', true);
    perform public.hr_note_rejection('hr_put_client_state', 0,
      jsonb_build_object('ok', false, 'error', 'forbidden_field',
                         'field', e'go\x1b[2Kld\nFAKE LOG LINE\t'));
    select * into v_row from public.hr_rejections
     where user_id = v_uid and code = 'forbidden_field';
    if v_row.last_detail ->> 'field' <> 'go[2KldFAKE LOG LINE' then
      raise exception using errcode = 'HR846',
        message = format('rejection-field (g2): a control-character key was stored as %L — the '
                         'journal can be used to write a line of an operator''s log',
                         v_row.last_detail ->> 'field');
    end if;
    perform set_config('hearthrise.rejection_noted', '', true);
    perform public.hr_note_rejection('hr_put_client_state', 0,
      '{"ok":false,"error":"forbidden_field","field":"autoEatPct"}'::jsonb);
    select * into v_row from public.hr_rejections
     where user_id = v_uid and code = 'forbidden_field';
    if v_row.last_detail ->> 'field' <> 'autoEatPct' then
      raise exception using errcode = 'HR846',
        message = format('rejection-field (g2): the strip ate an HONEST key name (%L) — every real '
                         'residue name is printable ASCII', v_row.last_detail ->> 'field');
    end if;

    -- (h) AN EXPLICIT SERVER-AUTHORED `why` WINS over the field, so a body that
    --     classifies its own refusal keeps its classification.
    perform set_config('hearthrise.rejection_noted', '', true);
    perform public.hr_note_rejection('hr_probe', 0,
      '{"ok":false,"error":"bad_zone","field":"zoneId","why":"segment_budget"}'::jsonb);
    select * into v_row from public.hr_rejections where user_id = v_uid and code = 'bad_zone';
    if coalesce((v_row.whys ->> 'segment_budget')::bigint, 0) <> 1
       or v_row.last_detail ->> 'field' is distinct from 'zoneId' then
      raise exception using errcode = 'HR846',
        message = format('rejection-field (h): an authored why was overwritten by the field '
                         '(whys=%s detail=%s)', v_row.whys, v_row.last_detail);
    end if;

    -- HR845 is the SENTINEL and nothing else raises it; every assertion above
    -- raises HR846, which this handler does NOT catch, so a failure aborts the
    -- file instead of being swallowed by its own rollback.
    -- (i) THE RECORDER STILL APPLIES THE BOUND — proven by EXECUTION, because
    --     this file deliberately does not read hr_record_rejection's source (see
    --     §0). A detail the recorder passed through unbounded would be a
    --     client-sized string in the journal, whatever the seam above trims.
    perform set_config('hearthrise.rejection_noted', '', true);
    perform public.hr_record_rejection(v_uid, 0, 'probe', 'unbounded_probe',
      jsonb_build_object('x', repeat('z', 5000)), 1);
    select * into v_row from public.hr_rejections where user_id = v_uid and code = 'unbounded_probe';
    if length(v_row.last_detail::text) > 200 then
      raise exception using errcode = 'HR846',
        message = format('rejection-field (i): the recorder stored a %s-character detail — it no '
                         'longer bounds what it is handed', length(v_row.last_detail::text));
    end if;

    raise exception using errcode = 'HR845', message = 'rejection-field §2 complete — rolling back';
  exception when sqlstate 'HR845' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('hearthrise.rejection_noted', '', true);
  if exists (select 1 from public.hr_rejections where user_id = v_uid)
     or exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'rejection-field: §2 LEAKED a probe row'; end if;

  raise notice 'rejection-field PASSED: a forbidden_field refusal now names its key in last_detail '
               'and aggregates it in the whys map, through the real gated wrapper; an accepted put '
               'is untouched and unjournalled; a fieldless refusal keeps its exact shape; a forged '
               '4000-character key is bounded to 120 in the detail and 24 in the map and multiplies '
               'no row; and an authored why still wins';
end $mig$;
