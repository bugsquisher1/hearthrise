#!/usr/bin/env bash
# tools/balance-program/redesign/signature-depth/batch3.sh — THE PACE BATCH 3'S SIGNATURES BUY (systems, lane/signatures-batch-3, 2026-11-27;
# docs/design/redesign/15-signature-candidates.md "Decision: count and size" batch 3, "Decision: the scale a Signature is sized on").
#
# batch2.sh's cell: each Signature on its seat's REFERENCE company (MID kits at the ground's refLevel, v1-climb's `base` cell, Steady, 8 h,
# held from hour 4) against the same four with none, on the same dice (seeds 1000 up), 12 seeds, read in PACE STEPS (sum.mjs --batch 3).
# The plain fours are played again on this tree first (b3-*-plain steps): the bands were re-cut on 2026-11-27 (lane/refhero-recut,
# lane/front-seat, lane/designer-bd9), so batch 2's plain reports no longer pair with this engine (the Muster tank four's first seed held
# 671 there and 672 here, its pace 0.90 and 1.00 of the hours table).
#
#   bash batch3.sh [step ...]     every step, or only the named ones
# W: workers (default 1: the brief runs seeds in sequence while the PC runs other lanes). SEEDS (12), HOURS (8). OUT: where reports go
# (default this directory: a measuring run from a snapshot of the tree writes back here). A step whose report exists is kept (resumable);
# FRESH=1 plays every step again. A REPORT IS THE ROW AS IT STOOD WHEN PLAYED; a shape tried and not kept is a temporary id on a scratch
# copy (sum.mjs VARIANTS3), the kept shapes replay from the tree by their real ids.
set -e
HERE="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
ROOT="${ROOT:-$HERE/../../../..}"
OUT="${OUT:-$HERE}"
V1="$ROOT/tools/balance-program/redesign/v1-climb.mjs"
W="${W:-1}"; SEEDS="${SEEDS:-12}"; HOURS="${HOURS:-8}"
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
# ── the plain fours on this tree (the size bar's pairs) ──
run b3-muster-tank      muster_barrows 60 $T
run b3-muster-mixed     muster_barrows 60 $X
# (a lone hero: #22 Slake Waders is the Alone Signature; its home is the Slake, a sword the plain lone hero)
run b3-slake-lone       the_slake 57 sword
run b3-muster-axes      muster_barrows 60 $A
run b3-pyre-mixed       pyre_field 80 $X
run b3-carters-mixed    carters_rest 117 $X
run b3-roost-crossbow   wyvern_roost 140 $C
run b3-slake-mixed      the_slake 57 $X
run b3-krell-mixed      krells_hold 97 $X
run b3-hask-mixed       hasks_ford 52 $X
# ── the rows on their best cells (the size bar): a seat's reference company with the row worn, against its plain four above. The tank's
#    rows read on Muster Barrows, its one ground with room over the plain four (batch2.sh); every other seat's on Muster too, a scale ground
#    each seat hunts, its home's reading second where the home is on the scale ──
run b3-muster-pavise     muster_barrows 60 $T --signatures bannermans_pavise,-,-,-
run b3-muster-boots      muster_barrows 60 $T --signatures night_carters_boots,-,-,-
run b3-muster-chain      muster_barrows 60 $X --signatures -,-,-,lock_keepers_chain
run b3-muster-bracers    muster_barrows 60 $X --signatures -,-,-,greened_bracers
run b3-muster-thrower    muster_barrows 60 $X --signatures -,-,-,throwers_ring
run b3-muster-leech      muster_barrows 60 $X --signatures -,-,-,vault_leech_ring
run b3-muster-key        muster_barrows 60 $X --signatures -,-,-,the_cellar_key
run b3-muster-stoker     muster_barrows 60 $X --signatures -,-,stokers_ring,-
run b3-muster-tooth      muster_barrows 60 $X --signatures -,bulls_tooth,-,-
run b3-muster-signet     muster_barrows 60 $X --signatures -,drowned_signet,-,-
run b3-muster-claw       muster_barrows 60 $A --signatures fledgling_claw,-,-,-
run b3-slake-waders      the_slake 57 sword --signatures slake_waders
# ── the second scale ground (the spread bar), for the rows in band on their best cell ──
run b3-slake-chain       the_slake 57 $X --signatures -,-,-,lock_keepers_chain
run b3-slake-bracers     the_slake 57 $X --signatures -,-,-,greened_bracers
run b3-muster-lone       muster_barrows 60 sword
run b3-muster-waders     muster_barrows 60 sword --signatures slake_waders
# (the coin pieces, at 4 seeds: their rule moves the supply bill, not the size bar (15 "Decision: the scale a Signature is sized on": coin
#  is the market's), so they read their coin a hero-hour beside pace; paired with the plain four's first 4 seeds)
SEEDS=4 run b3-muster-candle     muster_barrows 60 $X --signatures -,-,the_cold_candle,-
SEEDS=4 run b3-muster-riverstone muster_barrows 60 $X --signatures -,-,-,riverstone_earrings
SEEDS=4 run b3-muster-mitts      muster_barrows 60 $T --signatures teamsters_mitts,-,-,-
# ── THE SHAPES TRIED (b3v-*): temporary ids on a scratch copy of this tree (sum.mjs VARIANTS3 names each shape), played with this
#    script's cell, never committed as rows; a kept shape replays from the tree by its real id ──
