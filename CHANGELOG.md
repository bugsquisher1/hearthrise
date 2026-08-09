# Hearthrise — Changelog

The welcome modal reads this file on first load after a new build. New entries
go at the top. Format: each version is a `## v0.x.x — YYYY-MM-DD` heading,
followed by bullets. Keep entries short and player-friendly (not commit-log style).

## v0.9.2-beta build 259 — 2026-08-09 (Landscape, the way it's meant to be played)

- 📱 **Hearthrise is now landscape-only on phones.** Hold your phone upright and you'll get a friendly "turn your device sideways" screen; rotate to landscape and the full game opens up. The screens have the room they need this way — this is the first step of a proper landscape polish pass. (Tablets and desktop are unaffected.)

## v0.9.2-beta build 258 — 2026-08-09 (Combat keeps going)

- ⚔️ **AFK and offline combat actually keep fighting now.** On phones, switching away or locking the screen could stop the fight loop and leave your kills frozen — because the game wasn't restarting combat when you came back. It now re-arms the fight the moment you return, so leaving combat running (or backgrounding the app) racks up kills like it should. *(Thanks paione.)*

## v0.9.2-beta build 257 — 2026-08-09 (Pick your food in peace)

- 🍖 **The auto-eat food menu stops closing on you.** While you were choosing your auto-eat food, the combat screen redrew every couple of seconds and slammed the dropdown shut. It now leaves the menu alone while it's open — the fight keeps going underneath, and the picker stays put until you choose. *(Thanks paione.)*

## v0.9.2-beta build 256 — 2026-08-09 (Boss card knows its place)

- 🐉 **The Boss of the Day card no longer interrupts a fight.** It was showing on every combat sub-tab, so it dropped into the middle of an active battle. It now lives only on the **Foes** tab (where you pick who to fight) and steps aside during combat. *(Thanks paione.)*

## v0.9.2-beta build 255 — 2026-08-09 (Topbar breathing room)

- 📱 **The top bar no longer overlaps itself in landscape.** Your name, clan tag and Online status were stacking into a strip too short to hold them, so they collided with the rally timer. On phones the top bar now shows a single, tidy clan tag (your name and status already live in the profile header just below), and long clan names truncate cleanly. *(Thanks Tyler.)*

## v0.9.2-beta build 254 — 2026-08-09 (Boss of the Day)

- 🐉 **A featured Boss of the Day.** Every day a different boss is spotlighted at the top of the Combat screen, the same way the daily blessing rotates. Fighting today's boss pays **+50% drop chance** on its rare drops and **+25% combat XP** — a reason to check in and hunt it while it's up.
- 🔎 **See what it drops before you commit.** The card previews the boss's notable drops with their odds, shows a countdown to the next rotation, and has a one-tap **Fight** button (locked with its level requirement until you're ready).
- 🧪 459 tests green.

## v0.9.2-beta build 253 — 2026-08-09 (Toasts stay out of the way)

- 💬 **Pop-up messages no longer float over the middle of the screen in landscape.** To avoid the bug-report button, the notification column was lifting itself up — which on a short landscape phone dropped it right on top of your content. It now steps neatly beside the button and stays pinned to the bottom corner. *(Thanks paione.)*
- 🧪 458 tests green.

## v0.9.2-beta build 252 — 2026-08-09 (Tap the bar, go to the activity)

- 🧭 **The activity bar is now a shortcut back to what you're doing.** Tap the "current activity" strip at the top from any screen and it jumps you straight to that activity — the fight, the skill you're training, or the recipe you're crafting. (When you're idle it still opens the Activities list.) *(Thanks Tyler.)*
- 🧪 457 tests green.

## v0.9.2-beta build 251 — 2026-08-09 (Bounties count real kills)

- 🎯 **"Collect" bounties no longer pay out instantly.** If a bounty asked you to collect drops from a monster and you already had a stack of that item, it completed the moment you accepted it — no kills required. Now the task only counts items you gather *after* accepting it, so the marks are earned. Your existing stacks are untouched. *(Thanks paione.)*
- 🧪 456 tests green.

## v0.9.2-beta build 250 — 2026-08-09 (Landscape rail, full height)

- 📱 **The landscape nav rail now runs the full height of the screen.** b249 moved the nav to the left but a competing rule kept it a short stub; it's now a proper full-height rail, so every tab is reachable and the game truly fills the landscape screen.
- 🧪 455 tests green.

## v0.9.2-beta build 249 — 2026-08-09 (Landscape space + a real scroll fix)

- 📱 **Landscape reclaims the wasted left strip and the bottom bar.** On the live theme the nav never folded into the side rail, so a dead ~64px gutter sat on the left while the nav still ate the bottom of the screen. The nav now becomes a proper left rail on every theme — the game fills the whole landscape screen.
- 🎒 **Your bag really stops jumping to the top now.** The earlier fix patched the wrong renderer; the inventory you actually see is rebuilt every tick, which reset its scroll. It now holds position for real while you're fighting or skilling. *(Thanks paione — sorry it took two tries.)*
- 🧪 455 tests green.

## v0.9.2-beta build 248 — 2026-08-09 (Two tester fixes)

- 💀 **You can actually lose a boss fight now.** In the Crypt of Bones (and any scavenger boss), if you had food equipped your heal-on-hit was quietly reviving you every instant — so at 0 HP you kept swinging and always won. Bosses are a real threat again: run out of HP and you're defeated, food or not. *(Thanks Xarnathos.)*
- 🎒 **Your bag stops jumping to the top.** Browsing your inventory while fighting or skilling snapped you back to the top every tick. It now holds your scroll position while the bag updates in the background. *(Thanks paione.)*
- 🧪 453 tests green.

## v0.9.2-beta build 247 — 2026-08-09 (Loot worth chasing)

- ⚔️ **14 new unique items — real boss loot with a purpose.** A pile of monster drops used to be dead weight you only sold. They now feed 14 hand-crafted uniques with their own identity and flavour — from the early **Widow's Fang** (fast, envenomed) to the endgame **Dragonrend** greatblade forged from an ancient claw and a dragon's heart-gem. Each one leans into crit, swing speed, or a combat style, so what drops finally matters.
- 📖 **Every new piece is in the Recipe Book, level-gated and explained.** Hover any unique to read what it is and exactly what it's made from — locked ones show their recipe in grey so you know what to hunt for.
- 🧵 **Nothing dead-ends.** War Crowns, Void Chitin, Hell Embers, Alpha Fangs and more now route into gear instead of the vendor. Old saves are untouched.
- 🧪 451 tests green.

## v0.9.2-beta build 246 — 2026-08-09 (Gear you've earned)

- 🗡️ **Gear level requirements are real now.** The game showed "Requires Lv X" on gear but let you wear anything anyway — that gate is real: armour is gated on Defence, weapons on their combat style, at the tier's level (Bronze anytime → Dawnsteel needs Lv 88). Wearing top-tier gear is something you *earn* now.
- 🛡️ **Nothing you're already wearing is touched.** Anything you have equipped is grandfathered in — you'll never be stripped of your kit, and once you've worn a piece you can always put it back on, even while you level toward it. It only stops you *newly* equipping gear you haven't grown into yet.
- 🧪 450 tests green.

## v0.9.2-beta build 245 — 2026-08-09 (Speed & coal)

- ⚡ **Attack speed is a real stat now.** Your gear's "Speed" bonus was shown but did nothing — it now genuinely makes you swing faster in combat (capped at 20% so it stays fair). Only a little speed gear exists today, but the stat finally means what it says, and future gear can lean into it.
- ⛏️ **A richer coal seam for late smithing.** Coal was a grind — every bar past copper needs it, and the top bars want 4–5 each, all fed by one flat level-30 rock. A new **Rich Coal Seam** (Mining 52) yields 2–3 coal a swing, so keeping the forge fed at high levels isn't a slog anymore.
- 🧪 449 tests green.

## v0.9.2-beta build 244 — 2026-08-09 (Your stuff is safe)

- 🧷 **Behind the scenes: your inventory is now rename-proof.** As the big item rework continues, some items will get renamed or merged. A new safety layer makes sure that whenever that happens, anything you own — in your bag, worn, in your collection, locked, or in buy-back — is carried over automatically. No more risk of an update quietly eating your items, and it's covered by a test.
- 🧪 448 tests green.

## v0.9.2-beta build 243 — 2026-08-09 (The ladder actually reaches the top)

- 🌾 **Farming can finally be maxed.** The three endgame crops — Goldenroot (Lv 62), Emberfruit (75) and Moonbloom (88) — had **no way to get their seeds**, so farming quietly dead-ended in the low 60s. Their seeds are stocked in the Seed Shop now, so the whole skill is climbable to 99.
- 💜 **Vampire Dust drops again.** A behind-the-scenes data mix-up had stopped Wraiths and the Ancient Lich from dropping it. Back where it belongs.
- 🛡️ **A new safety net checks that *every* item in the game is actually obtainable** — no recipe can require something you can't get, and no item can hide with no source. If a future update ever breaks a progression path, it now fails a test before it can ship.
- 🧪 447 tests green.

## v0.9.2-beta build 242 — 2026-08-09 (Every item has a story)

- 📜 **Every item explains itself now.** Tap any item and you'll see a one-line description of what it is (all 281 items written from scratch, in-world) plus **where it comes from** (crafted, mined, farmed, or dropped by X) and **what it's used in** (the recipes it feeds). No more mystery mats sitting in your bag.
- 🔎 On desktop the same flavour line shows in the hover tooltip.
- 🧪 446 tests green.

## v0.9.2-beta build 241 — 2026-08-09 (Mobile tidy-up)

- 👆 **The item tooltip stops sticking on mobile.** On a phone the hover tooltip could pop up and stay there over everything until you scrolled. It's a desktop-hover feature — on touch it now stays out of the way (tap an item to see its full details), and any stray one clears the moment you tap. (Thanks, paione.)
- 🧹 **No more email + jumbled text on the topbar.** The status pill was printing your whole account email up top, which overlapped the stats on a phone (and showed up in screenshots). It just says "Online" now — the green dot is the signal, your name's already there.
- 🧪 445 tests green.

## v0.9.2-beta build 240 — 2026-08-09 (Never lose an item)

- 🔒 **Lock items so they can't be sold by accident.** In an item's menu, tap **Lock** — a locked item shows no Sell buttons at all until you Unlock it. Bulk-sell skips your locked items too.
- ↩️ **Buy-Back — an undo for the vendor.** Everything you sell to a vendor is remembered; open **Buy Back** (from an item's menu or the More menu) to repurchase your last sales at exactly the price you got. No more gut-punch from a mis-tap. Every sell path in the game now respects both.
- 🧪 444 tests green.

## v0.9.2-beta build 239 — 2026-08-09 (The Recipe Book)

- 📖 **A Recipe Book — every recipe in the game, in one place.** Open it from the Skills screen (or the More menu on mobile) and browse all 156 recipes across Smithing, Crafting, Cooking and Prayer. **Recipes you can't make yet show up too** — greyed out, but still listing exactly what they need and at what level, so you can see the whole crafting tree and plan toward it. Each ingredient shows how many you own (red when you're short), and you can search by item or ingredient.
- 🧪 443 tests green.

## v0.9.2-beta build 238 — 2026-08-09 (Buffs that mean it)

More of the itemization rework's "stop showing numbers that lie":

- 🛡️ **Frostfin Supper actually gives you Defense now.** It promised a defense buff the game silently threw away — it's real (and reads honestly as a flat bonus, not a fake percent).
- 🍀 **Luck food works.** Cooked Lobster, Wheat Bread, Tomato Soup and Hunter's Feast carry a Drop Rate buff that, until now, did nothing — it lifts your odds of a drop for real.
- ⏱️ Retired a phantom "Faster Respawn" buff that could never do anything (monsters here don't respawn on a timer) — the two foods that had it now give you the working luck buff instead.
- 🧪 A new guard makes sure no food can ever again promise a buff the engine ignores. 442 tests green.

## v0.9.2-beta build 237 — 2026-08-09 (Keep going)

- 🎣 **Your skill keeps going when you come back.** Coming back after a while — your fish and XP were credited for the time away (good), but the activity then just *sat* there: the game said "fishing" while nothing actually happened until you re-tapped. Now the live loop resumes on its own, same as a fight already did.
- 🪵 **See what you're working with.** Every crafting/smithing/cooking tile now shows **how many of each ingredient you own**, right on the tile — so as you saw planks you watch your log count fall, and it turns red when you're about to run out. (Thanks for the suggestion.)
- 🧪 441 tests green.

## v0.9.2-beta build 236 — 2026-08-09 (Mobile hardening)

A full sweep of the phone experience — a team audited every screen, then fixed it.

- 📱 **Combat and Inventory menus are back on mobile.** The little tab bars — Combat's Style / Foes / Arena and Inventory's Bag / Equip / Saved — were invisible on phones (tied to a retired theme), which meant your **attack-style picker and gear switcher were unreachable**. They render again.
- ↔️ **The topbar stopped running off the edge** (the "FIGHTI…" clip). No more sideways scroll on any screen.
- 🛒 **The Market buy window scrolls now**, so you can actually reach Confirm on a phone.
- 🔤 **Bigger, readable text and thumb-friendly buttons** across Home and the menus (nothing below the readable floor, every button at least 44px), and your daily **XP / Kills / Harvest ledger is back on mobile**.
- 🩹 Also: the "More" sheet no longer lurks behind chat, the room upgrade window fits landscape phones, blessing pills read cleanly, and the Hunt card stacks instead of squishing.
- 🧪 439 tests green.

## v0.9.2-beta build 235 — 2026-08-09 (Critical hit)

- 💥 **Crit is a real thing now.** Your gear's Crit % was shown on four screens and did *nothing* — every hit rolled it into no damage, and the floating "CRIT!" was faked off any big hit. Now a crit genuinely rolls and lands extra damage, marked in the log and on the number. This also means the **Void Banquet's crit buff finally works** (it was silently discarded). First step of the itemization rework: the game stops showing you numbers that lie.
- 🧪 439 tests green.

## v0.9.2-beta build 233 — 2026-08-09 (Your character, at a glance)

- 🧬 **The Character screen is a real overview now.** Open Character and you see yourself: your portrait, your rank and renown, your TOTAL LEVEL, then a clean grid of *every* skill with its level and progress — and below it your whole account at a glance (combat level, total XP, quests, bounties, collections, renown, achievements, time played). Equipment and Hero are a tab away.
- ⚒️ **Training lives back under Adventure.** Skills is its own door in the Adventure menu again — that's where you actually chop, mine, fish, cook and smith. Tap any skill on the Character grid and it takes you straight there (or to Combat / the Farm). The overview shows *who you are*; Adventure is where you *do*.
- 📱 Both screens fit a phone cleanly — the grid reflows to two columns, the activity screen stacks.
- 🧪 438 tests green.

## v0.9.2-beta build 231 — 2026-08-09 (Combat, unblanked)

- ⚔️ **Combat works on mobile again.** Tapping Fight was dropping you onto a blank screen — the monster list hid itself for the fight, but the battle view was hidden behind the "Foes" tab, so nothing showed. Starting a fight now snaps you straight to the Arena, and ending it drops you back on the foe list for the next one.
- 🧪 438 tests green.

## v0.9.2-beta build 230 — 2026-08-09 (Mobile rescue)

- 📱 **Offline progress works on your phone now.** If you locked your screen or switched apps while gathering, the game froze and credited you *nothing* when you came back — it only ever caught up on a full reload. Now the moment you return to the tab, your away-time is banked exactly like a fresh login. (Thanks, paione.)
- 🏪 **The Shop stopped running off the edge of the screen.** The shopkeeper scene was drawing itself wider than a phone, forcing you to scroll the whole page sideways. Pinned to fit any screen.
- 🛡️ **A boot hiccup can no longer break the Character screen.** Each part of the game now loads on its own, so one stumble can't quietly take the rest down with it.
- 🧪 437 tests green.

## v0.9.2-beta build 228 — 2026-08-09 (Small numbers, real feelings)

- 📉 **Every boost in the game came down — all of them, on purpose.** A room used to grant +50% smithing; it grants +10% now, and the whole boost economy is rebuilt on 2% steps (1% for the wide ones like all-XP). **Nothing you own changed** — same rooms, same levels, same prices, same castle. Only the size of the number each one grants. Boosts stop being a hidden second pacing dial and become a *feel* system, which is the point: when the plain is small, the peak is visible. A Last Call feast used to be lost among a pile of other big numbers; now it's the largest thing on your screen.
- 🎉 **One ceiling, and you can see it.** No single bonus can pass +20% from everything you've permanently earned, +15% from everything the realm temporarily grants, or +30% together. Line up the right weekly, the right daily, a Last Call and a draught and you'll hit it — and the game says so, out loud: *"the realm's blessing is at its limit."*
- 😴 **Rested XP finally pays something you can feel.** A banked charge stopped being a small percentage of one action and became a flat grant of XP — up to **1,600 XP per charge**, and the Great Library deepens your bank to 120 charges. Both the Library and the castle Tavern lead there; you only need one.
- 👑 **Two royal ranks stopped paying pocket change.** Count now grants **+1 market listing slot** and King grants **+1 daily task** — real, permanent, useful — instead of a percent nobody could feel.
- 🐾 **Five companions have been paying you nothing since launch.** The Fox, Lichling, Raccoon, Owl and Grave Wisp all had a typo where their bonus should have been. Fixed. Every pet's bonus was also being counted **twice** by the engine — also fixed — and pets can finally reach level 30 (the cap stopped them dead at 14).
- 🏹 **Ranged and Magic get their combat-XP bonus.** Your Trophy Room, Watchtower, War Drums and Hunter's Moon paid four combat styles and silently skipped two. All six now.
- 🌾 **Five farm perks that paid literally zero now pay.** The Scarecrow, the Bunny, the Squirrel, Carrot Stew and Roasted Pumpkin all granted a fraction of a crop, and the game rounded it away every single harvest.
- 🏅 **The Throne screen finally explains itself** — a "How renown is earned" section listing every source and what it's worth, read live from the scoring itself, plus how much renown you've earned today. And **renown climbs a lot slower**: Serf in a day or two, Squire in your first week, Knight in three or four, Baron in your second month. **No one is ever demoted** — the rank you hold is yours for good.
- 🧪 418 tests green.

## v0.9.2-beta build 227 — 2026-08-09 (The realm's blessing)

- 🌤️ **The blessing calendar is the reason to play live.** The flat "+12% present" bonus is gone; in its place, the day's and the week's world blessings now pay **only while you're actually playing**. One week the realm grants +12% to all XP, another +10% gold find, another +15% gather speed — check what's blessed and train into it.
- 🗓️ **More weeks worth having.** Two new blessings join the daily rotation (**The Open Coffers** — gold find; **The Steady Fire** — your cooking fire behaves) and three join the weekly (**The King's Bounty**, **The Long Harvest**, and the Grand Fair's XP week is now +12%). Fifty-four different weeks in the deck.
- 💤 **Offline is honest.** Progress banked while you're away — and in a background tab, or sitting idle — earns the base rate, and the game says so on Home, on the Events page, and in your welcome-back summary. It never quietly promises a bonus it isn't paying.
- ⚙️ Your activity now re-times itself as bonuses come and go, so a new axe or a fresh blessing is felt on the very next swing instead of after a restart.
- 🧪 337 tests green.

## v0.9.2-beta build 229 — 2026-08-09 (One character screen, and your heroes on the hearth)

- 🧬 **Character and Skills are one screen now.** Open Character and you land on a proper skills grid — every skill with its level and progress, and clicking one takes you straight to where you train it. Equipment (your full doll) and Hero are a tab away.
- 📊 **Hero tab tells your story.** Combat level, total level, total XP, quests, bounties, collections, your renown rank — the whole account at a glance. And Time Played, which the game now actually tracks (click to reveal).
- 🧙 **Your heroes live on Home.** Switch between characters right from the home screen. (The old placeholder that couldn't actually switch is gone.)
- 🏰 A House room's level badge is readable again (it was gold-on-gold).
- 🧪 435 tests green.

## v0.9.2-beta build 228 — 2026-08-09 (Your homestead, your hold, and honest numbers)

- 🏡 **The House is a place you build.** Every room — Kitchen, Forge, Workshop and the rest — shows whether you own it, its level, and exactly what the next upgrade costs in plain words ("700 Gold · 15 Normal Log"). Click a room to step inside its own panel. (Two real bugs died here: you could "build the forge" over and over with no feedback, and the Workshop needed planks that needed the Workshop — a dead end for new players.)
- 🏰 **The clan hold, out in the open.** When your clan is building something, the whole roster sees it: what's being built, every material with how much is in and how much is left, and the labour bar. Only the leader and vice leaders post work orders — and leadership can open the next one to a member vote. The confusing rules are in plain English now.
- ⚖️ **Honest numbers.** Bonuses across the whole game were wildly oversized — smithing had quietly stacked past +90% (a companion bonus was being counted twice). Everything is rebased to small, meaningful steps, with a hard ceiling so it can't balloon again. Nothing you earned changed — a level or rank you hold, you keep.
- 👑 **Renown, explained and re-paced.** The Rise to the Throne screen now tells you exactly how renown is earned, and how much you gained today. It was rising far too fast (a brand-new account was nearly a Serf before doing anything) — now it's a real climb. Your current rank is locked in; you keep it and simply climb slower from here.
- 🔔 **The bell remembers.** Your notification bell opens the Chronicle — a permanent record of your milestones (level-ups, first boss kills, rank-ups, companions bonded). Achievements no longer vanish after a few seconds.
- 📯 **Answer a rally.** Pick the rally you'll join; show up online and you're auto-entered for the full chest, themed to the event (the Forge Levy pays smithing and crafting). Miss it and half honors wait for you.
- 🍳 **Nothing pretends to be working when it isn't.** Run out of ore mid-smith and the activity stops and tells you (this was happening to every skill). "While you were away" now shows your offline haul on Home. The connection badge only appears when you're actually reconnecting.
- 🧹 Ranged and magic finally get their combat-XP bonuses; five companions that paid nothing now pay; combat's Loot and Stats are clean modals by the enemy; and a pile of smaller fixes.
- 🧪 424 tests green.

## v0.9.2-beta build 227 — 2026-08-09 (Readable at last, a castle in the making, and a combat screen that fights with you)

- 🔎 **Text, actually fixed this time — and a dial that's yours.** Half the game's text sat at exactly the old minimum size; everything got a real step up, and Settings → Display now has a working **UI Scale** (90–130%) that resizes nearly all text live and remembers your choice.
- ⚔️ **Combat fights beside you.** The Eat button now lives next to your fighter — always visible, never below a scroll. Loot odds and battle stats are one click away beside the enemy instead of a strip at the bottom of the screen. And "Fight target" on a bounty never cancels the fight you're already in.
- 🏰 **Your hold starts as a castle, not a camp.** Tier 1 is now **The Foundation** — surveyed ground, the first masonry footings, and the finished castle sketched in gilt over the site. As your clan rises (**Rising Walls** next), the same footprint fills in, stone by stone. Clipped labels in the door strip fixed too.
- 📯 **Pledge your rally.** Pick which of the day's two rallies you'll answer; if life happens and you miss it, you get half honors on your next login. Show up live and you earn the full chest — presence always wins. And blessings rotate as your online bonus: one week +4% XP, another +4% gold find, only while you're in the game.
- 🐾 **The Stable has real art** — painted portraits where an honest match exists, a proper gilt paw for the rest (22 emoji retired), and your equipped companion finally shows in the equipment doll for all companions.
- 🎯 **Every quest has a "Go"** that takes you straight to the thing — "catch fish" lands you on Fishing, ready to click. Auto-Eat is now earned with 100 Bounty Marks at the board instead of gold.
- 🧹 Also: the false "Offline" badge is gone (it shows only when truly reconnecting), your avatar is click-to-change, the manual save button retired (the game saves itself, continuously), and the Active tag no longer covers your quantity badge.
- 🧪 357 tests green.

## v0.9.2-beta build 226 — 2026-08-09 (The long road — and a smoother front door)

- ⏳ **Progression has real gravity now.** The road to 99 is a journey measured in weeks, not days — and the economy stops raining items. Nothing you've earned changes: every level, item, and coin stays exactly where it is. (Under the hood: offline progress becomes a fair 12-hour daily budget instead of an exploit-shaped per-login cap, and rate displays now always tell the truth — one screen was advertising triple the real XP rate.)
- 🟢 **Being present pays.** While you're actively playing, all XP flows 12% faster — look for the "+12% present" note. Boosts, feasts, and rallies stack on top of the long road; that's the design.
- 🚪 **Sign-in is seamless.** No more being asked to choose a name you already own (the game now asks the realm first), no double sign-ins from a mistimed reload, no getting bounced to the door by a network blip, and the after-login sheets take turns instead of stacking.
- 🍳 **The cooking progress bar works** — artisan tiles never actually knew they were active; now they do, for cooking, smithing, and crafting alike.
- ⚒️ **The Forge unlocks at the Farmstead** (tier 2) — smithing opens far earlier in your homestead's story.
- 🏅 Long-time players: your renown only went UP in this update (scoring weights rose), and pre-update accounts carry a permanent Founder's mark.
- 🧪 330 tests green.

## v0.9.2-beta build 225 — 2026-08-09 (An online realm — and a fire you can cook on)

- 🔐 **Hearthrise is an online realm now.** Creating an account is the front door — your progress, your name, and your place on the boards live on your account, on any device. **Beta players: your save is carried into your account the moment you sign in. Nothing is erased** — the game even tells you so on the door.
- 🔥 **Cook anywhere.** No Kitchen? The camp fire works — it just burns things sometimes (25% on the open fire, shrinking as you level past a recipe, gone entirely with a good Kitchen). Burn risk is shown on every recipe, and each Kitchen upgrade visibly tames the fire.
- 🏰 **The Clan tab.** Your clan castle now has its own place in the sidebar under a new Realm section — no more digging through Social. No clan yet? It takes you straight to finding or founding one.
- 🔎 **Readable, this time for real.** Half the game's text sat below a comfortable reading size — every label, stat, and caption now meets a hard minimum, enforced by tests so it can't regress.
- 📯 **The Muster is now the Rally** — same twice-daily world event, better name.
- 🧹 Also: the tutorial can no longer be wedged by clicking a highlighted tab after finishing it, the rank-up ceremony wears a gilt laurel instead of an emoji, and a stack of smaller polish.
- 🧪 307 tests green.

## v0.9.2-beta build 224 — 2026-08-08 (Hotfix — eating works, quests count)

Two fixes straight from your beta reports. Thank you — keep them coming.

- 🍖 **You can actually eat now.** Every healing food carries a real **Eat** button with its effect on it ("Eat — Heals 8"), buff food says **Drink/Use** with the buff and duration spelled out, and combat has a proper Eat button with your best food loaded. The truth we found: the old Eat path pointed at code that never existed, and "Set Auto-eat" hasn't done anything since build 134 — new players literally had no way to heal. Eating at full HP now politely refuses instead of wasting the food, and the game plainly tells you Auto-Eat is a Store unlock.
- 📜 **The Quests strip counts again.** The topbar quest tracker has silently shown 0 progress — and refused claims on finished quests — for 97 builds. Chop a log, watch it move. (Your actual progress was always being recorded; only the display and the Claim button were broken.)
- 🧪 282 tests green (+8 that specifically watch numbers move, which is how this stayed invisible).

## v0.9.2-beta build 223 — 2026-08-08 (The Clan Seat rises)

- 🏰 **Your clan has a castle now.** The clan page is a dusk scene of your hold, built from real coursed stonework — and it grows with your clan, from two tents and a fire to a fortified keep with towers and trophies. **Every structure is clickable**: step inside the Great Hall (banners, dais, the roster), the Treasury vault (iron door, coin chests), the Tavern (a glowing hearth and the chalked task Board), the Sawmill, the Smeltery, and the War Room's map table. Each room carries its own upgrade ladder — costs, effects, and what the next level buys.
- 🔨 **Work Orders.** Building the castle is a three-phase clan effort: an officer posts the order, everyone supplies materials (castle goods crafted in the new Castle Stores lane — even tier-1 slime drops matter now), then every skill action you take fuels construction. A dozen casual members genuinely out-build one maxed player.
- 🍻 **Feasts and rest.** Fill the Tavern's feast meter with cooked food and call a clan-wide XP feast — with a doubled-power Last Call in its final stretch. And the Tavern banks Rested XP for time you spent away.
- ⚔️ **The Hunt, tiered.** The weekly clan raid was mathematically unbeatable (it was tuned for a clan far larger than any that exists — never once cleared). Now it scales with your actual roster across five tiers, your War Room sets your ceiling, and six new boss materials forge the first gear beyond Dawnsteel — the only kit solo play can't earn.
- 🖼️ All six Hunt bosses wear painted portraits, castle goods got real icons, and farming's three endgame crops (levels 62/75/88) are finally plantable — the last 37 farming levels actually have something to grow.
- 🧹 Modal traffic control: tutorial, name choice, What's New, and the daily reward now take turns instead of stacking.
- 🧪 274 tests green (+24 new regression guards).

## v0.9.2-beta build 222 — 2026-08-08 (Know your place — in a good way)

- 🏆 **Leaderboards, rebuilt.** 21 boards — the Throne (renown), Overall, Wealth, Combat, Bosses, every skill, and Clan Power — and the big one: **you always see your own rank**, with the rival directly above and below you, no matter how deep you sit. Rank 1 wears a crown. Two long-standing scoring bugs died on the way: renown was undercounting everyone's levels, and the Combat board had never ranked anyone at all.
- 🏰 **Castle groundwork.** New castle goods appear in the workshop (Timber Beams bound with slime gel, Iron Fittings case-hardened with bone chips…) under a new "Castle Stores" crafting lane — the supply line for the clan castle coming next build. Dozens of monster drops that were vendor trash now have a purpose.
- 💰 Gold-find bonuses now actually work (they never did), and returning players' groundwork for Rested XP is in place.
- 🎨 **Under the hood, a deep CSS cleanup:** shop price tags and buttons that shipped with unreadable cream-on-parchment text are fixed, the active nav item aligns properly again, the mobile bottom bar is no longer a parchment strip in the dark theme, and 636 lines of dead styling are gone.
- 🧪 250 tests green (+29 new regression guards).

## v0.9.2-beta build 221 — 2026-08-08 (Your name, your face, a real town)

- 📛 **Your name is yours.** On first sign-in you now choose a unique display name — live availability check, no duplicates, ever. `Sir_Bob` and `sir bob` count as the same name, so nobody can impersonate you with a lookalike. Existing players keep their name (earliest account wins a clash and just confirms it).
- 🖼️ **Upload your portrait.** Any image becomes your adventurer: cropped and resized on your device (metadata stripped — the original file never leaves your machine), shown everywhere your character appears. Works offline too.
- 📌 **The bounty board is a board.** A timber noticeboard under a lantern, each bounty a parchment notice nailed to it — and claimed hunts get an oxblood CLAIMED stamp instead of vanishing.
- 🏪 **The shop is a shop.** A lit interior with a keeper leaning on her counter (hen included), wares laid out on cloth mats with price tags. The premium store keeps its sapphire trim so real-money is never ambiguous.
- 🧹 A pile of long-standing oddities died on the way: the welcome sheet can no longer land on top of the tutorial, failed portraits no longer render a 📦, six emoji leaks on the bounty/shop screens are gone, and an economy safety test that had been silently checking an empty list is now actually watching the store.
- 🧪 221 tests green (+15 new regression guards).

## v0.9.2-beta build 220 — 2026-08-08 (The Muster, honest farming, and a tidy workshop)

- 📯 **The Muster.** Twice a day (01:00 and 13:00 UTC) a 45-minute world event opens — join one per day, rally your contribution, and claim a chest when the window closes. The two daily slots are always *different* events, so picking your slot is a real choice. A countdown pill in the top bar always shows what's coming; there's no "you missed it" nagging, ever.
- 🗺️ **Events has a home.** A new Events tab gathers world events, the weekly clan raid, and every dungeon in one place — no more hunting through Combat for the raid card (which, it turns out, had been rendering 16 pixels tall).
- 🌱 **Watering is now optional.** Crops always finish on their own — watering opens a 2-hour double-speed window instead of being a hard requirement. Auto-replanted crops used to stall *forever*, invisibly; every stuck plot un-sticks itself on first load. The harvest daily now scales with your actual farm too.
- ⚒️ **The workshop is organized.** Smithing, crafting, and cooking are grouped into categories — and cooking is split into Provisions (healing) and Feasts & Draughts (buffs). Auto-eat now eats *real food*: it had been preferring raw shrimp over cooked shark since forever, and it will never burn your feast items.
- 🧰 Also: the "More" menu buttons that silently did nothing now work, and event names no longer render as emoji.
- 🧪 206 tests green (+18 new regression guards).

## v0.9.2-beta build 219 — 2026-08-08 (A hearth worth coming home to)

- 🌄 **The Home screen is a place now.** The top of Home is a dusk vista of your own holding — and it grows with you, from a lone tent at the campfire to a full castle with your banner up. Below it, "Your holding" shows exactly what your next property tier costs, and "The realm" surfaces today's and this week's world events (previously buried in a ticker behind the chat button).
- 🔔 **Notifications you can actually read.** Full-size text, they stay up long enough to read (longer messages stay longer), bursts queue up instead of erasing each other, repeats collapse into a counter ("+1 Logs ×6"), hover pauses them, click dismisses. And they position themselves clear of the chat button — measured, every time.
- 💬 **The chat button moves.** Drag it anywhere; it snaps to an edge and remembers its spot.
- 🛡️ **Raid fairness, server-enforced.** The once-per-day raid strike, chest eligibility, and claim-once are now enforced by the server, not the honor system. Four holes closed — including one where the first striker of the week could declare a 1-HP boss.
- 🧹 Odds and ends: the daily-reward popup no longer prints raw code, the beta-welcome card matches the theme, and the "What's new" popup (this one!) can never again show you the changelog's plumbing.
- 🧪 188 tests green (+11 new regression guards).

## v0.9.2-beta build 218 — 2026-08-08 (Readable — bigger text, a real logo, tabs that stay put)

First batch from the new dev-team process: the three things most in the way of just playing.

- 🔤 **Everything is bigger.** Body text goes from 14px to 16px, and every label, row title, and stat scales with it — the whole type ramp moved together, so the hierarchy you know is unchanged, just legible from a normal sitting distance.
- 🛡️ **Hearthrise has a real logo.** The old crest was drawn for a light background — on the dark sidebar its brown lettering was nearly invisible. The new mark is built for the dark: a rising-sun shield emblem over HEARTHRISE in gilt capitals. On narrow windows it collapses to the emblem alone.
- 📌 **Inventory tabs stay where you put them.** Switching the equipment panel to Stats or Companion used to get yanked back to Equipment seconds later — every resource you gathered rebuilt the panel and reset it. Your chosen tab now survives.
- 🐾 **The Companion tab is about your companion.** It used to show a lone slot icon next to *your* stat sheet. It now shows your companion's name, level, XP progress, and the bonuses it actually grants — or points you to the Stable if you haven't befriended one.
- 🧪 177/177 tests green (two new regression tests guard the tab fixes).

## v0.9.2-beta build 217 — 2026-08-08 (Art Direction — it looks like a game now)

A full art-direction pass over every screen. The goal was blunt: stop looking generated. Most of what changed was structural, not decorative.

- 🖼️ **No emoji renders anywhere in the game.** There were ~1,400 in the source and about two dozen actually reaching the screen — the entire premium store's product art, every inventory filter, all six crop seeds, the Character page's section headings, the status bar, the browser tab icon. Every renderer now resolves an icon from the game's own set, and the fallback is a gilt glyph rather than a system pictograph, so a future missing icon can't reintroduce one.
- ⚙️ **The icon set ships with the game.** It used to be fetched from GitHub at runtime: first session showed emoji until the network answered, offline players never got icons at all. All 164 icons are baked into the build and draw on the first frame.
- 🃏 **The wall of cards is gone.** Every group of content was a rounded box with a gold border — twenty per screen, all the same weight, so nothing stood out. Sections are now a heading over an incised rule; a box is reserved for things you press or grids that hold objects.
- 🔤 **New typeface.** Body text was Quicksand, a rounded sans inherited from the retired light theme. It's now Alegreya Sans, which shares Cinzel's classical bones, with real small caps for labels and tabular figures so numbers stop jittering.
- 🎨 **Colour means something again.** Red was the primary-action colour *and* the danger colour — "Upgrade Property", "Buy" and "Take the tour" were all painted the same as a destructive action. Gilt is now the only interactive accent; oxblood is danger only; moss is XP; sapphire is real-money currency.
- ⚔️ **The arena is a place.** It was an empty navy rectangle — its "painted battle background" pointed at a folder that isn't in the deploy, and an opaque overlay covered the one that is. Your champion now stands in a lit dungeon stage with the recommended foe as a real call to action, instead of a duplicate of the monster list two columns to the left.
- 🌳 **Materials read as materials.** All five log tiers rendered the same sprite (a plank, not a log), and every ore rendered its own smelted bar. Ores use the proper ore art, and the wood ladder is tinted per species — pale sapwood through near-black yew.
- 🌾 **Farm plots are tilled ground** rather than dashed rectangles containing the word "Empty", and the crop list shows each crop's painted art.
- 🧰 **Screens stop hiding things.** Content was scrolling inside invisible boxes: the store's second row of packs was cut through the middle, the crop guide lost its last three crops, and the House screen printed its section headings on top of each other. Stacked screens scroll as a page now.
- 🔍 **Depth.** Measured across the finished screens, 92% of every pixel sat inside a 32-value band — nothing read as being in front of anything else. Surfaces were re-spaced so the world sits behind the panel and objects sit on it; inventory slots read as recessed wells and filled tiles lift out of them.
- 📱 The mobile tab strip's selected tab was a filled red slab; it's gilt like everything else selected.
- 🧪 170/170 tests green.

## v0.9.2-beta build 216 — 2026-08-08 (One Palette — the colours finally match)

The mismatched colours had a single root cause, and this build removes it rather than papering over it again.

- 🎨 **The light theme is no longer painting underneath the dark one.** The theme is applied to `<body>`, but ~310 style rules were written as "when no theme is set on `<html>`" — a condition that was *always* true. So the retired parchment theme rendered beneath Hearthlight on every screen, and 87 more rules hardcoded cream surfaces or cocoa text with no theme scope at all. That's why unreadable patches kept coming back no matter how many fixes went in. The light theme is now strictly opt-in, and the dark palette is the game's actual default.
- 📖 **Readable everywhere.** The activity bar (cocoa text on a washed cream strip), the wordmark beside the logo, market listings, bounty cards, shop ribbons, settings, dungeon cards, the tour, and the mobile tab strips are all legible now. A contrast sweep across all 13 screens went from dozens of failures to none that affect text.
- 🔘 **Filled buttons read correctly.** Gold ribbons and active chips were drawing pale text on pale fills; filled controls now take dark ink. The primary action button is the game's wax-stamp red instead of a leftover teal from an older palette.
- 📦 **A real inventory.** The bag now shows empty slots in a dense, uniform grid instead of a few tiles above a black void — item positions stay put and the bag reads as a container.
- 🧍 **The equipment doll fits on screen.** All 14 slots are visible at once (they used to overflow behind a scrollbar), split into **Equipment · Stats · Companion** tabs. Ammo sits top-right, earrings moved across, rings dropped a row, and there's a new **offhand/shield** slot. Every generated armour and weapon piece now shows real painted art instead of a placeholder shield.
- 📊 **Equipment bonuses** are their own tab (and a pop-out) showing your summed totals and everything you're wearing.
- 🖼️ Home is clearer: buttons are button-sized rather than card-height slabs, quest progress and reward read as a pair, and the backdrop no longer smears through the panels.
- 🧪 Guarded by tests: the suite now fails if the always-on light layer or an unscoped cream/cocoa rule ever returns. 170/170 green.

## v0.9.2-beta build 215 — 2026-08-08 (The Long Climb — every skill now runs to 99)

Hearthrise is built on the promise of taking every skill to 99. This update makes that real: the ladders that used to stop dead in the sixties now run all the way to the cap, with two brand-new material tiers of your own — **Emberforged** and **Dawnsteel**.

- 🏔️ **Level 99 is finally reachable.** The XP table was missing a rung (the level-98 threshold), so the cap was silently 98 and the skill panel showed "NaN" next to your experience. Fixed — 99 is real, and it says MAX when you get there.
- ⛏️ **Gathering runs to 90.** Mining ends at **Emberstone** (75) and **Dawnstone** (90); woodcutting at **Runewood** (75) and **Duskwood** (90). Fishing gained **Herring** (10), **Swordfish** (55), **Frostfin** (66) and the **Moonlit Pool** (90), closing every dead stretch. Farming continues past pumpkin with **Goldenroot** (62), **Emberfruit** (75) and **Moonbloom** (88).
- 🛡️ **A complete armour set at every tier.** Every material — Bronze, Iron, Steel, Mithril, Rune, Emberforged, Dawnsteel — now has a **helm, platebody, platelegs, boots, gauntlets and belt**. Armour used to stop at steel, and legs, gauntlets and belts barely existed. You can finish a set at any point in the game.
- ⚔️ **Every combat style climbs the same ladder.** Swords, warhammers, bows and staves each run all seven tiers, so no build stalls waiting for gear that was never made. Dawnsteel gear carries a **mythic** border; a whole material tier now reads as one rarity across every slot instead of one piece randomly outranking its own set.
- 🪓 **Tools go further.** Emberforged and Dawnsteel axes and pickaxes, plus Duskwood and Dawnsteel rods — up to **+35% gathering speed**.
- 🔨 **Smithing and crafting have somewhere to go.** Emberforged (82) and Dawnsteel (92) bars, Runewood and Duskwood planks, and a forge recipe for every new piece — a new unlock at least every six levels all the way to 98.
- 🍲 **Cooking to 99** with Swordfish, Frostfin, Moonfish, Goldenroot Roast, Ember Tart and the Moonbloom Elixir.
- 🚫 **The Season Pass is gone.** It sold a permanent +10% XP boost, which is pay-to-win against a public leaderboard. Premium stays convenience and cosmetics — nothing you can buy makes you level faster.
- 🧭 **Readable activity panels.** The skill grid sized itself with a fixed column count that assumed a handful of recipes; with the full ladder it crushed everything into 90px tiles with the names clipped to "FORGE". Tiles now size themselves and stay legible no matter how much content ships.
- ⚙️ Under the hood: game data is finally **one dataset** instead of two silently-drifting copies, so new content reaches every part of the game the moment it's written.

## v0.9.2-beta build 213 — 2026-08-08 (The Playtest Update — a full QA pass, start to finish)

A top-to-bottom playtest of the whole game — every system exercised the way a real player would, and everything that broke, confused, or lied got fixed.

- 🏡 **New players can actually build now.** The property ladder had a chicken-and-egg lock: the Homestead demanded planks (which need the Workshop), the Farmstead demanded metal bars (which need the Forge) — rooms you couldn't have yet. Every tier's cost now uses materials you can genuinely produce at your current tier, and each new room feeds the *next* upgrade. Camp → Castle is a real climb.
- 🌱 **Farm plots are real property perks.** Your plot count now truly comes from your property tier (2 at a camp → 12 at the castle) instead of a flat 8 forever. Anything already growing in an over-cap plot stays harvestable — nothing you planted is lost.
- 🧭 **Clearer refusals.** "Not enough resources" now tells you exactly what's missing ("Missing: Normal Log ×17"), for rooms and plot buildings alike.
- 🛟 **Save-safety.** If your save ever fails to load, the game now preserves the damaged data as a backup, tells you what happened, and points you at Settings → Data → Restore — no more silent fresh start.
- 🗡️ **Honest dungeon labels.** The key-gated epic runs are solo challenges and now say so — no more phantom "party of 4" / "24 players" promises. (Real multiplayer raiding = the weekly clan raid.)
- 🏆 **Leaderboard tells the truth.** Real player rankings fetched while signed out no longer get stamped "Mock data" — if it's live, it says Live.
- 🎁 **Daily reward modal behaves.** It never stacks on top of the tutorial anymore, its claim button works wherever you tap it, and it greets first-day players properly. Its coins/gems are drawn in the game's gilt icon style, not emoji.
- 🧰 Boot is clean: the 15 tool items are back in sync between data files (no more startup warning), the Bounty Hunter medallion loads a real icon, and the topbar Quests button got a proper gilt scroll.
- 🧪 Regression tests added for the property ladder, the farm-plot cap, and the tier-gated room test — 159/159 green.

## v0.9.2-beta build 211 — 2026-08-08 (The Realm Update — the game goes multiplayer)

The biggest update Hearthrise has ever shipped. Ten systems, one connected world.

- 🏰 **Weekly Raids.** A rotating raid boss — *The Emberclad Tyrant*, *The Hollow Regent*, *The Maw Below* — with a **shared clan HP pool**. Strike once a day with your real combat stats (gear and style matter), watch the clan chip the boss down together, and claim the chest when it falls. Solo players get their own scaled hunt.
- ⚜️ **Real clans.** Found or join a clan, contribute gold to the **clan castle treasury**, and level it for shared perks — bonus XP, gather speed, offline hours, artisan speed — up to the Lv 10 castle banner. Live roster with contribution rankings. Clan chat unlocks the moment you join.
- 🏛️ **The market goes live.** List items, buy from real players, prices form for real — and **your sales pay out even while you sleep** ("Market sales while you were away: +N gold"). Race-safe: two buyers can't take the same item.
- 💬 **Chat is real.** Global, Trade, Clan, and Whispers — realtime, cross-player, with mentions and blocking.
- 🏆 **Live leaderboards.** Total level, combat, and wealth — ranked against every real player, clan tags included.
- 🪙 **Hearth Tokens.** The premium bond: buy with real money (when Steam/mobile launch), **sell to other players for gold**, spend on dungeon entries, or redeem for gems. And no — the old free-gems dev exploit is gone.
- 🌍 **World events.** Every player shares the same daily + weekly events — *Forge Fires*, *The Grand Fair*, *Hunter's Moon* — with real bonuses that touch every system.
- 🧺 Plus everything from the Homestead Update below: camp→castle property tiers, workbenches, hired workers, the full tool ladder, and 10 new rare pets.
- 🎨 One cohesive look: a single gilt icon language across the whole interface — no more mixed icon styles.
- ⚙️ Under the hood: cooking/smithing now progress **offline** like everything else, and the complete multiplayer database schema ships in `supabase/schema.sql`.

## v0.9.1-beta build 201 — 2026-08-08 (The Homestead Update — camp to castle)

The progression spine arrives. This is the beginning of the big systems push.

- 🏗️ **Property tiers.** Rise from a Wanderer's Camp (2 plots, no workbenches) through Homestead, Farmstead, Manor, and Keep to **Hearthrise Castle** — each a real build with gold + crafted materials, unlocking farm plots (2→12), worker slots (0→6), bonus offline hours (+1h to +4h), and the castle's +5% all-XP crown. Manage it from the new Property card in House.
- 🔨 **Rooms are workbenches now.** Cooking needs a Kitchen, Smithing a Forge, Crafting the new **Workshop**, Prayer the new **Shrine** — and your property tier gates which rooms you can raise. (Existing players: anything you'd already trained is grandfathered — you lose nothing.)
- 🧺 **Workers.** Hire hands at your homestead and assign them to any gathering task you've mastered — they keep producing while you're away (up to 24h), level up over days, and never steal your XP. Their haul funds your next property tier. That's the loop.
- 🪓 **Real tools.** Bronze→Iron→Steel→Mithril→Rune axes, pickaxes, and fishing rods — craft them at your Forge/Workshop and your best owned tool auto-applies (+5% to +25% gather speed). Tool upgrades finally matter.

## v0.9.1-beta build 188 — 2026-08-08 (Painted — the game gets a face)

The whole game gets a real, cohesive art style.

- 🎨 **Painted monsters + heroes.** Every enemy is now a hand-painted portrait — meet the Lich, the Death Knight, the Mummy King and 27 more in full painted glory, replacing the old placeholder icons. Your adventurer is a painted portrait too (upload-your-own is coming).
- ⚔️ **Painted gear.** Weapons, armor, and jewelry now show real painted icons that grow more ornate as you climb tiers.
- 🌈 **Item rarity colors.** Gear carries the classic rarity borders — Common (gray) → Uncommon (green) → Rare (blue) → Epic (purple) → Legendary (gold) → Mythic (deep red), with something special coming for Uniques. Your upgrades read at a glance.

## v0.9.1-beta build 176 — 2026-08-07 (The retention update + the game goes dark)

- 🌙 **One look: Hearthlight.** The game is now a single, cohesive **dark** theme by default — deep warm shadows, gilt accents, the dusk backdrop glowing behind the panels. The old light theme is retired for launch (one look to polish, not two). This is the atmospheric, premium-idle feel the rework was aiming for; combat + monster art come next.

Three big new systems that give your progress a destination, a daily habit, and a completion chase.

- 👑 **Renown — Rise to the Throne.** One account-wide rank ladder (Peasant → King) fed by *everything* you do. Your rank + progress to the next sits right at the top of Home; tap it for the full 12-rank climb. Rank-ups are a moment — a celebration, a reward to claim, and a **permanent perk** (perks stack to +22% XP and +12h offline by the top). You already have Renown from your past play — log in and claim what you've earned.
- 🎁 **Daily login reward.** A 7-day escalating cycle (Day 1 → Day 7 jackpot) that scales up each week you keep the streak. Miss a day and it restarts — but you never lose what you banked. Claim it right from Home.
- 📖 **Collection Log.** A browsable record of every monster slain and item found, with completion % and milestone rewards. Tap any discovered monster for its **drop table**, or any item to see **where it drops** — and a little "New discovery!" toast pops the moment you find something new. Those "???" slots are a to-do list, and it all feeds your Renown.

Plus polish + foundation:
- ⚔️ **Auto-eat is smarter** — heals only (no more skipped attacks), and now **prefers plain food so it never wastes your buffed cooked meals**. Your setting carries over automatically.
- 📜 "What's new" panel + mobile chat fixed; readability cleanups.
- 🧱 **Under the hood:** a swappable "storage seam" — groundwork for Steam + mobile from one codebase.

**Next:** more content to collect, and the mobile app-feel pass.

## v0.9.1-beta build 154 — 2026-08-07 (Home, rebuilt for real — the pitch, not a recolor)

The recolor-the-old-layout approach was never going to look like the pitch. So Home is **rebuilt** as a new component (`src/features/home-dashboard.js`) — the actual pitch layout: header + legible pills, an illuminated "next milestone" hero with a CTA, **actionable quests where every card is a door** (Catch fish → *Go fish →* opens Activities→Fishing; Earn gold → *Sell →* opens Market; etc.), today tiles, resume, and buffs.

- 🏗 **First screen of the new component layer.** Styled with **design tokens only**, so it renders correctly in *both* themes automatically — cream on Cozy Day, warm-dark on Hearthlight — with zero per-theme overrides. This is the "build it right once" approach; no more whack-a-mole.
- 🚪 **Every card routes to where you act** — quests, milestone, resume, "cook something" all deep-link to the right screen (routes verified against the real tab IDs: skills/farming/market/combat).
- 🔧 **Non-destructive + reversible.** Renders into `#panel-profile` and hides the legacy cards only when it's active. ON by default this weekend (solo); instant off-switch: `localStorage.setItem('hearthrise:home-v2','0')`.

**Next:** react to Home, then rebuild Combat / Activities the same way.

## v0.9.1-beta build 153 — 2026-08-07 (Revamp — Home content goes dark, Hearthlight is coherent)

The one that makes Hearthlight actually look like a finished theme instead of a dark-frame-on-cream-guts mismatch. Converted the Home/Profile content: cards, stat tiles, the milestone card, the top pills, the achievement buttons, and modals now go warm-dark with light text and gold headers under Hearthlight. Iterated live in-browser until it read cleanly.

- 🎨 **Home is fully Hearthlight now** — dark cards, gold name + section headers, readable stats, dark modals. No more cream guts under a dark frame.
- 🔒 **Cozy Day still 100% untouched** — every rule is scoped to `[data-theme="hearthlight"]`, so the default look and your testers see zero change.
- Honest note: this slice is override-style (Hearthlight-scoped) rather than pure token conversion, because Cozy leans on many one-off shades. Converting those to shared tokens (so it's DRY) is a later cleanup — the look is right now, the tidy-up comes after.

**Next:** Combat, Activities, and the other screens get the same treatment; then the wordmark straggler + a token-tidy pass.

## v0.9.1-beta build 152 — 2026-08-07 (Revamp — sidebar nav readable on the dark shell)

Follow-on to b151. With the sidebar now warm-dark under Hearthlight, its nav text needed to keep up. Nav button text is tokenized (`var(--ink)`) so it reads on any ground; the bespoke bits (group labels, the HEARTHRISE wordmark, the foot) keep their exact cozy browns for Cozy and get readable gold/light values under Hearthlight only.

- 🧭 Sidebar nav, group labels, wordmark, and foot are legible in both themes. Cozy Day unchanged; Hearthlight's whole left rail is now coherent.
- Same discipline as b151 — tokens where a token already fits, a scoped override only where Cozy uses a one-off shade.

**Next:** the Home content panels/cards (the big cream area), then Combat.

## v0.9.1-beta build 151 — 2026-08-07 (Revamp Phase 1b — app shell tokenized)

First real slice of paying down the CSS debt that blocks the revamp. The app shell — **body background, sidebar, top bar** — was painting hardcoded cream gradients straight in the component rules, so no theme but Cozy could ever change them. Those are now driven by **shell tokens** (`--app-bg`, `--sidebar-bg`, `--topbar-bg`) defined per theme.

- 🧱 **Shell surfaces are token-driven.** Cozy Day keeps the exact same values (verified pixel-identical — zero change for anyone on the default). Hearthlight's shell now correctly goes warm-dark. Cozy Night and Classic got proper dark shell values too (fixing a latent "cream sidebar on a dark theme" bug).
- ♻️ This is the pattern for the whole revamp: convert hardcoded colors → tokens, one area at a time, Cozy verified unchanged + the new theme verified correct at each step. No layout touched; default look untouched.

**Next slices:** sidebar nav text/icons (readable on the dark shell), then the content panels/cards screen-by-screen (Home → Combat → Activities → …).

## v0.9.1-beta build 150 — 2026-08-07 (Hearthlight — the visual revamp begins, opt-in)

Phase 1 of the UX/UI revamp. A new **Hearthlight** theme — the candle-lit "hearthlight" direction from the design pitch: deep roasted-oak grounds so content actually pops, gilt gold as the unifying accent, and the skill/combat/economy colors turned up into proper "guild seals." It's a full reskin that touches every screen at once, because the whole app already runs on CSS tokens — Hearthlight just redefines them.

- 🎨 **New theme: Hearthlight** (Settings → Display, or the theme picker). Warm-dark, high-contrast — the fix for the washed-out cream-on-cream look.
- 🔒 **Opt-in and non-destructive.** The default stays **Cozy Day**; nothing changes for anyone until they pick Hearthlight. Layout is untouched — only the palette swaps.
- 🧪 **1 regression test** — hearthlight is registered and applies its ground token, then restores the tester's theme.

This is the foundation. Next phases (the world-map home, the "every card is a door" routing, the dungeon/raid screen, the rise-to-jarl progression) build on top of it. Try it and tell me where the palette wants tuning.

## v0.9.1-beta build 149 — 2026-08-07 (Don't lose progress when the login token expires)

Surfaced while verifying the save fix: Supabase access tokens expire (~1 hour), and when one did, cloud saves **failed silently** — `snapshotIfDue`/`flush` caught the error and only logged a warning, so a long play session's progress could stop reaching the cloud with zero signal to the player. (Local save was fine, so no data was lost — it just wasn't syncing.)

- 🔑 **Auto-refresh + retry on expired token.** The Supabase client is now created with explicit `autoRefreshToken`/`persistSession`, and if a save still fails on an auth error, sync asks the auth layer to refresh the token and **retries once** with the fresh token. Applies to both the snapshot save and the event flush.
- 📣 **Sync failures are now visible.** When saves can't reach the cloud, you get a "⚠️ Reconnecting… your progress is saved locally" toast + a status-pill change; when it recovers, a "✅ Back online — progress synced" confirmation. No more silent failure.
- 🧪 **+2 regression tests** (the `isAuthError` classifier + the live config wiring the refresh/health hooks). `isAuthError` extracted as a pure, tested helper.
- 🐛 Fixed a self-bug in `bump-version.sh` (a clean bump exited non-zero because a "no leftovers" grep returned empty under `set -e`).

## v0.9.1-beta build 148 — 2026-08-07 (Fix the ESM cache gap — deploys now propagate instantly)

Infrastructure fix. While verifying the b147 save fix in a live session, hit the exact "ESM module cache-buster gap" that's been sitting in the ROADMAP backlog — and it's nastier than it sounded: it made a correct, deployed fix *look* broken for ~10 minutes, and it would do the same to every beta tester after every update.

- 🧩 **Root cause:** `index.html` cache-busts its `<script>` tags with `?v=NNN`, but `src/main.js` and the whole module graph under `net/ features/ utils/ data/` used **bare relative imports** (`import './net/sync.js'`) with no version. GitHub Pages serves those with `Cache-Control: max-age=600`, so for up to 10 minutes after a deploy the browser runs a **mix of fresh and stale modules**. That's why the b147 `sync.js` fix wasn't taking effect even though the page reported b147.
- 🛠 **Fix:** every static + dynamic ESM import specifier in `src/**/*.js` now carries `?v=148` (46 specifiers across 13 files). A `?v=` bump on a release now propagates through the entire module graph on the next load — no stale-module window.
- 🤖 **`bump-version.sh`** added so this self-maintains: one command bumps `build-info.js`, `index.html`, AND every module import in lockstep, then verifies nothing was left behind and fails loudly if it finds a bare import. `CLAUDE.md` updated — the cache-buster now lives in three places, not two.

No gameplay changes. This is purely "make deploys reliable," which matters a lot once beta testers are updating on their own.

## v0.9.1-beta build 147 — 2026-08-07 (Cloud restore fix — saves now actually load back)

b146 fixed cloud saves *writing*; live-testing the round-trip in a real signed-in session surfaced why it still felt like "nothing saves": **the cloud snapshot was never restored on sign-in.** Two symptoms, one root cause.

- 🚨 **Cloud restore never fired.** The sign-in restore gate in `auth.js` compares `snap.totalLevel` (cloud) against `G.totalLevel` (local) and restores if cloud is higher. But **`G` has no `totalLevel` field** — the in-game "Total Level" is summed from your skills by `getTotalLevel()`, never stored on `G`. So both sides read `undefined → 0`, the gate was permanently `0 > 0 = false`, and the cloud save was fetched then silently discarded. Cross-device play and fresh-login restore both failed. Fixed the gate to compute local level via `getTotalLevel()`.
- 🏆 **Leaderboard `total_level` was always null.** Same missing field: `game_saves.total_level` is a generated column reading `snapshot->>'totalLevel'`, which was never in the snapshot. The snapshot now stamps `totalLevel` at save time (via a provider wired through the sync config), so the column populates and the leaderboard can finally rank.
- ✅ **Verified end-to-end in a live signed-in session:** save writes the full 14-key state (HTTP 200), `total_level` generates correctly (26), and `pullLatest()` reads it back. 🧪 **+3 regression tests.**

## v0.9.1-beta build 146 — 2026-08-07 (P0 cloud-save fix + beta launch blockers)

Picking the beta prep back up. Cleared the code-side launch blockers from `BETA_PREP.md` — and while verifying the live auth stack, found a **P0 bug that has been silently eating every player's cloud save.**

- 🚨 **P0 — Cloud saves were 404ing into the void.** `auth.js` pointed the snapshot endpoint at a table called `game_snapshots`, but the table created by `SUPABASE_SETUP.md` (and used by the leaderboard) is named **`game_saves`**. Every 60-second cloud save POSTed to a non-existent table and got a 404 — no player's progress ever reached the cloud via the snapshot path. Local saves still worked, so it was invisible in solo testing. Two more latent bugs in the same path, found by reading the real table schema:
  - The payload never sent `slot`, which is a `NOT NULL` column → the insert would have failed even with the right table name.
  - It used a plain insert, but `game_saves` has `unique (user_id, slot)` → every save after the first would 409. Now upserts via `resolution=merge-duplicates` + `on_conflict=user_id,slot`.
  - 🧪 Extracted a pure `buildSnapshotRequest()` and added **2 regression tests** guarding the table name, the `slot` field, and upsert semantics so this can't silently regress again.
- 🛠 **Sentry crash reporting is live.** Pasted the real project DSN into `src/observability.js`. Beta crashes now report to Sentry, tagged with build/environment and player context (active skill, gold, kills). Was `null` before — every crash would have been lost.
- 🔗 **Real Discord invite wired in.** Replaced the `discord.gg/your-invite-here` placeholder in `src/beta-banner.js` and `src/settings-page.js` with the live invite. The beta banner "Join Discord" button and the settings-page link now go somewhere real.
- ✅ **Verified live auth stack health** on the deploy: Supabase client bootstraps, the Skypack CDN import (the flagged "signup could break globally" P1 risk) resolves fine, signup form renders, and `profiles` being anon-readable is intentional (documented in SUPABASE_SETUP.md for leaderboard/chat names).

**Still on Tyler before inviting testers:** confirm the cloud-save fix end-to-end (sign in → play 1 min → reload → progress persists), verify Supabase RLS on `game_saves`/`game_events`, and run one full signup round-trip. PWA install treated as a known limitation, not a blocker.

## v0.9.1-beta build 145 — 2026-05-09 (Tier 4-6 content reachability fix — 3 orphan drops suppressed)

Walked the gated-content chain for every recipe scroll that drops in production. 6 of 9 scrolls are fully wired (chief_blade_recipe, captain_recipe, alpha_pattern, soul_recipe, marrow_cookbook, field_cookbook). The other 3 are orphans:

- `spellstone_diagram` (drops from lich T6 boss @ 1%) — unlocks `spellstone_ring`, which is **not defined in ITEMS**, and the recipe doesn't exist in ARTISAN_RECIPES.
- `dragon_marrow_recipe` (drops from dragon T6 boss @ 1%) — unlocks `dragonbone_spear`, same problem.
- `gemcutter_note` (drops from dragon T6 boss @ 0.5%) — unlocks `dragon_gem_earrings`, same problem.

A player who killed the dragon and got `gemcutter_note` would inspect it (sees "Gemcutter's Note — recipe: dragon_gem_earrings") and… nothing happens. Pure dead-end. All three were on Tyler's "Phase B" list per a comment we found, but the drops shipped without the items.

- 🧹 **Suppressed the 3 orphan drops** in `src/legacy.js` (~line 6448) with a clear "re-enable when items + recipes ship" comment. The 6 wired scrolls still drop normally, so players can complete those craft chains end-to-end.
- 📋 **Updated `BETA_PREP.md` §6** with the full reachability table + remaining Phase B work list.

**Sanity check:** the gated weapons (chief_blade, captains_ribblade, alpha_cloak) ALSO drop directly from their corresponding T5-6 mobs at 1-1.2%, so the recipe-scroll path is the deterministic crafting alternative; direct drops are the lottery. Both paths are intact for the 6 wired scrolls.

## v0.9.1-beta build 144 — 2026-05-09 (Beta launch prep — observability hygiene + audit doc)

Code-only audit pass on cloud / observability / PWA paths in prep for Friday beta. Found a few P0/P1 things — most need Tyler manually (Sentry DSN paste, Supabase RLS verification, real-device PWA install). Fixed the items that don't need his dashboard access, bundled findings into `BETA_PREP.md`.

- 🛠 **Observability release tag is now dynamic.** Was hardcoded `'hearthrise@0.4.0'` (stale by 5 minor versions). Now derived from `window.HearthriseBuild.version` + commit suffix → `'hearthrise@0.9.0-beta+<sha>'`. Stays in sync forever, no more manual bumps.
- 🛠 **Environment auto-detected from `BUILD.channel`.** `dev` / `beta` / `production` flow through to Sentry tags automatically. Was always `'dev'`. Now matches build-info.js.
- 🛠 **`tracesSampleRate` configurable via `HEARTHRISE_OBSERVABILITY`.** Was hardcoded 0.05 in Sentry.init; ignored any override. Now reads from CONFIG. Default still 0.1 in DEFAULTS but Tyler can override per-environment.
- 📋 **`BETA_PREP.md`** added — audit findings + 8 manual tests Tyler needs to run before launch (RLS verification, real-device PWA install, signup round-trip, etc.). Things I literally can't do because they need real accounts / phones / Supabase dashboard access.

**Things still on Tyler's plate (per BETA_PREP.md):**
1. Paste a real Sentry DSN into `src/observability.js` line ~31 — without this, beta crashes go uncaptured.
2. Replace `DISCORD_INVITE` placeholder in `src/beta-banner.js` and `src/settings-page.js` with the real invite URL.
3. Verify Row-Level Security policies on every Supabase table players write to.
4. Real-device PWA install test on iPhone + Android.
5. Throwaway-email signup → save → reload → restore round-trip.

## v0.9.1-beta build 143 — 2026-05-09 (b142 hotfix — FTUE timing race + step-5 copy)

The b142 banner-stacking fix was correct in isolation but lost the timing race against FTUE on a real cold load. Walked the live deploy in fresh-tab state and confirmed: FTUE renders ~2s after boot, my banner check fires at boot+1.5s, finds no FTUE in DOM yet (because it hasn't rendered), shows banner, then FTUE stacks on top. Cosmetic only — both modals are dismissible — but it's the FIRST thing a beta tester sees.

- 🌱 **Beta banner now defers entirely while FTUE is pending.** Check `localStorage.hearthrise:ftue:completed`. If not `'1'`, FTUE will fire on this load — skip the banner. Player completes (or skips) FTUE → flag flips → banner shows on next reload. FTUE already covers "welcome to the game," so the banner becomes a clean "remember this is beta" follow-up instead of competing on first paint.
- 🪧 **FTUE step 5 copy fix.** Was: "Right-click any item to bury bones, eat food, plant seeds, smelt ore, or sell." But the b140 right-click context menu doesn't have plant or smelt actions — those happen via Activities and Farm. New copy: "Right-click any item to equip, eat, bury bones, inspect, or sell. Hover to compare gear vs what you have on." Matches what `inv-context-menu.js` actually offers.
- 🧪 **1 new regression test** for the FTUE-defer logic.

**FTUE walkthrough findings (post-b143):** all 6 steps render correctly with sidebar highlighting (Profile → topbar → Activities → Combat → Inventory → Wrap). Copy is decent. Final state is clean — no smoke-test btn, no leftover modals, fresh save shows reasonable starting numbers (500g, 24 TL, 3 CL, "Defeat 5 monsters" first quest). FTUE is beta-ready.

## v0.9.1-beta build 142 — 2026-05-09 (b141 hotfix — FTUE walkthrough findings)

Walked the live deploy in incognito-equivalent state (cleared localStorage on a fresh tab) and immediately found two issues from b141 that don't reach via solo testing:

- 🪟 **P0 — Beta banner stacked under FTUE on first load.** New players load → FTUE tour fires → my beta banner ALSO fires because its `modalAlreadyOpen()` guard checked for `#ftue-overlay.show` which doesn't exist. Real FTUE DOM uses `.ftue-shade.show` + `.ftue-card.show`. Banner is now correctly suppressed when any flavor of FTUE/welcome modal is up.
- 🧪 **P1 — Smoke-test 🧪 button still visible on first non-admin load.** Source on the deployed file has the admin gate, but `smoke-test.js` is loaded as a static ESM import without a `?v=` query, so browsers serve it from HTTP cache for up to 10 minutes after a deploy. (The exact `ESM module cache-buster gap` we logged in the ROADMAP backlog after b135.) Defense-in-depth: `beta-banner.js` is a brand-new file in b141, so it's always freshly fetched. It now actively kills `#smoke-test-btn` for non-admin players a few times during startup + once a second for the next 10s. Any cached old smoke-test.js that adds the button gets the button stripped right back off.
- 🧪 **2 new regression tests:** BetaBanner suppresses while a `.ftue-shade.show` is up, and the smoke-test button auto-removal logic clears the button when the admin flag is off.

**Walkthrough notes:** new-save start state looks reasonable — 24 TL, 500 gold, 0 gems, 3 CL, "Defeat 5 monsters" first quest. Sign-in button visible top-right. Pencil rename icon visible on the Adventurer card. I'll continue the FTUE walkthrough after this hotfix lands.

## v0.9.1-beta build 141 — 2026-05-09 (Beta launch prep — disclaimer + admin gating)

Cheap-but-high-leverage things that need to land before the beta cohort hits the live URL. None of these are gameplay changes — they're "make the live deploy presentable and feedback-collecting" plumbing.

- 🌱 **First-time beta disclaimer modal** (`src/beta-banner.js` → `window.HearthriseBetaBanner`). New players see a one-time modal explaining: this is beta, things will break, your save lives in your browser, here's the Discord. Returning players (anyone with kills/gathered/harvested > 0) are auto-acked silently — they shouldn't be greeted as new arrivals. Admin players never see it. Esc or "I understand" closes it forever for that browser. Discord invite is sourced from the same `DISCORD_INVITE` placeholder as `src/settings-page.js` — Tyler updates it in two spots when the real invite is ready.
- 🧪 **Smoke-test 🧪 button is now admin-only.** The floating dev button at bottom-left was visible to everyone, looked confusing, read as "is something wrong?" to a non-tester. Gated behind `localStorage.hearthrise:admin === '1'` (the same flag `src/admin.js` uses). Ctrl+Shift+T still works for everyone, so beta testers can still trigger the suite when asked.
- 🧹 **Hearthbound rename audit clean.** Grep'd all of `src/`, `assets/`, and `index.html` — zero stale references. Smoke test now asserts `window.HearthriseBuild` and `document.title` contain no "Hearthbound" so a future regression can't sneak the old name back.
- 🧪 **4 new regression tests:** BetaBanner API + DOM hookup, ack flag round-trips through localStorage, smoke-test button gate (soft check), no Hearthbound brand drift in build identity.

**Beta launch checklist remaining (see my pre-beta list in conversation):** real-device mobile pass (still needs Tyler's phone), new-account signup→save round-trip verification, FTUE walkthrough on a clean save, content-depth pass for Tier 4-6, Sentry sample-rate audit. None of these block today's b141 — they're upcoming batches.

## v0.9.1-beta build 140 — 2026-05-04 (Batch E — Inventory QoL: right-click menu + Sell-junk)

Most of Batch E was already shipped — the existing `item-ux.js` has the hover tooltip + stat compare + qty slider, and `renderInvNew()` has search / sort / filter / category chips / bulk-select / sell-selected. The two real gaps:
1. Right-click on a singleton (e.g. equipped weapon, single armor piece) did nothing — `item-ux.js`'s qty slider only fires for stacks ≥2. Players expect a context menu.
2. Bulk-selling junk required entering Select mode and tapping every stack individually — slow even for moderate cleanup.

This build closes both:

- 🖱 **#23 — Right-click context menu on every inventory tile.** New module `src/features/inv-context-menu.js` exposes `window.HearthriseInvCtx`. Right-click any bag tile or paper-doll slot (or long-press on touch) → contextual menu. Menu options are item-type-aware:
  - **Equippable** (weapons/armor/jewelry/companions/ammo) → Equip / Inspect / Sell 1 / Sell N
  - **Food** (anything with `heals`) → Eat / Set as auto-eat food / Inspect / Sell 1
  - **Bones** (anything with `buryXp`) → Bury / Inspect / Sell 1 / Sell N
  - **Equipped paper-doll slot** → Unequip / Inspect
  - **BoP items** → no Sell options surfaced (bone keys, hearth tokens, blueprints stay safe)
  - **Empty slot** → "Empty slot — drag an item here to equip" disabled hint
  Closes on outside-click, Escape, or selection. Listens in capture phase to suppress item-ux.js's existing qty-slider so the player gets the new menu instead.
- 🧹 **🧹 Sell junk button in the inventory toolbar.** `HearthriseInvCtx.sellJunk(threshold)` finds every safe-to-sell stack (excludes BoP, food, gear, recipe scrolls, blueprints, items with v≤0), shows a confirm dialog with total stacks/items/gold, then liquidates. The toolbar button shows the candidate count (e.g. "🧹 Sell junk (8)") and hides itself when the bag is clean. Threshold is per-stack-item-value capped at 50g by default; later we can let the player tune it.
- 🧪 **5 new regression tests:** API surface + DOM menu element, options are type-aware (Equip / Eat / Bury / no-Sell-for-BoP), equipped slot offers Unequip, selectJunk respects all safety filters (BoP / food / gear / recipe scrolls), HearthriseInvCtx.open() populates the menu DOM.

**Architecture note:** The new menu listens in capture phase (`addEventListener('contextmenu', fn, true)`) so it runs BEFORE item-ux.js's bubble-phase listener, then calls `stopImmediatePropagation()` to suppress the old qty slider. The "Sell N…" option still defers to item-ux's slider (or falls back to the detail flyout) — single source of truth for that UX.

## v0.9.1-beta build 139 — 2026-05-04 (QA sweep fix batch — function over polish)

First fruit of the QA engineering sweep. The b137 data-integrity check (which I'd just unbroken in this session) immediately flagged a structural bug that had been latent for many builds: 26 items defined in `src/legacy.js`'s Phase A.1 NEW_ITEMS block were missing from `src/data/items.js`. Because main.js does `Object.assign(window, {ITEMS})` AFTER legacy.js runs, the ESM ITEMS overwrote the legacy version and 26 entries became `undefined` at runtime. Recipes that produced or consumed them silently failed — meaning the entire smelting (bronze/steel/rune bars), cooked-meat (wolf/panther/bear), buff-food (vegetable_stew, hunters_feast, dragon_stew, lich_soul_soup, void_banquet, bear_claw_pie), and gated-recipe-scroll chains were dead. This batch heals all of that.

- 🔧 **§1.1 P0 — Mirrored 26 missing items into `src/data/items.js`** with a header comment explaining the drift cause + how to keep both files aligned.
- 🔧 **§1.1 P0 — Mirrored Phase A.1 recipes into `src/data/recipes.js`.** Cooking gained 13 new recipes (combat-meat chain + buff foods + gated tier-3). Smithing gained `smelt_bronze` + `smelt_steel` + `smelt_rune` and the gated chief/captain forges; existing forge_steel_*/forge_rune_* recipes were updated to consume the new bars (was using `iron_bar+coal` as a steel substitute). Crafting gained carved bows/staves, tailored leather, jewelry, and the gated alpha cloak. **34 → 47 recipes total.**
- 🔧 **§2.1.1 + §2.1.2 P1 — Profile display name + rename pencil for cloud users.** Cloud-signed-in players were seeing `themphill22+1` (email username) as their public display name AND the rename pencil from Batch D was hidden for them. Now: Profile prefers `G.playerName` when set, falls back to `user_metadata.display_name` then email-username only as a last resort. Rename pencil is available for all account states, and `setDisplayName` updates `G.playerName` so cloud sync round-trips it.
- 🔧 **§2.3.1 + §2.6.1 P1 — Dropped the truncated 3-char paper-doll labels** (`Hel/Nec/Cap/Bod/Bel/Com` etc.) on Combat and Inventory slots. They read as random strings rather than slot names; the slot icon + tooltip already convey the meaning.
- 🔧 **§2.8.1 P1 — Farm plots now render 2×4 instead of 1×8** on wide viewports. The old `.farm-mini` rule used `auto-fit minmax(46px,1fr)` with `!important`, which overrode my Batch C inline `repeat(4,1fr)`. Pinned to `repeat(4, ...)` directly in the CSS so plots are always 2 rows of 4, regardless of viewport width.
- 🔧 **§2.1.3 P2 — Today's Progress card now uses a 3-column grid** instead of the default 2-column `.kpi-row`. Six KPIs (XP, Gold, Kills, Gathered, Harvested, Deeds) fit cleanly in 2 rows of 3 instead of forcing internal scroll.
- 🧪 **5 new regression tests:** Phase A.1 items present in window.ITEMS, ITEMS divergence count = 0, Phase A.1 recipes registered in ARTISAN_RECIPES, Profile rename pencil renders for all account states, paper-doll empty slots have no truncated `<small>` label.
- 📋 **`QA_FINDINGS.md`** added — full audit log with severity/surface/triage tags so the next sweep can pick up where this one left off. P3 polish nits are all logged for a future polish-only batch (per Tyler: function over polish for this round).

**Architecture note:** Per Tyler's principle "Single source of truth," `src/data/items.js` and `src/data/recipes.js` are now authoritative. The Phase A.1 NEW_ITEMS / NEW_RECIPES blocks in legacy.js are still present but their `if(!ITEMS[k])` and `if(!has(skill, id))` guards mean they're now no-ops (the ESM versions get there first). They can be deleted in a follow-up cleanup batch once we verify nothing else references the local consts.

## v0.9.1-beta build 138 — 2026-05-04 (Batch D — Profile launchpad)

The Profile is the first thing every player sees on each session, and it was mostly read-only. Batch D turns it into a launchpad — players can resume what they were doing, see today's progress at a glance, know exactly what they're working towards next, and rename themselves without diving into Settings.

- ▶️ **#1 Resume last activity.** Stopping a skill or combat now records `G.lastActivity` (kind + id + timestamp). When the Profile's "Current Activity" card has nothing live, a green "Resume training: Mining" / "Resume fighting: Slime" banner appears with a single Resume button. Re-entering a tab and starting something new clears the banner — no friction for players who switched intentionally.
- 📊 **#2 Today's progress card.** New `dash-today` card sits between Profile and Current Activity. Shows XP gained, gold earned, kills, gathered, harvested, and deeds dropped — all since local midnight. Baseline is captured automatically on the day's first interaction. "Quiet day so far" sub-text when nothing's happened yet.
- 🎯 **#3 Next milestone card.** New `dash-milestone` card highlights the closest finish line: either the skill nearest its next level, or the most-progressed open quest. Click it to jump to that skill's detail panel or open the quests modal. Gives sessions a clear focus.
- ✏️ **#5 Editable display name.** Pencil icon next to the player name on the Profile card. Click → prompt → set. Hidden when signed in to a cloud account (those names sync via Settings → Account so the cloud profile stays canonical). Names are clamped to 24 chars; whitespace-only names rejected.
- 🆕 **`src/features/profile-launchpad.js`** — `window.HearthriseLaunchpad` API: `recordStop`, `getResumePayload`, `resume`, `ensureDailySnapshot`, `getTodayDelta`, `getNextMilestone`, `setDisplayName`. Single source of truth — `renderProfile`, `stopSkill`, and `stopCombat` all call through this API, no state-poking.
- 🗄 **Schema v4 → v5 migration** in `src/save-migrations.js` — adds `G.lastActivity` (defaults to null) and `G.daily.snapshot` (initialised to today's current numbers so existing players don't see a giant "Today" delta on first reload — they correctly start from zero). Idempotent.
- 🧪 **8 new regression tests:** API surface, recordStop writes lastActivity, getResumePayload null-without-activity, returns valid payload for known skill, hides while activity is live, getTodayDelta tracks gold/kills + clamps spent-gold to zero, getNextMilestone returns a target, setDisplayName clamps to 24 chars + rejects whitespace.

**Architecture note:** stopSkill/stopCombat capture `G.activeSkill`/`G.activeMonster` BEFORE nulling them so the launchpad gets the right id. The launchpad's getResumePayload self-hides when something's already running, so the Resume banner never competes with a live activity.

## v0.9.1-beta build 137 — 2026-05-04 (b136 hotfix — items.js divergence + data-integrity meta-bug)

The b136 deploy was incomplete: `farm_deed` got added to the inline `ITEMS` const inside `src/legacy.js` but NOT to `src/data/items.js`. `main.js` does `window.ITEMS = ESM_ITEMS` after legacy.js runs, so the ESM version wins — and it didn't have `farm_deed`. Live result: `window.ITEMS.farm_deed` was `undefined`, the b136 smoke test for that field would have failed, and the deed-drop hooks would silently fail when they tried to grant the item.

- 📜 **`farm_deed` added to `src/data/items.js`** — the ESM source of truth. Mirrors the legacy.js entry exactly.
- 🛡 **Fixed the data-integrity check itself.** It was comparing `window.ITEMS` to the imported `ESM_ITEMS` — but by the time the check ran, main.js had already overwritten `window.ITEMS` with `ESM_ITEMS`, so it was comparing the ESM module to itself. Always reported "in sync." This is exactly why the b136 divergence shipped silently. Fix: legacy.js now publishes its inline ITEMS as `window.__LEGACY_INLINE_ITEMS` before main.js runs, and the integrity check now compares the snapshot against the ESM module — actually catching divergence.

If you've already loaded the b136 deploy, the b137 cache buster + service-worker killswitch will pull fresh files on the next reload. The data-integrity check will now log a console warning + Sentry capture if any future ITEMS divergence ships.

## v0.9.1-beta build 136 — 2026-05-04 (Batch C — farming + housing-gated crops)

The big one Tyler asked for last session: crop unlocks gated by Farm Plot tier, and the upgrade currency is a drop from gameplay (NOT bind-on-pickup, tradable on market).

- 🌾 **Housing-gated crop progression.** New `G.plotLevels` integer (1..5) controls which crops you can plant. Defaults to Lv 1 (Turnip-only) — matches the existing pre-deed gameplay so nothing breaks for current players. Each tier above 1 unlocks more crops:
  - Lv 1 → Turnip
  - Lv 2 → + Carrot, Wheat (1 deed)
  - Lv 3 → + Potato, Tomato (3 deeds)
  - Lv 4 → + Pumpkin (5 deeds)
  - Lv 5 → max (8 deeds, future-proofed for new crops)
- 📜 **Farmer's Deed (`farm_deed`)** — new tradable item, value 250g, NOT bind-on-pickup. Drops from:
  - Tier-2+ mob kills at **0.1%**
  - Bounty completions at **0.5%**
  Tier-1 mobs intentionally don't drop deeds — early game stays pure-progression and bounties cover all tiers.
- 🏗 **House → Plot tab** now shows a "Farm Plot · Lv X/5" card at the top with current deeds, the next tier's new crops, and a "Spend N Deeds" button.
- 🌱 **Farm panel** now shows: plot level + deed count + auto-replant status, a **Plant all** button (fills empty plots with the configured/best seed), an **Auto-replant** toggle, and an Upgrade Plot deep-link. The crops guide and seed picker label locked-by-plot crops with a deep-link to the upgrade card. Locked-by-skill stays separate (existing behavior).
- 🔁 **Auto-replant engine** (`HearthriseAuto.maybeReplant`) is now real (was a Batch C stub in b133). Hooked into `harvestPlot()` so a non-regrowing crop auto-plants the configured seed if you have one. Respects plot-level + farming-level gates.
- 🆕 **`src/features/farm-progression.js`** — `window.HearthriseFarm` API: `getPlotLevel`, `getPlotUnlockedCrops`, `canPlantCrop`, `getDeedsRequiredForNextLevel`, `getDeedCount`, `upgradePlot`, `rollKillDeed`, `rollBountyDeed`, `MAX_LEVEL`. Single source of truth for the housing gate — `plantCrop`, `openSeedPicker`, `renderFarm`, `renderHouse` all call through this API instead of duplicating logic.
- 🧪 **9 new regression tests:** API surface + farm_deed not-BoP, Lv 1 unlocks turnip-only, upgradePlot spends deeds + advances level, refuses without enough deeds, plantCrop respects the gate, maybeReplant plants on empty plots, maybeReplant skips locked crops, Tier-1 kills never drop deeds, plotLevels migration default holds.
- 🗄 **`snapshotG()` extended** to include `plotLevels`, `autoActions`, and `dropLog` so Batch B/C tests no longer leak state into the player's save when the suite runs.

**Architecture note:** all gating defers to `HearthriseFarm.canPlantCrop()`. If the script hasn't loaded yet (race), code falls back to "turnip-only" — same as the migration default, so behavior is consistent. The deed drop is centralised in `farm-progression.js`'s `rollKillDeed`/`rollBountyDeed` so balance changes touch one place. Farmer's Deed sits in ITEMS without `bop:true` — Tyler's explicit ask for tradability.

**Backlog addition:** logged the ESM HTTP-cache gap we hit verifying b135 — see ROADMAP "ESM module cache-buster gap". Recommended fix is versioned static imports, S-sized.

## v0.9.1-beta build 135 — 2026-05-04 (b133 test hotfix — green-bar discipline)

The b133 drop-log regression test that landed in b133 had a bug *in the test itself*: it asserted `after.kills === stats.kills + 1` but `stats` and `after` are both live references to the same entry on `G.dropLog`, so by the time the assertion ran, `stats.kills` already reflected the post-second-call value. Implementation was always correct; the test was wrong.

Why it slipped through earlier verifies: the test depends on running order — depending on what kill state `__test_monster__` had from previous suite runs, the equation `2 === 2 + 1` only fails on a fresh state. b134's verify caught it.

- 🧪 **Fixed** by capturing `stats.kills` and `stats.drops.test_drop` as primitives before the second `recordKill`, plus deleting the synthetic monster entry first so the test is deterministic regardless of prior runs.

This is hotfix-sized so it ships standalone before Batch C — keeps the suite green commit-to-commit per the engineering principles.

## v0.9.1-beta build 134 — 2026-05-04 (Batch B — auto-eat + train-to-level)

First user-visible features off the b133 foundations. Two idle-game essentials:

- 🍖 **#7 Auto-eat at HP threshold.** `HearthriseAuto.maybeAutoEat()` is called from the live combat tick AND offline catch-up. Reads config from `G.autoActions.eat` ({enabled, threshold, foodId}). When HP fraction ≤ threshold, eats one food (configured `foodId`, or falls back to the highest-`heals` food in bag), heals, decrements inventory, pushes a log line. The pre-roadmap inline auto-eat code was redirected through this engine — single source of truth. Existing food-slot dropdown in the loadout panel now syncs both `G.foodSlot` (legacy) and `G.autoActions.eat` (new).
- 🎯 **#15 Train-to-level-X auto-stop.** `HearthriseAuto.maybeStopTraining()` hooks into `addXp()`'s level-up branch. When the active skill matches the configured goal AND the new level meets/exceeds the target, the skill auto-stops with a `🎯 Cooking Lv 8 reached — auto-stopped` toast. The engine self-disables after firing so re-starting the same skill doesn't immediately stop again. New "Stop at Lv [_]" checkbox + number input live in the activity-detail header for each skill.
- 🗄 **Migration v3→v4 extended** to backfill `G.autoActions.eat` from the legacy `G.foodSlot` / `G.autoEatPct` fields. Existing players' setups carry over: if they had a food slot set, auto-eat is automatically enabled with that food at their previous threshold.

**Discoverability:** auto-eat surfaced in the existing loadout food picker, train-goal surfaced in the activity panel header. Both can be enabled/disabled inline without going to settings.

**5 new regression tests:**
- maybeAutoEat heals + decrements food when below threshold
- maybeAutoEat is a no-op when disabled
- maybeAutoEat falls back to best food in bag when no foodId set
- maybeStopTraining stops active skill at goal level + self-disables
- maybeStopTraining ignores non-matching skill (Cooking goal doesn't stop Mining)

**Architecture note:** `combatTick`'s inline auto-eat path is preserved as a defensive fallback (in case `HearthriseAuto` hasn't loaded yet — script-order safety). When the new engine is present, it takes priority. The legacy `G.foodSlot` / `G.autoEatPct` fields are kept in sync for backward compat with the existing UI; a future cleanup batch can deprecate them.

## v0.9.1-beta build 133 — 2026-05-04 (Batch A — enhancement roadmap foundations)

Tyler approved a 34-item enhancement roadmap + a new design ask: housing-gated farm progression where the upgrade currency drops from gameplay (bounty completions + tier-2+ mob kills, tradable on the market). Full plan lives in [`ROADMAP.md`](./ROADMAP.md). 11 batches, A through K. This build is **Batch A — foundations only, no user-visible features**. Sets up the plumbing every later batch needs so we don't have to retrofit it.

**Architecture-first.** API contracts written in comment blocks BEFORE feature code. Other batches must call through these APIs, not poke the underlying state directly. Single source of truth per system.

- 📜 **`ROADMAP.md`** added — single source of truth for the roadmap, principles, sequencing, housing-gate spec, auto-action engine spec, drop-log spec, and the items NOT in scope (so we don't accidentally re-add them).
- 🤖 **`src/features/auto-actions.js`** — new module exposing `window.HearthriseAuto`. Holds the config for auto-eat (Batch B), train-to-level (Batch B), and farm auto-replant (Batch C). Engine hooks (`maybeAutoEat`, `maybeStopTraining`, `maybeReplant`) are b133 stubs returning `false` — Batch B/C fill them in. Persistence is debounced into `saveLocal()` so settings survive reload.
- 📊 **`src/features/drop-log.js`** — new module exposing `window.HearthriseDropLog`. Records every monster kill + which drops actually rolled. Wired into `legacy.js`'s `killMonster` so it captures real combat data starting now. Batch F (b138) will render this in the monster preview modal.
- 🗄 **Schema v3 → v4 migration** in `src/save-migrations.js` — adds `G.autoActions`, `G.dropLog`, and `G.plotLevels` (the housing-gate counter Batch C will use) with safe defaults. Existing saves load unchanged. Idempotent: re-running the migration is a no-op.
- 🧪 **5 new regression tests** asserting the API surface, round-trip persistence, drop-log accumulation, migration applied, and `killMonster` integration without throws.

**No visible behavior change in this build.** Smoke test should pass green. Next session: Batch B (b134) — auto-eat at HP threshold + train-to-level auto-stop.

## v0.9.1-beta build 132 — 2026-05-04 (user-story playthroughs — round 4: mobile polish)

Cleared three of the queued mobile findings from b131's playthrough notes.

- 📊 **Topbar declutter on mobile.** Total Level, streak badge, status pill, notif bell, Save button, Settings button — all hidden under 540px viewport width. Players still get them via the MORE menu (where Save / Settings already live). The visible topbar is now: avatar + name + Quests pill + CL + Gold + Gems. Fits without clipping.
- 📜 **Quests modal collapses to single column on mobile.** The `.qm-body` grid was `1fr 280px` (quest list + summary sidebar) which on a 380px screen left the quest list cramped and titles wrapped mid-word. Mobile rule: `grid-template-columns: 1fr`, hide the sidebar entirely (the daily/weekly badge counts in the modal header already convey that info), and stack each quest card's reward column below the name instead of beside it. Titles now read normally.
- 🔍 **Market search persistence — investigated, not a bug.** "log" persisted across sessions because the market intentionally saves search/sort state to `localStorage:hearthrise:market:ui`. That's standard marketplace UX — players want their last search to stick. Striking the finding.

**Regression tests added** for the topbar declutter (no notif/save/settings visible at ≤540px) and quest modal columns (qm-body should be ≤1 grid column on mobile).

## v0.9.1-beta build 131 — 2026-05-04 (user-story playthroughs — round 3: mobile polish)

Continuing the mobile playthrough. Two more focused fixes for stuff a real player would hit on first launch.

- 🗺 **"Pick a monster on the left to begin." was wrong on mobile.** On mobile the combat layout has FOES as a sub-tab, not a left column. The empty-state text now reads `"Pick a monster from FOES to begin."` when `innerWidth ≤ 540`, otherwise the original "left" text.
- 🛍 **"← Back to Market" button overlapped the "PREMIUM STORE" title on mobile.** Title text and back button shared the same horizontal slot. On mobile, players reach Store via MORE → Store anyway (not Market), so the button was misleading there. Hidden on `innerWidth ≤ 540`; mobile players use bottom-nav / MORE menu to navigate. Same treatment for the "← Back to Combat" button on the Dungeons panel.

**Findings still queued for next round** (catalogued during this walk, not in this commit because the fix is bigger than a one-liner):

- Quest cards on mobile wrap titles mid-word ("Cook 5\ndishes") — card layout assumes wider viewport
- QUEST INFO summary overlaps the quest list scroll area when both visible
- Topbar currency pills clip past the right edge — only "50" visible from "500 GOLD" — horizontal-scroll fallback isn't kicking in
- Premium Store card stack pushes the In-Game Shop section below the fold; needs a sub-tab strip
- Market panel preserves "log" search across sessions — should clear on tab open

## v0.9.1-beta build 130 — 2026-05-04 (user-story playthroughs — round 2: quests + mobile)

Continued the playthrough series. Two more real bugs surfaced + fixed.

- 📜 **Daily quests modal showed "No daily quests" forever** even when `G.dailyGoals.picks` had 3 picked goal IDs. The modal calls `window.getGoalsForToday()` to expand picks → goal objects, but the function was a top-level declaration in `legacy.js` that never reached `window` from inside the modal IIFE. Same exact failure mode as `hoursTillUTCMidnight` from b127 — ironically, fixed by literally the same one-liner: `window.getGoalsForToday = getGoalsForToday;`.
- 📱 **Mobile skill tile click had zero visible feedback.** On desktop, `#skill-detail` renders side-by-side with the skills sidebar. On mobile (single-column), the detail stacks BELOW the sidebar — clicking Woodcutting renders the tree tiles 460+ pixels down, off-screen. Players thought the tile didn't work. **Fix:** when `openSkillDetail` runs at `innerWidth ≤ 540` (or landscape phone), `requestAnimationFrame` + `scrollIntoView({behavior:'smooth'})` brings the detail into view immediately.

**Regression tests added** for both — `getGoalsForToday` exposed on window, and `openSkillDetail` doesn't throw when called.

**Other findings catalogued during this round (queued for follow-up rounds):**

Mobile (Story 1–5 walks):
- M.4 / M.7: Topbar currencies clip at the right edge on narrow viewports — only "50" visible from "500 GOLD"
- M.6: "Pick a monster on the left to begin." text — there is no "left" on mobile (single column)
- M.3: "DUNGEONS" red button cuts in half between Combat sub-tabs and content
- Activity tile product icons missing on first render (already noted desktop, confirmed mobile)
- "QUESTS 0" pill takes a lot of horizontal space in the topbar on mobile

Desktop (Story 4 + 5):
- 4.1 Daily quest claim flow needs end-to-end verification once quests render (now that getGoalsForToday is wired)
- 5.1 Store hidden in sidebar on purpose — accessed via Market panel — but the entry point in Market should be more prominent
- 5.5 Buy flow works cleanly: gold debits, inventory increments, topbar updates, toast fires

## v0.9.1-beta build 129 — 2026-05-04 (user-story playthroughs — round 1)

Tyler asked for "play the game with intent" instead of "verify the panel rendered." First pass on desktop turned up real bugs the smoke test was never going to catch. Two fixes shipped here, full findings list queued for follow-up rounds.

**Bugs surfaced + fixed:**

- 🪓 **Skill tile emoji icons were invisible.** `legacy.css:2108` forces `font-size:0 !important` on `.sicon` (and `.icon`, `.mi`) on the assumption that an `<img>` child would always be present. After the b122 cleanup that emptied `_skillIcon` to fall back on emoji glyphs, the spans had nothing to render. **Fix:** new `theme-cozy.css` rule using `:has()` to keep `font-size:24px` when the span has no `<img>` child. Restores the 🪓 ⛏ 🎣 etc. emoji glyphs across Profile dashboard, Activities sidebar, monster rows.
- 💀 **Locked activity tiles dead-clicked.** Clicking a recipe / tree / rock you don't have the level for did absolutely nothing — no toast, no tooltip, no feedback. Players assumed the tile was broken. **Fix:** locked tiles now toast `"Requires Smithing Lv 5"` (with the actual skill name + req level). Patched in three call sites: `activities-grid.js` (gather + artisan tiles) and the legacy.js duplicates.

**Regression tests added** for both — locked-tile onclick can't be empty, `.sicon` font-size can't be 0.

**Findings queued for follow-up rounds (not in this commit):**

Profile orientation: no FTUE for first-time players, "THEMPHILL22+1" placeholder name shows publicly, "Pick an activity" hint isn't a button, `Active Effects` empty states have no CTAs.
Activities: tree product icons missing on initial render (appear after first start), "Qty: 0" badge unlabeled, smithing recipes not sorted by level requirement.
Combat: monster preview numbers (`95% hit, 1-1 dmg, TTK 20.2s`) don't match live combat (`72%, 1-4 dmg, 339 kills/hr`), preview modal fade-in transient leaks the underlying UI, equipment slot 3-letter labels (`Hel`, `Wea`, `Glo`) look like junk, "Suggested for your level" duplicates monster-list content.
Save: smoke test pollution leaked +12,345 gold into the player save before the b128 fix landed (cleaned manually).

Mobile playthrough not yet done.

## v0.9.1-beta build 128 — 2026-05-04 (real save/load bug uncovered by the suite)

The b127 suite ran on the live deploy and dropped from 5 fails → 1 fail. That last failure was the save/load round-trip test, and digging in surfaced an actual correctness bug that's been latent forever:

- 💥 **`loadLocal()` orphaned `window.G`.** The function was doing `G = {...G, ...migrated}` — creating a brand new object and reassigning the module-scoped `let G`. But `window.G` was bound to the *old* object once at boot (line 2093), so after any runtime `loadLocal()` call, `window.G` pointed at stale data. Every feature that reads `window.G` (the bug-report module, smoke test, auth listeners, anything in a separate file) saw pre-load state. Fixed by switching to `Object.assign(G, migrated)` — same merge semantics, but mutates G in place so window.G stays valid.

This is the kind of bug that's almost impossible to catch by playing the game (loadLocal usually runs once at boot, before window.G is exposed) but trivially reproduces under test. Exactly why we wrote the suite.

- 🧪 **New regression test** — `b128: loadLocal preserves window.G reference identity` — pins the invariant directly so the issue can never silently come back via a future cleanup.

Expected suite result on b128: 73/73 passing.

## v0.9.1-beta build 127 — 2026-05-04 (senior QA sweep — fixes from the 50-test suite running on b126)

The b126 suite ran on the live deploy and turned up 5 failures: 1 real bug + 4 stale tests. Plus a deep manual QA pass found 4 more real bugs the suite hadn't covered. Everything below ships in one commit, each fix paired with a regression test.

**Real bugs surfaced by the test suite:**
- 🍳 **31 cooked-food / raw-meat / recipe-scroll items** were still pointing at `icons3/...` (which 404s on the deploy) via two more blocks I missed in b125 — `legacy.js:5346–5369` and `5890–5927`. Both gone. Items now fall back to their emoji glyphs (🦐 🥩 🥕 🍞 🥣 🍲 🥧 🍱 🥘 📜 etc).
- 🛒 **Market-listing test** was using a wrong API shape (`{itemId, qty, price}` object). Real API is `M.listItem(itemId, qty, askEach) → {ok, reason?}`. Test rewritten to match — now actually verifies escrow decrements inventory.
- 🌱 **Farm-plot test** asserted `plot.id === 'turnip'` — real field is `plot.cropId`. Fixed.
- 💾 **Save/reload test** used a synthetic `__testMarker` field that the save serializer strips. Switched to verifying `gold` round-trips with a distinctive offset.
- 🐺 **Companion equip test** asserted `G.companions.equippedId` — real field is `G.companions.equipped`. Fixed.

**Real bugs surfaced by the manual QA sweep:**
- ❤️ **Character page showed `HP: — / —`.** Renderer was reading `G.hp` + `window.getMaxHp()`, neither of which exist. Real fields are `G.playerHp` / `G.playerMaxHp`. Fixed in `character-page.js:110-117` with both as primary lookup + the old paths as fallback.
- 🪟 **Modals stacked.** Opening Quests, then clicking another Profile button, then clicking another, and so on left THREE modals open at once (`qm-overlay` z=999999, `ach-overlay` z=9998, `stats-modal` z=1500) — three different patterns with no shared close. Added `closeAllModals()` that handles every modal pattern (including the element-removal-based Quests modal). Wired into `showTab()` so navigating between tabs auto-dismisses anything open. **Escape key** now also fires it.
- ⏱ **Quests modal showed "Resets in ?h"** instead of a real countdown. `hoursTillUTCMidnight` was a top-level function declaration but didn't reach `window` from inside the modal IIFE. Explicitly assigned `window.hoursTillUTCMidnight`.
- 🎨 **Quests modal hard-coded to dark navy.** The rest of the UI is cozy-light parchment. Added theme-prefixed overrides in `theme-cozy.css` so the modal's background, borders, tabs, quest cards, close button all match the rest of the game.

**Snapshot helper extended.** `snapshotG()` now snapshots 16 fields (was 7) so player-action tests touching `companions`, `farmPlots`, `rooms`, `quests`, `clanName`, `skills`, `stats`, etc. can't pollute the player's save when restored.

**5 new regression tests added** (one per bug above) so any of these can never silently come back. Test count: ~75. Manual run via `Ctrl+Shift+T` or 🧪 button still under 1 second.

## v0.9.1-beta build 126 — 2026-05-04 (regression test discipline)

Tyler called out that the smoke test isn't being maintained — bugs we already paid for once are surfacing again because we fix things and never write a guard. Fair.

- 🧪 **Smoke test grew from 22 → ~50 tests.** Three new sections added.
- 🛡 **Regression suite for b119–b125.** Each historical bug now has a dedicated test that fails if the bug comes back: `renderProfile` null guard, skill icon emoji fallback, topbar avatar resolves, prof-toolbar hidden on mobile, feat-buttons grid on mobile, SW kill-switch present, no legacy snapshot refs, cache-buster matches `HearthriseBuild`, bug-report button rendered, Supabase config valid.
- 🖱 **Interactive click coverage.** Tests now click every bottom-nav tab, every sidebar nav, topbar buttons, profile feat-buttons, all 6 combat tier chips, sample monster rows, skill rows, activity tiles, inventory sub-tabs, house tabs, farm plots, bounty rows, stable cards, market sort/search, bug-report 🐛 button, and settings tabs. Catches "X stopped firing on click" silently.
- 🎮 **Player-action E2E tests.** Real loops: gain XP from a skill tick, equip + unequip a weapon, start + stop combat, plant + harvest a farm plot, upgrade a house room, create + cancel a market listing, purchase a listing, claim a daily quest, save + reload roundtrip, smelt a copper bar, equip + unequip a companion, join + leave a clan. Every test snapshots `G` and restores at the end — running the full suite 100x leaves the player's save byte-for-byte identical.
- 🗑 **Deleted ~85 more lines of dead `icons3/` paths** in `legacy.js` lines 4293–4378 (the "Poneti v1" block) — the smoke test's bundle-path assertion surfaced these. b125 missed this block; b126 catches it via the test that flagged it.
- 📜 **`TESTING.md`** — workflow doc. Explains how to run the suite, when to run it, and the iron rule: every bug fix AND every new feature ships with a test in the same commit. Sketches a GitHub Action for headless CI as the next step.
- 🤖 **`CLAUDE.md`** — project rules auto-loaded in every Claude session in this workspace. The testing rule, build/ship workflow, asset rules, and mobile-CSS gotchas all live there so future sessions don't have to be reminded. Closes the loop on "Claude keeps forgetting to add tests."

Net: full coverage of every interactive surface in the game, plus the discipline to keep it that way. Run `Ctrl+Shift+T` or click the floating 🧪 Test button to execute.

## v0.9.1-beta build 125 — 2026-05-04 (cleanup pass: dead icons + old SW snapshots)

Cleanup sweep to cut bug surface, since "code rot" was making bug-hunting harder than it should be. No new features, no behavior changes — just deletes.

- 🗑 **Removed ~90 lines of dead `icons3/...` path assignments** in `src/legacy.js` (lines 4380–4471). They populated `_itemPath`, `_skillIcon`, `_monsterIcon` with paths to icon folders that aren't shipped on the deploy. The `applyLocalIcons()` IIFE at the bottom of the file maps the curated subset we DO ship to `assets/icons-bundle/...`. Anything not in the curated subset falls through to the emoji glyph from the data file (`m.icon`), which is the desired behaviour.
- 🗑 **Stopped applying broken `BUNDLE_*_ICON` paths.** `BUNDLE_SKILL_ICON` / `BUNDLE_ITEM_ICON` / `BUNDLE_MONSTER_ICON` literals are kept as the canonical "shopping list" of art we want to buy from Itch, but we no longer push their `assets/raw-bundle/...` paths into the runtime maps because that folder isn't deployed.
- 📁 **Moved 23 old snapshot HTML files** (`hearthbound-phaseA-*.html`, `hearthrise-phaseA-*.html`, `hearthbound-v2.html`, etc.) from the deploy root into `.legacy/snapshots/`. Each one shipped its own service worker that could re-register on a stuck device if a user landed on a stale URL. Cleaner deploy folder + one less haunting vector.

Net: ~150 lines deleted from `legacy.js`, deploy root is now just `index.html` + two harmless dev tool pages (`icon-mapping-preview.html`, `style-lanes.html` — neither registers a SW).

## v0.9.1-beta build 124 — 2026-05-04 (universal SW kill-switch + duplicate prof-toolbar hide)

Tyler hit "Auth not configured" again on a stuck device. Console traced errors to `legacy.js?v=111` even though deployed HTML is v=124 — the b111+ service worker on his device cached old HTML and is still serving it instead of fetching fresh. b119's kill-switch only triggered for the original `hearthbound-v2` legacy cache, which means anyone whose SW cached a build between b110 and b123 stayed stuck.

- 💥 **Universal SW kill-switch.** Inline `<script>` in `<head>` now reads the current build from any `?v=` tag on the page (`hearthrise-<BUILD>`), then checks `caches.keys()`. If ANY cache exists that doesn't match the expected name (and isn't empty), it deletes every cache, unregisters every SW, and reloads once. sessionStorage flag prevents reload loops. Works for all past stuck builds, not just b108-b110.
- 🔄 **Manual reset escape hatch.** Append `?reset-sw=1` to the URL on any stuck device — kill-switch runs unconditionally, strips the flag from URL, reloads. Use this when a friend phones to say "the game won't load."
- 🪟 **Hide duplicate `.prof-toolbar` on mobile.** b123's grid rule accidentally un-hid the desktop-only `.prof-toolbar` Profile container — players saw both `.feat-buttons` (Achievements/Bestiary/Last Session/Lifetime) AND `.prof-toolbar` (Objectives/Achievements/Bestiary/Lifetime) stacked. Mobile rule now keeps `.prof-toolbar { display: none }` and only sizes `.feat-buttons`.

## v0.9.1-beta build 123 — 2026-05-04 (b122 cascade hotfix)

After verifying b122 on the deployed iframe, the feat-buttons stayed as a vertical stack and the topbar still wrapped to two rows. Diagnosed: an earlier `html:not([data-theme]) #panel-profile .feat-buttons { display: flex !important }` rule (specificity 0,1,2,1) was outranking the b122 mobile rule (specificity 0,1,1,0). My `display: grid !important` from b122 lost to a more-specific theme rule.

- 🎯 **Re-emit feat-buttons grid + topbar nowrap with theme-prefixed selectors** so specificity ties and last-loaded wins. Covers `.feat-buttons`, `.profile-toolbar`, `.profile-actions`, `.prof-toolbar`.
- 📜 **Topbar now horizontally scrolls on portrait** when stats overflow — better than wrapping. Stats labels (CL, TL, GOLD, GEMS) hidden on portrait, restored on landscape. Avatar shrunk to 28px.

## v0.9.1-beta build 122 — 2026-05-04 (mobile QA + UI/UX sweep, pass 1)

Tyler ran a senior-tester pass and found the mobile experience nowhere near ship-ready. First batch of fixes:

- 🪙 **Skill tile icons fixed.** Every skill in Activities was rendering as a broken-image square because `_skillIcon` pointed at `assets/raw-bundle/...` paths that aren't in the deploy. Cleared the map so each skill falls back to its emoji glyph (matches the cozy theme anyway). Real curated PNGs land in a later build.
- 🟧 **Topbar avatar fixed.** Player avatar was a 404 dark square (`icons3/.../BoldWarrior_nb.png` not deployed). Swapped for `assets/icons-bundle/monsters/Warrior_nb.png` with an `onerror` fallback to ⚔️ emoji.
- 🟪 **Wax seal off on mobile.** Profile's bottom-right wax-seal ornament covered the Lifetime Stats + Save Status cards on portrait phones. Hidden under the mobile media query (still ships on desktop).
- 📐 **Profile feat-buttons in a 2×2 grid** on portrait, 4-across on landscape. Was a vertical stack eating half the viewport.
- 🧱 **Character page kills right-side bleed.** `#panel-character`'s grid is forced to a single column with `max-width:100%` and `box-sizing:border-box` everywhere on mobile.
- 📏 **Topbar compact.** One-row layout, smaller pills, name truncates to 90px, hidden empty `<img>` orphans.
- 🛡 **Combat FOES sub-tab DUNGEONS button** wraps cleanly without overflowing the title row.
- 🔴 **Inventory action buttons** themed wax-stamp red so they read as primary actions instead of disabled-looking ghosts. Ghost/secondary buttons preserved.

Pass 2 (landscape) and Pass 3 (interaction polish) still to come.

## v0.9.1-beta build 121 — 2026-05-04 (screenshot ignores the modal itself)

b120 shipped screenshots inline in Discord — but they captured the bug-report modal that was on top of the screen, defeating the point. Tyler wants to see what's BEHIND the modal, not the form he just filled out.

- 🚫 **html2canvas `ignoreElements`** filters out: `#hr-bug-modal` (the form), `#hr-bug-btn` (the floating 🐛), `#chat-dock` (when open), `#more-modal` (the mobile More sheet). The screenshot now shows the actual game state the user was reporting on.

## v0.9.1-beta build 120 — 2026-05-04 (Discord screenshots inline)

Bug reports were capturing screenshots (b117) but the direct Discord webhook path was sending JSON-only embeds, so the image never appeared in the message. Tyler asked to see it inline.

- 📸 **`sendDiscord` now uses multipart FormData** when a screenshot is present. Image attaches as `screenshot.jpg`, embed's `image.url` is set to `attachment://screenshot.jpg`, Discord renders it inline below the metadata fields.
- 🟫 **Webhook author renamed** to `Hearthrise Bug Bot`, embed color changed to wax-stamp red `0xd44a3a` to match the in-game theme.
- 🆕 **Viewport added** as an inline field — useful for mobile-vs-desktop bug triage.
- 🛟 No-screenshot fallback preserved (JSON-only embed) for cases where html2canvas fails.

## v0.9.1-beta build 119 — 2026-05-04 (SW kill-switch + renderProfile null guard)

Tyler reported "auth not configured" on the live site. Console showed an error torrent: `TypeError: Cannot set properties of null (setting 'textContent') at renderProfile (legacy.js?v=111:1297)`. Two issues:

1. **Old service worker still alive.** Errors stack-trace to `legacy.js?v=111` even though the deployed HTML is at v=118 across all script tags. The pre-b111 SW (cache name `hearthbound-v2`, cache-first strategy) is still intercepting requests in installed browsers and serving stale JS — including the SW reference itself, so it can't update itself.

2. **`renderProfile` crashing on null DOM.** When `onAuthStateChange` fires before the Profile panel template is in the DOM, `getElementById('dash-user-sub')` returns null → `.textContent =` throws → error boundary captures it → infinite re-render loop because the auth listener also re-fires on render.

Fixes:

- 💀 **SW kill-switch** added as the very first inline `<script>` in `<head>`. Runs before any SW can intercept. Detects old `hearthbound-v2` cache, deletes it, unregisters the SW, reloads once. `sessionStorage` flag prevents reload loops. Idempotent — does nothing if no old cache exists. After this self-heals, the b111+ network-first SW takes over and future updates propagate normally.
- 🛡️ **Null guards in `renderProfile`** for `dash-user-sub` and `dash-user-body`. If either is missing, bail early instead of crashing. Stops the auth-listener-driven render loop.

After this build deploys, anyone stuck on a pre-b111 SW will auto-recover on next page visit. New installs use the b111+ SW from the start.

## v0.9.1-beta build 118 — 2026-05-04 (Discord webhook live)

Tyler set up the Hearthrise Discord server (Info / Community / Feedback categories with 8 channels). Created the `#bug-reports` channel + "Hearthrise Bug Bot" webhook. Webhook URL pasted into `DISCORD_WEBHOOK_URL` in `bug-report.js` — bug reports now flow directly to Discord.

This is a temporary configuration until the Cloudflare Worker is deployed (waiting on Tyler's GitHub access). The URL is currently in the public JS bundle. Risk: scraper-driven channel spam. Mitigation: regenerate webhook URL in Discord if abused.

After Worker deploy, the URL moves to a Cloudflare secret and the constant goes back to empty.

## v0.9.1-beta build 117 — 2026-05-04 (bug-report pipeline + screenshot capture)

The "test on phone via RDP" pain solved.

- 📸 **Screenshot capture in bug reports.** `html2canvas` (loaded from CDN, no bundle bloat) renders the current viewport to a JPEG; included in the report payload. Embedded inline in the Copy-to-clipboard markdown. Visible in Discord embeds + GitHub Issues.
- 🌉 **Cloudflare Worker bug-report bridge.** New file `cloudflare-workers/bug-report-bridge.js`. Single endpoint that fans out to **Discord channel + GitHub Issues** in parallel. Holds Discord webhook URL + GitHub PAT as Cloudflare secrets so they never touch the public web client.
- 📝 **`BUG_REPORT_PIPELINE.md`** — step-by-step setup guide. ~25 min one-time wiring: Discord channel + webhook → GitHub PAT → Cloudflare Workers signup → `wrangler deploy` → secrets → paste worker URL into `bug-report.js`.

After Tyler completes the setup, the testing loop becomes:

> Phone → 🐛 → Send → Discord notification on phone (Tyler sees) + GitHub Issue created (Claude reads via WebFetch)

Every report has the screenshot inline, viewable on either side. Claude can comment on issues, label them, close them as fixed. Persistent shared source of truth for bugs across co-pilot sessions.

The legacy direct-Discord and Supabase paths still work as redundant fallbacks. If `BRIDGE_URL` is left blank in `bug-report.js`, the game uses the old paths transparently.

## v0.9.1-beta build 116 — 2026-05-04 (landscape side-rail height hotfix)

After b115 deployed, the side rail was visible at the top with HOME / Profile button rendered correctly — but no other buttons. iframe DOM inspection showed all 6 buttons existed (Home/Character/Combat/Skills/Farm/More at y=6, 64, 122, 180, 238, 296) but the nav container was only 60px tall with `overflow: auto`, so 5 of 6 buttons were below the fold and required scrolling.

Cause: my own b113 block in `theme-cozy.css` had `.bottom-nav { height: calc(40px + safe-b) !important }` from when the nav was still horizontal. b113 came AFTER b114 in the file, so b113's height override won via cascade order. Self-inflicted regression.

Fix: removed the obsolete bottom-nav height + bn-btn sizing rules from the b113 block. b114's `height: 100vh` now wins. All 6 rail buttons are visible top-to-bottom in landscape.

## v0.9.1-beta build 115 — 2026-05-04 (landscape visual polish)

Tyler's first b114 read: "clunky, no parchment background on left nav." Six issues spotted in the iframe screenshot:

1. Side rail dark cocoa, didn't match theme
2. Topbar still too tall — eating reclaimed vertical
3. DUNGEONS button overflowed to the right
4. Buttons clustered at top of rail, bottom empty
5. Topbar email clipped behind rail boundary
6. Activity bar barely visible

This patch fixes all six.

- 🟫 **Side rail is parchment** (cream→amber gradient) with 2px gold border. Cocoa text, Cinzel font, hover state, wax-stamp red active. Matches the rest of the cozy theme — feels like part of the game, not an injected sidebar.
- 📏 **Topbar 32px** (was 36) with tighter stats row
- 🛡️ **DUNGEONS button** width-capped at 140px so it stops sprawling
- 📐 Activity bar 26px slim
- 🔧 Layout offset moved to `.app` level so children inherit cleanly — topbar no longer bleeds behind the rail
- 💬 Full chat dock (when opened from More menu) respects side-rail offset

## v0.9.1-beta build 114 — 2026-05-04 (landscape side-rail nav)

The real landscape answer (b113 was the baseline; this is the structural fix).

- 📱 **Bottom nav rotates into a left side rail in landscape.** Same DOM, same buttons — just `flex-direction: column` and positioned on the left edge. Reclaims the ~40px of vertical the horizontal bottom-nav was eating. Wax-stamp red active-state preserved.
- 📐 **Topbar slim** — 36px in landscape (was 40px), pushed right to clear the rail.
- 🎯 **Activity bar slim** — 28px strip at top.
- 🔋 **Content gets the full vertical screen** — panels no longer reserve bottom space for nav.
- 🎨 **Side rail uses cocoa gradient** with gold border, matches the parchment-RPG palette.
- 📱 Triggers on landscape phones AND tablets ≤1024px wide so iPad-mini-in-landscape and similar fall in.

Verification gate before b115: real-phone test in landscape — content area should now feel spacious (~70% of horizontal × 100% of vertical), not cramped.

## v0.9.1-beta build 113 — 2026-05-04 (landscape baseline + UX plan)

After Tyler discovered he'd been playing in landscape (which our portrait-only media queries didn't match), this push makes landscape phones a first-class orientation rather than a broken one.

**This push is a baseline, not the final answer.** Senior PM read: rather than shipping one giant landscape redesign and risking regressions, we phase it across b113 → b116 with verification gates between each push. Plan is documented in `UX_PLAN.md`.

- 🔄 **Mobile rules now fire in landscape too.** Every `@media (max-width: 540px)` block now also matches `(max-height: 540px) and (max-width: 900px)`. Sub-tabs, dense lists, chat-as-tab, all the b110-b112 work — fires in both orientations.
- 📐 **Landscape-specific chrome compaction.** Topbar 40px (was 60), bottom nav 40px (was 60), sub-tab strip 32px (was 56). Activity bar 28px. Card padding 4-6px. Reclaims most of the vertical bleed in the cramped 380px landscape height.
- 📋 **`UX_PLAN.md`** ships with the push, capturing the b113→b116 phased plan to senior-quality landscape (side-rail nav, two-column content, verification gates).

**Open issue (planned for b114):** landscape still uses the horizontal bottom nav, which eats ~40px of vertical when ergonomically a left side rail would work better in landscape. Not addressed in b113 because rotating the nav is a real DOM/layout change with regression risk and we want to verify b113 is stable first.

## v0.9.1-beta build 112 — 2026-05-04 (Profile bleed-through hotfix)

🚨 **The reason "nothing looked different" on your phone after b110 + b111.**

A CSS rule I wrote way back in b109 was missing its `.active` scope:

```css
#panel-profile { display: block !important; }   /* old — wrong */
#panel-profile.active { display: block !important; }   /* b112 — correct */
```

That single missing `.active` was forcing the Profile panel to render on top of every other tab on mobile. Combat / Inventory / Skills with their new sub-tab strips were ALL there, working — just hidden behind a permanently-visible Profile panel. The Achievements / Bestiary / Lifetime Stats buttons + player name showing on every tab in the iframe screenshots was the giveaway.

This single character fix should make b110 + b111 visible on phones for the first time. After this push deploys + the b111 service-worker fix actually takes effect (one more home-shortcut reset required), every future build auto-updates.

## v0.9.1-beta build 111 — 2026-05-04 (mobile rebuild pt 2 + service-worker fix)

Two big things in this push.

### 1. Service worker rewrite (P0 — fixes the "phone shows old version" bug)

Previous service worker used a fixed cache name (`hearthbound-v2`) and "cache-first" strategy. Translation: once the SW cached a file, it served the cached version forever. Pushing new builds did nothing for installed PWAs until the user manually deleted + reinstalled the home shortcut. That's why b110 looked unchanged on Tyler's phone home shortcut.

New strategy:
- Cache name now includes the build version (e.g. `hearthrise-111`). Each build → new cache → old caches purged on activate.
- App shell (HTML/JS/CSS) = network-first. Fresh fetch on every load when online; cache fallback only when offline.
- Static assets (PNG/SVG/font) = cache-first because they're URL-versioned.
- `skipWaiting()` + `clients.claim()` so updates take effect on the next page load with no manual reset.

After this build deploys, all future pushes will propagate to phones automatically within ~30s of opening the app.

### 2. Mobile rebuild pt 2 — Inventory + Activities

Same Idle-Clans-style sub-tab pattern Combat got in b110, applied to two more panels.

- 🎒 **Inventory sub-tabs**: `Bag | Equip | Saved` strip. Bag shows just the item grid (5-col on mobile), Equip shows the paper-doll + hero stats, Saved shows loadouts. New `src/inventory-mobile-tabs.js`.
- ⛏️ **Activities skill strip**: 9 skills as a horizontal-scroll strip across the top (Wood / Mine / Fish / Farm / Cook / Craft / Smith / Prayer / Magic). Tap to focus. The selected skill's detail view fills the rest of the screen. Replaces the desktop sidebar+detail layout that was eating ~60% of the panel on mobile. New `src/activities-mobile-tabs.js`.
- Skill nodes (Normal Tree, Oak, etc.) and bag tiles densified to phone-friendly sizes.

## v0.9.1-beta build 110 — 2026-05-04 (Idle Clans-style mobile rebuild — pt 1: Combat)

First of three structural rebuilds to make the mobile experience feel like Idle Clans (and other dense, tabbed mobile idle games) instead of a desktop site squeezed into a phone.

This push targets the **Combat panel** + chat-as-tab + dense lists. Next pushes (b111, b112) restructure Inventory/Activities and the rest.

- ⚔️ **Combat sub-tab strip on mobile**: `Style | Foes | Arena` across the top of the panel. Only one section is visible at a time. New `src/combat-mobile-tabs.js` injects the bar; CSS in theme-cozy.css gates section visibility via `data-mobile-sub`. Replaces the 1500px-tall vertical scroll with a focused single-pane view.
- 💬 **Chat moved into the More menu** on mobile (was a floating pill that overlapped gameplay). Tap More → 💬 Chat → dock opens fullscreen. Floating pill is hidden on phone via CSS. New `src/mobile-more-chat.js` wires the button.
- 👹 **Dense monster list rows** — was 200px+ "cards" with verbose chips, now ~56px rows: tiny icon, name, weakness, tier badge. Same screen now shows ~12 monsters where it used to show 3.
- 📐 **Bounty cards densified** to match — 60px rows with compact reward + weakness text.
- 🔁 **Folded in the b109 polish** — chat pill no longer overlaps nav, density restored from b108's over-correction, profile overlap killed, bottom nav 48px tap targets, topbar compacted.

## v0.9.1-beta build 109 — 2026-05-04 (real-phone fixes)

Tested on a real phone after b108 deployed. Reports:
- "Chat button is in the way"
- "Combat screen is not visible"
- "Way too much scrolling"
- "Profile page has a ton of overlap"

Cause: b108 over-corrected on padding/font/tap-target sizes — everything got bigger so the page got taller, and the chat pill at `bottom: 16px+safe-b` sat directly on top of the new 60px+safe-b bottom nav.

This patch walks b108 back to a denser layout while keeping tap targets above Apple's 44px minimum.

- 💬 **Chat pill lifted above bottom nav** (was overlapping). Smaller, more transparent, with backdrop blur — feels like a quiet utility, not a primary CTA.
- 📐 **Density restored.** Base font 13px (was 14), panel padding 8px (was 12), card padding 10px (was 14), card margin-bottom 8px (was 12). Page is shorter, less scrolling.
- ⚔️ **Combat panel compressed.** Hidden the "Style: Accurate · Trains: Attack / Accuracy skill: attack..." descriptive text on mobile — it's redundant once you've picked a style. Combat-style buttons now in a tight 4-up grid with no labels. "Suggested for your level" hidden on mobile because the full monster picker covers the same purpose.
- 👤 **Profile overlap fixes.** Last card has 80px bottom margin so it doesn't sit under the chat pill. feat-buttons back to single-column stacked (was 2-col but labels truncated). Active Effects copy compacted.
- 📱 **Topbar + bottom nav compacted.** Bottom nav 48px tap targets (was 52, still over Apple's 44 minimum) saves 4px of vertical real estate × every screen.
- 🔁 **Full chat dock when expanded** now flush left/right and sits above the bottom nav, not floating in space.

## v0.9.1-beta build 108 — 2026-05-04 (mobile feel pass + PWA polish)

Tyler reported it's a "shit experience" on a real phone in browser. The iframe audit only proves CSS works at 380px; doesn't catch the actual touch / keyboard / safe-area / lag issues. This pass attacks those.

- 👆 **Tap delay killed everywhere** — `touch-action: manipulation` globally + on every interactive element. The 200-300ms iOS tap-lag responsible for "feels slow" is gone.
- 🎯 **Tap targets ≥44px on every interactive element** (Apple HIG minimum). Bottom-nav buttons 52px, monster/bounty cards 56px, Accept/Build/Buy buttons 40px, combat-style picker 48px, paper-doll slots 56px. Phones can actually hit things now.
- 📱 **Safe-area-insets respected** for iPhone home indicator + notch. Bottom nav extends with `env(safe-area-inset-bottom)`, topbar pads with `env(safe-area-inset-top)`. No more home indicator chopping the nav.
- ⌨️ **Soft keyboard no longer covers chat input** — new `src/mobile-keyboard.js` module toggles `body.kb-open` on focus + scrolls the field above the keyboard. Uses `visualViewport` API on newer browsers for precise detection.
- 🌬 **Visual breathing room** — bigger base font on phones (14 / 1.45 line-height), more panel padding, more card spacing.
- 🍯 **Wax-red tap highlight** instead of the default blue iOS Safari flash — matches the rest of the cozy theme.
- 🏠 **PWA install polished** — manifest now uses the real Hearthrise crest icon (was emoji), `theme_color` + `background_color` switched to cozy palette so the install splash + status bar match the in-game UI. "Add to Home Screen" produces a proper-looking app.

## v0.9.1-beta build 107 — 2026-05-04 (mobile follow-ups)

Two issues caught when re-walking the iframe mobile audit after b106 deployed.

- ⚔️ **Combat monster picker was actually rendering at 26px tall** (just the card header — body collapsed because of `overflow: hidden + flex: 0` from desktop styles). Now forced to `min-height: 240px`, `overflow: visible`, `height: auto` on mobile so the tier buttons + monster cards inside actually show.
- 📋 **Profile right-side bleed.** The 2-column layout (main content + Active Effects sidebar) wasn't stacking on mobile — fragments like "FO... HC... wid..." were visible past the parchment edge. Forced single-column block layout, Active Effects flows underneath. Also wrapped the `.feat-buttons` row (Achievements / Bestiary / Last Session / Lifetime Stats — 570px wide before) into a 2×2 grid.

## v0.9.1-beta build 106 — 2026-05-04 (mobile pass)

Found these by loading the live site in a 380px iframe (Chrome MCP can't actually shrink the viewport, so the iframe trick fires the real `@media (max-width: 540px)` rules).

- 📱 **Chat dock no longer takes over the screen on mobile** — forces minimized state on first load when the viewport is ≤540px. First impression is the small "Chat" pill, not a full-screen overlay.
- 🏠 **House building icons survive on mobile.** When the `.shop-row` flex went vertical at narrow widths, the building image was collapsing to 0px. Forced a 48×48 reserved column (44×44 on phones <400px). The Forge cottage / Library tower / Garden windmill all show up now.
- ⚔️ **Combat monster picker no longer disappears on mobile.** The tier selector + monster list was being hidden by the desktop side-by-side layout breaking. Forced `display: block` and stacked the three columns vertically.
- 🎒 **Inventory paper-doll fixed for mobile.** Was showing only the Helm slot at narrow widths. Now renders as a 3-column responsive grid that fits all 14 slots inside 380px.
- ✏️ **Player name ellipsis** instead of mid-word clip ("ADVENTU..." → "ADVENTURER…", proper truncation marker).
- ⚔️ **Combat-style header stacks** the DUNGEONS button below the title at <540px so "COMBAT STYLE — 1H SWORD" no longer gets cut off by it.

## v0.9.1-beta build 105 — 2026-05-04 (chat polish + monsters + polish)

Six things in one push.

- 💬 **Chat dock now shows your message immediately** after sending. The supabase chat backend was silently dropping subscribers when it hot-swapped over the local backend — fixed by re-subscribing on `setBackend`. Realtime pushes from other users will start flowing too.
- 🐉 **31 hand-painted monster avatars** wired up. Slime, Field Rat, Goblin (1-5 variants), Skeleton, Spider, Zombie, Wraith, Demon, Dragon, etc. — every monster in the bestiary now has art instead of a generic crate. Adds ~10 MB.
- 🏠 **Building icons in House sized up** from 42×42 to 56×56 — the homestead reads more substantial.
- 🎒 **Inventory paper-doll hover labels** — tooltip now reads e.g. "Helm: Iron Helm (click to unequip)" so you know which slot is which even when filled.
- 📋 **Bug-report dialog has a Copy button** — falls back to clipboard so testers can paste reports into Discord/email/wherever even before we wire up a real webhook.
- 🔧 **Consolidated Supabase clients** — chat backend now reuses the auth.js client. Removes the "Multiple GoTrueClient instances detected" warning from the console.

## v0.9.1-beta build 104 — 2026-05-04 (chat fix)

- 💬 **Chat send was 400'ing for everyone signed in.** The `from_id` column on `chat_messages` is a UUID, but the chat code was sending `"local-0"` (a local fallback) instead of the actual Supabase user UUID. Now reads the live session user.id when present, with a graceful fallback to legacy local IDs only when offline.

## v0.9.1-beta build 103 — 2026-05-03 (asset cherry-pick)

First batch of real hand-painted icons shipped to the live deploy.

- 🏠 **House rooms now have hand-painted buildings** — Forge is a blacksmith cottage, Kitchen is a homestead, Library is a tower, Garden is a windmill, Trophy Room is a citadel, Cellar is a cottage. Replaces the emoji glyphs.
- 🌾 **Farm plot buildings get art too** — Farm Plot is a real farm, Tool Shed is a small house, Watchtower is a tower.
- ⛏️ **Material items get hand-painted icons** — wood logs (all 5 tiers), planks (all 5 tiers), copper/iron/silver/gold/mithril/rune bars, copper/iron/silver/gold ore, stone, mushrooms, dragon eggs. Inventory + crafting recipes start showing real art.
- 🎨 New `assets/icons-bundle/` directory ships ~14 MB of curated PNGs cherry-picked from the icons3 megapack. Subfolders: buildings/, resources/, medieval/. More to come in build 104+.
- 🔧 Replaced the b101/b102 absence-probe with a proper override system. Items without art fall through cleanly to the emoji glyph (`m.icon`).
- 📋 Added `ASSET_AUDIT.md` documenting which packs match the cozy theme and which don't. Spoiler: `Icons/`, `icons2/`, and `icons4/AI|EPS|TXT/` are off-theme and should be deleted from local disk.

## v0.9.1-beta build 102 — 2026-05-03 (second hot patch)

Walked the live site, found six things, fixed all of them.

- ❤️ **Character page HP** — was showing `— / —` because it read `G.hp` / `getMaxHp()` (neither exists). Now reads `G.playerHp` / `G.playerMaxHp` like Inventory does. Shows `10 / 10` correctly.
- 👤 **Profile auth state** — Profile sheet said "Offline play · sign in to sync" even when Settings showed cloud sync active. Profile now reads the live Supabase session directly and displays "Online · cloud save active" with the right name.
- ☁️ **Settings cloud-sync status** — was contradicting itself ("Cloud save active · syncing every 30s" right next to "Never synced"). Now shows "Auto-syncing every 30s — waiting for first round-trip" while signed in, only switching to a real timestamp once a sync completes.
- 🛒 **Market buttons re-skinned** — green Idle-Clans-style "List" button is now wax-stamp red; dark-blue "Premium Store" pill is now parchment with a gold gem accent. Both match the rest of the UI.
- 📦 **Bundle-icon 404s silenced** — the `assets/raw-bundle/` directory isn't on the deploy, so every monster icon was 404ing and falling back to a generic crate. Added a startup probe: if the bundle is absent, clear the icon maps so renders use the proper monster emoji directly (🐀 🦊 ⚔️ etc.). No more 404 spam, no more broken-image flash.

## v0.9.1-beta build 101 — 2026-05-03 (hot patch)

Bug-fix patch caught during the first live-site walkthrough.

- 🐛 **Bounty Board raw-HTML finally fixed for real.** The old regex-on-innerHTML approach fought with `image-fallback.js` and produced corrupted markup like `class="icon-fallback" style=...> Field Rat`. Rewrote `paintBountyMonsters` to use proper DOM API (createElement + appendChild) — the failure mode can't recur.
- 🚪 Click the idle activity bar in the topbar to jump straight to Activities. New-player quality-of-life.
- 👋 First-time-after-signup welcome modal — fires once per account, names the player, points at Activities.
- 🛒 Market "List an item" form had an olive-green background; now matches parchment.
- 📋 Added `TODO_BETA.md` with prioritized post-beta backlog.

## v0.9.1-beta — 2026-05-03

**Hearthrise looks like a real game now.** Massive UI rebuild to match the homestead-RPG vibe.

- 🎨 New character-sheet UI: parchment pages with gold corner flourishes + wax seal, instead of the old dashboard cards
- 🏠 New Hearthrise crest logo — cottage with rising sun above + wheat sheaves
- ✒️ Hand-drawn icons for every nav and topbar slot (24 SVG icons in a consistent style)
- 🌅 Atmospheric "homestead at golden hour" background — warm amber sky fading down through grass to deep forest
- 🔴 Wax-stamp red accents for primary actions (Sign In, Quests, active nav)
- 📜 Cinzel typography for headings; Quicksand for body — replaces generic sans
- 💬 Chat dock + welcome modal + bug-report system all themed
- 🔐 Cloud sync (sign in via Settings → Account) live for cross-device saves
- 🛒 Marketplace (player listings) lives at Market tab; premium store accessible from there
- 🗝 Dungeons accessible from a button inside Combat
- 📋 Beta invite system + signup display name field

**Gameplay**
- All 9 skills trainable, weapons + armor crafting, Bounty Board with marks rewards
- Companion system: Wolf, Beaver, Raccoon
- House upgrades: 8 rooms, account-wide bonuses

**Known limitations**
- Beta — expect some rough edges. Save backups roll automatically every 30s.
- Mobile is supported but desktop is more polished.
- Some achievements + the bestiary are still client-side only.
- Email confirmation links may need a fresh browser tab to complete sign-up.

**How to send feedback**
- Use the 🐛 button bottom-right → captures your build version + game state
- Or join the Discord (link in Settings → Beta tester tools, once configured)


## v0.9.0-beta — 2026-05-01

**Welcome to Hearthrise beta!** Thanks for testing.

- ☁️ Cloud save: sign in to sync your progress across devices
- 💬 Live global, trade, clan, and whisper chat
- 🛒 Player market with search, 7-day price analytics, and partial buys
- 🐛 Bug-report button (bottom-right corner — please use it!)
- 🏆 Leaderboards: Total Level, Combat, Gold

**Known limitations**

- This is beta — expect rough edges. Save backups roll automatically every 30s.
- Mobile is supported but desktop is more polished right now.
- Some achievements + the bestiary are still client-side only.

**How to send feedback**

Use the 🐛 button bottom-right, or pop into the Discord (link in Settings).
