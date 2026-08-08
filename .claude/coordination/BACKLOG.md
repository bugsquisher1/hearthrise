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
