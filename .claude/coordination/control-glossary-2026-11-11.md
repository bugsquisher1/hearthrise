# Control glossary sweep (2026-11-11, lane/a-control-glossary)

Tyler, after "Start from what you wear" became "Use equipped": "Try to standardize language like that a bit more please."
Rule: a control (button, tab, column head, menu item, toggle, select option) says ONE standard genre word for its action,
the same word in every window. Sentences in his voice are for explanations, coach cards, crier lines and lore.
The glossary is data: `src/data/text/controls.js` (surface `controls`). `tests/copy-lint.mjs` holds it (control-long,
control-period, control-synonym).

Swept on the local world (`tools/qa/local-world.mjs`, a fresh hero, every window and tab opened, every button/tab/option/menu
item read from the DOM) plus the code paths a fresh hero cannot reach (a worn piece, a held title, a saved setup, a market
draft, a sent friend request, a party invite, the tally's held task).

## Changed: window × control → today → standard → reason

| Window | Control | Today | Standard | Reason |
|---|---|---|---|---|
| Inventory, doll | put a bag piece on the slot | Wear | Equip | the bag's own primary and menu already say Equip; one word for putting gear on |
| Inventory, doll | the worn piece's button | Take off | Unequip | the pair of Equip |
| Character, Outfit | the chosen outfit's button | Wear this outfit | Equip | same action as the doll, 3 words of sentence |
| Character, Titles | a held title | Wear / Take off | Equip / Unequip | same pair |
| Storage | the amount menu's verb and title | Store / Take | Deposit / Withdraw | the genre words for a bank; Take was also the tally's word for taking a task |
| Bag, loot plan (This hunt tab and item menu) | plan options | Keep in bag / Deposit in storage | Keep / Deposit | the same action Storage's buttons do; the optgroup already says "Loot plan" |
| Hunt prep | save what you have on over the picked setup | Save here | Use equipped | Tyler's own word (the setup builder mock says it too) |
| Hunt prep | save a new setup | Save current setup | New setup | the builder mock's word; 3 words of sentence |
| Hunt prep | the armed Delete's way out | Keep | Cancel | it cancels a delete; Keep is the loot plan's word |
| Hunts, Market (Browse and Sell) | back to the list | Back to the list | Back | 4 words; one word everywhere |
| Settings | back to the categories | ‹ All settings | ‹ Back | same action as Hunts and Market |
| Gathering and crafting | back to the skills | ‹ All skills | ‹ Back | same |
| Create a hero | back to the characters | Back to your characters | Back | same |
| Market, Browse and Sell | drop the draft | Forget it | Cancel | the glossary word for dropping your own draft |
| Market, Browse and My listings | the empty-state call | List something | List an item | the Market's verb is List; "something" reads as a shrug |
| Bag item menu | put it on the market | List on the market… | List on market | 4 words; the ellipsis convention is not used elsewhere |
| Market, item page | the quantity chip | Most I can afford | Max affordable | 4 words on a chip |
| Friends | take back a request you sent | Withdraw | Cancel | Withdraw is Storage's word for taking gold and goods out |
| Party, Invites and the invite alert | refuse an invite | No thanks | Decline | Friends already says Decline |
| Party | pick the party's hunt | Pick a hunt for the party | Pick a hunt | 5 words; the window is the party's |
| Party | the finder listing switch | Show in the finder / Hide from the finder | Show in finder / Hide from finder | 4 words each; Show/Hide pair kept |
| Hunts | the leader's start | Start with party / Start anyway | Enter with party / Enter anyway | the solo button says Enter; Start and Enter were two words for one action |
| Tamsin's tally | drop a held task | Give up | Abandon | the genre word for dropping a task; Give up is a sentence |
| Bag item menu | sell this stack | Sell… / Sell (unlock it first) | Sell (the why line says "Unlock it first.") | a reason belongs on the say-why line, not inside the label |
| Bag item menu | selection | Unselect | Deselect | the standard pair |
| Farm | the shop link | Open the Shop | Open Shop | a control, not a sentence |
| Farm | harvest and wither the plot | Harvest and clear plot | Harvest and clear | 4 words |
| Chat, Combat tab | the line filter | Filter lines | Filter | one word; "(2 off)" still follows it |
| Bar, drop menu | insert the dragged action | Insert here (shift the rest) | Insert here | the explanation moves to the code comment; the menu already shows the swap beside it |
| Sign in | resend the confirmation | Send me a new link | Resend link | a sentence as a button |
| Sign in | the reset and new-password submits | Send the reset link / Save the new password | Send reset link / Save password | 4 words |
| Bag, Storage, Market | the search field (aria and placeholder) | Find an item / Find any item | Search items | one word for searching |
| Coach and help text | lines that name these controls | Save current setup, Start with party, Deposit in storage | New setup, Enter with party, Deposit | the words a card names must be the words on the button |

Rows that moved from a window's surface into `controls`: farm.close, heroes.close / cancel / rename / show / sign_out / strip_play,
house.cancel / buy, work.sort (one row per word now).

## Judged and kept (feature nouns, or already the one word)

| Control | Kept as | Why |
|---|---|---|
| Dispatch loot, Sell all junk, Sell spare gear, Sell selected, Sell all <category>, Equip upgrades, Bless all, Hunt again, Open bag, Open Hunts, Leave party, Leave hunt, Add friend, Remove friend, Invite to party, Reset layout, Put back (HUD layout), Send report, Improve the soil, Harvest and replant, Harvest only | feature name = verb + the feature's noun | the glossary word leads; the noun says what |
| Got it (coach cards) / OK (the death popup) | two words for two moments | a tip is acknowledged; a result is closed. Both are two-word idioms, neither a sentence |
| Don't pick up (loot plan) | kept | it is a pickup rule's name in one place, three words, no synonym elsewhere |
| Eat / Drink / Plant / Water / Harvest / Cook all / Fuel the hearth / Put on the bar | kept | each is its own action, the everyday verb |
| Enter town (hero creation) | kept | Enter + the place |
| Pick colors, Pick a weight, Turn, Undo colors | kept | Pick + noun; Turn and Undo are the one word |
| Bag / This hunt, Buy / Sell / Services, Browse / Sell / My listings / History, Your party / Invites / Find a party, Character / Outfit / Titles / Deaths | tabs | nouns and feature names |
| Target / Stance options, the leaderboard list, the party finder's "Needs a bow · Ranger" | select options | descriptions, not actions (the lint reads buttons and rows only) |
| DPS and HPS, This hero / Party (analyzer) | kept | feature names |
| Characters, Sign out, Town, Home (the strip) | kept | one word each |

## Held by the lint

`node tests/copy-lint.mjs`: every static `<button>`/`<summary>` label in `src/shell` and `src/app`, every `controls.*` row and
any text-table row keyed `btn_`/`tab_`/`button_` is read. Four or more words, a trailing period, or a near-synonym of a glossary
word (`CONTROL_SYNONYMS`: Put away, Store, Stash, Take out, Wear, Take off, Forget it, Never mind, No thanks, Give up, Unselect,
Go back, Return, Purchase, Erase, Shut, Apply, Save here, Save current setup, Start with party, Start anyway, Keep in bag,
Deposit in storage…) is a slip. `--selftest` plants one of each and proves it bites, and proves every synonym's target is a
glossary word. A label glued from `t('controls.…')` is read by `tests/text-home.mjs` instead (TH-3/TH-4: the row exists and is read).
