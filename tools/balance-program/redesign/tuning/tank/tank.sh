#!/usr/bin/env bash
# tools/balance-program/redesign/tuning/tank/tank.sh — DOES THE TANK SEE THE BENEFIT AT ITS 20% LINE (lane/tank-line-signatures, 2026-11-23;
# docs/design/redesign/29-tuning-pass.md section 3.9). Steady, 12 seeds x 10 h, on Muster Barrows (formula, L60) and Hask's Ford (rows, L52):
#   mixed      hammer, bow, mage, healer (no tank)
#   tank800    tank, bow, mage, healer on the tree (danger.js HOLDER.linePm 800, Steady 20%)
#   tank1000   the same four with no holder line (line-1000.json: the tank reads the stance's own 25%)
# Read with: node tools/balance-program/redesign/v1-climb.mjs's JSON (held, payX, xpPerHeroH, gold, takenShare, fallsPerH, nearWipes, deaths).
#   bash tools/balance-program/redesign/tuning/tank/tank.sh      (heavy: about 25 min on 6 workers; run from the repo root)
set -u
V=tools/balance-program/redesign/v1-climb.mjs
O=tools/balance-program/redesign/tuning/tank
A="--seeds ${SEEDS:-12} --hours 10 --settle 4 --workers ${W:-6} --only base:steady"
run() { local n=$1; shift; node $V "$@" $A --json $O/$n.json > $O/$n.txt 2>/dev/null; echo "$n exit $?"; }
for g in muster ford; do
  case $g in muster) G=muster_barrows; M=60 ;; ford) G=hasks_ford; M=52 ;; esac
  run $g-mixed --ground $G --level $M --styles hammer,bow,mage,healer
  run $g-tank800 --ground $G --level $M --styles tank,bow,mage,healer
  run $g-tank1000 --ground $G --level $M --styles tank,bow,mage,healer --candidate $O/line-1000.json
done
