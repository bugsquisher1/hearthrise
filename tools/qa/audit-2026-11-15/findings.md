# Full-game playthrough audit — findings (2026-11-15)

Severity: P0 blocks progress or loses progress · P1 player-visible wrong (incl. §6 screen-vs-server) · P2 confusing / unfun / a real cost · P3 polish.
Each: repro, server said vs screen said, likely file, and for fun/sense the evidence and a better option. Status: open / sent (to the Coordinator).

## Open

### F1 P2 · The coach card sits on the hero at 1280x720
- Repro: fresh hero, Mill Cellar at ~2 min, coach "Plant your land" (1280x720). Shot `art/review/audit-2026-11-15/002-cellar-2.png` (local only).
- Screen: Party card (top left), coach card (center top, over the hero's spot), analyzer (right), Tally (right) leave a strip of map; the hero fights under the coach card. The 11-11 re-read saw it at 1024; it holds at 1280 too.
- Likely: coach anchor placement for hunt-time tips (`src/shell/` coach/tip anchoring). Better: dock hunt-time coach cards to the action bar's top edge or a corner that never holds the hero; the camera centers on the hero.

### F2 P3 · Hive Wasps drop "thread spun from spider silk"
- Item text: Silk Thread "Fine thread spun from spider silk", "Dropped by Hive Wasp at Mill Cellar". A wasp doesn't make spider silk. Likely `src/data/item-descriptions.js` / Cellar drop table. Better: the wasp drops its own (Wasp Paper / Stinger) or the line says where the thread comes from.

### F3 P3 · Stale coach step: "Hunt the Thicket until your 200 Gray Wolves are down" after they are down
- Repro: finish 200 Gray Wolves inside a 60-min skip, then follow the two food-threshold coaches. The next coach says hunt until they are down while the Tally reads "200/200 (done)". Likely `src/data/hunt-tutorial.js` step gate reads "task taken" not "task open". Better: skip to "Leave the hunt and Tamsin pays you".

### F4 P3 · The food-threshold coaches fix 4 HP and create their own next problem
- "Slot 3 ... 4 of it is wasted. Press − until 55%" then right away "Salted Shrimp ... between 55% and 60% it eats before your own ... make it 55%". Two coach steps, two modals, to save 4 HP a bite, on grounds where the hero barely eats (F5). Better: one step that sets both (or the default bar ships own food and store food at the same line), and teach conditions where food is actually spent.

### F5 P2 (design) · Food has no stakes from Level 1 to 12 on Normal
- Evidence (server and summary): Cellar 15 min 0 food; Thicket 2 h 8 Cooked Shrimp; Wickstead 10 h page closed, 0 of 216 own food eaten, 0 store food. The whole supply bill is runes (2,706) and juice (323). Food, Cooking, the food coaches and the "g per HP" table matter to nobody until a harder tier.
- Inside the rulings (Normal at the floor is near-zero risk): fine for risk, but the supply system teaches nothing. Better: move the food lessons to the first Dangerous run (the coach can offer the Thicket's Dangerous at Level 8), and let Cooking's first goal be mana (Turnip Juice from the farm) since juice is what the hero actually buys.

### F6 P3 · Tally "Keep" is an unexplained checkbox beside Abandon
- `<label class="ht-keep"><input type=checkbox data-hs-act=keep>Keep</label>` next to the Abandon button; nothing says keep what (repeat the task after she pays?). Better: a label a player reads ("Take it again after she pays") or the glossary word with a hover.

### F7 P1 (server half APPLIED live; client half ships v0.2.133) · Party warning "Corwen has 1 min of stamina left ... Ilsa comes home too" while the server holds 11 h 30 — SENT to the Coordinator
- Repro (local world): Corwen hunts until stamina 0 (end_reason stamina), rests 12 h in town (mining), Ilsa (new hero, same account) invites him, Enter with party at the Glade. Right after entry the party read sends `stamina_low_ms` = 0 for Corwen; the alert "Corwen has 1 min of stamina left. Their hunt ends then, and Ilsa comes home too." appears and stays.
- Server: `player_state` slot 0 stamina 689.6 min (after the first settle); the hunt ran on. Screen: the warning stayed after a 30-min skip; gone only after a reload.
- Cause (code): `supabase/migrations/2027-02-27-hunt-tiers.sql:360` reads raw `ps.stamina_ms <= 900000`, not `public.hr_stamina_of(user, slot, now())` (the rest since `stamina_at` is ignored until a settle writes the pool). Client: `src/shell/alerts.js:177` keeps a `lowstam:` alert once shown, after the server stops sending it.
- Why it matters: an actionable number the server disagrees with; a player may buy a refill or pull the party out.

### F8 P2 · No shield past Level 30 for the default (sword and shield) hero
- Data (`src/data/items.js`): shields Practice 2, Bronze-Rimmed 3 (shop), Ironbound 5 (Smithing, L15), Kingsgrate 7 (Rat King), Coppercap 7 and Steelgrate 9 (L30). Nothing from 30 to 110, while swords run to 95, spellbooks (the mage off-hand) to 88. A tank's off-hand freezes for 80 Levels through the Barrow March.
- Also: Equip upgrades never offers the shop's Bronze-Rimmed Shield (140 gp, +3) over the Practice Shield (+2); Corwen still wore the Practice Shield at Level 31 with 230k gp. Better: a shield rung every 15 Levels (Smithing or March drops), and the Back-in-town card can name a shop piece better than what's worn.

### F9 P3 · The away card is taken back when the hunt ends at the moment of return
- Repro: enter with exactly 12 h stamina, close the page, `wait 720 --away`, return. The first envelope shows the hunt still settling (lag ~27 s); when it ends in view the card is withdrawn ("a hunt that ends with the card up takes the card", `src/shell/away-recap.js`). The summary stays, but "Level 17 to 24" (the best line of the return) is gone. Twice in a row. Better: when the card is taken by the hunt's end, the summary carries the Level span of the absence.

### F10 CLOSED (not a bug: Tyler 10-31 "gathering job continues - bench jobs dont") · Only gathering resumes after a hunt
- Repro: start Normal Plank (Crafting, 1,249 logs left), enter the Glade, stamina runs out. Summary: "Start mining, chopping or fishing before you hunt, and Corwen will go back to it when the hunt ends." The bench job is dropped. Tyler 10-14: "resumes the last non-hunt activity". The copy is honest; the rule is narrower than the ruling. Coordinator call: resume the bench with its remaining materials, or record the narrower rule.

### F11 P2 · A loot plan is per hero and can't be copied (first principle)
- Repro: Corwen set 15 items to Sell; Ilsa (same account) starts with every item on Keep (`player_item_rules` rows only for slot 0), and no window offers "Use Corwen's plan". Each new hero redoes the dropdowns one item at a time (the 11-11 #8 "17 dropdowns" again). Tyler's first principle: a decision made once is reusable and copyable. Better: "Copy loot plan from <hero>" in the This hunt tab, or an account-wide plan with per-hero overrides.

### F12 P2 (economy) · A million gold by Level 50 with little to spend it on
- Evidence: purse 1,010,859 gp after ~150 hunted hero-hours (Corwen 50, Ilsa 34). Spent so far: two hero slots, 4 stamina refills, a bag row, the Homestead (400 gp) and a crate (1,500 gp). House tiers are gated by materials (Oak, Iron Bar, Trout), not gold; the Weighhouse is closed on the local chain; Tempering untried yet. Income at the Ford is +10.7k gp/h a hero. Better (design): gold sinks that track income by Level (refills already do), and House tiers that cost gold in proportion to the Level they open at. Re-check after the March grounds and Tempering.

### F13 P3 · Another hero's away card opens over the fight
- Repro: switch to Corwen hunting at the Ford while Ilsa has a return line; "While you were away (24 h 1 min), Ilsa hunted ..." opens center-screen over Corwen (`art/review/audit-2026-11-15/018-ford-2min.png`). Same class as F1: overlays dock where the hero stands.

---
**From here on (Coordinator 2026-11-15, Tyler's words: "pretend like your human ... figure it out yourself"): each finding is written as a player first ("I tried X because the screen said Y; it did Z"). Any code note is under "Root cause (code, after logging)".**

### F14 P2 · The Muster Barrows on Normal "in range" is a death or a gold bleed for a lone hero; nothing says the bar's food is from Level 1
- As a player: the Hunts list said the Barrows (55-75) was in my range at 56. I went in alone on Normal with the bar the game gave me (Salted Shrimp, heals 72, on an 850 HP hero) and died in 8 min to a Barrow Knight, twice. The death card says better armor, food, a healer or Levels would help. I found the food table myself in Configure action: with Salted Shark the hour held but cost 71k gp against 12k earned (−59k/h); Salted Lobster −21k/h. With my own healer (Ilsa, 11 under, the game warned she could die) it held: 300k XP/h, +3.3k gp/h, 10 meals an hour.
- What was missing on screen: no line ever said my food was too weak for my HP (the coach taught thresholds at Level 5 on 160 HP and never came back); the Barrows card does not say the ground expects a healer the way it says "Captain Hask is built for a group of four or more".
- Better: a "your food heals under X% of your HP" line on the hunt card and the bar slot (the server knows both numbers); the Barrows card says what the floor expects (a healer, or Rune armor at 60).

### F15 P1 · Equip upgrades kept a Level-15 sword to Level 55 by calling it "better at something" — SENT to the Coordinator
- As a player: I pressed Equip (summary) / Equip upgrades (bag) after every hunt from 15 to 55. The weapon never changed from the Bramble Blade (L15, +6/+5) though the bag held Steel Swords at 30 and 40 Mithril Swords (L45, +18/+15) by 55. The bag said: "Nothing goes on by itself, since each piece is better at something. Mithril Sword hits harder, Bramble Blade does +40% damage to Plant monsters. Pick on the doll." That is false (6/5 x1.4 < 18/15 even on plants, and no March monster is a plant). Two deaths in 8 min at the Barrows followed.
- Root cause (code, after logging): the 11-11 #1 fix made a bane a plus in `src/shell/upgrade-plan.js`; any plus on the worn piece now makes a "trade off" that blocks the slot. Better: a bane counts only where it actually wins (on its class), otherwise the bigger numbers go on.

### F16 P3 · "You are already in a party" names the wrong hero
- As a player: from Corwen I invited Ilsa and got "You are already in a party with someone. Press Leave party in the Party window, then try again." Corwen's Party window showed no party and no Leave party button; the hunt card offered "Bring Maren" but not Ilsa. I found it by switching to Ilsa: she was alone in a party of one left over from an earlier Disband. Better: "Ilsa is already in a party. Switch to Ilsa and press Leave party", and Disband should free every member.

### F17 P3 · Tempering stops at Steel and says "can't be tempered yet" with no reason
- As a player at Level 55 in Mithril: Shop > Services > Tempering: "Your Mithril Sword can't be tempered yet." No reason, no when. Earlier at Level 12: "Gear worn from Level 15 can." (good). Tyler 10-25 SAY WHY. Better: say there is no Mithril ladder yet, or build tiers 4+ (also the gold sink F12 needs).

### F18 P2 · No way to sell outclassed gear in bulk; the loot plan only sees the last hunt
- As a player at Level 60: the bag held 145 stacks, most of them gear I'd outgrown (Bronze to Mithril, every weight). The This hunt tab only lists what the last hunt picked up, so older stacks can't get a plan there; the Shop's Sell tab sells one stack per press. It took 114 presses for Corwen and 73 for Ilsa. Better (11-11 #8, still open): one "Sell gear below what you wear" press, and the loot plan reachable from any stack in the bag (item menu: Keep / Deposit / Sell).

### F19 P3 · The Weighhouse says "isn't trading right now" while Havora's Works says it's being built
- As a player: the Market window: "The Weighhouse isn't trading right now. Your listings are safe, and you can still take them back." Havora > Works: "Havora is raising the Weighhouse on the east bank ... 0 of 1,000,000 gp". Two windows, two stories, and the Market one sounds like an outage. Better: the Market window points at the Works ("Havora is still building the Weighhouse. Give in Havora > Works."), with the bar.
- (Local chain ships the market OFF by design; live state unchecked: the pane is signed out and Chrome isn't connected.)

### F20 P2 (economy, F12 evidence) · The gold sinks can't take what one hero earns in a day
- Measured: at Level 78 one hero nets +11k to +18k gp an hour (Pyre Field), ~200k+ a 12-hour day; the account had 4.49M with all 4 hero slots bought. Daily sinks open to it: Works 25,000 (one account), Rounds 3 x 5,000, Hearth powders 5 x 2,000 = 50,000 a day. Tempering has no ladder past Steel (F17). House tiers are gated by materials, not gold. So gold piles up from Level ~50 on with nothing to chase. Better: tempering tiers 4-6 (Mithril/Rune/Emberforged) priced by Level, Works caps per hero, and a House tier or two priced in the millions.

### F21 P2 (fun) · Beating Lord Krell, the last boss, pays nothing you can see
- As a player: four Hall Keys, three losses, ~105k gp of Shark and Graven runes, then "You beat Lord Krell." The summary: 8,924 Level XP, 174 gp, Loot value 0, no item, no trophy, no reveal (ledger: 7,240 Level XP and 132 gp a hero). The game's last fight ends on the quietest screen in the game.
- Root cause (code, after logging): his drops are being reworked in flight (`origin/lane/c-krell-uniques`, `origin/lane/c-krell-daily`, `set/v0.2.133`). Better: the first win always pays something named (his trophy or a unique), with the super-rare reveal (DESIGN_STANDARDS §6), and the hall card lists what he can drop.

### F22 P2 · The hall's own advice (tank + healer + the four bar changes) doesn't beat Krell
- As a player: I made every change the hall card lists, with a tank (87, Emberforged) and a healer (84). Three tries: out of time at 17% and 15%, one death on Offensive. Adding a third hero (a mage 18 Levels under, with no warning) won in 7:54. The card says "Party: a tank and a healer"; what it takes is damage. Better: the card says how many heroes the wins had (the summary's line "Your Challenge fired 1 time" points at the tank, but the gap was damage), and the hall warns about an under-Level member as the ground does.

### F23 P3 · The Sewer card says "Play one from Characters" when every hero is already playing
- As a player (Bryn, all four heroes in the strip, three of them in Corwen's party): "Your other heroes can come too. Play one from Characters and it shows here. Up to four play at once." They were playing; they were in another party. Better: "Corwen, Ilsa and Maren are in Corwen's party. Leave it from their Party window to bring them."

### F24 P2 · A boss call costs 10,000 gp and, by its own words, pays nothing
- As a player: Sewer card > "Call out the Rat King for 10,000 gp". Confirm: "You get no XP, coin or drops in his room." I called him with Bryn (Level 44 on a Level 8-25 ground): killed by a Drain Rat in the room, dropped to 43. From the screen there is no reason to call. Better: say what a win earns (a title, a bestiary stage, a guaranteed trophy), or cut the call until it has one.

### F25 P3 · The Training Yard's view says it "isn't in the World yet"
- As a player: Training > Ranged > Start training. The hunt view reads "Training Yard isn't in the World yet. The Mill Cellar is. Hunt in the Mill Cellar". Training works (1 h = +11,663 Ranged XP for 368 gp, no stamina) but the screen calls it unfinished. Better: a yard scene, or a still card saying what is training and how fast.

### F26 P3 (info) · Scaled hunts can't be found from the screen
- As a player I looked on all 11 Hunts cards and the Shop's Buy and Services tabs: no scaled hunt. Root cause (code, after logging): data and server exist (`src/data/scaled-hunts.js`), no client window reads them, so it is hidden, as §3.5 asks of a half-built feature. Not played.

### F27 P3 · Phone layouts: the sheet cuts the bar at 922x423; Configure action shows one row at 667x375
- 922x423 (touch): the bag and Hunts sheets slide in from the right and read well; the action bar is cut behind the sheet after slot 8, and the Hunts list's first visible row is clipped under its advice line (shots 025, 026, local only). 667x375: the hunt screen keeps HP, bar, stance and Chase in view; Configure action shows one spell row of the table at a time (shot 028).

### F28 P2 · Tamsin's board stops at Level 32
- As a player at Level 87: the board offers only Gray Wolves (5), Turncoats (8), the Rat King (8, party), Glade Poachers (16) and Goblin Diggers (32, party), paying 480-1,090 gp plus a few Silk Thread or Copper Ore. Nothing for the Ford, the Slake, the Barrows, the Pyre Field or the Hold, so from about Level 35 her daily pick of a ground is gone. Better: one task a March ground, paid in that ground's tier armor in the hero's weight (her armor pick already exists).

### Harness notes (tools/qa/local-world.mjs, not game bugs)
- A skip moves hunt clocks back but not `player_blessings.bought_at`; `hr_blessing_take` counts only Blessings with `bought_at <= settled_to`, so after many skips a death can ignore held Blessings (seen once at the Barrows; a fresh Bless before entering applies correctly).
- A wait never crosses a UTC day, so Tamsin's 3 a day and the 6 refills a day never reset in a long local run (the header says so).
- A skip's settle can lag about 60 s; the screen then showed a boss at 77% after the server had ended the fight at 17%.

---
## FINAL (2026-11-15): where the run ended
Corwen (sword and shield) reached **Krell's Hold at Level 85 after about 415 hunted hours** (Level 50 at about 157 h), hunted it to 87, and **beat Lord Krell** on the fourth Hall Key with three heroes. Every ground was played: Cellar, Thicket, Wickstead, Glade, Warrens, the Sewer (boss room), Ford, Slake, Barrows, Pyre Field, Hold, the hall. 4 heroes, 8.4M gp. Not reached: the Weighhouse (closed on the local chain), scaled hunts (hidden), v0.2.133 (factions, training gear, the Burning Tower: not on origin/main by the end), and every live real-time check (the built-in pane is signed out on hearthrise.net and Claude in Chrome was never connected).

### Top 10 changes by player value
| # | What the player feels now | Change | Findings |
|---|---|---|---|
| 1 | "I pressed Equip upgrades for 40 Levels and still swing a Level-15 sword." | A bane counts only where it wins; the bigger numbers go on. | F15 (P1) |
| 2 | "It says my friend has 1 minute of stamina and we're all going home." | The party roster reads the real pool; a stale alert leaves with the next envelope. | F7 (P1, in flight) |
| 3 | "I'm in range on Normal and I die in 8 minutes." | Every hunt card and bar slot says when your food heals too little for your HP, and the Barrows card says it expects a healer, the way Krell's hall card already teaches its fight. | F14, F22, F5 |
| 4 | "8 million gold and nothing to spend it on." | Tempering tiers past Steel priced by Level, House tiers priced in the millions, Works caps per hero; the Weighhouse window points at the Works. | F12, F20, F17, F19 |
| 5 | "I beat the last boss and got 174 gold." | Krell's first win always pays something named, with a reveal; the hall lists his drops. | F21 (lanes in flight) |
| 6 | "The coach and the alerts cover my hero, even during Krell." | Hunt-time cards dock away from the hero and the boss; alerts for other heroes stay in the strip. | F1, F13 |
| 7 | "114 presses to sell my old armor, and my second hero starts the loot plan from zero." | "Sell gear below what you wear" in one press; the loot plan from any bag stack; copy a plan from another hero. | F18, F11 |
| 8 | "Tamsin has nothing for me after Level 32." | One task per March ground, paid in that tier's armor. | F28 |
| 9 | "Still the Practice Shield at Level 87." | Shields every 15 Levels to 90, and Equip upgrades names a better shop piece. | F8 (in flight) |
| 10 | "Why would I pay 10,000 to fight the Rat King for nothing?" | Give boss calls a reward the screen names, or cut them. | F24 |

### Keep / fix / merge / cut, every system played
| System | Verdict | Evidence (this run) |
|---|---|---|
| Sign-up, hero creation | KEEP | Clear "How you fight"; first kill in seconds |
| Coach (first hour) | KEEP, fix F3/F4 | Level 5 at 22 min; every step named the next; it stops teaching after Level 12 (food, runes) |
| Hunts list and cards, tiers | KEEP, fix F14 | "In your range / Next step up", best XP/h per ground; the Barrows card under-warns |
| Away and return | KEEP (best moment) | "Level 8 to 12 ... then went back to mining"; fix F9 |
| Action bar, Configure action | KEEP | g-per-HP tables, rune tiers with damage; cramped on phones (F27) |
| Rune ladder | KEEP | Carved vs Plain at the Slake: +18% XP for -28% gold, a real trade |
| Food and drink | FIX | Unused L1-12 (F5); decides life or death at 55+ with no nudge (F14) |
| Equip upgrades | FIX | Weapon trap (F15), shield never offered (F8) |
| Loot plan, Dispatch | FIX | Works and is honest; per hero and last hunt only (F11, F18) |
| Shop (Buy, Sell, Services) | KEEP | Sell all junk, Bless all, refills: one press each |
| Stamina refill | KEEP | Always pays for itself; price scales with Level |
| Death and Blessings | KEEP | Death card names the killer, the cost and the save |
| Tamsin's tally | FIX | Great at Levels 1-30 (skips a helm you wear); empty after 32 (F28) |
| Mining, Woodcutting, Fishing | KEEP | Town job resumes after a hunt; fills rest time |
| Cooking | KEEP | Wolf Meat at 1; bench tax shown and exact |
| Smithing | KEEP | Bars, tools, shields, House fittings |
| Crafting | FIX | Planks and two cloaks: a one-press grind with no decisions |
| Runecrafting | KEEP, unproven | Essence to blanks to Chalked runes works; value against 1-24 g store runes not measured |
| Farming | KEEP, small | Plant, water, harvest and replant; 4 plots |
| Hearth (Inner Flame) | KEEP | One press burns 11,574 bones; regen +34% |
| House | FIX | Homestead at 400 gp is trivial; tiers gated by materials, not gold (F12) |
| Storage, bag rows | KEEP | The over-cap bag is explained |
| Party | KEEP, fix F16 | +29% a head at the Warrens; a healer removes the food bill |
| Hero slots | KEEP | Slot 2 at about 83 hunted h ("about a week" holds) |
| Leaderboards, Havora sinks | KEEP, small | Works plaque, powders, rounds: about 50k a day at most (F20) |
| Boss calls | FIX or CUT | No reward on screen; killed a Level 44 hero (F24) |
| Krell's Hold and hall | KEEP, fix F21/F22 | Best teaching card in the game; the win pays nothing |
| Training Yard | KEEP, fix F25 | Stamina-free and cheap; the view says unfinished |
| Tempering | FIX | Stops at Steel (F17) |
| Weighhouse | not reached | Closed on the local chain (F19) |
| Scaled hunts | not reachable | Hidden (F26) |

### Against the 11-11 designer re-read (read after the first pass)
Landed and seen in play: #1 (Equip took the Bramble Blade, but see F15), #2 (away card names the town job), #3 (Tamsin skips worn slots), #4 (Cook Wolf Meat at 1), #5 ("then Spells"; "Waits for Power Strike"), #6 (best find on the away card), #9 (Dispatch line), #10 (Bless all). Still open: #7 (Dangerous bite on the first grounds: not measured here beyond one Glade death at 4 under), #8 (one-press sell of outgrown gear, now F18). New since: everything past Level 32 (F14, F15, F17, F20-F28).
