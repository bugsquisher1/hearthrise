HUNTS WINDOW SKINS, 2026-10-24 (art director; mock only, nothing in src/ changed)
Tyler asked for "this exact picker in a few different visual skins, same content and layout". He ruled gray/gold
only. Every shot shows the same Hunts window with the same content: Mosslight Glade picked, the creatures facing
front on pixel ground shadows (as in v0.2.39), and the drops as chance-per-kill lines (odds from
src/data/monsters.js). Only the materials, type and controls change.

  hunts-today-1440.png                         today (v0.2.38) with the same content changes
  hunts-skin-1-forged-steel-1440.png           SKIN 1, Tyler's "B Forged Steel" reference on the real window
  hunts-skin-1-forged-steel-1440-drops.png     skin 1 scrolled: the lineup, the % per kill lines and Enter
  hunts-skin-1-forged-steel-1440-see-through.png  skin 1 at the opacity floor (60%)
  hunts-skin-1-forged-steel-922.png            skin 1 as the phone sheet, 922x423
  hunts-skin-2-carved-stone-1440.png           SKIN 2
  hunts-skin-3-tooled-leather-1440.png         SKIN 3

SKIN 1 FORGED STEEL: thin steel frame with square corner studs, dark steel grain; charcoal tokens + gold; heading
  face Cinzel (already loaded by play.html); body Alegreya Sans (the reference's book serif is not on the
  allowed list, so this is the nearest allowed face). Picked row: lighter, gold outline, gold left bar.
  Needs a ruling: Cinzel for window titles and section heads, not only place names (ART_DIRECTION §10).
SKIN 2 CARVED STONE: cut stone blocks with mortar joints; every line is a groove with a lit lip; charcoal tokens
  + the world's stone ramp + gold; heading face Jersey 15 (a pixel display face, set at its 15 px grid and
  whole multiples; one new font load). Picked row: sunk into the stone, gold chevron.
  Needs a ruling: a pixel heading face. §9 rejected a pixel font for the HUD's body text, not for headings.
SKIN 3 TOOLED LEATHER (gray): rolled leather edge, stitched rules, rounded 2-art-px corners; charcoal tokens +
  stone ramp + gold; heading face Almendra SC (a calligraphic book face; one new font load). Picked row: pressed
  into the leather, gold ribbon bookmark.
  Needs a ruling: Almendra SC as a heading face (§10).

All three apply the seven changes in Tyler's list:
  1. A pixel frame (whole x2 on the world grid).
  2. A subtle texture.
  3. A picked row with a marker.
  4. A characterful heading face beside readable body text (14.5 px or more).
  5. Creatures at one x2 scale, evenly spaced, on ground shadows.
  6. A raised gold Enter that looks pressed when pressed (drawn pixel bevel, no gradient).
  7. Clearer sections: a rule under the level line, heads with a rule running right, separate list and page panels.
They differ in material and heading face only. Nothing from round 1's rejected skin A: no rivets, no gilded
corner caps, no hanging nameplate. No glow, no gradients.

OPACITY (Tyler 10-24 "opaque ... a slider bar in the settings"):
  - Where: Settings > Interface, "Window opacity", next to the HUD layout rows.
  - Range: 60% to 100% in steps of 5. Default 100%. Floor 60%: hunts-skin-1-...-see-through.png shows every line
    still readable over the town at 60%; below that the theme text over grass and roofs starts to break up.
  - What fades: one CSS variable (--panel-alpha) drives only the fills and their texture. The frame, the rules,
    the gold and all text stay fully opaque. The sticky Enter bar stays solid, because the page scrolls under it
    and text under text is unreadable.
  - Not built yet. It ships with the chosen skin's build lane, as a client display preference on the residue
    allowlist (src/session/residue.js RESIDUE_FIELDS).

PICK: skin 1, forged steel. It is Tyler's own reference, and its character comes from type and spacing, not
  ornament. It needs no new font (Cinzel is already loaded) and stays the quietest of the three over the world.
  Build first: layout.css + s1.css into windows.css/shell.css for the Hunts window, with the art script moved to
  tools/ with a --check; then the other windows.

How the shots were made: shoot.mjs runs the real v0.2.38 client headless against the window tests' stubbed server
(tests/_client-harness.mjs), carrying the QA hero's numbers from the live pane (Level 38, its five grounds' bests).
Every skin then sees an identical state; a live hunt would have changed between shots. The skin CSS is loaded as
same-origin <link>s. Files: make-art.mjs (frame, studs, swords, diamond, stone, leather, gold button; palette
colours, x2), layout.css (the one shared layout), s1/s2/s3.css (materials), content-mock.js + content.css (the
shared content), shoot.mjs.
