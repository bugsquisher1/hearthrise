#!/usr/bin/env bash
# tools/balance-program/redesign/signature-depth/batch4.sh — BATCH 3'S UNDER ROWS RESHAPED (game designer, lane/designer-sig-batch4, 2026-11-27;
# docs/design/redesign/15-signature-candidates.md "Batch 3's under rows, ruled").
#
# batch3.sh's cell, unchanged: each Signature on its seat's REFERENCE company (MID kits at the ground's refLevel, v1-climb's `base` cell,
# Steady, 8 h, held from hour 4) against the same four with none, on the same dice (seeds 1000 up), 12 seeds, read in PACE STEPS
# (sum.mjs --batch 4). The plain fours are batch 3's b3-* reports: this tree replays them exactly (the Muster mixed and tank fours' first
# seed played again on set 05b11e0db: held 601 and 672, pace 0.84442 and 1.0005, both equal to the b3 reports).
#
#   bash batch4.sh [step ...]     every step, or only the named ones
# W (default 1), SEEDS (12), HOURS (8), OUT (default this directory), ROOT (default this tree). A step whose report exists is kept; FRESH=1
# plays it again. A REPORT IS THE ROW AS IT STOOD WHEN PLAYED. The shapes tried and not kept (b4v-*) were temporary ids on a scratch copy of
# this tree (ROOT=<copy>); the kept rows replay from the tree by their real ids (b4-*).
set -e
HERE="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
ROOT="${ROOT:-$HERE/../../../..}"
OUT="${OUT:-$HERE}"
V1="$ROOT/tools/balance-program/redesign/v1-climb.mjs"
W="${W:-1}"; SEEDS="${SEEDS:-12}"; HOURS="${HOURS:-8}"
# (RISK, steady by default: the stance of the cell, lane/signatures-batch-4's Bold reading of the Cloak)
RISK="${RISK:-steady}"
WANT=" $* "
run() {
  local name=$1 g=$2 l=$3 styles=$4; shift 4
  if [ "$WANT" != "  " ] && [[ "$WANT" != *" $name "* ]]; then return 0; fi
  if [ -z "$FRESH" ] && [ -s "$OUT/$name.json" ]; then return 0; fi
  echo "$(date +%H:%M:%S) $name" >&2
  node "$V1" --ground "$g" --level "$l" --gear mid --only "base:$RISK" --styles "$styles" --seeds "$SEEDS" --hours "$HOURS" --workers "$W" "$@" \
    --json "$OUT/$name.json" > "$OUT/$name.txt" 2> "$OUT/$name.err"
}
T=tank,bow,mage,healer; X=hammer,bow,mage,healer
# ── THE KEPT ROWS, BY THEIR REAL IDS. A kept row's best-cell reading is its shape's b4v-* report (the same rule under a temporary id).
#    REPLAY=1 plays each kept row's first 2 seeds from the tree into OUT_REPLAY (default ./replay), to prove it plays that report exactly ──
if [ -n "$REPLAY" ]; then
  OUT="${OUT_REPLAY:-$HERE/replay}"; mkdir -p "$OUT"
  SEEDS=2 run b4r-muster-pavise   muster_barrows 60 $T --signatures bannermans_pavise,-,-,-
  SEEDS=2 run b4r-muster-boots    muster_barrows 60 $X --signatures -,-,-,night_carters_boots
  SEEDS=2 run b4r-muster-stoker   muster_barrows 60 $X --signatures -,-,stokers_ring,-
  SEEDS=2 run b4r-muster-tooth    muster_barrows 60 $X --signatures -,bulls_tooth,-,-
  SEEDS=2 run b4r-carters-key     carters_rest 117 $X --signatures -,-,-,the_cellar_key
  SEEDS=2 run b4r-muster-candle   muster_barrows 60 $X --signatures -,-,the_cold_candle,-
  SEEDS=2 run b4r-muster-river    muster_barrows 60 $X --signatures -,-,-,riverstone_earrings
  # (lane/signatures-batch-4: the Plate cut to 4%, its reading the b4w-muster-plate4 shape's)
  SEEDS=2 run b4r-muster-plate    muster_barrows 60 $T --signatures gatekeepers_plate,-,-,-
  exit 0
fi
# ── CARTER'S REST ON ITS OWN PACE STEP (lane/pace-step-per-ground, 2026-11-28; pace-step.mjs): the Key's 36 seeds owed at home, and the
#    Apron (#18) read at home now that the ground has its own scale. The plain four's first 12 seeds replay b3-carters-mixed exactly ──
SEEDS=36 run b4-carters-mixed36  carters_rest 117 $X
SEEDS=36 run b4-carters-key36    carters_rest 117 $X --signatures -,-,-,the_cellar_key
SEEDS=36 run b4-carters-apron36  carters_rest 117 $X --signatures -,-,-,brewers_apron
# ── the second scale ground (the spread bar), by the real id ──
run b4-roost-tooth       wyvern_roost 140 hammer,crossbow,mage,healer --signatures -,bulls_tooth,-,-
run b4-pyre-boots        pyre_field 80 $X --signatures -,-,-,night_carters_boots
# (the Mitts' mana rule on the two seats that are no tank, at 4 seeds against batch 3's 4-seed plains: the coin bar)
SEEDS=4 run b4-muster-mitts-hammer muster_barrows 60 $X --signatures teamsters_mitts,-,-,-
SEEDS=4 run b4-muster-mitts-mage   muster_barrows 60 $X --signatures -,-,teamsters_mitts,-
# ── THE SHAPES TRIED (b4v-*): temporary ids on a scratch copy (ROOT=<copy>, sum.mjs VARIANTS4 names each), never committed as rows ──
run b4v-muster-pav-blunt     muster_barrows 60 $T --signatures zz_pav_blunt,-,-,-
run b4v-muster-pav-mend      muster_barrows 60 $T --signatures zz_pav_mend,-,-,-
run b4v-muster-pav-pguard    muster_barrows 60 $T --signatures zz_pav_pguard,-,-,-
run b4v-muster-boots-shield  muster_barrows 60 $T --signatures zz_boots_shield,-,-,-
run b4v-muster-boots-guard   muster_barrows 60 $T --signatures zz_boots_guard,-,-,-
run b4v-muster-thrower-w10   muster_barrows 60 $X --signatures -,-,-,zz_thrower_w10
run b4v-muster-thrower-w6    muster_barrows 60 $X --signatures -,-,-,zz_thrower_w6
run b4v-muster-key-save      muster_barrows 60 $X --signatures -,-,-,zz_key_save
run b4v-muster-stoker-stoked muster_barrows 60 $X --signatures -,-,zz_stoker_stoked,-
run b4v-muster-tooth-exec    muster_barrows 60 $X --signatures -,zz_tooth_exec,-,-
SEEDS=4 run b4v-muster-river-s20 muster_barrows 60 $X --signatures -,-,-,zz_river_s20
SEEDS=4 run b4v-muster-river-s40 muster_barrows 60 $X --signatures -,-,-,zz_river_s40
SEEDS=4 run b4v-muster-candle-all muster_barrows 60 $X --signatures -,-,zz_candle_all,-
SEEDS=4 run b4v-muster-candle-two muster_barrows 60 $X --signatures -,-,zz_candle_two,-
run b4v-muster-claw-two      muster_barrows 60 axes,bow,mage,healer --signatures zz_claw_two,-,-,-
run b4v-muster-leech-ub      muster_barrows 60 $X --signatures -,-,-,zz_leech_ub
# (the scratch copy's engine also reads `selfBelowPm`, the wearer's own health as the moment happens: the filter batch 4 asks Systems for)
run b4v-muster-pav-lowchill  muster_barrows 60 $T --signatures zz_pav_lowchill,-,-,-
run b4v-muster-pav-lowblunt  muster_barrows 60 $T --signatures zz_pav_lowblunt,-,-,-
run b4v-muster-boots-back    muster_barrows 60 $X --signatures -,zz_boots_back,-,-
run b4v-muster-boots-back8   muster_barrows 60 $X --signatures -,zz_boots_back_blunt,-,-
run b4v-muster-stoker-60     muster_barrows 60 $X --signatures -,-,zz_stoker_60,-
run b4v-muster-pav-g10       muster_barrows 60 $T --signatures zz_pav_g10,-,-,-
run b4v-muster-pav-g10s3     muster_barrows 60 $T --signatures zz_pav_g10s3,-,-,-
run b4v-muster-tooth-x2      muster_barrows 60 $X --signatures -,zz_tooth_x2,-,-
run b4v-muster-key-save2     muster_barrows 60 $X --signatures -,-,-,zz_key_save2
run b4v-muster-boots-lowchill muster_barrows 60 $T --signatures zz_boots_lowchill,-,-,-
SEEDS=4 run b4v-muster-river-s5 muster_barrows 60 $X --signatures -,-,-,zz_river_s5
SEEDS=4 run b4v-muster-river-s3 muster_barrows 60 $X --signatures -,-,-,zz_river_s3
run b4v-muster-pav-g12       muster_barrows 60 $T --signatures zz_pav_g12,-,-,-
run b4v-muster-key-blunt5    muster_barrows 60 $X --signatures -,-,-,zz_key_blunt5
run b4v-muster-pav-g11       muster_barrows 60 $T --signatures zz_pav_g11,-,-,-
run b4v-muster-pav-g12s3     muster_barrows 60 $T --signatures zz_pav_g12s3,-,-,-
run b4v-muster-boots-ally35  muster_barrows 60 $X --signatures -,-,-,zz_boots_ally35
run b4v-muster-boots-ally30  muster_barrows 60 $X --signatures -,-,-,zz_boots_ally30
run b4v-pyre-stoker-45       pyre_field 80 $X --signatures -,-,zz_stoker_45,-
run b4v-muster-stoker-45     muster_barrows 60 $X --signatures -,-,zz_stoker_45,-
run b4v-carters-key-k1       carters_rest 117 $X --signatures -,-,-,zz_key_k1
run b4v-carters-key-k2       carters_rest 117 $X --signatures -,-,-,zz_key_k2
run b4v-muster-boots-ally45  muster_barrows 60 $X --signatures -,-,-,zz_boots_ally45
run b4v-muster-boots-ally40  muster_barrows 60 $X --signatures -,-,-,zz_boots_ally40
run b4v-carters-key-k3       carters_rest 117 $X --signatures -,-,-,zz_key_k3
run b4v-carters-key-k4       carters_rest 117 $X --signatures -,-,-,zz_key_k4
# ── BATCH 4'S ROWS (systems, lane/signatures-batch-4, 2026-11-28): the 14 rows on the engine pieces P1 to P7 and P9, each by its real id on
#    the cell 15's rules A to E give it (sum.mjs --batch 4, ROWS4B). ROOT is a snapshot of the lane's commit (git archive), so no edit
#    lands under a run. RISK=bold plays the Cloak's Bold cell ──
S=sword,bow,mage,healer; C=hammer,crossbow,mage,healer
run b4s-muster-thrower   muster_barrows 60 $X --signatures -,-,-,throwers_ring
run b4s-muster-leech     muster_barrows 60 $X --signatures -,-,-,vault_leech_ring
run b4s-muster-tooth     muster_barrows 60 $X --signatures -,bulls_tooth,-,-
run b4s-roost-tooth      wyvern_roost 140 $C --signatures -,bulls_tooth,-,-
run b4s-muster-boots     muster_barrows 60 $X --signatures -,-,-,night_carters_boots
run b4s-pyre-boots       pyre_field 80 $X --signatures -,-,-,night_carters_boots
run b4s-muster-plate     muster_barrows 60 $T --signatures gatekeepers_plate,-,-,-
run b4s-muster-pair      muster_barrows 60 $T --signatures lead_rein,-,-,convoy_bell
run b4s-muster-hood      muster_barrows 60 $X --signatures -,-,pyre_priests_hood,-
run b4s-muster-sword     muster_barrows 60 $S
run b4s-muster-mitts     muster_barrows 60 $S --signatures teamsters_mitts,-,-,-
RISK=bold run b4s-muster-bold  muster_barrows 60 $X
RISK=bold run b4s-muster-cloak muster_barrows 60 $X --signatures -,-,-,hearth_masons_cloak
# (the coin rows at 4 seeds against batch 3's 4-seed plain mixed four, b3-muster-mixed4: a saving draws no dice, rule C)
SEEDS=4 run b4s-muster-ledger    muster_barrows 60 $X --signatures -,-,ledger_ring,-
SEEDS=4 run b4s-muster-leggings  muster_barrows 60 $X --signatures -,-,-,lychgate_leggings
SEEDS=4 run b4s-muster-bracers   muster_barrows 60 $X --signatures -,brood_bracers,-,-
SEEDS=4 run b4s-muster-sash      muster_barrows 60 $X --signatures -,-,-,sergeants_sash
# ── BATCH 4'S SHAPES (b4w-*): temporary ids on a scratch copy of the lane's commit (ROOT=<copy>, never committed; sum.mjs VARIANTS4B names
#    each): the Plate's cut at 4% and 2.5%, and the pair's halves apart (each piece's effect with the other worn inert) and at half size ──
run b4w-muster-plate4    muster_barrows 60 $T --signatures zz_plate4,-,-,-
run b4w-muster-plate25   muster_barrows 60 $T --signatures zz_plate25,-,-,-
run b4w-muster-bell      muster_barrows 60 $T --signatures zz_rein0,-,-,zz_bell
run b4w-muster-rein      muster_barrows 60 $T --signatures zz_rein,-,-,zz_bell0
run b4w-muster-pair-half muster_barrows 60 $T --signatures zz_rein75,-,-,zz_bell15
