#!/usr/bin/env bash
# tools/balance-program/redesign/signature-depth/pace-step/run.sh — THE PACE A HELD STEP BUYS, CELL BY CELL (game designer,
# lane/pace-step-per-ground, 2026-11-28; docs/design/redesign/15-signature-candidates.md "Decision: the pace step, cell by cell").
#
# Every cell a Signature is read on (batch2.sh, batch3.sh, batch4.sh: its seat's reference four, MID kits at the ground's refLevel, Steady,
# 8 h, held from hour 4, seeds 1000 up), played plain and under a lever that moves depth only: defense-k<K>.json, every blow at every hero
# K power steps lower (a candidate's line edit on a scratch copy; the companies are the tree's). The paired held move and the paired pace
# move (v1-climb payX.exact, %) on the same seeds give the cell's pace a held step buys (../pace-step.mjs reads the reports).
#
#   bash run.sh [step ...]     every step, or only the named ones
# W (default 2), SEEDS (default 24), HOURS (8), OUT (default this directory). A step whose report exists is kept; FRESH=1 plays it again.
set -e
HERE="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
ROOT="${ROOT:-$HERE/../../../../..}"
OUT="${OUT:-$HERE}"
V1="$ROOT/tools/balance-program/redesign/v1-climb.mjs"
W="${W:-2}"; SEEDS="${SEEDS:-24}"; HOURS="${HOURS:-8}"
WANT=" $* "
run() {
  local name=$1 g=$2 l=$3 styles=$4; shift 4
  if [ "$WANT" != "  " ] && [[ "$WANT" != *" $name "* ]]; then return 0; fi
  if [ -z "$FRESH" ] && [ -s "$OUT/$name.json" ]; then return 0; fi
  echo "$(date +%H:%M:%S) $name" >&2
  node "$V1" --ground "$g" --level "$l" --gear mid --only base:steady --styles "$styles" --seeds "$SEEDS" --hours "$HOURS" --workers "$W" "$@" \
    --json "$OUT/$name.json" > "$OUT/$name.txt" 2> "$OUT/$name.err"
}
T=tank,bow,mage,healer; S=sword,bow,mage,healer; A=axes,bow,mage,healer; X=hammer,bow,mage,healer; C=hammer,crossbow,mage,healer
# one line a cell: plain, then the lever at 10 and 20 steps (two sizes: the fit runs through the origin and the two say whether it is a line)
cell() { local id=$1 g=$2 l=$3 st=$4; run ps-$id-plain $g $l $st; for k in 10 20; do run ps-$id-k$k $g $l $st --candidate "$HERE/defense-k$k.json"; done; }
cell muster-mixed   muster_barrows 60 $X
cell muster-tank    muster_barrows 60 $T
cell muster-lone    muster_barrows 60 sword
cell carters-mixed  carters_rest 117 $X
cell pyre-mixed     pyre_field 80 $X
cell pyre-sword     pyre_field 80 $S
cell roost-crossbow wyvern_roost 140 $C
cell slake-mixed    the_slake 57 $X
cell slake-lone     the_slake 57 sword
cell krell-mixed    krells_hold 97 $X
cell ox-mixed       ox_road 120 $X
cell bone-mixed     catacomb_bone_wing 175 $X
cell flood-axes     catacomb_flooded_wing 160 $A
cell hask-mixed     hasks_ford 52 $X
