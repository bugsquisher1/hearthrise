# Retention and revenue audit — 2026-11-19 (game-designer, read-only)

Base: claude/nice-einstein-6h7s9n (= set/v0.2.142 + the settle fix), played on the local world. The rulings-of-record memory was not on the machine: rulings are quoted only as the board and source headers quote them.

## Top 10, by (players kept x money made) per effort

| # | Change | Why | Evidence | Effort | Lane |
|---|---|---|---|---|---|
| 1 | Hunt summary and away card lead with the next step: gold button "Go to Meadowbrook Thicket", rows above the fold | The 142 Cellar fix is hidden: the window opens on greyed "Hunt again" and "Hunt again off: Ground outgrown"; the "Next ground" row is below the window's bottom edge, no scroll cue | PLAYED, 1440x900 | S | A: Systems + Art Director |
| 2 | "Move on and gear up" remembered once: after-plan row "then the recommended ground", plus "equip upgrades back in town" | The hero idled 12 h in the Thicket in the practice kit with 6 Bronze Platelegs in the bag: Level 10 at 12.4 h, table says about 13 | PLAYED; board 11-19 §1 (3 of 7 accounts, newest quit at Level 9) | M | B: Systems, designer rows |
| 3 | The out-of-stamina card names the stamina-free loops (yard, gathering, farm) | Day 2 opens on 1 h 9 min stamina; the only button is "Hunt again", same ground. The yard unlocks at Level 10 and isn't mentioned | PLAYED | S | A: designer text + Systems |
| 4 | Crowns ledger, purchase RPC, Premium per account, Steam Wallet and web checkout | Nothing can take money today: no checkout code, no Crowns balance or ledger in any migration | READ | L | C: Backend + Security GO; Tyler prices |
| 5 | Founder packs for the EA wipe | Best revenue for the goodwill; needs #4, one outfit, three titles | ASSUMED | M | B after #4 |
| 6 | Friends first: a two-account duo earns no less than two solos, one leaving doesn't end the other's hunt, an invite link | 0 of 87 party hunts had two accounts; same-weapon friends lose about 35% XP; a Leave sends both home | Board 11-19 §4; audit 140 C1, C2 | M | B: Systems + Backend |
| 7 | Steam sign-in, and a sign-in screen that shows the game | Email, 10-character password twice, confirmation mail before the first screen | READ (`account-rules.js`); loss size ASSUMED | M-L | C: Backend + Security |
| 8 | Server firsts and launch titles for the wipe; Steam rich presence; a rare-drop moment worth a clip | Everyone starts level and nothing announces a first. The Alpha Fang was one line on a card | READ + PLAYED | S-M | B: designer rows + Backend |
| 9 | A sellable cosmetic catalogue: add-ons and dye sets on the 5 base outfits, then new outfits | The honest product is looks, and there are 11 | READ (`outfits.js`) | L (art) | Art + Asset Director, sample of 5 |
| 10 | Close pay-for-pace before Crowns trade: board fix 7 (refill price), hold Crowns training items, keys earn-only | Protects the Level and skill boards and the first Steam reviews | Board fix 7; READ | S | Tyler rules, then C |

## Revenue model

Free to play on Steam, mobile and web, because the weakest point is density (7 accounts, an empty market) and parties and trade need bodies. The Level and account-age gates on the market stand in for a box price's bot gate. Sell an **account-wide Premium at about $5.99 a month** (12 h stamina cap, full analyzer, presets, outfits; no XP perk), also buyable with Crowns so free players can earn it. Sell **Founder packs at $19.99 / $39.99 / $79.99** in the launch window, **cosmetics at $2.99 to $9.99**, and **account conveniences** (hero slots, Storage, Key Ring) at a Crowns price beside the existing gold price. Hold a season track until about 1,000 daily players. Prices are from memory, untested; no forecast is given.

Pay-to-win flags:
- **Crowns-store training items** (specified 11-14, not built) are paid skill XP on ranked boards and conflict with "no paid XP boosts". OPEN CONFLICT for Tyler.
- **Crowns to gold to stamina refills** buys up to +24 h a day while a refill returns about 3x its price.
- **Premium is per character**: four heroes would be four subscriptions.
- **Hearth Chest keys** must never sell for Crowns (a paid loot box).
- **`hearth_token`** is a second name for the bond and should be cut.

## 1. Day 2, day 7, day 30

**What holds today**
| Moment | What the game does | Evidence |
|---|---|---|
| Minute 0-2 | Sign in, name a hero, one coach line, Hunts, Enter. A fight is on screen inside two minutes, no class pick | PLAYED |
| Minute 22 | The Cellar ends itself at Level 5 ("Level 1 to 5, Melee 1 to 7"); Tamsin pays 25 gp and a Bronze Helm | PLAYED (142) |
| First return | "While you were away, 11 h 1 min. Level 5 to 10. +231,496 Level XP. +19,298 gp. Kills 4,601. Best find Alpha Fang." The game's best hook, and it works | PLAYED |
| Day 7 | Second hero slot at 300,000 gold, the House, Tamsin's 3 paid tasks a day, Bonus XP weekend, the yard overnight | READ; board 11-19 §5 |
| Day 30 | Level board, Tempering, bestiary stages to 20,000 kills, Level 100 at about 600 h | Board 11-19 §2, §8 |

**Where it loses them, in the order met**
| # | Screen, minute | What happens | Evidence |
|---|---|---|---|
| L1 | Sign-up, minute 0 | Email, 10-character password twice, confirmation mail (`account-rules.js`: `mailer_autoconfirm false`). The sign-in screen has one line about the game and shows none of it | READ + PLAYED; loss size ASSUMED |
| L2 | Hunt summary, minute 22 | At 1440x900 the window opens on "Back in town", greyed "Hunt again", "Open bag", and "Hunt again off: Ground outgrown". "Equip 1 better piece", "Bless I, II and III" and "Next ground: Meadowbrook Thicket · Show" are under that sticky footer: 1,025 px of content in a 558 px pane, the next-ground row at y=725, the window ending at y=701 | PLAYED, measured in the page |
| L3 | Hour 0.4 to 12 | 12 hours in the Thicket in the practice kit with Bronze, Leather and Apprentice pieces in the bag. Gear can't go on in a hunt and nothing equips or moves an idle hero. Level 10 (43%) at 12.4 hunted hours | PLAYED; matches board 11-19 §1 |
| L4 | Return card, hour 12 | Stamina 1 h 9 min of 12 h. One gold button, "Hunt again", same ground. No Equip, no Wickstead (in range since 8), no yard, gathering or farm. The day-2 quit point | PLAYED |
| L5 | Hour 1 to 45 | A new account is alone: the second hero costs 300,000 gold (45-75 lone hours), and grouping with a real friend is punished | Board 11-19 §4; audit 140 C1, C2 |
| L6 | Level 16 to 44 | 97 lone hours on the Glade | Board 11-19 §2, fix 8 |
| L7 | Level 50+ | Two Trophy drops in the game, no jewelry past 30, one Tower run ever, Rares every 0.5-1 h | Board 11-19 §8, §9 |
| L8 | Any day | The world reads empty: "0 online", Leaderboards "No entries yet" for a Level 7 hero (maybe the local cron shim), the Weighhouse "Not open yet, 0 / 1,000,000 gp given", Friends empty | PLAYED; 7 live accounts |

**Repeated by hand:** re-picking the ground at 5, 8 and 16; pressing Equip after every hunt; one refill press a hero a block.

## 2. Multiplayer

**Exists:** parties of 4 with a finder, global/local/party chat and whispers, friends and blocks, inspect, 16 leaderboards, the Weighhouse, Town Works (the server builds its market: a good launch-week story after the wipe), town presence, an online counter that counts closed-browser heroes, rounds and coloured Hearth flames the town sees, criers.

**Missing, by word-of-mouth value:**
1. A reason for two new friends to play together in hour one. Today it is worse than playing alone.
2. An invite: no link or code, a friend is found by typing a name.
3. Server firsts for the wipe (first to Level 50, first Krell kill, first Trophy a ground): free System lines plus price-0 titles, which `titles.js` already supports.
4. Guilds: `chat-channels.js` reserves the tab, nothing ships. A small guild (name, tag, chat tab, roster, a board line) is cheap long-term retention (ASSUMED).
5. Something to watch: no spectate, public hero page, Steam rich presence or clip-worthy rare-drop moment.
6. A shared weekly goal beyond the one Bonus XP weekend row (the Hearth fuel buff is designed, board 6973-6975).

## 3. Revenue

**3a. What exists (READ)**
| Surface | State | Currency | Note |
|---|---|---|---|
| Real-money purchase | Does not exist. No checkout or store code in `src`; `2027-04-23-training-gear.sql` line 67: "no Crowns ledger exists"; `legal/EULA.md` §6: "no real-money purchases today" | - | Revenue is structurally zero |
| Premium (`premium.js`) | `player_state.premium_until`, per character, owner-only grant; `beta_premium` makes everyone premium | none yet | 12 h stamina cap (free 8 h), full analyzer, 3 outfits, a daily Oak Practice Blade worth 0 |
| Crowns | Rulings and comments only: real money, tradeable for gold with a weekly cap "after Steam and legal review", Crowns-bought goods account-bound | - | `items.js` still has the older `hearth_token` bond row (emoji icon, "1 to 150 gems") |
| Crowns store | One specified family, not built: bound training items (2:1 skill XP) | Crowns | Flagged |
| Stamina refill | Live: +4 h, 6 a day, 1,000 + 250 a Level, +2/15 a buy | gold only | PLAYED: 3,500 gp at Level 10 with 22k in the purse after one night |
| Blessings | Live, free under 30 | gold | 7,000 gold spent ever |
| Hero slots | 300k / 750k / ... | gold | |
| Key Ring | 25,000 gp, placeholder | gold | |
| Setup slots, dyes, rename, titles, rounds, flame powders, criers, House, dummies, Tempering, Storage, bank rungs | Live | gold | Sinks work: 6.5M of 8.0M spent |
| Outfits | 5 free, 3 premium, 1 chest super-rare, 2 faction | - | 11 looks |

**3b. Ranked by revenue x goodwill** (prices ASSUMED)
| Rank | What | Price | Why a player pays | Goodwill | Needs |
|---|---|---|---|---|---|
| 1 | Founder packs, launch window only | $19.99 / $39.99 / $79.99 | Back the game at the wipe and be seen as first: title, outfit or add-on, Premium time (1 / 3 / 12 months), Crowns, a reserved name | High | Crowns ledger, one outfit, three titles |
| 2 | Premium, account-wide, also buyable with Crowns | $5.99 / $14.99 quarter / $49.99 year | Fewer check-ins, full analyzer, more presets and listings, outfits | High while perks stay convenience | Premium per account, purchase RPC |
| 3 | Outfits, add-ons, dye sets | $2.99-$9.99 | Identity in a shared town and party | Highest | Art |
| 4 | Hero slots 3 and 4, Storage tabs, presets, Key Ring | $2.99-$4.99, or gold as today | Skip a gold grind for non-power | Good | Crowns prices on existing ladders |
| 5 | Hearth flame colours, rounds, plaques, house themes, a crier's line | $0.99-$4.99 | Being seen | High | Mostly exists as gold sinks |
| 6 | Rename, colour sets | $2.99-$4.99 | Standard | Fine | Exists for gold |
| 7 | Season track (free plus a paid cosmetic track) | $7.99 | Later, past about 1,000 daily players | Mixed | A season system |
| - | Training items for Crowns | - | Would sell best and cost most | Low | Hold |

Steam requires Steam Wallet in the Steam build and takes its cut, mobile stores likewise, and a web card processor costs far less (ASSUMED from memory, check current terms). So the web client is worth keeping as a first-class door.

**3c. Flags**
| Flag | Why | Recommendation |
|---|---|---|
| Crowns-store training items | Real money to combat skill XP; skills are power and each has a ranked board; "no paid XP boosts" | OPEN CONFLICT for Tyler. Don't open EA with it |
| Crowns to gold to refills | 6 refills a day (+24 h); a refill returns about 3x its price (board fix 7); `stamina-refill.js` says "real money buys no hunt time" | Land fix 7 before Crowns trade; keep the weekly exchange cap small |
| Premium's 12 h cap | Stamina rests 1:1 in town: twice-a-day players hunt about 12 h either way, once-a-day players get 8 h vs 12 h | Keep, sold as "fewer check-ins"; no XP perk |
| Premium per character | Four heroes, four subscriptions | Account-wide |
| Hearth Chest keys | A key sold for Crowns is a paid loot box | Earn-only |
| Gold Given board | Real money reaches it through Crowns (board 5595) | Keep with no prize, as ruled |
| Chargebacks | Stolen-card Crowns become clean gold | A trade hold on bought Crowns, ledgered; for the Security review |
| Two bond names | `hearth_token` vs Crowns | One name |
| §1 | No client-authored value, solo tier or back-compat is proposed; every purchase is a server RPC in the stamina-refill shape | - |

## Played vs assumed

Played on the local world: a fresh account from sign-in, hero Finch (default sword and shield) through the Cellar's Level 5 end, into the Thicket, 2 h skipped, 11 h away, the return card, and ten windows. Not played: a second account or party, phone, past Level 10, Tower, House, yard, farm. The empty Leaderboards may be the local cron shim. Prices, platform fees and funnel losses are assumed.
