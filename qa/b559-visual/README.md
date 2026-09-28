# b559 visual gate — screenshot set

Captured against `origin/set/b559` (BUILD.cache 558) with a headless Playwright
Chromium (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`), serving the repo
root over a local HTTP server, `window.__HR_TEST_HARNESS__ = true` set before
load. This sandbox cannot reach Supabase or Google Fonts — every screen below
loaded fonts fine off the CDN (not blocked), but **every Supabase/network call
failed** (`ERR_TUNNEL_CONNECTION_FAILED` / `Failed to fetch`), so anything
server-dependent (market ledger reads, cloud sync, the persistent "Cloud is
slow — playing in local mode" pill, "Reconnecting…") is genuinely absent or in
its fail-closed state on every shot, not a capture bug.

Each screen has a `<screen>-1280x800.png` (desktop) and `<screen>-922x423.png`
(landscape phone). Overlays dismissed before every capture: `beta-ack` set in
`localStorage` before load, the FTUE `Not now` button clicked, and any open
`.hr-sheet`/`.modal` closed via its own dismiss control — except where the
sheet **is** the subject of the shot (collection log, codex, charm moment,
renown ladder, settings, welcome-back).

State: MID_GAME-style (250,000 gold, 40 gems, all trainable skills at level 60,
a stocked bag) plus, only for the two Character screens, a full 6-piece
Dawnsteel set. `window.equipItem()` is a real player intent that round-trips
through a server level check ("Your new level is still being confirmed by the
realm") that never resolves offline, so the set was applied via
`stampRecordLikeLoad` (`src/features/smoke/_harness.js`) — the same seam
`tests/features/smoke/rooms-items-and-economy.js:2426` uses for this exact set
— which writes through the real `net/record.js` `applyRecord`, never by poking
`G` directly.

## Screens

### home
`home-1280x800.png` / `home-922x423.png`
Homestead card: `PlotsOpen EmptyEmptyEmptyEmptyEmptyEmptyEmptyEmpty
HouseOpen Theme: Cozy Cottage0 room levels · 0 plot builds`
Ledger (desktop `.hd-ledger`): `0 XP today · 0 Kills · 0 Harvest`
No Night Plan doors row rendered — `doorsHtml()` (src/features/night-plan.js)
only draws when the night's food would run out before it's over; a freshly
stocked 120x Cooked Shrimp bag never falls, so there is nothing to show. Not a
defect in this state.

### home-known
`home-known-1280x800.png` / `home-922x423.png`
Same as `home` after `HearthriseCollection.noteServerCounts({collection:{found:25}})`
and `hrNoteServerBounty({bounty:{progress:9,required:20}})` — both seams exist
and were called successfully, but neither one changed anything visible on the
Home dashboard itself in this state (no bounty-progress widget or collection
tile is currently painted there). The counts they set ARE visible elsewhere —
see `collection-log` below, captured *before* this step specifically so its
pending-dash state wasn't already resolved by this call.

### combat (Fight rail)
`combat-1280x800.png` / `combat-922x423.png`
Started via `window.startCombat('slime')`. Fight rail (desktop, `#fs-manage`):
`Vigour … Tonight Charm & trophy — Vermin charm · — Slime trophy · —`
Vigour bar, "Tonight" (Night Plan) block and "Charm & trophy" (charm ladder)
block are all present. No bounty pill/chip visible — no bounty target is
active in this state (see `war-table` below: "Bounty · No contract").

### combat-drop-odds (War Table)
`combat-drop-odds-1280x800.png` / `combat-drop-odds-922x423.png`
Boss of the Day card: `Boss of the Day · new in 22h 20m · Wyvern · drop odds
×1.5 · kill XP ×1.25 · away too · Fight ▸`

### war-table
`war-table-1280x800.png` / `war-table-922x423.png`
Destination rail: `Bounty — No contract, Take one at the Bounty Board · Boss
of the Day — Wyvern, drop odds ×1.5 · kill XP ×1.25 · Weekly Boss —
Necromancer, opens at Combat Lv 75 · Dungeon — Crypt of Bones, 1 ready to run
· Clan Raid — The Hollow Regent, Clans closed · World Event — Today's
blessing, a rotating bonus every day`

### market
`market-1280x800.png` / `market-922x423.png`
List-form hint (unselected): `Pick an item to see how many you have and the
NPC vendor price.` Ledger header: `Your trade history` — body reads `Your
sales and purchases will appear here once the market ledger has been read.
Sign in and open the market again.` No "last 60 trades" totals line: that
line (`market.js` `historyBlockHtml`) only renders once `hist.status ===
'ok'`, which requires a real server read this sandbox cannot make. No 7-day
stats / Top movers text anywhere on the screen (confirmed by full-panel regex
scan) — matches the expectation.

### market-listing-hint
`market-listing-hint-1280x800.png` / `market-listing-hint-922x423.png`
Picked "Bones (1)" from the bag picker. Hint: `You have 1. NPC vendor pays 1g
each. Suggested ask: 2g.`

### homestead (House)
`homestead-1280x800.png` / `homestead-922x423.png`
Rung lore line: *"A bedroll, a fire, and two rows of dirt. Everyone starts
somewhere."* Named tier: `Property — Tier 1 / 6 — Wanderer's Camp`. A crop
guide line was not confirmed on screen at this scroll position/sub-tab (Rooms
tab is the default; a crop guide may live under a Plot sub-tab not opened
here) — flagging rather than claiming it.

### character-hero
`character-hero-1280x800.png` / `character-hero-922x423.png`
Class title: **Master Warrior**. Crit readout (DOM, from the persisted
Equipment/Stats subtree): `Crit 7%`. The Character panel defaults to its
Skills sub-tab; this shot explicitly selects the **Hero** sub-tab first.

### character-equip
`character-equip-1280x800.png` / `character-equip-922x423.png`
Selected Equipment → **Stats** sub-toggle so the line is on screen, not just
in the DOM: `Set bonus · 6-piece Dawnsteel set — +7% crit`. Equipped list:
Helmet/Body/Gloves/Belt/Pants/Boots all "Dawnsteel …".

### inventory
`inventory-1280x800.png` / `inventory-922x423.png`
Crit row (right rail, Stats sub-view persisted from the equip steps):
`Crit 7%`, alongside the same `Set bonus · 6-piece Dawnsteel set — +7% crit`
line.

### skills
`skills-1280x800.png` / `skills-922x423.png`
Gather tiles show "Yields X" captions, e.g. `Normal Tree · 6 XP · 3.6s ·
Yields Normal Log`. At 922×423 the sticky WOOD/MINE/FISH/… strip sits clear
of the header (verified visually).

### skill-cooking-primer
`skill-cooking-primer-1280x800.png` / `skill-cooking-primer-922x423.png`
Opened Skills → Cooking. Primer: *"Raw food heals a little and cooked food
heals a great deal, which is the whole argument for building a kitchen."*

### collection-log
`collection-log-1280x800.png` / `collection-log-922x423.png`
Opened via `window.HearthriseCollection.open()` — captured **before** the
`home-known` seam call in this same boot so the pending state is genuine, not
already resolved. Header: `3% Complete · Bestiary 0/108 · Items 17/538`. Note:
this build renders unknown/zero bestiary counts as a real "0/108", not a
pending-dash glyph — worth a second look against the "pending dash before
counts" expectation in the brief; it may be that the dash only appears in a
different, not-yet-hydrated boot state this MID_GAME harness skips past.

### codex-vol2
`codex-vol2-1280x800.png` / `codex-vol2-922x423.png`
Opened via `window.HearthriseCodex.open('vigour')`. "Volume II" here is read
as the Codex's second `CODEX_GROUPS` entry, **Fighting** (`src/data/codex.js`
group order: First things, Fighting, Home and hands, Coin, Records), which is
exactly where both `vigour` and `dungeons` live. Vigour entry, full text:
*"Vigour is your daily allowance of hunting at the full rate, and it renews at
midnight UTC. Past it a hunt carries on, and while you are away it pays only a
small share of its usual rate. Gathering, cooking and crafting never spend
Vigour, and refills are sold for gold on the Fight screen."*

### bestiary-charm-moment
`bestiary-charm-moment-1280x800.png` / `bestiary-charm-moment-922x423.png`
The rank-up watcher (`src/features/hunters-ledger.js` `tick`) needs a
non-null `uid` (signed-out here ⇒ `HearthriseAuth.currentUserId()` patched to
a fixed harness id) and a prior SEED at a lower rank before a later poll
counts as a rise (the first "known" tick only seeds silently) — so this
called `HearthriseCharms.noteEnvelope({bestiary:{kills_by_class:{undead:1}}})`,
waited >1s for the 1s `liveTick` poll to seed, then called it again with
`{undead:100, extra_dimensional:5}` (the exact envelope named in the brief)
and waited again. Sheet text: *"A charm is earned — The Hunter's Ledger —
Undead · Marked — … The Bestiary now shows what they are weak to. Undead foes
now drop their loot a little more often, watching or away. Next: Hunter at
500 Undead kills — you have 100."*

### renown-ladder
`renown-ladder-1280x800.png` / `renown-ladder-922x423.png`
Opened via `window.HearthriseRenown.openLadder()`. **Could not find the
away-limit copy** ("12h" / "15h with clan 7" / pending mark) anywhere on this
screen — the full modal text was dumped and searched directly (rank rows,
thresholds, rewards, and the "How renown is earned" footer only; no
away/clan/hour text at all). Nothing in `src/features/renown.js` or
`src/data/renown-ranks.js` renders an away-cap line either. Either that copy
lives on a different screen (the away-limit sentence is emitted around
`src/legacy.js:12011`/`12015`, `src/features/combat-render.js`,
`src/features/home-dashboard.js` — all Home/Combat surfaces, not Renown) and
the brief's screen label doesn't match where the feature actually lives, or
it's a planned addition to the ladder that hasn't shipped. Flagging for the
Coordinator rather than guessing.

### settings
`settings-1280x800.png` / `settings-922x423.png`
Codex row: present (`Hearth Codex — what everything means · Open`). **A
"Data" section IS present** (Save now / Export save / Import save / Save
backups / Reset character) — this contradicts the brief's "no Data section"
expectation. Confirmed twice: once by reading the live DOM text directly, once
by looking at the rendered screenshot. This reads as a real discrepancy
between what the visual gate expected and what b559 ships, not a capture
artifact — worth Tyler/game-designer attention rather than silent correction.

### welcome-back
`welcome-back-1280x800.png` / `welcome-back-922x423.png`
Raised via the harness's own hooks: `HearthriseAccrual.serverAwaySpanMs`
patched to return 12h, `G.lastSeen` backdated 12h, `G.lastOfflineSummary` set
to a synthetic receipt, then `window.__resetWelcomePresentation(false,0,0)`
followed by `window.__presentWelcome()` — all real seams the card's own code
already exposes for testing (`src/legacy.js` `WELCOME_GATE`). Card text:
`Welcome back, adventurer — Your homestead missed you. — Time away 12h 0m —
XP earned +4,200 — Items found +88 — Gold earned +5,300 — Kills +14 — Total
kills lifetime 1 — Gold in pocket 250,002`

## Overlays

All three named overlays dismissed cleanly on every boot: the beta-ack banner
never appeared (pre-set in `localStorage`), the FTUE "Not now" button was
found and clicked, and no What's New / post-signup sheet ever appeared in this
fresh-boot state. The one *not* dismissed on purpose is the "Cloud is slow —
playing in local mode" status pill in the top bar — it is real information
(this sandbox has no Supabase route), not a dismissable overlay, and it
appears on essentially every screenshot for that reason.

## Screens reached, none skipped

Every one of the 19 named screens produced both viewport PNGs — no screen was
skipped in this final pass. Two items above are flagged as **not verified /
possibly a real discrepancy** rather than skipped: the away-limit copy on
`renown-ladder` (could not find it anywhere on that screen) and the "Data"
section on `settings` (present when the brief expected it gone).

## Runtime errors

Every page load logged Supabase/network failures (`ERR_CERT_AUTHORITY_INVALID`,
`ERR_TUNNEL_CONNECTION_FAILED`, `Failed to fetch`, a failed realtime
WebSocket) — expected in this sandbox, not a code defect. No other
`pageerror`/console errors were observed on any of the 19 screens.
