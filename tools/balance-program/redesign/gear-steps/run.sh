#!/usr/bin/env sh
# tools/balance-program/redesign/gear-steps/run.sh — the Lab runs behind lane/gear-catalogue-steps (C-2 on the derived catalogue, and every
# weapon family's four on its band). Each writes <name>.json and <name>.txt here. From the repo root:
#   sh tools/balance-program/redesign/gear-steps/run.sh [first-run-name]     (from that run on; all of them with none)
set -u
V=tools/balance-program/redesign/v1-climb.mjs
O=tools/balance-program/redesign/gear-steps
FROM=${1:-}
run() { name=$1; shift; if [ -n "$FROM" ] && [ "$name" != "$FROM" ]; then echo "$name skipped"; return; fi; FROM=; node $V --seeds 6 --hours 12 --workers 18 --risks steady "$@" --json $O/$name.json > $O/$name.txt 2>&1; echo "$name exit $?"; }
# the standard mixed four (hammer, bow, mage, healer): the shipped tier each way, weapon and armor together and apart
run muster-L60 --ground muster_barrows --level 60 --only base,back,up
run hasks-L52 --ground hasks_ford --level 52 --only base,back,up
# the band's ends: Muster at 70, Hask's at 45
run muster-L70 --ground muster_barrows --level 70 --only base,back,up
run hasks-L45 --ground hasks_ford --level 45 --only base,back,up
# every weapon family in a mixed four (sword and shield, crossbow, hatchets, the sword two-handed beside a crossbow)
run muster-L60-swordtank --ground muster_barrows --level 60 --only base --styles tank,crossbow,mage,healer
run muster-L60-axes --ground muster_barrows --level 60 --only base --styles axes,bow,mage,healer
run muster-L60-sword --ground muster_barrows --level 60 --only base --styles sword,crossbow,mage,healer
run hasks-L52-swordtank --ground hasks_ford --level 52 --only base --styles tank,crossbow,mage,healer
run hasks-L52-axes --ground hasks_ford --level 52 --only base --styles axes,bow,mage,healer
# the power step's own move for a whole kit one tier each way (the candidates re-cut for the scale view; GEAR_SCALE_STAT_PM does not touch it):
# view-0/muster-L60-kit-*, view-0/hasks-L52-kit-* (the step reads danger.js itemLevelOf, the view gear-stats.js itemLevelOfRow), and on the
# set's own tree before this lane before-muster-L60-kit-ahead. view-0/ is the same plan at GEAR_SCALE_STAT_PM 0.
