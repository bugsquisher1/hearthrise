#!/usr/bin/env bash
# tools/balance-program/redesign/signature-depth/batch2.sh — THE DEPTH BATCH 2'S SIGNATURES BUY (systems, lane/signatures-batch-2, 2026-11-26;
# docs/design/redesign/15-signature-candidates.md "Decision: how a Signature stays inside the gear slice", 29-tuning-pass.md section 3.8).
#
# The sample's cell (run.sh): each Signature on its seat's REFERENCE company (MID kits at the ground's refLevel, v1-climb's `base` cell,
# Steady, 8 h, held from hour 4) against the same four with none, on the same dice (seeds 1000 up), 12 seeds (the size bar's), first on its
# home ground (or the scale ground its home stands for), then on a second scale ground its seat hunts (the spread bar's). A Signature whose
# move the played bars never cast (Frost Slam, Shelter) has it added to the seat in BOTH arms (v1-climb --add-moves), so the Signature is
# the only difference.
#
#   bash batch2.sh [step ...]     every step, or only the named ones (a step is a report's name: b2-ford-tank, b2-ford-pavise, ...)
# W: workers (default 2: the PC runs other lanes). SEEDS (12), HOURS (8). OUT: where reports go (default this directory: a measuring run
# from a snapshot of the tree writes back here). A step whose report exists is kept (resumable); FRESH=1 plays every step again.
# A REPORT IS THE ROW AS IT STOOD WHEN PLAYED. The b2-* steps of a row reshaped later hold its as-written shape (played from the tree before
# the reshape: lane/signatures-batch-2 319850652 for the tank's, e72bc4412 for the low-health lines); the shapes tried were temporary ids
# on a scratch copy (sum.mjs VARIANTS). The adopted shapes are the rows now, and their steps (b2v-*, last below) replay them from this tree.
set -e
HERE="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
ROOT="$HERE/../../../.."
OUT="${OUT:-$HERE}"
V1="$ROOT/tools/balance-program/redesign/v1-climb.mjs"
W="${W:-2}"; SEEDS="${SEEDS:-12}"; HOURS="${HOURS:-8}"
WANT=" $* "
run() {
  local name=$1 g=$2 l=$3 styles=$4; shift 4
  if [ "$WANT" != "  " ] && [[ "$WANT" != *" $name "* ]]; then return 0; fi
  if [ -z "$FRESH" ] && [ -s "$OUT/$name.json" ]; then return 0; fi
  echo "$(date +%H:%M:%S) $name" >&2
  # (a step named *-bold reads the Bold stance: a low-health rule's best cell, since Steady falls back at 25% before a hero gets under it)
  local risk=steady; [[ "$name" == *-bold ]] && risk=bold
  node "$V1" --ground "$g" --level "$l" --gear mid --only base:$risk --styles "$styles" --seeds "$SEEDS" --hours "$HOURS" --workers "$W" "$@" \
    --json "$OUT/$name.json" > "$OUT/$name.txt" 2> "$OUT/$name.err"
}
T=tank,bow,mage,healer; S=sword,bow,mage,healer; A=axes,bow,mage,healer; X=hammer,bow,mage,healer; C=hammer,crossbow,mage,healer
# ── the home cells (the size bar) ──
# (the tank four sits at the top of Hask's Ford, 654.5 of 655 at Level 52 and 643.5 at 45, of Pyre Field, 116.8 of 120, and of the Bone
#  Wing, 602.9 of 605, and on Krell's Hold it never falls back (it takes 99.7% of the blows and its held step is a climb still running:
#  the Helm's 12 seeds read -54 to +38). So the tank's rows read on Muster Barrows, its one ground in equilibrium with room over the plain
#  four; a tank Signature buys no held step on the others (the Ford's pair is kept as the pinned reading, b2-ford-tank and b2-ford-pavise,
#  and the Krell Helm pair as the unsettled one, b2-krell-tank-slam and b2-krell-helm))
run b2-muster-tank        muster_barrows 60 $T
run b2-muster-pavise      muster_barrows 60 $T --signatures bannermans_pavise,-,-,-
run b2-muster-pennies     muster_barrows 60 $T --signatures ferry_pennies,-,-,-
run b2-muster-tank-slam   muster_barrows 60 $T --add-moves frost_slam,-,-,-
run b2-muster-helm        muster_barrows 60 $T --add-moves frost_slam,-,-,- --signatures ossuary_helm,-,-,-
run b2-muster-tank-shelter muster_barrows 60 $T --add-moves shelter,-,-,-
run b2-muster-mail        muster_barrows 60 $T --add-moves shelter,-,-,- --signatures grave_guards_mail,-,-,-
run b2-krell-tank-slam    krells_hold 97 $T --add-moves frost_slam,-,-,-
run b2-krell-helm         krells_hold 97 $T --add-moves frost_slam,-,-,- --signatures ossuary_helm,-,-,-
run b2-pyre-sword         pyre_field 80 $S
run b2-pyre-sabre         pyre_field 80 $S --signatures charred_sabre,-,-,-
run b2-muster-sword       muster_barrows 60 $S
run b2-muster-gauntlets   muster_barrows 60 $S --signatures pikemans_gauntlets,-,-,-
run b2-flood-axes         catacomb_flooded_wing 160 $A
run b2-flood-hatchets     catacomb_flooded_wing 160 $A --signatures floodwater_hatchets,-,-,-
run b2-muster-mixed       muster_barrows 60 $X
run b2-muster-collar      muster_barrows 60 $X --signatures -,lurchers_collar,-,-
run b2-ox-mixed           ox_road 120 $X
run b2-ox-coalbow         ox_road 120 $X --signatures -,coal_runners_bow,-,-
run b2-ox-hat             ox_road 120 $X --signatures -,-,-,drovers_hat
run b2-pyre-mixed         pyre_field 80 $X
run b2-pyre-longbow       pyre_field 80 $X --signatures -,provosts_longbow,-,-
run b2-pyre-robe          pyre_field 80 $X --signatures -,-,lamplighters_robe,-
run b2-roost-crossbow     wyvern_roost 140 $C
run b2-roost-barb         wyvern_roost 140 $C --signatures -,wyvern_barb_crossbow,-,-
run b2-krell-mixed        krells_hold 97 $X
run b2-krell-wand         krells_hold 97 $X --signatures -,-,hall_fire_wand,-
run b2-bone-mixed         catacomb_bone_wing 175 $X
run b2-bone-shroud        catacomb_bone_wing 175 $X --signatures -,-,catacomb_shroud,-
run b2-slake-mixed        the_slake 57 $X
# (the low-health rules: Steady falls back at 25%, so "below 30%" and "below 20%" seldom held (#23 as written read +0.3 (0.7), its
#  Mend under 20% about once an hour), and on Bold the Slake's four sits at its top (140 of 140, b2-slake-mixed-bold); reshaped to the lines
#  Steady meets, half health for #17 and 40% for #23, the steps renamed for their line so the as-written readings stay)
run b2-slake-mixed-bold   the_slake 57 $X
run b2-muster-pennies40   muster_barrows 60 $T --signatures ferry_pennies,-,-,-
run b2-slake-pole50       the_slake 57 $X --signatures -,-,-,bargemans_pole
# ── the second scale ground (the spread bar; a row under its size on its best cell needs none, so the Hatchets', Collar's, Coal Runner's
#    and Longbow's were not played) ──
run b2-pyre-gauntlets       pyre_field 80 $S --signatures pikemans_gauntlets,-,-,-
run b2-pyre-crossbow        pyre_field 80 $C
run b2-pyre-barb            pyre_field 80 $C --signatures -,wyvern_barb_crossbow,-,-
run b2-muster-wand          muster_barrows 60 $X --signatures -,-,hall_fire_wand,-
run b2-krell-shroud         krells_hold 97 $X --signatures -,-,catacomb_shroud,-
run b2-muster-robe          muster_barrows 60 $X --signatures -,-,lamplighters_robe,-
run b2-muster-pole50        muster_barrows 60 $X --signatures -,-,-,bargemans_pole
run b2-muster-hat           muster_barrows 60 $X --signatures -,-,-,drovers_hat
# ── the adopted shapes: the rows as they stand (read first as temporary ids on a scratch copy; these steps replay them by their real ids) ──
run b2v-muster-helm20            muster_barrows 60 $T --add-moves frost_slam,-,-,- --signatures ossuary_helm,-,-,-
run b2v-muster-mail-guard30x8    muster_barrows 60 $T --add-moves shelter,-,-,- --signatures grave_guards_mail,-,-,-
run b2v-pyre-sabre-target-blunt  pyre_field 80 $S --signatures charred_sabre,-,-,-
run b2v-muster-sabre-target-blunt muster_barrows 60 $S --signatures charred_sabre,-,-,-
run b2v-muster-pole15            muster_barrows 60 $X --signatures -,-,-,bargemans_pole
run b2v-muster-pennies-blunt45   muster_barrows 60 $T --signatures ferry_pennies,-,-,-
