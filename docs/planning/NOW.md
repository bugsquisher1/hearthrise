# Now — what the team is working on

<!-- PLAYER-FACING. This file is posted to Discord daily by
     .github/workflows/daily-devlog.yml. Keep it 3-6 bullets, plain language,
     no internal jargon, NO security/exploit details ever. The Coordinator
     updates it alongside the priority board; the date line gates staleness. -->
<!-- updated: 2026-09-03 -->

✅ **Just shipped (build 501)**
- Homestead rooms (the Forge and friends) now actually build — they no longer take your resources and leave the room unbuilt after a reload
- Bone keys, goblin seals and other combat keys are real realm-granted drops now (and drop while you're away) — the old client-side key handout the realm never recorded is gone

🔨 **Right now**
- **"Items vanish after a fight" — root found, measured live:** during an attended fight the realm currently credits roughly 60% of the drops you see and can hand back food you ate, because the after-fight settle re-simulates your session too conservatively (kills, XP and gold are credited correctly). Fixing the crediting server-side is the top item.
- **Dungeon scrip** — server-side fix built and under review; lands with the quartermaster rework so scrip stops resetting to zero
- The big one: an armor & defence overhaul so gear genuinely matters at every tier — we measured the current math and it stops pulling its weight at both ends; that's getting fixed properly
- A rescue prompt for your first nights: leaving a fight you can't survive will offer the gathering switch, so your away time banks the whole night instead of ending at your first death
- A new "ward" line of off-hand charms and totems fed by monster drops

🗺️ **The road to Beta 3:** finish the quality pass → full fresh-start wipe → new invite keys. No date until it's genuinely ready — Beta 2 taught us that lesson.
