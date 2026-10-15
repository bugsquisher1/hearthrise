# The World Shell: the game window everywhere, everything else a widget or a window over it

Art Director, 2026-10-14. This is Tyler's call after playing the town and cottage: scrap the dashboard menus and let the game fill the screen. He has since reviewed the first round of screenshots and moved the menu to an icon row at the top right ("I prefer the icons on the top right"). The mechanics are borrowed from Tibia and Huntera: a central game window, management in windows over a live world, an action bar, and an analyzer. Their look is never copied. We stay Charcoal & Gold, Cinzel + Alegreya Sans, and pixel-world first (`ART_DIRECTION.md` §2 is law). The prototype is in `prototypes/world-shell/` (§8). "Today" means b585.

## 1. Layout
| | Desktop 1440×900 | Phone 922×423 (landscape only) |
|---|---|---|
| Strip (top, 40 px) | Left: the name (Cinzel) and level. Right: gold, then the **launcher row**. Nothing else | the same; launchers 44 px wide |
| Launcher row | 8 icons, 40 px each: Bag, Gear, Skills, Home, Bestiary, Market, Chat, Settings. Icons only; hovering or focusing shows a tooltip with the label and the shortcut letter; the open window's icon is lit gold with an underline | the same row: the phone has width to spare and no height to spare |
| World | **edge to edge** under the strip. There is no side rail, frame, title or radius (audit #15) | the same |
| Pixel density | **×2**: every art pixel is 2×2 device px in town, cottage and cellar, and for icons and the gear figure (measured, `shots/uniform-*.png`). That shows 22.5×13.4 tiles | **×2**, 14.4×6 tiles |

- **ONE PIXEL DENSITY PER SCREEN CLASS (law, Tyler 10-14: "the scaling seems off").** Every art pixel is the same size on screen across the world, item icons, the gear figure, pixel frames and the cursor. The density is **×2** on desktop and on the phone, and **×3 only above about 2400 device px wide**.
  - It is chosen once per screen class, never per scene: `zoomFor` becomes this table, and **`fitZoom` is removed**. b585 mixed ×3 town, ×2 fitted cellar, ×2 icons, ×1 phone icons and a ×4 figure, and that mix is what read as "off".
  - A room smaller than the view is centred with darkness around it. A bigger room scrolls with camera follow. Zoom never changes between town, cottage and cellar.
  - Icons are one 32-px art tile: 64 px pockets, slots and bar cells. The gear figure is ×2. If that looks small, the window gets smaller; the sprite never gets bigger.
  - **How the bar fits (Coordinator ruling, 10-14):**
    - **Desktop:** the 10-slot bar is 730 px wide at ×2. When docked windows would cover it, it shifts left inside the uncovered World (the same inset rule the camera uses). It never runs under a window, and centred widgets step clear of edge-anchored ones.
    - **Phone:** the bar shows **6 slots plus a page toggle** (slots 7–10 on page 2),. **Decided (Coordinator, 10-14): the phone bottom HUD is 68 px (16%). The vitals move to the top left beside the ground chip and the bar loses its padding. One density wins over the 15% budget**, because a 64 px icon cell can't fit under 62 px.
    - The prototype pins ×2 by answering the engine's `innerHeight` read; `src/world` is untouched.
- The strip carries no bells, timers or currencies other than gold. Event and muster notices become in-world (the crier) or a toast.
- The launcher row lists only windows that exist. A launcher never opens a "coming soon".
- **Camera inset (P1, engine, before the cutover).** A docked window must never cover the hero or the target. The shell passes the covered rect to the World (`setInset({right})`). `frameView` then centres the camera inside the uncovered part. The art still draws under the window. The prototype FAKES this from outside by widening the stage leftward by the covered width. That keeps the hero and the target in view (checked: hero x 284 with 620 px of World left uncovered). A small room is centred in the widened stage, so with the bag open the cellar sits left of centre and parts of it fall under the dock. The engine fix is a handoff to the Systems Engineer.

## 2. HUD widgets: everything that sits on screen
Every widget is one row of data, and B1 builds its hunt widgets to this contract. Fields: `id`, `label`, `layer` (`world` widgets move with the dock inset; `screen` widgets can sit anywhere, the strip included), `anchor` (`t|m|b` + `l|c|r`), and `dx`/`dy` (px from that anchor's edges). Then `min [w, h]`, `opacity` (0.4–1, and hovering always shows 1), `visible`, `removable`, and `when` (`always` or `hunt`). Phone overrides go in their own `phone {…}` block.

| id | default anchor (desktop / phone) | min | notes |
|---|---|---|---|
| `launchers` | tr 0,0 in the strip / same | 320×40 | **cannot be hidden** (Esc always reaches Settings as well) |
| `vitals` | bc 0,100 / tl 6,62 | 300×16 | HP over MP. On the phone it rides the action bar's top edge |
| `actionbar` | bc 0,12 / bc 0,4 | 730×82 at ×2 (phone: 6 slots + page toggle, about 430×68) | **one row of ten** (keys 1–0); on the phone, 6 slots and a page toggle for 7–10. It shifts left inside the uncovered World and never sits under a docked window. Row 2 (Shift+1–0) appears only once something is bound to it. Slot 1 is the bound food. Leave Hunt goes here as a bar control |
| `target` | tc 0,12 / tr 6,6 | 180×48 | the foe's name in the **same face and case as its world plate** (Alegreya, not Cinzel), its level, and an HP bar (`--world-bar-foe`) |
| `ground` | tl 12,12 / tl 6,6 | 140×48 | the ground's name and **floor N of M**. A tap opens the route minimap (§3) |
| `analyzer` | tl 12,84 / hidden | 220×160 | Huntera-style: session time, kills, XP/h, loot, supplies (`--red`), profit/h (`--green`), and "settled N s ago". Read from `G._huntAnalyzer` |
| `log` | bl 12,12 / hidden | 240×120 | last 5 lines: hit, hurt (`--red`), kill, loot (`--gold-2`) |
| `chat` | bl 12,160, hidden by default | 280×120 | returns with Chat (§6) |

- **At the cutover:** show/hide per widget, opacity per widget (40–100%; hovering brings it to 100%), and **Reset layout**. These live in Settings → HUD layout (shortcut U).
- **v1.1, right after Tyler's first playable test, is Edit HUD mode.** It's toggled from Settings or U. On desktop you drag widgets: on drop, the nearest anchor is picked by thirds of the screen, the offsets land on an 8 px soft grid, and anything within 24 px of an edge snaps to the 12 px margin. The phone gets no free drag, only six snap positions per widget. While editing, widgets are outlined and named and clicks on them do nothing. The contract above already carries `anchor`/`dx`/`dy`, so v1.1 adds the interaction and nothing else. The prototype shows it, marked v1.1 (`shots/*-edit-hud.png`).
- **Storage:** the layout is a client-only DISPLAY preference (CLAUDE.md §6 residue allowlist). Nothing reads it to gate an action or spend anything. It's stored per size class (`hud.desktop`, `hud.phone`), so a phone layout never breaks the desktop one.
- **Phone budget (decided 10-14):** the bottom HUD is 68 px (16%) with the vitals at the top left (`vitals` phone anchor tl 6,62). One density wins over the old 15% budget; see §1.

## 3. Dynamic hunting: what the map data must carry (spec only; Tyler 10-14)
The hero walks to monsters, monsters walk to the hero, and a ground is an authored **route through real space across floors** (Huntera's Asura Palace is the reference). The cellar stays one room. The server owns the path the engine plays; the client only stages it. A hunt map row in `src/data/world/maps/*` adds:
- `route`: `waypoints [{x, y, floor}]` that the hero walks between pulls, looping or ping-ponging.
- `floors`: `[{id, name, map}]`. `links`: `[{from:{floor,x,y}, to:{floor,x,y}, kind:'stair'|'ladder'|'hole'}]`. The camera cuts on a link (a fade, never a pan) and the `ground` widget's floor count updates.
- `pockets`: `[{id, floor, rect, spawns:[{monster, w}]}]`. A pocket's monsters aggro on the hero and walk to it inside their leash rect.
- `spots`: `[{id, floor, x, y, kind:'node'|'chest'|'shrine'}]`.
- The camera follows the hero at `zoomFor`. A `frame` (fitted view) is only for single-room grounds. The **minimap** is drawn from `route` + `floors` + `pockets` with no new art: 168×112 on desktop, 2 px per tile.

## 4. Windows
| Window | Key | Opens from the world | The object it is (ART §6) |
|---|---|---|---|
| Bag | B | the cottage chest opens **Bank** (a tab of the same satchel) | **a satchel**: dark leather (`--sc-top-1`) with a stitched edge (`--sc-stitch`) and sunk pockets. Capacity is a thin bar plus "24 of 40 spaces used"; it shows only the pockets in use (the last row padded), never 16 empty squares. One category row. The selected item's line carries the one primary action |
| Gear | C | (none) | **a paper doll**: the hero's own world sprite at the one density (×2) on a plinth. The slots go in body order: the left column runs head to legs, the right ears to feet, and the hands sit below |
| Skills | K | the anvil opens Smithing and the woodpile Woodcutting (`TAP_OPENS`); the well opens Farming | **a ledger**: one ruled line per skill showing its level, its next unlock, and where it's trained |
| Homestead | H | the cottage door and its rooms (`openRoom`) | **a deed and plan** drawn from the cottage map's tiles |
| Settings | Esc with nothing open | (none) | plain (chrome has no object). Its primary is HUD layout |
| Bestiary / Market / Chat | L / M / Enter | the market stall | an encyclopedia / a stall ledger / plain |
| News | (none) | **the town crier** | the crier's speech bubble, then a posted bill |

- **Desktop:** a window docks at the right, and newer ones dock to its left. Dragging a title bar floats it. **The dock never covers more than 60% of the World:** a window that would cross that line closes the oldest docked one. At most 3 windows are open.
- **Phone:** one full-height side sheet, `min(400px, 48vw)`. Opening another replaces it.
- **Esc** closes the top window, or opens Settings when nothing is open. Keys are ignored while typing.
- **The World never pauses:** 38 frames in 0.6 s were measured with a window open. Windows are not modal and have no backdrop.
- **Motion:** a 120 ms slide and fade in from the dock edge, and 120 ms back out. No bounce. Reduced motion turns it off.
- **One frame for every window:** a 44 px head (gold glyph, Cinzel title, key chip, close), `--modal-bg`, a `--line` border, the `--r-lg` radius, and one overlay shadow. One primary per window, and no cards inside.
- **Icons:** pixel items are drawn at the screen's one density (§1), so ×2 = 64 px everywhere. The doll's belt is now `iron_belt`. `leather_belt` reads as a ring, which is an Asset Director handoff.

## 5. Rules check (ART_DIRECTION §4–6, DESIGN_STANDARDS), measured on the prototype
Radius tokens only (`--r-sm/--r/--r-lg`, plus 0 on the phone sheets): pass. No glow; the only shadows are on windows and the editor (overlays): pass. No gradients on controls (the only one is the v1.1 edit grid): pass. One primary per view: pass. Borders only on boxes that mean something (windows, widgets, pockets, slots): pass. Whole-number pixel scales: pass. Colour literals: 0. Windows as objects: **partial**, since Bag and Gear are objects but Skills, Homestead and the rest are one-line stubs.

## 6. The cutover (Tyler overrules the gradual swap: the game is closed and wiped)
**One change lands the shell and deletes every old screen and the tab rail.** The game only has to be playable at Tyler's test milestones.
1. **Built in the cutover:** the shell (strip, launchers, window manager, camera inset); the HUD widgets with show/hide, opacity and Reset layout; Bag (+Bank), Gear, Skills (with its gathering and crafting starts), Homestead with benches and plots, and Settings. Also two cards:
   - **the hunt-ground card**: the cellar door and the town's exits name the ground, its level band and the Start Hunt button;
   - **the away/end card**: the claim on return and the end-of-hunt summary, drawn from the server's receipt.
   Without these two cards nobody can start a hunt or claim (agreed 10-14).
2. **Deleted in the same change:** every `#panel-*` screen and the left nav in `index.html`, their controllers in `legacy.js` and `src/features/*`, and their CSS (`legacy.css`, `audit-overrides.css`, `art-direction.css`, `combat-screens.css`, `market.css`, `codex.css` and more). A rule that loses its last selector goes with it (`dead-css`). Smoke tests that opened a deleted tab are rewritten against window ids, never skipped. The visual gate re-baselines on the shell.

**What's missing after the cutover, and the order it comes back:** (1) v1.1 Edit HUD; (2) Shop at the stall NPC ("buy" is in the play gate); (3) Bestiary; (4) Chat; (5) Market; (6) Clan, Muster/raids, Trophy Room, Companions, Leaderboards and Codex. Each item in (6) must pass the `DESIGN_STANDARDS.md` §4 purpose test to return; anything that fails stays cut.

## 7. Rules the cutover keeps
**One text style everywhere (Tyler, 2026-10-15): the analyzer's.** Every HUD widget and window uses the analyzer's treatment: headings in `--f-label` (Alegreya Sans SC, bold, `--t-micro`, `--ink-3`, letter-spacing .04em), body in `--f-ui` at `--t-micro`/`--t-small` with `--ink-2` labels, values bold `--ink` with tabular numbers, and red/green only for cost/gain. That includes window titles, so the Cinzel title in the window head (§4) and in the strip (§1) are replaced by this heading style; Cinzel is kept only for the logo and big place-name banners. Tokens only. The type floor is 14.5 px (measured on the phone). No emoji. Containment is earned: a window or a widget is the only box, and inside it the object's own layout applies. Every number on screen comes from the envelope; the prototype's numbers are fixtures, labelled in `shell.js`.

## 8. Prototype
`prototypes/world-shell/index.html` is a standalone page. The game never links to it and `src/` never imports it. It boots the **real** World (`bootWorld`) over a fixture `G`, with the real item and monster catalogues and the real pixel icons. I chose a page over a dev flag because a flag would put shell code into every player's boot path before approval; this page can't reach a player and is deleted at the cutover. To open it, serve the repo root and visit `/prototypes/world-shell/?scene=town|home|hunt&open=bag,equip`. Add `&clean=1` to hide the scene switch and `&edit=1` to start in the v1.1 editor. Limits: the inset is faked (§1); the hunt is a staged fight with no server; Skills, Home, Bestiary, Market and Chat are one-line stubs.

## 9. Master Design Reference alignment (Coordinator, 2026-10-15)
- **Vitals widget shows STAMINA** next to HP/MP. Stamina is a 12 h pool: hunting spends it and time away from hunting refills it, at 1 min per min (MDR §8).
- **Hunt-ground card** includes the supply choice with Tyler's exact copy (MDR §4): "Store Supplies: Basic supplies are always available. Pay gold automatically when they're used." / "Your Supplies: Use supplies you brought with you. When they run out, end the hunt or switch to basic Store Supplies." Never say "loaned".
- **End card** shows why the hunt ended (stopped, stamina, supplies, falls), the stamina used, and the supplies split (Store Supplies gold vs own supplies used), matching the analyzer.
