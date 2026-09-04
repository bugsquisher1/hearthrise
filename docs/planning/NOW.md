# Now — what the team is working on

<!-- PLAYER-FACING. This file is posted to Discord daily by
     .github/workflows/daily-devlog.yml. Keep it 3-6 bullets, plain language,
     no internal jargon, NO security/exploit details ever. The Coordinator
     updates it alongside the priority board; the date line gates staleness. -->
<!-- updated: 2026-09-04 -->

🔎 **We found the big one**
- We audited the whole game against the live server this week and found why progression stalls: **almost nobody could reach the second homestead tier**, and that tier is the only door to the Forge, the Workshop and your second worker. Across everyone playing, not one Forge has ever been built.
- The reason is a chain: combat drops were being credited more conservatively than the game showed you, so the materials you watched drop did not all arrive. Six people stalled one wolf pelt short of the upgrade. Behind that wall, ~170,000 gathered materials are sitting unused.
- If you have been wondering why smithing and crafting never seemed to go anywhere: they were behind that same door.

🔨 **Being fixed right now**
- **Drops you see are the drops you keep.** The server is being changed to credit what actually happened in your fight, and to stop handing back food you ate.
- **Homestead tiers tell the truth.** If your house ever showed a tier you had not actually bought, it will correct itself on your next load and offer you the real upgrade. Nothing you paid for is lost.
- **Bounty Hunter levels.** The skill has not been saving. It is getting a proper home on the server, which also unlocks the higher bounty board tiers.
- **The sign-up door.** Confirming your email will drop you straight into the game, signed in, with a resend button if the mail never arrives.

🗺️ **The road to Beta 3:** fix the progression wall → prove it with a fresh character playing all the way through → full wipe → new invite keys. No date until it is genuinely ready. Beta 2 shipped on a test suite that was not checking the things that broke; that is being fixed too.
