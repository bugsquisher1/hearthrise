// ============================================================================
// tools/derive-equip-release.mjs — BUILD the hr_apply body for
// 2026-08-18-equip-release-codes.sql by EXTRACTING the CURRENT live body out of
// 2026-08-17-fight-carry.sql and patching it at ONE named anchor.
// Nothing is retyped.
//
//   node tools/derive-equip-release.mjs          # print the derived body
//   node tools/derive-equip-release.mjs --write  # (re)write the migration
//   node tools/derive-equip-release.mjs --check  # assert the migration still
//                                                # contains what this derives
//
// WHY THIS EXISTS — the same reason tools/derive-fight-carry.mjs does, and read
// that file's header first. `create or replace` on a 57 KB body you have not
// read silently deletes whichever of b346's ownership flag / b348's tool_carry
// key / the S5 accrued_to stamp / the 12M XP clamp / the daily budget / Phase
// 0's whole fight block the typist did not know about. This script produces
// something that can pass tests/run-sql-tests.mjs PART 1f-ii line by line.
//
// SOURCE — THE CURRENT LAST TOUCHER, and it is fight-carry, not gem-daily-budget:
//   hr_apply <- supabase/migrations/2026-08-17-fight-carry.sql
//
// ── WHAT THIS ONE PATCH CHANGES, AND WHY IT IS A MIGRATION AT ALL ───────────
// `c_release_codes` gains the FIVE catalogue-validated refusals hr_apply's
// equip block can raise. The rule it is being brought into compliance with is
// already written on the array in the fight-carry link, in its own words:
//
//     release a claimed key when the refusal is a function of SERVER STATE THAT
//     CAN CHANGE UNDERNEATH AN UNCHANGED DELTA — the row version, or the
//     catalogue the clamp is re-derived from. [...] If you add a
//     catalogue-validated refusal code to hr_apply, IT GOES HERE TOO.
//
// The equip block validates against FOUR generated catalogues — hr_equip_slots,
// hr_items, hr_item_slots and (for the requirement gate) hr_skills via
// player_skills — and NONE of the codes it raises for them was on the list,
// because until b366 no verb could reach that block through a player gesture.
// b366 adds one. So this is the `unknown_skill` incident's own lesson applied
// BEFORE the incident rather than after it:
//
//   Stonemason shipped to clients minutes before its `hr_skills` row landed,
//   `unknown_skill` fired for two LIVE players, stored itself against their
//   accrue keys, and "Try again" replayed the stored refusal even after the
//   catalogue was fixed. Severity: incident.
//
// The equip shape of that is a ROUTINE OPERATION, not an attack: add an item to
// src/data/items.js and deploy the Edge payload BEFORE re-applying
// 2026-08-11-catalogue.generated.sql, and every equip of that item is
// `unknown_item` — and, with a stored rejection, stays `unknown_item` for that
// key even after the catalogue lands.
//
// ⚠ NOTHING RELEASED HERE EXECUTED ANYTHING. Every one of the five is raised by
//   `hr_reject` inside the protected block, which rolls back whole; a re-run on
//   the same key is a first run. `insufficient_item` is DELIBERATELY NOT on the
//   list — see §"WHAT IS NOT RELEASED" in the migration.
// ============================================================================
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = join(ROOT, 'supabase', 'migrations');

const APPLY_SRC = '2026-08-17-fight-carry.sql';
const TARGET = '2026-08-18-equip-release-codes.sql';

async function fnText(file, open) {
  const sql = (await readFile(join(MIG, file), 'utf8')).replace(/\r\n/g, '\n');
  const i = sql.indexOf(open);
  if (i < 0) throw new Error(`${file}: cannot find ${open}`);
  const j = sql.indexOf('\nend $$;\n', i);
  if (j < 0) throw new Error(`${file}: cannot find the end of ${open}`);
  return sql.slice(i, j + '\nend $$;'.length);
}

/* Every patch must match EXACTLY ONCE — see derive-fight-carry.mjs for the full
   argument. A patch that matches twice edits a line somebody else's fix depends
   on; a patch that matches zero times means the anchor moved and the derivation
   silently produced the OLD body under a new filename. */
function patch(text, anchor, replacement, label) {
  const n = text.split(anchor).length - 1;
  if (n !== 1) throw new Error(`anchor "${label}" matched ${n} times, must match exactly 1`);
  return text.replace(anchor, replacement);
}

export async function deriveApply() {
  let t = await fnText(APPLY_SRC, 'create or replace function public.hr_apply(');

  t = patch(t, `  c_release_codes constant text[] := array[
    'version_conflict',
    'bad_fight', 'bad_fight_hp', 'bad_fight_kills', 'unknown_monster',
    'unknown_skill', 'unknown_item', 'unknown_activity'];`,
  `  --   ⚠ b366 — THE EQUIP BLOCK JOINS THE LIST, AND IT IS THE SAME LESSON A
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
  --   \`requirement_not_met\` is here for the same reason with a different table:
  --   it is derived from player_skills through hr_level_from_xp, and an XP
  --   grant that lands between two attempts changes the answer to an unchanged
  --   delta.
  --   \`bad_equip\` is a SHAPE refusal and is here only because hr_apply raises
  --   it for a delta whose shape depends on nothing but itself — releasing it
  --   is harmless (the block rolled back) and keeping it off the list would
  --   brick a key on a client bug that a redeploy fixes.
  --   ⚠ \`insufficient_item\` IS DELIBERATELY ABSENT. "You do not own one" is a
  --   fact about the PLAYER'S OWN ROW, not about a catalogue, and it is the
  --   ownership check that makes equipping a conserving transfer. Releasing it
  --   would hand a client an unlimited number of free re-attempts on one key
  --   against a moving inventory — which is the retry loop a dupe wants.
  c_release_codes constant text[] := array[
    'version_conflict',
    'bad_fight', 'bad_fight_hp', 'bad_fight_kills', 'unknown_monster',
    'unknown_skill', 'unknown_item', 'unknown_activity',
    'bad_equip', 'unknown_equip_slot', 'wrong_slot', 'requirement_not_met',
    'too_many_equip_ops'];`, 'c_release_codes gains the equip codes');

  return t;
}

function migration(apply) {
  return `-- ============================================================================
-- 2026-08-18-equip-release-codes.sql — PHASE 2 OF LIVE SETTLEMENT, part 1:
-- hr_apply's EQUIP refusals join the intent-key release class.
--
-- Spec: docs/design/live-settlement.md §10 PHASE 2.
-- Governing rule: CLAUDE.md "Server authority (locked 2026-08-10)".
--
-- ⚠ GENERATED. The restated hr_apply below is produced by
--   \`node tools/derive-equip-release.mjs --write\` from the CURRENT last toucher
--   (2026-08-17-fight-carry.sql) and patched at ONE named anchor. Do NOT
--   hand-edit it; \`--check\` runs in the suite and will fail. Retyping a 57 KB
--   body is how b346's ownership flag, b348's tool_carry key, the S5
--   accrued_to stamp, the 12M XP clamp, the daily budget and Phase 0's entire
--   fight block silently disappear.
--
-- ── WHY THIS FILE EXISTS ────────────────────────────────────────────────
-- hr_apply has had a complete, correct EQUIP block since
-- 2026-08-11-apply-engine.sql. It was UNREACHABLE THROUGH A PLAYER GESTURE,
-- because no verb in the Edge Function and no call site in src/net/* ever sent
-- an \`equip\` delta. That gap is the root of the b362/b363 equip-dupe class: the
-- server's player_inventory row went on counting a copy the player was wearing,
-- and the b359 max-merge handed the stale figure back into the bag.
--
-- b366 ships the equip verb, which makes the block reachable. Five refusal
-- codes therefore become reachable with it, and four of them are functions of a
-- GENERATED catalogue. The rule already written on \`c_release_codes\` in the
-- fight-carry link says, in its own words:
--
--     release a claimed key when the refusal is a function of SERVER STATE THAT
--     CAN CHANGE UNDERNEATH AN UNCHANGED DELTA [...] If you add a
--     catalogue-validated refusal code to hr_apply, IT GOES HERE TOO.
--
-- This is that. It is the \`unknown_skill\` incident (b361 — Stonemason shipped
-- minutes before its hr_skills row, two LIVE players' accrue keys bricked, and
-- "Try again" replayed the stored refusal even after the catalogue was fixed)
-- applied BEFORE the equivalent incident rather than after it. The equip shape
-- of it is a routine deploy-order slip: add an item to src/data/items.js,
-- deploy the Edge payload before re-applying
-- 2026-08-11-catalogue.generated.sql, and every equip of that item is
-- \`unknown_item\` — and stays \`unknown_item\` for that key.
--
-- ── WHAT IS NOT RELEASED, AND THAT IS THE LOAD-BEARING HALF ─────────────
-- \`insufficient_item\` is DELIBERATELY LEFT OFF. It is the equip block's
-- OWNERSHIP CHECK — the debit that makes equipping a conserving transfer rather
-- than a duplication — and it is a fact about the player's own inventory row,
-- not about a catalogue. Releasing it would give a client unlimited free
-- re-attempts on ONE key against a moving inventory, which is precisely the
-- retry loop a duplication exploit wants. It stays claimed.
--
-- Nothing released here EXECUTED anything: every one of the five is raised by
-- \`hr_reject\` inside the protected block, which rolls back whole, so a re-run
-- on the same key is a first run.
--
-- ── WHAT IT SHIPS ───────────────────────────────────────────────────────
--   §1  hr_apply     \`c_release_codes\` gains bad_equip, unknown_equip_slot,
--                    wrong_slot, requirement_not_met, too_many_equip_ops
--   §2  grants       revoke from PUBLIC first, then hr_engine (restated, not repaired
--                    — see the block there)
--   §3  self-verification — the commit gate
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────
-- Additive and behaviour-narrowing in one direction only: the body is a strict
-- superset of the one it replaces and the ONLY behavioural difference is which
-- intent keys a rejection releases. Reverting means re-applying
-- 2026-08-17-fight-carry.sql, which restores the shorter list; nothing else
-- moves and no data is touched. The Edge payload does not depend on this file
-- in either direction — an old payload never reaches the equip block, and a new
-- payload against an unpatched database gets correct refusals with a stickier
-- key. So the migration and the deploy are SAFE IN EITHER ORDER, and the
-- migration-first order is preferred only because it makes the first equip
-- refusal a player hits recoverable without a new key.
--
-- ⚠ THIS FILE IS NOW THE LAST ONE THAT REPLACES hr_apply. A later file that
--   also replaces it would silently delete this change. That ordering lives in
--   tests/schema-apply-order.json and is enforced by the replay.
-- ============================================================================

-- ── 0. PRECONDITIONS + THE LAST-TOUCHER SELF-CHECK — FAIL CLOSED ─────────
-- Refuse to install if the body we are about to REPLACE is not the one this
-- file was derived from. §0 checks before the replace; §3 checks after. The
-- pair is a gate rather than a hope.
do $$
declare v_src text; v_need text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply';
  if v_src is null then
    raise exception 'hr_apply does not exist — apply the player-state chain first';
  end if;
  -- The Phase 0 anchors. If they are missing, the live body is OLDER than the
  -- one this file was derived from and replacing it would move the database
  -- BACKWARDS while reporting success.
  foreach v_need in array array[
    'v_fight', 'c_max_fight_kills', 'bad_fight_hp', 'c_release_codes',
    'v_gems_in', 'v_prev_slot', 'intent_mismatch', 'tool_carry',
    'hr_day_budget_check']
  loop
    if position(v_need in v_src) = 0 then
      raise exception 'the LIVE hr_apply does not contain "%" — it is not the body this file was '
                      'derived from (2026-08-17-fight-carry.sql). Apply that chain first; do NOT '
                      'apply this file over an older body.', v_need;
    end if;
  end loop;
  -- Idempotence: a second apply is a no-op in effect, and saying so is cheaper
  -- than a reviewer wondering.
  if position('too_many_equip_ops''' in v_src) > 0
     and position('''requirement_not_met''' in v_src) > 0 then
    raise notice 'equip release codes are already present — this apply is a no-op replace';
  end if;
end $$;

-- ── 1. hr_apply — GENERATED. Do not hand-edit; see the header. ───────────
${apply}

-- ── 2. GRANTS ON hr_apply — revoke from PUBLIC first, then grant ─────────
-- A privileged RPC left executable by authenticated/anon is the whole game.
--
-- ⚠ AND THE REASON THIS IS RESTATED IS **NOT** THE OBVIOUS ONE. \`create or
--   replace\` does NOT reset a function's ACL — the existing grants survive it,
--   and only a fresh \`create\` gets the EXECUTE-TO-PUBLIC default. So these
--   three lines are not repairing damage this file did; they are making the
--   file's own postcondition true on a database where hr_apply was dropped and
--   recreated by hand, which is a real recovery path (the 2026-08-15 restore).
--   §3(d) asserts the RESULT rather than trusting these lines, which is what
--   makes the pair a gate instead of a hope.
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
grant execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 3. SELF-VERIFICATION — THE COMMIT GATE ───────────────────────────────
do $$
declare v_src text; v_list text; v_bad text; v_missing text; v_n int;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply';

  -- (a) THE BODY THAT LANDED CARRIES EVERYTHING §0 REFUSED TO DESTROY, plus
  --     this file's own change. §0 checked before the replace; this checks
  --     after, which is what makes the pair a gate.
  foreach v_bad in array array[
    'v_gems_in', 'gems_in', 'v_prev_slot', 'intent_mismatch', 'tool_carry',
    'hr_day_budget_check', 'c_max_xp_delta     constant bigint := 12000000',
    -- Phase 0's anchors, so a derivation that silently produced an OLDER body
    -- under a new filename fails here instead of shipping.
    'v_fight', 'c_max_fight_kills', 'bad_fight_hp', 'hr_activities',
    'when p_delta ? ''activity'' then ''{}''::jsonb',
    'v_fight ? ''monster'' and v_fight ? ''hp'' and v_fight ? ''kills''',
    'c_release_codes', 'any (c_release_codes)',
    -- The EQUIP BLOCK itself. It is not touched by this file, and that is
    -- exactly why it is asserted: the codes below are decoration if the block
    -- that raises them ever stops existing.
    'unknown_equip_slot', 'wrong_slot', 'requirement_not_met',
    'c_max_equip_kinds', 'player_equipment',
    -- ...and this file's own change.
    'too_many_equip_ops']
  loop
    if position(v_bad in v_src) = 0 then
      raise exception 'the hr_apply that landed does not contain "%" — the restatement in §1 is wrong',
        v_bad;
    end if;
  end loop;

  -- (b)+(c) THE RELEASE LIST IS READ, NOT SUBSTRING-MATCHED.
  --
  -- ⚠ A \`position('wrong_slot' in v_src)\` TEST WOULD BE VACUOUS AND WOULD LOOK
  --   FINE. The body MENTIONS every one of these codes in the equip block that
  --   RAISES them, so a substring test over prosrc passes whether or not the
  --   patch landed on the array at all — and the negative in (c) would fail for
  --   the wrong reason, which is the pressure that gets an assertion deleted.
  --   So the ARRAY LITERAL is located and its contents are read.
  -- NO REGEX, DELIBERATELY: \`substring(x from pattern)\` is POSIX ARE, whose
  -- bracket and dot semantics differ from every other flavour in this repo, and
  -- a pattern that silently matches nothing returns NULL — i.e. it fails
  -- CLOSED but for a reason nobody can debug from the message. Two positions
  -- and a substr say the same thing and cannot be wrong quietly.
  v_n := position('c_release_codes constant text[] := array[' in v_src);
  if v_n = 0 then
    raise exception 'could not locate the c_release_codes declaration in hr_apply — the '
                    'derivation''s anchor moved and this file cannot verify its own change';
  end if;
  v_list := substr(v_src, v_n);
  v_list := substr(v_list, 1, position('];' in v_list) + 1);

  -- (b) THE FIVE ARE IN IT.
  foreach v_bad in array array[
    'bad_equip', 'unknown_equip_slot', 'wrong_slot', 'requirement_not_met',
    'too_many_equip_ops',
    -- ...and the eight that were already there. A patch that REPLACED the list
    -- instead of extending it would brick every accrual key on a stale
    -- catalogue, which is the b361 incident coming back through the fix for it.
    'version_conflict', 'bad_fight', 'bad_fight_hp', 'bad_fight_kills',
    'unknown_monster', 'unknown_skill', 'unknown_item', 'unknown_activity']
  loop
    if position('''' || v_bad || '''' in v_list) = 0 then
      raise exception 'c_release_codes does not contain % — a catalogue-staleness refusal would '
                      'brick the intent key for up to 25 hours (the b361 unknown_skill incident)',
        v_bad;
    end if;
  end loop;

  -- (c) ⚠ THE NEGATIVE, AND IT IS THE LOAD-BEARING ASSERTION IN THIS FILE.
  --     \`insufficient_item\` is the equip block's OWNERSHIP CHECK — the debit
  --     that makes equipping a conserving TRANSFER rather than a duplication.
  --     On the release list it would give a client unlimited free re-attempts on
  --     ONE idempotency key against a moving inventory, which is exactly the
  --     retry loop a duplication exploit wants.
  if position('''insufficient_item''' in v_list) > 0 then
    raise exception 'insufficient_item is on c_release_codes — that is the ownership check, and '
                    'releasing its key hands a client unlimited free re-attempts against a moving '
                    'inventory. Take it off.';
  end if;

  -- (d) NEITHER PRIVILEGED RPC IS CLIENT-EXECUTABLE. Re-asserted after a
  --     \`create or replace\`. It does NOT reset the ACL — that is a common and
  --     wrong belief — but a hand-recreated function WOULD carry the default,
  --     so the property is measured rather than reasoned about.
  for v_missing in select unnest(array['anon','authenticated','service_role','public']) loop
    if has_function_privilege(v_missing, 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute') then
      raise exception 'hr_apply is EXECUTABLE by % — that is the whole game', v_missing;
    end if;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute') then
    raise exception 'hr_engine cannot execute hr_apply — every intent would 500';
  end if;

  -- (e) NO CLIENT WRITE POLICY OR GRANT ON player_equipment. The equip verb
  --     makes this table reachable by a player gesture for the first time, so
  --     the property is asserted where the gesture lands rather than assumed
  --     from the batch-5 default ACL.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename in ('player_equipment','player_inventory')
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_n > 0 then
    raise exception '% client write policies on player_equipment/player_inventory — a client could '
                    'write its own loadout, which is the entire dupe this verb exists to close', v_n;
  end if;
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('player_equipment','player_inventory')
     and grantee in ('anon','authenticated','PUBLIC')
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if v_n > 0 then
    raise exception '% client write grants on player_equipment/player_inventory', v_n;
  end if;

  -- (f) THE CATALOGUES THE EQUIP BLOCK VALIDATES AGAINST ARE POPULATED. A
  --     positive control: with an empty hr_equip_slots every equip is
  --     unknown_equip_slot, which the release list would turn from a hard brick
  --     into an infinite polite refusal — correct, and still a dead feature.
  if (select count(*) from public.hr_equip_slots) = 0
     or (select count(*) from public.hr_item_slots) = 0 then
    raise exception 'hr_equip_slots or hr_item_slots is EMPTY — apply '
                    '2026-08-11-catalogue.generated.sql first, or every equip is refused';
  end if;

  raise notice 'EQUIP RELEASE CODES OK — % release codes, % equip slots, % item-slot pairs, '
               'insufficient_item NOT released, hr_apply not client-executable',
    13,
    (select count(*) from public.hr_equip_slots),
    (select count(*) from public.hr_item_slots);
end $$;
`;
}

const SELF = process.argv[1]
  && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (SELF) {
  const apply = await deriveApply();
  if (process.argv.includes('--write')) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(MIG, TARGET), migration(apply), 'utf8');
    console.log(`wrote supabase/migrations/${TARGET}`);
  } else if (process.argv.includes('--check')) {
    const mig = (await readFile(join(MIG, TARGET), 'utf8')).replace(/\r\n/g, '\n');
    if (!mig.includes(apply)) {
      console.error(`DRIFT: ${TARGET}'s hr_apply is not what this script derives from ${APPLY_SRC}. `
        + 'Regenerate it — do not hand-edit a restated body.');
      process.exit(1);
    }
    console.log(`derive-equip-release: ${TARGET} matches the derivation (hr_apply ${apply.length} B)`);
  } else {
    console.log(apply);
  }
}
