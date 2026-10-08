#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/mutant-control.mjs — EVERY MUTANT MUST SURVIVE WHEN NOTHING IS PLANTED
//
//   node tests/mutant-control.mjs              # the control, every registered guard
//   node tests/mutant-control.mjs <file> ...   # only those guards
//   node tests/mutant-control.mjs --selftest   # the helper's own mutation proof
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
// A mutation proof says "arm X is caught". That sentence carries information
// only if arm X is NOT caught when its defect is absent. Measured 2026-10-07:
// world-tick-token-failclosed's MF2 read "caught" on the unpatched file (the
// gate it removed was unreachable behind another one), and goal-counters'
// 13 JS mutants could not be controlled at all — HR_REPLAY_SCOPE_CONTROL drops
// SQL patches only. Nothing ran either control; a person had to think of it.
//
// ── THE PROTOCOL ────────────────────────────────────────────────────────
// A registered guard, run with its proof flag:
//   · prints `[mutants] N` once, then `[mutant] <id> caught|survived` per arm;
//   · under HR_MUTANT_CONTROL=1 plants NOTHING and keeps every scope
//     (tests/schema-replay.mjs bootReplay drops SQL patches; JS-mutant guards
//     load an unmutated copy in their own loader).
// This helper runs each guard under the control and is RED unless it printed
// exactly N arm lines and every one reads `survived`. The REAL run (every arm
// caught) is the guard's own CI step; this file adds only the half nobody ran.
//
// Register a guard here once it speaks the protocol.
// ════════════════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const REGISTERED = [
  ['tests/goal-counters.mjs', '--mutate'],
  ['tests/world-tick-token-failclosed.mjs', '--selftest'],
  ['tests/world-tick-gather-widen.mjs', '--mutate'],
  ['tests/world-tick-presence-horizon.mjs', '--mutate'],
  ['tests/world-tick-scale.mjs', '--mutate'],
  ['tests/companion-equip-version-bump.mjs', '--mutate'],
  ['tests/world-tick-m4-party-horizon.mjs', '--mutate'],
  ['tests/world-tick-arm-combat.mjs', '--mutate'],
];

/** Parse a guard's control-run output. Returns the list of problems (empty = honest). */
export function judgeControl(out) {
  const problems = [];
  const decl = [...out.matchAll(/^\[mutants\] (\d+)\s*$/gm)];
  const arms = [...out.matchAll(/^\[mutant\] (\S+) (caught|survived)\s*$/gm)];
  if (decl.length !== 1) problems.push(`expected one "[mutants] N" line, saw ${decl.length} — the guard does not speak the protocol`);
  const n = decl.length ? Number(decl[0][1]) : NaN;
  if (!(n > 0)) problems.push('declared no arms');
  if (arms.length !== n) problems.push(`declared ${n} arms, reported ${arms.length} — an arm crashed or was skipped under the control`);
  for (const [, id, v] of arms) {
    if (v === 'caught') problems.push(`${id} reads CAUGHT with nothing planted — it is caught by something other than its mutant`);
  }
  return problems;
}

function runControl(file, flag) {
  const r = spawnSync(process.execPath, [join(ROOT, file), flag], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, HR_MUTANT_CONTROL: '1', HR_REPLAY_SCOPE_CONTROL: '' },
  });
  return `${r.stdout || ''}\n${r.stderr || ''}`;
}

function selftest() {
  /* Fake guards, one per way a control can lie. Each must be judged as stated. */
  const cases = [
    ['honest: every arm survives', '[mutants] 2\n[mutant] A survived\n[mutant] B survived\n', true],
    ['vacuous arm: caught with nothing planted', '[mutants] 2\n[mutant] A survived\n[mutant] B caught\n', false],
    ['crash after the first arm', '[mutants] 2\n[mutant] A survived\n', false],
    ['no protocol at all', 'All 2 planted defects were caught.\n', false],
    ['zero arms declared', '[mutants] 0\n', false],
  ];
  let bad = 0;
  for (const [name, out, honest] of cases) {
    const p = judgeControl(out);
    const okay = (p.length === 0) === honest;
    if (!okay) bad += 1;
    console.log(`  ${okay ? '✓' : '✗'} ${name} → ${p.length ? 'RED' : 'green'}`);
  }
  /* And end to end through a spawned file, so the env switch is proven to reach it. */
  const fake = join(tmpdir(), `hr-mutant-control-fake-${process.pid}.mjs`);
  writeFileSync(fake, "console.log('[mutants] 1');\n"
    + "console.log(`[mutant] X ${process.env.HR_MUTANT_CONTROL ? 'survived' : 'caught'}`);\n");
  const leaky = join(tmpdir(), `hr-mutant-control-leaky-${process.pid}.mjs`);
  writeFileSync(leaky, "console.log('[mutants] 1');\nconsole.log('[mutant] X caught');\n");
  try {
    const run = (f) => judgeControl(spawnSync(process.execPath, [f], {
      encoding: 'utf8', env: { ...process.env, HR_MUTANT_CONTROL: '1' } }).stdout);
    const a = run(fake).length === 0;
    const b = run(leaky).length > 0;
    console.log(`  ${a ? '✓' : '✗'} spawned honest guard → green`);
    console.log(`  ${b ? '✓' : '✗'} spawned guard that ignores the control → RED`);
    if (!a) bad += 1;
    if (!b) bad += 1;
  } finally { try { unlinkSync(fake); } catch {} try { unlinkSync(leaky); } catch {} }
  return bad;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--selftest')) {
    console.log('mutant-control --selftest — every lie a control can tell is judged RED');
    const bad = selftest();
    if (bad) { console.log(`\nmutant-control --selftest: RED — ${bad} case(s) misjudged`); process.exit(1); }
    console.log('\nmutant-control --selftest: green');
    process.exit(0);
  }
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const set = only.length ? REGISTERED.filter(([f]) => only.some((o) => f.endsWith(o.replace(/\\/g, '/')))) : REGISTERED;
  if (!set.length) { console.log('mutant-control: no registered guard matched'); process.exit(2); }
  let red = 0;
  for (const [file, flag] of set) {
    const t0 = Date.now();
    const problems = judgeControl(runControl(file, flag));
    const s = ((Date.now() - t0) / 1000).toFixed(1);
    if (problems.length) {
      red += 1;
      console.log(`  ✗ ${file} ${flag} under HR_MUTANT_CONTROL=1 (${s} s)`);
      for (const p of problems) console.log(`      ${p}`);
    } else console.log(`  ✓ ${file} ${flag} — every arm survives with nothing planted (${s} s)`);
  }
  if (red) { console.log(`\nmutant-control: RED — ${red} guard(s) have arms that are not their mutant's`); process.exit(1); }
  console.log('\nmutant-control: green — every registered arm is caught only when planted.');
}
