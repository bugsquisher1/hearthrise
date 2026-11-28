// ════════════════════════════════════════════════════════════════════════
// tests/_utc-arms.mjs — THE UTC MIDNIGHT REPLAY'S ARMS AND PROOF UNITS, AND HOW A SHARD DEALS THEM. Pure, no imports.
//
// tests/utc-midnight-replay.mjs replays these; tests/utc-midnight-shards.mjs checks that smoke.yml's shards hold each one
// exactly once and that every job they run in fits its budget. They live apart from both so the replay guard does not load
// the workflow parser (tools/lib/guard-deps.mjs IMPORTS rule: a change to tests/run-ci-local.mjs would otherwise pick the
// whole replay, 14 chain replays, for a check that costs milliseconds), and so both read one list and one dealing rule.
// ════════════════════════════════════════════════════════════════════════

/* The sweep, in seconds of the FIXTURE's clock relative to midnight. It runs to
   +9 and not to +3 because the band the security review measured was not a
   boundary artefact: a 15-kill claim needs ≈6.9 s of window at the 600 ms kill
   floor, and a 40-kill one ≈18.5 s, so a fixture that re-acquires a literal
   magnitude goes red for the first several SECONDS of a day, not the first
   moment of it. The label is EXACT since 2026-10-11: the arm offset puts the
   target file's transaction on second k to the millisecond, and file i of the
   chain on k + (i − target) ms, so every arm also replays EVERY file of the
   chain within ±0.3 s of that second — on any machine, at any load. (Before,
   the label was only the intended second: ~1.2 s of jitter idle, tens of
   seconds loaded.) */
export const SWEEP = [-3, -2, -1, 0, 1, 2, 3, 5, 7, 9];

/* The fixed arms keep the coarse coverage the hand-measured window bought:
   00:02:30 and 00:04:30 sit inside [00:00, 00:05), the window of the FIVE-minute
   backdates, and 00:25:00 covers the THIRTY-minute ones
   (2026-09-02-renown-kill-faucet.sql lines 672/719). +3600 is the control. */
export const ARMS = [
  { name: 'replay at 00:02:30 UTC', off: 150, window: true },
  { name: 'replay at 00:04:30 UTC', off: 270, window: true },
  { name: 'replay at 00:25:00 UTC (covers the 30-minute fixture backdates)', off: 1500, window: true },
  { name: 'CONTROL — replay at 01:00:00 UTC (must be green)', off: 3600, window: false },
];

/** The plain run's arms in order, [label, offset]: the sweep (the probed fixture index turns a fixture second into an
    offset), then the fixed window arms. The control and the probe are not arms: every shard runs both. */
export const armsOf = (index) => SWEEP.map((k) => [`the fixture runs at midnight ${k >= 0 ? '+' : '−'}${Math.abs(k)} s`, k - index / 1000])
  .concat(ARMS.filter((x) => x.window).map((a) => [a.name, a.off]));

/* THE PROOF UNITS of --selftest, in the order a shard deals them. `full` counts a unit's whole-chain replays; the probe and
   an arm refused at the target file stop at file #120, seconds in. The two whole ones come first, so K/2 gives each half
   one: clamp + s1, pins + plant. */
export const PROOF_UNITS = [
  { name: 'clamp', full: 1 },   // un-anchor every §4 stamp: RED just after midnight, GREEN at 01:00 (a whole replay)
  { name: 'pins', full: 1 },    // a replay whose clock pins never land is HARNESS (a whole replay), and the verdict words
  { name: 's1', full: 0 },      // the S1 economy defect: RED at both, each stopped at the target file
  { name: 'plant', full: 0 },   // S-UM-2: a copy-mode chain is byte-identical, a one-byte flip is caught
];

/** A shard's share of a list: every Nth item from the Kth (sh null: the whole list). */
export const shardOf = (list, sh) => (sh ? list.filter((_, i) => i % sh.n === sh.k - 1) : list);

/** ` --shard=K/N` on a command line. */
export const SHARD_FLAG = /(?:^|\s)--shard=(\d+)\/(\d+)(?=\s|$)/;

/** argv's --shard=K/N: { k, n }, null when absent, or { bad } when malformed (K outside 1..N). */
export function parseShard(argv) {
  const a = argv.find((x) => x.startsWith('--shard='));
  if (!a) return null;
  const m = /^--shard=(\d+)\/(\d+)$/.exec(a);
  return m && +m[1] >= 1 && +m[1] <= +m[2] ? { k: +m[1], n: +m[2] } : { bad: a };
}
