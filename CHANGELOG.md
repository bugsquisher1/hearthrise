# Hearthrise — Changelog

The welcome modal reads this file on first load after a new version. New entries
go at the top. Format: each version is a `## vMAJOR.MINOR.PATCH — YYYY-MM-DD (Title)`
heading, followed by short, player-friendly text (not commit-log style).
Versions are semver: a patch per release, a minor per milestone, 1.0.0 for full release.

## v0.2.49 — 2026-10-26 (A place for everyone)

**Heroes stop piling up in town.** Every hero now gets its own spot to stand, chosen by the server: near the work it is doing, never on top of another hero. Heroes you aren't watching stand at their own work too.

**Tomatoes and Emberfruit explained.** These crops grow back after a harvest. The Farm now says how many more times ("Harvest (grows back 3 more times)"), and "Harvest and clear plot" takes the crop and empties the plot. They wither after their fifth harvest, as they always should have.

**Armor weights explained.** An armor piece's tooltip now says what its weight gives: heavy adds max HP and absorbs part of each blow, medium makes more blows miss you, light adds max mana and takes a little off each blow. Your Inventory shows what your worn armor adds up to.

## v0.2.48 — 2026-10-26 (Plan your loot)

**Plan where your loot goes.** In your bag, pick what happens to each kind of item: Keep in bag, Deposit in storage, Sell, or Don't pick up. Back in town, press "Dispatch loot" and it all goes where you planned, in one go. Your starting kit can be deposited but never sold.

**Skills use your Storage.** Cooking, crafting, smithing, farming and the rest now take what they need from your bag first, then from your Storage, and "Makes up to" counts both. If your bag is full, the game tells you what to make room for.

**The game says why.** When something can't be done, a line tells you why, right there, not just on hover.

**Easier to read windows.** Bag, Storage and Shop icons are sharper and set in roomier slots, and the windows are a little wider on big screens.

**Gold to keep, explained.** The "Keep at least ___ gold" fight setting now says what it does: the hunt sells loot, then heads home rather than spend below it.

## v0.2.47 — 2026-10-25 (Set up in town)

**Set up your bar in town.** Target, stance, Chase, Distance and gold to keep now work while you're in town, so you can get ready before you set out.

**Ammo has its own tab.** Configure action's tabs are now Spells, Runes, Food & drink and Ammo.

**Clearer farm buttons.** A ready plot offers "Harvest and replant" or "Harvest only".

**Party hunts are safer.** If one hero's turn keeps failing, only that hero leaves the hunt; the rest of the party keeps going.

**Small fixes.** No more "hunt has ended" note about the hero you're looking at after a reload, and your mana shows from the first second of a hunt.

## v0.2.46 — 2026-10-25 (A better bar and a fuller tutorial)

**A new action bar.** Spell and item icons are twice as big on wide screens, and your stance, setup, target, Chase and Distance sit on the right where you can see them without opening anything. Phones get their own bar that fits the screen. Tap the "+" by your stamina to see the refill price and buy one.

**The tutorial goes further.** Twelve more guide cards cover your first meal and drink, fight settings, selling loot, Storage, blessings, more heroes and running your own party. A gold ring now points at the exact button each card talks about, and "Got it" puts a card away for good. Coming back to town after a hunt is tidier: the hunt panels close and the summary points you to what's next.

**Services moved into the Shop.** The Shop now has three tabs: Buy, Sell and Services. R opens it on Services.

**Move and fold the Hunt analyzer and Tally.** Drag them by their title bar and fold them with "−". They stay where you put them after a reload. Settings › Interface › HUD layout puts them back. Scrollbars now match the rest of the game.

**Tanks find open ground.** A tank pulled against a wall or into a corner now steps to open ground, so all eight places around him can fill.

**Switching heroes is smooth again.** Switching to a hero in a party no longer freezes, races ahead or jumps, and party fights on screen now match what the server records.

## v0.2.45 — 2026-10-24 (Clearer sign-up)

**Sign-up says what went wrong.** If an account can't be made, the form now tells you why: the password needs at least 10 characters, it's shown up in a data leak, the email can't be used, or there have been too many tries. The 10-character rule is shown under the password box before you start.

**Four heroes play at once.** Up to four heroes can be hunting or working in town at the same time, on one account or across accounts on the same connection. Starting a fifth now tells you to stop one first.

**What next fits on phones.** On a phone the What next card stops above your action bar, so your health and mana stay visible. Scroll the card to read the rest.

## v0.2.44 — 2026-10-24 (Friends and phones)

**Add friends by their hero's name.** Typing a hero's name in Friends finds them now, in any mix of capitals and spaces. It used to say "No player by that name." even when the hero existed.

**Every name is the hero you're talking to.** Your friends list, whispers and inspect show the hero your friend is playing right now, and typing a hero's name opens that hero's gear. Chat, whispers, friends and your block list all update when a hero is renamed. Asking someone who already asked you now says "You are friends now."

**Better on phones.** The action setup list scrolls and its Save button stays on screen. Hunt details has its own close button and no longer covers Leave hunt. Buttons, settings rows and checkboxes are bigger to tap, tooltips fit on the screen, and holding your phone upright asks you to turn it sideways.

**A clearer first hour.** Each tutorial step puts a gold ring on the real button to press. Heroes hunting alone skip the party step, the town steps teach planting, cooking and Tamsin's tasks, and Enter closes the Hunts page so you can see the next step.

**Smaller fixes.** A refused unblock now says why.

## v0.2.43 — 2026-10-24 (Gear by Level)

**Gear needs only your Level.** Every piece of armor, every shield, weapon and piece of jewelry now asks for your hero's Level, never a skill. A mage or ranger can wear their upgrades without tanking for Defense first. Runes, ammo, food and drinks still ask for their skill.

**"What next" points at gear you can get.** It now names the next gear at your next Level, and only pieces you can actually find.

## v0.2.42 — 2026-10-24 (Runes and roles)

**Spells run on runes.** Every spell names the rune it uses, and there are six rune families, each in five versions that hit harder as they go up. When your runes run out, you choose: stop casting, or let the store sell a cast for a gold or so.

**Every role has its tools.** A shield makes a real tank, healers top the party up between pulls, and support spells like Arcane Barrier and Protective Ward guard the group.

**Rangers shoot what they carry.** A bow uses an ammo slot you gave conditions first, then the arrows you're wearing, then the other arrows on your bar in bar order. The store sells a shot only when you've run out of all of them. Whetstones can't go in an attack slot anymore.

## v0.2.41 — 2026-10-24 (Forged Steel)

**A new look.** Every window, the HUD, and the sign-in, characters and hero creation screens are now made of forged steel: steel frames, gold headings, clearer selected rows, and a solid gold button for the main thing each window does.

**Pick how see-through windows are.** Settings > Interface has a new Window opacity slider, from 60% to 100%. It stays where you left it after a reload.

**The Hunts page scrolls in its own box**, so the Enter button never covers anything.

**Smaller fixes.** Hero creation fits on a landscape phone, chat opens on the newest line instead of the oldest, and the death popup is clearer about what you lost.

## v0.2.40 — 2026-10-24 (No more frozen tabs)

**Fixed a freeze.** With a tally task showing under the hunt analyzer, the game could lock up for good when a party hunt started, when you switched heroes, or while loading a hero (a blank page). It no longer does. Your heroes kept hunting on the server the whole time, so nothing was lost.

## v0.2.39 — 2026-10-24 (Clearer screens)

**Fold away "What next".** A small button on the "What next" card folds it down to its title. It stays folded after a reload, and a gold mark shows when there's a new goal.

**Drops show their odds.** The Hunts page lists what each ground drops with its chance per kill, instead of "about every hour", and the creatures now face you.

**Gear tells you why.** Equip and Equip upgrades now say why they can't be used, like "Leave the hunt to put these on" or a requirement you haven't met, instead of doing nothing.

**House builds use your Storage.** Rooms, properties and storage chests take materials from your bag first, then from Storage. The House window shows both counts.

**Faster to load.** The characters screen and your heroes open about twice as fast, and the world downloads far less art before you can play.

**Tamsin speaks plainly**, and the longbow icon finally looks like a longbow.

## v0.2.38 — 2026-10-23 (Straight shooting)

**Rangers fire their abilities.** Precision Shot and Flame Volley now fire when you pick your arrows on the bar, not only when arrows are worn in the ammo slot. A bow no longer shoots whetstones (the slot says why), and the Configure window only offers ammo your weapon can shoot.

**The game updates as it happens.** Changes from the server now arrive the moment they're saved instead of on the next check, so party hunts, other heroes and the world feel live. The heroes you aren't watching ask the server far less often, which makes the game lighter to run, and leaving a hunt as a party no longer floods the server.

**Chat is lighter.** Messages, whispers and party lines arrive the same way they always have (a little faster), and a dropped connection catches up on what you missed.

**The Sandbox.** A "To the sandbox" sign in the Common leads to a new walking area drawn at a sharper scale. Look around; there's nothing to do there yet.

## v0.2.37 — 2026-10-23 (Worth the hunt)

**New loot on every ground.** Each monster now drops a full spread: creature parts, a crafting material, and gear for every armour weight (heavy, medium and light), so every build finds its next upgrade about once an hour as it moves up the grounds. Rare pieces turn up every few hours with a louder moment when they drop, and the Rat King and Chief Coppercap each guard a Trophy worth chasing. No gear is bound any more: everything you find can be stored or sold. The Hunts page shows the gear each ground drops for your armour.

**Meet Tamsin Reeve, the Common's tally-keeper.** Take up to three kill tasks at her board (Q), hunt, and she pays you when you're back in town: gold, plus the next piece of gear you're missing for your armour. Your progress shows on the hunt cards.

**Fixed:** the farm hint no longer says nothing grows while your shared land is full of crops.

## v0.2.36 — 2026-10-23 (Home together)

**Leave together.** Your row on the party panel now has a box: "Leave if anyone leaves the hunt or dies". It starts ticked and is remembered for each hero. When a partner leaves, falls or runs out, every hero with the box ticked is paid for its time, then comes home with them, and the summary says why ("Mira fell, so Tyler came home too."). Untick it to keep hunting. Removing someone from the party never sends anyone else home.

## v0.2.35 — 2026-10-23 (One purse)

**Your heroes share one purse.** Gold now belongs to your account: whatever any of your heroes earns or spends comes in and goes out of the same purse, shown as "Your gold". Every hero's gold was added together, nothing lost. Items still move between your heroes through Storage.

**Runes stop costing you behind your back.** A basic attack no longer buys store runes on its own, running out of runes no longer ends your hunt, and a hit is now as strong as the rune it actually used. One spell you can't afford no longer ends the hunt either.

**Follow means follow.** A hero set to Follow now attacks the monster its leader is fighting, and Strongest and Follow both switch to a better target when one turns up.

**Fixed:** dead monsters no longer pop back when you switch heroes, corpses stay where they fell instead of sliding, and changing weapons mid-hunt now says "Not while a hunt is running." instead of half-working (setups change in town).

## v0.2.34 — 2026-10-23 (Shared land)

**Your heroes share one farm.** Farm land now belongs to your account, like the house and the depot: any of your heroes can plant, water and harvest any plot, and the Farm window shows who planted what. Crops already in the ground moved over with their timers.

**Town work counts up as it happens.** Items and skill XP from town work tick up one at a time between payouts, and the server's count replaces them at each payout.

**A clearer Hunts window.** Pick a ground to see its details beside the list, check what you need before you go, and choose which hero to send.

**Everyone is premium during the beta,** with the longer stamina pool, the full analyzer, the daily reward and premium outfits.

**Fixed:** drinks you made yourself are no longer refused mid-hunt, so they can't end your hunt any more.

## v0.2.33 — 2026-10-23 (Eyes on your hero)

**The hunt camera stays on your hero.** It keeps the hero you are watching in the middle of the open screen, clear of the party panel, the analyzer and the bar, and it moves to the new hero when you switch.

**Tanks pull what they hold.** The tank holding the pack this lap now makes the pull, so another tank no longer takes the pack away right after it. A tank that already has every monster shows its Challenge slot as Holding.

**Other heroes look like themselves in town,** in their own outfit, instead of all wearing the same knight armour.

**Updates no longer end your hunt.** A hunt keeps running through an update and is paid for the time it was waiting.

**Chat no longer covers the party panel.** It gets shorter or moves aside to make room.

## v0.2.32 — 2026-10-22 (Who holds the pack)

**Your tanks, your call.** With two or more tanks in a party, the party panel now says who is holding the pack this lap and who holds next. The party leader chooses: tanks take turns, one lap each, or one tank holds every lap while the others guard the healer. A change starts on the next lap.

**A new look for the action bar,** with fight settings that fold out of it. Chat sits bottom-left, see-through, and you can resize it. Right-click menus stay open, and opening Settings no longer moves the bar.

**Rename your hero.** Your first name is free. After that a new name costs 20,000 gold plus 500 per Level.

**Setups keep their gear.** The setup you are using now remembers what you wear, and switching setups puts that gear back on.

**Fixed:** the tutorial pointer no longer jumps back and forth as hunts end, and creatures that sometimes drew without a picture now always have one.

**Cleared out:** raid strikes, world events and clan board tasks from an earlier version of the game. Live world events will come back, built new.

## v0.2.31 — 2026-10-22 (A home, a farm, and armour that matters)

**Armour you choose.** Heavy armour absorbs blows, medium armour dodges them, light armour wards them. Each suits a different way to fight, and your Character sheet shows your Dodge, Absorb and Ward.

**Your farm and your house.** The Farm window (J) lets you plant, water and harvest; harvesting plants the same crop again. The House window (E) shows your home, its rooms and what each does, and storage chests that give your account's shared storage more room. Storage is now shared by all your heroes and can be sorted and searched.

**Gear and seeds in the Shop,** starter gear for the slots monsters never drop, and a crafted upgrade for every fighting style at skill 15. Equip upgrades wears every better piece in one press.

**Mosslight Glade is open** for heroes from Level 16 to 31, upstream of the Thicket.

**Town work updates as it goes:** your bag and skill XP move while you cook, smelt or chop, and you can choose how many to make. Rare drops are announced to everyone, with a card you can share.

**Cleared out:** old rewards and quests from an earlier version of the game, and the fox companion.

## v0.2.30 — 2026-10-22 (Told when to reload)

**The game tells you when a new version is out.** If you keep Hearthrise open while we update it, a bar at the top says a new version is out, with a Reload button. No more playing an old version against a new server.

## v0.2.29 — 2026-10-22 (Pick your supplies, loot worth fighting for)

**Every bar slot names one supply.** There is no more "Any food": you pick which food, drink or rune goes in each slot, and the order of your slots is your fallback. Your own stock is used first; store items are bought as used. **If your bar had "Any food" or "Any drink", open it and pick a food and a drink again.**

**Saved setups.** Each setup keeps its own bar and gear. Name it, rename it, switch to it in town, or delete it.

**Loot worth the fight.** Every monster in the Thicket and the Sewer now drops coin, a junk item, bones where it has them, its own monster part, and a piece of gear. Only Old Grayjaw and the Rat King carry the rares, and in a party the rare goes to the highest roll, one winner at a time. A rare drop now gets its moment on screen.

**Monsters per pull is yours to set on each hunting ground,** and a hero hunting alone is no longer sent to a party ground.

## v0.2.28 — 2026-10-22 (Easier to learn, honest numbers)

**New heroes learn how to fight.** Creating a hero now explains that there is no class to pick: the weapon you hold is how you fight, and all six starter weapons are in your bag. Each style says what it does and what it uses. Outfits now have names that describe the clothes, not a class.

**Help that helps.** Settings has a Help page with short notes on hunting, playing with the game closed, stamina, food and drink, the action bar, Level and skills, several heroes and death. The first hunt tells you your hero keeps hunting after you close the game.

**What next.** When the guide ends, it points to your next hunting ground and your weapon skill's next unlock. Reaching a new Level now shows over your hero. Coming back after a while shows what your hero did while you were away.

**Work in town.** The Gathering and crafting window (G) now lets you start any gathering or crafting skill you have the level for: chop trees, mine ore, smelt bars, forge tools, cook food. Your hero keeps working while you are away, and a hunt stops it. Raw food in your bag has a Cook all button.

**Numbers you can trust.** The food on the hunt bar counts what is really in your hunt bag. Max health updates as soon as you level up. Gold now means coins only; unsold loot has its own line. Bones are kept for Prayer when you sell all loot, and the hunt summary's Open bag button works.

## v0.2.27 — 2026-10-22 (Level XP and training, clearer deaths)

**Level XP and training XP are shown apart.** The hunt analyzer, the hunt summary and the hunt list now count Level XP on its own, so two heroes in one party show the same Level XP for the same kills. Premium heroes get a new Training tab with the XP each skill earned and its pace per hour. Personal bests on the hunt list are now Level XP per hour.

**A death tells you what happened.** When a hero dies you see where, what killed them, the XP each skill lost and what a Blessing kept. You see it on return too, even if you were away.

**Equipping answers at once.** Wearing or removing an item shows straight away, with a small ring until the server confirms it.

**See who else is playing.** A small counter shows how many heroes are playing right now (desktop).

**Smoother hunts.** The hunt screen repaints once per server answer instead of several times, and the analyzer clock no longer lags or jumps back. When a hero dies, the rest of that combat round stops at once, so a party member no longer runs off after a death.

## v0.2.26 — 2026-10-21 (Personal bests, sturdier iron)

**Your best on every hunting ground.** Each card in the hunt list now shows your hero's best XP per hour and best balance per hour there, Solo and Party apart, from any finished hunt of 10 minutes or more. The hunt summary shows balance per hour for everyone.

**Iron and steel armour now beat bronze.** Some iron and steel pieces were missing their armour type, so iron plate gave less health than bronze. Every armour piece now gets stronger as its tier goes up. Iron and steel plate also carry the same small ranged and magic accuracy cost as bronze plate.

**A much weaker tank no longer holds the pack.** When two tanks share a party and one is far weaker, the stronger tank holds every lap instead of taking turns, so the weaker one stops dying at the back of the Sewer.

**Steadier party hunts.** The server now spreads hunt updates by load, and the character sheet shows the same health and mana as the hunt bar. A window docked at the side no longer covers the hunt analyzer or the fight.

**Six drinks you can tell apart**, with new supply icons in the bag and on the action bar.

## v0.2.25 — 2026-10-21 (One tank holds)

**Two tanks no longer swap the pack.** In a party with two tanks, one tank holds the monsters for a whole lap of the route; the other only pulls off monsters that go for a healer or damage dealer. The holder changes at the start of each lap, so both tanks still train Defense, and nothing swaps in the middle of a fight.

## v0.2.24 — 2026-10-21 (More heroes, working casters, steadier hunts)

**Buy more hero slots.** "Your characters" now sells a third, fourth and fifth hero slot for 15,000, 40,000 and 120,000 gold, paid by the hero you pick. Play up to four heroes at once.

**Mages and Healers pay their way.** Mana drinks restore twelve times as much, Fireball no longer needs runes, and Nature's Wrath costs less mana and hits every monster. A Sewer party now hunts a full hour and every role comes out ahead.

**Fights that make sense.** Challenge pulls monsters onto the tank who cast it, so two tanks share the pack and both earn Defense. Targeting "Strongest" and "Follow player" pick the right monster, a second hero always walks to its target, Hunter's Mark adds its damage, and resistances now count. No boss or monster hits for more than about a third of your health at its ground's level, so the Rat King and Chief Coppercap hit much softer.

**No more freezes when a hero dies.** A party hunt no longer locks up the browser when the tank dies, and a refresh always recovers.

**A new action bar.** Health, mana, food and charm sit in one hub. Drag one slot onto another to swap or insert it; a crossed-out slot says why it can't fire. Hunt settings live on the bar, take effect mid-hunt, and warn you when a heal is set below the biggest hit the hunt can land.

**Every click answers at once,** and a refused action says why in plain words.

**Your heroes together.** Switching between your heroes keeps both in town, dead monsters stay dead, every hero shows their own name, and party members wear their own outfits.

**A new start.** New heroes go from the Mill Cellar to Meadowbrook Thicket, then to the Sewer with a party at Level 8, and the tutorial walks you through it.

**Report a problem** from the icon row (or press F): it sends your note with everything we need to find the bug.

**Also:** the hunt analyzer's "Next level in" shows your Level, per-hour numbers wait for 10 minutes of hunting, burying is faster, and new icons for store food, drinks, arrows and the practice weapons.

## v0.2.22 — 2026-10-21 (Smooth hunts, better loot)

**Hunts no longer freeze.** The picture used to stop for a moment every few seconds and then rush to catch up; it now keeps moving. A monster you kill stays down, health bars never go black, and monsters no longer pop back up after dying.

**Much better loot.** Low-level gear drops far more often, including bodies and legs, which had no source before; a new hero should fill every gear slot within a few hours of hunting. The Sewer now pays well over its supply cost instead of losing gold.

**Make your hero.** Creating a hero opens a short step: pick a name and the colours of their head, body, legs and feet, then enter town. Every new hero starts with all six practice weapon sets, so you can try every role.

**The Shop sells gear and tools.** Food, drink, ammo and runes are no longer sold in the Shop: pick them on your action bar and they are paid for as you use them.

**Also:** a "Leaving in Ns" countdown when you leave a hunt, every hero you play stands in town, item pictures stop flickering, and an expired login no longer breaks the game.

## v0.2.21 — 2026-10-20 (Party pulls)

**The party leader sets the pull.** In a party, the leader picks how many monsters come at once, and every respawn follows that pick. A boss never shows up twice in the same pull, and a full pull no longer blocks the leader from reaching it.

**Smoother hunts.** Heroes and monsters keep their stride between server updates instead of snapping, a hero no longer spins around between swings, and a monster killed mid-step falls where it stands.

**Faster replies.** The hunt engine now runs next to the game's database, so each hunt update comes back much sooner.

## v0.2.20 — 2026-10-20 (Live hunts)

**Hunts play out live.** Your browser runs the same fight as the server for the hero you're watching, so hunts move smoothly in real time. HP bars for monsters and heroes move with every hit, your whole party is drawn, melee heroes hold their spot, caster bolts fly, and monsters fall and leave a corpse. The server still decides every hit, kill and drop.

**Fair play.** Leaving a hunt takes effect at the next server update, and your browser only learns what it needs to draw your party.

## v0.2.19 — 2026-10-20 (A readable Character window)

**Character window fits any size.** Your hero's name, level and XP bar never sit on top of the stats; in a smaller window the stats move underneath. The XP line reads "15,729 XP to Level 20", and regeneration reads "+1.9% (Prayer)".

## v0.2.18 — 2026-10-20 (Windows over the world)

**Windows float over the world.** Opening, closing, moving or clicking a window never shifts the world. Your hero stays in the middle of the screen.

## v0.2.17 — 2026-10-20 (Your heroes' own names)

**Real names everywhere.** Chat, nameplates, the party and your friends list show each hero's own name.

**Your hero stays put.** After a hunt your hero waits at the town arrival point until you move it or click a station.

**Fixed:** when someone left a party mid-hunt, the rest of the party's hunt could stop moving.

## v0.2.16 — 2026-10-20 (Parties that work)

**Invite to party.** Right-click a player (or their nameplate, or a friend) and choose Invite to party. It shows "Party full" when there's no room.

**Town activities never block a hunt.** Starting a hunt or a party hunt stops whatever your hero was doing in town. After a hunt, your hero only goes back to an activity you chose, and any running activity shows with a Stop button.

**Your other heroes stay in town.** Switching to another character no longer makes the one you left vanish.

**Fixed:** a party that started a second hunt in the same place could freeze. Hunts also keep moving smoothly on the server even when one falls far behind.

## v0.2.15 — 2026-10-20 (Wands and spellbooks)

**Icons for every wand and spellbook.** Mage weapons now show their own icons in the bag, the shop and the character window.

## v0.2.14 — 2026-10-20 (Eat, drink, fight)

**One cooldown for food and drink.** Food and drink share a 2-second cooldown. When it's ready, whichever slot's condition matches goes first, and new heroes eat before they drink.

**Straight into the fight.** Pressing Enter starts the hunt at once, with no walk countdown.

**The Sewer.** The second hunting ground is now simply called The Sewer.

**Fixed:** leaving a hunt and entering again right away no longer leaves the new hunt frozen.

## v0.2.13 — 2026-10-20 (Your heroes, together)

**See your other heroes.** Your other characters now walk around town like any other player.

**Party panel in town.** The Party panel lists your party while you're in town, not only during a hunt.

## v0.2.12 — 2026-10-20 (Spells and corpses)

**Mages and healers show their attacks.** Wand and staff attacks now fire visible bolts.

**Monster art filled in.** Missing monster frames on the live hunting grounds were added.

**Sturdier bug reports.** The bug-report form handles long reports safely.

## v0.2.11 — 2026-10-20 (Parties, simply)

**Inviting is one click.** Right-click a player and choose Invite: the first invite makes the party. Your own characters join from the character strip straight away.

**One place for your party.** The Party window has two tabs: Invites, and Find a party (filter by weapon). The leader picks the hunting ground and presses Start with party; it shows who isn't ready yet.

**Safer parties.** You can only join by invite or from the finder, blocked players can't join or invite you, and a kicked member stops sharing loot right away. A member who logs out keeps their seat for 10 minutes.

## v0.2.10 — 2026-10-19 (Analyzer for everyone)

**Hunt analyzer for every hero.** Free heroes see session time, kills, XP and XP per hour, loot value and gold per hour, supplies and balance. Premium adds the detailed breakdowns.

**Tidier screen.** Hunt panels no longer overlap the top bar, and the Configure action window no longer moves the view.

**Max mana** now shows in the Character window, and wands and spellbooks are labelled correctly.

**Steadier connection.** Fixed a loop that could freeze the page when a connection dropped.

## v0.2.9 — 2026-10-19 (Eat when you need to)

**Food fires when you need it.** If your food slot's condition matches, your hero eats right away, even while the last food is still healing. The new food's slow half replaces what was left of the old one.

**Healing shows up.** The hunt analyzer now counts the health your food restores.

## v0.2.8 — 2026-10-19 (See the fight)

**Hunts play smoothly.** Your hero and the monsters show as soon as you enter a hunt, and the fight plays without freezing.

**Real regeneration numbers.** Health and mana regen now show per second.

## v0.2.7 — 2026-10-19 (Level and skills)

**One Level.** Your hero earns Level from kills, and each Level raises your max health and mana. Every hero has mana.

**Five combat skills.** Melee, Ranged, Magic, Defense and Prayer train as you fight. Attack, Strength and Hitpoints are gone.

**Dying sends you home.** If your hero dies, the hunt ends and you return to town with full health and mana, losing a little Level progress. In a party, one death sends the whole party home.

**Prayer speeds your regeneration.** Bury bones to train it.

**Wands, spellbooks and staffs.** Mages carry a wand with a spellbook; Healers carry a two-handed staff. The first of each are in the Local Shop.

**A fresh start.** Every character was cleared for the new rules. Every account starts with two hero slots.

## v0.2.6 — 2026-10-19 (The action bar)

**Set up your bar.** Twenty numbered slots, in town and on the hunt. Press + on an empty slot to open Configure action, pick a spell, rune or item, add up to three conditions, and save it into the slot.

**Slot 1 goes first.** Each moment, the first slot whose conditions match is the one that fires. Drag slots to change the order. A ! marks a slot that never gets a turn because an earlier one always wins, and hovering explains why.

**No need to stock up.** Pick Any food or Any drink and your hero uses its own stock first, then buys from the store at the shop price as it goes.

**Density on the hunt.** Choose how busy a hunting ground is from the Hunts window before you go.

## v0.2.5 — 2026-10-19 (Bones, bank and a second hero)

**Bury bones.** Bones in your bag now have Bury all. Your hero buries them and earns Prayer; press Stop to finish early.

**Store exactly what you want.** In Storage, a press moves one, Shift moves the whole stack, and right-click asks how many.

**A second hero.** Every account now starts with two character slots. The character screen shows each hero's name and level, and Create character on the empty slot.

## v0.2.4 — 2026-10-19 (Steady windows)

**Windows behave.** The X closes a window without shuffling the others, and windows reopen where you left them.

**The camera holds still.** Opening, closing or clicking inside a window no longer jumps the view; it eases over smoothly.

**Right-click works,** on players and on their names.

**No false supply warnings.** When the store pays per use, you won't be told you're out of food or drink, and heroes without mana never hear about drinks.

**Clearer hunt status.** The Hunts window says when you've arrived, and the party window's notes follow the hunting ground you pick.

## v0.2.3 — 2026-10-19 (Stay where I put you)

**Your hero stays put.** After you walk somewhere and stop, your hero no longer wanders off on its own. Starting a new activity still walks it to the right spot.

## v0.2.2 — 2026-10-19 (Hunts that run)

**Hunts play out while you watch.** Your hunting ground now shows the fight as it happens: packs, pulls, kills and loot keep updating instead of sitting still.

**Leave hunt works.** Pressing Leave hunt now brings your hero straight back to town.

## v0.2.1 — 2026-10-19 (Town and friends)

**See each other in town.** Other players now walk through The Common in their own outfits. Right-click anyone to inspect their gear, send a message, add a friend, invite them to your party or block them.

**Real chat.** Channels for everyone nearby, your party and the system, private whispers, a friends list and item links.

**Smarter hunting.** Tell each action bar slot when to fire (heal below a set health, switch arrows when enough monsters bunch up), pick how many monsters to pull, and choose where to hunt from the new Hunts list. Two new hunting grounds: Meadowbrook Thicket and Coppercap Warrens.

**Your character.** A Character window with your skills, stats, outfit and deaths; one Inventory for your bag and gear; storage anywhere in town; and Services for stamina, blessings and your name.

## v0.2.0 — 2026-10-18 (The hunt)

**Hunting is here.** Take your character into the Mill Cellar, then down into the Millrace Sewer and its Rat King. Watch the fight play out: your party moves, pulls and kites on its own while you set the strategy (target, stance, distance, what to eat and drink) from the action bar. The hunt analyzer tracks kills, XP, gold and supplies.

**Everything you carry, in one place.** A bag with search, filters, tooltips, item locks and a loot filter; gear, skills, a shop with one-tap restocking, and hunt prep that checks you're ready before you go. Party up, switch between up to four of your characters, and get an alert when something important happens.

## v0.1.0 — 2026-10-18 (First steps)

**Hearthrise takes its first steps.** Sign in and step into your character's world: your home, the town and the paths beyond. Windows for your pack, gear and hunts sit around the world, ready to open. Hunting now runs on a brand-new engine on the server, so heroes hold their ground, pull and fight together while you watch.
