#!/usr/bin/env sh
# tools/balance-program/redesign/r10/measure.sh — THE BANDS OF R10'S GROUNDS, MEASURED (lane/r10-more-grounds, 2026-11-22).
# 12-targets.md 3.1 read on the real engine: the Steady mixed four (v1-climb.mjs: hammer, bow, mage, healer), 4 seeds x 12 h, the held
# step read from hour 4, on one ground:
#   floor  a fresh company: LOW kits (grid-kit.mjs: the day it walks in having bought nothing) at the ground's entry Level
#   top    a strong four: BIS kits at the ground's top Level
#   check  MID kits at a Level between: it must settle inside floor..top
#   GROUND=hasks_ford ENTRY=45 TOP=60 MID=52 sh tools/balance-program/redesign/r10/measure.sh [workers]
set -e
HERE=$(dirname "$0")
ROOT="$HERE/../../../.."
W=${1:-6}
G=${GROUND:?GROUND}
V1="$ROOT/tools/balance-program/redesign/v1-climb.mjs"
node "$V1" --ground "$G" --level "$ENTRY" --gear low --seeds 4 --hours 12 --settle 4 --workers "$W" --only base:steady --json "$HERE/$G-floor.json" > "$HERE/$G-floor.txt"
node "$V1" --ground "$G" --level "$TOP" --gear bis --seeds 4 --hours 12 --settle 4 --workers "$W" --only base:steady --json "$HERE/$G-top.json" > "$HERE/$G-top.txt"
node "$V1" --ground "$G" --level "$MID" --gear mid --seeds 4 --hours 12 --settle 4 --workers "$W" --only base:steady --json "$HERE/$G-check.json" > "$HERE/$G-check.txt"
