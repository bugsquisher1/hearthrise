#!/usr/bin/env bash
# tools/balance-program/redesign/imbue/run.sh — I3, A FULL SET OF THREE THAT ALL FIRE (systems, lane/imbue-engine, 2026-11-27;
# docs/design/redesign/21-flame-temper-imbue-loot.md section 3.8 I3 and section 11.4: "Krell's Hold holds all three (the Edge on its
# brutes, the Ward on the back row, the Leech on the front), and its bar is 6 +- 2 pace steps there once the Leech heals").
#
# The designer's cells (21 section 11.4): v1-climb's `base` cell, the mixed four (hammer, bow, mage, healer), MID kits, Steady, 8 h, paced
# from hour 4, 12 seeds paired on the same dice. Each set against the same four wearing nothing:
#   k-plain / k-fire   Krell's Hold, Level 97: Brute Edge 70, Fire Ward 45, Life Leech 50 (im-krell-fire: the tree since items 1 and 2)
#   k-curve            the same as ruled (lane/designer-imbue-i3, 21 D-21): the Life Leech read at its band by the contest curve (im-krell-curve)
#   m-plain / m-fire   Muster Barrows, Level 60: Brute Edge 70, Fire Ward 45, Mana Leech 55 (im-muster-fire)
#
# The Krell's Hold steps play KSEEDS (36) seeds: on 12 the plain four drew four seeds trapped one fall down (held 28 to 32) and the set
# read 12.6 (4.0) pace steps on Krell's 0.610; seeds 13 to 36 read 2.8 and 2.9 (21 section 11.6). The bar wants its se at most 3.
#
#   bash run.sh [step ...]     every step, or only the named ones
# W: workers (default 3). SEEDS (12, Muster), KSEEDS (36, Krell's Hold), HOURS (8). OUT: where reports go (default this directory). A step whose report exists is kept
# (resumable); FRESH=1 plays every step again. Read with sum.mjs.
set -e
HERE="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
ROOT="${ROOT:-$HERE/../../../..}"
OUT="${OUT:-$HERE}"
V1="$ROOT/tools/balance-program/redesign/v1-climb.mjs"
W="${W:-3}"; SEEDS="${SEEDS:-12}"; KSEEDS="${KSEEDS:-36}"; HOURS="${HOURS:-8}"
WANT=" $* "
run() {
  local name=$1 ground=$2 level=$3 seeds=$4; shift 4
  if [ "$WANT" != "  " ] && [[ "$WANT" != *" $name "* ]]; then return 0; fi
  if [ -z "$FRESH" ] && [ -s "$OUT/$name.json" ]; then return 0; fi
  echo "$(date +%H:%M:%S) $name" >&2
  node "$V1" --ground "$ground" --level "$level" --gear mid --only base:steady --styles hammer,bow,mage,healer --seeds "$seeds" --hours "$HOURS" \
    --workers "$W" "$@" --json "$OUT/$name.json" > "$OUT/$name.txt" 2> "$OUT/$name.err"
}
run k-plain krells_hold 97 "$KSEEDS"
run k-fire krells_hold 97 "$KSEEDS" --candidate im-krell-fire
run k-curve krells_hold 97 "$KSEEDS" --candidate im-krell-curve
run m-plain muster_barrows 60 "$SEEDS"
run m-fire muster_barrows 60 "$SEEDS" --candidate im-muster-fire
