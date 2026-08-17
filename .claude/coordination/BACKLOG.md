# BACKLOG — product-owner requests (2026-08-08)

Triaged from Tyler's list. P0 critical · P1 major · P2 meaningful · P3 minor. Owner = lead; (support) = collaborators. "Wave" = integration sequencing (see `DECISIONS.md` — heavy parallel edits to `src/legacy.js` are unsafe, so implementation serializes; design/analysis parallelizes).

| # | Item | P | Owner (support) | Likely files | Wave |
|---|---|---|---|---|---|
| 3 | Inventory sub-tabs snap back to Equipment after a few seconds | **P1** | Systems (QA) | `src/legacy.js` (auto-refresh re-render), `src/features/activities-grid.js` | **0** |
| 1 | Text too small everywhere — hard to read | **P1** | Art (Systems) | `src/styles/*.css` `:root` type tokens | **0** |
| 2 | Logo text (top-left) is bad — asked ~10× | **P1** | Art (Asset) | `index.html` header, logo CSS, possibly a real wordmark asset | **0** |
| 7 | Bottom-right notifications: too small, too fast, hidden behind chat button | **P1** | Art + Systems | toast component (`src/legacy.js`/`src/features/ui-overlap.js`), CSS | **1** |
| 8 | Chat button blocks things — make it movable / relocate | P2 | Systems (Art) | `src/chat.js`, `src/features/ui-overlap.js`, CSS | **1** |
| 4 | Companion tab shows the player's stats, not the companion's level/exp/stats | **P1** | Systems (Game Designer) | `src/features/companions.js`, equipment/companion render | **1** |
| 6 | Home screen: empty space, no background | P2 | Art (Asset) | home render, CSS, background asset | **1** |
| 9 | Player-uploadable avatar; first-sign-in forced **unique** name choice | **P1** | Systems (Game Designer, Art) | `src/net/auth.js`, `src/multi-character.js`, Supabase (unique constraint + upload/storage), FTUE flow | **2** |
| 12 | Crafting/smithing grouped into categories; cooking split buff-food/drink vs healing | P2 | Game Designer (Art, Systems) | `src/data/*` taxonomy, crafting/cooking render | **2** |
| 5 | Bounty board should feel like a real board; shop like a shop (clerk behind counter, offers on table) | P2 | Art + Asset (Game Designer) | bounty/shop render, scene art | **2** |
| 11 | Leaderboards enhanced a lot | P2 | Game Designer + Art (Systems) | leaderboards render, Supabase queries, CSS | **3** |
| 13 | Auto-replant vs watering conflict: make watering OPTIONAL (speeds growth) so online play is more beneficial for farming | P2 | Game Designer (Systems) | `src/features/farm-progression.js`, farm render, `src/features/auto-actions.js` | **2** |
| 14 | Dungeons/raids/world events too hard to find — improve discoverability | P2 | Art + Game Designer (Systems) | nav/IA, home dashboard, combat/adventure screens | **2** |
| 15 | World-event timer at top of screen; events run 2x/day, joinable 1x/day per player | P2 | Systems (Game Designer, Art) | `src/features/world-events.js`, topbar in `src/legacy.js`, server schedule | **2** |
| 16 | Clan group-boss events — clans fight tiered bosses on a schedule (clan analogue of world events) | P2 (big) | Game Designer + Systems | `src/features/clans.js`/`raids.js`, Supabase | **3** |
| 10 | Clan overhaul — castle immersion, upgrade tree, growth tasks, modals | **P1 (big)** | Game Designer + Systems + Art | `src/features/clans.js`, Supabase, CSS, modals | **3** |

## Wave 4 directed items (Tyler, 2026-08-08 — decided, not audit findings)
| # | Item | P | Owner | Notes |
|---|---|---|---|---|
| 17 | Account wall — no account-less play; local-save adoption | **P1** | Systems | IN FLIGHT (agent-account-gate) |
| 18 | Clan/castle page OUT of the Social tab — its own easier-to-find destination (placement = Designer+Art call; it's a twin PILLAR, warrants top-level nav like Events got) | **P1** | Art + Designer (Systems) | after #17 merges (nav/index.html collision) |
| 19 | SECOND text-size pass — b218's ~x1.13 (body 14→16) is still too small "in a lot of places"; raise the FLOOR (micro/small/label tiers + missed hardcoded spots), not just the base; verify screen-by-screen | **P1** | Art | after #17 merges |

## Tyler batch 2026-08-16 (brand/art session — deferred, NOT started)
Raised while shipping the b361 Hearthrise rebrand. Tyler said "add the rest to the backlog" — these are queued, not in flight.
| # | Item | P | Owner (support) | Notes |
|---|---|---|---|---|
| 27 | **Themes tab uses emoji icons** (🏠🌲🌵❄️🌋🧚 for Cozy Cottage / Forest Lodge / Desert Oasis / Winter Chalet / Volcanic Keep / Fairy Glen) — replace with a painted badge-icon set. Prompts drafted (brand session). | P2 | Asset + Art | Recraft credits; 6-icon consistent set. Tyler generates, then wire into the Themes cards. |
| 28 | **Themes "Buy" buttons render BLUE** — hardcoded color, not the gilt/warm token like the rest of the UI (violates the no-hardcoded-colors rule). Code fix, NO art/credits. High value-for-effort on that screen. | **P1 (cheap)** | Systems (Art) | Homestead theme UI; convert the button color to a token. Can ride any homestead-screen branch. |
| 29 | **Homestead room thumbnails** (Kitchen/Forge/Library/Garden/Trophy Room/Cellar/Workshop/Shrine) are grey pencil-sketch placeholders. Optional upgrade to painted color thumbnails. | P3 | Asset (Art) | 8 gated rooms; only after #27. Grey currently signals "locked", so low urgency. |
| 30 | **Homestead-tier + clan silhouette backdrops** — the flat dusk-silhouette header art (Camp→Homestead→Farmstead→Manor→Keep) and clan-hold backdrop. Cohesive as-is; a painted replacement is a SYSTEMATIC set across every tier, not a one-off swap. Treat as its own project if pursued. | P3 (big) | Art + Asset | Do NOT piecemeal — mixing painted + flat across tiers looks broken. Deliberately deferred. |
| 31 | **2 item icons still carry the AI-GENERATED watermark:** `dragon_scale`, `riftmaw_husk`. NOT in the Recraft `items` project (the other 26 were re-exported clean → `assets/_wm-fixed-item-sources/`). These two were generated elsewhere; Tyler to locate the source project and re-export with the AI-label toggle OFF, then run the item pipeline. **Do not ship these two as-is.** | P2 | Asset (Tyler locates source) | Deferred per Tyler 2026-08-16. See DISCOVERIES entry. |

## Tyler batch 2026-08-09 (b227/b228)
| # | Item | Disposition |
|---|---|---|
| 20 | Rally pre-select: pick which rally you'll join today; offline during it → 50% participation reward | QUEUED behind presence agent (same surfaces) |
| 21 | Pet/companion icons — Stable is 22 emoji-as-art | dispatched (Asset: 7 painted Animals_* in reserve + glyphs + artist brief) |
| 22 | Clan header/door text clipping (screenshot) | dispatched w/ #24 |
| 23 | Text STILL too small (3rd report) | dispatched: wire the dead Settings UI-scale control for real + floor 13.5→14.5, body 16→17 |
| 24 | Tier-1 clan scene reads FARM; want "castle foundation" staging | dispatched (Art) |
| 25 | Sidebar foot shows permanent "Offline" | dispatched w/ #26 (indicator only when actually disconnected) |
| 26 | Click the avatar → upload portrait (prefabs later) | dispatched |
| 27 | Combat Eat button unreadable + below the fold | dispatched w/ #28 |
| 28 | Loot/DPS stats → click-open modals near the enemy avatar, not a bottom scroll strip | dispatched |

## Notes / risks
- **#3 is the unblocker:** while sub-tabs snap back, every other agent's browser verification is sabotaged. Fix first.
- **#1 text scale lands before other visual work** so the rest rebases onto readable type (avoids re-doing sizing).
- **#7 + #8 are coupled** (notification hidden *behind* the chat button) — solve together.
- **#9, #10, #11** need server work (Supabase: unique names, clan data, leaderboard queries) — Systems must confirm schema/economy integrity; no client-trust.
- **#5, #6** need real scene/background art — Asset Director sources/verifies; no emoji, "Forge & Stone".
- Design specs for #10/#11/#12 are being written up-front (parallel, no code collision) so implementation waves have a blueprint.

## Status
- **Wave 0 SHIPPED as b218 (`6470793`)** — #1, #2, #3, #4 live; specs for #10/#11/#12 delivered.
- **Wave 1 dispatched 2026-08-08:** Systems (#7+#8 + emoji-modal fix), Art (#6 home screen), Game Designer (specs for #13/#15/#16). Tyler authorized autonomous wave progression + shipping (see DECISIONS.md).
- Waves re-sequenced with new items: W1 = #7+#8, #6; W2 = #9, #12, #5, #13, #14+#15; W3 = #10, #11, #16.
