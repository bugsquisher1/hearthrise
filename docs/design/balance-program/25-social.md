# Balance program 25: Social

Dive of `lane/d-balance-social` (game-designer, 2026-11-20). Eleven systems: parties, chat, friends, town, clans, clan-castle, clan-board, clan-feasts, clan-treasury, factions, faction-skills. Nothing in the game was changed. Labels as in `01-model.md`: REAL, MEASURED, CITED, RULED, READ FROM DATA, ASSUMED, PROPOSED, plus PLAYED (what I pressed and saw on the local world today).

**What this dive is.** Four systems are live and were played (parties, chat, friends, the town). Seven are dark or designed and were read from their tables and functions, not played: no player, real or test, has ever made a clan row. So the clan half is a design review, and every clan number is READ FROM DATA or PROPOSED. Gold is priced on the economy dive's gold model (`origin/lane/d-balance-economy` d9554e87f, Q1); goods are priced at Shop book value and marked "re-price after 23".

**The inventory needs two changes.** (1) `clan-castle` and `clan-board` are listed as dark. They are worse than dark: the functions that finish a building, raise a tier and withdraw gold were dropped (section 0). The rows should say "dark, cannot complete". (2) `parties` should name the seeker half of the finder: `party_seekers` and `hr_party_seek` exist on the server and no client calls them.

## Summary

### Verdicts

| Verdict | Count | Systems |
|---|---|---|
| KEEP | 2 | town, factions |
| FIX | 4 | parties, chat, friends, clan-feasts |
| MERGE | 2 | clan-board (into clan-castle), clan-treasury (into clan-castle) |
| BUILD | 1 | clans |
| HOLD | 2 | clan-castle, faction-skills |
| CUT | 0 systems | Three parts are cut inside the cards: the rested XP grant, gold withdrawals, Standing as a second gate |

### The answer to the question under every card

**In today's game one real person never needs another, and the game tells the two who try that they were wrong to.** Four facts, in the order a player meets them:

1. **Two new friends are told they earn 55% less together.** PLAYED: two fresh accounts, both on the starting sword and shield, party up in town. The Party window reads "Classes: 1 of 4. Level XP each: about -55% vs solo in Mill Cellar." That is the first social sentence the game says. It is true (MEASURED: a Thicket four earns 0.51x a lone hero, `ref.json`), and the ground that fixes it (the Sewer, a four at about 1.6x alone from Level 5, RULED 11-18) is not named on that screen.
2. **A party needs everyone online in the same minute, and visits are 2 to 5 minutes.** An invite is live only while both are on. A seek ends when its hero signs out (`hr_party_seek_live`). The finder shows a lone hero "No open parties" and gives it no way to leave its name (PLAYED). REAL: 0 finder uses, 0 hours with another person.
3. **From the second hero on, a friend is a worse copy of your own hero.** The party cell reads size and classes, never whose heroes they are. An own hero shares your purse, your schedule and your stop rules. A friend's hero has none of that and takes the seat one of yours would fill. REAL: 65 parties, every one a single account.
4. **Nothing above a party exists.** No clan, no clan chat, no shared goal, no trade. The Guild tab is ruled for Early Access and unbuilt.

**What has to be true for a social layer to matter beside the own four** (each is a ruling Tyler can make, not a tuning pass):

- **A. The one-hero weeks are the social window, and they must be the best weeks to group in.** On the ruled slot prices (300k, 750k, 1.5M) a new account is one hero until about Level 30 and a four near Level 50 (CITED 24). That is 7 to 14 weeks (ASSUMED, from 24's free-gold table). Three friends are a four on day one, without the 2.55M. This is the only place a friend beats an own hero, it is exactly what the 11-09 ruling wanted ("more opportunities for guilds to start and people to invite their friends"), and today those are the weeks the party pays least.
- **B. Parties must not need two people online at once.** An idle game's party is a standing one: decided once, remembered, and playable by whichever member turns up. The change is "on call" heroes (card 1).
- **C. After the own four exists, stop asking people to hunt together and give them something to build together.** At Level 80 nothing in a hunt makes a second person useful, and no honest bonus fixes that without paying people to open second accounts. What other people are good for then is a clan: a chat of people you know, a pool of on-call heroes, a castle that takes the gold and goods a rich account has nothing to spend on, and later one weekly hunt that needs more than four heroes.
- **D. A clan must give no power and no Level XP.** The built feast pays +1 to +4% XP and the built rested grant pays up to 128,000 Level XP a day for nothing. A clan-wide XP buff bought with gold and goods is the "gold-funded server XP buff" on the 11-04 avoid list, one clan at a time, and it is a new multiply lever on a budget that is already broken (01 section 5).

### The five changes that matter most

| # | Change | Why first |
|---|---|---|
| 1 | **On-call heroes and standing parties** (parties, friends, clans). A hero can be left on call for friends or the clan, with its own limits; a member who is online starts the hunt and the on-call heroes go with it | It is the only change that lets two real people's heroes hunt together at 10 online and 2-minute visits. Everything else social hangs off it |
| 2 | **The first party tells the truth and points at the Sewer** (parties). The Party window names the ground and the weapon change that turn "-55%" into a gain, and the hero-creation screen spreads friends across weapons | First-hour. Today the first social act is punished and explained wrongly |
| 3 | **Clans, step 1: a roster, a chat tab, the browser, the on-call board. No castle** (clans, chat). | Ruled for Early Access already. It is small because the tables and 24 functions exist |
| 4 | **Shared supply cost (Mode B)** (parties). Ruled 10-25, unbuilt | In a four of friends the tank profits and the Mage loses gold on the same hunt (MEASURED: lone Mage net -320 at Level 50, -10,144 at 60). An own four never feels it because it has one purse. Friends do, on day one |
| 5 | **The castle is re-shaped before it is finished** (clan-castle, clan-board, clan-feasts, clan-treasury): one build queue, a weekly pace, no XP, no gold out, rations for food | The built castle cannot be completed, gives a member nothing the engine reads, and is priced for a 60-member clan to finish in two days of gold |

### Tyler rules on

1. **On-call heroes.** A player may leave a hero on call for friends or the clan; another member's hunt can seat it while its owner is offline, inside limits the owner set once (grounds, tier, hours a day, gold to keep). *Recommend: yes.* Alternative: parties stay live-only, and the party with other people is accepted as a rare event for players who talk on Discord.
2. **Does a clan give any Level XP?** *Recommend: none, ever.* The feast gives rations (food and drink a member cannot sell) and the rested grant is cut. Alternative: keep the feast at your 08-09 rebase (+1 to +4% for 1 to 4 hours), classed with events so it never stacks with a Bonus XP weekend.
3. **When do clans open?** *Recommend: step 1 (roster, chat tab, browser, on-call board) in the beta, the castle after the beta shows clans with ten or more accounts.* Alternative: your 10-15 ruling as it stands, chat at Early Access and halls after it.
4. **Is the clan castle a gold sink for rich accounts, or a climb paced by time?** *Recommend: both. Keep the built price ladder as the start (8.7M gold, about 15M of goods), and let one work order finish a week for each slot, so a castle takes about six months for any clan that keeps it supplied.* Alternative: price it by members so a clan of 60 pays six times a clan of 10, with no time floor.
5. **Can gold or goods ever come back out of a clan?** *Recommend: no. The treasury is one-way and rations cannot be sold or traded.* Alternative: officers may withdraw, behind the 24-hour delay and the market's fee. That makes the treasury a way to move gold between accounts.
6. **A fee to found a clan.** *Recommend: 100,000 gold (about a day of an own four's free gold at Level 50), so a name is worth something and one person cannot squat fifty.* Alternative: free, with one clan founded per account per 30 days.
7. **Membership is per account, not per hero.** Built that way. *Recommend: keep it.* Alternative: per hero, which lets one account sit in four clans and feed one from the others.
8. **Shared supply cost (Mode B).** *Recommend: build it as the default offer whenever a party holds two or more accounts, agreed once and remembered by the standing party.* Alternative: leave costs personal and accept that a friend on a wand pays for the party.
9. **Faction skills.** *Recommend: hold Bulwark and Reap until the combat dive lands, then ship them only if each measures within 2% of the same hero without it at Levels 105, 118 and 175.* They were measured once, at Level 24, where no hero can have them. Alternative: ship them with the first Morrow pair as measured (+2 to +7% kills an hour) and take the XP-per-kill cut that follows.
10. **Joining a faction for the whole account.** *Recommend: one press joins every hero on the account that has killed Krell, and the rest as they do.* An own four only earns standing together if all four are one side, so four separate choices are one decision asked four times. Alternative: per hero as built.
11. **The party of more than four.** *Recommend: do not raise the party cap. When clans have members, the clan's weekly hunt is two fours in one hall (eight seats, so at least two accounts).* Alternative: a fifth seat, which the own four cannot fill and a friend can. It needs every ground re-measured.

## 0. What the clan code is today (READ FROM DATA; not played)

| Fact | Where |
|---|---|
| 13 tables and 47 functions replay in the chain. Every client door was revoked from every role on 2027-01-18 | `2027-01-18-dead-surfaces-cut.sql` section 3 |
| A clan seat is per ACCOUNT. Founding is free. Join policy open or invite, kick with a ban (7 days default, 30 at most), bans and invites journalled | `2026-08-11-clan-membership-authority.sql` |
| Castle: five tiers. Standing 0 / 12k / 60k / 240k / 900k, gold 0 / 40k / 200k / 800k / 3M, member cap 10 / 15 / 25 / 40 / 60, distinct contributors 0 / 3 / 5 / 8 / 12 (members of 72 hours), a clan hunt cleared for tiers 4 and 5 | `hr_castle_tiers`, `2026-08-08-clan-seat.sql` |
| Five buildings (Treasury, Tavern, Sawmill, Smeltery, War Room), each to level tier x 2, cost base x 1.58^(level-1), labour 800 x 1.42^(level-1) ticks | `hr_castle_buildings`, `clan_work_post` |
| **`clan_tier_up` and `clan_work_complete` were dropped** (RULED CUT 10-22). A work order can be posted, supplied and laboured and can never finish. No tier can rise | `2026-12-04-world-actions-cut.sql` lines 84 to 87 |
| **`clan_raids` was dropped**, and tiers 4 and 5 are gated on a row in it | same file, line 130 |
| **`clan_withdraw`, `clan_upkeep_pay`, `clan_set_role`, `clan_claim_leadership` were dropped.** The `clan_withdrawals` table has no writer. A leader who stops playing can never be replaced | `2026-09-07-drop-dead-server-objects.sql` lines 202 to 207 |
| **Labour ticks are a number the client sends** (`clan_work_labour(p_ticks)`, clamped 200 a call and 400 a day). Nothing on the server counts work | `2026-08-08-clan-seat.sql` |
| **No building gives anything the game reads.** The perks (craft speed, smith speed, raid power) were removed from the perk channel on 10-14; the feast returns `all_xp` to a client that no longer exists; the engine passes `restedQuantum: 0` | `src/core/perks.js` REMOVED note, `src/core/member.js` |
| The catalogue of what the stores accept is 31 old-client item ids. The three capstone trophies (War Crown, Ancient Claw, Dragon Gem) drop only from monster rows on no open ground | `hr_castle_items`; `grep` of `src/data/grounds` finds none of the three |
| The feast pays +1 / 2 / 3 / 4% XP by Tavern level (Tyler's 08-09 rebase), 1 to 4 hours, once per 20 hours, for 720 to 1,800 heal points of cooked food | `2027-04-20-feast-call-ladder.sql`, `clan_feast_deposit` |
| The rested grant banks one charge per 6 minutes away, 80 at most, 160 XP a charge a Tavern level: 128,000 Level XP for 8 hours away at Tavern 10 | `2026-08-09-bonus-rebase.sql` |
| Upkeep is 250 gold and 2 Field Rations a building level a week, 10% off at Treasury 10. Missing it makes the hold dormant; nothing is lost | `clan_upkeep_settle` |
| Castle goods ARE consumed today, by the House: Timber Beams, Iron Fittings, Field Rations and Keystones are in the Manor, Keep and Castle rows | `src/data/homestead-tiers.js` (so the note "no consumer but this" in `systems.mjs` is out of date: for the home dive) |

## 1. `parties` (live). Verdict: FIX

**Played.** Two fresh accounts on a private local world (`tools/qa/local-world.mjs` `openWorld`, two `play()` sessions). Alder opened Party (Y), typed "Bryn", pressed Invite: "Invite sent to Bryn." Bryn's Global chat showed "Alder invites Bryn to their party." and the Party window "Invites (1) ... Alder: party invite, Join, Decline". After Join both windows listed two seats and "Classes: 1 of 4. Level XP each: about -55% vs solo in Mill Cellar. Mix Melee, Ranger, Mage and Healer for more". Alder pressed Pick a hunt, Mill Cellar, Enter with party; Bryn was carried in with no press. After a 20-minute skip both were Level 3 at 60%, Bryn's window read "The party is hunting in Mill Cellar." A lone hero's finder: Search returned "No open parties" and offered nothing else. Not played: a party with a third and fourth person, a party across a sign-out, cost sharing (not built).

| # | Answer |
|---|---|
| 1 Purpose | Problem: a lone hero cannot hold a Deadly pull. Decision: who fills the four and which tier. Plugs into every ground, the XP table, the rare roll. At hour 1,000 it is the own four's home and nobody else's |
| 2 First principle | Repeats by hand today: re-invite after every party closes; the leader re-picks the ground; each of four heroes re-enters after a death sends them home. An invite and a seek are forgotten at sign-out. A standing party (members, ground, tier, cost rule) should be remembered until someone leaves it. Presses for an own four per visit: Start once for all four today (PLAYED: one Enter carried both), which is right |
| 3 Ledgers | Level XP: a converter of heroes into rate, x0.51 (thicket), x1.78 (glade), x2.17 (ford), x1.58 (pyre), x1.70 (hold) of a lone hero a head, Deadly four (MEASURED `ref.json`). Gold: a transfer (even split of coin; costs personal). Attention: a sink today for friends (both must be on), a source for the own four (one start for four heroes). Items: the rare roll is a transfer |
| 4 Budget | Multiply class. One table: 1,700 permille for a four of four classes, 880 for a same-class pair (`src/data/party-class-xp.js`). With tier it is 1.8 to 2.6x the contract (MEASURED) and about 3x in real play (REAL), over the 2.0x cap 01 proposes. That is the combat dive's to fix. At 240 and 400: FORMULA, the cell is flat, so the party's edge is whatever the pull allows |
| 5 Seven players | New: nothing (the finder is empty; alone it dies 8.9 times in 100 hours, REAL). Own four: everything, at no social cost. Heavy and Premium: the same. Ceiling: the same. Buyer: buys the slots on day one and never needs a person. **Four friends: a four on day one against 7 to 14 weeks of slot gold (ASSUMED from 24: 300k + 750k + 1.5M at 125k to 285k a week), and today it can only happen if all four are online together.** Real use with another person: 0 people, 0 hours |
| 6 Server cost | A four is 720 statements, 9,270 row writes, 44 ledger rows a hero-hour, under four lone heroes (MEASURED, 01 section 7). Crons `hr-hunt-party-sweep`, `hr-party-reap`. On-call seats add no settle statement (a seat is a seat); Mode B settles once at the hunt's end. `measure.mjs cost --add statements=0,ledger=1,writes=0`: inside the allowance |
| 7 Population | At 10: works only for one account's heroes. With on-call heroes it works at 10 because the pool is everyone who played today, not everyone online this minute. At 1,000: the finder caps at 50 parties a read; it needs the ground and Level filter to carry it. At 10,000: per shard, no cross-player contention (hunts are instanced) |
| 8 Server age | Day 1: nobody to find. Month 1: the heavy players own fours and have left the pool. Month 6: a newcomer's Sewer has nobody in it. On-call heroes of veterans' low alts and the scaled hunt (a leader scales an early ground to its Level, RULED 11-07) are the two things that put a veteran beside a newcomer; scaled hunts need the party to follow the leader's Level, which is ruled |
| 9 Exploits | Leeching (a Level 5 hero in a Level 80 four): XP share is even "regardless" (RULED 11-08), so a carried alt is allowed by ruling; it is the own four's normal case. On-call abuse: a leader drags a lent hero into a ground to die (6% of its XP) or to burn its owner's gold. Clamps PROPOSED: the owner's grounds and tier ceiling, hours a day, gold to keep, and the hero's own "leave if anyone leaves or dies" box (built, default on). Mode B: a member runs up a supply bill on purpose; clamp by capping the pooled bill at each member's own bar and the ground's measured store bill. The 32 s seed horizon: unchanged, a Leave still lands at the next settle (RULED 10-20) |
| 10 Teaching | First contact: the hero-creation screen ("Staff: Heals the party"), then nothing until the player opens Social. PLAYED dead moment: "No open parties", and "-55% vs solo" with no next step. The Hunts detail does say "Players: 1 to 4" and "Open the party finder" |
| 11 Throughput | No content of its own. Every new ground is a party ground for free |
| 12 Money | Hero slots are the gold price of not needing friends (2.55M). The Buyer skips the social window entirely by buying gold: that is the accepted edge (RULED 11-18), and it is one more reason clans must not be where power lives. Premium gives a party nothing |
| 13 Telemetry | Hunt hours with two or more ACCOUNTS in the instance, as a share of all party hours. Today 0%. Target: 25% of party hours under Level 30 in the first beta month. Red line: under 5% with on-call live. Second row: seeks and on-call seats used a day (a feature at zero for two days is a P1) |

**Fun.** "My healer went out with Andy's four while I was at work and came back two Levels up" is a sentence nobody can say about another idle game I know of. Dead moment found: the finder.
**Rulings.** Party of 4, any mix (10-15, 10-16): COMPLIES. One flat table by size and classes (11-16): COMPLIES. Leave together box (10-22): COMPLIES, PLAYED on Bryn's window. Mode B (10-25): OPEN, unbuilt. "Own characters join instantly" (10-19): COMPLIES. Finder filters by weapon (10-15): COMPLIES, and it starts on the hero's own weapon.

**The party promise (question 9).**

| Who | Level 5 | Level 30 | Level 80 |
|---|---|---|---|
| Four friends, one hero each | The Sewer on day one, about 1.6x what each makes alone in the Thicket (RULED 11-18, CITED lane/d-party-pace). Promise: "bring three friends and skip the lonely week". Needs change 1 and 2 to be reachable | A Deadly four at 1.76x the contract (MEASURED glade) while a lone friend is at 0.99. Promise: "you are a four ten weeks before you could buy one". Needs Mode B, or the Mage friend pays for it | Each owns a four by now. A mixed party gains nothing over an own four. Promise: none in the hunt, and the game should not pretend. The clan is the promise here |
| One account's own four | Not owned yet on the ruled prices | Two heroes, maybe three: its own pair at 1,500 permille | The home case: 1.87x the contract, one purse, one press. Nothing to add but struggle (combat dive) |

**Walk-through of the first-friends sequence (change 2), against real data.** Every name was read on screen today or grepped.

| Step | What the player holds before it | Step | Doable? |
|---|---|---|---|
| 1 | Nothing | Each friend creates a hero. The screen lists five styles and says every weapon is in the kit ("Every weapon below is yours", PLAYED) | Yes. PROPOSED addition: the screen says "Hunting with friends? Pick different styles" |
| 2 | A Level 1 hero, 20 Cooked Shrimp, 500 gp (PLAYED: Hunt prep) | Each hunts Mill Cellar alone to Level 5; the Cellar ends itself there (`local-world.mjs` smoke: "ends itself at Level 5 (outgrown)") | Yes, about 0.3 hunted hours (REAL median to Level 5) |
| 3 | Level 5, in town | One opens Party (Y), types a name, Invite; the other presses Join (PLAYED) | Yes when both are online. With change 1: the invite waits, and the friend's hero is seated when its owner next signs in or is on call |
| 4 | A party of 2 to 4 | The Party window's line. Today: "about -55% vs solo in Mill Cellar". PROPOSED: it names The Sewer (in the finder's ground list, PLAYED) and the weapon to change | The Sewer opens at Level 5 (RULED 11-18). The line's numbers come from the built table `PARTY_VS_ALONE`; the Sewer's rows exist there |
| 5 | The party, the Sewer picked | Leader: Pick a hunt, The Sewer, Enter with party (the same three presses PLAYED on Mill Cellar) | Yes. Not played on the Sewer today: UNPLAYED |

**Change rows**

| Change | Systems | Ledgers moved | Size | Server work | Value | Evidence |
|---|---|---|---|---|---|---|
| On-call heroes: a server-held, per-hero consent with limits; a seat can be filled from it; standing parties remembered | parties, friends, clans | Attention (the big one), Level XP for one-hero accounts | L | Yes: a consent row a hero, seat-from-consent in the party start, limits checked at start and at each ground change | First week | REAL 0 hours with another person; visits 2 to 5 min; seeks end at sign-out |
| The Party window names the ground and weapon that fix a bad mix; creation screen nudges a spread | parties | none | S | No | First hour | PLAYED "-55%" |
| The finder lists seekers and on-call heroes; a lone hero can leave its name | parties | Attention | S | The server half exists (`party_seekers`); the seek must outlive a sign-out | First week | PLAYED "No open parties" |
| Mode B shared supply cost, settled at the hunt's end | parties | Gold (a transfer inside the party) | M | Yes, at session close only | First week for friends | MEASURED Mage net -320, -10,144 |

## 2. `chat` (live). Verdict: FIX

**Played.** Chat is not on screen when a new account arrives in town (screenshot at 1024x768); it appeared when I pressed Enter. It opens with Global, Local, System and Combat; a Party tab appears in a party. "No messages yet." The Town Crier control sits beside Send.

| # | Answer |
|---|---|
| 1 Purpose | Problem: an idle game is silent. Decision: none; it is presence. Plugs into whispers, party lines, criers, the combat log. The one social system real people use |
| 2 First principle | None repeated. A whisper tab is remembered for the session (6 at most) |
| 3 Ledgers | Attention only. The Town Crier is a gold sink (economy dive) |
| 4 Budget | None |
| 5 Seven players | All: free. REAL: 374 lines from 4 people |
| 6 Server cost | Realtime broadcast, at most 5 topics a client (`CHAT_LIMITS.realtimeBindingsMax`): global, system, zone, inbox, one spare. A clan tab takes the spare. `chat_messages` trimmed by cron. No statement on the settle path. A line is one insert; fan-out is Realtime's, and it is messages x listeners: Global at 10,000 online is the line to watch (platform dive) |
| 7 Population | At 10: empty, and criers fill it (RULED 11-11). At 1,000: Global is a firehose; it needs purpose channels (Trade, Party) and the clan tab. At 10,000: Global must be per shard or per language |
| 8 Server age | None |
| 9 Exploits | Spam and links (3 links, 240 chars, word filter, mutes, blocks: built). Gold sellers at 1,000: OPEN, needs report-from-menu and a new-account rate |
| 10 Teaching | A new player never sees chat unless they press Enter or open Social. Ruling 10-22 says it opens by default at the bottom left: BREAKS as played (for the Coordinator to confirm at Tyler's resolution) |
| 11 Throughput | Crier lines are content: cheap |
| 12 Money | The Town Crier line (gold). No Crowns |
| 13 Telemetry | Distinct accounts with a line a day / accounts online a day. Target 30%. Red line 10% |

**Rulings.** Tabs Global/Local/Guild/Party/System, Guild chat at EA (10-15/18): OPEN, no Guild tab. Combat log as a tab (10-16): COMPLIES. Resizable, bottom left by default (10-22): BREAKS as played.

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| The clan tab (the fifth topic) | chat, clans | Attention | S | A topic and its authorization | First week | RULED 10-15 |
| Chat open by default; rare drops and clan events as System lines | chat | Attention | S | No | First hour | PLAYED; RULED 10-22, super-rare broadcast |
| Trade and Party channels when Global passes about 200 online | chat | Attention | S | Topics | Long | ASSUMED |

## 3. `friends` (live). Verdict: FIX

**Played.** Friends (N): "No friends yet. Right-click a name in chat to add one." Bryn typed "Alder", Add friend: "Request sent", listed under Sent requests. Nothing on Alder's screen named the request in the next 3 seconds (the Friends window was closed). The corner chip read "0 online" on arrival and "1 online" a moment later, counting the player.

| # | Answer |
|---|---|
| 1 Purpose | Problem: finding the same person again. Decision: who. Plugs into whispers, invites, inspect. With on-call heroes it becomes the first pool a party is filled from |
| 2 First principle | A friend is remembered. An invite is not (card 1) |
| 3 Ledgers | Attention. Nothing else |
| 4 Budget | None |
| 5 Seven players | REAL: one link in total, 0 whispers. The Own four has no use for it today |
| 6 Server cost | `hr_social_state` every 30 s (55 s hidden): 120 reads an account-hour whether or not the player has a friend. `hr_players_online_cache` refreshed for everyone. PROPOSED: carry "anything new for me" as a version in the heartbeat and read the list only when it moves |
| 7 Population | At 10: an empty list. At 1,000: fine, per account |
| 8 Server age | None |
| 9 Exploits | Request spam (blocks hide requests: built). Presence leaks: "quiet" presence is built (`hr_set_presence_quiet`) |
| 10 Teaching | "Right-click a name in chat" is the only route, and chat is closed and empty for a new player. Dead moment: a request the other person does not see |
| 11 Throughput | None |
| 12 Money | None |
| 13 Telemetry | Friend links per account at day 7. Target 1.0. Today 0.2 |

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| A request, an invite and a friend coming online each make one System line and a mark on the Social icon | friends | Attention | S | No | First week | PLAYED |
| A friend's on-call heroes show in the Friends list with Seat | friends, parties | Attention | S | With change 1 | First week | PROPOSED |
| "1 online" reads "Only you are here" below 2, and names how many played today | friends, town | none | S | One count in the existing cache | First hour | PLAYED "0 online" |

## 4. `town` (live). Verdict: KEEP

**Played.** Havora on arrival: my hero by the Hearth, nobody else, "0 online". The town is the game's screenshot and it was empty.

| # | Answer |
|---|---|
| 1 Purpose | Problem: a multiplayer game with instanced hunts needs one place where others are seen. Decision: where to stand a hero (a station is a job). Plugs into every bench and node, criers, shows, later clan and faction marks |
| 2 First principle | The hero never walks by itself (RULED 10-19); a job is resumed after a hunt. Fine |
| 3 Ledgers | Server cost (below). Attention: none asked |
| 4 Budget | None |
| 5 Seven players | All free. The Own four's four bodies are most of what it sees |
| 6 Server cost | The cron `hr-town-refresh` every 25 s for everyone; a viewer polls `hr_town_view` every 2 s while it moves and 6 s idle (`TOWN_PRESENCE`), 600 to 1,800 reads a viewed hour; keepalive every 20 s. It buys other players' bodies, and at 10 online there are none in view. PROPOSED: when the snapshot holds no other account's body in this instance, fall to the 20 s keepalive. That is the platform dive's to size |
| 7 Population | At 10: empty. At 1,000: 60 players an instance (`TOWN_INSTANCE`), so 17 instances; who you are seated with matters. PROPOSED: seat by clan first, then friends. At 10,000: the same, per shard |
| 8 Server age | None |
| 9 Exploits | Position spam (publish floor 1 s, built). Name-plate abuse: names are moderated (`2026-10-11-name-moderation.sql`) |
| 10 Teaching | The first screen. Tamsin's tip names the next step |
| 11 Throughput | Art, the scarcest resource. Clan and faction marks on name plates are cheap; clan halls as scenes are not |
| 12 Money | Outfits are seen here: the town is where cosmetics have a public. Faction outfits and clan banners make it worth being seen |
| 13 Telemetry | Share of viewed town minutes with another account's body in view. Target 50% at 1,000 online. It is 0 today |

**Open question for the platform dive (unverified):** do heroes of signed-out accounts stand at their stations? If a hero that is fishing while its owner sleeps is drawn at the pier, the town is populated at 10 online for free, and it is honest (that hero is really working). I did not confirm either way.

## 5. `clans` (dark). Verdict: BUILD (step 1), as a design to rule on

Not played. This card is the answer to question 1.

**What a clan is for in a game where hunts are instanced and idle.** Not for hunting side by side: nobody is at the screen. Four things, in the order they are worth building:

1. **A room of people you know** (the clan chat tab). The cheapest retention there is, ruled already.
2. **A pool of heroes that are on call for each other.** The clan is the standing answer to "who can I hunt with": set once, used every day without asking.
3. **One thing built together that takes what a rich account has no use for.** REAL: the Own four holds 2.09M with nothing it wants and its heroes are idle 59% of their lives. A castle converts idle gold and idle bench hours into something every member can see.
4. **One weekly hunt that needs more than one account** (later, at 1,000 online): two fours in one hall.

**What a member decides.** Once: which clan, which heroes are on call and on what limits, and a standing contribution ("put these loot rows and this share of each hunt's coin into the stores", a destination beside Keep, Store and Sell, RULED 10-25 as a per-item plan). Each week: a vote on the next work order if the leader opens one (built), and whether to join the weekly hunt. Each day: nothing. A clan that asks for a daily press asks the real player for it four times.

**A clan of 3, 20 and 60.**

| Size | What it is | What it can do |
|---|---|---|
| 3 (10 online) | Three friends. A chat tab, three to twelve heroes on call | Everything in step 1. The Camp. Tier 2 needs exactly three contributors, so three friends can raise it |
| 20 | The normal clan at 1,000 online | Tiers 3 and 4, a feast a week, the weekly hunt |
| 60 | A big clan at 10,000 | Tier 5. Its problem is that 60 accounts finish anything priced for 10 in days: so the castle is paced by time, not by price (card 6) |

| # | Answer |
|---|---|
| 1 Purpose | Above. At hour 1,000 it is where an account's surplus goes and why it logs in on the day the hall rises |
| 2 First principle | Standing consent and standing contribution. Nothing daily |
| 3 Ledgers | Attention (given back: a party without asking). Gold and Items: sinks, through the castle. No Power, no Level XP, no Skill XP |
| 4 Budget | None. A clan holds no lever in any class. That is the rule that keeps it from becoming mandatory |
| 5 Seven players | New: a place to ask, and veterans' heroes to hunt with. Own four: somewhere for 2.09M and 59% idle hours to go, and people. Heavy four: a ladder to top. Buyer: can pay for a castle alone in a week, and gets a hall and a banner for it, nothing else. Four friends: a clan of four on day one. Fee to found PROPOSED 100,000: 0.6 days of an Own four's free gold at Level 50 (1.14M a week, CITED 24), 4 weeks for a New player, who should join one instead |
| 6 Server cost | The clan panel is one read on open (`clan_seat_read`), re-read only when a version carried in the existing 30 s social poll moves: 0 new polls. Chat: one topic. Contribution from hunts: one row at the hunt's end, not a settle statement. `measure.mjs cost --add statements=0,ledger=1,writes=1 --share 0.5`: inside the allowance, +24,000 ledger rows a day at 1,000 online. Members x members: the roster with presence (60 rows read by 60 members). Bound it by reading it on open only, never on a timer |
| 7 Population | At 10: three friends, works. At 1,000: about 50 clans. At 10,000: the browser needs paging and search; nothing is contended across clans |
| 8 Server age | Month 6: the big clans are full. A newcomer needs open clans with free seats at the top of the browser, dormant ones hidden, and a reason for a clan to want a newcomer: the weekly contribution ladder decays 12% a week (built), so a new member can top this week's list, and tier gates count distinct contributors |
| 9 Exploits | See the table after card 9 |
| 10 Teaching | PROPOSED first contact: the Social menu's fifth row, and a crier line once the hero is Level 10. Never a popup |
| 11 Throughput | Step 1 is no content. The castle is art (card 6) |
| 12 Money | None sold. Bought gold builds a hall faster inside the weekly pace: an edge in looks only |
| 13 Telemetry | Accounts in a clan at day 7; clans with 3 or more accounts active in a week. Red line: under 20% of day-7 accounts in a clan a month after step 1 opens |

**Rulings.** "Guild chat at EA; guilds/halls post-EA" (10-15/18): COMPLIES with step 1 then the castle. "ALTS TAKE LONGER ... opportunities for guilds to start" (11-09): this design is its other half. CUT 10-22 (`clan_board_*`, `clan_hunt_declare`, `clan_tier_up`, `clan_work_complete`): COMPLIES; nothing here revives them as they were, and Tyler said then "ask before cutting" the rest, so the three part-cuts are on the ruling list.

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| Step 1: re-open create, join, invite, kick, leave, browser, roster read; add succession (a leader 14 days away passes to the top contributor), the chat topic, a founding fee | clans, chat | Attention; Gold (the fee) | M | Grants back on about 12 functions, one new function, one topic. On the EA Security list | First week | 24 functions replay today |
| The clan as an on-call pool | clans, parties | Attention | with card 1 | with card 1 | First week | card 1 |

## 6. `clan-castle` (dark, cannot complete). Verdict: HOLD, then BUILD re-shaped

Not played. HOLD until the beta shows clans with ten or more active accounts; the design below is what to build then. This card is question 2.

**The built ladder, priced (READ FROM DATA; gold on 24's model; goods at Shop book, re-price after 23).** Goods at book: Timber Beam 230, Iron Fitting 190, Field Ration 90, Keystone 3,000 (`src/data/items.js`).

| Step | Gold | Beams | Fittings | Rations | Keystones | Goods at book | Total |
|---|---|---|---|---|---|---|---|
| Tier 2 Palisade | 40k | 300 | 120 | 0 | 0 | 92k | 132k |
| Tier 3 Timber Hold | 200k | 900 | 500 | 400 | 0 | 338k | 538k |
| Tier 4 Stone Bailey | 800k | 2,400 | 1,500 | 1,200 | 40 | 1.07M | 1.87M |
| Tier 5 Fortified Keep (plus three trophies no open ground drops) | 3.0M | 6,000 | 4,000 | 3,000 | 200 | 3.01M | 6.01M |
| Treasury 1 to 10 | 662k | 4,962 | 2,481 | 0 | 0 | 1.61M | 2.27M |
| Tavern 1 to 10 | 992k | 6,616 | 3,308 | 9,924 | 0 | 3.04M | 4.03M |
| Sawmill 1 to 10 | 827k | 5,789 | 2,481 | 0 | 0 | 1.80M | 2.63M |
| Smeltery 1 to 10 | 827k | 4,135 | 4,135 | 0 | 0 | 1.74M | 2.56M |
| War Room 1 to 10 | 1.32M | 6,616 | 4,962 | 0 | 0 | 2.46M | 3.79M |
| **Whole castle** | **8.67M** | **37,718** | **23,487** | **14,524** | **240** | **15.2M** | **23.8M** |

Building rows are base x (1.58^10 - 1) / 0.58 = base x 165.4. Labour: 61,584 ticks a building, 307,920 in all, 400 a member a day.

**In REF hours and weeks.** A hero in an own Deadly four frees 12.3k gold a hunted hour at Level 50 and 12.4k at 105; an Own four frees 1.14M a week and really spends 194k; a Heavy four frees 1.79M to 2.33M and spends nearly all of it (CITED 24).

| | Clan of 10 Own fours | Clan of 60 Own fours | Clan of 10 Heavy fours |
|---|---|---|---|
| Free gold a week | 11.4M | 68M | 18M to 23M |
| What it really spends a week | 1.9M | 11.6M | 17M to 23M |
| Gold only (8.67M): weeks of all free gold / at its real share / at a quarter of its real share | 0.8 / 4.5 / 18 | 0.13 / 0.75 / 3 | 0.4 / 0.5 / 1.6 |
| Gold and goods (23.8M): the same three | 2.1 / 12 / 49 | 0.35 / 2.1 / 8 | 1.2 / 1.2 / 5 |
| Gold a member, in hunted hero-hours at Level 105 (12.4k) | 70 (5 days of an Own four) | 12 (under a day) | 70 (2 days) |
| Labour at the cap | 77 days | 13 days | 77 days |
| For scale: one account's own shelf to Krell is 50.6M (CITED 24), and its own House's Castle tier is 2.5M | The whole clan castle is 17% of one member's own shelf | | |

**The goods against what crafters can make (question 3; READ FROM DATA, `recipes.js` and `gathering.js` times; re-price after 23).** Every beam is 5 Normal Planks, 2 Oak Planks and 2 Slime Gel; every fitting 3 Iron Bars, 2 Copper Bars and 2 Bone Chips. The whole castle is about 190,000 Normal Planks, 75,000 Oak Planks, 70,000 Iron Bars and 47,000 Copper Bars: about 740 hero-hours of chopping, mining, sawing, smelting and bench time. An Own four has about 140 hero town hours a week (REAL: 5 a hero a day). So **one account's idle heroes can supply an entire clan castle in about five weeks, and ten accounts in three or four days.** The bench is not the limit. The limit is two drops: 75,000 Slime Gel (the Cellar's Slime drops it 11% of kills, PLAYED on the Cellar's loot list) and 47,000 Bone Chips. As built, the castle's real cost is high-Level heroes farming the tutorial room for gel. That is a recipe fault for the items dive.

**What a finished castle gives a member, in the ten ledgers.**

| Ledger | As built in August | Read by today's game? | Class, and what I recommend |
|---|---|---|---|
| Power | War Room: raid power +10% | No (raids cut) | None. A castle gives no power |
| Level XP | Feast +1 to +4% for 1 to 4 h per 20 h. Rested: 128,000 XP for 8 h away | No (no engine hook) | The feast would be a multiply lever, event kind; rested is a source with no kill. CUT both as XP (card 8) |
| Skill XP | The feast's "all XP" covers bench skills | No | None |
| Gold | Sink: 8.67M to build, 11,250 a week upkeep at full size | Would be, if a tier could rise | Keep as a sink. Upkeep stays a pulse check, not a tax (11,250 a week is 0.1% of a 10-clan's free gold: it only detects a dead clan, and that is its job) |
| Items | Sink: 15.2M of goods | Would be | Keep. This is the consumer at scale for castle goods, beside the House |
| Town hours | Sawmill, Smeltery: bench speed +5% | No | Do not rebuild: bench speed is the House rooms' lever (home dive), and a clan must not beat a 5.95M room shelf for free |
| Hunt hours, Stamina | None | | None |
| Attention | Labour ticks, deposits, votes | | Must be near zero: standing contributions |
| Server cost | Lazy settles, no cron | | Keep that shape |

So, asked plainly: **nothing a member can feel today, and after the re-shape nothing that is power.** A finished castle gives a bigger roster (10 to 60), a bigger ration table, a hall others can see, and a line on the clan board. That is on purpose. If a castle gave +4% XP, every player would need a clan with a Tavern 10, clans would recruit by buff, and the Buyer could build one alone in a week.

**The re-shape (PROPOSED).**

1. **One number in, one gate.** Standing as built is 35% of deposit value, and the goods a castle needs produce almost exactly the 900k Standing tier 5 asks (those goods are about 25M at the catalogue's own values, which is 0.9M to 1.3M Standing). It gates nothing the bundle does not already gate. Cut it as a gate; keep it as the clan's lifetime score on the board.
2. **Labour is hunted minutes the server counted**, one tick a settled minute of any member's hero, credited once at the hunt's end, 400 an account a day as built. No client number.
3. **A weekly pace.** One work order may finish a week for each slot (the built `floor_until`, set to 6 days). 50 building levels and 4 tiers over 1 to 2 slots is about six months for any clan that keeps it fed, rich or not. This is what makes it a climb for a clan of 60 and for the Buyer.
4. **Finish the functions**: complete a work order, raise a tier, replace a leader. Drop the clan-hunt gate on tiers 4 and 5 until a clan hunt exists, and the three trophies no ground drops.
5. **Five buildings, re-purposed for today's game**: the Hall (tier: roster size), the Storehouse (stores cap), the Kitchen (rations, card 8), the Barracks (how many heroes a member may leave on call for the clan, and later the weekly hunt), the Works (the build queue's second and third slot). No bench speed, no XP.
6. **When it is finished**: the weekly feast and the weekly hunt go on, and Standing keeps counting on a clan board ranked by Standing earned this week per active member, so a clan of 8 can beat a clan of 60 and a new clan can enter.

| # | Answer |
|---|---|
| 1 Purpose | Problem: surplus gold, goods and idle hours with no want (REAL 2.09M unspent). Decision: what the clan builds next (the vote). Plugs into castle goods, the roster cap, rations |
| 2 First principle | Standing contribution, a vote a week at most. As built it asks for deposits and labour claims by hand |
| 3 Ledgers | Gold sink 8.67M and Items sink 15.2M a clan, once; upkeep 11,250 gold and 90 rations a week |
| 4 Budget | No lever. At Levels 240 and 400: unaffected, FORMULA (prices are flat and members' gold is flat from Level 50, CITED 24) |
| 5 Seven players | New: nothing to pay, a hall to belong to. Own four: the first sink it might want; at a quarter of what it really spends (48k a week) it carries a tenth of a 10-clan castle in 18 weeks. Heavy four: can carry a castle alone in 5 weeks of gold, held to six months by the pace. Buyer: the same, with bought gold; gets nothing the Heavy four cannot. Four friends: a four-member clan stops at tier 2's cap of 15 until it recruits, which is right |
| 6 Server cost | One ledger row a deposit, one a hunt's end. `clan_ledger` grows without a prune: fold rows older than 90 days into weekly totals |
| 7 Population | At 10: three friends reach the Palisade (3 contributors). At 1,000 and 10,000: per clan, nothing shared |
| 8 Server age | A clan founded in month 6 pays the same prices with the same weekly pace: six months behind, never locked out. The weekly board is the newcomer's race |
| 9 Exploits | After card 9 |
| 10 Teaching | The Hall's own panel: what is being built, what it needs, who gave this week |
| 11 Throughput | Five tier looks and five buildings of art, once. A banner by tier is the cheap first version (the hall as a scene can follow). Six months of play for one art batch is a good trade |
| 12 Money | Bought gold shortens nothing past the weekly pace. No Crowns |
| 13 Telemetry | Work orders finished a week a clan (target 1 to 2); share of clan gold from the top contributor (red line 60%: one whale carrying a dead clan) |

**Rulings.** "guilds/halls post-EA" (10-15/18): COMPLIES with HOLD. "No repair bills/durability" (11-04 avoid list): the upkeep is close to it in kind; it COMPLIES only while it stays a pulse check that destroys nothing. Sinks above a band's gold are on purpose (11-18): COMPLIES, and no Level, drop, ground or tier is behind it.

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| The re-shape, points 1 to 6 | clan-castle, clan-board, clan-treasury, clan-feasts | Gold and Items sinks; no XP | L | Yes: three functions back in a new shape, labour from the settle's end, a new catalogue of accepted goods | Long chase | Section 0; the price table |
| Take Slime Gel and Bone Chips out of the beam and the fitting, or give them a Level-fit source | (items dive) | Items | S | Data | Long | 75,000 gel at 11% a Cellar Slime |

## 7. `clan-board` (dark, cannot complete). Verdict: MERGE into `clan-castle`

Not played. What is left of the board is three functions: post a work order, supply it, add labour. The board's own tasks and rolls were cut by ruling (10-22). A work order is the castle's build queue and nothing else, so it is one system with the castle, and its card is card 6.

| # | Answer |
|---|---|
| 1 Purpose | The castle's build queue. As a separate system it has no decision of its own |
| 2 First principle | As built: a leader posts, members deposit by hand, then claim labour by hand. Merged: the leader queues, standing contributions fill it |
| 3 Ledgers | The castle's (card 6) |
| 4 Budget | None |
| 5 Seven players | Card 6 |
| 6 Server cost | `clan_work_orders` (a row an order), `clan_work_labour` (a row a member a day): bounded |
| 7 Population | Per clan |
| 8 Server age | Card 6 |
| 9 Exploits | Labour is client-sent today: OPEN until it is counted by the server. Order slots: 1 + tier / 3, built |
| 10 Teaching | The Hall panel |
| 11 Throughput | None |
| 12 Money | None |
| 13 Telemetry | Card 6's row |

**Is the board the consumer for castle goods (question 3)?** It is a consumer, and at the built size a small one: the whole castle is five weeks of one account's idle town hours. Castle goods already have a consumer in the House. What crafters lack is not a place to pour beams; it is other players who want what they make. **Commissions** (a member asks for 200 Etched runes, a crafter fills it; "shared-work commissions", not objected 11-18) are that, and they belong on the market as a buy order with the market's escrow and fee, not in the clan, or the clan becomes the fee-free market (card 9). For the economy dive.

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| MERGE: the work order is the castle's queue; no separate board | clan-board, clan-castle | none | with card 6 | with card 6 | | 10-22 cut |

## 8. `clan-feasts` (dark). Verdict: FIX (with the castle)

Not played. This card is question 4.

**As built.** Members deposit cooked food (31 foods, 5 to 60 heal points each, a server catalogue). At 720 to 1,800 points a leader or vice calls the feast: +1 / 2 / 3 / 4% to all XP for 1 / 2 / 3 / 4 hours, then 20 hours of cooldown. Separately, every member banks "rested" charges while away.

**Which ledger, which class, how large, does it multiply.**

| | The feast | The rested grant |
|---|---|---|
| Ledger | Level XP and Skill XP (a source paid for with Items) | Level XP (a source paid for with nothing) |
| Class | Multiply, the same kind as the Bonus XP weekend | None fits: it is XP without a kill |
| Size | An Own four that hunts 3.3 hours inside the 4-hour window: +4% of its day. A 24-hour hunter: +0.8% | 128,000 XP for 8 hours away at Tavern 10. Against REF (lone, an hour): 4.4 REF hours at Level 10, 0.52 at 50, 0.23 at 105. For a 3.3-hour player that is +133% of a day at Level 10 and +16% at Level 50 |
| Stacks with tier, party, events | As built it multiplies with all of them: a Deadly four at 2.62x the contract becomes 2.72x, and with the +25% weekend that was running when I played, 3.4x | Adds on top of everything |
| Cost to the clan | 1,800 heal points is 43 Cooked Shark or 225 Cooked Shrimp: about ten minutes of one hero's bench time a day | Nothing |

**Finding.** The feast is a clan-wide XP buff paid for with goods and gold: the 11-04 avoid list names "gold-funded server XP buffs". The rested grant is larger than the feast for the real player and is paid for with absence. Neither is in the engine today, so cutting them costs no player anything.

**The re-shape (PROPOSED): the feast makes rations.** Deposited food and drink fill the Kitchen's pot. When the feast is called, the pot becomes Hall rations, a food and a drink that restore by the Kitchen's level, that cannot be sold, traded or put in Storage for another account, at 80% of the heal points put in (so it is a sink, never a faucet). Each member's account receives its share in Storage with no press, capped a week. Ledger: Items (a conserved transfer with a 20% sink) and Gold (the member's store bill falls). No XP, no stacking class.

Why this and not a buff: store supplies are the one sink that repeats (35 to 44% of an Own four's gold in from Level 80, CITED 24), and casters go broke first. A clan whose cooks feed its Mages is "hunters and crafters need each other" (the itemization rule) made social, and it gives Cooking a second consumer. Size it small: a member's weekly rations at most 10% of an Own four's store bill at its Level (about 30k of supplies a week at Level 50 against a 313k bill, CITED 24), so the store stays the main supply and the cap is what stops it being a transfer between accounts.

| # | Answer |
|---|---|
| 1 Purpose | Problem: cooks have nobody to cook for; casters' bills. Decision: when to call it, and for the cook, what to send. Plugs into Cooking, the supply bar (a ration is an item a slot can name), the store fallback |
| 2 First principle | A cook's "send to the Kitchen" is a standing destination. Delivery needs no press. The call is one press a week by an officer, or a standing "call when full" |
| 3 Ledgers | Items: transfer with a 20% sink. Gold: up to about 30k a member-week of store bill saved (PROPOSED) |
| 4 Budget | None. No lever |
| 5 Seven players | New: free food from its clan in the weeks it dies most (REAL 8.9 deaths in 100 hours). Own four: 10% off its store bill. Heavy four: the same cap, so a smaller share. Buyer: nothing extra. Four friends: their cook matters |
| 6 Server cost | A deposit is one row; a call is one write a member. Nothing on the settle path: a ration is an ordinary carried item |
| 7 Population | At 10: three friends and one cook, works. Larger: per clan |
| 8 Server age | None; rations do not bank past the weekly cap |
| 9 Exploits | After card 9 |
| 10 Teaching | The Kitchen panel; a System line when rations arrive |
| 11 Throughput | Two item rows a Kitchen tier |
| 12 Money | None. Rations are never sold for Crowns |
| 13 Telemetry | Heal points deposited a clan-week; share of members' supply use that is rations (target 5 to 10%, red line over 20%) |

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| CUT the rested grant | clan-feasts | Level XP | S | Drop one function | | 128,000 XP a day from absence |
| The feast pays rations, not XP | clan-feasts | Items, Gold | M | Yes, with the castle | Long | 11-04 avoid list; 01 multiply cap |

## 9. `clan-treasury` (dark). Verdict: MERGE into `clan-castle`

Not played.

| # | Answer |
|---|---|
| 1 Purpose | The castle's purse. As a separate system: a second purse beside the account purse with no purpose of its own |
| 2 First principle | A standing share of hunt coin, set once |
| 3 Ledgers | Gold: a sink at the moment of contribution (the account purse is debited, journalled, since 08-27). Clamps built: 10M a call, 10M a day |
| 4 Budget | None |
| 5 Seven players | Card 6 |
| 6 Server cost | One `player_ledger` row and one `clan_ledger` row a contribution |
| 7 Population | Per clan |
| 8 Server age | Gold put in stays in: a dead clan's treasury is gold out of the world, which is what a sink is for |
| 9 Exploits | Below |
| 10 Teaching | The Hall panel |
| 11 Throughput | None |
| 12 Money | The gold model must count it: it is the first sink that can take any amount on any day |
| 13 Telemetry | Gold in a week by clan; treasury balance over 4 weeks of upkeep and queue (a pile with no use) |

**Rulings.** ACCOUNT GOLD (10-23): the contribution debits the account purse: COMPLIES. Server owns anything contributable (CLAUDE.md section 1): COMPLIES since 08-27.

**Exploits across the clan systems (question 5).**

| Attack | Today | Clamp |
|---|---|---|
| One account founds a clan alone | Membership is per account, so it is a clan of one. It stops at the Camp: tier 2 needs 3 distinct contributors | Built. Harmless, except names: a founding fee (ruling 6) |
| Alt accounts fill the contributor gate | Any deposit row counts, so three alts with one Rat Tail each pass tier 2. Multi-accounting is against the rules (10-17) and only capped per IP | OPEN. PROPOSED: a contributor counts only with 5% of the tier's bundle and a hero at Level 20. And the real clamp: a castle gives no power, so the prize is a banner |
| The treasury moves gold between accounts around the market fee | No: the withdraw functions were dropped. The table `clan_withdrawals` is still there | Keep it one-way and drop the table (ruling 5). Commissions paid from the treasury would reopen it: they go to the market |
| The stores move goods between accounts | Deposits are debited from the bag under lock (08-18). Nothing comes out today | Rations only, bound to the account, capped a week, 20% lost. Nothing else ever leaves the stores |
| A kicked member wants deposits back | No refund (built, on purpose: a refund would be a faucet a leader cycles with an alt) | Keep. Show a clan's kicks this month in the browser so a newcomer can see a churn clan |
| A leader kicks everyone when the castle is done, or disappears | No succession: `clan_claim_leadership` was dropped | OPEN. Succession after 14 days away; an officer may kick 3 a day; the founder cannot disband with other members inside |
| Vote stuffing | One vote a member by primary key; a tie picks nobody; votes are opt-in and choose only the next work order | Add: a vote needs 72 hours of membership and a contribution this week. Low stakes by design |
| Uninvited joins and join storms | Closed 08-11: join policy, bans, the member cap trigger, a rate gate | Built |
| Forged labour | The client sends the ticks | OPEN until labour is the server's count of hunted minutes |
| Clan hopping for rations | Not built | Rations need 7 days of membership and a contribution in the week |
| A paid roll | None anywhere in the clan | None to flag for Steam |

| Change | Systems | Ledgers | Size | Server | Value | Evidence |
|---|---|---|---|---|---|---|
| MERGE: one purse, one-way; drop `clan_withdrawals` | clan-treasury, clan-castle | Gold | S | Drop a table | | Section 0 |

## 10. `factions` (dark, QA only). Verdict: KEEP (hidden until the first Morrow pair opens)

Not played by me; QA played it blind on 11-19 (`lane/qa-factions-open`, CITED from the arm file's note) and its first finding stands: no open ground pays standing, so a hero who joins today gets a mark and nothing to earn. The board's 11-19 ruling (hidden until the pair's patch) is right and this card does not change it. Question 8.

**The numbers (READ FROM DATA, `src/data/factions.js`).** Join after the first Lord Krell kill, once, free. Standing: one point a settled hunting minute on a ground that pays the hero's side, per hero, never lost, kept per side across swaps. Every region after the Barrow March has as many grounds for one side as the other (a guard holds it), so about half of a hero's hours pay. Outfit pieces at 25, 100 and 300 standing hours. A swap is 600 minutes of hunting on the new side's grounds, which pay nothing meanwhile, and 7 days since the last change. There is no gold fee.

| Player | Paying hours a hero a day (half its hunt hours) | 25 h piece | 100 h piece | 300 h piece |
|---|---|---|---|---|
| Own four (3.3 h) | 1.65 | 15 days | 61 days | 182 days |
| Heavy four (8.4 h) | 4.2 | 6 days | 24 days | 71 days |
| Ceiling (24 h) | 12 | 2 days | 8 days | 25 days |

ASSUMED: half of hunt hours pay. A player who hunts only its side's grounds halves these days and levels on half the content, which is the choice the system offers.

| # | Answer |
|---|---|
| 1 Purpose | Problem: after Krell every hero is the same. Decision: a side, which grounds to favour, when to swap. Plugs into post-Krell grounds, outfits, the town (a mark others see), later an event |
| 2 First principle | Join is per hero: four presses for one decision, since an own four only earns together on one side. One press for the account (ruling 10). Claiming a piece: a press a piece a hero, 12 presses for a four over six months: fine |
| 3 Ledgers | A new quantity, standing: source 60 a paying hunted hour, **no sink**. Looks only: no Power, XP or Gold. A swap is a sink of 10 hunt hours of standing |
| 4 Budget | No lever, by design ("mostly cosmetic", RULED 11-14). The opposite-ground benefit is standing, never XP: keep it so, or it is a multiply lever (the audit's condition on Luck says the same for drops) |
| 5 Seven players | New: years away, sees the marks in town. Own four: a six-month cosmetic chase a hero. Heavy: ten weeks. Buyer: cannot buy standing; it is hours. Four friends: can split across sides and still party (no ground is restricted, RULED) |
| 6 Server cost | `hr_faction_credit` runs in the settle for a member with a side: the platform dive should confirm it is no new statement a settle. `hr_faction_ledger` grows; a daily row a hero (`hr_faction_days`) is the right grain |
| 7 Population | At 10: works alone, it is a personal track. At 1,000: side imbalance (the reaper will be the popular look). It matters only when an event counts sides; then pay the smaller side more standing, never XP |
| 8 Server age | Standing only grows. At month 6 a Heavy four has every piece and standing has no use: the ledger with a source and no sink. PROPOSED: the weekly side tally (off until 20 heroes a side, on the board) and a cosmetic piece a region, so content drips at the pace regions do |
| 9 Exploits | AFK standing: it is hunted minutes on real grounds with real risk, capped 24 h a day. Swap dodging: the 7-day cooldown and 10 unpaid hours. Alts: standing is per hero and buys looks |
| 10 Teaching | Holly and Venn on the cart road after the first Krell kill (designed). Text home `src/data/text/factions.js` |
| 11 Throughput | Three outfit pieces a side now, drawn. One piece a side a region after. A Heavy four uses the first set in 71 days |
| 12 Money | Faction outfits are earned, never sold: keep them out of the Crowns store or the earned look is worth nothing |
| 13 Telemetry | Heroes past Krell with a side (target 80%); side split (red line worse than 70/30); swaps a week |

**Rulings.** Two sides, neither evil, Havora neutral, no ground restricted, equal grounds a region, both outfit lines reachable by swapping, swap about 10 hours and a week (all 11-14): COMPLIES, each held by `tests/faction-ground-balance.mjs` or the data. "A permanent character buff" (11-14, first line) against "mostly cosmetic ... any stat buff small or none" (same day, later): the later line wins and the data follows it.

## 11. `faction-skills` (designed). Verdict: HOLD

Not built: nothing in `abilities.js`. Measured once on a scratch engine (the board's Morrow Hills section 7), at Mosslight Glade, Level 24.

| # | Answer |
|---|---|
| 1 Purpose | A side you can feel in a hunt. Decision: whether to slot it. It comes with the side, so the choice of side becomes a choice of ability |
| 2 First principle | Configured once on the bar like any action |
| 3 Ledgers | Level XP (kills an hour) and damage taken |
| 4 Budget | **Multiply class: an ability added to a bar.** CITED (board, 2 seeds x 1 h, Level 24): Bulwark +0.6 to +7.0% kills an hour, Reap +4.2 to +7.0%, both with fewer meals. A bar has 20 slots and most are empty, so it replaces nothing: it is an addition, the thing the audit's change 3 forbids, and each addition has so far forced an XP-per-kill cut for everyone (x0.96, x0.88). **It was measured 81 Levels below where it unlocks.** Bulwark's shell is a flat 90 plus 1% a Magic level; at Level 105 a lone hero takes about 20 damage a second (MEASURED `ref.json`: 73,186 an hour), so a 90-point shell each 45 seconds is about 10% of damage taken and grows with Magic. Reap scales with the highest combat skill. Neither has a number at 105, 118 or 175. Re-measure after 21 (to-hit changes what a shell is worth) |
| 5 Seven players | Only heroes past Krell. The same for all seven: it is not bought |
| 6 Server cost | A row in the action engine: no new statement |
| 7 Population | None |
| 8 Server age | None |
| 9 Exploits | Swapping sides for the better skill on a ground: 10 unpaid hours and 7 days, enough |
| 10 Teaching | The bar's Configure action, on joining |
| 11 Throughput | Two rows, once |
| 12 Money | None |
| 13 Telemetry | Share of sided heroes with the skill slotted (if under 30% it is a dud, if over 95% it is mandatory); the side split moving after a tuning patch |

**How it becomes a sidegrade (PROPOSED).** Both go in one "signature" group with the weapon's own strongest ability, sharing its cooldown, so slotting Reap means not casting that. Ship bar: within 2% Level XP an hour of the same hero without it, lone and four, at hold, rest and catacombs, 4 seeds x 4 hours; the two sides within 2% of each other on every seat. If either fails, it ships as a look (the outfit's glow) and not as a row.

**Rulings.** "a faction skill, not super over powered ... balanced as best we can" (11-14): the HOLD is how that is kept. Names Bulwark and Reap (11-14): kept. The board's 11-19 call that the skills are not a blocker for factions: agreed.

## For other dives

| For | System id | Finding |
|---|---|---|
| 21 combat | `party-xp`, `difficulty-tiers` | The first party of two new players reads "-55% vs solo" (PLAYED) because both hold the starting sword and shield and the Cellar is Normal only. If Levels 1 to 30 are the social window (the slot prices make them so), the party cells there matter more than at Level 80, where the cap is broken upward |
| 21 combat | faction skills | Measure Bulwark and Reap at hold, rest and catacombs after to-hit; today's only numbers are at Level 24 |
| 23 items | `recipes` (castle goods) | A Timber Beam takes 2 Slime Gel and an Iron Fitting 2 Bone Chips. A castle needs 75,000 and 47,000. The gel's source is the tutorial room. The House pays the same recipes |
| 23 items | `cooking` | Rations (card 8) would be a second consumer for cooked food. `hr_feast_foods` holds 31 ids from August; several are not in today's recipes and the heal values are the old ones |
| 24 economy | `hero-slots` | Slots are the gold price of not needing friends. Every social number in this dive rests on 300k / 750k / 1.5M staying slow. If slots get cheaper, the social window closes |
| 24 economy | `market`, `player-trade` | Commissions belong on the market as buy orders. The clan treasury should be counted as an uncapped, one-way sink. Rations are the only goods that would cross accounts outside the market, bound and capped |
| 24 economy | `gold-sinks` | A clan founding fee (100,000 PROPOSED) is a new small sink |
| 26 home | `house-tiers` | The House already consumes castle goods (`homestead-tiers.js`), so `systems.mjs`'s note "no consumer but this" is wrong. A clan Sawmill or Smeltery that speeds benches would undercut the room rungs: this dive drops them |
| 27 retention | `leaderboards` | A clan board by Standing earned this week per active member is a race a new clan can enter. The Social menu already holds Leaderboards |
| 27 retention | teaching | Chat is closed for a new account (PLAYED) against the 10-22 ruling. The first-friends sequence needs one line on the creation screen and one in the Party window |
| 28 platform | `town` | A viewer polls every 2 to 6 s and the refresh runs every 25 s for everyone, to show bodies that at 10 online are not there. Fall back to the keepalive when no other account is in the instance. Unverified: whether signed-out heroes at their jobs are drawn |
| 28 platform | `friends` | `hr_social_state` every 30 s for every account, with one friend link in the whole game. A version in the heartbeat would do |
| 28 platform | clans | `clan_ledger` has no prune. Clan chat takes the fifth and last Realtime topic a client may hold |
| Art Director | Party, Friends, Chat windows | At 1024x768 the three windows are so see-through over the town that their text is hard to read while they fade in (PLAYED, screenshots read). A reading problem, not a mechanic |
| Coordinator | process | The browser pane was shared with another lane's local world (port 8793) mid-play; one chat line I typed landed in its sign-up email field. I moved to a private headless world |

## Measured, cited, assumed

| Label | What | Where |
|---|---|---|
| PLAYED | A new account on the local world (port 8794): Havora, the Social menu, Party, Find a party ("No open parties"), Friends, Chat (closed until Enter; Global, Local, System, Combat) | Browser pane, 2026-11-20, screenshots read |
| PLAYED | Two accounts: invite, the invite line in chat, Join, "-55% vs solo in Mill Cellar", Pick a hunt, Enter with party carries the member, 20 minutes skipped to Level 3 each, a friend request ("Request sent") | A private `openWorld()` with two `play()` sessions; 0 page errors on either |
| UNPLAYED | A party of 3 or 4 people, a party on the Sewer, a party across a sign-out, whispers, blocks, inspect, a full town, factions, every clan system | |
| MEASURED | Party against lone a head: 0.51, 1.78, 2.17, 1.58, 1.70 at thicket, glade, ford, pyre, hold; Mage net gold; damage taken at hold | `tools/balance-program/ref.json` (commit a5e092248, 2 seeds x 1 h) |
| MEASURED | Server cost of a batched clan credit | `node tools/balance-program/measure.mjs cost --add statements=0,ledger=1,writes=1 --share 0.5` |
| REAL | 0 clan rows, 0 hours with another person, 65 one-account parties, 1 friend link, 0 finder uses, 374 chat lines from 4 people, 2.09M unspent, 59% idle, visits of 2 to 5 minutes | `10-real-players.md` sections 1, 4, 6, 7 |
| CITED | Free gold a week and a hero-hour, the shelf to Krell, slot prices, the store bill | `origin/lane/d-balance-economy` d9554e87f, `24-economy.md` Q1 |
| CITED | Sewer four about 1.6x; Cellar, Thicket, Wickstead fours 0.42 to 0.66x | lane/d-party-pace, the 11-18 ruling |
| CITED | Bulwark and Reap arms at Level 24 | `PRIORITY_BOARD.md`, the Morrow Hills section 7 |
| READ FROM DATA | Every clan, castle, feast, treasury and vote number; faction rules; chat and town cadences; the party table | The migrations named in section 0; `src/data/factions.js`, `chat-channels.js`, `town-presence.js`, `party-class-xp.js`, `recipes.js`, `gathering.js`, `items.js` |
| ASSUMED | 7 to 14 weeks from one hero to an own four; half of post-Krell hunt hours pay standing; a clan gives a quarter of what it really spends; goods at Shop book value (re-price after 23) | Arithmetic shown beside each |
| PROPOSED | On-call heroes; the first-friends lines; clans step 1; the castle re-shape and its weekly pace; rations; the founding fee; the signature group and the 2% bar for faction skills | Not built, not measured |
| Not checked | Other games' guild systems were not re-read for this dive. Where a mechanic resembles one (standing parties that hunt while a member is away; member-fed hall upgrades) it is from memory, mechanics only | |
