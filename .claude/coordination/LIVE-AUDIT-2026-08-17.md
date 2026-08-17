# LIVE AUDIT — 2026-08-17 (all-night session, Tyler's live account, hearthrise.net b370)

## FINAL RANKED SUMMARY (session end)

P0 (live, unresolved at session end)
1. Cloud save POSTs 503 ALL NIGHT (F1) — 0 successful client-observed writes across ~3h, before AND after the compute upgrade; UI still claims "cloud save active". (Server telemetry showed intermittent commits, but the client-visible failure rate is ~100% and invisible to players.)
2. Hero-slot switch hard-freezes the tab (F10) — 3/3 repro, 60s+ renderer hang, only manual reload recovers; FTUE on fresh slot blocked. Systems engineer dispatched.

P1
3. Auto-eat broken (F7) — threshold set to 50%, watched HP at 30% across dozens of swings with provisions held; two deaths. Deaths are also nearly invisible (F8).
4. Gem debit reverted on reload while slot unlock persisted (F11) — premium-currency dupe via two divergent stores under save failure; also no purchase confirmation (F9a) and stale header gem chip (F9b).

P2
5. First-paint icon miss / "old asset flicker" (F13/F15 + addendum) — screens render before icon wiring; inventory 21/28 icons missing then all paint ~4s later; farm, bounty cards, drop rows, provisions same. THE root of Tyler's flicker report.
6. Drops-this-fight pollution (F5/F14) — logs ALL inventory gains during the fight window (crafting planks x295, shop-bought seeds x10). Filter by source.
7. Avatar surface desync (F22) — header mini-avatar lags one reload behind; portrait has no single source of truth; placeholder asset 404s (F2).
8. House upgrade requirement quantities invisible (F16); Premium Shop off-theme blue/hardcoded colors (F24); periodic multi-second renderer stalls + 1s full re-render of Home (F17).

P3 (polish, studio-bar)
9. Toasts clip off right viewport edge everywhere (F21). 10. Stable: generic paw icons + raw lock-id strings shown to players (F19/F20). 11. Runecrafting skill row missing icon (F12). 12. Necklace label wrap + air-rune-reads-as-play-button (F4/F6). 13. Replay-tutorial button dead (F23). 14. Combat-strip Dungeon "Enter" not gated visually (F25). 15. Quests badge desync; watered-timestamp format inconsistency; monospace trade history font; Hunt text truncation.

NOT REPRODUCED: War Table blank portraits (checked twice on b370, all 200s + rendered).
POSITIVES: bounty accept/CLAIMED/deep-link flow; dungeon cards (mechanics, drop tables, honest gating); portrait picker; quest claiming; clan blueprint art; local shop illustration; away-accrual copy ("away: until you fall"); item/monster art quality when it paints.

VERDICT (how it feels to play): Hearthrise's bones are genuinely good — the loop of bounty -> fight -> drops -> skills -> farm reads clearly, the painted art is charming, and screens like the dungeon list and bounty board feel like a real game with a point of view. But tonight it feels like a beautiful town with the plumbing off: nothing you do is provably saved (and the UI won't tell you), your food won't save you from a Tier-1 slime, icons blink into existence seconds after every screen loads, and the one screen that asks for money looks like a default Bootstrap page. Fix the save path, auto-eat, the icon-wiring pass, and the freeze, and the moment-to-moment game underneath is already fun to idle in.

---

Auditor: live-player agent in Tyler's Chrome. One entry per finding.

---

## F1 — P1 — Cloud save POSTs returning 503 (intermittent)
- Screen: global / boot
- What: On fresh reload, BOTH `POST /rest/v1/game_saves?on_conflict=user_id,slot` attempts returned **503**. Some `session_claims` heartbeat PATCHes also 503 (others pending/ok). All GETs (game_saves read, session_claims read) return 200.
- Expected: save writes 2xx; cloud is authoritative and write failures risk progress loss on tab close.
- Evidence: network log at boot — game_saves POST 503 (x2), session_claims PATCH 503 (x2). Header still shows "cloud save active" (UI does not surface the failure).
- Repro: reload hearthrise.net, watch network. Monitoring continues to see if later autosaves succeed.

## F2 — P3 — 404 assets/avatars/_placeholder.webp at boot
- Screen: boot
- What: `GET /assets/avatars/_placeholder.webp?v=370` → 404.
- Likely related to avatar-revert bug (#2 in brief): if code falls back to this missing placeholder, the avatar renders broken/blank.

## F3 — VERIFY: War Table portraits — NOT reproducing on b370
- Screen: Combat / War Table
- All T1 monster cards render art; every monsters/*.png request is 200. Known finding #1 does not reproduce on this load. Will re-check across the night (may be intermittent/cache-related).

## F4 — P3 (art/UX) — "Play button" in Necklace area is the AMMO slot's air rune
- Screen: Character > Equipment
- Diagnosis: the 4th slot top-row (right of Necklace) is `td-slot td-ammo` containing `assets/icons-bundle/hearthfire/items/air_rune.png` (loads fine, naturalWidth>0). The air-rune art is a triangle-in-circle that reads as a media PLAY button, and filled slots drop their text label — so it presents as a broken icon in/near the Necklace slot.
- Fix direction: restyle the air rune icon (art) and/or keep slot labels visible on filled slots.

## F5 — P2 — "Drops this fight" polluted by ANY concurrent activity yield (broader than the shop repro)
- Screen: Combat > fight vs Slime (fight #1 of session)
- What: With Crafting (saw normal plank) running in background, the fight drop panel showed "Slime Gel x1, **Normal Plank x295**" after the first kill. No shop purchase involved.
- Expected: Drops this fight = items dropped by this fight only.
- Evidence: screenshot ss_9694p18ry; ticker "1 this fight" while panel lists 295 planks.
- Repro: run any artisan/gathering activity, start a fight, kill once.
- Note: confirms the in-progress fix must filter by SOURCE, not just special-case shop buys.

## F6 — P3 (art) — Loadout mini-grid: "Necklace" label wraps to "Necklac e"; air-rune play-button icon repeats here (see F4)
- Screen: Combat fight setup, left rail loadout.

## F7 — P2 — Died with provisions still held (auto-eat never fired)
- Screen: Combat vs Slime (T1!)
- What: Player at Lv7 with "Raw Lobster +12 HP each, 1 held" as provisions. HP ground down 10->0 over ~90s; lobster never consumed; combat log ends "💀 You died! Respawning…" with `lobsters: 1` still in G. Fight gold reverted/lost (12,774 -> 12,765).
- Expected: provisions exist to be eaten — auto-consume at threshold, or a clear manual eat button on the fight screen (none seen).
- Also QUESTIONABLE: RAW lobster accepted as provisions at Cooking 6 — raw food healing 12 HP feels wrong vs cooking progression.
- UPGRADED TO P1: Settings > Gameplay shows "Auto-eat HP threshold: 50%" ("Eat one Provision automatically on each swing your HP is below this percentage") — the feature IS configured on this account, and it did NOT fire through two full deaths (10->0 HP over ~90s each, lobster held throughout). Auto-eat is broken, not merely locked behind the bounty-shop unlock (or the setting UI lies about being active). Second death: bounty fight vs Brittle Skeleton, same pattern.
- Note: Settings > "Replay tutorial: Show again" exists — usable FTUE path while slot switching is broken.

## F8 — P2 (game feel) — Death is nearly invisible
- What: on death the screen just returns to the War Table; no death modal/summary (what you lost, where you respawned). A new player would not understand what happened. The activity bar flips to "Idle — pick an activity" — the punishment is confusion, not drama.

## Constraint note — fresh-character request
- Home "Your heroes": slot 2 = 200 gems (Buy), slots 3-5 locked (500/900/1500 gems). No free second hero slot exists on this account; gem spending is forbidden, so the fresh-character FTUE run is SKIPPED unless another free path is found.

## F9 — RETRACTED as filed / REPLACED — Buy button works; automation clicks were mis-scaled. Two real findings from the purchase:
- F9a — P2 — NO CONFIRMATION on premium-currency spend: one click on Hero slot 2 "Buy" instantly debited 200 gems and unlocked the slot. No confirm dialog, for a gem (real-money-adjacent) purchase. The dormant "Confirm Purchase" modal in DOM is never used for this path. Accidental-spend risk.
- F9b — P2 — Header gem chip goes STALE after spend: G.gems = 806 post-purchase but header still displays "1,006 Gems" until some later re-render/reload. (Server-credited gems DID reach the client without reload earlier — that direction works.)
- Also noted: the whole Home dashboard re-renders every ~1s (child cards replaced wholesale — automation refs die instantly; also a perf smell and likely related to click-eating if a real user clicks during a render swap).

## F10 — P1 (confounded) — Hard renderer freeze on hero-slot switch ("Play" on fresh slot)
- Screen: Home > Your heroes > Adventurer 2 > Play
- What: Clicking Play froze the entire tab for 60+ seconds (input dispatch timed out, script injection timed out repeatedly). Recovered only via manual reload. After reload: still on slot 0 (Tyler, correct — no cross-slot bleed seen), Adventurer 2 shows "3m ago" so the switch partially ran before hanging.
- CONFOUND: the Supabase compute upgrade/DB restart happened in the same window. If switchSlot does synchronous/unbounded waiting on the server, a server blip becomes a client hard-hang — that alone is a finding. Retrying post-restart will disambiguate.
- Post-reload state was clean (gems header corrected to 806 — F9b fixed by reload; main character intact).

## F11 — P1 — Gem debit reverted on reload; slot unlock persisted (premium-currency dupe)
- What: After buying Hero slot 2 for 200 gems (G.gems 1006 -> 806) and a reload during the save-write outage, G.gems is back to 1006 while HearthriseProfile.profile.unlockedSlots = 2 persists. Net effect: the purchase became free.
- Root cause shape: gems live in the game save (write failed -> cloud restore rolled them back) while the slot unlock lives in a separate profile store that DID persist. Two stores, one transaction — they diverged.
- This is exactly the class the server-authority program addresses: gem debit + entitlement grant must be one server-side transaction.

## F12 — P3 (art) — Skills list: Runecrafting row has no skill icon (blank gap; every other skill has a circular icon badge). Stonemason icon on Character screen also reads as an off-palette flat red square vs. the painted set.

## F13 — P2 — FLICKER BUG CAUGHT (Tyler's report): Farm renders with NO crop icons on first paint; icons appear only on next re-render
- Screen: Farm
- What: Navigating to Farm rendered 4 growing plots as bare dark tiles (no turnip art) and the Crops list (Turnip/Carrot/Wheat/Potato/Tomato) with no icons at all (screenshot ss_0501apf8h). Clicking "Plant all" forced a re-render — suddenly ALL icons painted, on plots and every crop row (ss_39952c54w).
- Diagnosis direction: first render happens before the icon map/`applyLocalIcons` pass (or the 1500ms `__mapGeneratedGearIcons` re-run); the initial DOM is built without icon URLs and only a later re-render picks them up. This matches Tyler's "old assets flicker" — screens that render-then-swap art.
- Repro: sidebar > Farm; look before touching anything. Deterministic tonight.

## F14 — P2 — Shop-buy mid-fight pollutes "Drops this fight" — CONFIRMED live on b370 (extends F5)
- Repro tonight: bounty fight vs Brittle Skeleton running; bought Turnip Seed x10 (50g) in Local Shop; back on fight screen the drop panel reads "Bone Chips x2, Bones x2, Turnip Seed x12" (2 pre-existing + the 10 bought). Fight had 2 kills.
- Together with F5 (crafting planks) the rule is clear: the panel logs ALL inventory gains during the fight window, not fight drops.

## F15 — P3 (art, flicker class) — Provisions lobster icon: blank on one fight-screen render, painted on a later one; "Bone Chips" drop row renders with no icon while sibling rows have icons. Same first-paint/late-swap family as F13.

## Observations (positive) — Bounty flow
- Accept -> CLAIMED stamp -> "Fight target" deep-links into the correct fight with a live Bounty 2/92 counter in the ticker. Feels great.
- Pacing question for game-designer: Easy Cull = 92 kills x ~28s/kill at Lv7 DPS 0.5 = ~45 min of active grinding for 270g + 5 marks, with no default healing (see F7) — a new-ish player likely dies mid-contract. Contract sizes feel tuned for much higher DPS.

## F16 — P2 — House upgrade requirements: quantities invisible (DOM has "Willow Plank 0 / 35", screen shows only the name)
- Screen: House > Property > Next: Stonecross Manor
- What: each requirement row renders name only; the "0 / 35"-style counts exist in DOM (`.hh-req-name` + sibling) but are not visible (CSS/token issue). Player cannot know upgrade costs. Icons on these rows also late-painted (F13 class).
- Also: "Upgrade Property" button appears enabled while requirements are unmet (0/35) — check gating.

## F17 — P2 (perf/stability) — Repeated multi-second renderer stalls
- Throughout the session, CDP screenshots/input time out for 30+ s while JS still executes fine afterwards; one episode squeezed the viewport to 445x228 until reload. Also the Home dashboard full re-render every ~1s. Suggest profiling main-thread long tasks; players will feel this as hitching/unresponsive clicks (may explain "clicks eaten" reports).

## F18 — P3 — Post-reload "Resume fighting" chip did not reliably resume (activity shows Idle after clicking Resume; had to re-enter from War Table).

## F19 — P3 (art) — Stable: nearly all pets share one generic paw-print glyph; Wolf Pup and Hawk render EMPTY circles. Pet identity is lost; needs per-pet icons (or at least species glyphs).

## F20 — P3 (UX copy) — Stable lock hints leak raw internal ids to the player: "Locked · drop:small_wolf", "Locked · shop:8000:cooking25", "Locked · hatch:dragon_egg", "Locked · skill:fishing:2500". Should be human copy ("Rare drop from Wolf Cubs", "Shop: 8,000g, requires Cooking 25").

## F21 — P3 (UI) — Toasts overflow/clip at the right viewport edge on desktop
- Seen 4+ times tonight: "Your wor...", "Collected 4m — +0 go...", "Accepted bo...", "Defeate..." — every toast renders half off-screen at the right edge, so feedback text is unreadable. Toast container is positioned past the viewport (1745px wide window).

## F13 addendum — Inventory: strongest A/B evidence
- First paint: 28 occupied slots, ~7 icons visible, rest blank tiles with counts (ss_0948b9nw9). ~4s later: all 28 painted (ss_9175k39cf). Same repro class on Character skill grid, farm, bounty cards, drop rows, provisions. The item art itself is lovely once painted — the bug is purely the late icon-wiring pass.

## F22 — P2 — Avatar-revert mechanism identified (Tyler's report #2): portrait surfaces read DIFFERENT sources and desync
- Repro tonight: Character > Hero > Change Portrait -> picked a new stock portrait. Hero panel + Home banner updated immediately and SURVIVED a reload. But the top-left header mini-avatar kept showing the OLD portrait both before AND after reload — a persistent desync.
- Mechanism: portrait persistence appears to ride the save blob / separate stores per surface (no dedicated portrait network write was observed on change; header chip caches its own copy). Under save-write failure (tonight's 503s) whichever surface reads the rolled-back store "reverts". Combined with the 404 placeholder (F2), a failed read falls to a MISSING placeholder image -> the "placeholder revert" Tyler sees on the combat screen.
- Fix direction: one portrait source of truth read by ALL surfaces + ship the placeholder asset.
- Picker itself is lovely (10 painted options + upload). "Setting your portrait..." spinner completed OK.

## F23 — P3 — Settings > Gameplay > "Replay tutorial: Show again" does nothing (no tour on click, none after reload).

## F22 addendum — header mini-avatar updated only after the SECOND reload: it lags one reload behind the real portrait. Cache-behind-by-one is the revert signature Tyler describes.

## F24 — P2 (art) — Premium Shop is off-theme: default-blue Buy buttons and blue "Premium Store" label (hardcoded colors, not tokens), generic monochrome line icons vs the painted item art everywhere else. The one screen asking for real money is the least polished screen in the game. Copy note: platform detection line is good ("Detected: web", server-validated receipts).

## F25 — P3 — Combat strip "DUNGEON — Enter" button looks enabled at CL8 but the dungeon list itself is correctly gated ("Combat Lv 25 required (you are 8)"). The strip button should show the same disabled/gated state instead of luring a click.

## Coordinator note — Tyler's live instructions (2026-08-17, verbatim from chat)
1. "Gems are free to us lol just add the character slot and play through the game." — Tyler explicitly approved buying Hero slot 2 (200 gems) on his account for the fresh-character playthrough. His balance was credited to 1006 gems server-side by the Coordinator. Note whether the credit reaches the client cleanly, and whether the purchase flow debits/unlocks correctly.
2. "Keep an eye out for strange flickering of old assets etc, I've noticed it quite a bit but it's hard to explain." — WATCH FOR: old/retired art appearing briefly before the current art paints (icon swap-in flicker, glyph->painted transitions, cache-version races). Catalog every instance: which asset, which screen, what it flashed FROM and TO, and whether a reload changes it. Suspects: the icon-swap timing in legacy applyLocalIcons vs __mapGeneratedGearIcons (1500ms re-run), service-worker cache serving stale versions, image-fallback.js swapping placeholder->real.
3. Quality bar for the night, his words: "I expect studio quality when I wake up."
