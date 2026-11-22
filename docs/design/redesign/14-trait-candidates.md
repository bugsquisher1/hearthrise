# 14. Trait candidates (40 to pick from)

Game designer, 2026-11-22. Tyler asked for about 40 Traits to pick from. Lane G wrote 5 of them already (marked **existing**). The other 35 are new. Nothing here is built. Once you pick, the chosen rows go into the game's data, hidden until wave 4.

## How Traits work

1. A ground drops one base tier at every depth. Muster Barrows always drops item Level 60 gear, and the next ground drops better.
2. A **Rare** piece also carries one **Trait**, a rule like "when your target is a boss, your hits land harder". A **Very Rare** carries two.
3. Every Trait has a **rank from 1 to 3**. Holding deeper on a ground makes a Rare more likely and its rank higher (rank 1 from depth 1, rank 2 from depth 8, rank 3 from depth 15).
4. A Trait only works while its "when" is true, so the right Trait depends on your hero's job and the ground you hunt.
5. Each ground has its own pool of Traits, so chasing a Trait means choosing a ground.

**What a rank is worth.** Every Trait gets the same budget at its best: rank 1 is about 1.4% harder hits (or lighter blows, or bigger heals), rank 2 about 2.5%, rank 3 about 3.6%. That sounds small, but a rank 3 on one piece is worth more than that piece's next base tier, and all of a hero's Traits together are capped at one tier. Below, "a little, more, a lot" means rank 1, 2 and 3.

**The five guards each row is checked against** (`04-math-strategy.md` section 10): (1) equal budget at its best case, (2) its "when" is false often enough that its average over every ground is at most half its best, (3) two Traits with the same stacking key never add up, (4) no Trait is in the best kit on more than 40% of slot, seat and ground cells, (5) pity on the Rare roll. Every "when" below is one of the action bar's own conditions (`src/data/condition-metrics.js`), so combat needs no new math, and none uses "the fight is on" (always true).

**Grounds used.** The scale's grounds and the next ones R10 is likely to open, plus the two Catacomb wings: Muster Barrows (undead soldiers in files, Captain Hask), the Pyre Field (burned dead, Lurcher hounds, Pyre Wraiths), Krell's Hold (a castle, archers, Pyre Priests, hot pitch), Carter's Rest (trolls in an old inn), the Ox Road (dead teamsters, coal runners, a Drover who goads), Wyvern Roost (dragons weak to the bow), the Bone Wing and the Flooded Wing (the Catacombs, with casters and Keeper Dunn). If R10 opens a different set, a Trait moves with its theme.

## The 40 candidates

"For" uses the seats: Front (Melee with a shield), Melee, Ranger, Mage, Healer. "Back" means any of Ranger, Mage or Healer.

### Weapon (5)

| # | Name | How it plays | When | For | Drops on | Rank 1 to 3 | Fit |
|---|---|---|---|---|---|---|---|
| 1 | **File Breaker** (existing) | Your area attacks hit harder when they catch a big pack. | An area attack would hit 3 or more monsters | Mage, area | Muster Barrows | A little, more, a lot harder | Passes. Dead on bosses and thin grounds |
| 2 | **Soft Scale** | Your attacks hit harder on a monster weak to them. | Your target is weak to the attack | Ranger, single target | Wyvern Roost | A little, more, a lot harder | Risk: on a ground built on one weakness it is on almost all the time there. Fine if the average over all grounds holds. Near-duplicate of #3 |
| 3 | **Ram's Head** | Your attacks hit harder on a monster that resists them, so the wrong weapon still works. | Your target resists the attack | Melee | Krell's Hold | A little, more, a lot harder | Passes. The opposite of #2. Pick one or keep both under one stacking key |
| 4 | **Worrier** | Your hits land harder on a bleeding monster. Made for two axes. | Your target is bleeding | Melee (axes) | Pyre Field | A little, more, a lot harder | Risk: an axe hero keeps bleed up most of the time, so it is close to always on for them. Status family, see the near-duplicates |
| 5 | **Snuffed** | While you wear it, every hero's hits land harder on a chilled monster, so a frost Mage helps the whole party. Only one per party counts. | Your target is chilled | Any (party-wide) | Bone Wing | A little, more, a lot harder, for everyone | Party-wide. Needs a frost spell in the party. Status family |

### Shield (3)

| # | Name | How it plays | When | For | Drops on | Rank 1 to 3 | Fit |
|---|---|---|---|---|---|---|---|
| 6 | **Last File** (existing) | Blows reach you lighter when you are nearly down. | Your HP is 40% or less | Front | Muster Barrows | A little, more, a lot lighter | Passes. Barely fires on Steady, earns its keep on Bold |
| 7 | **Bailey Stand** | Blows reach you lighter while you hold a boss. | Your target is a boss | Front | Krell's Hold | A little, more, a lot lighter | Passes. A hall and boss piece. Risk: hall tanks may see it as a must-have for halls only |
| 8 | **Barred Door** | You hold harder when the party is getting hurt. | 2 or more heroes are under 70% HP | Front | Carter's Rest | A little, more, a lot lighter | Passes. Off on clean pulls, on in hard ones. Shares a key with Banded Oath (#33) |

### Body (3)

| # | Name | How it plays | When | For | Drops on | Rank 1 to 3 | Fit |
|---|---|---|---|---|---|---|---|
| 9 | **Tarred Through** | Blows reach you lighter when the pack is full of casters. | 2 or more monsters are casting at anyone | Any | Krell's Hold | A little, more, a lot lighter | Passes. Near-duplicate of Floodmark (#18). Give them one key so they never stack |
| 10 | **First Rank** | Blows reach you lighter while you are still fresh. | Your HP is 90% or more | Front | Muster Barrows | A little, more, a lot lighter | Risk: behind a strong Healer a tank may sit over 90% most of a hunt. Measure it. The other end of Last File |
| 11 | **Pyre Tender** | Your heals restore more when several heroes are hurt at once. | 2 or more heroes are under half HP | Healer, area heals | Pyre Field | A little, more, a lot more | Passes. Near Keeper's Carry (#15) but for a spread of hurt, not one hero |

### Pants (3)

| # | Name | How it plays | When | For | Drops on | Rank 1 to 3 | Fit |
|---|---|---|---|---|---|---|---|
| 12 | **Empty Wagon** | Your heals restore more when your mana is running low, so a long pull ends better. | Your mana is 30% or less | Healer | Ox Road | A little, more, a lot more | Passes. The party waits for mana before the next pull, so nobody can sit at low mana on purpose |
| 13 | **Slack Water** | Your attacks land harder while the party is barely scratched. | The party's HP is 90% or more | Back (Ranger, Mage) | Flooded Wing | A little, more, a lot harder | Risk: on easy depths it is always on. The climb pushes pulls to where HP drops, so measure it at the held depth. Near-duplicate of #19 |
| 14 | **Goaded** | Your hits land harder when the party is in trouble, to end the pull sooner. | 2 or more heroes are under 70% HP | Melee | Ox Road | A little, more, a lot harder | Passes. Same trigger as Barred Door (#8), but offense |

### Helmet (3)

| # | Name | How it plays | When | For | Drops on | Rank 1 to 3 | Fit |
|---|---|---|---|---|---|---|---|
| 15 | **Keeper's Carry** (existing) | Your heal restores more on a hero who is close to going down. | The hero you heal is at half HP or less | Healer | Bone Wing | A little, more, a lot more | Passes. For saves, not topping up |
| 16 | **Full Wick** | Your spells land harder while your mana is nearly full, so a patient Mage hits hardest. | Your mana is 80% or more | Mage | Bone Wing | A little, more, a lot harder | Risk: a mana-rich Mage may sit over 80% all hunt. Measure. The other end of Banked Coals (#24). One key for both |
| 17 | **Pauper's Share** | Blows reach you lighter when your Healer is out of mana. | Your Healer's mana is 30% or less | Front | Bone Wing | A little, more, a lot lighter | Passes. Party only. Worth nothing without a Healer |

### Boots (3)

| # | Name | How it plays | When | For | Drops on | Rank 1 to 3 | Fit |
|---|---|---|---|---|---|---|---|
| 18 | **Floodmark** (existing) | Blows reach you lighter while a monster is casting at you. | 1 or more monsters are casting at you | Ranger, back | Flooded Wing | A little, more, a lot lighter | Passes. Worth nothing where nobody casts |
| 19 | **Ledge Footing** | Your attacks land harder while nobody in the party is hurt badly. | No hero is under 70% HP | Ranger | Wyvern Roost | A little, more, a lot harder | Near-duplicate of Slack Water (#13). Pick one |
| 20 | **Carter's Flight** | Blows reach you lighter when the pull is going wrong. | The party's HP is 50% or less | Back | Carter's Rest | A little, more, a lot lighter | Passes. Rarely on with Steady, more on Bold |

### Gloves (3)

| # | Name | How it plays | When | For | Drops on | Rank 1 to 3 | Fit |
|---|---|---|---|---|---|---|---|
| 21 | **Scorched Grip** | Your hits land harder when you are badly hurt. | Your HP is 50% or less | Melee | Pyre Field | A little, more, a lot harder | Passes. Steady falls back at 25%, so it works between 25% and 50%. Bold widens that window. A real stance choice |
| 22 | **Slate Hand** | Your hits land harder on a pack that is casting, so you kill casters first. | 1 or more monsters are casting at anyone | Ranger | Carter's Rest | A little, more, a lot harder | Passes. Offense on the casting family (#9, #18). Its own key |
| 23 | **Behind the Bar** | Your heals restore more when you are the one who is hurt. | Your own HP is half or less | Healer | Carter's Rest | A little, more, a lot more | Passes. A Healer under fire stays up. Rare on a well-held front |

### Belt (3)

| # | Name | How it plays | When | For | Drops on | Rank 1 to 3 | Fit |
|---|---|---|---|---|---|---|---|
| 24 | **Banked Coals** | Your spells land harder when your mana is low, so you burn out strong. | Your mana is 30% or less | Mage | Ox Road | A little, more, a lot harder | Passes. The other end of Full Wick (#16). One key, so a Mage picks one plan |
| 25 | **Numbed** | Blows from a chilled monster reach you lighter. | Your target is chilled | Front | Flooded Wing | A little, more, a lot lighter | Passes. Needs frost in the party. Status family |
| 26 | **Long Rite** | Your heals restore more when the whole party is low. | The party's HP is 50% or less | Healer | Pyre Field | A little, more, a lot more | Passes. Near Pyre Tender (#11). Pick one, or keep both under one key |

### Cape (3)

| # | Name | How it plays | When | For | Drops on | Rank 1 to 3 | Fit |
|---|---|---|---|---|---|---|---|
| 27 | **Captain's Due** (existing) | Your hits land harder on a boss. | Your target is a boss | Melee | Muster Barrows | A little, more, a lot harder | Passes. Off for almost every kill on a ground |
| 28 | **Raised Colors** | When you fight a boss, the whole party's hits land a little harder. Only one per party counts. | Your target is a boss | Any (party-wide) | Krell's Hold | A little, more, a lot harder, for everyone | Party-wide. Near-duplicate of Captain's Due (#27). One key, so they never stack. Pick one |
| 29 | **Crag Shelter** | Blows reach you lighter when your mana is running out. | Your mana is 30% or less | Healer, Mage | Wyvern Roost | A little, more, a lot lighter | Passes. Covers a back hero at their weakest |

### Necklace (3)

| # | Name | How it plays | When | For | Drops on | Rank 1 to 3 | Fit |
|---|---|---|---|---|---|---|---|
| 30 | **Lime Pit** | Your attacks land harder on a sick monster. Made for poison spells. | Your target is sick | Mage (poison) | Flooded Wing | A little, more, a lot harder | Status family. Risk like Worrier (#4): a poison Mage may keep it on most of the time |
| 31 | **Dunn's Warning** | Your heals restore more while a monster is casting, so you heal ahead of the hit. | 1 or more monsters are casting at anyone | Healer | Bone Wing | A little, more, a lot more | Passes. Worth nothing where nobody casts |
| 32 | **Early Start** | Your hits land harder while you are still fresh. | Your HP is 90% or more | Melee, Ranger | Ox Road | A little, more, a lot harder | Risk: a back hero is rarely hit, so it may be close to always on for a Ranger. Measure. Same trigger as First Rank (#10) |

### Ring (5)

| # | Name | How it plays | When | For | Drops on | Rank 1 to 3 | Fit |
|---|---|---|---|---|---|---|---|
| 33 | **Banded Oath** | When the party is hurting, blows reach every hero a little lighter. Only one per party counts. | 2 or more heroes are under half HP | Any (party-wide) | Muster Barrows | A little, more, a lot lighter, for everyone | Party-wide. Shares a key with Barred Door (#8) |
| 34 | **Lookout's Promise** | Your attacks land harder when your Front is in trouble, to take the pressure off. | Your Front hero is at half HP or less | Ranger | Krell's Hold | A little, more, a lot harder | Passes. Party only |
| 35 | **Full Cellar** | Your heals restore more while your mana is nearly full. | Your mana is 80% or more | Healer | Carter's Rest | A little, more, a lot more | Risk: a Healer on an easy pull sits full all the time. Same key as Full Wick (#16) |
| 36 | **Bottom of the Quiver** | Your shots land harder when you are low on ammo. | 50 or fewer of your loaded ammo left | Ranger | Wyvern Roost | A little, more, a lot harder | **Probably cut.** A player could carry only 50 arrows and keep it on all hunt |
| 37 | **Hask's Bargain** | Your hits land harder while you are fresh, but blows reach you harder too. | Your HP is 90% or more | Melee | Muster Barrows | A lot harder, with a cost | **A trade Trait.** Needs a new rule kind (a gain with a cost) before it can be built. Here so you can say yes or no to trades |

### Earrings (3)

| # | Name | How it plays | When | For | Drops on | Rank 1 to 3 | Fit |
|---|---|---|---|---|---|---|---|
| 38 | **Stair Bearer** | Your heals restore more on your Front when they are close to going down. | Your Front hero is at half HP or less | Healer | Bone Wing | A little, more, a lot more | Near-duplicate of Keeper's Carry (#15). Pick one |
| 39 | **Bolting Team** | Your hits land harder when the party's HP is low, to finish the pull. | The party's HP is 50% or less | Melee | Ox Road | A little, more, a lot harder | Near Goaded (#14). Pick one |
| 40 | **Sour Vault** | Blows from a sick monster reach you lighter. | Your target is sick | Front | Flooded Wing | A little, more, a lot lighter | Status family. Needs poison in the party |


## Near-duplicates (pick one from each group, or keep both under one stacking key)

| Group | Traits | The difference | My pick if you want one |
|---|---|---|---|
| Weakness | Soft Scale (#2), Ram's Head (#3) | Weak target or resisting target | Keep both, one key. Opposites make a real choice |
| Status, offense | Worrier (#4), Snuffed (#5), Lime Pit (#30) | Bleed, chill, sickness | Two of the three. Snuffed is the most social, since it rewards a party with frost |
| Status, defense | Numbed (#25), Sour Vault (#40) | Chill or sickness on the target | One. Numbed pairs with Snuffed |
| Casting, defense | Floodmark (#18), Tarred Through (#9) | Casting at you, or 2 casting at anyone | Floodmark (existing) |
| Party hurt | Barred Door (#8), Goaded (#14), Banded Oath (#33) | Front defense, Melee offense, party-wide | Barred Door and Banded Oath. They share a key, so they cannot stack |
| Party low | Long Rite (#26), Pyre Tender (#11), Bolting Team (#39), Carter's Flight (#20) | Heals, heals, offense, back defense | Pyre Tender and Carter's Flight |
| Party healthy | Slack Water (#13), Ledge Footing (#19) | Party HP, or no hero badly hurt | One. Slack Water reads more simply |
| Fresh | First Rank (#10), Early Start (#32), Hask's Bargain (#37) | Defense, offense, offense with a cost | First Rank. Early Start may be always on for back heroes |
| Saving one hero | Keeper's Carry (#15), Stair Bearer (#38) | Lowest hero, or the Front only | Keeper's Carry (existing) |
| Boss | Captain's Due (#27), Raised Colors (#28), Bailey Stand (#7) | Self offense, party offense, Front defense | All three, but Captain's Due and Raised Colors share a key |
| Mana high or low | Full Wick (#16), Banked Coals (#24), Full Cellar (#35), Empty Wagon (#12), Crag Shelter (#29) | Mage at full or empty, Healer at full or empty, back defense when empty | Full Wick and Banked Coals for Mages, Empty Wagon for Healers |

**Repetition audit.** Names were checked against every item, monster, ground and spell name in `src/data`. None repeats. Earlier drafts had five "Last" names, four "candle" names and three "Water" names. Those were renamed so no word repeats more than twice across the 40. No filler words (Shadow, Void, Ancient, Eternal, Dark, Forgotten).

## Coverage

| Seat | Count | Traits |
|---|---|---|
| Front | 8 | Last File, Bailey Stand, Barred Door, First Rank, Pauper's Share, Numbed, Sour Vault, Tarred Through (any) |
| Melee | 8 | Ram's Head, Worrier, Goaded, Scorched Grip, Captain's Due, Early Start, Hask's Bargain, Bolting Team |
| Ranger | 7 | Soft Scale, Floodmark, Ledge Footing, Slate Hand, Lookout's Promise, Bottom of the Quiver, Slack Water |
| Mage | 6 | File Breaker, Full Wick, Banked Coals, Lime Pit, Slack Water, Crag Shelter |
| Healer | 10 | Keeper's Carry, Pyre Tender, Empty Wagon, Behind the Bar, Long Rite, Dunn's Warning, Full Cellar, Stair Bearer, Crag Shelter, Carter's Flight (back) |
| Party-wide | 3 | Snuffed (any seat with frost), Raised Colors, Banded Oath |
| Area or single target | | Area: File Breaker, Pyre Tender, Long Rite. Single target: Soft Scale, Ram's Head, Captain's Due, Lookout's Promise |

| Ground | Pool |
|---|---|
| Muster Barrows | File Breaker, Last File, Captain's Due, First Rank, Banded Oath, Hask's Bargain |
| Pyre Field | Worrier, Pyre Tender, Scorched Grip, Long Rite |
| Krell's Hold | Ram's Head, Bailey Stand, Tarred Through, Raised Colors, Lookout's Promise |
| Carter's Rest | Barred Door, Carter's Flight, Slate Hand, Behind the Bar, Full Cellar |
| Ox Road | Empty Wagon, Goaded, Banked Coals, Early Start, Bolting Team |
| Wyvern Roost | Soft Scale, Ledge Footing, Crag Shelter, Bottom of the Quiver |
| Bone Wing | Keeper's Carry, Snuffed, Full Wick, Pauper's Share, Dunn's Warning, Stair Bearer |
| Flooded Wing | Floodmark, Slack Water, Numbed, Lime Pit, Sour Vault |

Every slot has at least 3 candidates, so after cuts most slots still have two, which is what a Very Rare needs (two Traits on one slot, never the same key).

## The Very Rare pair rule (for when you have picked)

- A Very Rare rolls two different Traits from the ground's pool for that slot, never two with the same stacking key.
- **No best pair.** Before a pair can roll, the Lab plays every pair a slot can hold. A pair whose "when" covers each other's off time (for example Full Wick with Banked Coals, which would make a Mage strong at any mana) is banned by sharing a key. Any pair that lands in the best kit on more than 40% of cells is split by moving one of its Traits to a different slot or pool.
- The dominance check runs on the picked set at 20, before anything rolls: every slot, every seat, every ground, kits sampled from real drops.

Picking is all that is needed from you. Tell me the names you like and I will build them as hidden data, run the checks, and come back with any that fail.
