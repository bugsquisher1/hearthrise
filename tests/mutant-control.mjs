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

import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir, availableParallelism, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const REGISTERED = [
  ['tests/goal-counters.mjs', '--mutate'],
  ['tests/world-tick-token-failclosed.mjs', '--selftest'],
  ['tests/world-tick-gather-widen.mjs', '--mutate'],
  ['tests/world-tick-presence-horizon.mjs', '--mutate'],
  ['tests/world-tick-presence-signal.mjs', '--mutate'],
  ['tests/world-tick-scale.mjs', '--mutate'],
  ['tests/companion-equip-version-bump.mjs', '--mutate'],
  ['tests/world-tick-m4-party-horizon.mjs', '--mutate'],
  ['tests/world-tick-arm-combat.mjs', '--mutate'],
  ['tests/party-hunt-view.mjs', '--mutate'],
  ['tests/party-hunt-select-lockdown.mjs', '--mutate'],
  ['tests/discord-gift.mjs', '--mutate'],
  ['tests/progress-coalesce.mjs', '--mutate'],
];

/* HOW MANY CONTROLS AT ONCE. Each control is a full PGlite chain replay. Four of
   them at once killed the 2-core / 7 GB hosted runner (db-replay-7 "runner has
   received a shutdown signal", exit 143, ~3 min in — runs 38114515222,
   38117913634), so the pool is derived from the machine, never four blind:
     HR_MC_POOL (or the older HR_MUTANT_CONTROL_JOBS) ≥ 1 → exactly that;
     CI set → 1 (a hosted runner is shared with the job's other steps);
     else min(4, cores, half of RAM ÷ one control's peak budget), ≥ 1.
   MEASURED 2026-10-11 (process.resourceUsage().maxRSS of each control run alone,
   Windows, 47.8 GB / 20 cores): goal-counters 21,492 MB (it grows to whatever
   heap ceiling the box allows), world-tick-token-failclosed 1,752, every other
   arm 958–1,092. The budget is 8 GB a control: this box fits 2 at a time
   (goal-counters beside the rest), a 16 GB box fits 1. */
export const CONTROL_PEAK_BYTES = 8 * 1024 * 1024 * 1024;
export function controlPool(env = process.env, mem = totalmem(), cores = availableParallelism()) {
  const forced = Math.floor(Number(env.HR_MC_POOL || env.HR_MUTANT_CONTROL_JOBS));
  if (forced >= 1) return { n: forced, why: 'HR_MC_POOL override' };
  if (env.CI) return { n: 1, why: 'CI is set — one control at a time' };
  const byMem = Math.floor((mem / 2) / CONTROL_PEAK_BYTES);
  const n = Math.max(1, Math.min(4, cores, byMem));
  return { n, why: `${cores} cores, ${(mem / 2 ** 30).toFixed(1)} GB RAM fits ${byMem} at ${CONTROL_PEAK_BYTES / 2 ** 20} MB each` };
}

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

function runControlAsync(file, flag) {
  return new Promise((done) => {
    let out = '';
    let err = '';
    const child = spawn(process.execPath, [resolve(ROOT, file), flag], {
      cwd: ROOT,
      env: { ...process.env, HR_MUTANT_CONTROL: '1', HR_REPLAY_SCOPE_CONTROL: '' },
    });
    child.stdout.on('data', (b) => { out += b; });
    child.stderr.on('data', (b) => { err += b; });
    child.on('error', (e) => done(`${out}\n${err}\n${e.message}`));
    child.on('close', () => done(`${out}\n${err}`));
  });
}

async function selftest() {
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
  /* The pool: one at a time on CI, more than one on a big quiet machine, one
     on a machine whose RAM cannot hold two controls, and the override wins. */
  const GB = 2 ** 30;
  for (const [name, env, mem, cores, want] of [
    ['CI=1 on the 2-core / 7 GB hosted runner', { CI: '1' }, 7 * GB, 2, (n) => n === 1],
    ['CI=true even on a 64 GB / 16-core box', { CI: 'true' }, 64 * GB, 16, (n) => n === 1],
    ['local 32 GB / 16 cores', {}, 32 * GB, 16, (n) => n > 1 && n <= 4],
    ['local, RAM too small for two', {}, 2 * CONTROL_PEAK_BYTES + 1, 16, (n) => n === 1],
    ['local, one core', {}, 64 * GB, 1, (n) => n === 1],
    ['HR_MC_POOL=3 under CI', { CI: '1', HR_MC_POOL: '3' }, 7 * GB, 2, (n) => n === 3],
  ]) {
    const { n } = controlPool(env, mem, cores);
    const okay = want(n);
    if (!okay) bad += 1;
    console.log(`  ${okay ? '✓' : '✗'} pool, ${name} → ${n}`);
  }
  /* And end to end through a spawned file, so the env switch is proven to reach it. */
  const fake = join(tmpdir(), `hr-mutant-control-fake-${process.pid}.mjs`);
  writeFileSync(fake, "console.log('[mutants] 1');\n"
    + "console.log(`[mutant] X ${process.env.HR_MUTANT_CONTROL ? 'survived' : 'caught'}`);\n");
  const leaky = join(tmpdir(), `hr-mutant-control-leaky-${process.pid}.mjs`);
  writeFileSync(leaky, "console.log('[mutants] 1');\nconsole.log('[mutant] X caught');\n");
  try {
    // Through the SAME spawner the real run uses, so the env switch is proven to reach it.
    const a = judgeControl(await runControlAsync(fake, '--mutate')).length === 0;
    const b = judgeControl(await runControlAsync(leaky, '--mutate')).length > 0;
    console.log(`  ${a ? '✓' : '✗'} spawned honest guard → green`);
    console.log(`  ${b ? '✓' : '✗'} spawned guard that ignores the control → RED`);
    if (!a) bad += 1;
    if (!b) bad += 1;
  } finally { try { unlinkSync(fake); } catch {} try { unlinkSync(leaky); } catch {} }
  return bad;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) {
    console.log('mutant-control --selftest — every lie a control can tell is judged RED');
    const bad = await selftest();
    if (bad) { console.log(`\nmutant-control --selftest: RED — ${bad} case(s) misjudged`); process.exit(1); }
    console.log('\nmutant-control --selftest: green');
    process.exit(0);
  }
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const set = only.length ? REGISTERED.filter(([f]) => only.some((o) => f.endsWith(o.replace(/\\/g, '/')))) : REGISTERED;
  if (!set.length) { console.log('mutant-control: no registered guard matched'); process.exit(2); }
  /* The controls are independent processes (each plants into its own temp copy or
     into memory, never the tree), so locally they run controlPool() at a time;
     on CI one by one (404 s on db-replay-7, run 38076651907 — slow but alive;
     in parallel the runner was killed). Each verdict is printed
     whole when its guard finishes; the judgement per guard is unchanged. */
  const { n: jobs, why } = controlPool();
  console.log(`mutant-control: ${set.length} guard(s), ${jobs} at a time (${why})`);
  let red = 0;
  const queue = [...set];
  await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    while (queue.length) {
      const [file, flag] = queue.shift();
      const t0 = Date.now();
      const problems = judgeControl(await runControlAsync(file, flag));
      const s = ((Date.now() - t0) / 1000).toFixed(1);
      if (problems.length) {
        red += 1;
        console.log(`  ✗ ${file} ${flag} under HR_MUTANT_CONTROL=1 (${s} s)`
          + problems.map((p) => `\n      ${p}`).join(''));
      } else console.log(`  ✓ ${file} ${flag} — every arm survives with nothing planted (${s} s)`);
    }
  }));
  if (red) { console.log(`\nmutant-control: RED — ${red} guard(s) have arms that are not their mutant's`); process.exit(1); }
  console.log('\nmutant-control: green — every registered arm is caught only when planted.');
}
