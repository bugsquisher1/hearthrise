# The Review Book — Content Library

**Author:** Game Designer · **Date:** 2026-08-16 · **Status:** CANDIDATES ONLY. Nothing here is built,
nothing here is decided. Tyler approves/rejects each entry by id.
**Ruling this serves:** `DECISIONS.md`, 2026-08-16 — *"the Game Designer produces a LIBRARY of monster
categories/types/enemies as candidates; Tyler picks from it. Nothing ships un-picked."*

**REVISION 2 — 2026-08-16.** This edition applies Tyler's exported verdicts (`review-decisions.json`)
and his follow-up notes. What changed, in one list:

- **The taxonomy is now taken directly from Tibia's bestiary classes** — eleven of them, chosen to fit
  our roster. **Fey is gone** (rejected); **Plant** is its replacement class, and the Fey concepts were
  re-homed or replaced. Beast→**Mammal**, Arcane→**Human**, Draconic→**Dragon**,
  Aberrant→**Extra Dimensional**, and **Giant** folds into **Humanoid**.
- **Every monster name was rewritten to the familiar-fantasy standard** Tyler asked for: short, common,
  instantly recognisable — *Grim Reaper, Cyclops, Minotaur, Hellhound, Gargoyle, Scarecrow*. Generic
  fantasy vocabulary only; no coined name from any other game, and **no other game's named bosses**.
- **Blight is renamed POISON** everywhere. The Green Dragon breathes **Ember**. `neutral` is retired.
  `MONSTER_ALIAS` ships first, as its own commit.
- **The whole roster is in wave one** (Tyler overrode the 20-monster wave): **81 monsters, every tier
  filled**, plus an **art-prompt sheet** at `docs/design/monster-art-prompts.md` — one
  AI-image-prompt-ready line per monster, in the house Style B portrait spec.
- **Six item candidates were rejected and removed** (the demonbane sword, the Masonbreaker pick, the
  away-bank bell, the arrow-repair twine, the away-target whistle, the away-multiplier lantern). 38 new
  items remain. Renames applied per Tyler's notes.
- **A new dungeon** — *The Long Night*, a vampire household — is specced as Library 5, one approvable
  card per boss and per drop.
- Ids are unchanged wherever an entry survived. **Renamed entries keep their id.** Entries whose text
  changed carry a *(REVISED)* note in their hook. The six retired Fey ids are gone; the Plant class has
  new ids (`MON-PLA-…`).

**Every id is stable.** `MON-BEA-03`, `ITEM-NEW-12`, `PROG-04`. Approvals reference the id, not the name.
Renaming an entry later does not move its id — **and note that an id's three-letter middle is historical,
not a category key.** `MON-BEA-*` now lives in Mammal, `MON-ARC-*` in Human, `MON-VOI-*` in Extra
Dimensional. `family` is a data field; the id is a save key. Keeping the ids frozen is what makes this
revision free.

**Source data measured, not assumed:** 31 monsters / 6 families in `src/data/monsters.js`; 426 items in
`src/data/items.js` (armor 145 · weapon 41 · jewelry 20 · ammo 8 · tool 30 · material 178 · trophy 3 ·
companion 1); 6 dungeon/raid bosses in `src/data/bosses.js` — which **already** carries `style`,
`weakness`, `resist[]`, `reqLv`, `mechanic`, i.e. the target monster schema exists in the repo today.

---

## 0 · What I recommend, per library

**MONSTERS.** Adopt an **11-class taxonomy lifted straight from Tibia's bestiary** — Mammal, Vermin,
Plant, Humanoid, Human, Undead, Demon, Dragon, Elemental, Construct, Extra Dimensional. Tibia ships 21
classes; these eleven are the ones our roster actually populates, and eleven is the number a player can
hold in their head. The single most important recommendation in this whole document: **the CLASS carries
the weakness profile, and an individual monster may override at most one axis.** That is OSRS's
bane-weapon model — "demonbane hurts demons", not "this specific hellhound is weak to this specific
sword" — and it turns an eighty-row memorisation problem into eleven learnable sentences. **Retire
`neutral`** (6 of 31 monsters currently opt out of the triangle entirely); every class gets a real weapon
weakness, distributed 3/3/3/2 across sword/hammer/ranged/magic. Elements ride on top as the second axis
exactly as `consumable-economy.md` §11 specifies (additive, clamped 1.35). **81 candidate monsters below,
every tier filled, and Tyler has taken the whole wave** — the art-prompt sheet exists so the portraits
can start immediately rather than after a second approval round.

**ITEMS.** The live catalogue is **structurally healthy and thematically flat**: 145 armour pieces are
seven ladders of the same six slots, and 178 of 426 items are materials. What is missing is not more
rungs — it is **items that make a decision**. So the 38 surviving candidates below are weighted away from
"+2 more defence" and toward **bane gear (OSRS), class charms (Tibia's charm system / OSRS salve amulet),
utility items that change what you can do rather than how hard you hit, and cosmetics that carry a real
non-throughput function.** Two live gaps get filled on the way: the `earrings` slot (6 items, all
shipped b343 or later) and the ~15 marquee boss mats that still vendor as trash.

**PROGRESSION.** Ten mechanisms. **My strong recommendation is PROG-01 (Bestiary Charms, from Tibia)**,
because it is the only one on the list that makes the monster rework *pay* — it converts 81 monsters ×
kill counts into a progression system with no new grind, and it is the natural home for class-bane power
without touching the throughput fuse. Second is **PROG-02 (Achievement Diaries, OSRS)**, which pays in
**access and convenience** rather than percentages and is therefore fuse-free by construction.
**Reject PROG-07 (prestige) outright** — it is the one mechanism that can make a player worse off for
having played, and it is incompatible with the `renownHigh` no-demotion ratchet.

**The constraint every entry is written against.** `power-budget.js` fuses permanent throughput at +20%
per key and +30% total, and the accrual Edge Function passes `zeroBonus` — **so a percentage reward is
expensive and a client-side one is a lie on the server.** Rewards that are *unlocks*, *access*,
*capacity*, *convenience*, *cosmetic* or *class-scoped combat identity* cost nothing from that budget.
I have marked every entry `FUSE: free / scoped / costs budget` so Tyler can see the price before approving.

---

## 0.1 · Reading notes — what an approval commits us to

These are facts from the b342 audit (`agility-and-monster-foundation.md` Part 2), not caveats:

- **A new monster is not a data row.** It is a data row + a commissioned Style B portrait + a
  `HR_MONSTER_GLYPHS` entry + a `LOCAL_MONSTER_ICON` entry + drop routing + a catalogue regen + an Edge
  redeploy. **≈0.5 day each, and the portrait is the long pole.** Tyler has taken all 81, so the
  art-prompt sheet (`docs/design/monster-art-prompts.md`) is the critical path, not the data.
- **Renaming an existing monster costs live Renown** (measured: 412 → 212 from one id). `MONSTER_ALIAS`
  does not exist and is the hard prerequisite. **Every "folds into" note below means re-categorising, not
  renaming** — `family` is not a save key; `id` is. Folds are free. Renames are not, and this revision
  renames a lot of *candidates* (free — they do not exist yet) and **no live ids**.
- **Adding monsters lowers every existing player's collection-log completion %** (the denominator is
  `Object.keys(MONSTERS).length`). Free before the wipe, expensive after. Argues for doing the roster
  expansion in one wave, pre-round-2 — which is what Tyler chose.
- **Retiring `neutral` deletes `NEUTRAL_DROP_BONUS` ×1.15**, which 6 monsters currently pay instead of a
  weakness. That is a real drop-rate nerf to those 6 unless it is re-homed. → Systems, flagged.

---

# LIBRARY 1 — MONSTERS

## 1A · The taxonomy

**Grounding.** The classes are **Tibia's bestiary classes**, adopted directly at Tyler's instruction.
Tibia ships 21 (Amphibic, Aquatic, Bird, Construct, Demon, Dragon, Elemental, Extra Dimensional, Fey,
Giant, Human, Humanoid, Inkborn, Lycanthrope, Magical, Mammal, Plant, Reptile, Slime, Undead, Vermin).
OSRS instead uses 12 combat attributes that exist purely to make *bane gear* work. Melvor has no taxonomy
at all — it has a combat triangle (±10% damage / ±25% resistance).

**What I take from each:** Tibia's *class list and its category-as-collectable* (it is the reason their
bestiary is a progression system, not a list) · OSRS's *category-as-the-thing-gear-targets* · Melvor's
*discipline about magnitude* (their triangle is ±10%, not ±100% — ours is +20% weapon / +15% element,
already in the same register).

**Which eleven, and why those.** Kept because our roster genuinely fills them: **Mammal, Vermin, Plant,
Humanoid, Human, Undead, Demon, Dragon, Elemental, Construct, Extra Dimensional.** Dropped with reasons:
*Fey* (rejected by Tyler) · *Giant* (folds into Humanoid — the weakness profile is identical and the
split would have been two classes teaching one sentence; Ogre, Cyclops and Frost Giant are Humanoid's
T4–T5 band) · *Slime* (one monster; folds into Vermin as the element-immune outlier) · *Reptile / Amphibic
/ Aquatic / Bird* (real Tibia classes, but each would land 2–3 monsters here; snakes and salamanders fold
into Vermin and Dragon) · *Lycanthrope / Inkborn / Magical* (no roster, and Magical overlaps Elemental and
Human so hard that it would blur two classes that currently teach cleanly).

**Eleven categories.** Sized so a player can name them all, and so every one of the six existing families
has a home.

| # | Category | Identity in one line | Weapon weak | Weapon resist | Element weak | Element resist |
|---|---|---|---|---|---|---|
| 1 | **Mammal** | Mundane animals, fast and unarmoured. The tutorial class. | ranged | magic | Ember | — |
| 2 | **Vermin** | Small, many, and it does not care how sharp your sword is. | hammer | ranged | Frost | **Poison (immune)** |
| 3 | **Plant** | Rooted, patient, and it burns. Poison is something plants *make*. | sword | ranged | Ember | Poison |
| 4 | **Humanoid** | Goblins, trolls, ogres, giants. Armoured, drops gear, hits hard. | sword | — | Poison | — |
| 5 | **Human** | People — bandits and casters both. Glass, and they hit like a cart. | ranged | magic | Poison | — |
| 6 | **Undead** | Bones and grief. Crush them; poison does nothing to the dead. | hammer | — | Ember | **Poison (immune)**, Frost |
| 7 | **Demon** | Things that came up. Magic-shy, and fire is their native language. | magic | — | Frost | **Ember (immune)** |
| 8 | **Dragon** | Wyrms, drakes, wyverns. Scaled against blades, open to a good shot. | ranged | sword | *(opposed to its breath)* | *(its breath, immune)* |
| 9 | **Elemental** | It *is* the element. Immune to its own, ruined by its opposite. | magic | sword | *(opposed, per-monster)* | *(own, immune)* |
| 10 | **Construct** | Stone, clay, clockwork. No blood to spill, no lungs to poison. | hammer | ranged, **Poison (immune)** | Frost | Ember |
| 11 | **Extra Dimensional** | Endgame only. Its element weakness is not printed until you have killed enough of it. | sword | *(per-monster)* | *(exactly one, hidden)* | *(the other two)* |

**Distribution check.** sword 3 (Plant, Humanoid, Extra Dimensional) · hammer 3 (Vermin, Undead,
Construct) · ranged 3 (Mammal, Human, Dragon) · magic 2 (Demon, Elemental). Ember 3 (Mammal, Plant,
Undead) · Frost 3 (Vermin, Demon, Construct) · Poison 2 (Humanoid, Human) · per-monster 3 (Dragon,
Elemental, Extra Dimensional). **No style is ever "the wrong build"; every style has a home class at
every tier band.**

**The one asymmetry, stated rather than hidden.** Poison is weak on 2 classes and immune on 3
(Vermin/Undead/Construct) plus resisted on 1 (Plant). That is the same shape Blight had, and it is
deliberate: Poison is the *specialist* element — it is the answer to the two classes that drop the most
gear (Humanoid and Human), which is where players spend the most hours. If live data shows the Poison
whetstone/arrow lines are dead stock, the lever is **giving Dragon a fixed Poison weakness** (venom in
the meat is the oldest wyrm-killing story there is) rather than weakening any immunity — immunities are
what make the class sentences memorable.

**Elements.** Three, as specced: **Ember · Frost · Poison** (`DEC-ELEM-04`, resolved — Tyler: *"instead
of blight, I like poison"*). A fourth — **Radiant** — is the obvious fit for Undead and Demon and I am
*not* proposing it: it costs +3 enchanting runes, +2 elemental arrow/whetstone lines, and it would give
Undead two weaknesses.

**The override rule (this is the design, not a detail).** A monster inherits its class's whole profile.
It may override **exactly one axis**, and the override must be *legible from the name and the art*.
Winter Wolf resists Frost — you can see the coat. Salamander breathes Ember so it fears Frost — you can
see the smoke. **A monster with two overrides is rejected in review.** This is what keeps eleven
sentences from becoming eighty-one rows.

## 1B · Where the current 31 land

Nothing is renamed. `family` is re-pointed, `elementWeak` is added, `weaponWeak` changes only where noted.

| Category | Existing monsters folded in | Changes |
|---|---|---|
| Mammal | small_wolf, wolf, dire_wolf, bear, panther, ancient_bear | `small_wolf` neutral→**ranged**; `wolf`/`dire_wolf` hammer→ranged. Complete ladder T1–T6 already. |
| Vermin | slime, rat, giant_bat, venom_spider, plague_swarm | `giant_bat` ranged→hammer; `slime` neutral→hammer with all-element immunity. Loses void_parasite + shadow_creeper to Extra Dimensional, so T5/T6 are filled by candidates. |
| Plant | *(none — wholly new class)* | Replaces the rejected Fey class. Six new candidates. |
| Humanoid | goblin, hobgoblin, goblin_brute, goblin_warlord, warband_captain, war_king, **mountain_troll** | Goblinoid becomes a *family label only*. `goblin` ranged→sword. **mountain_troll moves Mammal→Humanoid** — it duplicates `bear` where it sits, and it is the one monster with no portrait, so it needs Art either way. |
| Human | dark_wizard, warlock, archmage | all three neutral→**ranged**. The casters are Tibia's Human class, not a separate Arcane class — and the bandit candidates share the profile, which is what makes the class read as *people* rather than *wizards*. |
| Undead | weak_skeleton, skeleton, zombie, wraith, death_knight, lich | `weak_skeleton`/`skeleton`/`zombie`/`wraith`/`lich` magic→**hammer**. Complete ladder; `weak_skeleton` is the class's T1. |
| Demon | lesser_demon | neutral→**magic**. Candidates fill T1–T3 and T5–T6. |
| Dragon | dragon | neutral→**ranged**; **breath = Ember, so it fears Frost** (`DEC-DRA-01`, resolved — Tyler: *"Ember"*). |
| Elemental | *(none — wholly new class)* | — |
| Construct | *(none — wholly new class)* | — |
| Extra Dimensional | shadow_creeper, void_parasite | Moved out of Vermin. Both already read as void-touched. |

**Seven `neutral` monsters get real weaknesses** (slime, small_wolf, dark_wizard, warlock, archmage,
lesser_demon, dragon). That is the weakness redo, in one line.

## 1C · Candidate monsters

Format: **id · Name** — tier · weakness profile · *inspiration* · hook.
`W:` weapon weak, `E:` element weak. Blank = inherits the class default from §1A.
A hook ending in *(REVISED: was X)* means the id survived and only its name/read changed.

### Mammal — MON-BEA *(Tibia's Mammal class; was Beast)*
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-BEA-01 | **Wild Boar** | 1 | default | Tibia Mammals / OSRS Lumbridge boars | The first thing that fights back on your own land; drops the hide that makes your first belt. *(REVISED: was Hedgerow Boar)* |
| MON-BEA-02 | **Stag** | 2 | default | Tibia Ungulates | Runs. High evade, low HP — the monster that teaches you accuracy is a stat. *(REVISED: was Moorland Stag)* |
| MON-BEA-03 | **Jackal** | 2 | default | Tibia Mammals | Hunts in threes: the first monster that arrives with friends, so the fight is about order of targets. *(REVISED: was Fen Adder, which had no home once Reptile was cut)* |
| MON-BEA-04 | **Lynx** | 3 | default | Tibia Mammals / OSRS jungle cats | Ambusher — opens at a higher hit than it sustains. *(REVISED: was Thicket Lynx)* |
| MON-BEA-05 | **Mountain Ram** | 3 | W: **hammer** *(override)* | Tibia Ungulates | It charges; you meet it with something blunt. Horn is a Fletching input. *(REVISED: was Crag Bighorn)* |
| MON-BEA-06 | **Winter Wolf** | 4 | E resist: **Frost**, weak Ember | Tibia Mutated Mammals | The teaching exception: the coat is on the portrait, and Frost arrows do nothing. *(REVISED: was Winterpelt Wolf)* |
| MON-BEA-07 | **Giant Boar** | 5 | default | Tibia Mammals | Fat, slow, enormous HP — the away-farming beast, forgiving of a bad loadout. *(REVISED: was Bogwallow Sow)* |
| MON-BEA-08 | **Mammoth** | 5 | W: hammer *(override — hide)* | Tibia Mammals | The one Mammal that answers a hammer; ivory is the tool-handle and jewelry input the class never had. *(REVISED: was Tarn Serpent)* |
| MON-BEA-09 | **Elk King** | 6 | default, `boss` | EverQuest named-mob tradition | A wandering boss with no lair — it appears on the map, and you either brought a bow or you did not. *(REVISED: Tyler asked for a shorter name; was a nine-word title)* |

### Vermin — MON-VER *(Tibia's Vermin class, with Slime folded in)*
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-VER-01 | **Barn Rat** | 1 | default | Tibia Rats | Folds beside `rat`; the homestead's own pest, killable in the first minute. |
| MON-VER-02 | **Hive Wasp** | 1 | W: ranged *(override)* | Tibia Insects | Flies. The one T1 monster that answers a bow, so the ranged starter has a target. |
| MON-VER-03 | **Locust Swarm** | 2 | default | Tibia Vermin | Eats your farm plot's yield if left alive — the first monster with a *reason* beyond XP. *(REVISED: was Grain Weevil Swarm)* |
| MON-VER-08 | **Ooze** | 2 | W: hammer, E resist: all | Tibia Slime class | Splits conceptually from `slime`; immune to every element, so it is a pure weapon-triangle check. *(REVISED: was Cellar Ooze)* |
| MON-VER-04 | **Centipede** | 3 | default | Tibia Myriapods | Mining-adjacent spawn; drops the chitin that starts the leather-alternative armour line. *(REVISED: was Tunnel Centipede)* |
| MON-VER-05 | **Giant Spider** | 4 | default | Tibia Arachnids / OSRS Kalrag | Silk faucet for the Emberhead arrow chain, which is currently silk-starved. *(REVISED: was Brood Widow)* |
| MON-VER-06 | **Carrion Swarm** | 5 | E resist: **all but Frost** | Tibia Hive Born | Dense enough that only cold thins it — the clearest single-element puzzle in the mid game. *(REVISED: was Carrion Fly Cloud)* |
| MON-VER-07 | **Broodmother** | 6 | default, `boss` | Tibia Hive / OSRS Kalphite Queen | Two-phase in fiction (she is why the brood exists); the Vermin capstone the family has never had. *(REVISED: was Chitin Broodmother)* |

### Plant — MON-PLA *(new class; replaces the rejected Fey)*
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-PLA-01 | **Mandrake** | 1 | default | Tibia Plants / European folklore | Pull it up and it screams — the scream is the mechanic: it wakes one more Plant. Drops the herb line `foodClass:'buff'` is starved of. |
| MON-PLA-02 | **Shrieker** | 2 | default | Tibia Fungi | Woodcutting-adjacent: it appears while you chop. The first monster that finds *you*. |
| MON-PLA-03 | **Bog Vine** | 3 | W resist: ranged | Tibia Plants | Roots you in place for a swing — arrows just stick in it. Teaches that a resist is worth changing weapon for. |
| MON-PLA-04 | **Carnivorous Plant** | 4 | default | Tibia Plants | Swallows one gathered item on hit; you get it back when you kill it. Annoying in the good way. |
| MON-PLA-05 | **Dryad** | 5 | E resist: Ember *(override)* | Tibia Plant class | Green wood does not burn. The override the whole class's Ember weakness is written to set up. |
| MON-PLA-06 | **Treant** | 6 | default, `boss` | Tibia Plant bosses | Plant capstone; its heartwood is the Duskwood plank line's only non-gathered source. |

### Humanoid — MON-HUM *(Tibia's Humanoid class, with Giant folded in)*
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-HUM-02 | **Kobold** | 1 | default | Tibia Humanoids | Fetish-bearer; drops the totem line `goblin_totem` currently dead-ends into. *(REVISED: was Marsh Dworc — a coined name from another game, replaced with common stock)* |
| MON-HUM-11 | **Gnoll** | 2 | default | Tibia Humanoids | Scavenger pack; the first Humanoid that drops another monster's loot, which is how the world starts to feel connected. |
| MON-HUM-04 | **Rock Troll** | 3 | default | Tibia Trolls | Stonemason-adjacent; drops rubble and the first `dressed_block` shortcut. *(REVISED: Tyler's name)* |
| MON-HUM-05 | **Ogre** | 4 | default | Tibia Giants | Huge max hit, terrible accuracy — the monster that makes food matter more than defence. *(REVISED: was Hillstone Ogre)* |
| MON-HUM-10 | **Minotaur** | 4 | default | Tibia Minotaurs | Charges down a corridor: the first monster with a telegraphed attack you can answer. The most recognisable silhouette in the roster. |
| MON-HUM-06 | **Frost Giant** | 5 | E resist: Frost, weak Ember | Tibia Frost Giants | Northern raider; the Ember arrow's first genuinely worth-it target. *(REVISED: was Frostbeard Giant)* |
| MON-HUM-09 | **Cyclops** | 5 | W: hammer *(override — one eye, no guard)* | Tibia Cyclopes | Giant folded into Humanoid arrives here: enormous, slow, and the class's one blunt-weapon answer. |
| MON-HUM-08 | **Stonejaw** | 6 | default, `boss` | EverQuest named orcs | The Goblinoid ladder finally ends in a *person* with a name, not "War King". *(REVISED: Tyler — "just Stonejaw")* |

### Human — MON-ARC + MON-HUM *(Tibia's Human class; absorbs the old Arcane)*
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-ARC-01 | **Witch's Apprentice** | 1 | default | Tibia Humans / OSRS Wizard Tower | **Fills the empty T1.** A caster at level 1 means a new player meets the caster silhouette on day one. *(REVISED: Tyler's name)* |
| MON-HUM-01 | **Cutpurse** | 1 | default | OSRS bandits | Steals gold on hit instead of dealing damage — the first monster you are *annoyed* by. *(REVISED: was Roadside Cutpurse; moved Humanoid→Human)* |
| MON-ARC-02 | **Cultist** | 2 | default | Tibia Voodoo Cultists | Group fiction: the first hint of an organisation behind the monsters. *(REVISED: Tyler's name)* |
| MON-HUM-03 | **Deserter** | 3 | W: hammer *(override — plate)* | OSRS guards | Wears real armour: the first monster where your weapon choice is about *his* kit, not his species. *(REVISED: was Deserter Sergeant; moved Humanoid→Human)* |
| MON-ARC-03 | **Adept** | 4 | default | RS3 Runecrafting lore | **Fills the empty T4.** The `magic_essence` faucet at the tier Runecrafting actually needs it. *(REVISED: Tyler's name)* |
| MON-ARC-04 | **Conjurer** | 4 | E resist: Ember | Tibia Pyromancers | Casts what it is immune to — the first "bring the other element" lesson. *(REVISED: Tyler's name)* |
| MON-ARC-05 | **Astrologer** | 5 | default | Melvor Astrology | Star-reader; drops the only Extra-Dimensional-tracking item outside that class. *(REVISED: Tyler's name)* |
| MON-HUM-07 | **Bandit Lord** | 5 | default | OSRS Bandit Camp | A human antagonist for a game whose enemies are otherwise all monsters. Drops a real gear piece, not a mat. *(REVISED: was Brigand Warlord; moved Humanoid→Human)* |
| MON-ARC-06 | **Necromancer** | 6 | default, `boss` | Tibia Necromancers | **Fills the empty T6.** He is why the Undead ladder exists, and the narrative bridge to Extra Dimensional. *(REVISED: Tyler's name)* |

### Undead — MON-UND *(Tibia's Undead class)*
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-UND-01 | **Wight** | 2 | default | Tibia Undead Humanoids | Fills the gap between skeleton and zombie; first `grave_dust` at a sane tier. *(REVISED: was Churchyard Wight)* |
| MON-UND-02 | **Ghoul** | 3 | default | Tibia Ghouls | Poison-immune *and* Poison-dealing: teaches that "immune" and "inflicts" are different words. *(REVISED: was Plague-Cart Ghoul)* |
| MON-UND-03 | **Barrow Knight** | 4 | default | OSRS Barrows | Guards a dungeon key; the first undead that drops equipment rather than remains. *(REVISED: was Barrow Sentinel)* |
| MON-UND-04 | **Drowned Dead** | 4 | W: **magic** *(override)* | Tibia Aquatic Undead | Waterlogged — the one undead where crushing does nothing and magic is the answer. *(REVISED: was Drowned Bellringer)* |
| MON-UND-05 | **Grave Banshee** | 5 | default | OSRS Banshee | Screams: high damage, no defence. Wants the Agility dodge stat if that ships. *(REVISED: Tyler's name)* |
| MON-UND-06 | **Revenant** | 6 | default | OSRS Revenants | The `big_bones` endgame faucet, and the Prayer payoff's best customer. *(REVISED: was Bonepit Revenant)* |
| MON-UND-07 | **Vampire Bride** | 6 | E: **Ember**, W resist: ranged | Common vampire stock | Wooden shafts do nothing; fire does everything. **She is an ENERGY vampire — she drinks buffs, not blood** (see Library 5), and she is the purest bane-item hook in the roster. *(REVISED: Tyler's name; was Coldbrook Vampyre)* |
| MON-UND-08 | **Grim Reaper** | 6 | default, `boss` | Common folklore stock | Undead capstone. A boss whose hit is not large but whose fight has a *timer you can see* — the scythe fills, and when it fills it does not miss. Tyler's pick, and the most recognisable monster in fantasy. |

### Demon — MON-DEM *(Tibia's Demon class)*
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-DEM-06 | **Imp** | 1 | default | Tibia Demons | The joke-sized demon: the class arrives early and unthreatening so its T5–T6 arrival lands harder. |
| MON-DEM-07 | **Nightmare** | 2 | default | Common folklore stock | A demon horse. Fast, and the first monster that gets a free hit if you open the fight without food. |
| MON-DEM-01 | **Fire Devil** | 3 | default | Tibia Fire Devils | Ember-immune and Ember-dealing — the T3 checkpoint for whether you understood elements. *(REVISED: was Soot Devil)* |
| MON-DEM-02 | **Hellhound** | 4 | W: ranged *(override)* | Tibia/OSRS hellhounds | Fast: closes distance, so the melee player gets the easier fight for once. *(REVISED: was Cinder Hound)* |
| MON-DEM-03 | **Chained Demon** | 5 | default | Tibia Dark Torturers | Bound, and it wants you to unbind it — hook for a quest that is not a kill count. *(REVISED: was Chained Torturer)* |
| MON-DEM-04 | **Fury** | 5 | E: Frost, W resist: sword | Tibia Furies | Blades glass over; the Frost whetstone's first mandatory target. *(REVISED: was Brimstone Fury)* |
| MON-DEM-05 | **Vharek** | 6 | default, `boss` | Tibia Demon bosses / OSRS K'ril | Demon capstone, and the arena the Pitlord Irons exist to let you stand in. *(REVISED: Tyler's name)* |

### Dragon — MON-DRA *(Tibia's Dragon class; was Draconic)*
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-DRA-08 | **Salamander** | 2 | E: Frost (breathes Ember) | Tibia Salamanders | A hand-sized dragon at level 12 — the class's on-ramp, and the first scale in the game. |
| MON-DRA-01 | **Wyrmling** | 3 | E: Ember (breathes Frost) | OSRS Wyrms | A dragon you can fight at level 30 — the class currently starts and ends at T6. *(REVISED: was Marsh Wyrmling)* |
| MON-DRA-02 | **Wyvern** | 4 | E: Frost (breathes Ember) | OSRS Wyverns | No shield gimmick; just a real T4 flier with a bone drop the Prayer chain wants. *(REVISED: was Cliffside Wyvern)* |
| MON-DRA-03 | **Cave Wyrm** | 4 | W: hammer *(override — no wings)* | Tibia Wyrms | Burrower. The Dragon that answers a hammer, so the class is not a bow-only tax. *(REVISED: was Cavern Wyrm)* |
| MON-DRA-04 | **Drake** | 5 | E: Poison (breathes neither) | Tibia Drakes | Metal-scaled; its hide is the bridge between the leather and plate armour lines. *(REVISED: was Bronze-Scale Drake)* |
| MON-DRA-05 | **Draconia** | 6 | E: Ember, resist Frost, `boss` | OSRS Vorkath | The second real boss. The Green Dragon has been alone at the top since launch. *(REVISED: Tyler's name; was Frostmaw the White)* |
| MON-DRA-06 | **Ashwing** | 6 | E: Frost, resist Ember, `boss` | Tibia Hellfire | Draconia's opposite — one weekly rotation slot, two opposite loadouts. |
| MON-DRA-07 | **Elderscale** | 6 | ranged / resist melee | already in `bosses.js` | Named here only so the raid roster and the monster taxonomy stop being two vocabularies. *(REVISED: label tidied)* |

### Elemental — MON-ELE *(new class)*
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-ELE-01 | **Fire Elemental** | 1 | E: Frost, immune Ember | Tibia Pyro-Elementals | Lives in your own hearth. A cozy-medieval elemental that is not a lava monster. *(REVISED: was Hearth Cinderling)* |
| MON-ELE-02 | **Water Elemental** | 2 | E: Ember, immune Frost | Tibia Hydro-Elementals | The mirror of ELE-01 at the same band — the pair is how the element system teaches itself. *(REVISED: was Brookmote)* |
| MON-ELE-03 | **Air Elemental** | 2 | E: Frost, W resist: ranged | Tibia Electro-Elementals | Arrows pass straight through. The clearest "your best weapon is wrong here" moment in the game. *(REVISED: was Dustmote Whirl)* |
| MON-ELE-04 | **Earth Elemental** | 3 | E: Frost, resist Poison | Tibia Geo-Elementals | The Stonemason's by-product problem, solved as a monster: it drops granite. *(REVISED: was Quarry Geode-Kin)* |
| MON-ELE-05 | **Ice Elemental** | 4 | E: Ember, immune Frost | Tibia Cryo-Elementals | Frost arrows literally do nothing here — the strongest argument for showing resists in the UI. *(REVISED: was Rimewater Elemental)* |
| MON-ELE-06 | **Magma Elemental** | 5 | E: Frost, immune Ember | Tibia Magma-Elementals | Smithing-flavoured; drops `hell_ember`, which is currently vendor trash with no recipe. *(REVISED: was Forgeheart Magmakin)* |
| MON-ELE-07 | **Storm Elemental** | 6 | E: Poison, resist Ember+Frost | Tibia Elemental Lords | The one monster that resists two elements; its weakness is the *unpopular* third, which is exactly the job Poison needs. *(REVISED: was Stormcrag Tempest)* |
| MON-ELE-08 | **Elder Cinder** | 6 | E: Frost, `boss` | Tibia Elemental Lords | Elemental capstone. Its signature drop is the Ember enchanting rune's only non-craft source. *(REVISED: was The Elder Cinder)* |

### Construct — MON-CON *(new class)*
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-CON-01 | **Scarecrow** | 1 | default | Tibia Constructs, read cozy | It got up. The most Hearthrise monster on this list, and the one a new player will screenshot. *(REVISED: was Straw Field-Warden)* |
| MON-CON-02 | **Stone Golem** | 2 | default | Tibia Stone Golems | Village machinery gone wrong; drops the first `dressed_block` outside Stonemason. *(REVISED: was Millstone Golem)* |
| MON-CON-03 | **Clay Golem** | 3 | default | Tibia Clay Guardians | Slow, huge defence, no damage — a pure DPS-check target with zero food cost. *(REVISED: was Clay Guardian)* |
| MON-CON-04 | **Watchknight** | 4 | default | OSRS animated armour | Empty armour: kill it and you get the armour. The most honest drop table in the game. *(REVISED: was Rusted Watchknight)* |
| MON-CON-05 | **Gargoyle** | 5 | default | OSRS Gargoyles | **Reassembles unless the killing blow is blunt** — the class's weapon sentence made into a fight rule rather than a required item. *(REVISED: was Cathedral Gargoyle; the required-item gate was cut with the rejected pick)* |
| MON-CON-06 | **Iron Colossus** | 6 | default, `boss` | Tibia War Golems / RS3 automatons | Construct capstone. A siege engine that never got the order to stop, and the dungeon key it carries is a cosmetic you can wear. *(REVISED: was The Clockwork Reeve)* |

### Extra Dimensional — MON-VOI *(new class, T4+ only; was Aberrant)*
| id | Name | T | Profile | Inspiration | Hook |
|---|---|---|---|---|---|
| MON-VOI-01 | **Void Mote** | 4 | W: sword; one **hidden** element weakness | Tibia Extra Dimensional | Its element is `???` in the bestiary until 25 kills. **This is PROG-01's proof of value.** *(REVISED: was Thin-Place Mote)* |
| MON-VOI-02 | **Starhusk** | 5 | W: sword; one hidden | Tibia Inkborn | Was a person. The drop table is that person's belongings — the saddest loot in the game. *(REVISED: was Star-Bitten Husk)* |
| MON-VOI-03 | **The Silence** | 6 | W resist: ranged; one hidden | Tibia Extra Dimensional | No combat-log lines while it is alive — the fight is quiet. Art + Systems dependency, flagged. *(REVISED: was The Silence That Walks)* |
| MON-VOI-04 | **The Unlit** | 6 | one hidden, `boss` | Tibia's endgame tier | Extra Dimensional capstone and the endgame's actual final boss, which the game currently does not have. |

## 1D · Tier coverage check

`C` = a candidate on this list · `L` = covered by a live monster folded in (§1B) · `—` = deliberate band.

| Class | T1 | T2 | T3 | T4 | T5 | T6 |
|---|---|---|---|---|---|---|
| Mammal | C L | C C L | C L | C L | C C L | C L |
| Vermin | C C L | C C L | C L | C L | C | C |
| Plant | C | C | C | C | C | C |
| Humanoid | C L | C L | C L | C C L | C C L | C L |
| Human | C C | C L | C | C C L | C C | C L |
| Undead | L | C L | C L | C C L | C L | C C C L |
| Demon | C | C | C | C L | C C | C |
| Dragon | — | C | C | C C | C | C C C L |
| Elemental | C | C C | C | C | C | C C |
| Construct | C | C | C | C | C | C |
| Extra Dimensional | — | — | — | C L | C L | C C |

**Result: no gaps except two deliberate bands.** Dragon has no T1 (a level-3 dragon costs the class its
whole meaning; the Salamander at T2 is the on-ramp) and Extra Dimensional is T4+ by design (its identity
is *the thing you meet after you thought you were finished*). Every other class runs T1–T6 unbroken, and
**every tier of the game has at least eight classes with a live target** — which is the property that
actually matters, because it means no build and no level ever runs out of somewhere to go.

**Counts.** 81 candidates across 11 classes. Every class has ≥4 rungs; Mammal, Vermin, Humanoid, Human
and Undead run T1–T6 complete; Plant, Elemental and Construct arrive at T1 so a new player meets eight
silhouettes rather than four.

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

## 2C · New candidates (38)

Format: **id · Name** — slot/role · tier · what it does · *inspiration*.
`FUSE:` free = no throughput budget consumed · scoped = class-only · costs = draws on the +52% stack.
**Six candidates were rejected by Tyler and removed from this edition**: a demonbane sword, a
Construct-finishing pick, an away-banking bell, an arrow-repair twine, an away-target whistle, and an
away-multiplier lantern. Their ids are retired and not reused.

**Taxonomy + naming sweep (REVISED, this edition).** Every item was re-checked against the final class
list and the same short-and-familiar naming standard the monsters now use:

- **Every bane weapon targets a class that still exists.** Undead, Dragon, Plant, Extra Dimensional,
  Vermin. **One target was orphaned by the re-home** — the T2 sword was written against *Fey*, which no
  longer exists; it is retargeted to **Plant** and renamed **Bramble Blade**, which keeps its job (a
  cheap early bane that teaches the grammar) and its boss link (it is what cuts the Treant). No other
  item pointed at a deleted class. The old *Beast* charm now reads **Mammal**; the old *Aberrant*
  references now read **Extra Dimensional**; *Blight* is **Poison** throughout.
- **Every item that names a monster names the final one.** Draconia's Jaw (was Frostmaw's), Heartwood
  Cape (was the Oakenmother's), Colossus Plate and Colossus Seal (was the Clockwork Reeve's), Watchknight
  Shell, Pitlord Irons, Cutpurse Gloves.
- **Names shortened to one or two crisp words**, matching the monsters: Void Censer, Hunter's Torc, Frost
  Locket, Tally Ring, Bone Earrings, Pathfinder Studs, Unlit Earrings, Grave Salt, Kettle Tea, Quiet
  Coat, Weathervane.
- **Lazlo's Maul keeps Tyler's name and gets no reference of any kind to any show** — it is an
  Undead-bane hammer whose flavour is a grave-robbing blacksmith of that name, and the description must
  stay inside that fiction. Called out here so it cannot drift in a later pass.

### Bane gear — class-targeted weapons (the OSRS steal that makes the taxonomy matter)
| id | Name | Slot / role | T | What it does | Inspiration | FUSE |
|---|---|---|---|---|---|---|
| ITEM-NEW-02 | **Lazlo's Maul** | weapon (hammer) | 4 | +40% damage vs **Undead** only. The reason to keep a second weapon on the belt. | OSRS Salve amulet / Crumble Undead | scoped |
| ITEM-NEW-03 | **Dragonrib Bow** | weapon (ranged) | 6 | +40% damage vs **Dragon** only; strung on a rib from the thing it kills. The Draconia/Ashwing answer. | OSRS Dragon hunter crossbow | scoped |
| ITEM-NEW-04 | **Bramble Blade** | weapon (sword) | 2 | +40% vs **Plant**, and the only thing that cuts the Treant's roots. Cheap and early, so the bane grammar is taught at T2. | OSRS bane weapons | scoped |
| ITEM-NEW-05 | **Void Censer** | weapon (magic) | 5 | +40% vs **Extra Dimensional**; reveals the target's hidden element weakness while equipped. | OSRS demonbane spells | scoped |
| ITEM-NEW-07 | **Rat Stick** | weapon (hammer) | 3 | +40% vs **Vermin**. A stick. It is very good at rats. | OSRS ratbane weapons | scoped |

> **The rule that makes bane gear safe:** it is a *class multiplier inside `weaknessInfo`*, not a
> `getBonus` key — so it never touches the throughput fuse and it reads identically on the server. Ceiling
> must be an invariant of the expression (`MAX_BANE_MULT`), same as `MAX_WEAKNESS_MULT = 1.35`.

### Charms & amulets — Tibia's bestiary-charm idea as equipment
| id | Name | Slot | T | What it does | Inspiration | FUSE |
|---|---|---|---|---|---|---|
| ITEM-NEW-08 | **Hunter's Torc** | necklace | 3 | +1 tier of drop-rate band vs **Mammal**; nothing vs anything else. | Tibia charms | scoped |
| ITEM-NEW-09 | **Frost Locket** | necklace | 4 | Your Frost element applies to a monster that resists it (once per kill). | Tibia elemental protection | scoped |
| ITEM-NEW-10 | **Tally Ring** | ring | 2 | Bestiary kill counts tick 25% faster for the equipped class. Pure progression, zero combat power. | Tibia Bestiary / OSRS slayer helm | free |
| ITEM-NEW-11 | **Bone Earrings** | **earrings** | 4 | Prayer XP from every bone you would have buried, without burying it. Fills the emptiest slot in the game. | OSRS Ectoplasmator | free |
| ITEM-NEW-12 | **Pathfinder Studs** | **earrings** | 3 | Shows the next unlock threshold for whatever activity you are running, on the tile. | RS3 UI affordances | free |
| ITEM-NEW-13 | **Unlit Earrings** | **earrings** | 6 | Extra Dimensional monsters no longer hide their element from you. Endgame convenience as a reward. | Tibia Bestiary completion | free |

### Consumables (the buff catalogue is 14 items and all 14 are percentages)
| id | Name | Role | T | What it does | Inspiration | FUSE |
|---|---|---|---|---|---|---|
| ITEM-NEW-14 | **Hearthbread** | food | 1 | Heals over the next N swings instead of instantly — auto-eat consumes half as many. | Tibia's food-regen model | free |
| ITEM-NEW-15 | **Traveller's Stew** | food (buff) | 2 | While it lasts, gathering yields the *next tier's* material 5% of the time. | Melvor's Mastery yields | costs (small) |
| ITEM-NEW-16 | **Winterdraught** | consumable | 4 | One absence: Frost resistance is ignored on your element. Charges, not a timer (b336 rule). | Tibia elemental potions | scoped |
| ITEM-NEW-17 | **Ratter's Bait** | utility | 1 | Placed on a farm plot: Vermin come to you for 10 minutes. Turns farming into a combat faucet. | OSRS Hunter | free |
| ITEM-NEW-20 | **Grave Salt** | consumable | 4 | Consumed on a kill: guarantees the monster's rarest drop *once per real day*. | Tibia loot boosts, hard-capped | free |
| ITEM-NEW-21 | **Kettle Tea** | food (buff) | 2 | +2% to *the blessing currently active*, not to a fixed key. Ties consumables to the events rework. | Idle Clans clan buffs | costs (2%) |

### Utility — items that change what you can do
| id | Name | Role | T | What it does | Inspiration | FUSE |
|---|---|---|---|---|---|---|
| ITEM-NEW-23 | **Field Ledger** | utility | 2 | Adds a second auto-action queue slot. Capacity, not power. | Idle Clans queue upgrades | free |
| ITEM-NEW-24 | **Tithe Box** | utility | 4 | Auto-vendors any item you have marked as trash, at the vendor rate, while away. | RS3 bank presets | free |
| ITEM-NEW-25 | **Carter's Strap** | utility | 3 | +1 market listing slot. The Cellar's dead `+500 storage` perk, repurposed into something real. | Idle Clans market slots | free |
| ITEM-NEW-26 | **Surveyor's Chain** | tool | 5 | While equipped, mining yields its stone by-product at the next grade up. | *(ours — serves Stonemason)* | costs (small) |

### Gear with identity — pieces that are characters, not rungs
| id | Name | Slot | T | What it does | Inspiration | FUSE |
|---|---|---|---|---|---|---|
| ITEM-NEW-28 | **Colossus Plate** | body | 6 | Constructs' defence is halved against you; everything else's is +10%. A real trade. | RS3 Invention perk trade-offs | scoped |
| ITEM-NEW-29 | **Heartwood Cape** | cape | 6 | Regenerates 1 HP per swing while fighting **Plant** or **Mammal**. The Treant's own wood, worn. | Tibia plant drops | scoped |
| ITEM-NEW-30 | **Draconia's Jaw** | helmet | 6 | Immune to Frost resistance — your Frost always lands. Draconia's own signature. | OSRS boss-unique model | scoped |
| ITEM-NEW-31 | **Cutpurse Gloves** | gloves | 2 | Gold from **Human** +25%; gold from everything else −10%. The first real build decision, at T2. | OSRS Rogue set | scoped |
| ITEM-NEW-32 | **Chitin Weave** *(set: 6 pieces)* | armour line | 4 | Leather-class alternative made from Vermin chitin, not pelts — the second armour supply chain. | Tibia chitin gear | costs (set bonus) |
| ITEM-NEW-33 | **Watchknight Shell** *(set: 6 pieces)* | armour line | 5 | Plate-class set whose bonus is **damage taken while away** reduced, not damage dealt. | *(ours — idle-native set)* | costs |
| ITEM-NEW-34 | **Quiet Coat** | body | 6 | Extra Dimensional monsters do not get their first-strike advantage. A defensive answer to one class. | Tibia counters | scoped |
| ITEM-NEW-35 | **Pitlord Irons** | boots | 6 | Ember immunity → you can stand in Vharek's arena. A *gate key wearing armour*. | OSRS boss prerequisites | free |

### Cosmetics with function
| id | Name | Role | T | What it does | Inspiration | FUSE |
|---|---|---|---|---|---|---|
| ITEM-NEW-36 | **Bestiary Cloak** | cape (cosmetic) | — | Dyed by your most-completed class; the colour *is* the achievement. | Tibia class titles | free |
| ITEM-NEW-37 | **Hearthstone Signet** | ring (cosmetic) | — | Displays your homestead tier on your profile and in clan lists. | OSRS max cape culture | free |
| ITEM-NEW-38 | **Chronicle Ribbon** | trophy | — | Pins one Chronicle entry to your public profile — you choose which kill defines you. | EverQuest AA titles | free |
| ITEM-NEW-39 | **Colossus Seal** | cosmetic + function | 6 | Cosmetic, *and* it is the Iron Colossus's dungeon key. Cosmetics that unlock are the good kind. | Tibia key/decoration duality | free |
| ITEM-NEW-40 | **Weathervane** | housing | 3 | Shows the current world blessing on your own homestead art. Reads the events system. | Idle Clans clan house | free |

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
**In Hearthrise.** 81 monsters × 3 thresholds. Threshold 1 reveals the monster's weakness profile in the
bestiary (Extra Dimensional's is *only* obtainable this way). Threshold 3 grants Charm Points spendable
on a **class**, not a monster: +Ember damage vs Undead, +drop band vs Mammal. Completing a class grants a
title and a Bestiary Cloak dye (ITEM-NEW-36).
**Size:** ~4–5 days. `G.bestiary` already exists, is already synced, already keyed by monster id, and
already drives Renown. This is a UI + a spend-ledger on data we keep today.
**Retention:** very high, and it is the *right* kind — it gives a reason to fight a monster you have
outlevelled, which is exactly the hole in a tiered roster.
**Fuse:** charm power is **class-scoped and lives in `weaknessInfo`**, so like bane gear it never enters
the `getBonus` chain. Class-scoped means it cannot stack globally: the +52% is untouched.
**Why it is my #1:** it is the only option here whose value *scales with the monster rework*. Approving
81 monsters without it means 81 more things to grind past.

---

### PROG-02 · Achievement Diaries — *OSRS*
**How it works.** Per-region task sets at Easy/Medium/Hard/Elite. Rewards are almost never damage — they
are **access and convenience**: better resource yields in that region, free teleports, a bank chest, a
shortcut.
**In Hearthrise.** Diaries by *place* — Wanderer's Camp, the Fen, Stormcrag, Emberfall, the Dawnspire.
Easy = "chop 50 oak, cook 20 trout, kill 10 Vermin"; Elite = "kill Draconia, reach Stonemason 85".
Rewards: an extra farm plot, a second daily bounty slot, the market's fee waived on that region's goods,
a permanent gathering node that only diary-holders can use.
**Size:** ~3 days. `player_progress` has `kind='quest'` and a `progress_claim` double-claim guard already.
**Retention:** high and *broad* — it is the only mechanism that rewards playing the whole game rather than
one skill. Also the best answer to "what do I do now?", which is the loudest new-player problem.
**Fuse:** **free.** Nothing here is a percentage. That is the entire reason OSRS diaries have aged well.

---

### PROG-03 · Combat Achievements — *OSRS*
**How it works.** Tiered per-boss tasks (kill it, kill it fast, kill it without food) with tier rewards.
**In Hearthrise.** Tasks against the boss roster — *Draconia with no Ember gear*, *Vharek unsupplied*,
*any Gargoyle finished blunt on the first try*. Tier rewards are cosmetic + one utility unlock each.
**Size:** ~2 days, but **it is blocked on having bosses.** We have 2 in `MONSTERS` and 6 in `bosses.js`.
The candidate roster adds eleven, which is what makes this viable; before that it has 8 targets.
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
per-skill tree of small, permanent, *non-throughput* nodes: +1 auto-queue slot, a class charm slot, a
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
multipliers apply to two classes at once), *Steward* (all gathering yields a by-product), *Warden*
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
| PROG-01 + monster library | **Dependent pair.** Approving 81 monsters without PROG-01 makes the roster wider but not deeper. Approving PROG-01 without new monsters gives it 31 entries, which is thin but shippable. |
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
| DEC-ELEM-04 | **RESOLVED — three elements, and Blight is renamed POISON** (Tyler: *"instead of blight, I like poison"*). Ember / Frost / Poison. Radiant stays unbuilt. Every doc, data field and UI string uses "Poison" from here. |
| DEC-DRA-01 | **RESOLVED — the Green Dragon breathes EMBER** (Tyler: *"Ember"*), so it fears Frost and is immune to Ember. It is a new field, not a rename, so it costs nothing. |
| DEC-NEUT-01 | **RESOLVED — `neutral` is retired.** Seven monsters get real weaknesses. `NEUTRAL_DROP_BONUS ×1.15` must be re-homed or the nerf accepted — open item for Systems, not for Tyler. |
| DEC-WAVE-01 | **RESOLVED — the whole wave** (Tyler: *"all of it so I can get the AI artwork prompt working asap. Make sure you are filling all of the tiers."*). 81 monsters, tier coverage proven in §1D, art prompts written to `docs/design/monster-art-prompts.md`. |
| DEC-ALIAS-01 | **RESOLVED — approved, and it ships first.** `MONSTER_ALIAS` + `remapMonsterIds` (~1 day) lands as its own commit before any roster work, because a rename without it costs live Renown. |
| DEC-TAXON-01 | **NEW — adopt the eleven Tibia bestiary classes** listed in §1A (Mammal, Vermin, Plant, Humanoid, Human, Undead, Demon, Dragon, Elemental, Construct, Extra Dimensional), with Giant folded into Humanoid, Slime into Vermin, and Fey deleted. The weapon/element matrix stays balanced at sword 3 / hammer 3 / ranged 3 / magic 2 and Ember 3 / Frost 3 / Poison 2 / per-monster 3. Approving this is what makes every monster card below coherent. |

---

# LIBRARY 5 — DUNGEON: THE LONG NIGHT

**A vampire household.** Four residents of one crumbling manor, each a boss, each dropping one piece of a
four-piece set. The tone is *comedy of manners with fangs* — they are ancient, petty, and have been
arguing about the washing-up for two hundred years. **Original characters only**: no protected names, no
character copies, nothing lifted from any show. The archetypes (a pompous ancient warrior, a flamboyant
cursed aristocrat, a sharp-tongued bride, a devoted mortal servant) are folklore stock older than any of
them.

**Access:** reqLv 70, one lockout per UTC day, 1–3 players. **The set is the point:** each boss drops one
piece; the four together grant **The Household** — the game's first life-steal bonus, and the reason to
finish the manor rather than farm the easiest resident.

**The mechanical spine.** The Bride is an **energy vampire**, and that is a real fight rule, not flavour:
she does almost no HP damage. Every hit she lands **strips your active buff with the least time
remaining** and heals her for a share of what it was worth; if you arrive with no buffs at all she has
nothing to drink, and she **enrages** into a conventional and very dangerous fight. So the puzzle is
inverted: you *must* bring consumables you are willing to lose, and the skill is in what order they burn.
This uses the buff-timer system that already exists and adds no new stat.

| id | Name | Role | What it is / mechanic | Drop | Notes |
|---|---|---|---|---|---|
| DNG-VAMP-01 | **The Long Night** | Dungeon | The manor itself: four boss rooms, one lockout per UTC day, reqLv 70, 1–3 players, scaled by party size on the server. No trash-clear filler — every room is a resident. | — | Slots into `bosses.js` as a four-boss dungeon; needs a key from the Necromancer (MON-ARC-06) so the roster's own T6 caster gates it. |
| DNG-VAMP-02 | **The Old Soldier** | Boss 1 · Undead | Pompous, ancient, armoured, still fighting a war that ended six centuries ago. Mechanic: **the Duel** — he refuses to be hit by ranged (resist ranged, class default) and every 30s he *challenges*, doubling both his damage taken and dealt for one exchange. | **Old Soldier's Gorget** (necklace) | The set's defensive anchor. Teaches that a vampire fight can still be a straight melee fight. |
| DNG-VAMP-03 | **The Baron** | Boss 2 · Undead | Flamboyant, cursed, wearing three centuries of other people's fashion. Mechanic: **the Entourage** — he summons two thralls and takes reduced damage while either lives, so the fight is about target order, not DPS. | **Baron's Doublet** (body) | Ember-weak like all Undead, and the fight's lighting is the reason Ember reads on screen. |
| DNG-VAMP-04 | **The Bride** | Boss 3 · Undead | Reuses **MON-UND-07 Vampire Bride** as the encounter version. **Energy vampire:** each hit strips your shortest-remaining buff and heals her by its value; arrive with no buffs and she enrages. Wooden shafts do nothing (resist ranged); fire does everything (weak Ember). | **Bride's Signet** (ring) | The set's offensive piece. This is the fight the whole dungeon is designed around, and the one that makes the consumable catalogue matter. |
| DNG-VAMP-05 | **The Familiar** | Boss 4 · Human | The devoted mortal servant. Not undead, not strong, and absolutely will not stop. Mechanic: **Devotion** — he revives once at 50% HP, and while any other resident lives he takes their damage for them. Kill him last or fight him twice. | **Servant's Scarf** (cape) | Tyler's scarf-slot cape. A mortal in a vampire dungeon is the joke and the difficulty spike at once. |
| DNG-VAMP-06 | **The Household** | Set bonus (4 pieces) | Wearing gorget + doublet + signet + scarf: **2% of damage dealt returns as healing**, doubled to 4% against **Undead** and **Human**. Class-scoped, so it never enters the `getBonus` chain — same fuse treatment as bane gear, with its own `MAX_LEECH` invariant. | — | The game's first life-steal, and deliberately small: it changes how long you can stay out, not how hard you hit. |

---

*Nothing in this document was implemented. No file other than this one, `monster-art-prompts.md`, the
events spec and the review-book generator was created or modified.*
