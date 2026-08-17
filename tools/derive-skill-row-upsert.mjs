// ============================================================================
// tools/derive-skill-row-upsert.mjs — BUILD the hr_apply body for
// 2026-08-18-skill-row-upsert.sql by EXTRACTING the CURRENT live body out of
// 2026-08-18-equip-release-codes.sql and patching it at ONE named anchor.
// Nothing is retyped.
//
//   node tools/derive-skill-row-upsert.mjs          # print the derived body
//   node tools/derive-skill-row-upsert.mjs --write  # (re)write the migration
//   node tools/derive-skill-row-upsert.mjs --check  # assert the migration still
//                                                   # contains what this derives
//
// WHY THIS EXISTS — read tools/derive-fight-carry.mjs's header first, then
// tools/derive-equip-release.mjs's. `create or replace` on a ~69 KB body you
// have not read silently deletes whichever of b346's ownership flag / b348's
// tool_carry key / the S5 accrued_to stamp / the 12M XP clamp / the daily
// budget / Phase 0's whole fight block / b366's five equip release codes the
// typist did not know about. This script produces something that can pass
// tests/run-sql-tests.mjs PART 1f-ii line by line.
//
// SOURCE — THE CURRENT LAST TOUCHER, and it is equip-release-codes, not
// fight-carry:
//   hr_apply <- supabase/migrations/2026-08-18-equip-release-codes.sql
//
// ── THE INCIDENT THIS CLOSES ────────────────────────────────────────────
// hr_apply's XP grant was written as a bare UPDATE with a row-count assertion:
//
//     update public.player_skills set xp = xp + v_n
//       where user_id = v_uid and slot = v_slot and skill_id = k;
//     get diagnostics v_rows = row_count;
//     if v_rows <> 1 then
//       perform public.hr_reject('unknown_skill', ...);
//     end if;
//
// That conflates TWO different facts into one refusal:
//   (1) the skill id is not in the catalogue          — a real client/deploy bug
//   (2) THIS CHARACTER HAS NO ROW FOR A REAL SKILL    — a server bookkeeping gap
//
// (2) is not an error condition. It is a row to create. Every character created
// before a skill was added to src/data/skills.js is missing that skill's row,
// because the per-skill seed happens ONCE at bootstrap
// (2026-08-14-character-bootstrap.sql §"Skills") and nothing backfills it. When
// Stonemason shipped, every pre-Stonemason character that so much as brushed the
// skill got `unknown_skill` — and because the refusal is STORED against the
// intent key, "Try again" replayed it. 51 rejections landed in hr_rejections in
// one night at severity `incident`, and the whole accrue was refused each time:
// hr_reject rolls the protected block back whole, so a player mining coal lost
// the mining XP AND the ore AND the gold, not just the stonemason line.
//
// ⚠ AND THE FIX IS NOT "SEED HARDER". Production was backfilled by hand on the
//   night of the incident (every user/slot × hr_skills pair now exists), which
//   makes the symptom go away and leaves the DEFECT completely intact: the next
//   skill added to the catalogue re-creates it for every existing character.
//   The bootstrap seed cannot fix it either — it runs once, at character
//   creation, and the catalogue grows afterwards. The only place that can be
//   right for both a backfilled database and a fresh one is the grant itself.
//
// ── THE PATCH ───────────────────────────────────────────────────────────
// The UPDATE becomes a TRUE-UNKNOWN CHECK against the catalogue followed by an
// UPSERT:
//
//     if not exists (select 1 from public.hr_skills where skill_id = k) then
//       perform public.hr_reject('unknown_skill', ...);
//     end if;
//     insert into public.player_skills (user_id, slot, skill_id, xp)
//       values (v_uid, v_slot, k, v_n)
//       on conflict (user_id, slot, skill_id)
//       do update set xp = player_skills.xp + v_n;
//
// `unknown_skill` now means EXACTLY what its name says, and is raised STRICTLY
// MORE NARROWLY than before — this migration cannot make a previously-accepted
// delta be refused. The catalogue check runs BEFORE the insert deliberately: the
// FK on player_skills is to player_state(user_id, slot), NOT to hr_skills, so an
// insert of a junk skill_id would SUCCEED and mint a skill row from a client
// string. The check is the validation; the upsert is not.
//
// ── WHAT IS DELIBERATELY *NOT* IN THIS FILE ─────────────────────────────
// The character-bootstrap seed is CORRECT AND UNTOUCHED. It already inserts a
// row per skill IN THE CATALOGUE (`from public.hr_skills left join
// hr_start_skill_xp`), so it needs no edit — and it lives in
// 2026-08-14-character-bootstrap.sql's hr_bootstrap_character, which is a
// DIFFERENT FUNCTION in a DIFFERENT FILE and is not in hr_apply's derived body
// at all. Restating it here would put a second author on it for no gain.
// (2026-08-11-player-state.sql's ORIGINAL hr_create_character seeded from a
// hardcoded `c_start_skills` array; character-bootstrap replaces that body with
// the catalogue-driven one, so the live function is already right and the
// hardcoded array is dead. §3(g) reads the LIVE body rather than a filename.)
// ============================================================================
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = join(ROOT, 'supabase', 'migrations');

const APPLY_SRC = '2026-08-18-equip-release-codes.sql';
const TARGET = '2026-08-18-skill-row-upsert.sql';

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

  t = patch(t, `        update public.player_skills set xp = xp + v_n
          where user_id = v_uid and slot = v_slot and skill_id = k;
        get diagnostics v_rows = row_count;
        if v_rows <> 1 then
          perform public.hr_reject('unknown_skill', jsonb_build_object('skill_id', k));
        end if;`,
  `        -- ⚠ A MISSING ROW IS A ROW TO CREATE, NOT A REFUSAL (b370, and the
        --   incident that named it). This was an UPDATE plus
        --   \`if v_rows <> 1 then hr_reject('unknown_skill')\`, which conflated
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
        --   keeps \`unknown_skill\` meaning what its name says — and it is raised
        --   STRICTLY MORE NARROWLY than before, so no delta this body used to
        --   accept can start being refused.
        if not exists (select 1 from public.hr_skills where skill_id = k) then
          perform public.hr_reject('unknown_skill', jsonb_build_object('skill_id', k));
        end if;
        insert into public.player_skills (user_id, slot, skill_id, xp)
          values (v_uid, v_slot, k, v_n)
          on conflict (user_id, slot, skill_id)
          do update set xp = player_skills.xp + v_n;`,
  'the XP grant becomes a catalogue check + upsert');

  return t;
}

function migration(apply) {
  return `-- ============================================================================
-- 2026-08-18-skill-row-upsert.sql — THE PERMANENT FIX FOR THE \`unknown_skill\`
-- INCIDENT: hr_apply's XP grant CREATES a missing player_skills row instead of
-- refusing the whole accrue.
--
-- Governing rule: CLAUDE.md "Server authority (locked 2026-08-10)".
--
-- ⚠ GENERATED. The restated hr_apply below is produced by
--   \`node tools/derive-skill-row-upsert.mjs --write\` from the CURRENT last
--   toucher (2026-08-18-equip-release-codes.sql) and patched at ONE named
--   anchor. Do NOT hand-edit it; \`--check\` runs in the suite and will fail.
--   Retyping a 69 KB body is how b346's ownership flag, b348's tool_carry key,
--   the S5 accrued_to stamp, the 12M XP clamp, the daily budget, Phase 0's
--   entire fight block and b366's five equip release codes silently disappear.
--
-- ── THE INCIDENT ────────────────────────────────────────────────────────
-- The XP grant was an UPDATE with a row-count assertion:
--
--     update public.player_skills set xp = xp + v_n where ...;
--     get diagnostics v_rows = row_count;
--     if v_rows <> 1 then hr_reject('unknown_skill') end if;
--
-- which reports TWO unrelated facts with one code:
--   (1) the skill id is not in the catalogue        — a real deploy bug
--   (2) this character has no row for a REAL skill  — server bookkeeping
--
-- (2) is not an error. Per-skill rows are seeded ONCE, at character creation
-- (2026-08-14-character-bootstrap.sql), and the catalogue grows afterwards — so
-- every character older than a skill lacked its row. When Stonemason shipped,
-- pre-Stonemason characters got \`unknown_skill\` on a legitimate grant; the
-- refusal STORED itself against the intent key so "Try again" replayed it; and
-- because hr_reject rolls the protected block back WHOLE, each refusal also
-- discarded the ore, the gold and every other skill's XP in the same window.
-- 51 aggregated rejections at severity \`incident\` in a single night.
--
-- ⚠ PRODUCTION WAS BACKFILLED BY HAND that night (all user/slot × hr_skills
--   pairs exist), so this file does NOT need to repair data — and MUST be
--   correct on a fresh database too, where those rows do not exist. It is: the
--   upsert covers both, which is exactly why the fix is in the grant and not in
--   a one-off backfill or in the bootstrap seed (which runs once and cannot see
--   a catalogue that grows later).
--
-- ── WHAT IT SHIPS ───────────────────────────────────────────────────────
--   §1  hr_apply     the XP grant becomes
--                      \`if not exists (select 1 from hr_skills ...) -> reject\`
--                    + \`insert ... on conflict (user_id, slot, skill_id)
--                       do update set xp = player_skills.xp + v_n\`
--   §2  grants       revoke from PUBLIC first, then hr_engine
--   §3  self-verification — the commit gate
--
-- ── WHY THE ORDER OF THE TWO STATEMENTS IS LOAD-BEARING ─────────────────
-- There is NO foreign key from player_skills.skill_id to hr_skills — the FK is
-- to player_state(user_id, slot). A bare upsert would therefore SUCCEED on a
-- junk client string and mint a skill row out of it. The catalogue check is the
-- validation; the upsert is only the write.
--
-- ── WHAT IS NOT TOUCHED ─────────────────────────────────────────────────
-- The bootstrap seed is already correct (\`from public.hr_skills left join
-- hr_start_skill_xp\`, i.e. a row per catalogue skill) and lives in a DIFFERENT
-- FILE: 2026-08-14-character-bootstrap.sql's \`create or replace\` of
-- public.hr_create_character, which supersedes 2026-08-11-player-state.sql's
-- hardcoded fifteen-entry \`c_start_skills\` array. It is not in hr_apply's body
-- and is deliberately not restated here. §3(g) asserts it still seeds from the
-- catalogue, so this file notices if that ever changes — but note that seeding
-- at creation CANNOT fix the incident, because the catalogue grows after a
-- character is created and nothing re-seeds. The upsert is the fix; the seed is
-- only the reason a FRESH character rarely needs it.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────
-- Additive and behaviour-WIDENING in one direction only: every delta the
-- previous body accepted is still accepted with an identical result (an
-- existing row takes the \`do update\` arm, which is the same arithmetic as the
-- UPDATE it replaces), and the only deltas whose outcome changes are ones that
-- previously FAILED. \`unknown_skill\` is raised strictly more narrowly.
-- Reverting means re-applying 2026-08-18-equip-release-codes.sql, which restores
-- the UPDATE; no data is touched in either direction, and rows this file created
-- are indistinguishable from bootstrap-seeded ones. The Edge payload does not
-- depend on this file — SAFE IN EITHER ORDER with a deploy.
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
  -- The anchors of every link BELOW this one. If any is missing, the live body
  -- is OLDER than the one this file was derived from and replacing it would
  -- move the database BACKWARDS while reporting success.
  foreach v_need in array array[
    'v_fight', 'c_max_fight_kills', 'bad_fight_hp', 'c_release_codes',
    'v_gems_in', 'v_prev_slot', 'intent_mismatch', 'tool_carry',
    'hr_day_budget_check',
    -- b366's link, i.e. equip-release-codes specifically rather than merely
    -- "something with an equip block".
    'too_many_equip_ops']
  loop
    if position(v_need in v_src) = 0 then
      raise exception 'the LIVE hr_apply does not contain "%" — it is not the body this file was '
                      'derived from (2026-08-18-equip-release-codes.sql). Apply that chain first; '
                      'do NOT apply this file over an older body.', v_need;
    end if;
  end loop;
  -- Idempotence: a second apply is a no-op in effect, and saying so is cheaper
  -- than a reviewer wondering.
  if position('on conflict (user_id, slot, skill_id)' in v_src) > 0 then
    raise notice 'the skill-row upsert is already present — this apply is a no-op replace';
  end if;
  -- Positive control for the fix itself: with an EMPTY hr_skills catalogue the
  -- new true-unknown check refuses EVERY xp key, which would turn a bookkeeping
  -- gap into a total accrual outage. Fail here rather than in the field.
  if (select count(*) from public.hr_skills) = 0 then
    raise exception 'hr_skills is EMPTY — apply 2026-08-11-catalogue.generated.sql first, or '
                    'every XP grant is unknown_skill';
  end if;
end $$;

-- ── 1. hr_apply — GENERATED. Do not hand-edit; see the header. ───────────
${apply}

-- ── 2. GRANTS ON hr_apply — revoke from PUBLIC first, then grant ─────────
-- A privileged RPC left executable by authenticated/anon is the whole game.
--
-- ⚠ \`create or replace\` does NOT reset a function's ACL — the existing grants
--   survive it. These lines are not repairing damage this file did; they make
--   the file's postcondition true on a database where hr_apply was dropped and
--   recreated by hand, which is a real recovery path. §3(d) asserts the RESULT
--   rather than trusting them, which is what makes the pair a gate.
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) from public;
revoke execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb)
  from anon, authenticated, service_role;
grant execute on function public.hr_apply(uuid, int, bigint, uuid, jsonb) to hr_engine;

-- ── 3. SELF-VERIFICATION — THE COMMIT GATE ───────────────────────────────
do $$
declare v_src text; v_xp text; v_bad text; v_missing text; v_n int; v_boot text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_apply';

  -- (a) THE BODY THAT LANDED CARRIES EVERYTHING §0 REFUSED TO DESTROY, plus
  --     this file's own change. §0 checked before the replace; this checks
  --     after, which is what makes the pair a gate.
  foreach v_bad in array array[
    'v_gems_in', 'gems_in', 'v_prev_slot', 'intent_mismatch', 'tool_carry',
    'hr_day_budget_check', 'c_max_xp_delta     constant bigint := 12000000',
    'v_fight', 'c_max_fight_kills', 'bad_fight_hp', 'hr_activities',
    'when p_delta ? ''activity'' then ''{}''::jsonb',
    'v_fight ? ''monster'' and v_fight ? ''hp'' and v_fight ? ''kills''',
    'c_release_codes', 'any (c_release_codes)',
    -- b366's whole link, codes AND the block that raises them.
    'unknown_equip_slot', 'wrong_slot', 'requirement_not_met',
    'c_max_equip_kinds', 'player_equipment', 'too_many_equip_ops',
    -- ...and this file's own change.
    'on conflict (user_id, slot, skill_id)']
  loop
    if position(v_bad in v_src) = 0 then
      raise exception 'the hr_apply that landed does not contain "%" — the restatement in §1 is wrong',
        v_bad;
    end if;
  end loop;

  -- (b) THE XP GRANT IS AN UPSERT AND THE OLD REFUSAL IS GONE — read out of the
  --     XP BLOCK, not substring-matched over the whole body.
  --
  -- ⚠ A NAIVE \`position('unknown_skill' in v_src) = 0\` TEST WOULD BE WRONG IN
  --   BOTH DIRECTIONS. The body legitimately mentions \`unknown_skill\` three
  --   more times — on c_release_codes, in the tool_carry validation, and in the
  --   new true-unknown check itself — so it can never be absent, and asserting
  --   its absence would fail forever. What must be gone is the ROW-COUNT
  --   REFUSAL, and the only honest way to say that is to locate the XP block and
  --   read it.
  v_n := position('if p_delta ? ''xp'' then' in v_src);
  if v_n = 0 then
    raise exception 'could not locate the XP block in hr_apply — the derivation''s anchor moved '
                    'and this file cannot verify its own change';
  end if;
  v_xp := substr(v_src, v_n);
  v_xp := substr(v_xp, 1, position('-- ── EQUIPMENT' in v_xp));
  if v_n = 0 or length(v_xp) < 100 then
    raise exception 'the XP block could not be delimited — refusing to verify by accident';
  end if;

  if position('update public.player_skills set xp = xp + v_n' in v_xp) > 0 then
    raise exception 'the XP grant is still a bare UPDATE — a character with no row for a real '
                    'skill would be answered with unknown_skill and lose the whole accrue '
                    '(the b369 incident)';
  end if;
  if position('get diagnostics v_rows = row_count' in v_xp) > 0 then
    raise exception 'the XP grant still asserts a row count — that is the conflation the incident '
                    'was made of';
  end if;
  foreach v_bad in array array[
    'insert into public.player_skills (user_id, slot, skill_id, xp)',
    'on conflict (user_id, slot, skill_id)',
    'do update set xp = player_skills.xp + v_n',
    -- The TRUE-UNKNOWN check. Without it the upsert mints a skill row from a
    -- client string, because there is no FK from skill_id to hr_skills.
    'if not exists (select 1 from public.hr_skills where skill_id = k) then',
    'hr_reject(''unknown_skill''']
  loop
    if position(v_bad in v_xp) = 0 then
      raise exception 'the XP block does not contain "%" — the patch in §1 did not land as declared',
        v_bad;
    end if;
  end loop;
  -- ⚠ ORDER, not just presence. The check must precede the write; reversed, a
  --   junk skill id is inserted and only then refused, and on a rollback-whole
  --   refusal that is invisible until someone changes how refusals unwind.
  if position('if not exists (select 1 from public.hr_skills where skill_id = k) then' in v_xp)
     > position('insert into public.player_skills (user_id, slot, skill_id, xp)' in v_xp) then
    raise exception 'the catalogue check runs AFTER the insert — there is no FK from '
                    'player_skills.skill_id to hr_skills, so that order mints a skill row from a '
                    'client string';
  end if;
  -- The 12M clamp is INSIDE the XP block and is the only bound on a single
  -- grant. Asserted here (not just globally) because it sits three lines above
  -- the patched region.
  if position('c_max_xp_delta' in v_xp) = 0 then
    raise exception 'the XP clamp is not in the XP block — an unbounded single grant';
  end if;

  -- (c) \`unknown_skill\` IS STILL ON THE RELEASE LIST. The code is now raised
  --     for a genuinely stale catalogue only — which is precisely the
  --     "server state that can change underneath an unchanged delta" case that
  --     must release its intent key, or the first client to hit it is bricked
  --     for up to 25 hours. Narrowing the code must not silently drop it.
  v_n := position('c_release_codes constant text[] := array[' in v_src);
  if v_n = 0 then
    raise exception 'could not locate the c_release_codes declaration in hr_apply';
  end if;
  v_xp := substr(v_src, v_n);
  v_xp := substr(v_xp, 1, position('];' in v_xp) + 1);
  foreach v_bad in array array[
    'version_conflict', 'bad_fight', 'bad_fight_hp', 'bad_fight_kills',
    'unknown_monster', 'unknown_skill', 'unknown_item', 'unknown_activity',
    'bad_equip', 'unknown_equip_slot', 'wrong_slot', 'requirement_not_met',
    'too_many_equip_ops']
  loop
    if position('''' || v_bad || '''' in v_xp) = 0 then
      raise exception 'c_release_codes does not contain % — b366''s link was destroyed by this '
                      'restatement', v_bad;
    end if;
  end loop;
  -- b366's load-bearing NEGATIVE, re-asserted because this file restates the
  -- array's neighbourhood: insufficient_item is the equip block's ownership
  -- check and releasing its key is the retry loop a dupe wants.
  if position('''insufficient_item''' in v_xp) > 0 then
    raise exception 'insufficient_item is on c_release_codes — take it off (see '
                    '2026-08-18-equip-release-codes.sql §3(c))';
  end if;

  -- (d) NEITHER PRIVILEGED RPC IS CLIENT-EXECUTABLE.
  for v_missing in select unnest(array['anon','authenticated','service_role','public']) loop
    if has_function_privilege(v_missing, 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute') then
      raise exception 'hr_apply is EXECUTABLE by % — that is the whole game', v_missing;
    end if;
  end loop;
  if not has_function_privilege('hr_engine', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute') then
    raise exception 'hr_engine cannot execute hr_apply — every intent would 500';
  end if;

  -- (e) NO CLIENT WRITE POLICY OR GRANT ON player_skills. This file makes
  --     hr_apply INSERT into it for the first time, so the property is asserted
  --     where the new write lands rather than assumed from the batch-5 default.
  --     A client that could insert its own skill row could set its own XP.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'player_skills'
     and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_n > 0 then
    raise exception '% client write policies on player_skills — a client could author its own '
                    'levels, which is every leaderboard', v_n;
  end if;
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'player_skills'
     and grantee in ('anon','authenticated','PUBLIC')
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if v_n > 0 then
    raise exception '% client write grants on player_skills', v_n;
  end if;

  -- (f) THE PRIMARY KEY THE UPSERT ARBITRATES ON EXISTS AND IS EXACTLY THOSE
  --     THREE COLUMNS. \`on conflict\` needs a unique index; without this the
  --     migration would fail at RUNTIME, per accrue, rather than here.
  select count(*) into v_n
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname = 'player_skills' and i.indisunique
     and (select array_agg(a.attname::text order by a.attname)
            from unnest(i.indkey) k join pg_attribute a
              on a.attrelid = i.indrelid and a.attnum = k)
         = array['skill_id','slot','user_id'];
  if v_n = 0 then
    raise exception 'player_skills has no unique index on (user_id, slot, skill_id) — the upsert '
                    'would fail at runtime on every XP grant';
  end if;

  -- (g) THE BOOTSTRAP SEED STILL SEEDS FROM THE CATALOGUE. Not touched by this
  --     file, and asserted for exactly that reason: if it ever stops covering
  --     hr_skills, the upsert above becomes the ONLY thing creating skill rows,
  --     and that is worth knowing at apply time rather than discovering.
  select prosrc into v_boot from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_create_character';
  if v_boot is null then
    raise exception 'hr_create_character is missing — apply 2026-08-11-player-state.sql and '
                    '2026-08-14-character-bootstrap.sql first';
  end if;
  if position('from public.hr_skills' in v_boot) = 0 then
    raise exception 'hr_create_character no longer seeds player_skills from the hr_skills '
                    'catalogue (2026-08-14-character-bootstrap.sql is not the live body, or it '
                    'regressed to player-state''s hardcoded c_start_skills array) — new characters '
                    'would rely entirely on the XP upsert to acquire their skill rows';
  end if;

  raise notice 'SKILL ROW UPSERT OK — % skills in the catalogue, % release codes, XP grant is an '
               'upsert gated on hr_skills, hr_apply not client-executable, no client write on '
               'player_skills',
    (select count(*) from public.hr_skills), 13;
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
    console.log(`derive-skill-row-upsert: ${TARGET} matches the derivation (hr_apply ${apply.length} B)`);
  } else {
    console.log(apply);
  }
}
