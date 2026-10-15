# The World Shell: the game window in the middle, everything else a window over it

Art Director, 2026-10-14, for Tyler's call after playing the town and cottage: scrap the dashboard menus, slim the rail, centre the game. Mechanics borrowed from Tibia and Huntera (a central game window, management as windows over a live world, an action bar), never their look: we stay Charcoal & Gold, Cinzel + Alegreya Sans, pixel-world first (`ART_DIRECTION.md` §2 is law). Prototype: `prototypes/world-shell/` (see §7). Screens referenced as "today" are b585.

## 1. Layout
| | Desktop 1440×900 | Phone 922×423 (landscape only) |
|---|---|---|
| Rail (left, full height) | **88 px** (today 180): glyph 26 px + a label at `--t-micro` | **56 px** (today 64): glyph only, 44 px targets, label on long-press |
| Top strip | **40 px**: name (Cinzel), level, gold. Nothing else | **34 px**, same three facts |
| World | everything else, edge to edge: no frame, no title, no radius (audit #15) | the same |
| Zoom | whole number from the window (`camera.js zoomFor`): measured **×3** town, **×2** fitted cellar | measured **×2** both |

- The strip holds no bells, buttons, timers or currencies beyond gold. Event and muster notices become in-world (the crier, §4) or a toast.
- The rail lists only windows that exist (a rail button never opens a "coming soon"). Order: Bag, Gear, Skills, Home, [Bestiary, Market, Chat as they return]; Settings at the foot.
- **Camera inset (P1, engine, required before the cutover).** The prototype proves windows hide what you came to watch: at 1440 the Gear window covers the hero, and on the phone the sheet covers the targeted rat (`shots/desktop-town-bag-gear.png`, `shots/phone-hunt-gear.png`). The shell passes the rectangle its docked windows cover to the World (`setInset({right})`), and `frameView`/`fitZoom` centre and fit in the uncovered part. The art still draws under the windows. Floating windows don't count as covering the view.

## 2. The hunt HUD (what B1 plugs into)
It's always present: **vitals** (HP over MP, two bars side by side) above the **action bar**, bottom-centre. It shows two rows of ten slots: keys 1-0, then Shift+1-0. Row 2 collapses until something is bound to it (the prototype shows it empty, and it reads as dead weight). On the phone it's one row and a swap button. In a hunt it adds the following:
- **Target frame**, top-centre (phone: top-right): name, level, HP bar in `--world-bar-foe`. Its name matches the world plate's casing (the plate says "rat", the frame "Rat": fix the plate).
- **Ground chip**, top-left: the ground's name and **floor N of M**. Tapping it opens the route minimap (§3).
- **Hunt log**, bottom-left, 5 lines (hit, hurt in `--red`, kill, loot in `--gold-2`), which expands to the settled Analyzer. On the phone it lives behind the ground chip.
- **Contract for B1:** `src/world/hunt-chrome.js` `HUD_SECTIONS` becomes four named mounts: `target`, `ground`, `log`, `bar`. Each one is a pure `model → html` like today's sections. Eat and Leave Hunt move into the bar: slot 1 is the bound food and Leave is a bar control. The model reads only the observer snapshot and `G._huntAnalyzer`, never a client opinion (CLAUDE.md §6).

## 3. Dynamic hunting: what the map data must carry (spec only; Tyler 10-14)
The hero walks to monsters, monsters walk to the hero, and a ground is an authored **route through real space across floors** (Tyler's reference is Huntera's Asura Palace). The cellar stays one room. The view needs these from each hunt map row in `src/data/world/maps/*` (the server path the engine plays stays server-owned; the client only stages it):
- `route`: ordered `waypoints [{x, y, floor}]` the hero walks between pulls, looping or ping-pong.
- `floors`: `[{id, name, map}]` plus `links [{from: {floor, x, y}, to: {floor, x, y}, kind: 'stair'|'ladder'|'hole'}]`. The camera cuts on a link (a fade, never a pan across the void) and the ground chip's "floor N of M" updates.
- `pockets`: `[{id, floor, rect, spawns: [{monster, w}]}]`, the spawn pockets along the route. A pocket's monsters aggro and walk to the hero inside its leash rect.
- `spots`: `[{id, floor, x, y, kind: 'node'|'chest'|'shrine'}]`, the node spots (gather nodes, a mid-route chest).
- **Camera:** follow the hero at `zoomFor`. A fitted frame (`frame`) is used only for single-room grounds. **Minimap:** drawn from `route` + `floors` + `pockets` (no new art). A dot for the hero, a dim line for the route, pockets as marks. 168×112 desktop, 2 px per tile.

## 4. Windows
| Window | Key | Opens from the world | The object it is (ART §6) |
|---|---|---|---|
| Bag | B | the cottage chest opens **Bank** (a second tab of the same satchel) | **a satchel**: dark leather (`--sc-top-1`), a stitched inner edge (`--sc-stitch`), sunk pockets; ONE category row; the picked item's line carries the one primary action |
| Gear | C | (none) | **a paper doll**: the hero's own world sprite at ×4 on a stone plinth, the slots in body order (left column head to legs, right column ears to feet, hands below) |
| Skills | K | the anvil opens Smithing, the woodpile Woodcutting (`stations.js TAP_OPENS`), the well opens Farming → Homestead plots | **a ledger**: one ruled line per skill: its level, its next unlock, and where it's trained |
| Homestead | H | the cottage door and its rooms (`HearthriseHomestead.openRoom`) | **a deed and plan** drawn from the cottage map's tiles |
| Settings | Esc (with nothing open) | (none) | plain: chrome has no object |
| Bestiary | L | (none) | **an encyclopedia**: region chapters, a plate per creature |
| Market | M | the market stall | **a stall ledger** |
| Chat | Enter | (none) | plain, translucent, bottom-left above the log |
| News | (no key) | **the town crier** | the crier's bubble, then a posted bill |

**Behaviour (proved in the prototype, `interact.mjs` checks listed in the report):**
- **Desktop:** a window opens **docked** at the right edge, and the newer ones dock to its right. You drag a title bar to float it. **At most 3 open**: a 4th closes the oldest.
- **Phone:** **one full-height side sheet** at the right (`min(400px, 48vw)`). Opening another replaces it. The HUD re-centres in the World that's left.
- **Esc** closes the top window. With nothing open it opens Settings. A rail button toggles its window. Keys are ignored while typing.
- **The World never pauses:** measured 38 frames in 0.6 s with a window open. Windows aren't modal and carry no dim backdrop, and a world tap still works beside them.
- **One frame for every window:** a 44 px head (gold glyph, Cinzel title, key chip, close), `--modal-bg`, a `--line` border, `--r-lg` radius, and a shadow (windows are overlays, ART §4). There's one primary per window and no cards inside.
- **Icons:** pixel items render at ×2 (64) on desktop and ×1 (32) on the phone, never in between. The world draws at ×3 beside a ×2 bag, which is a whole-number mix. Asset note: `leather_belt` reads as a ring next to `copper_ring` in the doll (an Asset Director handoff).

## 5. The cutover (Tyler overrules the gradual swap: the game is closed and wiped)
**One change lands the shell, and the same change deletes every old screen and the tab rail.** The game only has to be playable at Tyler's test milestones, not in between.
1. **Built in the cutover:** the shell (rail, strip, window manager, camera inset), the hunt HUD (§2), Bag (+Bank tab), Gear, Skills (with its gathering and crafting starts), Homestead with its benches and plots, and Settings.
2. **Deleted in the same change:** `#panel-*` screens and the left nav/tab rail in `index.html`, their controllers in `legacy.js`/`src/features/*`, and their CSS. That's a large cut from `legacy.css`, `audit-overrides.css`, `art-direction.css`, `combat-screens.css`, `market.css`, `codex.css` and more. The ratchets should drop sharply. A rule that loses its last selector is deleted with it (`dead-css`).

**Missing after the cutover, in the order it comes back:**
| # | Returns as | Why this order |
|---|---|---|
| 0 | **Hunt-ground card** (the cellar door, the town's exits) and **Away ledger** (the claim on return) | **I recommend building both IN the cutover.** Without them you can't start a hunt or claim away gains, so the core loop (reload, claim, fight) breaks |
| 1 | **Shop**, from the stall NPC | "buy" is in the play gate; seeds and food |
| 2 | **Bestiary** (encyclopedia) | the hunt's long goal; audit #9 |
| 3 | **Chat** | social, and it's a low-risk window |
| 4 | **Market** (stall ledger) | economy: Security re-reviews nothing, only the view moves |
| 5 | Clan, Muster/raids, Trophy Room, Companions, Leaderboards, Codex | each one passes the `DESIGN_STANDARDS.md` §4 purpose test before it returns, or it stays cut |

**Guards:** the visual gate re-baselines on the shell. Smoke tests that open a deleted tab are rewritten against the window ids in the same change, never skipped (CLAUDE.md §4).

## 6. Rules the cutover keeps
Tokens only (the prototype has zero colour literals). The type floor is 14.5 px (measured on the phone). No emoji. Containment is earned: a window is the only box, and inside it the object's layout applies, never a card grid. Rail and strip use `--bg-1` flat, with no gradients or glows. Every number shown is the envelope's (the prototype's are fixtures, labelled in `shell.js`).

## 7. Prototype
`prototypes/world-shell/index.html` is a standalone page, never linked from the game and never imported by `src/`. It boots the **real** World (`bootWorld`) over a fixture `G`, plus the real item catalogue and pixel icons. Why standalone and not a dev flag: a flag would put shell code in `src/` and in every player's boot path before the design is approved, while a page outside `src/` cannot reach a player and is deleted at the cutover. Open it from any static server at the repo root: `/prototypes/world-shell/?scene=town|home|hunt&open=bag,equip` (add `&clean=1` to hide the prototype's scene switch). Limits: no camera inset (§1), the hunt is a staged rat with no server, and Skills/Home/Bestiary/Market/Chat/Settings are one-line stubs.
