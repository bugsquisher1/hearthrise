ACTION BAR MOCK, 2026-10-24 (art director; mock only, nothing in src/ changed)
Tyler: "the inside of this needs cleaned up a ton. that circle is disgusting for one." Two clean interiors in the
approved Forged Steel language (skin 1). The Lv/XP medallion and its HP/MP arcs are gone. Every number shown
is the real client's, read from the server's envelope.

  today-*  = v0.2.38 today     v1-* = COLUMN     v2-* = BAND
  <v>-town-1440.png      in town, 1440x900 (the QA hero's numbers: Level 38, HP 592/592, MP 470/470, XP 75%)
  <v>-hunt-1440.png      mid-hunt, 1440x900 (the hunt test's party of two in the Mill Cellar)
  <v>-hunt-1440-bar.png  the bar alone, mid-hunt, at 2x device pixels (judge the pixel art here)
  <v>-hunt-922.png       mid-hunt on the phone, 922x423

Both variants:
  - The window's thin steel frame and steel grain.
  - Empty slots are dark wells, with no number and no "+" until the pointer is on one. A filled slot is a lit
    well with its number.
  - HP and MP are slim bars with their numbers. Level is plain gold text. XP is a thin gold bar with its %.
    Stamina sits beside them.
  - Food and Charm are two labelled sockets.
  - The setup is "SETUP Hunt" with two worded buttons, Setups and Fight settings (they were icons).
  - Gold only on the Level, the XP bar and the setup's name. No rivets, no medallion, no glow, no gradient.
V1 COLUMN: the vitals stand in a column at the bar's left; the twenty slots in one 10 x 2 grid; supplies; setup.
  Closest to today's shape. 122 -> about 120 px tall on desktop.
V2 BAND: the vitals run as one band along the bar's top; one row of ten slots under it. The second row appears
  once any of slots 11 to 20 is bound (WORLD_SHELL's rule). Lower (about 100 px), and the readouts are longest,
  so HP and MP read at a glance.
Phone (both): one row of slots until row 2 is bound, so the bar stays at about 90 px, under the 96 px HS-22
  allows. v1 moves stamina up beside the Level; v2 puts the setup's name on its buttons' line.

My pick: V2 BAND. HP, MP and XP read at a glance in one line. It is the lowest bar, so it hides the least of the
  world, and on the phone it is the same object with no re-layout.
Open for the build: with row 2 hidden, an empty slot to add to must show at the row's end (the
  first free slot, quiet until hover). The bar's files belong to the spells merge, so the bar build waits
  for Tyler's pick and that merge.

Files: mock-bar.js (rebuilds the interior in the page from the real hub's numbers), bar.css (both variants,
tokens only, the skin-1 frame and grain from ../ui-skins-2026-10-24/), shoot-bar.mjs (the real client headless on
the window tests' stubbed server; nothing reaches the live server).
