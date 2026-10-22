# Hearthrise — Changelog

The welcome modal reads this file on first load after a new version. New entries
go at the top. Format: each version is a `## vMAJOR.MINOR.PATCH — YYYY-MM-DD (Title)`
heading, followed by short, player-friendly text (not commit-log style).
Versions are semver: a patch per release, a minor per milestone, 1.0.0 for full release.

## v0.2.28 — 2026-10-22 (Easier to learn, honest numbers)

**New heroes learn how to fight.** Creating a hero now explains that there is no class to pick: the weapon you hold is how you fight, and all six starter weapons are in your bag. Each style says what it does and what it uses. Outfits now have names that describe the clothes, not a class.

**Help that helps.** Settings has a Help page with short notes on hunting, playing with the game closed, stamina, food and drink, the action bar, Level and skills, several heroes and death. The first hunt tells you your hero keeps hunting after you close the game.

**What next.** When the guide ends, it points to your next hunting ground and your weapon skill's next unlock. Reaching a new Level now shows over your hero. Coming back after a while shows what your hero did while you were away.

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
