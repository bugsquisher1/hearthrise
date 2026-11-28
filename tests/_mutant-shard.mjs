// ════════════════════════════════════════════════════════════════════════
// tests/_mutant-shard.mjs — A PAGE SUITE'S MUTANTS CUT ROUND-ROBIN OVER --shard=K/N JOBS. Pure, no imports.
//
// tests/character-window.mjs (47 mutants, one ~52 s page boot each: 40.5 min in one command, in-page-25 at 50.8 of 55 min on
// run 46138211972) and tests/phone-touch.mjs (156 mutants and a 5.8 min clean control, in-page-40 at 34.7 of 45 on run
// 46132371081) each run `--mutate --shard=K/N`: every Nth mutant from the Kth, the order of the guard's own MUTANTS literal,
// so the N shards hold every mutant once. The dealing rule lives here, once, because tests/page-mutant-shards.mjs deals the
// same literal (read from the guard's source) to check that smoke.yml's shards hold every mutant exactly once.
//
// Round-robin, not balanced by measured time like tests/hunt-screen.mjs: both lists cost about the same per mutant along
// their length (character-window 47-62 s, one 117 s; phone-touch's 43-53 s PH-27 run sits together, so the cut spreads it),
// and the measured cut was 20.5 / 20.0 and 9.7 / 10.6 min (lane/ci-inpage-shard, 2026-11-28).
//
// Every shard runs its own clean control, gated or not: the suites pass controlArgv() to cleanControl, so a shard is judged
// as the unsharded run was (tests/_mutant-verdict.mjs skipsShardControl leans a gated shard on the plain run; these do not).
// ════════════════════════════════════════════════════════════════════════

/** ` --shard=K/N` on a smoke.yml command line. */
export const SHARD_FLAG = /(?:^|\s)--shard=(\d+)\/(\d+)(?=\s|$)/;

/** argv's --shard=K/N: { k, n }, null when absent, or { bad } when malformed (K outside 1..N). */
function parseShard(argv) {
  const a = argv.find((x) => x.startsWith('--shard'));
  if (!a) return null;
  const m = /^--shard=(\d+)\/(\d+)$/.exec(a);
  return m && +m[1] >= 1 && +m[1] <= +m[2] ? { k: +m[1], n: +m[2] } : { bad: a };
}

/** A shard's share of a list: every Nth item from the Kth (sh null: the whole list). */
export const shardOf = (list, sh) => (sh ? list.filter((_, i) => i % sh.n === sh.k - 1) : list);

/**
 * The mutants this process plants: { list, sh, tag, line } or { harness } (a malformed flag, or a shard that holds none:
 * a job that proves nothing must never read as green). `list` is still to be narrowed by scopedMutants on a gated push.
 */
export function mutantShard(guard, mutants, argv = process.argv) {
  const sh = parseShard(argv);
  if (sh && sh.bad) return { harness: `HARNESS: bad ${sh.bad} (want --shard=K/N, 1 <= K <= N)` };
  const list = shardOf(mutants, sh);
  if (!list.length) return { harness: `HARNESS: --shard=${sh.k}/${sh.n} holds none of ${guard}'s ${mutants.length} mutants` };
  return { list, sh, tag: sh ? ` (shard ${sh.k}/${sh.n})` : '', line: sh ? `  shard ${sh.k}/${sh.n}: ${list.length} of ${mutants.length} mutants` : null };
}

/** argv with no --shard flag: the clean control judges a shard as the unsharded run, so it never leans on another job. */
export const controlArgv = (argv = process.argv) => argv.filter((x) => !x.startsWith('--shard'));
