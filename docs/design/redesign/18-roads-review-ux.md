# 18. The Roads: UX review

Art Director review of the Talents map in `17-talent-tree.md` and `17-talent-tree-sketch.html`, for Tyler's review of the Roads (2026-11-22). **The concept stays.** A road map out of Havora, where you reach border towns, find crossroads and swear vows, is the right fantasy and reads as ours. Everything below is about making that map readable and easy to plan on. It cuts no depth: all 635 nodes stay.

Mock: `18-roads-ux-mock.html` uses the sketch's own geometry, read at run time and redrawn. Serve the repo root over http so the game's fonts load. Shots are in `art/review/roads/`: `before-*` are the sketch and `after-*` are the mock.

---

## 1. What I saw (the sketch, as rendered)

Rendered in headless Chrome at 1180 x 660 and 922 x 423, with 2x crops of the dense areas.

| # | Problem | Evidence | Impact |
|---|---|---|---|
| P1 | **Labels are illegible on desktop.** The 1600 x 900 map is fitted into 860 x 550 (scale 0.54), so every 12 px label draws at 6.4 px and a milestone at 3.8 px. That's well under the 14.5 px floor (`ART_DIRECTION.md` section 10) | `before-desktop-1180x660.png` | The default view can't be read at all |
| P2 | **Labels collide.** "Heavy Casting" sits under a town, "Twin Rend" under "Butcher", "Spring Tide" over "Green Sickness", "Cold Iron" over "Fire Focus", and CLUB and SWORD are cut by roads | `before-desktop-crop-shield-border.png`, `before-desktop-crop-dual-axe-club.png` | You can't tell which name belongs to which stone |
| P3 | **Restoration is about 3x as dense as any other country.** It has 116 nodes in the smallest region: 12.0 nodes per 10k map units against 3.5 to 5.3 everywhere else (measured from the sketch's polygons). Six move roads fan out of one hub inside 97k units | `before-desktop-1180x660.png`, bottom centre | The healer's home country is the hardest place to read |
| P4 | **Red vows outshout everything.** 42 saturated red stones are the loudest marks on the map, louder than your own gold path. Red's role is danger only (tokens.css section 3). The rounded stones also read as headstones | `before-desktop-1180x660.png` | The eye goes to 42 things you can't buy yet, not to where you stand |
| P5 | **Gold noise.** Every locked waystone is a gold ring (`.way.lock` uses gold-3). Gold should mean owned or interactive, so 52 waystones scatter false gold across the map | crops | Owned and not owned look alike from a distance |
| P6 | **Can-buy and locked look the same.** The open state is a thin gold-2 outline on bg-0, and the locked state is steel on bg-2. At 3.8 px you can't tell them apart | `before-desktop-crop-shield-border.png` | "Where can I go" has no answer at a glance |
| P7 | **Crossroads pips blur into blobs.** Three 4.5 px option circles touch the diamond, so a fork reads as a cluster, not a choice | crops | The build-defining nodes look like debris |
| P8 | **The road hierarchy is upside down.** Border roads are strong dashed gold, move roads are faint, and vow roads (`--red-bg` at 16% alpha) are nearly invisible, so vows float with no visible link | crops | The paths are hard to follow, which was Tyler's named concern |
| P9 | **No route, cost or requirement preview.** The card shows the node only. The phone card's main control is a dead "Locked" button | `before-phone-922x423.png` | "What does it cost to get there" goes unanswered |
| P10 | **No orientation on the phone.** It's zoomed in with no minimap, no "you are here" and no recenter. Seven country pills sit along the foot with none marked as current | `before-phone-922x423.png` | You get lost after one drag |
| P11 | **Chrome is off-spec.** It uses system-ui instead of `--f-display`/`--f-ui`, pills for every chip (`ART_DIRECTION.md` section 9 allows pills only on true toggles), rounded cards and no Forged Steel frame. On desktop, 290 px of empty side card sits beside a letterboxed map | `before-desktop-1180x660.png` | Reads as a generated dashboard, not the game |

---

## 2. Recommendations, by player impact and cost

| Rank | Recommendation | Fixes | Impact | Cost |
|---|---|---|---|---|
| 1 | **Three zoom tiers with screen-size labels** (section 3). Labels and stones keep their pixel size at every zoom, so zooming adds room, not size. Each tier shows only what reads at its scale | P1, P2, P7 | Very high | Medium: one map renderer with a tier table |
| 2 | **Open on your frontier at Road view**, not on the whole map. Add Recenter and a minimap | P1, P10 | Very high | Low |
| 3 | **Route preview on select** (section 5). Tap or click any node, however far: the path draws dashed gold and a cost badge appears. The card shows the cost, Reach at Level N, what's on the way and what it opens | P9 | Very high | Medium: shortest path on the node graph, all client-side over catalogue data |
| 4 | **One node language** (section 4). Shape and size tell you the kind and fill tells you the state. Four states: Locked (dim steel), Can buy (bright ink ring), On route (gold ring on gold wash), Owned (solid gold) | P4, P5, P6 | High | Low |
| 5 | **Rebuild the road hierarchy.** The trunk from Havora is 5 px, a move road 3 px, a side path a 2 px dotted line, a vow road a solid 2 px line and a border road 3 px with two gate ticks. Owned is gold at the same width. Nothing that isn't owned is gold | P8 | High | Low |
| 6 | **Make each country's room match its node count.** Restoration needs about 2.5x its area: widen its wedge into the Havora heartland and push Sword and Shield outward. Target a density of 4 to 6 nodes per 10k units for every country | P3 | High (healers) | Medium: layout pass, Art lane |
| 7 | **The phone is a full-screen map with a slide-out sheet** (section 6). Pinch moves between tiers, tap selects and draws the route, and the sheet slides in from the right. Country view has a country list on the left | P10, P11 | High (mobile) | Medium |
| 8 | **Draw the chrome to the spec:** the steel frame, a Cinzel title band, plain stats with no pills (the only toggle is Spend as suggested), the gold plate for Save and nothing else, and filter toggles (Vows, Crossroads, Towns) plus Find talent | P11 | Medium | Low |
| 9 | **Build preview in two layers** (section 7). The Talents footer shows the draft's changes from catalogue numbers. "Test on the dummy" opens the existing hunt analyzer on a server dummy run. No separate build analyzer screen | brief 6 | Medium | Low for the footer. The dummy run is the 17 section 10 server surface |
| 10 | **Hide unowned vows in Country view** (the Vows filter shows all 42 at any tier). Vows show from Road view down | P4 | Medium | Trivial |

---

## 3. Zoom tiers

Sizes are screen px and never scale. The map scale changes the gaps between stones, not the stones.

| Tier | Scale (map units to px) | Shows | Labels | When |
|---|---|---|---|---|
| **Country** | Fit, about 0.53 desktop and 0.37 phone | Regions, Havora, trunks, move roads, border roads; crossroads (14 px), towns (16 px), owned vows | Country name (Cinzel 21 px) with "29 of 76" under it, Havora, owned vow names | First open of a new build, planning across countries, the phone's jump list |
| **Road** (default) | 0.9 to 1.1 | Every node. Option pips stay hidden inside the diamond | Move names (`--f-label`, 14.5 px, gold when owned), vow names, town names, country names as watermarks | Opens here, centred on the newest owned node |
| **Node** | 2.5 | Every node. Crossroads open into a **signpost**: three named option stones on spokes. Milestone values show within about 190 px of the selection | Everything in Road, plus option names and "+2% armor" or "+1 rank" on milestones | Choosing a fork, reading values |

- **Label rules:** labels are placed in priority order: Havora and countries, then owned move names and the selection, then move names, town names, vow names and milestone values. A label tries up to ten spots along its road or around its stone and drops out if all are taken. Only decision stones (crossroads, towns, vows) block labels. Milestones and roads don't, because each label has a 4 px bg-0 halo.
- **Wheel and pinch snap between tiers** at 0.7x and 1.8x, with free zoom inside a tier. Double-click or double-tap zooms one tier in on that point.
- **Filters** (Vows, Crossroads, Towns) brighten their kind and dim everything else to 35%, at any tier. **Find talent** searches node, option and vow names, then pans to the result and selects it.

Shots: `after-desktop-country-1180x660.png`, `after-desktop-road-1180x660.png`, `after-desktop-node-1180x660.png`.

## 4. Node language

Shot: `after-legend.png`. Each kind has its own shape and size, so you can tell them apart in silhouette before colour.

| Node | Mark (Road view) | Why |
|---|---|---|
| Milestone | 8 px square stone | The quietest mark: 480 of them, each worth about 2% |
| Waystone | 12 px ring with a centre dot | Bigger than a milestone, but steel until owned |
| Crossroads | 20 px diamond with a centre dot | The decisions, so the biggest common mark |
| Hybrid crossroads | 20 px diamond with an inner diamond in gold-3 | Solid lines instead of dashes. Dashes break up into noise below 20 px |
| Border town | 20 px gabled house, with two gate ticks across the border road | The gate ticks make it read as a crossing |
| Vow | 14 x 24 menhir: wide foot, broken top, one carved band | Tallest mark. A menhir, not a rounded headstone. Steel until owned |
| Hybrid vow | The same menhir split by a gold-3 line | Two countries |
| Open road | Three dots | Unchanged |
| Havora | 54 px hearth house with its flame (`--scene-lit`) on a bg-2 yard | The one anchor |

States, the same for every kind: **Locked** (bg-3 fill, steel edge) · **Can buy** (bg-0 fill, 2 px `--ink` ring: the frontier lights up white) · **On route** (gold wash, 2 px gold-2 ring) · **Owned** (solid gold, gold-2 edge). A gated node next to an owned one, like the hybrid crossroads waiting on a Restoration crossroads, stays Locked, and its card says why. **Selected** is four gold corner brackets, which suits forged steel better than a dashed ring. Red appears only on costs in the card (−30% healing). It's never a node colour.

## 5. Route preview

Select any node and you get:

1. **On the map:** the shortest path from your owned nodes as a dashed gold-2 line. Stones on the route turn On route, and a gold badge on the target shows the point cost.
2. **In the card, Route section:** Cost (gold) · You have (points) · Reach at Level N (current Level + cost − points) · On the way (n stats, n ranks, plus any crossroads you'll have to pick) · Opens (what the target unlocks) · Requires (each gate with Owned, or "n points away" in red).
3. **Plan route** adds the whole path to the draft. The draft pays as points arrive, and Spend as suggested follows the plan. Save stays the one gold primary.
4. On a gated node the card lists each requirement. **Show route** draws the route to the nearest node that meets it. This replaces the sketch's dead "Locked" button.
5. Hover (desktop) or a first tap (phone) previews. A click or a second tap selects. Esc or tapping empty map clears.

The mock's sample: Greater Mend crossroads I, 7 points by the sketch's geometry (3 stats and 3 ranks on the way, then the fork), reached at Level 39. 17 section 15 says 9 points from the border, so the sketch draws fewer ranks than section 4 counts. The real layout should come from the catalogue.

## 6. Phone (922 x 423, landscape)

Shots: `after-phone-road-922x423.png`, `after-phone-country-922x423.png`.

- **Layout:** a 40 px band (Talents, Points, Vows, the Suggested toggle, Build, Close) and a 46 px foot (the tier switch Country / Road / Node, Recenter, Cancel, Save). The map uses everything between them, 916 x 331.
- **Sheet:** 300 px from the right edge, over the map, with a grip. The camera shifts so the selection sits left of the sheet. Swipe right or tap empty map to close it. The sheet lists options as compact rows, then one Cost line ("7 points · Level 39") and Plan route.
- **Gestures:** pinch to zoom (snaps to tiers), one-finger drag to pan, tap to preview and draw the route, tap again or tap an option row to take it into the draft. A long press shows the tooltip without selecting. Double-tap zooms one tier in.
- **Touch targets:** stones keep their drawn size, and a tap snaps to the nearest node within 22 px. At Road view on the phone (0.92), milestones are about 29 px apart, so a snap never picks the wrong neighbour. Below 0.7, taps select countries, not nodes.
- **Country view:** a 196 px country list on the left (name and "n of N", tap to fly there at Road view) replaces the seven pills. The ring fits beside it.

## 7. Where the build preview lives

**Decision: inside Talents, as a draft line, plus the existing hunt analyzer for the measured run. No separate build analyzer.**

| Layer | Where | What | Server |
|---|---|---|---|
| Draft line | Talents footer, left of Cancel/Save (desktop). On the phone, the sheet when no node is selected | The draft against the current build, from catalogue numbers: "Healing +4% · Max health +2% · Mana a minute −3%". With Details on, exact values | None. Display only, and nothing can spend it (CLAUDE.md section 6) |
| Vow and fork fit | The node card | "Best for" and "Weak on" from 17 section 7, as two rows | None |
| Measured run | **Test on the dummy** (a text link in the footer) opens the **hunt analyzer** as a window (a sheet on the phone), with the source set to Dummy and a Current / Draft column pair | Damage, healing and mana a minute, the same columns as in a hunt | 17 section 10's dummy run (rate-limited, no XP or loot) |

Why not a separate analyzer: players already read the hunt analyzer, and a second screen with its own stats vocabulary doubles what they have to learn. It also pulls theorycrafting away from the map, which is the fantasy. The Build planner's saved plans and share codes belong in the Build menu on the Talents band (the "Build: Everyday" well), not in a new window.

## 8. Identity notes

- **Keep:** the gold road out of a lit hearth, countries as regions, border towns on the border.
- **Add:** gate ticks on border crossings, menhir vows, the signpost fork, a Cinzel country name with its count, steel corner brackets. All of it is drawn in tokens with no glow, gradient or texture, so the world stays the only painted thing.
- **Never:** starfield dots, glowing nodes or circular wedges. Each of those turns it into a generic skill tree.

## 9. Hand-offs

| To | What |
|---|---|
| Game Designer | Section 5's route counts against 17 sections 4 and 15 (the sketch draws 3 ranks before Greater Mend's fork; the table says 4). Also confirm "Plan route" as a draft that pays as points arrive |
| Art (layout) | Restoration's area at about 2.5x (P3), countries sized by node count, and the final menhir, gate and signpost marks drawn as pixel art at the tier sizes in section 3 |
| Systems | The node graph with edges, shortest path and gates as data, so the client can preview routes without a server call. The server still checks every spend (17 section 10) |
| Backend | The dummy run feeding the existing analyzer with a Dummy source and a Current / Draft pair |

## 10. Mock limits

The mock is static: six frames drawn by one script, with no pan, zoom or click. The route is "trunk from Havora, then along the target's road", not a real graph search. Restoration keeps the sketch's cramped geometry (P3 is a layout job, not a rendering fix). Country names at the window's edge can touch the frame in Country view.
