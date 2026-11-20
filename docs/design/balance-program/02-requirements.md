# Balance program 02: what every dive answers for every system

One card a system, in the dive's file `2N-<domain>.md`. Thirteen answers, in this order, each with its label (MEASURED / CITED / RULED / READ FROM DATA / ASSUMED / PROPOSED) and the command or file it came from. A blank is not allowed: write "none" or "not built, so:" and answer for the design. Then one verdict.

Read first: `01-model.md` (the ledgers, the stacking classes, the reference players and the harness). The rules of the game are Tyler's rulings of record, newest first; a superseded ruling is never quoted.

## The card

| # | Requirement | The question | What counts as an answer |
|---|---|---|---|
| 1 | **Purpose** (CLAUDE.md §10, DESIGN_STANDARDS §4) | Which player problem does it solve, what decision does it give, what does it plug into? Still useful at hour 100 and hour 1,000? | One sentence each. "It adds content" is not a problem solved. If two systems give the same decision, say which one keeps it. |
| 2 | **First principle** | Does the player decide something here, or repeat a decision already made? | Name every press a player repeats by hand (re-queue, re-list, re-plant, re-buy, re-pick) and what should remember it. |
| 3 | **Ledgers** | Source, sink or converter, on which of the nine ledgers, at what rate? | A row per ledger touched: quantity an hour or a use, for the lone REF seat at the reference points where the system is reachable. Converters name the rate and the cap. |
| 4 | **Power and reward budget, Level 1 to 400** | Which stacking class is each lever in, how big is it at each reference point, and does its class's cap hold with everything else worn? What happens at 240 and 400? | `measure.mjs what` rows at three points or more (one early, one at Krell, one staged); `curves` or the data's own formula for 240 and 400. A lever that grows with Level without a cap is a finding. A reward is sized in REF hours. |
| 5 | **The six players** | What does it give and cost the New, Median, Premium, Heavy, Buyer and Four friends in a week? | `measure.mjs price` for every price. Attended minutes a day it asks of each. Who can never afford it, and whether that is on purpose (sinks above a band's gold are RULED 11-18; a wall in front of a Level, drop, ground or core tier is not allowed). |
| 6 | **Server cost a player-hour** | Statements, row writes, ledger rows, polls, cron work, edge CPU. Inside the allowance of 01 section 7? | `measure.mjs cost --add ...` with the numbers read from the system's functions (name them). Tables it grows, and what prunes them. Anything that runs for everyone whether or not they use it. |
| 7 | **Population: 10, 1,000, 10,000 online** | Does it work with nobody around, and does it survive a crowd? | At 10: can one player or one four still use it, or does it need a market, a clan, a party finder hit? At 1,000 and 10,000: what is contended (a board, a listing page, a town, a shared project), and what is per shard. |
| 8 | **Server age: day 1, month 1, month 6** | What does a NEW player meet on an old server, and what does a veteran still want from it? | The inflation it feeds (gold, items, Luck, standing) and the catch-up it offers. A board or race a newcomer can never enter needs a newcomer's version or a reason. |
| 9 | **Exploits** (for the pre-EA Security list) | How would a player with four heroes, two accounts, a script and patience break it? | A list: multi-hero funnelling, alt accounts feeding one, market wash trades and price fixing, AFK loops, timing a purchase on the 32 s seed horizon, refund or cancel loops, a faucet with no daily clamp, a client-supplied value. Each with the clamp that stops it or "OPEN". |
| 10 | **Teaching and discoverability** | When does a blind new player first meet it, what tells them what it is for, and what do they do next? | The Level and screen of first contact, the words on that screen (read them in the game's text home), and the dead moment if there is one. |
| 11 | **Content throughput** | How fast can we make it against how fast players use it up? | Hours of work a unit (a ground, a floor band, a recipe family, a perk, a boss) against hours of play a unit for the Median and the Heavy. A system the Heavy finishes faster than we can extend it needs a repeatable end or a slower drip. |
| 12 | **Monetization fit** | What do Premium and Crowns do here, and where is the pay-to-win line? | Tyler 11-18: every Level, drop, ground, gear tier and skill is reachable without paying; bought gold becomes an edge only through gold sinks; power is never sold for Crowns directly. State what the Buyer gets and how many REF hours it saves. Flag anything Steam could read as gambling (a paid roll). |
| 13 | **Telemetry after launch** | Which number, read weekly, proves this answer right or wrong? | A named row: a ledger reason code, a vitals line, a refusal verb, a table count. A target and a red line. "A feature at zero for two days is a P1" (CLAUDE.md §3.4) applies to every live system. |

Two more, answered once a system rather than scored:

- **Uniqueness and fun.** Would a player describe this to a friend? Tibia and Huntera inspire mechanics only. Say what a player looks forward to here, and name the dead moment ("what do I do now", "that reward doesn't matter") if you found one.
- **Rulings.** Every ruling of record that names the system, quoted by date, with COMPLIES, BREAKS or OPEN. `node tools/balance-program/domain.mjs --system <id>` lists them. A conflict between two rulings is reported, never settled by the dive.

## The verdict

One of: **KEEP** (as built), **FIX** (name the change and its size), **MERGE** (into which system), **CUT** (Tyler approves cuts; Klappa's Klub is never cut), **BUILD** (designed or ruled, and worth building: say in what order), **HOLD** (not before something else lands).

Every FIX, MERGE, CUT and BUILD ends with a change row the synthesis (phase 3) can rank:

| Change | Systems | Ledgers moved | Size (S/M/L) | Needs server work | First-hour, first-week or long-chase value | Evidence |
|---|---|---|---|---|---|---|

## Rules for a dive

- **Measure before you size.** No balance number without evidence. "Unverified" is a fine word to write.
- **Play what a player can reach.** A live system is played in the browser pane on the local world (`node tools/qa/local-world.mjs serve`) as a new account before it is judged; say what you pressed and what you saw. A dark system is judged from its tables and functions, and the dive says it was not played.
- **Dark and designed systems get the full card** against the design, because the question for them is whether to build, in what shape, and at what cost. "Not built" is never the whole answer.
- **Stay in your domain.** A finding about another domain's system goes in a "For other dives" list at the end of your file with the system id, not into a verdict.
- **Change nothing.** No game code, no data rows, no migrations. Measuring tools go under `tools/balance-program/` or `tools/balance-sim/staged/`.
- **The file's shape:** a one-screen summary (verdict counts, the five changes that matter most, what Tyler has to rule on), then the cards in registry order, then "For other dives", then "Measured, cited, assumed".
