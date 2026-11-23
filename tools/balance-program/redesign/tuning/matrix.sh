#!/usr/bin/env bash
# tools/balance-program/redesign/tuning/matrix.sh — THE TUNING PASS'S COMBINED MATRIX (lane/tuning-pass, 2026-11-23; 27 section 5, reduced).
# Every scale ground at its fresh (LOW kits, entry Level), reference (MID, refLevel) and top (BIS, top Level) company, the Steady mixed four
# (hammer, bow, mage, healer); the reference company on Careful, Steady and Bold with one gear tier back and up (C-2) and +3 Levels; two other
# lineups on Steady (every ground); the tank four on the three holder lines. Each config is one Lab candidate (candidates.mjs) or the tree (C0).
#   bash tools/balance-program/redesign/tuning/matrix.sh <config> [out-dir]      config: c0 | mf | <candidate id>   (heavy: background)
set -u
CFG=${1:-c0}
OUT=${2:-tools/balance-program/redesign/tuning/runs}
SEEDS=${SEEDS:-6}
HOURS=${HOURS:-10}
W=${W:-14}
mkdir -p "$OUT"
V=tools/balance-program/redesign/v1-climb.mjs
CAND=""
[ "$CFG" != "c0" ] && CAND="--candidate .scratch/tuning/tuning-$CFG.json"
A="--seeds $SEEDS --hours $HOURS --settle 4 --workers $W $CAND"
run() { # name, args...
  local n=$1; shift
  node $V "$@" $A --json "$OUT/$CFG-$n.json" > "$OUT/$CFG-$n.txt" 2>"$OUT/$CFG-$n.err"; echo "$CFG $n exit $?"
}
GROUNDS=${GROUNDS:-"muster ford bone flooded"}
for g in $GROUNDS; do
  case $g in
    muster)  G=muster_barrows; E=55; M=60; T=75 ;;
    ford)    G=hasks_ford; E=45; M=52; T=60 ;;
    bone)    G=catacomb_bone_wing; E=165; M=175; T=185 ;;
    flooded) G=catacomb_flooded_wing; E=165; M=175; T=185 ;;
  esac
  [ "${PART:-all}" = all ] || [ "${PART}" = ref ] && run $g-ref --ground $G --level $M --level2 $((M+10)) --only ${REFONLY:-base,back:steady,up:steady,levels:steady,high:steady}
  [ "${PART:-all}" = all ] || [ "${PART}" = band ] && run $g-floor --ground $G --level $E --gear low --only base:steady
  [ "${PART:-all}" = all ] || [ "${PART}" = band ] && run $g-top --ground $G --level $T --gear bis --only base:steady
  # the two other lineups on every ground (lane/monster-roles-ford-wings: STYLE-3 reads every scale ground, not two)
  if [ "${PART:-all}" = all ] || [ "${PART}" = lineups ]; then
    run $g-tank --ground $G --level $M --only base:steady --styles tank,bow,mage,healer
    run $g-nohealer --ground $G --level $M --only base:steady --styles hammer,axes,bow,mage
  fi
done
