# Build spec: scaled hunts and live events (mocks, 2026-11-10)

Base: the real Hunts window and HUD captured from `tools/qa/local-world.mjs serve` on main v0.2.112, with the rows and tier notes worded as lane/b-one-difficulty writes them (that branch was not served). New rules are part 1 of `mock.css`, tokens only. Open each board at any window size: the screens are iframes at 1440x900 and 922x423.

## 1. Scaled hunts (`scaled-hunts-desktop.html`, `scaled-hunts-phone.html`)

**Decision.** The Level is never a dial. It is always the leader's (the server takes no Level). So the control is a plain checkbox for on and off, and the only slider buys hours, as Tyler asked.

**Components.** `src/shell/windows/hunt-detail.js` gets one section `.hw-hd-scale` after `.hw-hd-theme`, in a new `scale-pane.js` built like `boss-call-pane.js` (same `.hw-confirm`, same sunk `.hh-tool` press, the window's own range input and checkbox). `hunts.js` writes the row's fit and the header band. `hunt-topbar.js` gets one line. Text goes in `src/data/text/hunts.js`. No new window, no new control style.

**Shown when** `features` has `scaled_hunts` and `scaled_hunts.grounds[hunt].level` is not null. Otherwise no section (a ground the hero still fits shows nothing).

| State | What shows | Words |
|---|---|---|
| Never bought (`banked_ms` 0) | note, slider, press | You've outgrown the Sewer. Buy hours to fight it at Level 41. Monsters come up to Level 41 to 58. They hit harder and have more HP. Kills earn more Level XP and more coin. Drops stay the same. |
| On (`on`, `banked_ms` > 0) | checkbox ticked, bank, note, slider, press | Use my scaled hours here / 6 h 20 min banked / Add hours at 1,640 gp each / 4 hours / Buy for 6,560 gp / You lead, so you pay and your party pays nothing. Hours only run down while you hunt here, and they never expire. |
| Off (`on` false) | same, unticked | Off. The Sewer plays at its own Level and your hours stay banked. |
| Cannot afford | press off, red line | You have 3,120 gp. 4 hours cost 6,560 gp. |
| Confirm | `.hw-confirm`, Enter hidden | Buy 4 hours for 6,560 gp? / The hours stay with Marlow for the Sewer. That leaves you 12,380 gp. / Buy 4 hours / Not yet |
| Bank full | no slider | Your bank here is full at 24 hours. |
| Day limit | no slider | You've bought 48 hours today. You can buy more tomorrow. |
| Not the leader | read only, no switch, slider or price | Set by Brannoch. Scaled to Level 45. / You're 4 Levels under the scaled ground. Its monsters are stronger than you. You can die here. / Brannoch leads, so Brannoch's hours are spent. You pay nothing. Your own 2 h here stay banked. |
| Not the leader, not scaled | read only | Set by Brannoch. Not scaled. / Your leader decides if this hunt is scaled. The Sewer plays at its own Level. |

Also: header band while on reads "Level 41 to 58 while scaled. Its own Level is 8 to 25." The row's fit reads "Scaled to Level 41". The line-up shows each monster's scaled Level. Deadly is off with "Deadly isn't offered while scaled. Your pick is kept for this ground." Top bar in the hunt: "Scaled to Level 41. 5 h 12 min left." When hours end: "Your scaled hours ran out. The Sewer is back at its own Level." After a buy: "4 hours added. The Sewer is scaled to Level 41." Refusal `quote_changed`: "The price changed. Check it and buy again." Solo, the paying line is just "Hours only run down while you hunt here, and they never expire."

**Numbers.** Scaled Level, price an hour, bank, switch: `scaled_hunts.grounds[hunt].level / .price / .banked_ms / .on`. Slider 1 to min(`max_hours`, floor((`bank_max_ms` - `banked_ms`) / 1 h), `day_max_hours` - `today_hours`). Cost = `price` x hours, sent as `p_price` to `hr_scaled_hunt_buy`. Gold is `goldOf(cs)`. Band and monster Levels: `scaleFor` and `scaledRow` in `src/data/scaled-hunts.js`, fed the server's `level` (display only). In the hunt: `hunt_live.instance.scale.level` and `scaled_hunts.playing`. The press stays off until the envelope carries the section.

**Server gaps.** (1) A party member can't read the leader's scale before the hunt: the section holds only the hero's own rows. The "Not the leader" state needs the leader's `level`, `banked_ms` and `on` for the ground, or the client can only say "Your leader decides". (2) `playing` has no hours left, so a member's top bar can't show the countdown.

## 2. Live events (`live-events-desktop.html`, `live-events-phone.html`)

**Decision.** The chip is a screen plate (the `.hs-online` idiom, top left of the world), and it shows only while an event is on or starts within 24 hours. The server sends 7 days ahead, and with a weekly and a fortnightly event that would make the plate permanent furniture.

**Components.** A new HUD plate `.hs-event` in `src/shell` beside the online plate, alive in town and in a hunt (the place-name bar hides in a hunt, so it can't live there). `hunt-detail.js` gets one line `.hw-hd-event` under `.hw-hd-who`. `hunts.js` adds `.hw-hunt-event` on a row only for an event whose scope names that ground or its call. `boss-call-pane.js` swaps its line and press. All words are already in `src/data/live-events.js` WORDS, except the three marked new.

| State | Plate | Hunts window |
|---|---|---|
| Off | none | nothing |
| Soon (under 24 h) | quiet: Bonus XP weekend / starts Fri 6:00 AM | nothing |
| On, XP | +25% Level XP / ends Mon 6:00 AM | picked ground: +25% Level XP this weekend. Ends Monday 6:00 AM. (new: the Ends sentence) |
| On, Open Halls | Open Halls / ends 11:00 PM | Sewer and Warrens rows: Call out the Rat King for free. Page: Open Halls is on. Call out the Rat King for free until 11:00 PM. (new) |
| Ending (under 1 h) | time in bold: ends in 42 min | Ends in 42 min. / Open Halls ends in 42 min. (new) |
| Two at once | one under the other | each its own line |

**Call out while Open Halls is on.** Line: "Open Halls is on until 11:00 PM. 3 calls left today." Press: "Call out the Rat King for free". Confirm: "Call out the Rat King?", today's first warning, then WORDS.warning, then "Call him out for free" and "Not yet". No calls left, alone and hunting keep today's reasons and the press stays off. When the event ends the section is today's again. Pressing the plate opens Hunts (on the Sewer for Open Halls). Its tooltip is WORDS.on or WORDS.soon.

**Numbers.** Percent = (`live_events[].pm` - 1000) / 10. Times = `starts` and `ends`, shown in local time against `cs.serverNow()`. Which grounds = `scope`. Fee and calls left = the quote from `hr_boss_call_view` (`price`, `left`), never the data's fee.

**Gaps.** (1) Client bug to fix in the build: `quoteOf` in `src/session/boss-quote.js` drops any quote with `price < 1`, so a free call would read as no quote and the press would stay off. (2) The quote doesn't say why the price is 0. The client can join it to `live_events`, but a `free_until` on the quote would be safer. (3) Existing copy breaks the rules: "Call out {boss}: {fee} gp" and "Call him out: {fee} gp" are colon-joined.
