# Chapter 11: On-call heroes, the clan XP room and the town day

Part of "Hearthrise: the game we are building". Lane `lane/d-on-call-clan-xp` (game designer, 2026-11-21), cut from `set/v0.2.144` at 0ba61f38a, with the fold of the sitting merged in. Docs only. No game code, data or migration was changed. No other chapter was edited. Section 9 lists what the integrator has to change elsewhere.

**How to read the labels.**

- **RULED** (date): the owner decided it knowing what it cost. The sitting of 2026-11-21 (`review/01-sitting.md`) showed each option with its cost and no recommendation, so its answers are informed rulings.
- **PROVISIONAL**: this chapter's design and every number in it. A plan that has not been tested. Section 8 says what each part waits on.
- Evidence: **MEASURED**, **COMPUTED**, **ESTIMATED**, **JUDGMENT**, **UNKNOWN**. Nothing in this chapter is measured by me.

---

## 0. One screen

Three rulings of the sitting needed a design. They share one resource, a hero's 12 rested hours, so they are one chapter.

**1. On-call heroes (S-1).** The owner's design, verbatim, is the law:

> "on call is fine but should be full stamina, the on call hero trades their crafting/training time for a small cut of exp, no loss on death. HOWEVER they can only go on call once every 24 hours and it will only last for 12 hours. Then back to a chosen activity"

The spec. A hero's owner switches it on call once, with limits. Its window opens once every 24 hours and lasts 12. Inside the window the hero keeps doing its town job until a friend or clan mate seats it in a hunt. It then hunts on its hire stamina, a second pool that is separate from its own stamina. The caller sees that pool and may spend all of it. It earns 10% of its seat's XP (PROVISIONAL). It takes no coin and no drops, pays for no supplies and loses nothing on a death. When the hunt or the window ends it goes back to its job. The caller's own heroes earn exactly what they would beside a fourth hero of their own.

**2. The clan XP room (S-4 a, inside the full castle of S-7 b).** The castle's fifth building is the Library. Each of its ten levels pays +0.5% Level XP as a standing buff, +5% at the top (PROVISIONAL). It is one row on the modifier table and fills a new standing cap on Level XP. COMPUTED: the ceiling on a Hearthrise weekend moves from about 1.67 to about 1.74. The pace a player can hold all the time moves from about 1.36 to about 1.44. The Level table stays the clock of the plain four, which is now also the four in no clan. The first region past staged content must be open by about day 50 and not day 55.

**3. The town day.** One rule: **a resting hero does one job at a time, counted jobs first and one standing job last, and on call is a switch that may interrupt it.** Bounded things run first (the job queue, the week's castle labor). One unbounded thing fills what is left (train, gather, labor or fuel). So nothing with an endless appetite can starve the rest, and no hero stands idle.

**A fourth, small one: Setups and their priced slots (S-3 a).** The book kept "one Setup for each ground" and the sitting kept five slots a hero, three of them free. Section 10 fits the two: a Setup is a named kit, and a ground points to one. Pointing is free and has no limit. The prices do not change and no sink is added.

**What stays unknown until played.**

- Whether anyone seats a guest when every account has four heroes. The design makes a guest worth a seat only when a seat would be empty or weaker. That may be rare.
- The 10%. It is a judgment about "small".
- Whether +5% Level XP makes clans form or makes them a tax.
- Every castle size. They were a hypothesis the day they were written and still are.
- Whether a party hero has spare rested hours. The solver says it wants 2.1 to 4.4 of 12. Labor and on call are sized as if that is true.

---

## Read log

| Source | How much |
|---|---|
| `review/01-sitting.md` and the owner's ten answers | Whole |
| The rulings of record | The 2026-11-20 and 2026-11-21 blocks, and every line on on-call heroes. Private. Cited by date only |
| `25-social.md` | Every line on on-call heroes, by search. Not whole |
| `48-platform-cost.md` | Sections 0 and 4, and the save rows, by search. Not whole |
| `06-mmo-layer.md` | 2.2, 2.4, 2.8 and 2.9 whole. The rest by search |
| `07-home-and-town.md` | 2.8 opening, 2.10, 2.11. The rest by search |
| `08-player-experience.md` | 2.2 (the company plan and the job queue), the stamina day, the Path rows, by search |
| `05-progression.md` | 2.4 and 2.5 |
| `10-level-choices.md` | Whole. I wrote it |
| Code | None read for this chapter. The window ids `friends` and `hunt-party` were seen in `src/data/shell-windows.js` for chapter 10 |

---

## 1. On-call heroes

### 1.1 The purpose test

**The player problem.** Nothing in the game lets one player's hero help another player while its owner is away. The social study measured four testers pressing in the same ten minutes in 5 of 675 windows. An idle game cannot ask two people to be at the screen together.

**The decision it adds.** For the owner, once: is this hero on call, for whom, and up to which tier. For the caller, at a hunt's start: fill this seat with my own hero or with a friend's.

**What it plugs into.** The rest plan (it is a switch on the hero's town day). The party start (a seat filled from a consent row). The party XP step and the two-thirds rule. Friends and the clan roster. The ledger.

**The honest limit.** Every account has four heroes from the first hour, so a party is usually full. A guest is worth a seat when a seat would be empty, when a hero is lower in Level than the rest, or when the four lacks a job. That is a narrower need than the 2026-11-20 design assumed. It is still the only way a veteran stands beside a newcomer without being there.

### 1.2 The owner's words, line by line

| The words | The spec | Label |
|---|---|---|
| "on call is fine" | On-call heroes are in the game. Another account's hero can fill a seat again. This reverses MM-18 | RULED 2026-11-21 |
| "should be full stamina" | The hero has **hire stamina**, a pool separate from its own stamina. The hirer sees how much it holds and may spend all of it. Hunting on call never spends the hero's own stamina. Section 1.3 | RULED 2026-11-21, in the owner's second answer below. The pool's size and refill are PROVISIONAL |
| "trades their crafting/training time" | On call draws on the hero's rested hours and on nothing else. An hour hunted on call is an hour of town work not done. A hero on its own hunt cannot be called | RULED 2026-11-21 |
| "for a small cut of exp" | The hero earns a share of what its seat would earn, in Level XP and combat skill XP. It earns nothing else | RULED for "small". The size is PROVISIONAL |
| "no loss on death" | A death on call costs the hero no Level XP, no skill progress and no Blessing | RULED 2026-11-21 |
| "once every 24 hours" | One window for each hero in any 24 hours, counted by the server from the window's start | RULED 2026-11-21 |
| "it will only last for 12 hours" | The window closes 12 hours after it opens, called or not | RULED 2026-11-21 |
| "Then back to a chosen activity" | When a called hunt ends, or the window closes, the hero's rest plan carries on | RULED 2026-11-21 |

**What "full stamina" means.** RULED 2026-11-21. The first issue of this chapter asked, and the owner answered in these words: "I just mean the person hiring them can see how much stamina the hired hand has and the person hiring can use all of it, hired stamina and regular stamina should be two different sets of stamina I think". So there are two pools. Three things follow and all three are ruled: the hirer sees the hire stamina, the hirer may spend all of it, and a call never spends the hero's own.

### 1.3 The window, the hire stamina and the day

**Hire stamina.** PROVISIONAL for the size and the refill.

- It is a second bar on the hero. It opens at 12 hours (`hireStaminaHours`), the length of the window, so a hero seated for a whole window can be used for all of it.
- It refills to full when a window opens, which is once in 24 hours. It does not rest back inside a window and nothing sells a refill for it. A refill for gold would let a hirer buy more of a friend's hero than the ruling allows.
- It drains one for one while the hero hunts on call, the way own stamina drains on an own hunt. It drains at no other time.
- It is spent only by a hirer. The owner cannot hunt on it.
- **When it runs out mid-hunt the guest leaves.** The hunt goes on for the rest of the party, by the caller's "if one falls" line. The guest goes back to its rest plan. It cannot be seated again until its next window.
- A guest also leaves when the window closes, with whatever hire stamina is left unspent. So what a hirer can use is the smaller of the two, and the seat card shows that one number first.

**The window.**

- The owner switches a hero **On call** on its rest plan, once. It stays set until switched off.
- The window opens when the hero next starts resting, if 24 hours have passed since its last window opened. It closes 12 hours later.
- Inside the window the hero does its town job as usual. It is only taken from that job when someone seats it. So an hour is traded only when it is used.
- A hero can be seated more than once in a window, one hunt at a time.
- A called hunt ends for the guest when its hire stamina is spent or at the window's close, whichever comes first. The caller sees both before pressing Start: "Hire stamina: 7h 20m".
- The hero's own stamina is never touched by a call. It rests through the window as it would at any town job. So a full on-call day is 12 hours of its own hunting and up to 12 on call, with no town work. That is the trade the ruling names.
- **The owner is never locked out.** The owner can recall the hero at any time. It leaves the party the way it would at the window's close, and that window is used up. A free account's two-visit day (hunt 8, rest 4, hunt 4, rest 8) needs this, because its own second hunt can start inside the window.

### 1.4 Who can call, and how

| Rule | Value | Label |
|---|---|---|
| Who | The owner's friends, the owner's clan mates, or both. The owner picks once. Never a stranger. There is no live party finder (RULED 2026-11-21, S-2 b) | PROVISIONAL |
| Where a caller finds one | The Friends list and the clan roster show heroes on call with their Level, weapon, hire stamina and tier limit. One control: Seat. This is the on-call board of the 2026-11-20 ruling, as a view of two lists that exist | PROVISIONAL |
| The owner's limits, set once | The highest tier the hero may be taken to. Who may call | PROVISIONAL |
| What the caller cannot do | Change the guest's gear, bar, talents or target rules. The guest fights with its own saved Setup for that ground, or its default one | PROVISIONAL |
| Consent | A server row for each hero. The caller's Start is checked against it. No accept is needed, because the owner is asleep by design | PROVISIONAL |
| Where a guest may go | Hunting grounds the guest's Level opens, at or under the owner's tier limit. Not a boss hall with a prize, the Tower, the Catacombs, a world boss room or an arena in the first build | PROVISIONAL. A sample before a full set |
| How many | One guest seat in a party (`onCallSeatsPerParty`) | PROVISIONAL |
| Starting | The caller presses Start in a signed-in session, like every hunt. No hunt starts by itself | RULED 2026-11-20, 2026-10-18 |

### 1.5 The seat, and what the caller's party gets

A party is never more than four (RULED 2026-11-20). A guest takes one of the four seats. It is a seat like any other to the engine.

| What | Rule | Why |
|---|---|---|
| The party cell | The party is paid by its size, guest included (S-10 c). A four with a guest is a four | One table, no special case |
| The caller's heroes | Each earns exactly its own share, as if the guest were a fourth hero of the caller's | So a guest is never better than an own hero, and nobody benches a hero of the right Level to farm a bonus |
| The guest's Level XP and skill XP | Its seat's share times `onCallXpShare`. The rest of that share is not paid to anyone | The "small cut" |
| Coin and drops | The guest's share goes to the caller's account by the caller's loot plan. The guest's owner gets none | No gold or item ever crosses to the owner. That keeps on call from being a trade surface |
| Supplies | The guest's food, drink, runes and ammunition are bought at the hunt's start from the caller's purse, on the caller's spending budget. Nothing is taken from the owner's bag or purse | The owner's only cost is town time. A caller cannot burn a friend's gold |
| Mixed Levels | The two-thirds rule (MM-19) reads the guest like any hero. A high guest in a low party lowers the low heroes' shares by that one visible line | It bounds carried leveling with the rule the game already has |
| If the guest falls or leaves | The caller's "if one falls" line treats it as a hero of the party | One rule |
| Kill counts, Tamsin's tasks, firsts, the bestiary | The guest earns none | It is a helper, not a second career |

### 1.6 The size of the small cut

PROVISIONAL. `onCallXpShare` opens at **0.10**.

- COMPUTED. A hero called for all 12 hours of every window, in a party at its own Level, gains 1.2 hours' worth of Level XP a day on top of its 12. That is at most +10% Level pace for that hero. It is a reading of the worst case and not a likely state.
- Why that case is rare. Every hour a guest fills a seat is an hour one of the caller's own heroes does not fill it at full pay. Across the two accounts a guest hour moves Level XP from 1.00 to 0.10. On call only adds XP to the world when the seat would have been empty or held by a hero with no stamina.
- Why not more. At 0.25 a full window would be worth as much as the Hearthrise weekend, every day. That is not small.
- Why not less. A rested hour pays skill, materials and gold and no Level XP. On call pays only XP. At 0.10 an hour on call is a different currency worth choosing. Under about 0.05 I judge that nobody would give up a training hour for it. JUDGMENT.
- A guest in a party under its own Level earns 10% of a small number. Lending a veteran to a newcomer is a gift, and the game should say so on the card.

### 1.7 No loss on death

- A guest that dies loses no Level XP and no skill progress. Its Blessings are not used up and "Keep me blessed" buys nothing for an on-call hunt. Its day's death count does not move.
- The death still ends its hunt (RULED 2026-11-09). It goes back to its rest plan. The window stays open, so it can be seated again.
- **Against the Blessing ladder (S-5 b).** The ladder prices a blessed death in hunted hours of the hero's own play. A guest's death is outside it. Nothing about the ladder changes.
- **The exploit this invites, and why it does not pay.** A clan could put a guest in the front seat on Deadly so the hero most likely to die risks nothing. COMPUTED on the ruled death band and the ladder: the caller's own front hero then sits out and loses all of its XP for those hours to save 50 to 100 deaths in 1,000 hours at 3 to 5 hunted hours each. That is 1,000 hours given up to save 150 to 500. And when the guest dies the party has no front. Band OC3 below watches it.

### 1.8 The server shape

A build spec. Nothing here is built. It is a new server surface where one account's hero earns inside another account's hunt, so every line is inside the one Security review before Early Access.

**What the server owns.**

| Thing | Shape |
|---|---|
| Consent | One row for each hero: on or off, who may call, the tier limit, when the last window opened, and the hire stamina left (`hire_stamina_ms`, a server column beside the hero's own stamina and never the same number). Written only by the owner's intent. Per-user RLS. Friends and clan mates read it through a projection, never the table |
| The window | Opened and closed by the server clock. The client never sends a time |
| Hire stamina | Set to full by the server when a window opens. Drained only by the settle of a hunt the hero is a guest in, by the time that settle covers. No intent from any client can raise it |
| The projection | The owner sees the pool in `hr_state_of` beside own stamina. A friend or clan mate sees it in the on-call list and on the seat card, through the same projection that shows the consent. Every number on those cards is the server's and is replaced by each envelope |
| The seat | A guest seat on the party's hunt names the hero, its owner and the consent it was seated under |
| The credit | Computed in the same settle that pays the other seats, from the seat's share times `onCallXpShare`. Written to the guest's hero by the settle. No client value is involved at any step |

**Intents.** Each is one `SECURITY DEFINER` RPC.

| Intent | Sent by | Client sends | Server checks |
|---|---|---|---|
| Set on call | The owner | hero, on or off, who may call, tier limit | The hero is the caller's |
| Seat | The caller, as part of the party start | the guest hero's id, the seat | The consent is on. The caller is a friend or clan mate as the consent asks. The window is open. The hero holds hire stamina. The hero is resting and not seated elsewhere. The ground and tier are inside the limits. The party holds no other guest. The caller's purse can stock the guest |
| Recall | The owner | hero | The hero is the owner's |

**What happens at each seam.**

- **Seated.** The guest's town job is stopped and paid in closed form. Its Setup is read from the owner's rows by the server. Its supplies are bought from the caller's purse.
- **Each save.** The guest is a seat. Its reduced XP is applied with the other seats. The save drains the guest's hire stamina by the time it covers. The consent, the window and the pool are re-checked. If any has ended, the guest leaves at the instant it ended, as an own hero does when its stamina runs out.
- **Seat ends** (hunt end, death, hire stamina spent, window close, recall). One ledger row for the owner's account: the hero, the caller, the hunt, the hours and the XP credited. The guest's rest plan starts its next job.

**Clamps.** A hero is credited on call for at most 12 hours in any 24. A day's on-call XP for a hero is capped at `onCallXpShare` times 12 hours of the best pace its Level can read with every cap full. A settle that would credit more is refused and logged. A forged party cannot mint XP for a friend, because no party value comes from a browser.

**What Security should look at first.**

1. The settle writes XP to a hero the caller does not own. That is the cross-account write. The only input from the caller's side is which consenting hero sits where.
2. Level XP feeds leaderboards, so on-call credit reaches a ranked surface.
3. Two accounts run by one person. One account for each player is ruled, and the concurrent cap is by network. On call does not add a refusal by network, because two real players in one home are its most natural users. The bound is the 10% and the seat it costs.
4. The guest's Setup is read across accounts. The read must project only what a party member already sees.
5. Selling on-call time for gold through the market. Nothing here pays the owner, and the two-thirds rule bounds a carry. A side payment between players is possible and is worth little.

**Self-checks a migration must carry.**

1. A guest's hunt changes no gold, item or stamina on the owner's account.
2. A guest's death changes no XP, skill progress, Blessing or death count on the owner's hero.
3. The caller's heroes are paid the same with a guest as with an own hero of the same seat.
4. No hero is credited on call past its hire stamina, and so never past 12 hours in 24, across any number of seats.
5. A Seat with consent off, a closed window, a stranger, a second guest or a tier over the limit is refused with no change.
6. The same hunt settled with the caller's browser open and closed credits the guest the same. Both paths.
7. A guest hunt changes the hero's own stamina by nothing, and an own hunt changes its hire stamina by nothing.
8. Hire stamina is raised only by a window opening. No intent raises it.

### 1.9 What a mixed party costs to save

From study 48, which I read in part.

- MEASURED there: a save of a four with no client open costs about 35 ms to read and 100 ms to apply, and one save carries all four heroes. A party of four is the cheapest idle shape: 10.9 database-seconds for the account's closed day against 17.6 for four lone hunts.
- A guest is one of the four seats in one hunt. So a party of heroes from two accounts is still one hunt and one save. ESTIMATED, not measured: the save adds no statement. It reads the guest's rows from a second account, writes the guest's hero with the other seats, and adds one ledger row when the seat ends. The social study priced an on-call seat the same way: no settle statement, one ledger row.
- The two accounts' days. The caller's account pays for its hunt as before. The owner's account pays two extra town statements, the stop and the restart of the job, and skips the town work it would have done.
- UNKNOWN: whether reading a second account's perks and Setup in the save is the same single read. If it is a second read, a save costs about 35 ms more, which is about a quarter more for that hunt. The reliability engineer measures it. The budget is 15 cents an account a month (RULED 2026-11-21).

### 1.10 The first hour and the screens

**The first hour is untouched.** On call is not shown, taught or reachable in it.

| Touch point | What changes | Label |
|---|---|---|
| The Path | One row. On call opens when the account has its first friend or joins a clan, and has a hero at Level 10 or more | PROVISIONAL |
| The rest plan | One switch for each hero: On call. Under it, set once: who may call, the tier limit. "Apply to all four" as one press | PROVISIONAL |
| The hero strip | A badge on a hero that is on call or out on a call. The owner sees hire stamina as a second, smaller bar under the hero's own | PROVISIONAL |
| Friends and the clan roster | Heroes on call, with Seat | PROVISIONAL |
| The Party window | The guest's seat card shows its Level, weapon, **hire stamina as a bar with hours and minutes** and the two-thirds line if it applies. If the window closes before the pool would be spent, the card shows the smaller time and says which. It shows the supply cost the caller will pay | PROVISIONAL |
| The return card | One line for the account: which heroes were called, for how long, by whom, and the XP earned. A death on call reads as no loss | PROVISIONAL |
| The hunt report | The guest's row, marked as a guest | PROVISIONAL |

Labels are standard words: On call, Seat, Recall, Guest. A good mechanic that reads badly is the art director's to fix.

**The walk-through.** Each step uses only what the steps before it give.

| Step | Who | Does | Needs | Doable |
|---|---|---|---|---|
| 1 | Owner | Adds a friend or joins a clan | The Friends window or the clan browser, both ruled | Yes, existing design |
| 2 | Owner | Switches one hero On call, friends and clan, up to Dangerous | A hero at Level 10. The rest plan | New build |
| 3 | Owner | Sends the four hunting and closes the game | One Start | Yes |
| 4 | Server | The hero's hunt ends, it starts its town job, and its window opens | Step 2. 24 hours since its last window | New build |
| 5 | Caller | Opens the Party window and sees the hero under Friends, "Hire stamina: 11h 40m" | Step 4 | New build |
| 6 | Caller | Puts three own heroes and the guest in the party and presses Start | An empty seat. Gold for the guest's supplies. A ground inside the limits | New build |
| 7 | Server | Stops the guest's job, pays it, seats the guest | Closed-form town work (GR-1) | New build, on GR-1 |
| 8 | Server | Saves the hunt. The guest gets 10% of its share. The caller's three get their full shares and all the coin and drops | The party XP step | New build |
| 9 | Server | The hire stamina is spent or the window closes. The guest leaves and its rest plan starts the next job | Step 4's clock | New build |
| 10 | Owner | Reads one line on the return card | Step 9's ledger row | New build |

---

## 2. The clan XP room

### 2.1 What is ruled

RULED 2026-11-21 (S-4 a): a clan room pays a standing Level XP bonus. It reverses the 2026-11-20 ruling that clans give no Level XP. The costs were on the page: the top pace reading rises, every clan member levels faster than the Level table all the time, the next region must open sooner, and being in no clan becomes a real cost.

RULED 2026-11-21 (S-7 b): the full castle. Five buildings of ten levels, labor in rested town hours, a weekly upkeep that switches the buffs off when unpaid, votes and a treasury. About a year. Its sizes were a hypothesis the day they were written.

### 2.2 The room

PROVISIONAL.

- The fifth building is the **Library**. It was held open in chapter 06 for exactly this answer.
- **Each level pays +0.5% Level XP. Level ten pays +5%.** A straight line, like the other rooms, which reach their caps at level ten.
- It pays Level XP only. Not skill XP, not coin, not drops.
- It is one row on the modifier table on the Level XP knob (`xpPerKill`), a standing buff. It is read at the settle with the hero's other rows and adds no statement. It is not a special rule.
- A member holds it the way a member holds every room: by giving the week's share. Unpaid upkeep switches it off with the other buffs.
- Neither arena reads it. A guest on call carries its own clan's row on its own small cut.

**The step, by level** (COMPUTED from the straight line):

| Library level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Level XP | +0.5% | +1.0% | +1.5% | +2.0% | +2.5% | +3.0% | +3.5% | +4.0% | +4.5% | +5.0% |

A stage of the castle is 1 to 1.3 weeks (chapter 06, HYPOTHESIS). So a clan that votes for nothing but the Library reaches +5% in 10 to 13 weeks, and a clan that builds evenly reaches it in about a year.

**Is it the room every clan builds first.** JUDGMENT: no. The War room's +5% damage is kills, and kills are Level XP, coin and drops together. The Library is Level XP alone. A clan that wants its members richer builds the War room. A clan that wants the next ground builds the Library. That is a vote worth having. UNKNOWN until clans vote.

### 2.3 The modifier table

The Level XP row of chapter 06 gains a standing cap. Rows on one knob sum, and then the caps apply. That is the table's own rule.

| What it moves | Standing cap | Timed cap | Fully buffed |
|---|---|---|---|
| Level XP, as it stands in chapter 06 | none | +25% | +25% |
| Level XP, with the Library | **+5%** | +25% | **+30%** |

### 2.4 The pace ceiling

COMPUTED. Inputs: best gear 1.15, both damage caps 1.15, the fastest talent build 1.012, the weekend at +25% for 3 days in 28.

| Reading | Chapter 06 today | With the Library full |
|---|---|---|
| Every cap full, on a Hearthrise weekend | 1.65, about 1.67 with Talents | 1.72, **about 1.74** with Talents |
| Every cap full, on an ordinary day | 1.32, about 1.34 | 1.39, about 1.40 |
| The fastest seat a player can hold all the time | about 1.36 | about 1.42, **about 1.44** with Talents |
| A member who earns every buff and buys nothing | about 1.31 | about 1.37 |

The sitting quoted 1.73. That multiplied 1.65 by 1.05. The table sums rows on one knob, which gives 1.72 before Talents. The difference is under 1% and the table's rule is the one to print.

Like every number on this table, these are products of targets. No cell has ever held a buff.

### 2.5 The Level law and the runway

- **The clock does not move.** The Level table is the clock of a plain mid-geared four on suggested builds, and the law never reads a buff (chapter 05, 2.4). That four is now also the four in no clan.
- **A member of a full clan is ahead of the table all the time.** Before this ruling a plain four could only be ahead of the table on a weekend or with gear. Now the standing gap is 5%.

COMPUTED on the law, in days at 12 hours a day:

| Door | The plain four, in no clan | A plain four with a full Library | The fastest held seat before | The fastest held seat now |
|---|---|---|---|---|
| Krell's Hold (88) | 31 | 30 | 23 | 22 |
| End of open content (110) | 49 | 47 | 36 | 34 |
| End of staged content (185) | 116 | 110 | 85 | 80 |
| Level 400 | 373 | 355 | 274 | 259 |

The early rows overstate the Library. A new account cannot reach a castle in its first weeks, and a Library takes at least 10 weeks to fill. Krell at day 31 is before any clan has more than a level or two.

- **The runway.** Band R1 asks for each region to be open 30 days before the first fours arrive, and it is read on the fastest seat. That seat now reaches the end of staged content on about day 80. So the first new region must be open by about **day 50**, where chapter 05 says about day 55. Past that, a region every 45 to 53 days becomes a region every 42 to 50. COMPUTED, 1.36 over 1.44.
- If that schedule cannot be met, chapter 05 already names the fix and it is not the Level law. Here it would be the Library's step, which is one data row.

### 2.6 A player in no clan

The owner accepted the cost in these words on the page: "Being in no clan becomes a real cost". So the design does not cancel it. There is no catch-up buff for a player with no clan.

What the design does do is make sure the cost is a choice and never a wall.

- The plain four in no clan levels exactly on the Level table. Every hour in the book is that player's hour. Nothing is taken away.
- The cost is at most 5% of Level pace, and it arrives slowly, because a castle does.
- A castle is open to a clan of any size (chapter 06). A player who wants no company can found a clan of one for 100,000 gold and build the Library alone, at the floor price of five members. That is dear and it is possible.
- A newcomer who joins a clan with a full Library holds +5% from the first week it gives its share. So the Library is also the game's first real catch-up for a late arrival, and a reason for an old clan to want new members only if the share is worth more to it than the seat. UNKNOWN.
- The clan browser must show a clan's Library level, so the cost of the choice is on the screen.

---

## 3. The town day

### 3.1 The problem

A hero rests 12 hours a day and works for all of them (RULED 2026-11-21). These draw on those hours:

| System | Appetite | Costs |
|---|---|---|
| The job queue: nodes and benches | Bounded. A count for each step. The solver reads 2.1 to 4.4 hours a day for a party hero | Materials for bench jobs |
| Castle labor (S-7 b) | Bounded by the week's share if capped. Endless if not | Nothing |
| The training yard | Endless | Gold by the hour |
| Fuelling the Hearth | Bounded by fuel in the bag | Fuel |
| On call (section 1) | Up to 12 hours in 24, only when someone calls | Nothing |

These do not: Tend the field (a visit and no hero hours), curing (a House slot and no hero), the market.

Three of the five can eat every hour a hero has. If any of them comes first, the others get nothing.

### 3.2 The rule

PROVISIONAL.

**A resting hero does one job at a time. Counted jobs run first. One standing job runs last. On call is a switch that may interrupt either.**

| Part of the rest plan | What it is | Runs |
|---|---|---|
| **1. The queue** | Up to three steps, each a job with a count, as chapter 08 designs it | First, in order |
| **2. The week's labor** | Castle labor up to a cap in hours a week. One number, set once | After the queue, until the week's cap is met |
| **3. The standing job** | One job with no count: Train, Gather the best I can, Labor, Fuel the Hearth, or Wait in town | Whenever parts 1 and 2 have nothing to do, until the hero next hunts |
| **On call** | A switch, not a job | Interrupts whichever job is running when the hero is seated. The job is stopped and paid. When the hero returns, the plan carries on from part 1 |

Why this order.

- Everything with a count or a cap comes before the one thing without. So an endless job can only ever take what is left.
- There is exactly one endless job for each hero, so two endless jobs never compete.
- On call does not hold hours in reserve. It takes an hour only when the hour is used, which is what the ruling says it trades.

**Labor and the week's share.** Labor hours count toward the account's weekly share at the wage curve's value, as chapter 06 says. What labor does not cover, the standing gift pays in gold on Monday. So a hero called away all week costs its owner gold and never the clan's buffs.

### 3.3 Defaults, so nobody has to plan

| Moment | The default | Why |
|---|---|---|
| A new company | The starting rest plan of chapter 08 as the queue. Standing job: Gather the best I can, in the trade the hero started with | It makes materials and spends no gold |
| Joining a clan | One card offers: "Labor: cover the weekly share", split across the four heroes. One press | The share is paid in spare hours before it is paid in gold |
| Train | Never a default | It spends gold. A player turns it on |
| On call | Off | It hands a hero to other people. A player turns it on |
| A standing job that cannot run (no gold for the yard, no fuel, no clan) | The hero falls to Gather the best I can, and the return card says so once | A hero never stands idle because a plan line broke |

Every line can be set once and applied to all four, like every line of the company plan.

### 3.4 What the player sees

The rest plan shows one bar for the hero's 12 rested hours, filled from the server's projection: "Queue 3h 20m. Labor 1h. Train 7h 40m. On call: on." Closed form makes this possible, because a job's length is its count over its rate.

### 3.5 How it sits on closed-form town work

GR-1: a job is paid at its start, at each paid hour and at its stop, with no tick between.

- Every part of the rule is a job in that sense, including the standing job, which is a job with no count.
- An interruption (a call, the owner's Start for a hunt, a plan edit) is a stop. The job is paid to that instant. Nothing is re-rolled, because a job's dice are seeded at its start.
- The week's labor cap and the on-call window are server clocks.
- ESTIMATED: the rule adds at most one more job a hero-day, the standing job, to the count study 48 assumed. Its cost for 48 rested hero-hours was itself an assumption there. UNKNOWN until the town-hour fixture and the load test that GR-1 already waits on.

### 3.6 A ruling this touches

RULED 2026-11-20: a rest plan's list ends in "wait in town" or "hunt again, once", and a plan never loops. The standing job replaces "wait in town" as the usual ending. It does not loop and it starts no hunt, so I read it as inside that ruling. It is still a change to what was described on the page, and the integrator should list it as one.

---

## 4. Knobs and data

For `tools/balance-program/formulas/knobs.json`. None exists in the game today.

| Knob | Opens at | What it moves | Label |
|---|---|---|---|
| `onCallXpShare` | 0.10 | The small cut | PROVISIONAL |
| `onCallWindowHours` | 12 | How long a window lasts | RULED 2026-11-21 |
| `hireStaminaHours` | 12 | The size of the hire pool. That it is a separate pool is RULED 2026-11-21 | PROVISIONAL |
| `onCallEveryHours` | 24 | How often a window opens | RULED 2026-11-21 |
| `onCallSeatsPerParty` | 1 | Guests in one party | PROVISIONAL |
| The standing cap on Level XP | +5% | The Library's ceiling. A cell of the cap table, not a new knob | PROVISIONAL |

Content data: the Library's step for each level (0.5%), the default labor cap, the default standing job, the Level at which on call opens.

---

## 5. What the balance matrix needs

The framework audit found no town work, no buff and no mixed-account party in any cell. So most of this chapter cannot be read by the tool today.

| Piece | What the simulator lane adds | It answers |
|---|---|---|
| The Library | Nothing to play. Level XP is linear in the XP knob, so +5% is arithmetic on any cell. One line in the derived tables: the four readings of 2.4 | The ceiling and the runway |
| A guest seat | The mixed-Level cells MM-19 already waits on, with one seat's XP multiplied by `onCallXpShare` and its coin sent to the party | Bands OC1 and OC2 |
| The town day | Band T7's model (the rested day in closed form, check H2 of chapter 07) gains labor, the standing job and called hours as activities | Whether a party hero has spare hours at all |

**Bands, proposed ids. All PROVISIONAL.**

| Band | Reads | Range |
|---|---|---|
| **OC1** | A caller's own hero: XP an hour with a guest in the fourth seat over XP an hour with an own hero of the same Level and way there | 0.97 to 1.03 |
| **OC2** | A hero's Level pace with every window fully used over its pace with none | At most 1.10 |
| **OC3** | A four on Deadly with a guest in front: the account's total Level XP an hour, deaths priced in, over the same four with its own hero in front | Under 1.00. A guest shield must never be the best way to level |
| **CX1** | The fastest held seat with a full Library over the plain four | At most 1.45 |
| **TD1** | Rested hours a mid-geared party hero's plan fills from the queue and the week's labor, before the standing job | 3 to 9 of 12. Under 3 means the bounded jobs are too small to matter. Over 9 means on call and training have no room |

---

## 6. Risks

| Risk | How it is handled | What would show it failed |
|---|---|---|
| **Nobody seats a guest** | Named in 1.1. The design does not pay a caller to bench a hero | Under 5% of party hours with a guest once it is live. Then it is the newcomer's helper only, and that may be enough |
| **Carried leveling as a market** | The two-thirds rule, the 10%, one guest a party, nothing paid to the owner | Ledger rows where one hero is called every day by the same low party |
| **A no-loss guest as a death shield** | It costs the caller a hero's whole XP. Band OC3 | Deadly parties with a guest in front as the common shape |
| **A friend burns my gold or kills my hero** | The owner's purse and bag are never read. A death costs nothing. A tier limit | Nothing to watch. It is closed by construction |
| **The cross-account write** | No client value. Consent re-checked at each save. Clamps. One ledger row a seat | The Security review |
| **Clans become a tax** | The Library is 5% and slow. The plain four is on the table | Players who join a clan, give the share and never speak. Read with the weekly goal |
| **Every clan builds the Library first** | The War room is worth more to most accounts. A vote | The Library first in over 80% of castles |
| **The runway moves up five days** | Stated in 2.5. One data row lowers it | The art schedule for the first new region |
| **Labor eats training** | Counted first, capped by the week. One endless job | Band TD1 over 9 |
| **A chore times four** | Every line set once and applied to all four. Defaults that spend no gold | A return visit over 4 minutes |
| **Server cost** | One save for a mixed party. The Library adds no statement | The reliability engineer's measure of the second-account read |

---

## 7. What I did not check

- I ran nothing. No engine, no matrix, no browser.
- I did not read `25-social.md` or `48-platform-cost.md` whole.
- I did not check in code how a party start seats a hero, how the loot plan splits a share, or whether a settle can write a hero of another account today.
- I did not size a castle stage, the weekly share or upkeep. Chapter 06 owns them and they are a hypothesis there.
- I did not re-derive the 1.36 held seat of chapter 05. I reproduced it from its stated inputs.

---

## 8. What each part waits on

| Part | Waits on |
|---|---|
| On call, the mechanic | The Security review. A playtest with at least two clans |
| `onCallXpShare` | The mixed-Level cells of MM-19, then play |
| A guest's save cost | The reliability engineer, on a party from two accounts |
| The Library's step | Clans existing with people in them. One buff played in a cell, as the review asks for every buff |
| The runway at day 50 | An owner and a timed sample for a region, which the review already asks for |
| The town day rule | GR-1's town-hour fixture and load test. The job queue built and played (GR-80) |
| Band TD1 | A solver with a supplies goal, labor and training in it |

---

## 9. For the integrator

I edited no other chapter and no decision file. I checked this list by search against the book with the fold of the sitting merged in.

**Already done by the fold. Only the pointer changes.** The sitting's answers are on the ruled list. MM-18 reads kept and points here. The Library is named as the fifth building with its size owed. The party rule of chapter 06 already lets a hero from another account join. Wherever the book says this chapter is "being written", it now points to it. In the rows below, read "add" as "fill in" where the fold left a placeholder.

| Where | Change |
|---|---|
| `00-the-game.md` | Add chapter 11 to the index. T-fix-1 and T-fix-4 are answered by the sitting. Reversal 18 (MM-18) is refused. The ruled list gains the sitting's S-1, S-4 a and S-7 b |
| `decisions/` | MM-18 becomes SUPERSEDED by S-1, with one new PROVISIONAL row for on call that points here. One new PROVISIONAL row for the Library. One for the town day rule. No number in any of them is decided |
| `06-mmo-layer.md`, 2.2 | The Level XP row gains a standing cap of +5%. The power budget gains the readings of 2.4 here: about 1.74 on a weekend, about 1.44 held. "No clan room gives Level XP" is removed in both places it stands |
| `06-mmo-layer.md`, 2.4 | The fifth building is the Library, with the step of 2.2 here. "Clans give no Level XP (25-2) is kept" is reversed. "A clan never fills a party seat" needs a second sentence: a clan mate's on-call hero may. The castle is the full castle of S-7 b, RULED, with its sizes still a hypothesis. Labor follows section 3 here |
| `06-mmo-layer.md`, 2.9 and 2.10 | "A party is an account's own heroes" gains the guest seat. The row "hired, lent or on-call heroes" leaves the list of what is not in the game. Its superseded rows on on-call heroes and their playtest come back |
| `05-progression.md`, 2.4 | The four clocks gain the columns of 2.5 here. R1 reads about day 50. The plain four is the four in no clan |
| `05-progression.md`, 2.5 | One row: a death on call costs nothing and uses no Blessing |
| `08-player-experience.md`, 2.2 | The rest plan gains the week's labor, the standing job and the On call switch. "The list ends in wait in town" is re-read as in 3.6 here. The stamina day gains one line: on call spends no stamina. The Path gains the On call row. The return card gains one line. Its superseded row on lent seats is updated |
| `07-home-and-town.md`, 2.11 and section 5 | Town work's list gains castle labor. Still-missing item 7 (a party hero's spare rested hours) points here and at band TD1. The superseded row that leans on MM-18 is updated |
| `04-economy-and-crowns.md` | On call moves no gold to the owner and is not a Crowns surface. The caller pays a guest's supplies. Labor covers the weekly share before gold does |
| `09-platform-and-measurement.md` | The knobs of section 4, the bands of section 5, one cost row for a mixed party marked ESTIMATED, and the cross-account write on the Security list |
| `00-the-game.md`, 6.2 | Row 8 is closed by section 10 here. Row 9 is closed by this chapter. Consistency row 18 reads "a Setup is one saved thing, and a ground points to one" |
| `03-items-and-crafting.md`, 2.14 and GR-48 | "How one Setup for each ground fits five slots is OPEN" is replaced by section 10: each ground remembers one Setup, by pointing to one of the hero's slots. GR-48's text changes from "one Setup for each ground" to "one remembered Setup for each ground" |
| `01-core-and-combat.md`, section 5 item 17, and `05-progression.md`, GR-48 row | The same wording |
| `08-player-experience.md`, 2.2 | The plan row gains: a ground with no pointer uses the hero's first Setup. An edit made at a ground asks Save or Save as new. Copy to another hero fills one of that hero's slots |
| `04-economy-and-crowns.md` | No number changes. 55,000 gold a hero and 220,000 for four stand. One sentence: slots four and five sell a fourth and fifth kit, never the memory of a ground |
| `10-level-choices.md` | No change. A guest fights with its own talents. The ceiling it quotes, about 1.67, is the reading before the Library |
| `08-player-experience.md`, the stamina day | A hero has two pools: its own stamina and hire stamina. The book's line that on call spends no stamina becomes: on call spends hire stamina and never the hero's own. The hero strip shows both |
| `06-mmo-layer.md`, the on-call rows, and `00-the-game.md`, S-1 | Add the owner's second answer of 2026-11-21 on two pools beside his S-1 words. The reading asked of the Coordinator is closed |
| `09-platform-and-measurement.md` | One more knob, `hireStaminaHours`, and one more server column on the Security list |
| `04-economy-and-crowns.md` | Nothing sells hire stamina. The stamina refill does not touch it |

---

## 10. Setups and the five slots

A small addition. It closes row 8 of section 6.2 in `00-the-game.md`.

**What is ruled.** RULED 2026-11-21 (S-3 a), as first ruled on 2026-11-05: a hero has three free Setup slots, then two more at 15,000 and 40,000 gold. Five for a hero. The cost was on the page: a hero that hunts more than three grounds meets the price, and a player then pays to stop repeating a decision by hand.

**The conflict.** The book says "one Setup for each ground". A hero hunts dozens of grounds in its life and owns five slots at most. Read as one saved copy for each ground, the two cannot both hold.

**The fit.** PROVISIONAL.

| Thing | What it is | Costs |
|---|---|---|
| A **Setup** | A named kit of the hero: the weapon, the worn set, the linings, the bar, the target mode and the talent unlock switches. It lives in one of the hero's slots | Three free. The fourth 15,000 gold. The fifth 40,000 gold |
| What a **ground remembers** | Which Setup was last used there, with the tier and the seats. It is a pointer to a slot, not a copy | Nothing, for any number of grounds |

- "One Setup for each ground" now means: each ground remembers one. Many grounds can point to the same Setup.
- A ground the hero has never hunted uses its first Setup. So a hero with one kit never opens the Setup screen again.
- An edit made while standing at a ground changes the Setup that ground points to. If other grounds point to it too, the save asks once: Save, which changes it everywhere it is used, or Save as new, which takes a free slot. With no free slot, Save as new shows the price of the next one.
- Deleting a Setup sends the grounds that pointed to it back to the first Setup.
- Copy to another hero fills one of that hero's slots, under that hero's own count.

**Why this answers the cost that was on the page.** Remembering which kit a ground uses is free for ever, so nobody pays to stop repeating a decision. What the fourth and fifth slots sell is a fourth and a fifth kit. That is breadth of build, which is what the owner said on 2026-11-18 a sink should make a hero choose.

**How many kits a hero needs.** JUDGMENT. One for most of its life. A second for a second weapon on the weak side or for hunting alone. A third for a set of linings that answers a different element. The fourth and fifth are for a player who tunes by ground. A hero that wants a different kit for six elements cannot have it, and that limit is the ruling. UNKNOWN how many players reach for slot four, because nothing has measured how many kits a hero uses.

**The gold.** COMPUTED, unchanged: 55,000 gold a hero and 220,000 for four heroes, once. No price moves and no sink is added.

**Where else it shows.** A guest on call (section 1.4) fights with the Setup its owner's hero has pointed at that ground, or its first Setup. An arena build of chapter 10 is not a Setup and takes no slot.

**The server.** A slot count for each hero, raised only by the purchase RPC that the ruled price already needs. A pointer for each hero and ground, written by the party start that already remembers tier and seats. The purchase is a gold surface and is journalled like every other. Nothing new for the Security review beyond the purchase itself.
