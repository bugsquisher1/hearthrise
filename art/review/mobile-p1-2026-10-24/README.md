# Visual gate: lane/a-mobile-p1 (phone P1s, 2026-10-24)

Written by `node tests/phone-touch.mjs --shots art/review/mobile-p1-2026-10-24` on the window tests' fake server
(tests/_client-harness.mjs): `tests/fixtures/hunt-envelope.json` in a hunt (a party of two, premium) and
`tests/fixtures/alpha-envelope.json` in town with 30 more stacks and a tool and a glove for sale. Fonts loaded.
Phones are landscape: 667x375, 844x390, 922x423; portrait 390x844 is a touch phone (the turn-sideways card);
1440x900 is the desktop, which should look as before.

| Shot | What to see |
|---|---|
| `configure-open-*` | Configure action as opened: the top row (slot, tabs, the steel close), the sentence with "+ Add a condition" at the end of its first line, the first rows of the list, the detail pane, the foot (Empty slot, Cancel, Save). 1440x900 is the desktop modal, unchanged. |
| `configure-items-scrolled-*` | The Items tab scrolled to its last row: the column heads stuck at the top (solid), the foot and the close still on screen. 667x375 was the screen where Save and the close were off screen. |
| `configure-spells-*` | The Spells tab after the Items tab: it starts at its first row; heads over their own columns (Mana, Rune; Cooldown is the phone's hidden column, head and cells together). |
| `hunt-*` | The hunt as it opens: the analyzer is hidden on a phone, shown on the desktop (no close there: Hunt details toggles it, as before HUD layout did). |
| `hunt-analyzer-open-*` | Hunt details pressed (gold, underlined): the analyzer stacks under the hunt bar and ends above the action bar; its tabs and the 44 px close are its top row, Next level in and This hero / Party the second; the Party board is on screen (a party of two ran below the bar before). The coach card waits while the analyzer shows. |
| `hunt-leaving-*` | A pending leave: "Leaving in Ns" stands where Leave hunt was; the bar is one line, right of the Party board, the ground's name giving way first ("Details", "Leave" on a phone). |
| `settings-*`, `settings-interface-844x390` | Settings > Interface: each line is its label (44 px), 20 px boxes, the Window opacity slider a 44 px target with its sunk track. |
| `shop-*` | Buy and the amount at 40 px on a phone. |
| `inventory-tip-*` | The item tooltip: two columns on a phone, never taller than the screen. |
| `inventory-equip-*` | A long bag: the picked item's line (Equip) pinned to the sheet's foot. |
| `portrait-390x844-turn-sideways` | A touch phone held upright: the crest and one steel card. Never on a desktop or a tablet (phone-touch PH-3). |

Known, not this lane's: at 667x375 the icon row (710 px) loses its last icon and the action bar runs past the right
edge (the bar redesign and the second phone lane own them; the page no longer pans sideways because of them).
