#!/usr/bin/env bash
# tools/balance-program/redesign/signature-depth/batch5.sh — BATCH 4'S AND BATCH 3'S OUT-OF-BAND ROWS RESHAPED (game designer,
# lane/designer-sig-batch5, 2026-11-28; docs/design/redesign/15-signature-candidates.md "Batch 4's calls and the out-of-band rows, ruled").
#
# batch4.sh's cell, unchanged: each Signature on its seat's REFERENCE company (MID kits at the ground's refLevel, v1-climb's `base` cell,
# Steady unless named, 8 h, held from hour 4) against the same four with none, on the same dice (seeds 1000 up), 12 seeds (36 on Carter's
# Rest, 4 for a coin row: rule C), read in each ground's own PACE STEP (pace-step.mjs) by `sum.mjs --batch 5`. The plain fours are batch 3's
# b3-* and batch 4's b4-* reports, which this tree replays (b5-muster-steady plays b3-muster-mixed seed for seed), or played here (b5-*:
# the Pyre sword four, the two Catacomb wings, the mixed four on Bold and on Steady with each seed's whole hunt kept, `--raw`, rule F).
#
#   bash batch5.sh [step ...]     every step, or only the named ones
# W (default 6), SEEDS (12), HOURS (8), OUT (default this directory), ROOT (default this tree). A step whose report exists is kept; FRESH=1
# plays it again. A REPORT IS THE ROW AS IT STOOD WHEN PLAYED. The shapes (b5v-*) were temporary ids on a scratch copy of this tree
# (ROOT=<copy>, run from a copy of this script: bash reads a script as it runs, so an edit under a run breaks it). Three needed a scratch
# engine line, each asked of Systems in HANDOFFS 2026-11-28 designer-sig-batch5: `saves.of` (abilities.js runeSaveOf, the save reads one
# move: b5v-muster-candle-lance), `onAlly` and `selfBelowPm` (reactions.js runOne: the moment's monster is on another hero; the wearer's own
# health under a line: the b5v-muster-mitts-* shapes). REPLAY=1 plays each kept row's first two seeds by its real id from this tree.
set -e
HERE="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
ROOT="${ROOT:-$HERE/../../../..}"
OUT="${OUT:-$HERE}"
V1="$ROOT/tools/balance-program/redesign/v1-climb.mjs"
W="${W:-6}"; SEEDS="${SEEDS:-12}"; HOURS="${HOURS:-8}"
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
T=tank,bow,mage,healer; X=hammer,bow,mage,healer; S=sword,bow,mage,healer; C=hammer,crossbow,mage,healer; A=axes,bow,mage,healer
# ── THE KEPT ROWS BY THEIR REAL IDS (REPLAY=1: the first 2 seeds into OUT_REPLAY, default ./replay) ──
if [ -n "$REPLAY" ]; then
  OUT="${OUT_REPLAY:-$HERE/replay}"; mkdir -p "$OUT"
  SEEDS=2 run b5r-muster-chain     muster_barrows 60 $X --signatures -,-,-,lock_keepers_chain
  SEEDS=2 run b5r-muster-tooth     muster_barrows 60 $X --signatures -,bulls_tooth,-,-
  SEEDS=2 run b5r-carters-key      carters_rest 117 $X --signatures -,-,-,the_cellar_key
  SEEDS=2 run b5r-carters-leech    carters_rest 117 $X --signatures -,-,-,vault_leech_ring
  SEEDS=2 run b5r-muster-ledger    muster_barrows 60 $X --signatures -,-,ledger_ring,-
  SEEDS=2 run b5r-muster-bracers   muster_barrows 60 $X --signatures -,brood_bracers,-,-
  SEEDS=2 run b5r-muster-leggings  muster_barrows 60 $X --signatures -,-,-,lychgate_leggings
  SEEDS=2 RISK=bold run b5r-muster-cloak muster_barrows 60 $X --signatures -,-,-,hearth_masons_cloak
  exit 0
fi
# ── THE PLAINS PLAYED HERE ──
run b5-pyre-sword        pyre_field 80 $S
SEEDS=24 run b5-pyre-sword24     pyre_field 80 $S
run b5-bone-mixed        catacomb_bone_wing 175 $X
run b5-flood-axes        catacomb_flooded_wing 160 $A
# (rule F: the mixed four on Bold and on Steady, each seed's whole hunt kept: `--raw` writes its heroes' Level XP and what its deaths took)
RISK=bold run b5-muster-bold     muster_barrows 60 $X --raw "$OUT/b5-muster-bold.raw.json"
run b5-muster-steady     muster_barrows 60 $X --raw "$OUT/b5-muster-steady.raw.json"
SEEDS=36 run b5-muster-steady36  muster_barrows 60 $X --raw "$OUT/b5-muster-steady36.raw.json"
# ── ROWS AS THEY STOOD, BY THEIR REAL IDS (the moved re-reads were older trees' reports) ──
run b5-pyre-sabre        pyre_field 80 $S --signatures charred_sabre,-,-,-
SEEDS=24 run b5-pyre-sabre24     pyre_field 80 $S --signatures charred_sabre,-,-,-
run b5-muster-pennies45  muster_barrows 60 $T --signatures ferry_pennies,-,-,-
run b5-muster-mitts-tank muster_barrows 60 $T --signatures teamsters_mitts,-,-,-
RISK=bold run b5-muster-cloak    muster_barrows 60 $X --signatures -,-,-,hearth_masons_cloak --raw "$OUT/b5-muster-cloak.raw.json"
SEEDS=36 RISK=bold run b5-muster-cloak36 muster_barrows 60 $X --signatures -,-,-,hearth_masons_cloak --raw "$OUT/b5-muster-cloak36.raw.json"
# ── THE SHAPES (b5v-*): temporary ids on a scratch copy (ROOT=<copy>), sum.mjs ROWS5, VARIANTS5, COIN5 and BOLD5 name each ──
SEEDS=4 run b5v-muster-ledger4      muster_barrows 60 $X --signatures -,-,zz_ledger4,-
SEEDS=4 run b5v-muster-bracers3     muster_barrows 60 $X --signatures -,zz_bracers3,-,-
SEEDS=4 run b5v-muster-leg10-30     muster_barrows 60 $X --signatures -,-,-,zz_leg10_30
SEEDS=4 run b5v-muster-leg50-10     muster_barrows 60 $X --signatures -,-,-,zz_leg50_10
SEEDS=4 run b5v-muster-leg50-15     muster_barrows 60 $X --signatures -,-,-,zz_leg50_15
SEEDS=4 run b5v-muster-leg50-5      muster_barrows 60 $X --signatures -,-,-,zz_leg50_5
SEEDS=4 run b5v-muster-leg40-10     muster_barrows 60 $X --signatures -,-,-,zz_leg40_10
SEEDS=4 run b5v-muster-leg50-5-40   muster_barrows 60 $X --signatures -,-,-,zz_leg50_5_40
SEEDS=4 run b5v-muster-leg50-5-45   muster_barrows 60 $X --signatures -,-,-,zz_leg50_5_45
SEEDS=4 run b5v-muster-candle-lance muster_barrows 60 $X --signatures -,-,zz_candle_lance,-
run b5v-muster-chain40      muster_barrows 60 $X --signatures -,-,-,zz_chain40
run b5v-muster-chain60      muster_barrows 60 $X --signatures -,-,-,zz_chain60
run b5v-muster-chain90      muster_barrows 60 $X --signatures -,-,-,zz_chain90
run b5v-muster-pennies40    muster_barrows 60 $T --signatures zz_pennies40,-,-,-
run b5v-muster-thrower-weak muster_barrows 60 $X --signatures -,-,-,zz_thrower_weak
run b5v-muster-thrower-sap  muster_barrows 60 $X --signatures -,-,-,zz_thrower_sap
run b5v-muster-thrower-blunt muster_barrows 60 $X --signatures -,-,-,zz_thrower_blunt
run b5v-muster-leech-h50    muster_barrows 60 $X --signatures -,-,-,zz_leech_h50
run b5v-muster-leech-h100   muster_barrows 60 $X --signatures -,-,-,zz_leech_h100
SEEDS=36 run b5v-carters-leech-h100 carters_rest 117 $X --signatures -,-,-,zz_leech_h100
SEEDS=36 run b5v-carters-leech-h50  carters_rest 117 $X --signatures -,-,-,zz_leech_h50
run b5v-bone-boots-caster   catacomb_bone_wing 175 $X --signatures -,-,-,zz_boots_caster
run b5v-flood-boots-caster  catacomb_flooded_wing 160 $A --signatures -,-,-,zz_boots_caster
run b5v-pyre-boots-caster   pyre_field 80 $X --signatures -,-,-,zz_boots_caster
run b5v-roost-tooth50       wyvern_roost 140 $C --signatures -,zz_tooth50,-,-
run b5v-muster-tooth50      muster_barrows 60 $X --signatures -,zz_tooth50,-,-
run b5v-muster-mitts-blunt  muster_barrows 60 $S --signatures zz_mitts_blunt,-,-,-
run b5v-muster-mitts-blunt-tank muster_barrows 60 $T --signatures zz_mitts_blunt,-,-,-
run b5v-muster-mitts-heal8       muster_barrows 60 $S --signatures zz_mitts_heal8,-,-,-
run b5v-muster-mitts-heal8-tank  muster_barrows 60 $T --signatures zz_mitts_heal8,-,-,-
run b5v-muster-mitts-sick        muster_barrows 60 $S --signatures zz_mitts_sick,-,-,-
run b5v-muster-signet-low   muster_barrows 60 $S --signatures zz_signet_low,-,-,-
SEEDS=36 run b5v-carters-key3-20  carters_rest 117 $X --signatures -,-,-,zz_key3_20
SEEDS=36 run b5v-carters-apron-h4 carters_rest 117 $X --signatures -,-,-,zz_apron_h4
SEEDS=36 run b5v-carters-apron-g15 carters_rest 117 $X --signatures -,-,-,zz_apron_g15
run b5v-muster-apron-g15    muster_barrows 60 $X --signatures -,-,-,zz_apron_g15
RISK=bold run b5v-muster-cloak-hunt muster_barrows 60 $X --signatures -,-,-,zz_cloak_hunt --raw "$OUT/b5v-muster-cloak-hunt.raw.json"
SEEDS=36 RISK=bold run b5v-muster-cloak-hunt36 muster_barrows 60 $X --signatures -,-,-,zz_cloak_hunt --raw "$OUT/b5v-muster-cloak-hunt36.raw.json"
SEEDS=36 RISK=bold run b5v-muster-cloak-3h36 muster_barrows 60 $X --signatures -,-,-,zz_cloak_3h --raw "$OUT/b5v-muster-cloak-3h36.raw.json"
SEEDS=36 RISK=bold run b5v-muster-cloak-2h36 muster_barrows 60 $X --signatures -,-,-,zz_cloak_2h --raw "$OUT/b5v-muster-cloak-2h36.raw.json"
SEEDS=36 run b5v-carters-leech-h60  carters_rest 117 $X --signatures -,-,-,zz_leech_h60
SEEDS=36 run b5v-carters-leech-h70  carters_rest 117 $X --signatures -,-,-,zz_leech_h70
SEEDS=36 RISK=bold run b5v-muster-cloak-90m36 muster_barrows 60 $X --signatures -,-,-,zz_cloak_90m --raw "$OUT/b5v-muster-cloak-90m36.raw.json"
SEEDS=36 RISK=bold run b5v-muster-cloak-75m36 muster_barrows 60 $X --signatures -,-,-,zz_cloak_75m --raw "$OUT/b5v-muster-cloak-75m36.raw.json"
