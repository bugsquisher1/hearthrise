-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-23-client-state-retired-fields.sql — A RETIRED KEY IS NOT AN
-- AUTHORITY KEY, AND THE RESIDUE WRITER MUST STOP PUNISHING THE WHOLE PATCH
-- FOR ONE OF THEM.
--
-- ⚠ STAGED, NOT APPLIED. Security review REQUIRED: this file restates the body
--   that decides what a player may store about themselves, and it is the
--   highest-traffic client write in the database.
--
-- ── THE CLASS, MEASURED ─────────────────────────────────────────────────────
-- hr_put_client_state__ungated refuses the ENTIRE residue patch with
-- {ok:false, error:'forbidden_field', field:'buffs'} when a patch names a denied
-- key. That is right for `gold`. It is WRONG for `buffs`, and the difference has
-- cost one real player nine days of saves:
--
--   · 2026-09-13 20:48 UTC   2026-09-13-client-state-buffs-denylist.sql applied.
--   · 2026-09-14 15:08 UTC   user b94fa8c0 slot 0, code=forbidden_field, n=603,
--                            every occurrence last_detail {} / whys {(none)}.
--   · 2026-09-16              569 forbidden_field/`buffs` refusals in a day
--                            (vitals --refusals, after the field seam landed).
--   · 2026-09-22 (today)      927–955 refusals/day on that one hidden tab,
--                            ~99% of the refused count vitals reports. Any real
--                            burst — an equip conflict, a rate-limit storm — is
--                            invisible underneath it.
--
-- One tab, on a pre-b544 bundle, still sends `buffs` in its residue patch. The
-- server answers forbidden_field, the client drops the whole patch, and that
-- account's lootFilter, achievements, bestiary and the rest have not been saved
-- since. The tab is hidden, so nobody reloads it. Nothing about that is the
-- security control working: `buffs` is not forged gold crossing into someone
-- else's economy, it is a name we RETIRED while the player's browser was still
-- holding the old bundle.
--
-- ── THE DISTINCTION THIS FILE INSTALLS ──────────────────────────────────────
-- An AUTHORITY key (gold, gems, skills, inventory, bank, equipment, rooms,
-- marks, rested*, farmPlots, farm, companions, offlineBudget, hearth_tokens) has
-- NEVER been storable here. A client naming one is forging or badly broken, and
-- the loud whole-patch refusal surfaces both. UNCHANGED, to the byte.
--
-- A RETIRED key (`buffs`, plus the nine names of the 2026-09-14 projection
-- purge) was a LEGITIMATE residue field in a bundle that is still running in
-- somebody's tab. The server now owns the fact, so the copy must not be stored —
-- but refusing the patch it travelled in punishes the honest keys beside it, for
-- a client whose only sin is not having reloaded. So: STRIP the key, JOURNAL it
-- (hr_record_rejection, code 'retired_field', severity normal, one `why` per
-- name so the breakdown says which build the tab is running), MERGE the honest
-- remainder, and answer {ok:true, slot, bytes, stripped:[…]}.
--
-- The security property is unchanged and is the one that matters: THE FORGEABLE
-- SHADOW COPY STILL NEVER LANDS IN client_state. It is refused entry by name,
-- exactly as before; only the blast radius of that refusal changes.
--
-- ── THIS FILE SUPERSEDES 2026-09-14-client-state-projection-denylist.sql ─────
-- That file is DELETED by this commit — removed from supabase/migrations/ and
-- from tests/schema-apply-order.json — and it must never apply as written. It
-- would add the nine projection names to the AUTHORITY list, and its own header
-- says what that does: "any client that still SENDS one of these names loses
-- every residue save … until it reloads", with a timing condition of ≥24 h after
-- the client half is live. That condition was written for a fleet that reloads.
-- The measurement above is the proof it does not: nine days after the b547
-- client shipped, a tab is still sending `buffs`. Applying the projection file
-- as-is would reproduce today's outage on every unreloaded tab, nine names at a
-- time, on the day it applies. Its nine names live on, in this file's RETIRED
-- list, where they strip instead of refusing. Nothing it protected is lost: a
-- patch naming one of the nine still cannot store it.
--
-- ── RESTATED, NOT PATCHED — AND WHY THAT IS THE SAFE DIRECTION HERE ──────────
-- Every earlier deny-list change anchored a `replace()` onto the installed text
-- because "the live body is not readable from an agent's seat", and a
-- restatement would install the repo's idea of the function over production's.
-- That reasoning was right for adding one string to an array. It does not
-- survive this change: the control flow itself moves, and there is no anchor for
-- "split one loop into two". Chain depth on this body is 3 and the
-- RESTATEMENT-DEBT-ACK that 2026-09-14 shipped under names the paydown as
-- exactly this lane.
--
-- The objection is answered by MEASUREMENT plus a PIN, not by assertion:
--   · tests/live-hash-drift.baseline.json (measured live 2026-09-22) records
--     this body as live 9674ca3a…4131 / norm 3947 with mojibake:true, replay
--     2a9514c4…b75c / norm 4353, agree:false — and its `why` states that the
--     whole divergence IS the staged projection file (production matched the
--     replay to the code when the 2026-09-13 file applied at 20:47).
--   · With that file removed from the chain, the repo now rebuilds this body to
--     norm 48de8fb3bb5155176f0e43de927de5c9 / 3795, CODE
--     8a017097316005e76b8af6227b090827 / 2375 chars. The 3947-vs-3795 delta is
--     the recorded mojibake — comment bytes, not code.
--   · So §0 PINS THE PREDECESSOR OVER CODE (comments stripped) and REFUSES to
--     install over a body it cannot name. The claim "live == replay, code" is
--     not taken on trust here: §0 is the measurement, taken on production at
--     apply time, and a mismatch aborts the migration with the two hashes in the
--     message. If it raises, do NOT edit the constant — diff production against
--     the chain and re-derive.
--
-- ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
-- No value moves. No player row is written outside §4's rolled-back probe. No
-- table, column, policy, grant, index or edge half. No ?v= bump; the CLIENT IS
-- UNCHANGED and needs nothing from this file — src/net/client-state.js already
-- handles a forbidden_field refusal (drop the key, tell the player, reload once)
-- and an ok:true put ignores an unknown extra key, so an old tab and a new tab
-- both behave correctly the moment this applies.
-- Stale retired keys already sitting in players' bags are LEFT ALONE and are
-- INERT: hydrateInto writes only RESIDUE_FIELDS, which lists none of them, so
-- they are dead bytes rather than state. Deleting them would be a write to live
-- player rows to tidy keys nothing reads — CLAUDE.md §2.
-- `unlockedRecipes` is deliberately NEITHER denied NOR retired: hr_state_of
-- projects unlocked_recipes as of 2026-09-14-recipe-learn.sql, but the client
-- half that sends hr_recipe_learn is not built, so this bag is still the only
-- record that a scroll was read. §4(e) asserts it still saves. It joins the
-- RETIRED list in the lane that wires the intent.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply 2026-09-13-client-state-buffs-denylist.sql: it restates nothing, but
-- its §1 patch is re-entrant and its §0 anchor no longer matches this body, so it
-- refuses LOUDLY rather than half-reverting — which is the correct behaviour and
-- is asserted nowhere but stated here. The real reversal is the chain replayed
-- WITHOUT this file, which rebuilds 8a017097 exactly; the Coordinator's rollback
-- script is that text.
--
-- ⚠ hr_put_client_state__ungated is a LIVE-HASH-TRACKED body and this file now
--   OWNS every line of it. Registering it makes the replay DELIBERATELY divergent
--   from production until the apply; afterwards the Coordinator re-seeds
--   tests/live-hash-drift.baseline.json with `--live --write` and writes the why
--   from `--codediff`. Agents do not edit that baseline (CLAUDE.md §2). The
--   baseline's touched_by for this body still names the DELETED projection file;
--   removing that name is part of the same re-seed and is the Coordinator's.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS, AND THE PREDECESSOR PIN — FAIL CLOSED ─────────────────
-- A restatement applied over a body it cannot name would DISCARD whatever made
-- them differ, in silence. That is the one failure mode unique to this shape, so
-- it is the first thing here and it is arithmetic rather than prose.
do $mig$
declare
  v_def  text;
  v_code text;
  v_miss text;
  c_sig  constant text := 'public.hr_put_client_state__ungated(int,jsonb,uuid)';
  -- The body the repo chain rebuilds WITHOUT this file, code-only (comments and
  -- whitespace collapsed). See the header for why the live comment bytes differ
  -- and why the pin is therefore over CODE.
  c_prev constant text := '8a017097316005e76b8af6227b090827';
  -- The body §1 installs. The two differ — unlike the hr_state_of restatement,
  -- this file CHANGES code — so the re-apply case cannot be folded into the
  -- predecessor case and gets its own branch. What it buys, stated exactly: §1
  -- is a plain create-or-replace and DOES run again (re-installing the identical
  -- text, which [14]/R10 measure as byte-identical), but §0 stops treating a
  -- re-apply as an unrecognised body, and §3/§4 stand down rather than re-running
  -- a self-check against a database that has moved on since.
  c_new  constant text := 'fc32832287bfa6a73df4c37330c05cb8';
  -- Every authority the RETIRED names are stripped in favour of. If one is
  -- missing the server does not hold the fact yet and stripping the client's
  -- copy would DELETE it rather than secure it. Carried forward verbatim from
  -- the superseded 2026-09-14 file, which is where this list was derived.
  c_cols constant text[] := array['buffs','streak_days','auto_eat_pct','auto_eat_food',
                                  'combat_style','tool_carry','renown_high'];
begin
  if to_regprocedure(c_sig) is null then
    raise exception 'client-state retired-fields §0: hr_put_client_state__ungated does not exist — '
                    'this file RESTATES a body, it does not create one. Apply the chain first '
                    '(tests/schema-apply-order.json).';
  end if;

  v_def  := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');
  -- `--` never occurs inside a string literal in this body (verified over the
  -- chain-end text this file was cut from), so a line-comment strip is exact.
  v_code := btrim(regexp_replace(
              regexp_replace(v_def, '--[^' || chr(10) || ']*', '', 'g'),
              '[[:space:]]+', ' ', 'g'));

  if md5(v_code) = c_new then
    raise notice 'client-state retired-fields: this body is already installed (code %) — nothing to do',
                 c_new;
    perform set_config('hearthrise.retired_fields_go', 'skip', false);
    return;
  end if;
  if md5(v_code) <> c_prev then
    raise exception 'client-state retired-fields §0: the installed hr_put_client_state__ungated is '
                    'NEITHER the body this file was cut from (code %) NOR the body it installs (code '
                    '%) — it is % at % code chars. Something else has patched it. A restatement over '
                    'a body it cannot name would DISCARD the difference IN SILENCE. Re-derive from '
                    'the chain (tests/schema-replay.mjs + pg_get_functiondef) and review the diff; do '
                    'NOT edit these constants.', c_prev, c_new, md5(v_code), length(v_code);
  end if;

  -- The deny-list must already be there, and it must be the AUTHORITY list this
  -- file preserves. A restatement that installed an authority list over a body
  -- which never had one would read as a hardening while removing nothing.
  if strpos(v_code, 'forbidden_field') = 0 or strpos(v_code, 'v_deny') = 0 then
    raise exception 'client-state retired-fields §0: the predecessor carries no deny-list — apply '
                    '2026-08-22-client-state-denylist.sql first';
  end if;

  -- The SERVER must hold every fact whose client copy this file strips.
  select string_agg(c, ', ') into v_miss
    from unnest(c_cols) c
   where not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'player_state'
                        and column_name = c);
  if v_miss is not null then
    raise exception 'client-state retired-fields §0: player_state is missing % — the client copy is '
                    'still the only one, so stripping it would delete a fact rather than retire a '
                    'duplicate. Apply the projection migrations first.', v_miss;
  end if;
  -- The two ENTITLEMENT readers, which live in functions rather than columns.
  if to_regprocedure('public.hr_hero_slots_of(uuid)') is null then
    raise exception 'client-state retired-fields §0: hr_hero_slots_of is missing — apply '
                    '2026-09-08-hero-slot-buy.sql first, or stripping heroSlotsUnlocked removes the '
                    'only record of a paid slot';
  end if;
  if to_regprocedure('public.hr_gem_unlocks_of(uuid,int)') is null then
    raise exception 'client-state retired-fields §0: hr_gem_unlocks_of is missing — apply '
                    '2026-09-14-gem-unlock-buy.sql first, or stripping ownedThemes/ownedCosmetics '
                    'removes the only record of a gem purchase';
  end if;

  -- THE JOURNAL SEAM. A strip that is not recorded is a save that silently did
  -- not happen — the exact property this file exists to stop being invisible.
  -- Asserted by EXISTENCE and exercised by §4, never by reading the recorder's
  -- SOURCE: a pg_get_functiondef on hr_record_rejection would make this file its
  -- LAST TOUCHER in the live-hash derivation, and tests/apply-order-honesty.mjs
  -- reads a staged file that merely pins an unchanged body as already applied
  -- (2026-09-14-rejection-field-detail.sql §0 learned this the hard way).
  if to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null
     or to_regprocedure('public.hr_rejection_why(jsonb)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'hr_rejections'
                       and column_name = 'whys') then
    raise exception 'client-state retired-fields §0: hr_record_rejection / hr_rejection_why / '
                    'hr_rejections.whys are absent — apply 2026-09-12-hr-rejections-journal.sql and '
                    '2026-09-13-rejections-verb-map-2.sql first, or every strip is unobservable';
  end if;

  -- SESSION-level, not transaction-local (`false`, not `true`): whether the
  -- management endpoint wraps this file in ONE transaction is not this file's to
  -- assume, and a `true` here would be lost between blocks on the split path,
  -- silently turning §3 and §4 into notices. Nothing outside this file reads the
  -- name.
  perform set_config('hearthrise.retired_fields_go', 'go', false);
end $mig$;

-- ── 1. THE RESTATEMENT ──────────────────────────────────────────────────────
-- The predecessor's text, carried forward. THE WHOLE CODE DELTA, enumerated so a
-- reviewer can check the list rather than read 90 lines twice:
--   · one new constant array   v_retired
--   · two new locals           v_patch (the honest remainder), v_strip (the names)
--   · one new loop             the strip, after the deny loop and before the lock
--   · one new loop             the journal, after the update
--   · `v_patch` in place of `p_patch` at the merge
--   · `stripped` added to the answer, ONLY when v_strip is non-empty
-- Nothing else moves: not the cap, not the advisory lock, not the idempotency
-- claim, not the deny loop, not a single authority name. Two COMMENTS were
-- extended (the deny-list header now says why it refuses WHOLE, and the merge
-- says why a stale key in the stored bag is left alone); comments are not code
-- and §3's pin is over the comment-stripped text, which is the half that matters.
create or replace function public.hr_put_client_state__ungated(
  p_slot int, p_patch jsonb, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_slot  int  := coalesce(p_slot, 0);
  v_cur   jsonb;
  v_new   jsonb;
  v_prev  jsonb;
  v_cap   constant int := 262144;   -- 256 KiB
  -- ── THE AUTHORITY DENY-LIST (2026-08-22, unchanged) ──────────────────────
  -- Every server-owned field, in BOTH its client (camelCase) and server
  -- (snake_case) spellings, because a patch key is whatever the client sends.
  -- client_state is a SELF-ONLY residue store; none of these may live in it.
  -- A client naming one is forging or badly broken, so the WHOLE patch is
  -- refused: a loud refusal surfaces both, and no honest client sends these.
  v_deny  constant text[] := array[
    'gold','gems','hearth_tokens','hearthTokens',
    'skills','inventory','bank','equipment','rooms',
    'marks','restedXp','rested_xp','restedAt','rested_at',
    'farmPlots','farm','companions','offlineBudget'
  ];
  -- ── THE RETIRED LIST (2026-09-23) ────────────────────────────────────────
  -- Names that WERE legitimate residue in a bundle that is still running in
  -- somebody's tab, and whose fact the SERVER now owns. The copy must not be
  -- stored — but the patch it travels in is honest, so it is STRIPPED and
  -- JOURNALLED rather than refused. A retired key is not an authority key; the
  -- difference is nine days of one player's lost saves.
  --   buffs             -> player_state.buffs      (2026-09-13-consumable-buffs)
  --   streak            -> state.streak_days
  --   autoEatPct        -> state.auto_eat_pct
  --   foodSlot          -> state.auto_eat_food
  --   combatStyle       -> state.combat_style
  --   toolCarry         -> state.tool_carry
  --   renownHigh        -> renown_high
  --   heroSlotsUnlocked -> hr_hero_slots_of
  --   ownedThemes       -> hr_gem_unlocks_of
  --   ownedCosmetics    -> hr_gem_unlocks_of
  -- ⚠ A NAME MOVES TO v_deny ONLY WHEN NO LIVE BUNDLE CAN STILL SEND IT, and
  --   that is a measurement (tools/vitals.mjs --refusals, per user and slot),
  --   never a date.
  v_retired constant text[] := array[
    'buffs',
    'streak','autoEatPct','foodSlot','combatStyle','toolCarry','renownHigh',
    'heroSlotsUnlocked','ownedThemes','ownedCosmetics'
  ];
  v_key   text;
  v_patch jsonb;
  v_strip text[] := array[]::text[];
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_idem is null then return jsonb_build_object('ok', false, 'error', 'missing_idem'); end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_patch'); end if;
  if octet_length(p_patch::text) > v_cap then
    return jsonb_build_object('ok', false, 'error', 'patch_too_large', 'cap', v_cap); end if;

  -- ── REJECT ANY AUTHORITY KEY ─────────────────────────────────────────────
  -- FIRST, and before anything is stripped: a patch carrying BOTH a forged
  -- authority key and a retired one is a forgery, and it is refused whole with
  -- nothing stored and nothing journalled as merely `retired_field`.
  foreach v_key in array v_deny loop
    if p_patch ? v_key then
      return jsonb_build_object('ok', false, 'error', 'forbidden_field', 'field', v_key);
    end if;
  end loop;

  -- ── STRIP ANY RETIRED KEY ────────────────────────────────────────────────
  -- Pure computation; nothing is written and nothing is journalled yet, because
  -- a put that never reaches the update (no character, oversized, replayed)
  -- must not file a strip that did not happen.
  v_patch := p_patch;
  foreach v_key in array v_retired loop
    if v_patch ? v_key then
      v_patch := v_patch - v_key;
      v_strip := v_strip || v_key;
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY.
  -- player_intents is ONE namespace for every verb in this database, so a key
  -- claimed by another intent (or the same intent on another slot) must be
  -- REFUSED, not answered with that intent's decision. Same comparison hr_apply
  -- has carried since apply-engine §S6; the helper is the one copy of the rule.
  -- A NULL answer means "no cached decision" and the body proceeds as before.
  select public.hr_intent_replay(v_uid, v_slot, p_idem, 'client_state_put') into v_prev;
  if v_prev ->> 'error' = 'intent_mismatch' then return v_prev; end if;
  if v_prev is not null then return v_prev || jsonb_build_object('replayed', true); end if;

  select coalesce(client_state, '{}'::jsonb) into v_cur from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot); end if;

  -- The HONEST REMAINDER is what merges. A patch that was nothing but retired
  -- names merges nothing and still answers ok — the client learns what it sent
  -- from `stripped`, and its other preferences were never at risk.
  -- A retired key already sitting in v_cur is LEFT ALONE: it is inert (hydrateInto
  -- writes only RESIDUE_FIELDS) and evicting it would be a write to a live player
  -- row to tidy a key nothing reads. CLAUDE.md §2.
  v_new := v_cur || v_patch;
  if octet_length(v_new::text) > v_cap then
    return jsonb_build_object('ok', false, 'error', 'state_too_large', 'cap', v_cap); end if;

  update public.player_state set client_state = v_new, updated_at = now()
    where user_id = v_uid and slot = v_slot;

  -- ── JOURNAL THE STRIPS, ONE PER NAME ─────────────────────────────────────
  -- Only now, when the put has actually landed. `retired_field` is on neither
  -- c_incident nor c_escalating, so the row is severity `normal` — this is a
  -- stale bundle, not an attack, and an alert that fires for a tab nobody
  -- reloaded is an alert nobody reads. One row per (user, slot, day, code); the
  -- `why` per name is what turns 900 occurrences into {buffs: 900}, i.e. WHICH
  -- BUILD the tab is running. hr_record_rejection swallows its own failures, so
  -- a journal that cannot write never costs the player their save.
  foreach v_key in array v_strip loop
    perform public.hr_record_rejection(v_uid, v_slot, 'client_state_put', 'retired_field',
      jsonb_build_object('field', v_key, 'why', v_key), 1);
  end loop;

  v_prev := jsonb_build_object('ok', true, 'slot', v_slot, 'bytes', octet_length(v_new::text));
  -- `stripped` is present ONLY when something was stripped, so the envelope of
  -- an ordinary accepted put is unchanged to the byte for every client and every
  -- guard that reads it.
  if array_length(v_strip, 1) is not null then
    v_prev := v_prev || jsonb_build_object('stripped', to_jsonb(v_strip));
  end if;
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, v_slot, 'client_state_put', v_prev, now())
    on conflict (user_id, intent_id) do nothing;
  return v_prev;
end $$;

-- ── 2. THE LOCKDOWN, RE-STATED ──────────────────────────────────────────────
-- create-or-replace preserves an ACL; re-state it anyway (the repo convention
-- and the grant-hygiene lint). __ungated is called only by the SECURITY DEFINER
-- wrapper; no client role may execute it.
revoke execute on function public.hr_put_client_state__ungated(int, jsonb, uuid) from public;
revoke execute on function public.hr_put_client_state__ungated(int, jsonb, uuid)
  from anon, authenticated, service_role;

-- ── 3. THE INSTALLED BODY IS THE BODY THIS FILE NAMES ───────────────────────
-- A restatement's failure mode is SUBTRACTION, and markers cannot see it. The
-- hash is the strong half; the two list assertions below say WHICH list each
-- name landed on, which a hash cannot.
do $mig$
declare
  v_code text; v_key text;
  c_new  constant text := 'fc32832287bfa6a73df4c37330c05cb8';
begin
  -- THREE STATES, NOT TWO. `skip` is §0 recognising the body it installs; `go`
  -- is a real apply; ANYTHING ELSE means §0 never ran or refused, and a silent
  -- skip there would let a failed predecessor pin read as a clean apply.
  if coalesce(current_setting('hearthrise.retired_fields_go', true), '') = 'skip' then
    raise notice 'client-state retired-fields §3: §0 recognised the installed body — skipped';
    return;
  end if;
  if coalesce(current_setting('hearthrise.retired_fields_go', true), '') <> 'go' then
    raise exception 'client-state retired-fields §3: §0 did not run (or refused) — refusing to '
                    'report on a body this file cannot account for';
  end if;
  v_code := btrim(regexp_replace(
              regexp_replace(replace(pg_get_functiondef(
                'public.hr_put_client_state__ungated(int,jsonb,uuid)'::regprocedure), chr(13), ''),
                '--[^' || chr(10) || ']*', '', 'g'),
              '[[:space:]]+', ' ', 'g'));
  if md5(v_code) <> c_new then
    raise exception 'client-state retired-fields §3: the body that installed is not the body this '
                    'file states it installs (code %, expected %). Regenerate the file; do not edit '
                    'the constant.', md5(v_code), c_new;
  end if;
  -- EVERY authority key is still on v_deny. A restatement that quietly moved one
  -- to v_retired would turn a whole-patch refusal into a silent strip on a
  -- server-owned value — the one direction this change must never take.
  foreach v_key in array array['gold','gems','hearth_tokens','hearthTokens','skills','inventory',
                               'bank','equipment','rooms','marks','restedXp','rested_xp','restedAt',
                               'rested_at','farmPlots','farm','companions','offlineBudget'] loop
    if strpos(substring(v_code from 'v_deny constant text\[\] := array\[(.*?)\]'),
              '''' || v_key || '''') = 0 then
      raise exception 'client-state retired-fields §3: authority key % is no longer on v_deny', v_key;
    end if;
  end loop;
  foreach v_key in array array['buffs','streak','autoEatPct','foodSlot','combatStyle','toolCarry',
                               'renownHigh','heroSlotsUnlocked','ownedThemes','ownedCosmetics'] loop
    if strpos(substring(v_code from 'v_retired constant text\[\] := array\[(.*?)\]'),
              '''' || v_key || '''') = 0 then
      raise exception 'client-state retired-fields §3: retired key % is not on v_retired', v_key;
    end if;
  end loop;
end $mig$;

-- ── 4. SELF-CHECK (CLAUDE.md §4) — BY EXECUTION, ON PROBE ROWS ──────────────
-- Properties proven by CALLING the function as a real signed-in player and
-- reading the journal, never by finding words in the source. NET ZERO: every row
-- lives inside a subtransaction discarded by a sentinel raise (HR823), and a
-- four-table leak assertion runs after the rollback. Assertion failures raise
-- HR824, which the sentinel handler deliberately does not catch.
do $mig$
declare
  v_r   jsonb;
  v_bag jsonb;
  v_row public.hr_rejections%rowtype;
  v_n   int;
  v_uid constant uuid := '000000c3-0000-0000-0000-0000000000c3';
begin
  -- THREE STATES, NOT TWO. `skip` is §0 recognising the body it installs; `go`
  -- is a real apply; ANYTHING ELSE means §0 never ran or refused, and a silent
  -- skip there would let a failed predecessor pin read as a clean apply.
  if coalesce(current_setting('hearthrise.retired_fields_go', true), '') = 'skip' then
    raise notice 'client-state retired-fields §4: §0 recognised the installed body — skipped';
    return;
  end if;
  if coalesce(current_setting('hearthrise.retired_fields_go', true), '') <> 'go' then
    raise exception 'client-state retired-fields §4: §0 did not run (or refused) — refusing to '
                    'report on a body this file cannot account for';
  end if;
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version)
      values (v_uid, 0, 0, 0, 10, 10, 1)
      on conflict (user_id, slot) do update set client_state = '{}'::jsonb;

    -- ── (a) A RETIRED KEY IS STRIPPED, NOT REFUSED ───────────────────────
    -- The exact patch the hidden b<=543 tab has been sending since 2026-09-13,
    -- with an honest residue key beside it. Before this file: the whole thing
    -- was refused and lootFilter never saved.
    v_r := public.hr_put_client_state__ungated(0,
      jsonb_build_object(
        'buffs', jsonb_build_array(jsonb_build_object(
          'type', 'damage', 'magnitude', 9999, 'remainingMs', 9000000000)),
        'lootFilter', jsonb_build_array('junk')),
      gen_random_uuid());
    if coalesce(v_r ->> 'ok', 'false') <> 'true' then
      raise exception using errcode = 'HR824', message = format(
        'retired-fields (a): a put carrying the retired `buffs` key was REFUSED (%s) — this file '
        'exists to stop exactly that', v_r); end if;
    if v_r -> 'stripped' is distinct from jsonb_build_array('buffs') then
      raise exception using errcode = 'HR824', message = format(
        'retired-fields (a): the answer does not name what it stripped (stripped = %s, expected '
        '["buffs"]) — a silent strip is how a client never learns to stop sending it',
        coalesce((v_r -> 'stripped')::text, '(absent)')); end if;
    if (v_r ->> 'slot')::int <> 0 or coalesce((v_r ->> 'bytes')::int, 0) <= 0 then
      raise exception using errcode = 'HR824', message = format(
        'retired-fields (a): the accepted envelope lost slot/bytes — %s', v_r); end if;

    -- …AND THE HONEST KEY LANDED WHILE THE FORGED SHADOW COPY DID NOT. This is
    -- the whole change in one assertion, and both halves are load-bearing.
    select client_state into v_bag from public.player_state
      where user_id = v_uid and slot = 0;
    if v_bag -> 'lootFilter' is distinct from jsonb_build_array('junk') then
      raise exception using errcode = 'HR824', message = format(
        'retired-fields (a): the honest key that travelled with `buffs` was NOT stored (bag = %s)',
        v_bag); end if;
    if v_bag ? 'buffs' then
      raise exception using errcode = 'HR824', message = format(
        'retired-fields (a): the forgeable buff queue was STORED (bag = %s) — the security property '
        'of 2026-09-13-client-state-buffs-denylist.sql is GONE, not relaxed', v_bag); end if;

    -- ── (b) THE STRIP IS JOURNALLED, AND IT NAMES THE KEY ────────────────
    -- 927-955 anonymous forbidden_field occurrences a day is what the old shape
    -- produced. A strip that is not attributable to a NAME is the same blindness
    -- with a friendlier status code.
    select * into v_row from public.hr_rejections
      where user_id = v_uid and slot = 0 and code = 'retired_field' and day = current_date;
    if not found then
      raise exception using errcode = 'HR824', message =
        'retired-fields (b): the strip was not journalled at all — a save that silently did not '
        'happen is precisely what this file exists to make visible'; end if;
    if v_row.whys is distinct from jsonb_build_object('buffs', 1) then
      raise exception using errcode = 'HR824', message = format(
        'retired-fields (b): whys = %s, expected {"buffs": 1} — the breakdown is the diagnosis; it '
        'says which build the tab is running', v_row.whys); end if;
    if v_row.n <> 1 then
      raise exception using errcode = 'HR824', message = format(
        'retired-fields (b): n = %s, expected 1', v_row.n); end if;
    -- SEVERITY normal, ASSERTED: a stale bundle is not an incident, and an
    -- incident index full of them is an index nobody queries.
    if v_row.severity <> 'normal' then
      raise exception using errcode = 'HR824', message = format(
        'retired-fields (b): severity = %s, expected normal — a tab that has not reloaded is not an '
        'attack, and hr_rejections_incident_idx must stay answerable', v_row.severity); end if;
    -- The verb is the REAL one the caller supplied, not the unattributable
    -- fallback hr_rejection_verb_for substitutes for forbidden_field.
    if not (v_row.verbs ? 'client_state_put') then
      raise exception using errcode = 'HR824', message = format(
        'retired-fields (b): verbs = %s, expected the client_state_put gesture', v_row.verbs); end if;

    -- ── (c) AN AUTHORITY KEY IS STILL REFUSED, WHOLE ─────────────────────
    -- `gold` is deliberate: on the deny-list since 2026-08-22 and moved by no
    -- later file, so this arm stays honest under every list mutation a guard
    -- plants. Nothing it travelled with may be stored.
    update public.player_state set client_state = '{}'::jsonb
      where user_id = v_uid and slot = 0;
    v_r := public.hr_put_client_state__ungated(0,
      jsonb_build_object('gold', 999, 'lootFilter', jsonb_build_array('junk')),
      gen_random_uuid());
    if coalesce(v_r ->> 'ok', 'true') <> 'false' or v_r ->> 'error' <> 'forbidden_field'
       or v_r ->> 'field' <> 'gold' then
      raise exception using errcode = 'HR824', message = format(
        'retired-fields (c): a put carrying forged gold was NOT refused forbidden_field/gold — got '
        '%s. The authority half of this body is UNCHANGED by design.', v_r); end if;
    if coalesce((select client_state from public.player_state
                  where user_id = v_uid and slot = 0), '{}'::jsonb) <> '{}'::jsonb then
      raise exception using errcode = 'HR824', message =
        'retired-fields (c): the refused patch still wrote client_state'; end if;
    -- …and it filed NO retired_field occurrence. A forgery must not be filed as
    -- a stale bundle: that is the classification this whole file turns on.
    select n into v_n from public.hr_rejections
      where user_id = v_uid and slot = 0 and code = 'retired_field' and day = current_date;
    if coalesce(v_n, 0) <> 1 then
      raise exception using errcode = 'HR824', message = format(
        'retired-fields (c): the forged-gold refusal moved the retired_field counter to %s — a '
        'forgery must never be classified as a retired key', coalesce(v_n, 0)); end if;

    -- ── (d) EVERY RETIRED NAME BITES, ON ITS OWN ─────────────────────────
    -- Looped: a list that only strips the first name is the failure this loop
    -- exists to catch, and it is the shape the array literal invites.
    declare v_key text; begin
      foreach v_key in array array['streak','autoEatPct','foodSlot','combatStyle','toolCarry',
                                   'renownHigh','heroSlotsUnlocked','ownedThemes','ownedCosmetics'] loop
        update public.player_state set client_state = '{}'::jsonb
          where user_id = v_uid and slot = 0;
        v_r := public.hr_put_client_state__ungated(0,
          jsonb_build_object(v_key, 'forged', 'lockedItems',
                             jsonb_build_object('bronze_sword', true)),
          gen_random_uuid());
        if coalesce(v_r ->> 'ok', 'false') <> 'true'
           or v_r -> 'stripped' is distinct from jsonb_build_array(v_key) then
          raise exception using errcode = 'HR824', message = format(
            'retired-fields (d): the retired key %s did not strip cleanly — got %s', v_key, v_r);
        end if;
        select client_state into v_bag from public.player_state
          where user_id = v_uid and slot = 0;
        if v_bag ? v_key or not (v_bag ? 'lockedItems') then
          raise exception using errcode = 'HR824', message = format(
            'retired-fields (d): %s survived the strip, or the honest key beside it did not land '
            '(bag = %s)', v_key, v_bag);
        end if;
      end loop;
    end;

    -- ── (e) AN HONEST PUT IS UNTOUCHED, AND JOURNALS NOTHING NEW ─────────
    -- The failure mode this family is most dangerous for. `lootFilter` and
    -- `lockedItems` are client-only display preferences that gate NOTHING
    -- server-side, so they can never join either list; `unlockedRecipes` is
    -- deliberately still residue (see the header).
    update public.player_state set client_state = '{}'::jsonb
      where user_id = v_uid and slot = 0;
    select n into v_n from public.hr_rejections
      where user_id = v_uid and slot = 0 and code = 'retired_field' and day = current_date;
    v_r := public.hr_put_client_state__ungated(0,
      jsonb_build_object('lootFilter', jsonb_build_array('junk'), 'houseTheme', 'forest',
                         'unlockedRecipes', jsonb_build_object('shrimp_recipe', true)),
      gen_random_uuid());
    if coalesce(v_r ->> 'ok', 'false') <> 'true' or v_r ? 'stripped' then
      raise exception using errcode = 'HR824', message = format(
        'retired-fields (e): an honest residue put was refused or reported a phantom strip (%s) — '
        'and `stripped` must be ABSENT on an ordinary put, so the envelope is unchanged', v_r);
    end if;
    if (select client_state ->> 'houseTheme' from public.player_state
         where user_id = v_uid and slot = 0) is distinct from 'forest' then
      raise exception using errcode = 'HR824', message =
        'retired-fields (e): the honest put answered ok and stored nothing'; end if;
    if (select n from public.hr_rejections where user_id = v_uid and slot = 0
         and code = 'retired_field' and day = current_date) is distinct from v_n then
      raise exception using errcode = 'HR824', message =
        'retired-fields (e): an accepted put with nothing to strip filed a journal row'; end if;

    -- ── (f) THE GRANTS DID NOT MOVE ──────────────────────────────────────
    if not has_function_privilege('authenticated', 'public.hr_put_client_state(int,jsonb,uuid)',
                                  'execute') then
      raise exception using errcode = 'HR824', message =
        'retired-fields (f): authenticated LOST execute on hr_put_client_state — every residue save '
        'in the game would fail'; end if;
    if has_function_privilege('authenticated',
          'public.hr_put_client_state__ungated(int,jsonb,uuid)', 'execute')
       or has_function_privilege('anon',
          'public.hr_put_client_state__ungated(int,jsonb,uuid)', 'execute') then
      raise exception using errcode = 'HR824', message =
        'retired-fields (f): __ungated is client-executable'; end if;

    raise exception using errcode = 'HR823',
      message = 'client-state retired-fields §4 complete — rolling back';
  exception when sqlstate 'HR823' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state    where user_id = v_uid)
     or exists (select 1 from public.player_intents where user_id = v_uid)
     or exists (select 1 from public.hr_rejections  where user_id = v_uid)
     or exists (select 1 from auth.users            where id = v_uid) then
    raise exception 'client-state retired-fields §4 LEAKED a probe row'; end if;

  raise notice 'client-state retired-fields PASSED: a retired key is stripped and journalled by NAME '
               'while the honest remainder saves, the forgeable shadow copy still never lands, an '
               'authority key is still refused WHOLE and is never filed as retired, every retired '
               'name bites on its own, an ordinary put is byte-identical, and no grant moved';
end $mig$;
