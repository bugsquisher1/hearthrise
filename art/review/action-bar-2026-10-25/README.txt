ACTION BAR SAMPLES, 2026-10-25 (art director; samples only, nothing in src/ changed)
Tyler: "fixing the fucking action bar, it is atrocious. send me samples."
All shots are the REAL client (play.html) on the window tests' stubbed server, mid-hunt in the Mill Cellar. The hero
is a Level 29 Healer (staff): Greater Mend, Protective Ward, Circle of Renewal, Mend, Green Sickness, own and store
trout, own and store carrot juice, a Cooked Lobster slot that has run out (struck), and the rest of the 20 empty.
Every number, icon and name comes from the client's own render of that envelope.

FILES
  current-1440.png / -1440-bar.png (bar at 2x) / -844.png / -844-bar.png / -667.png      today (v0.2.45)
  sample-a-*.png  sample-b-*.png  sample-c-*.png   the same shots per sample (+ -667.png: fits a 667x375 phone)
  configure-current-*.png                           Configure action today (Items mixes food, drink and ammo)
  configure-sample-food-*.png  configure-sample-ammo-*.png   Ammo on its own tab (a Ranger's view)
  shoot.mjs (node art/review/action-bar-2026-10-25/shoot.mjs [current|a|b|c|configure]), samples.js, samples.css

WHY TODAY READS AS ATROCIOUS (read current-1440-bar.png, 2x)
  - The circle is three drawing languages in one object: a pixel iron bezel with four white tick nubs at 12/3/6/9
    (a clock face), smooth anti-aliased SVG arcs laid on that x2 pixel art (two pixel densities), and a gold XP arc
    under the text. "XP 40%" is wider than the inner disc: its X and % sit on the ring.
  - Half the bar is empty-slot furniture: slots 11-20 are ten identical boxes, each with a number AND a "+".
  - Every filled slot carries two corner labels (slot number top-left, count bottom-right); the ruling is one count.
    The "1" breaks into slot 1's icon frame.
  - The struck slot (10, Cooked Lobster) shows a padlock in a ringed circle over the icon and a 12 px red tick in one
    corner: you cannot see which item ran out, or that the slot is struck.
  - "Food x23" and "Charm" are slot-sized sockets with word labels: they read as slots 21 and 22, and "Food x23"
    repeats slot 6's count.
  - Readouts are lopsided: HP is one line with no regen, MP is two; they float at the ring's top third, on no slot
    row; the stamina hangs below the grid's bottom edge.
  - Protective Ward and Mend have no spell art (the sparkle fallback) beside three painted, orange-framed spell
    icons: two icon languages in five slots (Asset Director, HANDOFFS).
  - Phone: at 844 the ring is ~60 px and "XP 40%" spills out both sides; HP is 2 lines, MP 4. At 667x375 the bar is
    clipped at 660 px: slot 10 is cut and the setup corner (name, check, sliders) is off-screen (sliders at x 820).

WHAT ALL THREE SAMPLES DO
  - The vitals hub is pixel art: a canvas at art resolution painted pixel by pixel from the world palette (steel,
    blood, frost, gold, shadow ramps), lit from the upper left, shown at x2. No CSS circle, no SVG arc.
    HP left, mana right, Level + XP % inside, stamina under, HP/MP numbers with regen either side, Food + Charm below.
  - A slot face is the icon and ONE count (a rune spell shows the runes it burns, carried). No slot numbers on the
    face: priority is in the tooltip and Configure action ("Slot 3, tried after slot 2").
  - Empty = a sunk well with a 1-art-px steel "+"; the NEXT slot to fill (first empty in priority order) has a gold "+".
  - Out = the icon still readable (dimmed), a 2-art-px pixel staircase strike corner to corner, its count 0 in red.
  - Food and Charm: small sockets with no word labels (count on Food; the tooltip names them).
  - The setup corner is as it was before the 10-24 mocks: SETUP, the name, the check, the sliders.
  - Every sample fits 667x375 with the setup corner in view (shoot.mjs measures it).

A  FORGED RING. Keep today's floor plan, redraw every part on one grid.
   44 art px ring: HP/MP in a channel notched every 10%, a gold XP ring, a sunk disc. Stamina on a small steel tab
   under the ring. 108 px tall (today 126). Fixes: the circle's art, the clutter, the lopsided readouts.
B  CROWN. The hub is the centrepiece.
   64 art px horseshoe: thick HP/MP crescents from 7:30 and 4:30 up to the top with a lit edge, the bottom quarter a
   steel base the stamina sits on, rising over its own tray. The slots sit in separate steel trays with the world
   between them. On a phone the trays join into one plate and the crown still rises through its top edge.
   Fixes: the circle (one big readable object), hierarchy (one focal point), the bar no longer a slab.
C  BEAD STRIP. The lowest, quietest bar.
   Each side's ten slots are one sunk grid (cells, not ten boxed sockets); HP/MP are 8 gems a side in a dark band;
   the 40 art px ring is sized to the two slot rows. Fixes: clutter (the empties become one quiet surface), height.

MY PICK: B. It keeps the concept Tyler likes and makes the circle the best-drawn thing on the bar instead of the
worst: a readable horseshoe you can judge at a glance, the stamina on its base, everything else quiet around it.
The trays let the world through, and on a phone it is the same object. A is the safe fallback (same plan, fixed
art). C's gems read as decoration more than a gauge; I would not ship them.

CONFIGURE ACTION: AMMO ON ITS OWN TAB (Tyler 10-25)
  Tabs: Spells | Runes | Food & drink | Ammo.
  Food & drink: a Food run "restores HP" (each row +N HP) and a Drink run "restores mana" (+N mana), one cooldown
  note under them. Ammo: "Arrows and bolts, what your bow or crossbow fires", each row says what fires it (bow /
  crossbow / the loaded ammo), its damage, gold a shot and what you carry.
  Every supply kind in the catalogue and its home:
    food (heal)   19 own + 5 store          Food & drink > Food
    drink (mana)   6 own + 6 store          Food & drink > Drink
    arrows         9 own + 7 store          Ammo (fired by a bow)
    bolts          1 own + 1 store          Ammo (fired by a crossbow)
    runes         30 own (5 tiers x 6) + 6 store   Runes tab (they fuel spells; Tyler 10-23)
    whetstones     7 (kind ammo, Melee)     the gear's ammo slot, worn; no bar action (tableOf already drops them)
    buff meals    11 (kind buff: Tomato Soup, Hunter's Feast, ...)   NO HOME TODAY: not in CONSUMABLES, so no slot can
                  eat one. Game Designer call: a third "Meals" run under Food & drink, or out of hunts (DISCOVERIES).
  The phone sheet (844) keeps the real window's layout; its list area is short at 390 px tall (a separate fix).

FOR THE BUILD (after Tyler picks)
  - The ring is drawn at runtime on a canvas at art resolution (or baked per fill step); widths stay whole art px.
  - A rune spell's corner count = the runes of its family carried (familyCount on the server inventory).
  - The struck and next-to-fill states come from the same server reasons the bar reads today (reasonOf).
  - Two spell icons are missing (Protective Ward, Mend): Asset Director.
