# LIVE AUDIT — 2026-08-17 (all-night session, Tyler's live account, hearthrise.net b370)

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

## Coordinator note — Tyler's live instructions (2026-08-17, verbatim from chat)
1. "Gems are free to us lol just add the character slot and play through the game." — Tyler explicitly approved buying Hero slot 2 (200 gems) on his account for the fresh-character playthrough. His balance was credited to 1006 gems server-side by the Coordinator. Note whether the credit reaches the client cleanly, and whether the purchase flow debits/unlocks correctly.
2. "Keep an eye out for strange flickering of old assets etc, I've noticed it quite a bit but it's hard to explain." — WATCH FOR: old/retired art appearing briefly before the current art paints (icon swap-in flicker, glyph->painted transitions, cache-version races). Catalog every instance: which asset, which screen, what it flashed FROM and TO, and whether a reload changes it. Suspects: the icon-swap timing in legacy applyLocalIcons vs __mapGeneratedGearIcons (1500ms re-run), service-worker cache serving stale versions, image-fallback.js swapping placeholder->real.
3. Quality bar for the night, his words: "I expect studio quality when I wake up."
