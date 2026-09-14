#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hr-apply-final-body.mjs — WHERE hr_apply's LIVE TEXT LIVES, AND THE
//                                 PROOF THAT ITS RESTATEMENT'S PINS BITE.
//
//   node tests/hr-apply-final-body.mjs             the guard
//   node tests/hr-apply-final-body.mjs --selftest  every mutation must be CAUGHT
//   node tests/hr-apply-final-body.mjs --list      the mutation catalogue
//
// Two jobs in one file, because they are the same knowledge:
//
//   1. THE CONSTANTS the guards that PLANT INTO hr_apply import, so the answer to
//      "which file owns the body today?" exists in ONE place instead of in each
//      guard's private `const MIG`.
//   2. THE MUTATION PROOF for 2026-09-14-hr-apply-restatement.sql's §0 and §3(a),
//      which are the two assertions standing between a restatement and silently
//      discarding somebody's work. Security asked for it by name (C1/C2,
//      2026-09-14) and it belongs here rather than in the migration, which is
//      applied once and then byte-frozen.
//
// ── THE FINAL-BODY RULE ─────────────────────────────────────────────────────
// A mutation proof must plant its defect in the file that owns the text the
// database ACTUALLY RUNS. For a body assembled by anchored patches that is the
// LAST file to touch it; every earlier file's contribution is overwritten by
// whatever comes after. tests/buff-queue.mjs learned this the hard way on
// 2026-09-13 — an arm that mutated text a later file re-splices scored HARNESS
// instead of the tick it earned — and its header states the rule.
//
// 2026-09-14-hr-apply-restatement.sql RESTATES hr_apply whole and runs LAST, so
// it now owns every line of that body. An arm that still plants into
// 2026-09-12-renown-high-projection.sql or 2026-09-13-consumable-buffs.sql is
// mutating a draft: the restatement replaces it a few files later and the arm is
// VACUOUS. Point the arm HERE instead.
//
// ── WHY THAT IS LOUD RATHER THAN SILENT ─────────────────────────────────────
// The restatement's §0 PINS the code hash of the body it replaces and REFUSES to
// apply over a body it cannot name (a restatement applied over drift silently
// DISCARDS the drift — the one failure mode unique to that migration shape). So
// an arm left pointing at an earlier file does not quietly stop biting: the chain
// refuses and the arm reads "THE REPO CANNOT REBUILD THE DATABASE". That is the
// desired failure — a stale anchor cannot rot unnoticed — and the fix is always
// the same: re-point the arm at S3_BLIND's file.
//
// ── THE BLINDS ──────────────────────────────────────────────────────────────
// Once an arm plants HERE, the restatement's own §3 self-check sees a body that
// is not the one the file states it installs and raises at apply time. That is
// correct behaviour and it is also a gate — so in GATE-BLIND mode (the run whose
// job is to prove THIS GUARD sees the defect, not that some migration can raise)
// it is short-circuited, exactly the way tests/buff-queue.mjs blinds the buff
// files' §-checks and tests/renown-projection.mjs blinds cellar-scale's §3.
// The PLAIN arm keeps running the whole chain honestly, which is where "the
// migration would have caught it too" is demonstrated.
//
// S0_BLIND is for the rarer case: an arm that must keep planting into an EARLIER
// file (it is proving something about that file's own patcher, not about the
// resulting body). Blinding §0's predecessor pin lets that arm run — but read the
// final-body rule again first, because such an arm is usually vacuous anyway.
//
// Exit: 0 green · 1 an assertion failed · 2 harness.
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootReplay } from './schema-replay.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));

/** The migration that owns hr_apply's live text. */
export const HR_APPLY_FINAL = '2026-09-14-hr-apply-restatement.sql';

/** Short-circuit §3 (the post-install self-check). Anchored on the first
 *  statement of its `begin`, which is unique in the file. */
export const HR_APPLY_S3_BLIND = [
  "begin\n  v_def  := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');",
  "begin\n  return;  -- §3 SHORT-CIRCUITED FOR A MUTATION PROOF (tests/hr-apply-final-body.mjs)\n"
  + "  v_def  := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');",
];

/** Short-circuit §0 (the predecessor pin + the dead-declaration proof). */
export const HR_APPLY_S0_BLIND = [
  '  if to_regprocedure(c_sig) is null then',
  '  return;  -- §0 SHORT-CIRCUITED FOR A MUTATION PROOF (tests/hr-apply-final-body.mjs)\n'
  + '  if to_regprocedure(c_sig) is null then',
];

/* Blind ONLY §3(a)'s hash pin, leaving the marker sweep armed. The pin is a
   statement about the WHOLE body, so it fires on any mutation and would mask
   every marker arm behind it — see `section_commented_out` vs `section_deleted`,
   which are the same defect measured with the pin off and on. */
const S3_PIN_BLIND = [
  '  if md5(v_code) <> c_code_after then',
  '  if false then  -- §3(a) HASH PIN BLINDED FOR THE MUTATION PROOF (tests/hr-apply-final-body.mjs)',
];

/* Blind ONLY §0's PREDECESSOR pin, leaving the dead-declaration proof armed.
   Same reason as S3_PIN_BLIND: the pin is a statement about the whole body, so
   on a mutated predecessor it fires first and the arm below it would be labelled
   a lie (MEASURED — `dead_proof_off` scored "caught by the predecessor pin"). */
const S0_PIN_BLIND = [
  '  elsif md5(v_code) <> c_code_before then',
  '  elsif false then  -- §0 PREDECESSOR PIN BLINDED FOR THE MUTATION PROOF (tests/hr-apply-final-body.mjs)',
];

const harness = (m) => { const e = new Error(m); e.harness = true; return e; };

/* ── THE MUTATION CATALOGUE ───────────────────────────────────────────────
   Each plants a REAL defect into the REAL migration text and names the
   assertion that must catch it. `expect` is matched against the raised message,
   so an arm cannot pass because SOMETHING went wrong. */
const MUTATIONS = {
  section_commented_out: {
    by: '§3(a) markers',
    why: 'SECURITY C1. A whole section is COMMENTED OUT rather than deleted — here the per-character '
       + 'advisory lock, i.e. every concurrent apply for one character stops being serialised. The '
       + 'text is still in pg_get_functiondef, so the first draft of §3(a) (which matched against '
       + 'v_def) would have found its marker and passed. Matching v_code is what sees it.',
    pairs: [
      ["  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));",
        "  -- perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));"],
      S3_PIN_BLIND,
    ],
    expect: 'DROPPED a section',
  },
  section_deleted_pin_armed: {
    by: '§3(a) hash pin',
    why: 'the same defect with the pin NOT blinded: the whole-body hash is the strong half and must '
       + 'fire first, so a body that is not the one this file states it installs never reaches the '
       + 'marker sweep at all',
    pairs: [
      ["  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));",
        "  -- perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));"],
    ],
    expect: 'not the one this file states it installs',
  },
  banner_removed: {
    by: '§3(a) banner',
    why: 'the restatement banner is deleted from the body — the line a future author meets before '
       + 'reaching for replace()-and-execute again. It is a COMMENT, so it is checked against v_def '
       + 'and not smuggled into the marker array, and that distinction is the arm',
    pairs: [
      ['-- hr_apply restated 2026-09-14 (2026-09-14-hr-apply-restatement.sql) — chain depth 0.',
        '-- (banner removed for the mutation proof)'],
      S3_PIN_BLIND,
    ],
    expect: 'restatement banner is gone',
  },
  predecessor_pin_wrong: {
    by: '§0 predecessor pin',
    why: 'the file is applied over a body it was not cut from (simulated by moving the constant). A '
       + 'restatement that installs anyway DISCARDS whatever made the two differ, with no error and '
       + 'no trace — the one failure mode unique to this migration shape',
    pairs: [
      ["  c_code_before constant text := '3f0c3a95621d3132bebb85c2f16df333';",
        "  c_code_before constant text := '00000000000000000000000000000000';"],
    ],
    expect: 'NEITHER the body this file was cut from',
  },
  dead_proof_off: {
    by: '§0 dead-declaration proof',
    why: 'the predecessor is patched so that `v_buff_old` IS read before this file removes it. The '
       + "removal would then be a behaviour change, and §0's count must refuse the whole migration "
       + 'rather than take the author\'s word that the declaration was dead',
    files: [
      ['2026-09-13-buff-segments.sql', [['      v_buff_newmag := v_buff_mag;',
        "      v_buff_newmag := coalesce((v_buff_old->>'magnitude')::numeric, v_buff_mag);"]]],
      [HR_APPLY_FINAL, [S0_PIN_BLIND]],
    ],
    expect: 'v_buff_old occurs',
  },
};

/* The NEGATIVE CONTROL. A comment-only edit to the file's own prose is not a
   defect; if the chain refuses on it, the pins are reading text they should not. */
const NEGATIVE_CONTROL = [
  '-- ── §2 THE GRANT POSTURE ────────────────────────────────────────────────────',
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
async function rerunS0(db, sql) {
  const a = sql.indexOf('do $pre$');
  const b = sql.indexOf('$pre$;', a) + '$pre$;'.length;
  if (a < 0 || b < 6) throw harness('could not extract §0 from the migration');
  await db.exec(sql.slice(a, b));
}

async function main() {
  const argv = process.argv.slice(2);
  const path = join(ROOT, 'supabase', 'migrations', HR_APPLY_FINAL);
  const sql = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');

  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(26)} ${m.by.padEnd(22)} ${m.why}`);
    return 0;
  }

  /* ── THE FLOOR ─────────────────────────────────────────────────────────
     Every anchor must be present EXACTLY once, and the clean chain must apply.
     A mutation planted into a tree that is already red proves nothing. */
  let failed = 0;
  const ok = (cond, msg) => { if (!cond) { failed += 1; console.error(`  FAIL  ${msg}`); } };

  ok(sql.includes(HR_APPLY_S3_BLIND[0]), 'S3_BLIND anchor is not in the migration — the blind other guards import is dead');
  ok(sql.includes(HR_APPLY_S0_BLIND[0]), 'S0_BLIND anchor is not in the migration — the blind other guards import is dead');
  ok(sql.split(S3_PIN_BLIND[0]).length - 1 === 1, "§3(a)'s hash-pin gate is not in the migration exactly once");
  ok(sql.split(S0_PIN_BLIND[0]).length - 1 === 1, "§0's predecessor-pin gate is not in the migration exactly once");
  ok(/foreach v_item in array c_markers loop\s*\n\s*--[^\n]*\n\s*if strpos\(v_code, v_item\) = 0 then/.test(sql),
    '§3(a) no longer sweeps the markers against v_code (Security C1) — a comment would count as code');
  ok(/if md5\(v_code\) = c_code_after then/.test(sql),
    "§0's re-apply branch no longer keys on the CODE HASH (Security C2) — a banner-keyed skip would "
    + 'discard a future anchored patch');
  ok(!/strpos\(v_def, 'hr_apply restated 2026-09-14'\) > 0 then\s*\n\s*raise notice/.test(sql),
    "§0 still recognises a re-apply by the banner string");

  const cleanErr = await applies([]);
  ok(!cleanErr, `the CLEAN chain does not apply — ${String(cleanErr).split('\n')[0]}`);
  if (failed) { console.error(`\nhr-apply-final-body: ${failed} floor failure(s).`); return 1; }

  if (!argv.includes('--selftest')) {
    console.log('hr-apply-final-body: the restatement owns hr_apply, both blinds still anchor, §3(a) '
      + 'sweeps the comment-STRIPPED text and §0 recognises a re-apply by code hash, not by a banner.');
    return 0;
  }

  // ── THE MUTATIONS ───────────────────────────────────────────────────────
  console.log('hr-apply-final-body --selftest: clean floor green, then every mutation must RAISE');
  let missed = 0;
  for (const [id, m] of Object.entries(MUTATIONS)) {
    /* ONE DEFECT, SOMETIMES TWO FILES: a predecessor mutation has to blind the
       restatement's §0 pin in the SAME run, or the pin answers for it. */
    const err = await applies(m.files
      ? m.files.map(([f, ps]) => [f, ps.map((p) => p.slice())])
      : [[HR_APPLY_FINAL, m.pairs.map((p) => p.slice())]]);
    if (!err) { console.error(`  MISSED  ${id} — ${m.why}`); missed += 1; continue; }
    if (!err.includes(m.expect)) {
      console.error(`  WRONG   ${id} — raised, but not by ${m.by}: ${err.split('\n').slice(0, 2).join(' ')}`);
      missed += 1; continue;
    }
    console.log(`  ok      ${id} — CAUGHT by ${m.by}`);
  }
  const ctrl = await applies([[HR_APPLY_FINAL, [NEGATIVE_CONTROL.slice()]]]);
  if (ctrl) { console.error(`  FAIL    negative control (comment-only) refused: ${String(ctrl).split('\n')[0]}`); missed += 1; }
  else console.log('  ok      negative control (comment-only): applied, as required');

  /* ── §0's RE-APPLY BRANCH, DRIVEN (Security C2) ────────────────────────
     Not a file mutation: the point is what §0 does when it meets a body that
     was patched AFTER the restatement landed, which is what a re-apply on a
     production that has since taken a hotfix looks like. */
  const { db } = await bootReplay();
  try {
    await rerunS0(db, sql);
    console.log('  ok      re-apply on an UNTOUCHED body: §0 is a no-op, as required');
  } catch (e) {
    console.error(`  FAIL    re-apply on an untouched body raised: ${String(e.message).split('\n')[0]}`);
    missed += 1;
  }
  await db.exec(`do $probe$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure);
  v_def := replace(v_def, 'c_max_gold_delta   constant bigint := 50000000;',
                          'c_max_gold_delta   constant bigint := 60000000;');
  execute v_def;
end $probe$;`);
  let caught = null;
  try { await rerunS0(db, sql); } catch (e) { caught = String(e.message); }
  if (caught && caught.includes('NEITHER the body this file was cut from')) {
    console.log('  ok      re-apply after a LATER anchored patch: §0 refuses, as required');
  } else {
    console.error(`  MISSED  §0 would have DISCARDED a later anchored patch on re-apply — ${caught || 'it did not raise'}`);
    missed += 1;
  }
  await db.close?.();

  if (missed) {
    console.error(`\nhr-apply-final-body --selftest: ${missed} arm(s) not caught. A guard that has never `
      + 'been red is not a guard.');
    return 1;
  }
  console.log(`\nhr-apply-final-body --selftest PASSED — ${Object.keys(MUTATIONS).length} mutations caught by the `
    + 'assertion written for each, a comment-only control stayed green, and §0 is a no-op on an '
    + 'untouched body while refusing a body a later patch has moved.');
  return 0;
}

const RUN_DIRECTLY = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tests/hr-apply-final-body.mjs');
if (RUN_DIRECTLY) {
  main().then((c) => process.exit(c)).catch((e) => {
    if (e && e.harness) { console.error(`hr-apply-final-body: HARNESS — ${e.message}`); process.exit(2); }
    console.error(e); process.exit(2);
  });
}
