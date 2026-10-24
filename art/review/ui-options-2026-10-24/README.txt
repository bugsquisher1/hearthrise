UI OPTIONS, 2026-10-24 (art director; design pass only, nothing in src/ changed)
Tyler asked for ideas for all the panels. Three directions that differ in kind, each mocked on the real
client as a throwaway stylesheet, plus today's look. Same four views each:
  *-inventory-1440.png        Inventory window, 1440x900, live QA hero (signed in, live server, v0.2.38)
  *-hunts-1440.png            Hunts window, 1440x900, live QA hero
  *-hud-1440.png              in-hunt HUD (party, analyzer, hunt bar, action bar), 1440x900
  *-phone-inventory-922.png   Inventory as the phone sheet, 922x423, live QA hero
  before-*  = v0.2.38 today   a-* = A Forged   b-* = B Quiet   c-* = C Rails

How they were made: the option's CSS was put on the signed-in page as an inline <style> (play.html's
CSP blocks a <link> to another port; inline.mjs prints the injectable text, images as data: URIs). The
pane captures 800 px across, so each view is four x2 tiles joined by stitch.mjs (1600 px wide). The HUD
set is the real client on the hunt-screen test's stubbed server (shoot-hud.mjs), so every option shows
the same party of two in the Mill Cellar; no live hunt was started or left. Option art: make-art.mjs
(hr-world-56-v2 colours only, x2, the tools/make-hud-bar-art.mjs pattern, no paid generation).

--------------------------------------------------------------------------------------------------
A. FORGED: every panel is an object made of the world's iron.
  Pitch: windows are riveted iron cases with gilded corner caps, cut from slate, a nameplate hanging
    over the top edge; you open a thing, not a div.
  Frames: window = 7-art-px case (a-win) with gilded corner plates; HUD widget = a lighter 5-px band
    bolted at the corners (a-hud); the strip has the same band along its foot.
  Fills: a sparse slate grain over the charcoal token (a-slate, alpha overlay; text contrast only rises).
  Type: unchanged faces; the window title is struck in gold on the nameplate (a-plaque); section heads
    gold small caps over a forged groove.
  Density: same as today.
  Controls: the picked tab / category / ground / setup is a raised iron plate (a-btn); fields and selects
    are sockets cut into the case (bar-socket); the one primary is a struck-gold plate (a-gold).
  Icons: unchanged (pixel items); party portraits sit in iron medals, yours gilded (a-medal*).
  The bar: wears the window's case (gilded corners) with the medallion breaking its top; empty sockets
    show nothing until hover.
  Phone sheet: the case's spine down the sheet's left edge, the nameplate on top.
  Hunts window: keeps the list + one ground page, the lineup on its ground line and the top-to-bottom
    read. Changes: the picked ground is a raised plate, the page is set behind a socket groove, heads are
    gold over grooves, Enter is struck gold. The coming "% chance per kill" drops fit as a ledger: icon in
    a 1-px sunk well, name, % right-aligned.
  Art: 9 small PNGs from a script (done here, palette-locked). Later, if chosen: hero-face portraits for
    the medals (Asset Director).
  Cost: MEDIUM, 2 lanes (art tool into tools/ with --check + windows/shell CSS; then HUD widgets + bar).
    CSS only, no DOM change.
  Risk: ornament creep; it makes boxes better, not fewer. A riveted frame on every HUD widget is more
    chrome over the world (ART_DIRECTION §1: the panel must not be the loudest thing). The phone bar must
    keep its 8 px band (HS-22 docks the alerts at a fixed 104 px). Mock shortcut: the 3-px plate is
    stretched to 4 px on categories and the picked ground (1.33x); the build draws a 2-px plate.
  Fixes: "boxy" PARTLY (windows, HUD and bar get three different weights instead of one hairline);
    "dorky bar" YES; "web-form controls" MOSTLY (fields become sockets; a native select still shows its
    chevron until a custom picker replaces it).

B. QUIET: the world is the frame; the UI is ink on it.
  Pitch: no frames, no wells, no rules: a window is one dark veil with a shadow, a HUD readout is
    stroked text straight on the world; type, spacing and the pixel icons carry the hierarchy.
  Frames: none. Fills: one veil per window (bg-1 at 97%); the analyzer keeps a veil (it is a table).
  Type: bigger, airier heads; place names (the hunt bar, a ground's page) in the place-name face
    (Cinzel, allowed for place names, ART_DIRECTION §10); gold only for "yours / now / the one action".
  Density: looser (24 px margins, 16-22 px between sections), so a window shows less at once.
  Controls: tabs and categories are words with a 2-px gold mark; search is an underline; selects are
    words; pockets are a faint lift of the veil.
  Icons: carry more of the load (nothing else marks a pocket).
  The bar: a dark veil, slots are lifts of it, empty slots vanish until hover. No plate, no art.
  Phone sheet: the same veil from the right edge, no frame.
  Hunts window: same structure; the ground's name becomes a place-name heading, the picked ground is
    gold with the rule beside it, sections separated by space instead of lines; the lineup's ground line
    is a hairline. "% per kill" drops: two quiet columns, no wells.
  Art: none. Cost: CHEAP, 1 lane, CSS only.
  Risk: it undoes the pixel 9-slice ART_DIRECTION §9 decided on 10-15 and the bar art that shipped on
    10-22, so the bar complaint comes back; stroked text over bright town tiles is harder to read than
    over the cellar; with no material it can read as a web overlay, the "generated dashboard" §10 warns of.
  Fixes: "boxy" YES (fewest boxes of the three); "dorky bar" NO (it removes the art); "web-form" YES.

C. RAILS: nothing floats; every panel is fastened to a screen edge.
  Pitch: the strip is the top rail, the action bar the bottom rail across the whole screen, windows
    full-height sheets from the right edge on every screen (the phone's sheet, now on desktop too), the
    party and the analyzer hang off the side edges; each panel shows the world one machined lip.
  Frames: one lip only on the side that faces the world (c-rail, lit up/left, shadowed down/right).
  Fills: flat value steps inside (bg-0 heads, bg-1 sheets, bg-2 the picked thing). The world loses its
    8 px gutter and runs edge to edge between the rails.
  Type: unchanged. Density: a sheet is full height, so a ground's page shows more without scrolling.
  Controls: flat, separated by value, no hairlines.
  Icons: unchanged. The bar: the bottom rail, full width, medallion through its lip, the setup at the
    right end; empty slots quiet.
  Phone sheet: as today (it was already a rail), now the same object as desktop.
  Hunts window: same list + page; the page sits one value step lighter than the list (master-detail by
    value, not a line); Enter at the sheet's foot; more of the lineup and drops above the fold.
  Art: one 8x8 PNG (done here). Cost: BIG, 2-3 lanes: hud.js anchors (edge docking), window-manager
    (full-height sheets, how 2-3 docked windows share the edge), and the tests built on today's dock
    (AW-17, WC-6, HS-12/HS-22/HS-26).
  Risk: NEEDS TYLER'S RULING: it overrides the 10-15 "every static element is a HUD widget, movable"
    (widgets would snap to edges, not float). Rails cost screen: the full-width bottom rail covers the
    lower corners of the world. Every window becomes the same shape (an inventory and a hunt board look
    alike again, §12).
  Fixes: "boxy" YES structurally (no floating boxes); "dorky bar" PARTLY (an architectural rail, but the
    slots are flat); "web-form" YES.

--------------------------------------------------------------------------------------------------
RECOMMENDATION: A for the things you open or touch, B for the things you only read.
  The rule: a window and the action bar are forged objects (A's case, nameplate, plates, struck-gold
  primary); the party board, analyzer, hunt bar and tally sit on the world as ink (B's stroked readouts,
  the analyzer's one veil). Why: "boxy" came from every element being the same object; this gives two
  clearly different objects and removes the frames that were never earned (the de-boxing plan's #2 and
  #3, already ranked). A alone adds chrome over the world; B alone loses the bar art Tyler asked for and
  undoes a decided rule; C is the biggest build and breaks a standing ruling for a gain the first two
  get cheaper. Compare a-hud-1440.png (forged HUD) with b-hud-1440.png (quiet HUD) and a-inventory /
  a-hunts for the windows.
  Build first (one medium lane, CSS + the art tool, no DOM change): the window case, the nameplate title,
  raised-plate selection and the struck-gold primary across all windows, plus the quiet HUD widgets.
  Then: the bar's case and empty sockets fading (plan #4), the hunt bar as a nameplate (plan #5).
  Later, with Asset Director art: party portraits as medals with the hero's face (plan #7).

Files: make-art.mjs (option art), inline.mjs (CSS -> injectable text), stitch.mjs (four tiles -> one PNG),
shoot-hud.mjs (HUD set on the stubbed server), a/ b/ c/ option.css + their PNGs.
