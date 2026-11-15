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

### F7 P1 · Party warning "Corwen has 1 min of stamina left ... Ilsa comes home too" while the server holds 11 h 30 — SENT to the Coordinator
- Repro (local world): Corwen hunts until stamina 0 (end_reason stamina), rests 12 h in town (mining), Ilsa (new hero, same account) invites him, Enter with party at the Glade. Right after entry the party read sends `stamina_low_ms` = 0 for Corwen; the alert "Corwen has 1 min of stamina left. Their hunt ends then, and Ilsa comes home too." appears and stays.
- Server: `player_state` slot 0 stamina 689.6 min (after the first settle); the hunt ran on. Screen: the warning stayed after a 30-min skip; gone only after a reload.
- Cause (code): `supabase/migrations/2027-02-27-hunt-tiers.sql:360` reads raw `ps.stamina_ms <= 900000`, not `public.hr_stamina_of(user, slot, now())` (the rest since `stamina_at` is ignored until a settle writes the pool). Client: `src/shell/alerts.js:177` keeps a `lowstam:` alert once shown, after the server stops sending it.
- Why it matters: an actionable number the server disagrees with; a player may buy a refill or pull the party out.

### F8 P2 · No shield past Level 30 for the default (sword and shield) hero
- Data (`src/data/items.js`): shields Practice 2, Bronze-Rimmed 3 (shop), Ironbound 5 (Smithing, L15), Kingsgrate 7 (Rat King), Coppercap 7 and Steelgrate 9 (L30). Nothing from 30 to 110, while swords run to 95, spellbooks (the mage off-hand) to 88. A tank's off-hand freezes for 80 Levels through the Barrow March.
- Also: Equip upgrades never offers the shop's Bronze-Rimmed Shield (140 gp, +3) over the Practice Shield (+2); Corwen still wore the Practice Shield at Level 31 with 230k gp. Better: a shield rung every 15 Levels (Smithing or March drops), and the Back-in-town card can name a shop piece better than what's worn.

### F9 P3 · The away card is taken back when the hunt ends at the moment of return
- Repro: enter with exactly 12 h stamina, close the page, `wait 720 --away`, return. The first envelope shows the hunt still settling (lag ~27 s); when it ends in view the card is withdrawn ("a hunt that ends with the card up takes the card", `src/shell/away-recap.js`). The summary stays, but "Level 17 to 24" (the best line of the return) is gone. Twice in a row. Better: when the card is taken by the hunt's end, the summary carries the Level span of the absence.

### F10 P3 · Only gathering resumes after a hunt; a bench job does not
- Repro: start Normal Plank (Crafting, 1,249 logs left), enter the Glade, stamina runs out. Summary: "Start mining, chopping or fishing before you hunt, and Corwen will go back to it when the hunt ends." The bench job is dropped. Tyler 10-14: "resumes the last non-hunt activity". The copy is honest; the rule is narrower than the ruling. Coordinator call: resume the bench with its remaining materials, or record the narrower rule.
