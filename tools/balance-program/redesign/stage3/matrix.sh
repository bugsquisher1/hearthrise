#!/usr/bin/env bash
# tools/balance-program/redesign/stage3/matrix.sh — THE REDUCED MATRIX OF 27 section 5 FOR THE AMOUNT PIPELINE (lane/stage3-pipeline).
# Muster Barrows (Level 60, and 70 in `high`), Hask's Ford (52), the Bone Wing (175, staged); Careful, Steady and Bold; 6 seeds x 8 h from
# step 0, the held step read from hour 3. Muster carries v1-climb's power variants (weapon / armor a tier back, skill 10 under its line,
# +3 Levels): the weights test of 04 section 14. `before` plays the merged base without the pipeline; `hitoff` the roll to hit off (27 K-2).
#   bash tools/balance-program/redesign/stage3/matrix.sh [out-dir]       (heavy: run on a free machine; about 40 minutes on 12 workers)
set -u
OUT=${1:-.scratch/stage3}
C=tools/balance-program/redesign/stage3/candidates.mjs
V=tools/balance-program/redesign/v1-climb.mjs
A="--seeds 6 --hours 8 --settle 3 --workers 12"
node $C --out "$OUT" > /dev/null
node $V --ground muster_barrows --level 60 --level2 70 $A --only base,levels,weapon,armor,high,skill --json "$OUT/m-muster.json" > "$OUT/m-muster.txt" 2>&1; echo "muster $?"
node $V --ground hasks_ford --level 52 $A --only base --json "$OUT/m-ford.json" > "$OUT/m-ford.txt" 2>&1; echo "ford $?"
node $V --ground catacomb_bone_wing --level 175 $A --only base --json "$OUT/m-wing.json" > "$OUT/m-wing.txt" 2>&1; echo "wing $?"
node $V --candidate "$OUT/stage3-hit-off.json" --ground muster_barrows --level 60 $A --only base --json "$OUT/m-hitoff.json" > "$OUT/m-hitoff.txt" 2>&1; echo "hitoff $?"
node $V --candidate "$OUT/stage3-before.json" --ground muster_barrows --level 60 --level2 70 $A --only base,levels,weapon,armor,high,skill --json "$OUT/b-muster.json" > "$OUT/b-muster.txt" 2>&1; echo "before muster $?"
node $V --candidate "$OUT/stage3-before.json" --ground hasks_ford --level 52 $A --only base --json "$OUT/b-ford.json" > "$OUT/b-ford.txt" 2>&1; echo "before ford $?"
node $V --candidate "$OUT/stage3-before.json" --ground catacomb_bone_wing --level 175 $A --only base --json "$OUT/b-wing.json" > "$OUT/b-wing.txt" 2>&1; echo "before wing $?"
