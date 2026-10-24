HD (64 px) bow and crossbow icons - a judging mock, 2026-10-24
==============================================================

Question (Tyler): should we redraw the bow and crossbow icons in the sandbox's
"higher quality" to see what that looks like in game?

This is a mock. Nothing under src/** or assets/icons-bundle/** changed. The
in-game pictures were made by swapping image sources in the browser pane only.


WHAT TO LOOK AT (best first)
----------------------------
1. bag_x2_today_vs_hd.png  Brannoc's bag (Gear tab) in the live client, left with
                           today's icons, right with the HD bows. Drawn at the x2
                           density: what a 2x screen (4K at 200%, Retina, most
                           phones) shows. 1:1 capture.
2. contact_sheet_4x.png    Today's 32 px row against the HD row, each icon at 4x
                           its in-game size (same screen size per icon).
3. contact_sheet_1x.png    The same two rows at the real in-game size.
4. bag_x1_hd_dpr1.png      The whole Inventory window on a 1x screen (1080p at
                           100%): the HD art cannot be drawn there (see below).
5. phone_922x423_hd_dpr1.png  The phone layout at 922x423, 1x. The pane scaled
                           this capture to 800x367, so it is soft.
6. experiments_4x.png      Left to right: longbow (kept), longbow pilot B
                           (rejected), duskwood r1 (rejected), duskwood r2 raw,
                           the 1-generation pixflux try (a stick), the 2x2 sheet.
   bag_x2_today.png / bag_x2_hd.png are the two halves of picture 1.
   hd64/*.png are the ten cleaned icons (64x64); raw/*.png what PixelLab returned.
   pixellab_jobs.json has every job id, seed, prompt and cost.

The set: shortbow < longbow < maple < yew < runewood < duskwood on the wood,
finish and fittings ladder (cord, leather, horn, bone and bronze, steel and runes,
gold), alphaheart as the bone-and-fang unique. Every bow is a stave and a string
with no stock. The three crossbows differ: practice is plain pale pine lashed with
rope and has no metal; oak is dark wood with a dark iron prod; willow has a bright
steel prod, brass fittings and a foot stirrup.


THE HONEST READ
---------------
Does HD beside 32 px look like mixed styles? Yes. ART_DIRECTION's one-density
rule predicted it, and the bag shows it. The HD pixels are half the size of their
neighbours'. Their outlines are half as thick (a 1 px string beside 2 px
outlines). They use more tones (13-32 colours against 8-18), with softer
Pro Flash shading. The palette and the outline colour are shared, so it is not
as jarring as putting painted art beside pixel art. You can still pick out the
HD row at a glance. The thin bows suffer most. They turn into fine diagonal
lines that read smaller than the chunky gear around them. The crossbows hold up
best.

On a 1x screen it is plainly worse than today. A 64 px icon in a 32 px pocket
loses every other pixel, and the bows break into dotted sticks
(bag_x1_hd_dpr1.png, phone_922x423_hd_dpr1.png). At 1.5x (the usual Windows
laptop scaling) and 3x (many phones) the art pixels come out uneven. Only at
exactly 2x does each art pixel land on one screen pixel.

Something the mock turned up: the bag is already not on the world's density.
The town draws one art pixel as 2 CSS px (src/world/core/camera.js DENSITY 2).
Almost every icon slot is 32 CSS px for 32 px art, which is 1 CSS px per art
pixel: the pockets, the doll, the item line, loot rows and the hotbar
(windows.css .hw-pocket/.hw-slot/.hw-line/.hw-loot-row/.hw-worn, hunt.css
.hh-icon; phone hotbar sockets are 28). That is already the hd64 sandbox's
density (64 px tile at x1). So:
  - today's 32 px icons in today's pockets already match an hd64 world;
  - HD icons in those pockets are 2x finer than the sandbox and 4x finer than
    the town;
  - to show HD icons at the sandbox's density, every slot would have to double
    to 64 CSS px.

What moving ALL item icons to hd64 would cost
  Icons: assets/icons-bundle holds 1188 PNGs. The active pixel set is 562:
  pixel/items 530 + pixel/abilities 13 + pixel/supplies 19. The other 626 are
  other languages: hearthfire 491, painted 102, resources 21, buildings 10,
  medieval 2.

  Generations: this run spent 67 of the 80 cap. The subscription paid for all
  of it; credits stayed $0.00 before and after. 55 of those went on single-icon
  Pro Flash calls (5 each) for the 10 keepers, about 5.5 per icon (1 in 10
  needed a reroll and a hand fix). The other 12 were the pilot and two
  experiments.
    - single icons:  562 x 5.5-6  = about 3,100-3,400 generations
    - 2x2 sheets:    6 per 4 icons = about 1.5-2 per icon, about 850-1,100
                     generations (one sample worked first try; slightly
                     thinner shading)
    - pixflux, 1 per icon: failed (it drew a stick)
  The plan has 10,000 a cycle; 5,140 are left until 2026-11-14. Every new item
  after that also costs about 5 generations for its icon. Today a 32 px icon
  can be scripted for free (tools/world-art/longbow-icon.mjs).

  Lanes: §10 says start with a sample of about 5, then batches of 20 or fewer,
  each audited. That is about 28 batches. At 2-3 batches a lane, that is about
  10-14 art lanes, plus one code lane:
    - tests/pixel-icons.mjs pins 32x32 (lines 98 and 144);
    - bits.js writes width/height 32;
    - every icon slot in windows.css and hunt.css goes 32 -> 64 CSS px. The bag
      grid roughly doubles in width, and the phone sheet drops to about 4
      columns;
    - the doll, item lines, loot rows and hotbar get re-laid out.

Would the world and frames have to move too? Yes, for it to look right. HD
icons only sit at the sandbox's density in 64 CSS px slots. Once the slots
double, the town world (2 CSS px per art pixel) becomes the odd one out. The
pixel frames, the gear figure and the cursor (also x2 today) go with it. Moving
the icons alone gives the mixed-density bag in picture 1. This is the sandbox
question, not an icon question: decide the world first, and the icons follow in
the same move or not at all. If the world does move to hd64, today's 32 px
icons in today's pockets already match it. A redraw would then be for detail,
not density, and would need the bigger slots.

Worth taking now, whatever the world does: the drawings themselves. The 32 px
set's real problem is how the bows are drawn, not their resolution. Maple, yew,
runewood and duskwood are drawn as crossbows, and the three crossbows are one
picture. Redraw those at 32 px (free and scripted, like longbow-icon.mjs), using
these HD ones as the reference for shape and tier ladder.


HOW IT WAS MADE
---------------
Art: PixelLab create_image_pro_flash at 64x64 on the hr-world-56-v2 palette (all
56 colours passed as the palette). The style reference is the sandbox's own
barrel (art/world/sandbox64/sandbox_barrel.png, Pro Flash s1), with the
sandbox's prompt wording (clean shading in a few tones per material, single
dark outline, lit from the upper left, no background, no shadow).

The sandbox's own method, today's art at x2 as the size reference, was tried
first (pilot B). It copied the old silhouette, so the bow came out small and
upright. The barrel-as-style-reference route (pilot A) filled the canvas on the
diagonal, and every keeper used it. Bows used seed 2401 and crossbows 2410, so
each ladder shares a composition.

Clean-up, deterministic (rules recorded in hd64/_cleanup.json):
  - exact 64x64, hard alpha;
  - every pixel checked against the 56 colours (0 needed snapping);
  - a 1 px #0b0a0c outline added only beside edge pixels that were not already
    dark (the sandbox outline colour; 75-167 px per icon);
  - duskwood's missing string drawn by hand (1 px #aaa49a).
Results: fill 94-100% of the canvas (ART_DIRECTION asks 75-94%; the bows run
corner to corner), 13-32 colours. pixelart_workbench score on the longbow: 87.5
(a tool reading).

In game: the browser pane at http://localhost:8126/play.html (the v0.2.38
client, which serves R:/the game/set-v0.2.38, against the live server).
  - Brannoc holds the most bows: shortbow, practice crossbow and practice bow.
    Tyler holds 1, Wrenna 2, Fingerguns 0.
  - His two real pockets got the HD image, and 8 cloned "mock" pockets carry
    the bows nobody holds.
  - The "today" side uses this branch's new 32 px longbow, injected because
    set-v0.2.38 still serves the old one.
  - The x2 pictures are a copy of the pocket grid drawn with CSS zoom 2,
    because the pane is a 1x screen.
  - Nothing was bought, sold, equipped or started, and no hunt was touched. I
    switched the viewed hero and selected one pocket. Everything injected was
    removed afterwards, the view was returned to tyler and the viewport reset.
