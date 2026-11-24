#!/usr/bin/env bash
# tools/balance-program/redesign/tuning/line.sh — THE HOLDING TANK'S LINE, RE-READ ON EVERY SCALE GROUND (lane/monster-roles-ford-wings, 2026-11-23;
# 29-tuning-pass.md 3.4: "the line drops to 700 when the Ford's monsters carry roles and play the formula (one re-read)").
# The tank four (tank, bow, mage, healer) on Steady at each ground's reference Level, one Lab candidate (candidates.mjs: tuning-line-<pm>, or
# a combined one) or the tree (c0), SEEDS seed-days of HOURS hours. Deaths are what the line is read on (12-targets C-3: none on Steady).
#   bash tools/balance-program/redesign/tuning/line.sh <config> [out-dir]      config: c0 | <candidate id>   (heavy: background)
set -u
CFG=${1:-c0}
OUT=${2:-tools/balance-program/redesign/tuning/roles/line}
SEEDS=${SEEDS:-12}
HOURS=${HOURS:-10}
W=${W:-8}
mkdir -p "$OUT"
CAND=""
[ "$CFG" != "c0" ] && CAND="--candidate .scratch/tuning/tuning-$CFG.json"
for g in ${GROUNDS:-muster ford bone flooded}; do
  case $g in
    muster)  G=muster_barrows; M=60 ;;
    ford)    G=hasks_ford; M=52 ;;
    bone)    G=catacomb_bone_wing; M=175 ;;
    flooded) G=catacomb_flooded_wing; M=175 ;;
  esac
  node tools/balance-program/redesign/v1-climb.mjs --ground $G --level $M --only base:steady --styles tank,bow,mage,healer \
    --seeds $SEEDS --hours $HOURS --settle 4 --workers $W $CAND --json "$OUT/$CFG-$g-tank.json" > "$OUT/$CFG-$g-tank.txt" 2>"$OUT/$CFG-$g-tank.err"
  echo "$CFG $g-tank exit $?"
done
