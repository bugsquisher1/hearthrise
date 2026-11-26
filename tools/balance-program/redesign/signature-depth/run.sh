#!/usr/bin/env bash
# tools/balance-program/redesign/signature-depth/run.sh — THE DEPTH A SIGNATURE BUYS, THE SAMPLE OF 5 (systems, lane/signatures-sample, 2026-11-26;
# docs/design/redesign/15-signature-candidates.md "Decision: count and size", 29-tuning-pass.md section 3.8, 12-targets.md 8.1 step 1).
#
# Each Signature on its seat's strong four (BIS at the ground's top Level, v1-climb's `back` cell, Steady, held from hour 4, as trait-depth)
# against the same four with none, on the same dice (seeds 1000 up): the held step's delta is its size (target 10 +- 3 own steps). The four
# is the matrix's mixed four with the Signature's seat in it (a tank four for the tank, a sword four for the sword).
# W: workers (default 3). SEEDS, HOURS (default 4, 8). A step whose report exists is kept (resumable); FRESH=1 plays every step again.
set -e
HERE="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
ROOT="$HERE/../../../.."
V1="$ROOT/tools/balance-program/redesign/v1-climb.mjs"
W="${W:-3}"; SEEDS="${SEEDS:-4}"; HOURS="${HOURS:-8}"
run() {
  local g=$1 l=$2 styles=$3 name=$4; shift 4
  if [ -z "$FRESH" ] && [ -s "$HERE/$name.json" ]; then return 0; fi
  node "$V1" --ground "$g" --level "$l" --gear bis --only back:steady --styles "$styles" --seeds "$SEEDS" --hours "$HOURS" --workers "$W" "$@" \
    --json "$HERE/$name.json" > "$HERE/$name.txt" 2> "$HERE/$name.err"
}
run muster_barrows 75 hammer,bow,mage,healer muster-mixed
run muster_barrows 75 hammer,bow,mage,healer muster-wood-book --signatures -,-,the_wood_book,-
run muster_barrows 75 hammer,bow,mage,healer muster-apron --signatures -,-,-,brewers_apron
run muster_barrows 75 tank,bow,mage,healer muster-tank
run muster_barrows 75 tank,bow,mage,healer muster-cairn-belt --signatures cairn_belt,-,-,-
run muster_barrows 75 sword,bow,mage,healer muster-sword
run muster_barrows 75 sword,bow,mage,healer muster-blade --signatures barrow_knights_blade,-,-,-
run pyre_field 90 hammer,bow,mage,healer pyre-mixed
run pyre_field 90 hammer,bow,mage,healer pyre-collar --signatures -,lurchers_collar,-,-
