# The Review Book — Content Library

**Author:** Game Designer · **Date:** 2026-08-16 · **Status:** CANDIDATES ONLY. Nothing here is built,
nothing here is decided. Tyler approves/rejects each entry by id.
**Ruling this serves:** `DECISIONS.md`, 2026-08-16 — *"the Game Designer produces a LIBRARY of monster
categories/types/enemies as candidates; Tyler picks from it. Nothing ships un-picked."*

**Every id is stable.** `MON-BEA-03`, `ITEM-NEW-12`, `PROG-04`. Approvals reference the id, not the name.
Renaming an entry later does not move its id.

**Source data measured, not assumed:** 31 monsters / 6 families in `src/data/monsters.js`; 426 items in
`src/data/items.js` (armor 145 · weapon 41 · jewelry 20 · ammo 8 · tool 30 · material 178 · trophy 3 ·
companion 1); 6 dungeon/raid bosses in `src/data/bosses.js` — which **already** carries `style`,
`weakness`, `resist[]`, `reqLv`, `mechanic`, i.e. the target monster schema exists in the repo today.

---

## 0 · What I recommend, per library

**MONSTERS.** Adopt an **11-category taxonomy** (Tibia's bestiary uses 21; OSRS uses 12 attributes; we
want the number a player can hold in their head). The single most important recommendation in this whole
document: **the CATEGORY carries the weakness profile, and an individual monster may override at most one
axis.** That is OSRS's bane-weapon model — "demonbane hurts demons", not "this specific hellhound is weak
to this specific sword" — and it turns a 100-row memorisation problem into eleven learnable sentences.
**Retire `neutral`** (6 of 31 monsters currently opt out of the triangle entirely); every category gets a
real weapon weakness, distributed 3/3/3/2 across sword/hammer/ranged/magic. Elements ride on top as the
second axis exactly as `consumable-economy.md` §11 specifies (additive, clamped 1.35). **74 candidate
monsters below; my priority slice is the 7 that fill Arcane T1/T4/T6 and the four brand-new categories
that give tiers 4–6 an identity that is not "the bear, again, but bigger."**

**ITEMS.** The live catalogue is **structurally healthy and thematically flat**: 145 armour pieces are
seven ladders of the same six slots, and 178 of 426 items are materials. What is missing is not more
rungs — it is **items that make a decision**. So the 44 candidates below are weighted away from "+2 more
defence" and toward **bane gear (OSRS), category charms (Tibia's charm system / OSRS salve amulet),
utility items that change what you can do rather than how hard you hit, and cosmetics that carry a real
non-throughput function.** Two live gaps get filled on the way: the `earrings` slot (6 items, all
shipped b343 or later) and the ~15 marquee boss mats that still vendor as trash.

**PROGRESSION.** Ten mechanisms. **My strong recommendation is PROG-01 (Bestiary Charms, from Tibia)**,
because it is the only one on the list that makes the monster rework *pay* — it converts 74 monsters ×
kill counts into a progression system with no new grind, and it is the natural home for category-bane
power without touching the throughput fuse. Second is **PROG-02 (Achievement Diaries, OSRS)**, which pays
in **access and convenience** rather than percentages and is therefore fuse-free by construction.
**Reject PROG-07 (prestige) outright** — it is the one mechanism that can make a player worse off for
having played, and it is incompatible with the `renownHigh` no-demotion ratchet.

**The constraint every entry is written against.** `power-budget.js` fuses permanent throughput at +20%
per key and +30% total, and the accrual Edge Function passes `zeroBonus` — **so a percentage reward is
expensive and a client-side one is a lie on the server.** Rewards that are *unlocks*, *access*,
*capacity*, *convenience*, *cosmetic* or *category-scoped combat identity* cost nothing from that budget.
I have marked every entry `FUSE: free / scoped / costs budget` so Tyler can see the price before approving.

---

## 0.1 · Reading notes — what an approval commits us to

These are facts from the b342 audit (`agility-and-monster-foundation.md` Part 2), not caveats:

- **A new monster is not a data row.** It is a data row + a commissioned Style B portrait + a
  `HR_MONSTER_GLYPHS` entry + a `LOCAL_MONSTER_ICON` entry + drop routing + a catalogue regen + an Edge
  redeploy. **≈0.5 day each, and the portrait is the long pole.** Approving 74 monsters is approving 74
  portraits. Approving 20 is a sane first wave.
- **Renaming an existing monster costs live Renown** (measured: 412 → 212 from one id). `MONSTER_ALIAS`
  does not exist and is the hard prerequisite. **Every "folds into" note below means re-categorising, not
  renaming** — `family` is not a save key; `id` is. Folds are free. Renames are not.
- **Adding monsters lowers every existing player's collection-log completion %** (the denominator is
  `Object.keys(MONSTERS).length`). Free before the wipe, expensive after. Argues for doing the roster
  expansion in one wave, pre-round-2.
- **Retiring `neutral` deletes `NEUTRAL_DROP_BONUS` ×1.15**, which 6 monsters currently pay instead of a
  weakness. That is a real drop-rate nerf to those 6 unless it is re-homed. → Systems, flagged.

---

# LIBRARY 1 — MONSTERS

## 1A · The taxonomy

**Grounding.** Tibia's Bestiary ships **21 classes** (Amphibic, Aquatic, Bird, Construct, Demon, Dragon,
Elemental, Extra Dimensional, Fey, Giant, Human, Humanoid, Inkborn, Lycanthrope, Magical, Mammal, Plant,
Reptile, Slime, Undead, Vermin) each with a completion title. OSRS instead uses **12 combat attributes**
(Demon, Draconic, Fiery, Flying, Golem, Kalphite, Leafy, Penance, Rat, Shade, Spectral, Undead, Vampyre)
that exist purely to make *bane gear* work. Melvor has no taxonomy at all — it has a **combat triangle**
(Melee > Ranged > Magic > Melee, ±10% damage / ±25% resistance).

**What I take from each:** Tibia's *category-as-collectable* (it is the reason their bestiary is a
progression system, not a list) · OSRS's *category-as-the-thing-gear-targets* · Melvor's *discipline about
magnitude* (their triangle is ±10%, not ±100% — ours is +20% weapon / +15% element, already in the same
register).

**Eleven categories.** Sized so a player can name them all, and so every one of the six existing families
has a home.

| # | Category | Identity in one line | Weapon weak | Weapon resist | Element weak | Element resist |
|---|---|---|---|---|---|---|
| 1 | **Beast** | Mundane animals, fast and unarmoured. The tutorial category. | ranged | magic | Ember | — |
| 2 | **Vermin** | Small, many, and it does not care how sharp your sword is. | hammer | ranged | Frost | **Blight (immune)** |
| 3 | **Humanoid** | People who chose this — goblins, brigands, ogres, giants. Armoured, drops gear. | sword | — | Blight | — |
| 4 | **Undead** | Bones and grief. Crush them; poison does nothing to the dead. | hammer | — | Ember | **Blight (immune)**, Frost |
| 5 | **Arcane** | Casters. Glass, and they hit like a cart. Interrupt them. | ranged | magic | Blight | — |
| 6 | **Elemental** | It *is* the element. Immune to its own, ruined by its opposite. | magic | sword | *(opposed, per-monster)* | *(own, immune)* |
| 7 | **Construct** | Stone, clay, clockwork. No blood to spill, no lungs to poison. | hammer | ranged, **Blight (immune)** | Frost | Ember |
| 8 | **Fey** | The old things in the hedge. Cold iron is the only honest answer. | sword | ranged | Ember | Frost |
| 9 | **Demon** | Things that came up. Magic-shy, and fire is their native language. | magic | — | Frost | **Ember (immune)** |
| 10 | **Draconic** | Wyrms, drakes, wyverns. Scaled against blades, open to a good shot. | ranged | sword | *(opposed to its breath)* | *(its breath, immune)* |
| 11 | **Aberrant** | Endgame only. Its weakness is not printed until you have killed enough of it. | *(per-monster)* | *(per-monster)* | *(exactly one, per-monster)* | *(the other two)* |

**Distribution check.** sword 3 · hammer 3 · ranged 3 · magic 2 (+3 per-monster categories). Ember 3 ·
Frost 3 · Blight 2 (+3 per-monster). No style is ever "the wrong build"; every style has a home category
at every tier band.

**Elements.** Three, as specced: **Ember · Frost · Blight**. A fourth — **Radiant** — is the obvious fit
for Undead and Demon and I am *not* proposing it: it costs +3 enchanting runes, +2 elemental arrow/
whetstone lines, and it would give Undead two weaknesses. Named here so the decision is explicit.
→ `DEC-ELEM-04`, Tyler's call.

**The override rule (this is the design, not a detail).** A monster inherits its category's whole profile.
It may override **exactly one axis**, and the override must be *legible from the name and the art*.
Winterpelt Wolf resists Frost — you can see the coat. Ashen Wyrm breathes Ember so it fears Frost — you
can see the smoke. **A monster with two overrides is rejected in review.** This is what keeps eleven
sentences from becoming seventy-four rows.

## 1B · Where the current 31 land

Nothing is renamed. `family` is re-pointed, `elementWeak` is added, `weaponWeak` changes only where noted.

| Category | Existing monsters folded in | Changes |
|---|---|---|
| Beast | small_wolf, wolf, dire_wolf, bear, panther, ancient_bear | `small_wolf` neutral→**ranged**; `wolf`/`death`-line hammer→ranged. Complete ladder T1–T6 already. |
| Vermin | slime, rat, giant_bat, venom_spider, plague_swarm | `giant_bat` ranged→hammer. Loses void_parasite + shadow_creeper to Aberrant → **T5/T6 holes to fill**. |
| Humanoid | goblin, hobgoblin, goblin_brute, goblin_warlord, warband_captain, war_king, **mountain_troll** | Goblinoid renamed as a *family label only*. `goblin` ranged→sword. **mountain_troll moves Beast→Humanoid** — it is the sixth T4 entry and duplicates `bear`; this is also the monster with no portrait, so it needs Art either way. |
| Undead | weak_skeleton, skeleton, zombie, wraith, death_knight, lich | `weak_skeleton`/`skeleton`/`zombie`/`wraith`/`lich` magic→**hammer**. Complete ladder. |
| Arcane | dark_wizard, warlock, archmage | all three neutral→**ranged**. **T1, T4, T6 empty — the biggest hole in the game.** |
| Elemental | *(none — wholly new)* | — |
| Construct | *(none — wholly new)* | — |
| Fey | *(none — wholly new)* | — |
| Demon | lesser_demon | neutral→**magic**. T1–T3, T5, T6 empty. |
| Draconic | dragon | neutral→**ranged**; `elementResist: ember` (it is a *Green* Dragon — Blight breath is the better read, → `DEC-DRA-01`). |
| Aberrant | shadow_creeper, void_parasite | Moved out of Vermin. Both already read as void-touched. |

**Six `neutral` monsters get real weaknesses** (slime, small_wolf, dark_wizard, warlock, archmage,
lesser_demon, dragon). That is the weakness redo, in one line.

## 1C · Candidate monsters

Format: **id · Name** — tier · weakness profile · *inspiration* · hook.
`W:` weapon weak, `E:` element weak. Blank = inherits the category default from §1A.

### Beast — MON-BEA
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-BEA-01 | **Hedgerow Boar** | 1 | default | OSRS Lumbridge boars | The first thing that fights back on your own land; drops the hide that makes your first belt. |
| MON-BEA-02 | **Moorland Stag** | 2 | default | Tibia Ungulates | Runs. High evade, low HP — the monster that teaches you accuracy is a stat. |
| MON-BEA-03 | **Fen Adder** | 2 | E: **Frost** *(override)* | Tibia Serpents | Cold-blooded: chill it and it stops. The first monster whose element does not match its category. |
| MON-BEA-04 | **Thicket Lynx** | 3 | default | OSRS Jungle cats | Ambusher — opens at a higher hit than it sustains. |
| MON-BEA-05 | **Crag Bighorn** | 3 | W: **hammer** *(override)* | Tibia Ungulates | It charges; you meet it with something blunt. Horn is a Fletching input. |
| MON-BEA-06 | **Winterpelt Wolf** | 4 | E resist: **Frost**, weak Ember | Tibia Mutated Mammals | The teaching exception: the coat is on the portrait, and Frost arrows do nothing. |
| MON-BEA-07 | **Bogwallow Sow** | 5 | default | OSRS Hill giants band | Fat, slow, enormous HP — the away-farming beast, forgiving of a bad loadout. |
| MON-BEA-08 | **Tarn Serpent** | 5 | W: hammer *(override)* | Tibia Hydras | Freshwater horror; the only Beast that drops a scale line rather than a pelt. |
| MON-BEA-09 | **The Greatelk of the Long Dark** | 6 | default, `boss` | EverQuest named-mob tradition | A wandering boss with no lair — it appears on the map, and you either brought a bow or you did not. |

### Vermin — MON-VER
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-VER-01 | **Barn Rat** | 1 | default | OSRS/Tibia Rat | Folds beside `rat`; the homestead's own pest, killable in the first minute. |
| MON-VER-02 | **Hive Wasp** | 1 | W: ranged *(override)* | Tibia Insects | Flies. The one T1 monster that answers a bow, so the ranged starter has a target. |
| MON-VER-03 | **Grain Weevil Swarm** | 2 | default | Tibia Vermin class | Eats your farm plot's yield if left alive — the first monster with a *reason* beyond XP. |
| MON-VER-04 | **Tunnel Centipede** | 3 | default | Tibia Myriapods | Mining-adjacent spawn; drops the chitin that starts the leather-alternative armour line. |
| MON-VER-05 | **Brood Widow** | 4 | default | OSRS Kalrag / Tibia Arachnids | Spider matriarch; silk faucet for the Emberhead arrow chain, which is currently silk-starved. |
| MON-VER-06 | **Carrion Fly Cloud** | 5 | E resist: **all but Frost** | Tibia Hive Born | Dense enough that only cold thins it — the clearest single-element puzzle in the mid game. |
| MON-VER-07 | **Chitin Broodmother** | 6 | default, `boss` | Tibia Hive / OSRS Kalphite Queen | Two-phase in fiction (she is why the brood exists); the Vermin capstone the family has never had. |
| MON-VER-08 | **Cellar Ooze** | 2 | W: hammer, E resist: all | Tibia Slime class | Splits conceptually from `slime`; immune to every element, so it is a pure weapon-triangle check. |

### Humanoid — MON-HUM
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-HUM-01 | **Roadside Cutpurse** | 1 | default | OSRS Bandits | Steals gold on hit instead of dealing damage — the first monster you are *annoyed* by. |
| MON-HUM-02 | **Marsh Dworc** | 2 | default | Tibia Dworcs | Fetish-bearer; drops the totem line `goblin_totem` currently dead-ends into. |
| MON-HUM-03 | **Deserter Sergeant** | 3 | W: hammer *(override — plate)* | OSRS Ardougne/Al Kharid guards | Wears real armour: the first monster where your weapon choice is about *his* kit, not his species. |
| MON-HUM-04 | **Quarry Trollkin** | 3 | default | Tibia Trolls | Stonemason-adjacent; drops rubble and the first `dressed_block` shortcut. |
| MON-HUM-05 | **Hillstone Ogre** | 4 | default | Tibia Giants | Huge max hit, terrible accuracy — the monster that makes food matter more than defence. |
| MON-HUM-06 | **Frostbeard Giant** | 5 | E resist: Frost, weak Ember | Tibia Frost Giants | Northern raider; the Ember arrow's first genuinely worth-it target. |
| MON-HUM-07 | **Brigand Warlord** | 5 | default | OSRS Bandit Camp | Human antagonist for a game whose enemies are otherwise all monsters. Drops a real gear piece, not a mat. |
| MON-HUM-08 | **Stonejaw, Chief of the Ninth Camp** | 6 | default, `boss` | EverQuest named orcs | The Goblinoid ladder finally ends in a *person* with a name, not "War King". |

### Undead — MON-UND
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-UND-01 | **Churchyard Wight** | 2 | default | Tibia Undead Humanoids | Fills the gap between skeleton and zombie; first `grave_dust` at a sane tier. |
| MON-UND-02 | **Plague-Cart Ghoul** | 3 | default | Tibia Ghouls | Blight-immune *and* Blight-dealing: teaches "immune" and "inflicts" are different words. |
| MON-UND-03 | **Barrow Sentinel** | 4 | default | OSRS Barrows | Guards a dungeon key; the first undead that drops equipment rather than remains. |
| MON-UND-04 | **Drowned Bellringer** | 4 | W: **magic** *(override)* | Tibia Aquatic Undead | Waterlogged — the one undead where crushing does nothing and magic is the answer. |
| MON-UND-05 | **Grave-Choir Banshee** | 5 | default | OSRS Banshee | Screams: high damage, no defence. Wants the Agility dodge stat if that ships. |
| MON-UND-06 | **Bonepit Revenant** | 6 | default | OSRS Revenants | The `big_bones` endgame faucet, and the Prayer payoff's best customer. |
| MON-UND-07 | **Coldbrook Vampyre** | 6 | E: **Ember**, W resist: ranged | OSRS Vampyre attribute | Wooden shafts do nothing; fire does everything. The purest bane-item hook in the roster. |

### Arcane — MON-ARC *(the priority: this family is 3 of 6 rungs)*
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-ARC-01 | **Hedge-Witch's Apprentice** | 1 | default | OSRS Wizard (Tower) | **Fills the empty T1.** A caster at level 1 means a new player meets the Arcane silhouette on day one. |
| MON-ARC-02 | **Candle Cultist** | 2 | default | Tibia Voodoo Cultists | Group fiction: the first hint of an organisation behind the monsters. |
| MON-ARC-03 | **Rune-Scarred Adept** | 4 | default | RS3 Runecrafting lore | **Fills the empty T4.** The `magic_essence` faucet at the tier Runecrafting actually needs it. |
| MON-ARC-04 | **Cinder Conjurer** | 4 | E resist: Ember | Tibia Pyromancers | Casts what it is immune to — the first "bring the other element" lesson. |
| MON-ARC-05 | **Sable Astrologer** | 5 | default | Melvor Astrology | Star-reader; drops the only Aberrant-tracking item outside the Aberrant category. |
| MON-ARC-06 | **The Hollow Chorister** | 6 | default, `boss` | Tibia Necromancers | **Fills the empty T6.** Sings the Aberrant into the world — the narrative bridge to category 11. |

### Elemental — MON-ELE *(new category)*
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-ELE-01 | **Hearth Cinderling** | 1 | E: Frost, resist Ember | Tibia Pyro-Elementals | Lives in your own fireplace. A cozy-medieval elemental that is not a lava monster. |
| MON-ELE-02 | **Brookmote** | 2 | E: Ember, resist Frost | Tibia Hydro-Elementals | The mirror of ELE-01 at the same band — the pair is how the element system teaches itself. |
| MON-ELE-03 | **Dustmote Whirl** | 2 | E: Frost, W resist: ranged | Tibia Electro/Geo | Arrows pass straight through. The clearest "your best weapon is wrong here" moment. |
| MON-ELE-04 | **Quarry Geode-Kin** | 3 | E: Frost, resist Blight | Tibia Geo-Elementals | Stonemason's by-product problem, solved as a monster: it drops granite. |
| MON-ELE-05 | **Rimewater Elemental** | 4 | E: Ember, resist Frost | Tibia Cryo-Elementals | Frost arrows literally heal the fiction here — the strongest argument for showing resists in the UI. |
| MON-ELE-06 | **Forgeheart Magmakin** | 5 | E: Frost, resist Ember | Tibia Magma-Elementals | Smithing-flavoured; drops `hell_ember`, which is currently vendor trash with no recipe. |
| MON-ELE-07 | **Stormcrag Tempest** | 6 | E: Blight, resist Ember+Frost | Tibia Elemental Lords | The one monster that resists two elements; its weakness is the *unpopular* third. |
| MON-ELE-08 | **The Elder Cinder** | 6 | E: Frost, `boss` | Tibia Elemental Lords | Elemental capstone. Its signature drop is the Ember enchanting rune's only non-craft source. |

### Construct — MON-CON *(new category)*
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-CON-01 | **Straw Field-Warden** | 1 | default | *(ours)* — the cozy read of Tibia Construct | A scarecrow that got up. The most Hearthrise monster on this list. |
| MON-CON-02 | **Millstone Golem** | 2 | default | Tibia Stone Golem | Village machinery gone wrong; drops the first `dressed_block` outside Stonemason. |
| MON-CON-03 | **Clay Guardian** | 3 | default | Tibia Clay Guardian | Slow, huge defence, no damage — a pure DPS-check target with zero food cost. |
| MON-CON-04 | **Rusted Watchknight** | 4 | default | OSRS Animated Armour | Empty armour: kill it and you get the armour. The most honest drop table in the game. |
| MON-CON-05 | **Cathedral Gargoyle** | 5 | default | OSRS Gargoyle (rock hammer) | **Requires a specific item to finish** — the roster's one bane-item gate, and the reason ITEM-NEW-06 exists. |
| MON-CON-06 | **The Clockwork Reeve** | 6 | default, `boss` | Tibia War Golem / RS3 automatons | A tax collector that never stopped. Construct capstone; drops the Invention-style component if PROG-05 ships. |

### Fey — MON-FEY *(new category)*
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-FEY-01 | **Hollow-Log Sprite** | 1 | default | Tibia Fae | Woodcutting-adjacent: it appears while you chop. The first monster that finds *you*. |
| MON-FEY-02 | **Bramble Puck** | 2 | default | Tibia Fae / English folklore | Steals a gathered item instead of dealing damage; you get it back when you kill it. |
| MON-FEY-03 | **Toadstool Piper** | 3 | W resist: ranged | Tibia Fungi | Rings of mushrooms; drops the buff-food line that `foodClass:'buff'` is starved of. |
| MON-FEY-04 | **Bog Hag** | 4 | default | Tibia witches / Slavic folklore | Casts, but is Fey not Arcane — the same silhouette in two categories is how a taxonomy earns its keep. |
| MON-FEY-05 | **Thornwood Dryad** | 5 | E resist: Ember *(override)* | Tibia Plant class | Green wood does not burn. The override that the whole category's Ember weakness is written to set up. |
| MON-FEY-06 | **The Oakenmother** | 6 | default, `boss` | Tibia Plant bosses / OSRS Grotesque | Fey capstone; her heartwood is the Duskwood plank line's only non-gathered source. |

### Demon — MON-DEM *(splits out of Mythic)*
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-DEM-01 | **Soot Devil** | 3 | default | Tibia Fire Devil | The first demon, deliberately not at T1 — the category should *arrive*, loudly. |
| MON-DEM-02 | **Cinder Hound** | 4 | W: ranged *(override)* | OSRS/Tibia Hellhound | Fast: closes distance, so the melee player gets the easier fight for once. |
| MON-DEM-03 | **Chained Torturer** | 5 | default | Tibia Dark Torturer | Bound, and it wants you to unbind it — hook for a quest that is not a kill count. |
| MON-DEM-04 | **Brimstone Fury** | 5 | E: Frost, W resist: sword | Tibia Fury | Blades glass over; the Frost whetstone's first mandatory target. |
| MON-DEM-05 | **Vharek, the Pitlord** | 6 | default, `boss` | Tibia Demon / OSRS K'ril | Demon capstone. Demonbane gear (ITEM-NEW-01) is measured against this fight. |

### Draconic — MON-DRA
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-DRA-01 | **Marsh Wyrmling** | 3 | E: Ember (breathes Frost) | OSRS Wyrms | A dragon you can fight at level 30 — the category currently starts and ends at T6. |
| MON-DRA-02 | **Cliffside Wyvern** | 4 | E: Frost (breathes Ember) | OSRS Wyverns | Needs no shield gimmick; just a real T4 flier with a bone drop the Prayer chain wants. |
| MON-DRA-03 | **Cavern Wyrm** | 4 | W: hammer *(override — no wings)* | Tibia Wyrms | Burrower. The Draconic that answers a hammer, so the family is not a bow-only tax. |
| MON-DRA-04 | **Bronze-Scale Drake** | 5 | E: Blight (breathes neither) | Tibia Draken | Metal-scaled; its hide is the bridge between leather and plate armour lines. |
| MON-DRA-05 | **Frostmaw the White** | 6 | E: Ember, resist Frost, `boss` | OSRS Vorkath / Tibia Dragon Lord | The second real boss. Green Dragon has been alone at the top since launch. |
| MON-DRA-06 | **Ashwing** | 6 | E: Frost, resist Ember, `boss` | Tibia Hellfire | Frostmaw's opposite — one weekly rotation slot, two opposite loadouts. |
| MON-DRA-07 | **Elderscale (existing raid boss)** | 6 | ranged / resist melee | already in `bosses.js` | Named here only so the raid roster and the monster taxonomy stop being two vocabularies. |

### Aberrant — MON-VOI *(new category, T4+ only)*
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-VOI-01 | **Thin-Place Mote** | 4 | one hidden element weakness | Tibia Extra Dimensional | Its weakness is `???` in the bestiary until 25 kills. **This is PROG-01's proof of value.** |
| MON-VOI-02 | **Star-Bitten Husk** | 5 | one hidden; W: sword | Tibia Inkborn | Was a person. The drop table is that person's belongings — the saddest loot in the game. |
| MON-VOI-03 | **The Silence That Walks** | 6 | one hidden; W resist: ranged | Tibia Extra Dimensional | No combat log lines while it is alive — the fight is quiet. Art + Systems dependency, flagged. |
| MON-VOI-04 | **The Unlit** | 6 | one hidden, `boss` | Tibia Ruthless Seven | Aberrant capstone and the endgame's actual final boss, which the game currently does not have. |

**Counts.** 74 candidates across 11 categories. Every category has ≥4 rungs; Beast/Vermin/Humanoid/Undead
run T1–T6 complete; Elemental and Construct arrive at T1 so a new player meets more than four silhouettes.

---

# LIBRARY 2 — ITEMS

## 2A · What is live today (426 items, measured)

| Role | n | Read |
|---|---|---|
| **Armour** | 145 | 7 tiers × 6 slots × 3 classes (plate 37 / leather 40 / cloth 42) + 5 capes. Generated from curves in `gear-tiers.js` — healthy, and the reason a new tier is one table row. |
| **Weapons** | 41 | sword 15 · hammer 7 · ranged 9 · magic 10. Hammer and ranged are thin relative to sword. |
| **Jewelry** | 20 | necklace 7 · ring 7 · **earrings 6** (the earrings slot was empty until b343). |
| **Ammo** | 8 | The b343 arrow ladder. **Nothing consumes them yet.** |
| **Tools** | 30 | woodcutting/mining/fishing 7 each; smithing/crafting/cooking 3 each — the artisan tools are a third of the depth of the gathering ones. |
| **Materials** | 178 | 42% of the catalogue. Includes 9 seeds, the two-stage refine spine, and ~15 marquee boss mats. |
| **Consumables** | 45 heal + 14 buff | `foodClass` splits healing/buff evenly at 14 each; buff magnitudes run 1–5% for 2–20 min. |
| **Trophy / companion / currency** | 6 | 3 trophies, 1 companion item, 2 currency-rarity items. |
| Rarity spread | — | common 25 · uncommon 30 · rare 37 · epic 41 · legendary 54 · mythic 26 · unique 15. **Legendary is the most common rarity band in the game** — that is a naming problem, not a content one. → Art/UX. |

**The honest diagnosis.** The ladder is complete and the *identity* is missing. 145 armour pieces express
one decision (which tier can I afford) repeated 24 times. There is no item in the game that changes what
you can *do* — only how large your numbers are.

## 2B · Already planned, not yet built (from the specs)

| id | What | Source spec |
|---|---|---|
| ITEM-PLAN-01 | 7 arrows (live, inert) + `ammoPerShot` consumption | `consumable-economy.md` §6.1 |
| ITEM-PLAN-02 | 7 bound runes (air→blood), magic's ammo-slot consumable | §6.2 |
| ITEM-PLAN-03 | 7 whetstones, melee's ammo-slot consumable at 0.02/swing | §6.3 |
| ITEM-PLAN-04 | 3 stone raws (rubble/granite/basalt) + 3 blocks + 3 rune blanks | §8.4, §9.5 |
| ITEM-PLAN-05 | `ashlar` · `keystone` (adopted from Crafting) · `vaultstone` — the castle goods | §8.2 |
| ITEM-PLAN-06 | 9 phase-two elementals: 3 enchanting runes + 3 elemental arrows + 3 elemental whetstones | §11.3 |
| ITEM-PLAN-07 | 7-rung bow ladder re-homed to Fletching via `fam.skill` | §6.1 |
| ITEM-PLAN-08 | Signature drops on gathering/craft actions (the Practice T3 reward) | `progression-depth.md` §2.4 |
| ITEM-PLAN-09 | `desc` on ~280 items + the item→source reverse index | `itemization-rework.md` §2, §5 |
| ITEM-PLAN-10 | Rally Seal sink / seal exchange | `itemization-rework.md` §7 |

## 2C · New candidates (44)

Format: **id · Name** — slot/role · tier · what it does · *inspiration*.
`FUSE:` free = no throughput budget consumed · scoped = category-only · costs = draws on the +52% stack.

### Bane gear — category-targeted weapons (the OSRS steal that makes the taxonomy matter)
| id | Name | Slot / role | T | What it does | Inspiration | FUSE |
|---|---|---|---|---|---|---|
| ITEM-NEW-01 | **Emberlight Brand** | weapon (sword) | 5 | +40% damage vs **Demon** only; ordinary sword otherwise. | OSRS Arclight/Emberlight | scoped |
| ITEM-NEW-02 | **Grave-Iron Maul** | weapon (hammer) | 4 | +40% damage vs **Undead** only. The reason to keep a second weapon. | OSRS Salve amulet / Crumble Undead | scoped |
| ITEM-NEW-03 | **Wyrmshot Limb** | weapon (ranged) | 6 | +40% damage vs **Draconic** only; the Frostmaw/Ashwing answer. | OSRS Dragon hunter crossbow | scoped |
| ITEM-NEW-04 | **Coldiron Shortsword** | weapon (sword) | 2 | +40% vs **Fey**, and the *only* thing that can hurt the Oakenmother's roots. | English folklore / Tibia | scoped |
| ITEM-NEW-05 | **Sanctified Censer** | weapon (magic) | 5 | +40% vs **Aberrant**; reveals the target's hidden element weakness while equipped. | OSRS demonbane spells | scoped |
| ITEM-NEW-06 | **Masonbreaker Pick** | weapon (hammer) | 5 | Required to *finish* a **Construct** (they reassemble otherwise). A gate, not a bonus. | OSRS rock hammer / Barronite mace | free |
| ITEM-NEW-07 | **Verminward Flail** | weapon (hammer) | 3 | +40% vs **Vermin**; low-tier so the bane grammar is taught early and cheaply. | OSRS ratbane | scoped |

> **The rule that makes bane gear safe:** it is a *category multiplier inside `weaknessInfo`*, not a
> `getBonus` key — so it never touches the throughput fuse and it reads identically on the server. Ceiling
> must be an invariant of the expression (`MAX_BANE_MULT`), same as `MAX_WEAKNESS_MULT = 1.35`.

### Charms & amulets — Tibia's bestiary-charm idea as equipment
| id | Name | Slot | T | What it does | Inspiration | FUSE |
|---|---|---|---|---|---|---|
| ITEM-NEW-08 | **Beastcaller's Torc** | necklace | 3 | +1 tier of drop-rate band vs **Beast**; nothing vs anything else. | Tibia charms | scoped |
| ITEM-NEW-09 | **Salt-Rimed Locket** | necklace | 4 | Your Frost element applies to a monster that resists it (once per kill). | Tibia elemental protection | scoped |
| ITEM-NEW-10 | **Tally-Keeper's Ring** | ring | 2 | Bestiary kill counts tick 25% faster for the equipped category. Pure progression, zero combat power. | Tibia Bestiary / OSRS slayer helm | free |
| ITEM-NEW-11 | **Bonecounter's Earrings** | **earrings** | 4 | Prayer XP from every bone you bury, without burying it. Fills the emptiest slot in the game. | OSRS Ectoplasmator | free |
| ITEM-NEW-12 | **Pathfinder's Studs** | **earrings** | 3 | Shows the next unlock threshold for whatever activity you are running, on the tile. | RS3 UI affordances | free |
| ITEM-NEW-13 | **Quiet Earrings of the Unlit** | **earrings** | 6 | Aberrant no longer hide their weakness from you. Endgame convenience as a reward. | Tibia Bestiary completion | free |

### Consumables (the buff catalogue is 14 items and all 14 are percentages)
| id | Name | Role | T | What it does | Inspiration | FUSE |
|---|---|---|---|---|---|---|
| ITEM-NEW-14 | **Hearthbread** | food | 1 | Heals over the next N swings instead of instantly — auto-eat consumes half as many. | Tibia's food-regen model | free |
| ITEM-NEW-15 | **Traveller's Stew** | food (buff) | 2 | While it lasts, gathering yields the *next tier's* material 5% of the time. | Melvor's Mastery yields | costs (small) |
| ITEM-NEW-16 | **Winterdraught** | consumable | 4 | One absence: Frost resistance is ignored on your element. Charges, not a timer (b336 rule). | Tibia elemental potions | scoped |
| ITEM-NEW-17 | **Ratter's Bait** | utility | 1 | Placed on a farm plot: Vermin come to you for 10 minutes. Turns farming into a combat faucet. | OSRS Hunter | free |
| ITEM-NEW-18 | **Bell of Ordinary Hours** | consumable | 3 | Ends the current away accrual early and banks it cleanly. Player-facing control over the offline cap. | Idle Clans' offline framing | free |
| ITEM-NEW-19 | **Whetted Twine** | consumable | 3 | Repairs 50 arrows from 50 broken shafts. A recycling sink for the Fletching chain. | OSRS ammo recovery | free |
| ITEM-NEW-20 | **Sexton's Salt** | consumable | 4 | Consumed on a kill: guarantees the monster's rarest drop *once per real day*. | Tibia loot boosts, hard-capped | free |
| ITEM-NEW-21 | **Cold Kettle Tea** | food (buff) | 2 | +2% to *the blessing currently active*, not to a fixed key. Ties consumables to the events rework. | Idle Clans clan buffs | costs (2%) |

### Utility — items that change what you can do
| id | Name | Role | T | What it does | Inspiration | FUSE |
|---|---|---|---|---|---|---|
| ITEM-NEW-22 | **Drover's Whistle** | utility | 3 | Sets your away target to *the highest-tier monster you can survive*, computed server-side at accrual. | Melvor auto-combat | free |
| ITEM-NEW-23 | **Field Ledger** | utility | 2 | Adds a second auto-action queue slot. Capacity, not power. | Idle Clans queue upgrades | free |
| ITEM-NEW-24 | **Tithe Box** | utility | 4 | Auto-vendors any item you have marked as trash, at the vendor rate, while away. | RS3 Bank presets / OSRS looting bag | free |
| ITEM-NEW-25 | **Carter's Strap** | utility | 3 | +1 market listing slot. The Cellar's dead `+500 storage` perk, repurposed into something real. | Idle Clans market slots | free |
| ITEM-NEW-26 | **Surveyor's Chain** | tool | 5 | While equipped, mining yields its stone by-product at the next grade up. | *(ours — serves Stonemason)* | costs (small) |
| ITEM-NEW-27 | **Lantern of Small Hours** | utility | 4 | Away accrual keeps its *featured* multiplier for the first hour instead of the first 20 minutes. | Melvor offline framing | costs |

### Gear with identity — pieces that are characters, not rungs
| id | Name | Slot | T | What it does | Inspiration | FUSE |
|---|---|---|---|---|---|---|
| ITEM-NEW-28 | **The Reeve's Ledger-Plate** | body | 6 | Constructs' defence is halved against you; everything else's is +10%. A real trade. | RS3 Invention perk trade-offs | scoped |
| ITEM-NEW-29 | **Oakenmother's Braid** | cape | 6 | Regenerates 1 HP per swing while fighting in a *woodland* category (Fey/Beast). | Tibia Fey drops | scoped |
| ITEM-NEW-30 | **Frostmaw's Jaw** | helmet | 6 | Immune to Frost resistance — your Frost always lands. Frostmaw's own signature. | OSRS boss-unique model | scoped |
| ITEM-NEW-31 | **Cutpurse's Half-Glove** | gloves | 2 | Gold from Humanoids +25%; gold from everything else −10%. First build decision at T2. | OSRS Rogue set | scoped |
| ITEM-NEW-32 | **Chitin Weave** *(set: 6 pieces)* | armour line | 4 | Leather-class alternative made from Vermin chitin, not pelts — the second armour supply chain. | Tibia chitin gear | costs (set bonus) |
| ITEM-NEW-33 | **Watchknight Shell** *(set: 6 pieces)* | armour line | 5 | Plate-class set whose bonus is **damage taken while away** reduced, not damage dealt. | *(ours — idle-native set)* | costs |
| ITEM-NEW-34 | **The Quiet Coat** | body | 6 | Aberrant do not gain their first-strike advantage. A defensive answer to a specific category. | Tibia Extra Dimensional counters | scoped |
| ITEM-NEW-35 | **Pitlord's Hoof-Iron** | boots | 6 | Ember immunity → you can stand in Vharek's arena. A *gate key wearing armour*. | OSRS boss prerequisites | free |

### Cosmetics with function
| id | Name | Role | T | What it does | Inspiration | FUSE |
|---|---|---|---|---|---|---|
| ITEM-NEW-36 | **Bestiary Cloak** | cape (cosmetic) | — | Dyed by your most-completed category; the colour *is* the achievement. | Tibia class titles | free |
| ITEM-NEW-37 | **Hearthstone Signet** | ring (cosmetic) | — | Displays your homestead tier on your profile and in clan lists. | OSRS max cape culture | free |
| ITEM-NEW-38 | **Chronicle Ribbon** | trophy | — | Pins one Chronicle entry to your public profile — you choose which kill defines you. | EverQuest AA titles | free |
| ITEM-NEW-39 | **Reeve's Seal** | cosmetic + function | 6 | Cosmetic, *and* it is the Clockwork Reeve's dungeon key. Cosmetics that unlock are the good kind. | Tibia key/decoration duality | free |
| ITEM-NEW-40 | **Homestead Weathervane** | housing | 3 | Shows the current world blessing on your own homestead art. Reads the events system. | Idle Clans clan house | free |

### Tools & materials that close live gaps
| id | Name | Role | T | What it does | Inspiration | FUSE |
|---|---|---|---|---|---|---|
| ITEM-NEW-41 | **Fletcher's Knife** *(3 tiers)* | tool | 1/4/7 | Fletching's tool ladder — artisan skills have 3 tool rungs where gathering has 7. | OSRS tool tiers | costs (speed) |
| ITEM-NEW-42 | **Mason's Rule** *(3 tiers)* | tool | 1/4/7 | Same, for Stonemason. Both are needed the day those skills ship. | OSRS/Melvor | costs (speed) |
| ITEM-NEW-43 | **Deathsteel Ingot** | material | 5 | Gives `death_steel` (a live orphan drop) its first recipe: the Watchknight Shell set. | *(closes an orphan)* | free |
| ITEM-NEW-44 | **Void-Chitin Weave** | material | 6 | Gives `void_chitin` + `hell_ember` + `war_crown` a shared endgame recipe target. | *(closes 3 orphans)* | free |

---

# LIBRARY 3 — PROGRESSION ADVANCEMENT OPTIONS

Ten mechanisms, each independently approvable. **Size** is engineering days including tests, in this
codebase, given what already exists.

---

### PROG-01 · Bestiary Charms — *Tibia*
**How it works (Tibia).** Every creature has a bestiary entry with kill thresholds (e.g. 25/500/1000).
Filling one grants Charm Points; Charm Points buy *charms* you assign to a specific creature — elemental
damage, a bonus-damage proc, a loot bonus. Completing an entire **class** grants a permanent title.
**In Hearthrise.** 74 monsters × 3 thresholds. Threshold 1 reveals the monster's weakness profile in the
bestiary (Aberrant's is *only* obtainable this way). Threshold 3 grants Charm Points spendable on a
**category**, not a monster: +Ember damage vs Undead, +drop band vs Beast. Completing a category grants a
title and a Bestiary Cloak dye (ITEM-NEW-36).
**Size:** ~4–5 days. `G.bestiary` already exists, is already synced, already keyed by monster id, and
already drives Renown. This is a UI + a spend-ledger on data we keep today.
**Retention:** very high, and it is the *right* kind — it gives a reason to fight a monster you have
outlevelled, which is exactly the hole in a tiered roster.
**Fuse:** charm power is **category-scoped and lives in `weaknessInfo`**, so like bane gear it never
enters the `getBonus` chain. Category-scoped means it cannot stack globally: the +52% is untouched.
**Why it is my #1:** it is the only option here whose value *scales with the monster rework*. Approving
74 monsters without it means 74 more things to grind past.

---

### PROG-02 · Achievement Diaries — *OSRS*
**How it works.** Per-region task sets at Easy/Medium/Hard/Elite. Rewards are almost never damage — they
are **access and convenience**: better resource yields in that region, free teleports, a bank chest, a
shortcut.
**In Hearthrise.** Diaries by *place* — Wanderer's Camp, the Fen, Stormcrag, Emberfall, the Dawnspire.
Easy = "chop 50 oak, cook 20 trout, kill 10 Vermin"; Elite = "kill Frostmaw, reach Stonemason 85".
Rewards: an extra farm plot, a second daily bounty slot, the market's fee waived on that region's goods,
a permanent gathering node that only diary-holders can use.
**Size:** ~3 days. `player_progress` has `kind='quest'` and a `progress_claim` double-claim guard already.
**Retention:** high and *broad* — it is the only mechanism that rewards playing the whole game rather than
one skill. Also the best answer to "what do I do now?", which is the loudest new-player problem.
**Fuse:** **free.** Nothing here is a percentage. That is the entire reason OSRS diaries have aged well.

---

### PROG-03 · Combat Achievements — *OSRS*
**How it works.** Tiered per-boss tasks (kill it, kill it fast, kill it without food) with tier rewards.
**In Hearthrise.** Tasks against the boss roster — *Frostmaw with no Ember gear*, *Vharek unsupplied*,
*any Construct without Masonbreaker*. Tier rewards are cosmetic + one utility unlock each.
**Size:** ~2 days, but **it is blocked on having bosses.** We have 2 in `MONSTERS` and 6 in `bosses.js`.
Approving MON-DRA-05/06, MON-DEM-05, MON-VOI-04 first makes this viable; before that it has 8 targets.
**Retention:** high for the top 10% of players, invisible to everyone else. Do not ship it *instead of*
PROG-02.
**Fuse:** free.

---

### PROG-04 · Practice tiers — *Melvor (reduced)*
**How it works.** Melvor gives every item a 1–99 Mastery. `progression-depth.md` measured that porting it
gives a "Mastery 99" badge that costs 7.1 h in Crafting and 75.5 h in Woodcutting — rejected. The reduced
form: **3 tiers per action**, measured in *base action-seconds* (600 / 3,600 / 18,000), which normalises
perfectly across a 2.4 s cook and a 13 s duskwood chop.
**In Hearthrise.** Already fully specced. T1/T2 pay +4%/+8% material yield or input refund; T3 unlocks a
**signature drop** on that action.
**Size:** ~3–4 days. **Tyler back-burnered this on 2026-08-16** — listed for completeness and because T3
signature drops are the cheapest home for orphan materials.
**Retention:** it is the fix for the measured dead moment (minutes 5–33 of woodcutting have *no events*).
**Fuse:** rewards deliberately drawn from the classes `power-budget.js` exempts. **A per-action `ms`
reduction would bypass the fuse entirely and must never be built.**

---

### PROG-05 · Augmentation & Perks — *RS3 Invention*
**How it works.** Disassemble gear into components; augment a weapon/armour piece; roll perks onto it from
components (Aftershock, Biting, Precise…). Gear gains its own XP and levels.
**In Hearthrise.** Constructs and dungeons drop **components**. A Workshop bench augments one piece; two
perk slots; perks are drawn from a small table with real trade-offs (ITEM-NEW-28's shape).
**Size:** **~8–10 days, the largest on this list.** It needs per-item instance state, which `G.inventory`
(a flat `{id: qty}` map) does not have — that is a save-schema change plus a server-authority question
about who rolls the perk. **Do not approve this in the same wave as the monster rework.**
**Retention:** the highest ceiling of anything here — it is the only mechanism that makes *your* sword
different from someone else's — and the highest risk.
**Fuse:** costs budget, and it is the hardest to bound because perks stack multiplicatively by nature.
Would need its own fuse, which is the failure mode `power-budget.js`'s header already warns about.

---

### PROG-06 · Alternate Advancement points — *EverQuest*
**How it works.** After max level, XP converts into AA points spent in permanent trees (archetype /
class / special). Hundreds of small purchases; the meta-progression that outlives levelling.
**In Hearthrise.** Once a skill hits 99, its XP converts to **Mastery Points at a fixed rate**. Spend in a
per-skill tree of small, permanent, *non-throughput* nodes: +1 auto-queue slot, a category charm slot, a
second signature drop, an extra market listing, an offline-cap minute.
**Size:** ~4 days. The XP is already computed server-side; the tree is data.
**Retention:** solves the *post-99 cliff*, which at OSRS scale (1,098 h to Woodcutting 99) nobody in
round 2 will reach — so it is a **year-two system**, not a beta one. Approve the idea, schedule it late.
**Fuse:** free **if and only if** every node is capacity/access. The moment one node is "+1% XP", it is a
fuse problem with no ceiling, because AA points are unbounded by construction.

---

### PROG-07 · Prestige / Ascension — *idle-genre standard*
**How it works.** Reset a maxed skill to 1 for a permanent multiplier or token.
**In Hearthrise.** *I recommend rejecting this outright.* Three reasons, each independently sufficient:
(1) it makes a player **worse off for having played**, which is the one thing the away-time and Renown
rulings both exist to prevent; (2) `renownHigh` is an explicit no-demotion ratchet and prestige is a
demotion; (3) at our XP scale a reset costs 1,098 hours, so nobody would ever take it, and a mechanic
nobody takes is worse than no mechanic.
**Size:** ~2 days. **Retention:** negative for our audience. **Fuse:** unboundable by design.
**Listed so the rejection is on the record rather than an omission.**

---

### PROG-08 · The Upgrades Ladder — *Idle Clans*
**How it works.** A flat list of permanent account upgrades bought with gold at escalating prices —
inventory space, offline hours, extra queue slots, faster actions.
**In Hearthrise.** A **Steward's Ledger** at the homestead: 20–30 purchasable permanent upgrades, gold
only, prices on a steep curve. Almost all of them capacity/access (bag slots, listing slots, bounty board
slots, an extra farm plot, +15 min offline cap).
**Size:** ~2 days. Cheapest real system on this list.
**Retention:** moderate, but its *economic* value is high — it is the **gold sink the game does not have**.
Gold is currently spend-only with nothing large to spend on, which is also why PROG-09's pool has no
carrier.
**Fuse:** free if capacity-only. **Must not sell throughput** — that is pay-to-win adjacent even at gold
prices, because gold is tradeable and the Hearth Token bond touches the market.

---

### PROG-09 · The Pool (Skill Lore / The Larder) — *Melvor's Mastery Pool*
**How it works.** A meter that is simultaneously **a currency and a stat**: checkpoints at 10/25/50/95%
grant passives that switch **off** the moment you spend below the line. Spending has a felt cost beyond
opportunity cost. Genuinely the most elegant idea in the reference set.
**In Hearthrise.** Two candidate carriers, both already analysed: **(a) Skill Lore** — a per-skill pool fed
by 25% of Practice progress, spent to advance actions you will never grind by hand (compelling here
because 239 of our 322 actions are gear recipes performed once). **(b) The Larder** — make the homestead
larder a real meter, retiring the Cellar's fictional `+500 storage` perk; hoarding pays gathering
passives, crafting spends it down.
**Size:** (a) ~3 days *after* PROG-04 exists. (b) ~6+ days, because it needs **storage enforcement**,
which does not exist and which makes players angry the first time it eats an item.
**Retention:** high, oscillating (fill → spend → refill) — the shape idle games are best at.
**Fuse:** costs budget; bounded because the checkpoints are few and switch off.
**Recommendation:** approve the *idea*, defer the *build*. It is downstream of PROG-04.

---

### PROG-10 · Relics — *OSRS Leagues*
**How it works.** At milestones, pick **one of three** powerful, mutually exclusive modifiers. The power
is large; the *choice* is the content, and you live with it.
**In Hearthrise.** At Renown ranks (Squire / Knight / Baron / …), choose one **Charter**: *Hunter* (bane
multipliers apply to two categories at once), *Steward* (all gathering yields a by-product), *Warden*
(away accrual survives 30% longer). Re-selectable once per season, never free.
**Size:** ~3 days. Renown ranks already exist and already gate perks.
**Retention:** very high per unit of build cost — it is the cheapest way to make two players' accounts
feel different, and it gives the Renown spine (the "Rise to the Throne" pillar) a *mechanical* payoff it
currently lacks.
**Fuse:** costs budget, but bounded by construction: **one charter active, ever.** That is a ceiling
enforced by the mechanic rather than by a clamp, which is the property this codebase keeps asking for.
**This is my #3 after PROG-01 and PROG-02.**

---

## 3A · How the ten interact — if Tyler approves several

| Combination | Verdict |
|---|---|
| PROG-01 + PROG-02 | **Best pair.** One rewards depth (kill a lot of one thing), one rewards breadth (do a bit of everything). Together they cover both player types with ~8 days of build and **zero** fuse cost. |
| PROG-01 + monster library | **Dependent pair.** Approving 74 monsters without PROG-01 makes the roster wider but not deeper. Approving PROG-01 without new monsters gives it 31 entries, which is thin but shippable. |
| PROG-04 + PROG-09 | Correct order; 09 is meaningless before 04. |
| PROG-05 + anything | Sequence alone. It is the only entry with a save-schema change. |
| PROG-08 + PROG-06 | Overlapping — both sell capacity. Pick one, or PROG-08 sells with gold and PROG-06 with post-99 XP, and their catalogues must not intersect. |
| PROG-10 + PROG-01 | Charters that boost bane multipliers stack with charms; needs one shared `MAX_BANE_MULT` clamp, not two. |

**Total fuse exposure if PROG-01, 02, 03, 08 and 10 all ship: one bounded charter.** That is the
combination I would build.

---

## 4 · Open decisions for Tyler (referenced by id in approvals)

| id | Decision |
|---|---|
| DEC-ELEM-04 | Three elements (Ember/Frost/Blight) or four (add **Radiant**)? Four costs +3 runes, +6 consumable variants, and gives Undead two weaknesses. I recommend three. |
| DEC-DRA-01 | Green Dragon's breath: Blight (its colour) or Ember (the genre default)? Blight is better and costs nothing — it is a new field, not a rename. |
| DEC-NEUT-01 | Retiring `neutral` removes `NEUTRAL_DROP_BONUS ×1.15` from 6 monsters. Re-home it, or accept the nerf? |
| DEC-WAVE-01 | How many of the 74 in wave one? Each is ~0.5 day **plus a commissioned portrait**. My recommendation: **20** — MON-ARC-01/03/06 (fills the worst hole), the six Elemental, the six Construct, MON-DRA-05/06, MON-DEM-05, MON-VOI-01/04. |
| DEC-ALIAS-01 | `MONSTER_ALIAS` + `remapMonsterIds` is a hard prerequisite (~1 day) and is required even if no id changes. Approve it as its own commit before any of this. |

---

*Nothing in this document was implemented. No file other than this one was created or modified.*
