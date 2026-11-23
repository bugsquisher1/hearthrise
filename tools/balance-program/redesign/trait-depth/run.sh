#!/usr/bin/env bash
# tools/balance-program/redesign/trait-depth/run.sh — THE DEPTH TRAITS BUY (systems, lane/traits-in-engine, 2026-11-23).
#
# The plain strong four of 12-targets.md 3.1a (BIS at the ground's top Level in its own tier: v1-climb's `back` cell, Steady, 6 seeds x 10 h,
# held from hour 4, exactly as depth-budget/*-cplus) against the same four wearing Rare and Very Rare kits (tools/balance-program/trait-kits.mjs):
#   lucky    every Trait made for the hero's seat, rank III, not chosen for the ground
#   theory   Traits picked for the ground from all 40 at rank III, by the census: three short passes (2 seeds x 6 h, from the plain four's
#            hold less 20) in which every hero wears one of the three wearable sets of the 40, read for each Trait's hold share by seat
# W: workers (default 4).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/../../../.."
V1="$ROOT/tools/balance-program/redesign/v1-climb.mjs"
W="${W:-4}"
run() { local g=$1 l=$2 name=$3; shift 3; node "$V1" --ground "$g" --level "$l" --gear bis --only back:steady --workers "$W" "$@" --json "$HERE/$name.json" > "$HERE/$name.txt" 2> "$HERE/$name.err"; }
for spec in "muster_barrows 75 muster" "hasks_ford 60 ford"; do
  read -r g l n <<< "$spec"
  run "$g" "$l" "$n-plain" --seeds 6 --hours 10
  run "$g" "$l" "$n-lucky" --seeds 6 --hours 10 --traits lucky
  for k in 0 1 2; do run "$g" "$l" "$n-census$k" --seeds 2 --hours 6 --traits "census:$k" --start-from "$HERE/$n-plain.json" --margin 20; done
  run "$g" "$l" "$n-theory" --seeds 6 --hours 10 --traits theory --trait-census "$HERE/$n-census0.json,$HERE/$n-census1.json,$HERE/$n-census2.json"
done
