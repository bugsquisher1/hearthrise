#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hr-state-of-final-body.mjs — WHERE hr_state_of's LIVE TEXT LIVES, AND
//                                    THE PROOF THAT ITS RESTATEMENT'S PINS BITE.
//
//   node tests/hr-state-of-final-body.mjs             the guard
//   node tests/hr-state-of-final-body.mjs --selftest  every mutation must be CAUGHT
//   node tests/hr-state-of-final-body.mjs --list      the mutation catalogue
//
// The sibling of tests/hr-apply-final-body.mjs, for the other body slice 7
// restated. Two jobs in one file, because they are the same knowledge:
//
//   1. THE CONSTANTS the guards that PLANT INTO hr_state_of import, so the answer
//      to "which file owns the envelope today?" exists in ONE place instead of in
//      each guard's private `const MIG`.
//   2. THE MUTATION PROOF for 2026-09-14-hr-state-of-restatement.sql's §0, §3(a),
//      §3(c) and §3(d) — the four assertions standing between a restatement and
//      silently discarding somebody's work or shipping a smaller envelope.
//
// ── THE FINAL-BODY RULE ─────────────────────────────────────────────────────
// A mutation proof must plant its defect in the file that owns the text the
// database ACTUALLY RUNS. For a body assembled by anchored patches that is the
// LAST file to touch it; every earlier file's contribution is overwritten by
// whatever comes after. tests/buff-queue.mjs learned this on 2026-09-13 — an arm
// that mutated text a later file re-splices scored HARNESS instead of the tick it
// earned — and its header states the rule.
//
// 2026-09-14-hr-state-of-restatement.sql RESTATES hr_state_of whole and runs
// LAST, so it now owns every line of that body. An arm that still plants into
// 2026-09-12-renown-high-projection.sql, 2026-09-13-consumable-buffs.sql,
// 2026-09-14-recipe-learn.sql or any of the other twenty-one is mutating a draft:
// the restatement replaces it a few files later and the arm is VACUOUS. Point the
// arm HERE instead.
//
// ── WHY THAT IS LOUD RATHER THAN SILENT ─────────────────────────────────────
// The restatement's §0 PINS the code hash of the body it replaces and REFUSES to
// apply over a body it cannot name (a restatement applied over drift silently
// DISCARDS the drift — the one failure mode unique to that migration shape). So
// an arm left pointing at an earlier file does not quietly stop biting: the chain
// refuses and the arm reads "THE REPO CANNOT REBUILD THE DATABASE". That is the
// desired failure, and the fix is always the same: re-point the arm at
// HR_STATE_OF_FINAL.
//
// ── ONE PIN CONSTANT, NOT TWO ───────────────────────────────────────────────
// The hr_apply restatement deleted two dead declarations, so the body it replaced
// and the body it installed differed and §0 needed a separate hash-keyed re-apply
// branch. This restatement is COMMENT-ONLY: the comment-stripped code md5 is
// 88b814f1… before and after. So the predecessor pin and the installed pin are
// one constant, and the re-apply case IS the predecessor case — there is no skip
// path to get wrong. `--selftest` DRIVES that: §0 is re-run against an untouched
// body (must be a no-op) and against a body a later anchored patch has moved
// (must refuse), which is what a re-apply onto a production that has since taken
// a hotfix looks like.
//
// Exit: 0 green · 1 an assertion failed · 2 harness.
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootReplay } from './schema-replay.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));

/** The migration that owns hr_state_of's live text. */
export const HR_STATE_OF_FINAL = '2026-09-14-hr-state-of-restatement.sql';

/** The comment-stripped code md5 of the body it installs — and of the body it
 *  replaces, because the restatement is comment-only. */
export const HR_STATE_OF_CODE = '88b814f1226c46971443d382eb369113';

/** Short-circuit §3 (the whole post-install self-check: pin, markers, banner,
 *  reachability, declare list and the probe). Anchored on the first statement of
 *  its `begin`, which is unique in the file. */
export const HR_STATE_OF_S3_BLIND = [
  "begin\n  v_def  := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');",
  "begin\n  return;  -- §3 SHORT-CIRCUITED FOR A MUTATION PROOF (tests/hr-state-of-final-body.mjs)\n"
  + "  v_def  := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');",
];

/** Short-circuit §0 (the predecessor pin + the no-removal proof). */
export const HR_STATE_OF_S0_BLIND = [
  '  if to_regprocedure(c_sig) is null then',
  '  return;  -- §0 SHORT-CIRCUITED FOR A MUTATION PROOF (tests/hr-state-of-final-body.mjs)\n'
  + '  if to_regprocedure(c_sig) is null then',
];

/* Blind ONLY §3(a)'s hash pin, leaving the marker sweep, the declare check and
   the probe armed. The pin is a statement about the WHOLE body, so it fires on
   any code mutation and would mask every arm behind it — see
   `section_commented_out` vs `section_deleted_pin_armed`, which are the same
   defect measured with the pin off and on. */
const S3_PIN_BLIND = [
  '  if md5(v_code) <> c_code then',
  '  if false then  -- §3(a) HASH PIN BLINDED FOR THE MUTATION PROOF (tests/hr-state-of-final-body.mjs)',
];

/* Blind ONLY §0's pin, leaving the no-removal proof armed. Written with
   `is distinct from` in the migration precisely so it is textually distinct from
   §3(a)'s gate and can be blinded on its own. */
const S0_PIN_BLIND = [
  '  if md5(v_code) is distinct from c_code then',
  '  if false then  -- §0 PIN BLINDED FOR THE MUTATION PROOF (tests/hr-state-of-final-body.mjs)',
];

const harness = (m) => { const e = new Error(m); e.harness = true; return e; };

/* ── THE MUTATION CATALOGUE ───────────────────────────────────────────────
   Each plants a REAL defect into the REAL migration text and names the
   assertion that must catch it. `expect` is matched against the raised message,
   so an arm cannot pass because SOMETHING went wrong. */
const MUTATIONS = {
  section_commented_out: {
    by: '§3(a) markers',
    why: 'a whole section is COMMENTED OUT rather than deleted — here the dungeon re-entry cooldown '
       + 'projection, i.e. the countdown a player watches stops being served while every other key '
       + 'survives. The text is still in pg_get_functiondef, so a §3(a) that matched against v_def would '
       + 'find its marker and pass. Matching v_code is what sees it.',
    pairs: [
      ["    'dungeon_cooldowns', public.hr_dungeon_cooldowns(p_user, v_st.slot),",
        "    -- 'dungeon_cooldowns', public.hr_dungeon_cooldowns(p_user, v_st.slot),"],
      S3_PIN_BLIND,
    ],
    expect: 'DROPPED a section',
  },
  section_deleted_pin_armed: {
    by: '§3(a) hash pin',
    why: 'the same defect with the pin NOT blinded: the whole-body hash is the strong half and must fire '
       + 'first, so a body that is not the one this file states it installs never reaches the marker sweep',
    pairs: [
      ["    'dungeon_cooldowns', public.hr_dungeon_cooldowns(p_user, v_st.slot),",
        "    -- 'dungeon_cooldowns', public.hr_dungeon_cooldowns(p_user, v_st.slot),"],
    ],
    expect: 'not the one this file states it installs',
  },
  banner_removed: {
    by: '§3(a) banner',
    why: 'the restatement banner is deleted from the body — the line a future author meets before '
       + 'reaching for replace()-and-execute again. It is a COMMENT, so it is checked against v_def and '
       + 'deliberately not smuggled into the marker array, and that distinction is the arm',
    pairs: [
      ['-- hr_state_of restated 2026-09-14 (2026-09-14-hr-state-of-restatement.sql) — chain depth 0.',
        '-- (banner removed for the mutation proof)'],
      S3_PIN_BLIND,
    ],
    expect: 'restatement banner is gone',
  },
  key_renamed: {
    by: '§3(d) the probe',
    why: 'a projected key is MISSPELLED. No marker is lost (hearthfind_titles is not a section anchor) '
       + 'and the envelope is still well-formed, so only a probe that reads a REAL character\'s envelope '
       + 'and compares the EXACT key set can see it. This is the class the restatement is most likely to '
       + 'commit and the one the player meets as "my titles are gone"',
    pairs: [
      ["      'hearthfind_titles', coalesce((", "      'hearthfind_titels', coalesce(("],
      S3_PIN_BLIND,
    ],
    expect: '`state` projects a DIFFERENT key set',
  },
  declare_added: {
    by: '§3(c) the no-removal proof',
    why: 'the restated body grows a declaration the predecessor did not have. This restatement claims to '
       + 'change NO code; a declare list that has moved means it did, and the reviewer is reading a diff '
       + 'that no longer describes the file',
    pairs: [
      /* The body's OWN declare line — the two other occurrences of that text in
         the file are §0's and §3's `c_decl` constants, which are what the proof
         compares AGAINST and must not move with the defect. */
      ['\ndeclare v_st public.player_state%rowtype;\nbegin\n',
        '\ndeclare v_st public.player_state%rowtype;\n  v_smuggled int;\nbegin\n'],
      S3_PIN_BLIND,
    ],
    expect: 'the installed body declares',
  },
  predecessor_pin_wrong: {
    by: '§0 pin',
    why: 'the file is applied over a body it was not cut from (simulated by moving the constant). A '
       + 'restatement that installs anyway DISCARDS whatever made the two differ, with no error and no '
       + 'trace — the one failure mode unique to this migration shape',
    pairs: [
      [`  c_code constant text := '${HR_STATE_OF_CODE}';\n  -- The body's ENTIRE declare list.`,
        "  c_code constant text := '00000000000000000000000000000000';\n  -- The body's ENTIRE declare list."],
    ],
    expect: 'NEITHER the body this file was cut from',
  },
};

/* The NEGATIVE CONTROL. A comment-only edit to the file's own prose is not a
   defect; if the chain refuses on it, the pins are reading text they should not. */
const NEGATIVE_CONTROL = [
  '-- ── §2 THE GRANT POSTURE ────────────────────────────────────────────────────────',
  '-- ── §2 THE GRANT POSTURE — comment-only negative control ───────────────────',
];

async function applies(pairsByFile) {
  try {
    const { db } = await bootReplay({ patches: new Map(pairsByFile) });
    await db.close?.();
    return null;
  } catch (e) {
    return String((e && e.message) || e);
  }
}

/** §0 alone, re-executed against whatever body the session currently holds. */
function extractS0(sql) {
  /* §0 is the FIRST `do $$ … end $$;` in the file; §1's body (`as $$ … $$;`) and
     §3 both come after it. Anchored on the shapes PART 1d of run-sql-tests.mjs
     requires, so a tag rename fails here rather than silently extracting §3. */
  const a = sql.indexOf('do $$');
  const b = sql.indexOf('end $$;', a) + 'end $$;'.length;
  if (a < 0 || b < 7) throw harness('could not extract §0 from the migration');
  const block = sql.slice(a, b);
  if (!block.includes('c_decl')) {
    throw harness('the first do-block in the migration is not §0 — the extractor is reading the wrong one');
  }
  return block;
}

async function main() {
  const argv = process.argv.slice(2);
  const path = join(ROOT, 'supabase', 'migrations', HR_STATE_OF_FINAL);
  const sql = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');

  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(26)} ${m.by.padEnd(24)} ${m.why}`);
    return 0;
  }

  /* ── THE FLOOR ─────────────────────────────────────────────────────────
     Every anchor must be present EXACTLY once, and the clean chain must apply.
     A mutation planted into a tree that is already red proves nothing. */
  let failed = 0;
  const ok = (cond, msg) => { if (!cond) { failed += 1; console.error(`  FAIL  ${msg}`); } };

  ok(sql.includes(HR_STATE_OF_S3_BLIND[0]), 'S3_BLIND anchor is not in the migration — the blind other guards import is dead');
  ok(sql.includes(HR_STATE_OF_S0_BLIND[0]), 'S0_BLIND anchor is not in the migration — the blind other guards import is dead');
  ok(sql.split(S3_PIN_BLIND[0]).length - 1 === 1, "§3(a)'s hash-pin gate is not in the migration exactly once");
  ok(sql.split(S0_PIN_BLIND[0]).length - 1 === 1, "§0's pin gate is not in the migration exactly once");
  ok(sql.split(NEGATIVE_CONTROL[0]).length - 1 === 1, 'the negative-control anchor is not in the migration exactly once');
  ok(sql.includes(`c_code constant text := '${HR_STATE_OF_CODE}';`),
    `the migration no longer pins ${HR_STATE_OF_CODE} — this file and the migration disagree about which `
    + 'body is live, which is the single-source-of-truth this guard exists to hold');
  ok(/foreach v_item in array c_markers loop\s*\n\s*--[^\n]*\n\s*if strpos\(v_code, v_item\) = 0 then/.test(sql),
    '§3(a) no longer sweeps the markers against v_code (Security C1) — a comment would count as code');
  ok(!/strpos\(v_def, 'hr_state_of restated 2026-09-14'\) > 0 then\s*\n\s*raise notice/.test(sql),
    '§0 recognises a re-apply by the banner string — Security C2 forbids it');
  ok(/v_top is distinct from array\(select unnest\(c_top\) order by 1\)/.test(sql),
    '§3(d) no longer asserts the EXACT top-level key set');

  const cleanErr = await applies([]);
  ok(!cleanErr, `the CLEAN chain does not apply — ${String(cleanErr).split('\n')[0]}`);
  if (failed) { console.error(`\nhr-state-of-final-body: ${failed} floor failure(s).`); return 1; }

  if (!argv.includes('--selftest')) {
    console.log('hr-state-of-final-body: the restatement owns hr_state_of, both blinds still anchor, §3(a) '
      + 'sweeps the comment-STRIPPED text, §3(d) pins the exact key set, and §0 pins one code constant '
      + `(${HR_STATE_OF_CODE}) rather than trusting a banner.`);
    return 0;
  }

  // ── THE MUTATIONS ───────────────────────────────────────────────────────
  console.log('hr-state-of-final-body --selftest: clean floor green, then every mutation must RAISE');
  let missed = 0;
  for (const [id, m] of Object.entries(MUTATIONS)) {
    const err = await applies([[HR_STATE_OF_FINAL, m.pairs.map((p) => p.slice())]]);
    if (!err) { console.error(`  MISSED  ${id} — ${m.why}`); missed += 1; continue; }
    if (!err.includes(m.expect)) {
      console.error(`  WRONG   ${id} — raised, but not by ${m.by}: ${err.split('\n').slice(0, 2).join(' ')}`);
      missed += 1; continue;
    }
    console.log(`  ok      ${id} — CAUGHT by ${m.by}`);
  }
  const ctrl = await applies([[HR_STATE_OF_FINAL, [NEGATIVE_CONTROL.slice()]]]);
  if (ctrl) { console.error(`  FAIL    negative control (comment-only) refused: ${String(ctrl).split('\n')[0]}`); missed += 1; }
  else console.log('  ok      negative control (comment-only): applied, as required');

  /* ── §0 DRIVEN AGAINST A MOVED BODY (the re-apply case) ────────────────
     Not a file mutation: the point is what §0 does when it meets a body that was
     patched AFTER the restatement landed, which is what a re-apply onto a
     production that has since taken a hotfix looks like. */
  const s0 = extractS0(sql);
  const { db } = await bootReplay();
  try {
    await db.exec(s0);
    console.log('  ok      re-apply on an UNTOUCHED body: §0 is a no-op, as required');
  } catch (e) {
    console.error(`  FAIL    re-apply on an untouched body raised: ${String(e.message).split('\n')[0]}`);
    missed += 1;
  }
  await db.exec(`do $probe$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  v_def := replace(v_def, $anc$'renown_high', coalesce(v_st.renown_high, 0),$anc$,
                          $anc$'renown_high', coalesce(v_st.renown_high, 1),$anc$);
  execute v_def;
end $probe$;`);
  let caught = null;
  try { await db.exec(s0); } catch (e) { caught = String(e.message); }
  if (caught && caught.includes('NEITHER the body this file was cut from')) {
    console.log('  ok      re-apply after a LATER anchored patch: §0 refuses, as required');
  } else {
    console.error(`  MISSED  §0 would have DISCARDED a later anchored patch on re-apply — ${caught || 'it did not raise'}`);
    missed += 1;
  }

  /* ── §0's NO-REMOVAL PROOF, DRIVEN ────────────────────────────────────
     A body whose declare list has grown must be refused BY THAT PROOF, not by
     the pin — so the pin is blinded in-process for this one execution. */
  const s0NoPin = s0.replace(S0_PIN_BLIND[0], S0_PIN_BLIND[1]);
  if (s0NoPin === s0) { console.error('  FAIL    could not blind §0\'s pin — the anchor moved'); missed += 1; }
  await db.exec(`do $probe$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  v_def := replace(v_def, 'declare v_st public.player_state%rowtype;',
                          'declare v_st public.player_state%rowtype;
  v_smuggled int;');
  execute v_def;
end $probe$;`);
  let caught2 = null;
  try { await db.exec(s0NoPin); } catch (e) { caught2 = String(e.message); }
  if (caught2 && caught2.includes('this file carries forward')) {
    console.log("  ok      a body with an EXTRA declaration: §0's no-removal proof refuses, as required");
  } else {
    console.error(`  MISSED  §0's no-removal proof did not see a grown declare list — ${caught2 || 'it did not raise'}`);
    missed += 1;
  }
  await db.close?.();

  if (missed) {
    console.error(`\nhr-state-of-final-body --selftest: ${missed} arm(s) not caught. A guard that has never `
      + 'been red is not a guard.');
    return 1;
  }
  console.log(`\nhr-state-of-final-body --selftest PASSED — ${Object.keys(MUTATIONS).length} mutations caught by the `
    + 'assertion written for each, a comment-only control stayed green, and §0 is a no-op on an untouched '
    + 'body while refusing both a body a later patch has moved and a body whose declare list has grown.');
  return 0;
}

const RUN_DIRECTLY = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tests/hr-state-of-final-body.mjs');
if (RUN_DIRECTLY) {
  main().then((c) => process.exit(c)).catch((e) => {
    if (e && e.harness) { console.error(`hr-state-of-final-body: HARNESS — ${e.message}`); process.exit(2); }
    console.error(e); process.exit(2);
  });
}
