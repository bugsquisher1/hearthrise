# Blind new-player playthrough — 2026-11-19 (qa-engineer, read-only)

Base: claude/nice-einstein-6h7s9n (= set/v0.2.142 + the settle fix), played on the local world at 1280x720 desktop and a 667x375 touch phone, from sign-up. Only item P2-5 and shot 06 are from 0.2.141. **No P0, three P1s, all at the new Level 5 Mill Cellar end.**

## P1

| # | Finding | Repro |
|---|---|---|
| 1 | The Cellar's Level 5 end hides its own payoff. The first screen shows a greyed "Hunt again" and "Hunt again off: Ground outgrown"; the "Next ground: Meadowbrook Thicket / Show" card is below the fold (content 1091 px in a 556 px body, no scroll cue). Shots 01, 02. | New hero, Mill Cellar, hunt to Level 5 at 1280x720. |
| 2 | A party leader is offered the outgrown ground, then refused with the wrong reason. Hunts shows Mill Cellar as "Outgrown · Recommended", "Enter with party" is enabled, and pressing it answers "Nobody went in. Wren is not ready." Shot 03. | Level 5 hero invites a Level 1 hero, Pick a hunt, Mill Cellar, Enter with party. |
| 3 | A Level 5+ player has no ground to share with a brand-new friend. The Cellar refuses, and the Thicket warns "high death risk" for the newcomer. That warning was wrong in play: the Level 1 healer went 1 to 9 in 8 hours with no death. | Same party, pick Meadowbrook Thicket. |

## Top 10 polish (P2)

1. **Level-up has no moment:** a one-second "Level 2" float, hidden behind the Tally widget when a window is open (shot 04).
2. **Phone away card hides the reward:** at 667x375 it shows only "Away 8 h, Level 1 → 9" and the buttons; XP, gold, kills and best find are below the sticky footer (shot 05).
3. **Windows don't fit 720p:** mid-hunt Summary shows "Top loot" with no rows, Skills shows one recipe, and a selected bag item shrinks the grid to two rows.
4. **Shop gear buys have no confirm:** eight rapid clicks bought six Copper Studs (744 to 24 gp), which sell back at 30 gp each. The server held; a 49 gp sale and the stamina refill both confirm.
5. **"No connection" banner sits on top of the hunt bar**, covering Leave hunt (shot 06, seen on 141).
6. **Double-clicking Start on a craft starts then stops it**, with no feedback.
7. **"0 online" on first landing**, before it corrects to 1.
8. **Sign-in opens on a black void with one line of pitch**; phone hero creation shows no hero until "Pick colors" (shot 07).
9. **Wording:** "Ground outgrown at Level 5. Next ground: Recommended in Hunts"; "Each one costs more., need 136 gp more"; "No classes" at creation but "Classes: 2 of 4" in the party panel; a skill called Crafting under a heading called Crafting; "Void Banquet" is a §10 filler name; "Sell all junk" sold one stack; Blessings are offered unexplained.
10. **Small layout faults:** the HUD shifts when "+10/s rest" wraps; melee monsters draw on top of the hero; a window left open in town follows you into the hunt; browser Back leaves the game; the phone party panel clips its checkbox text.

## Held under attack
Reload mid-hunt, during the leave countdown, in town and after a purchase. Double-clicks on Enter, Take, Sell, Leave, Invite and the stamina refill. Bad sign-up input, a markup hero name, a duplicate name, chat markup on both clients. Server restart mid-hunt, a stale session after a wipe. A two-account party, and 8 hours away for both.

## Not reached
- A second hero on one account (the slot costs 300,000 gold; the party was two accounts). The "up to 4 play at once" line at creation sets the wrong expectation.
- Death and running out of gold or food (eight hours in the Thicket ate no food).
- Fishing and the other gathering skills (only cooking played).
- Never opened: Market, Storage, Farm, House, Training, Tower, Hearth Chest, friends, leaderboards, the Book.
- Not tested: 922x423 and sound.
