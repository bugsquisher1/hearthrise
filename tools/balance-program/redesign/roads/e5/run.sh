#!/usr/bin/env bash
# tools/balance-program/redesign/roads/e5/run.sh — WHAT A BORROWED HEAL IS WORTH UNDER THE HEAL RULE (systems, lane/e5-borrowing, 2026-11-27;
# docs/design/redesign/19-power-ledger.md L6 and V4, 17-talent-tree.md section 3, 20-v030-the-roads.md E5: "Borrowed Greater Mend is 10 steps
# or less").
#
# The engine's own borrow (v1-climb --borrowed -> heroSetup `borrowed` -> src/core/hunt/talent-rows.js lend: the native weapon's blow, the
# heal on Mend's clock, Magic at Mend's rate, an ally row's native 7 tiles), no build. Signature-depth's cell (run.sh there): the ground's
# REFERENCE company, MID kits at Level 60, v1-climb's `base` cell, Steady, 8 h, paced from hour 4, 12 seeds paired on the same dice
# (seeds 1000 up). Two fours, each against itself with nothing borrowed:
#   M  the mixed four (hammer, bow, mage, healer), the hammer borrows: 19 V4's own cell, a second healer beside the specialist
#   N  no healer (hammer, bow, mage, sword), the sword borrows: 17 section 3's V0 cell, the four that lacks the move, where it is worth most
# Each move at full power (its V0, the band it falls in) and at its band's penalty (what a town lends: the value a hero gets).
#
#   bash run.sh [step ...]     every step, or only the named ones
# W: workers (default 3). SEEDS (12), HOURS (8). OUT: where reports go (default this directory; a run from a snapshot of the tree writes
# back here). A step whose report exists is kept (resumable); FRESH=1 plays every step again. Read with sum.mjs.
set -e
HERE="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
ROOT="${ROOT:-$HERE/../../../../..}"
OUT="${OUT:-$HERE}"
V1="$ROOT/tools/balance-program/redesign/v1-climb.mjs"
W="${W:-3}"; SEEDS="${SEEDS:-12}"; HOURS="${HOURS:-8}"
WANT=" $* "
run() {
  local name=$1 styles=$2; shift 2
  if [ "$WANT" != "  " ] && [[ "$WANT" != *" $name "* ]]; then return 0; fi
  if [ -z "$FRESH" ] && [ -s "$OUT/$name.json" ]; then return 0; fi
  echo "$(date +%H:%M:%S) $name" >&2
  node "$V1" --ground muster_barrows --level 60 --gear mid --only base:steady --styles "$styles" --seeds "$SEEDS" --hours "$HOURS" --workers "$W" "$@" \
    --json "$OUT/$name.json" > "$OUT/$name.txt" 2> "$OUT/$name.err"
}
run m-plain hammer,bow,mage,healer
run m-gm hammer,bow,mage,healer --borrowed greater_mend,-,-,-
run n-plain hammer,bow,mage,sword
run n-gm hammer,bow,mage,sword --borrowed -,-,-,greater_mend
run n-cr hammer,bow,mage,sword --borrowed -,-,-,circle_of_renewal
# the four with no healer at the bands' two prices (17: -30% for a V0 of 4 to 10, -50% for 10 to 20): what a price would leave, for the
# designer's call (Greater Mend's V0 is past the last band, so no price offers it by the rule; the M cell is already in band at full power)
run n-gm-500 hammer,bow,mage,sword --borrowed -,-,-,greater_mend@500
run n-gm-300 hammer,bow,mage,sword --borrowed -,-,-,greater_mend@300
# the designer's fourth band (lane/designer-greater-mend, 2026-11-27; 19 L6): V0 20 to 50 at -80% at a border town, not offered at Havora;
# -75% beside it for the curve, and the -80% price beside a healer (the M cell: what it is worth where a healer already stands)
run n-gm-200 hammer,bow,mage,sword --borrowed -,-,-,greater_mend@800
run n-gm-250 hammer,bow,mage,sword --borrowed -,-,-,greater_mend@750
run m-gm-200 hammer,bow,mage,healer --borrowed greater_mend@800,-,-,-
