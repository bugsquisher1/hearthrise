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
#  Wing, 602.9 of 605: a Signature there reads 0 by construction, so the tank's rows read on Muster Barrows and Krell's Hold, its two grounds
#  with room over the plain four; the Ford's pair is kept as the pinned reading, b2-ford-tank and b2-ford-pavise)
run b2-muster-tank        muster_barrows 60 $T
run b2-muster-pavise      muster_barrows 60 $T --signatures bannermans_pavise,-,-,-
run b2-muster-pennies     muster_barrows 60 $T --signatures ferry_pennies,-,-,-
run b2-krell-tank-slam    krells_hold 97 $T --add-moves frost_slam,-,-,-
run b2-krell-helm         krells_hold 97 $T --add-moves frost_slam,-,-,- --signatures ossuary_helm,-,-,-
run b2-krell-tank-shelter krells_hold 97 $T --add-moves shelter,-,-,-
run b2-krell-mail         krells_hold 97 $T --add-moves shelter,-,-,- --signatures grave_guards_mail,-,-,-
run b2-pyre-sword         pyre_field 80 $S
run b2-pyre-sabre         pyre_field 80 $S --signatures charred_sabre,-,-,-
run b2-muster-sword       muster_barrows 60 $S
run b2-muster-gauntlets   muster_barrows 60 $S --signatures pikemans_gauntlets,-,-,-
run b2-flood-axes         catacomb_flooded_wing 160 $A
run b2-flood-hatchets     catacomb_flooded_wing 160 $A --signatures floodwater_hatchets,-,-,-
run b2-muster-mixed       muster_barrows 60 $X
run b2-muster-collar      muster_barrows 60 $X --signatures -,lurchers_collar,-,-
run b2-muster-robe        muster_barrows 60 $X --signatures -,-,lamplighters_robe,-
run b2-ox-mixed           ox_road 120 $X
run b2-ox-coalbow         ox_road 120 $X --signatures -,coal_runners_bow,-,-
run b2-ox-hat             ox_road 120 $X --signatures -,-,-,drovers_hat
run b2-pyre-mixed         pyre_field 80 $X
run b2-pyre-longbow       pyre_field 80 $X --signatures -,provosts_longbow,-,-
run b2-roost-crossbow     wyvern_roost 140 $C
run b2-roost-barb         wyvern_roost 140 $C --signatures -,wyvern_barb_crossbow,-,-
run b2-krell-mixed        krells_hold 97 $X
run b2-krell-wand         krells_hold 97 $X --signatures -,-,hall_fire_wand,-
run b2-bone-mixed         catacomb_bone_wing 175 $X
run b2-bone-shroud        catacomb_bone_wing 175 $X --signatures -,-,catacomb_shroud,-
run b2-slake-mixed        the_slake 57 $X
run b2-slake-pole         the_slake 57 $X --signatures -,-,-,bargemans_pole
# (the low-health rules on Bold: Steady falls back at 25%, so "below 30%" and "below 20%" seldom hold there, 15 #17 "Best on Bold")
run b2-slake-mixed-bold   the_slake 57 $X
run b2-slake-pole-bold    the_slake 57 $X --signatures -,-,-,bargemans_pole
run b2-muster-tank-bold   muster_barrows 60 $T
run b2-muster-pennies-bold muster_barrows 60 $T --signatures ferry_pennies,-,-,-
# ── the second scale ground (the spread bar) ──
run b2-krell-tank           krells_hold 97 $T
run b2-krell-pavise         krells_hold 97 $T --signatures bannermans_pavise,-,-,-
run b2-krell-pennies        krells_hold 97 $T --signatures ferry_pennies,-,-,-
run b2-muster-tank-slam     muster_barrows 60 $T --add-moves frost_slam,-,-,-
run b2-muster-helm          muster_barrows 60 $T --add-moves frost_slam,-,-,- --signatures ossuary_helm,-,-,-
run b2-muster-tank-shelter  muster_barrows 60 $T --add-moves shelter,-,-,-
run b2-muster-mail          muster_barrows 60 $T --add-moves shelter,-,-,- --signatures grave_guards_mail,-,-,-
run b2-muster-sabre         muster_barrows 60 $S --signatures charred_sabre,-,-,-
run b2-pyre-gauntlets       pyre_field 80 $S --signatures pikemans_gauntlets,-,-,-
run b2-muster-axes          muster_barrows 60 $A
run b2-muster-hatchets      muster_barrows 60 $A --signatures floodwater_hatchets,-,-,-
run b2-pyre-collar          pyre_field 80 $X --signatures -,lurchers_collar,-,-
run b2-pyre-coalbow         pyre_field 80 $X --signatures -,coal_runners_bow,-,-
run b2-muster-longbow       muster_barrows 60 $X --signatures -,provosts_longbow,-,-
run b2-pyre-crossbow        pyre_field 80 $C
run b2-pyre-barb            pyre_field 80 $C --signatures -,wyvern_barb_crossbow,-,-
run b2-muster-wand          muster_barrows 60 $X --signatures -,-,hall_fire_wand,-
run b2-krell-shroud         krells_hold 97 $X --signatures -,-,catacomb_shroud,-
run b2-pyre-robe            pyre_field 80 $X --signatures -,-,lamplighters_robe,-
run b2-muster-pole          muster_barrows 60 $X --signatures -,-,-,bargemans_pole
run b2-muster-hat           muster_barrows 60 $X --signatures -,-,-,drovers_hat
