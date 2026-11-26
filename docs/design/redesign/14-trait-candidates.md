# Trait candidates (40)

Pick the ones you like. 5 already exist in the data (marked ✓). Nothing is live yet.

## How Traits work

- **Rare** items roll 1 Trait. **Very Rare** items roll 2.
- Traits have 3 ranks, shown below as **R1 / R2 / R3**.
- Hunting deeper raises your odds of a Rare and of higher ranks. R2 from Depth 8, R3 from Depth 15.
- Each hunting ground has its own Trait pool. A Rare rolls its slot first (the piece that dropped), then one Trait from that ground's Traits for that slot, at most 2 a ground and slot (`GEAR_STEPS.traitRoll`, 2026-11-22). A Trait only rolls where its ground drops its slot.
- A Trait only works when its condition is met.
- All Traits and the Signature on a hero together are capped at one gear tier's worth (20 steps), half that until Level 100, full at 200 (`19-power-ledger.md`, 2026-11-22).
- A ground rolls only the ranks its entry Level allows: rank 1 from entry 40, rank 2 from 70, rank 3 from 100. Muster Barrows rolls rank 1.

---

## Weapon

**1. File Breaker ✓** · Muster Barrows
+1.5 / 2.5 / 3.5% area damage when hitting 3+ enemies
Best for: Mage
Note: Useless vs bosses.

**2. Soft Scale** · Wyvern Roost
+1.5 / 2.5 / 3.5% damage vs targets weak to your attack
Best for: Ranger
Note: Always on at a ground with one weakness. Similar to #3.

**3. Ram's Head** · Krell's Hold
+1.5 / 2.5 / 3.5% damage vs targets that resist your attack
Best for: Melee
Note: The opposite of #2.

**4. Worrier** · Pyre Field
+1.5 / 2.5 / 3.5% damage vs bleeding targets
Best for: Melee (axes)
Note: Axe users keep bleed up, so it's nearly always on for them. Gash (wave 3) bleeds every monster beside the axes, so it fires on more of the pull.

**5. Snuffed** · Muster Barrows
Party: +1.5 / 2.5 / 3.5% damage vs chilled targets
Best for: Any. Needs a frost user in the party (Frost Slam, Hoarfrost, Chilling Lance or the support's Cold Palm).
Note: Doesn't stack with another copy in the party.

## Shield

**6. Last File ✓** · Muster Barrows
−1.5 / 2.5 / 3.5% damage taken below 40% health
Best for: Tank
Note: The tank holding the Challenge falls back at 15% on Steady, so it sits under 40% often. Re-measure once the holder line lands. Rarely triggers for other seats on Steady.

**7. Bailey Stand** · Krell's Hold
−1.5 / 2.5 / 3.5% damage taken vs bosses
Best for: Tank
Note: Could become a must-have for boss tanks.

**8. Barred Door** · Carter's Rest
−1.5 / 2.5 / 3.5% damage taken while 2+ party members are below 70% health
Best for: Tank

## Body

**9. Tarred Through** · Krell's Hold
−1.5 / 2.5 / 3.5% damage taken while an enemy is casting at anyone in the party
Best for: Any
Note: Was "2+ enemies casting", which almost never happens. Works on Krell's Hold (Hot Pitch, Shield Slam, Mend the Dead). Does nothing on Muster Barrows or Hask's Ford until a Caster body exists there. Similar to #18.

**10. First Rank** · Muster Barrows
−1.5 / 2.5 / 3.5% damage taken above 90% health
Best for: Tank
Note: With a good healer this may be always on. Needs testing.

**11. Pyre Tender** · Pyre Field
+1.5 / 2.5 / 3.5% healing while 2+ party members are below 50% health
Best for: Healer
Note: Similar to #26.

## Legs

**12. Empty Wagon** · Ox Road
+1.5 / 2.5 / 3.5% healing below 30% mana
Best for: Healer

**13. Slack Water** · The Slake
+1.5 / 2.5 / 3.5% damage while the party is above 90% health
Best for: Ranger, Mage
Note: Always on at easy depths. Similar to #19.

**14. Goaded** · Hask's Ford
+1.5 / 2.5 / 3.5% damage while 2+ party members are below 70% health
Best for: Melee
Note: Similar to #39.

## Helmet

**15. Keeper's Carry ✓** · Flooded Wing
+1.5 / 2.5 / 3.5% healing on targets below 50% health
Best for: Healer
Note: Similar to #38.

**16. Full Wick** · Bone Wing
+1.5 / 2.5 / 3.5% spell damage above 80% mana
Best for: Mage
Note: Could be always on. Needs testing. Doesn't stack with #24.

**17. Pauper's Share** · Bone Wing
−1.5 / 2.5 / 3.5% damage taken while your healer is below 30% mana
Best for: Tank
Note: Does nothing without a healer.

## Boots

**18. Floodmark ✓** · Flooded Wing
−1.5 / 2.5 / 3.5% damage taken while an enemy is casting on you
Best for: Ranger, Mage
Note: Works on its home (Keeper Dunn's Snuff the Candles, the Bone Wall's Bone Slide). Does nothing where enemies don't cast, so it's dead on Muster Barrows and Hask's Ford until a Caster body exists there.

**19. Ledge Footing** · Wyvern Roost
+1.5 / 2.5 / 3.5% damage while no party member is below 70% health
Best for: Ranger
Note: Similar to #13.

**20. Carter's Flight** · Hask's Ford
−1.5 / 2.5 / 3.5% damage taken while the party is below 50% health
Best for: Ranger, Mage, Healer
Note: Rarely triggers on Steady. Good on Bold.

## Gloves

**21. Scorched Grip** · Pyre Field
+1.5 / 2.5 / 3.5% damage below 50% health
Best for: Melee
Note: Works better on Bold.

**22. Slate Hand** · Carter's Rest
+1.5 / 2.5 / 3.5% damage while an enemy is casting
Best for: Ranger
Note: Good for killing casters first. Works on its home (the Troll Brewer's Boiling Mash, the Stable Troll's Trough Swing). Dead on Muster Barrows and Hask's Ford until a Caster body exists there.

**23. Behind the Bar** · Carter's Rest
+1.5 / 2.5 / 3.5% healing while you're below 50% health
Best for: Healer

## Belt

**24. Banked Coals** · Ox Road
+1.5 / 2.5 / 3.5% spell damage below 30% mana
Best for: Mage
Note: The opposite of #16. Doesn't stack with it.

**25. Numbed** · The Slake
−1.5 / 2.5 / 3.5% damage taken from chilled enemies
Best for: Tank
Note: Needs a frost user in the party (Frost Slam, Hoarfrost, Chilling Lance or the support's Cold Palm).

**26. Long Rite** · Muster Barrows
+1.5 / 2.5 / 3.5% healing while the party is below 50% health
Best for: Healer
Note: Similar to #11.

## Cape

**27. Captain's Due ✓** · Muster Barrows
+1.5 / 2.5 / 3.5% damage vs bosses
Best for: Melee
Note: Similar to #28.

**28. Raised Colors** · Krell's Hold
Party: +1.5 / 2.5 / 3.5% damage vs bosses
Best for: Any
Note: Doesn't stack with #27 or another copy in the party.

**29. Crag Shelter** · Wyvern Roost
−1.5 / 2.5 / 3.5% damage taken below 30% mana
Best for: Healer, Mage

## Necklace

**30. Lime Pit** · Flooded Wing
+1.5 / 2.5 / 3.5% damage vs poisoned targets
Best for: Any, with a Healer using Green Sickness
Note: Sickness counts as poisoned, so a Healer keeps it nearly always on.

**31. Dunn's Warning** · Bone Wing
+1.5 / 2.5 / 3.5% healing while an enemy is casting
Best for: Healer
Note: Works on its home (the Bone Wall's Bone Slide, the Night Carter's Lime Sack). Does nothing where enemies don't cast, so it's dead on Muster Barrows and Hask's Ford until a Caster body exists there.

**32. Early Start** · Ox Road
+1.5 / 2.5 / 3.5% damage above 90% health
Best for: Melee, Ranger
Note: Rangers rarely get hit, so it may be always on. Needs testing.

## Ring

**33. Banded Oath** · Muster Barrows
Party: −1.5 / 2.5 / 3.5% damage taken while 2+ party members are below 50% health
Best for: Any
Note: Doesn't stack with #8 or another copy in the party.

**34. Lookout's Promise** · Krell's Hold
+1.5 / 2.5 / 3.5% damage while your tank is below 50% health
Best for: Ranger
Note: Fires more once the tank's fall-back line drops to 15% on Steady.

**35. Full Cellar** · Carter's Rest
+1.5 / 2.5 / 3.5% healing above 80% mana
Best for: Healer
Note: Could be always on. Needs testing.

**36. Bottom of the Quiver** · Wyvern Roost
+1.5 / 2.5 / 3.5% ranged damage with 50 or fewer arrows left
Best for: Ranger
Note: Recommend cutting. Carry 50 arrows and it's always on.

**37. Hask's Bargain** · Hask's Ford
+2.5 / 4.5 / 6.5% damage above 90% health, but +1.5 / 2.5 / 3.5% damage taken
Best for: Melee
Note: A risk/reward Trait. Needs new code. Yes or no on this type?

## Earrings

**38. Stair Bearer** · Bone Wing
+1.5 / 2.5 / 3.5% healing on your tank below 50% health
Best for: Healer
Note: Similar to #15.

**39. Bolting Team** · Ox Road
+1.5 / 2.5 / 3.5% damage while the party is below 50% health
Best for: Melee
Note: Similar to #14.

**40. Sour Vault** · Flooded Wing
−1.5 / 2.5 / 3.5% damage taken from poisoned enemies
Best for: Tank
Note: Needs Green Sickness in the party. It's the only Sickness left after the spell audit.

---

## Similar pairs (pick one, or keep both and they won't stack)

- #2 Soft Scale / #3 Ram's Head
- #8 Barred Door / #33 Banded Oath
- #9 Tarred Through / #18 Floodmark
- #10 First Rank / #32 Early Start
- #11 Pyre Tender / #26 Long Rite
- #13 Slack Water / #19 Ledge Footing
- #14 Goaded / #39 Bolting Team
- #15 Keeper's Carry / #38 Stair Bearer
- #16 Full Wick / #24 Banked Coals / #35 Full Cellar
- #25 Numbed / #40 Sour Vault
- #27 Captain's Due / #28 Raised Colors

## Drops by ground

Re-homed 2026-11-22 (the designer, lane/band-floor; 24-content-pipeline.md G4 and G8): Hask's Ford had none, and most scale Traits sat on a slot their ground never drops. Moved: 37 Hask's Bargain, 13 Slack Water, 25 Numbed, 14 Goaded and 20 Carter's Flight to Hask's Ford; 5 Snuffed and 26 Long Rite to Muster Barrows; 15 Keeper's Carry to the Flooded Wing (Keeper Dunn's wing). All 40 kept.

Narrowed 2026-11-26 (the designer, lane/designer-reds-1126; 12-targets.md 8.4, measured on the census of 8.2): six "when"s that were the strong four's resting state. 10 First Rank and 32 Early Start read the target's health over 70% (was the hero's own over 90%), 19 Ledge Footing reads nobody under 90% (was 70%), 13 Slack Water the party over 95% (was 90%), 37 Hask's Bargain holds below 90% health (was above), 12 Empty Wagon below 15% mana (was 30%). No rank's size moved. The cards below keep their first wording; `src/data/traits.js` is the row of record.

Re-homed 2026-11-23 (the designer, lane/designer-reads-1123; 29-tuning-pass.md 7.8): the Slake joins the scale with no Trait, so 13 Slack Water (the river goes slack at the Slake) and 25 Numbed (its cold bilge water) move there from Hask's Ford. The Slake drops both slots and serves two seats; the Ford keeps three on two seats.

- **Muster Barrows:** 1, 5, 6, 10, 26, 27, 33
- **Hask's Ford:** 14, 20, 37
- **The Slake:** 13, 25
- **Pyre Field:** 4, 11, 21
- **Krell's Hold:** 3, 7, 9, 28, 34
- **Carter's Rest:** 8, 22, 23, 35
- **Ox Road:** 12, 24, 32, 39
- **Wyvern Roost:** 2, 19, 29, 36
- **Bone Wing:** 16, 17, 31, 38
- **Flooded Wing:** 15, 18, 30, 40

## Changes from the spell audit

2026-11-22, from `23-spell-audit.md` section 8. All 40 kept. No Trait moved home for the audit: every "casting" Trait already lives on a ground where monsters cast (checked in each ground's `pack.js` `spells`). The re-homing above (lane/band-floor) moved no casting Trait, and none moved onto Hask's Ford needs a caster.

- #5 Snuffed, #25 Numbed: frost users listed. Cold Hands is cut, so Cold Palm is the support's one Chill.
- #6 Last File: note now says the tank falls back at 15% on Steady, so it fires for the tank. Re-measure after the holder line.
- #9 Tarred Through: re-keyed from "2+ enemies casting" to "an enemy casting at anyone in the party". Home noted.
- #18 Floodmark, #22 Slate Hand, #31 Dunn's Warning: each names the spells on its home, and says it's dead on Muster Barrows and Hask's Ford until a Caster body exists there.
- #4 Worrier: Gash (wave 3) bleeds more of the pull.
- #34 Lookout's Promise: fires more with the tank's lower line.
- #40 Sour Vault: Green Sickness is the only Sickness left (Breaking Blow and Lye Hands are cut).
