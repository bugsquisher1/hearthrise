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
