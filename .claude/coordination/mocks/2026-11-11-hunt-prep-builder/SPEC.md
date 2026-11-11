# Hunt prep builder (mocks, 2026-11-11)

Tyler 2026-11-11, with `art/reference/hunt-prep-builder-reference-2026-11-11.png`: "the Hunt prep tab sucks, why don't we do something like this?" The reference gives STRUCTURE only (§10 identity). Its colours, icons, fonts, class names and wording are not ours and are not used. The HUD action bar is settled (10-25) and does not change. This is the Hunt prep window.

How the mocks were made: the real `play.html` on the local world (`tools/qa/local-world.mjs serve`), a fresh hero (Marlow, the start kit) with two saved setups. The window body was replaced by the builder, built in the page from the game's own data modules and classes (`mock.css` only places them). Every name and number on the screens is the server's envelope or a data row. The one mock-only fill is Flame Strike on slot 6, so the grid reads fuller than a fresh hero's. Script: `make-mocks.mjs.txt`.

| Shot | What it shows |
|---|---|
| `before/desk-1440-hunt-prep.png`, `before/phone-922-hunt-prep.png`, `before/phone-922-hunt-prep-end.png` | today: a 420 px column of readiness, a paragraph, setup rows with Save here / Use / Delete, a name field |
| `after/desk-1440-builder.png` | the builder at rest |
| `after/desk-1440-picker.png` | + pressed on slot 8: the picker (this weapon's moves) |
| `after/desk-1440-drag.png` | a drag: the slot lifted, the drop slot dashed, "not saved" on the setup |
| `after/desk-1440-sorted.png` | after Sort automatically, with its one line |
| `after/phone-922-builder-top.png`, `after/phone-922-builder-bar.png`, `after/phone-922-picker.png` | the same as a sheet, stacked, the grid kept 2 x 10 at full tile size |

## What changes

The window becomes a builder for ONE setup at a time: pick a setup on the left, edit it on the right, then Save.

| Part | Adopted from the reference | Ours |
|---|---|---|
| Setups column | named sets, New, "start from what you are wearing" | the server's `hunt_presets` rows: name, "In use", gear count. **+ New setup** = today's Save current setup (ONE `hr_hunt_preset_save` into the first free number, named in place). **Start from what you wear** = today's Save here on the picked setup (ONE `hr_hunt_preset_save` over it), asks once: "Replace Boss nights with what you have on?". Rename in place on the name (ONE `hr_hunt_preset_rename`, as today). Delete sits on the picked row, never on the one in use, asks once (ONE `hr_hunt_preset_delete`). "2 of 5 setups", and past the count the Buy line (`hr_setup_slot_buy`) as today |
| Class row | vocation picker | **Fights as**, READ ONLY. Our role comes from the worn weapon and shield (`hunt-roles.js roleKeyOf`, Tyler 10-16 and 10-23), so it cannot be a picker. All five labels show (`HUNT_ROLES` in `ROLE_ORDER`: Melee (shield), Melee, Ranger, Mage, Healer), the setup's own lit. No hover, no press look. Pressing a dim one says how: "Wear a bow or a crossbow to fight as a Ranger." The line names the setup's weapon and shield (its gear row) |
| Stance | three icons | today's three words (`HUNT_STANCES` labels), the server's value pressed, one line from the row's own numbers: "Deals 10% more damage and takes 10% more." We have no stance icons and words read better than new art |
| Target | a select | today's select (`TARGET_MODES`), line "Who it hits first." |
| Distance | 1-4 buttons, "1 = chase" | today's Chase toggle and the 1-8 stepper (`HERO_DISTANCE`). Ours are two things (chase off with a distance is kiting), so they stay two. Line: "Chase on. Runs up to its target." / "Chase off. Stays 3 tiles away and backs off." |
| Action bar | 2 x 10 grid, + on empty, drag | the same 20 slots (`BAR_SLOTS`), the HUD's own `.hb-slot` tiles at the HUD's size (68 px, the 32 px icons at x2), numbers 1-20, counts from the server. Drag to move. A drop on a filled slot swaps, as the HUD's drop menu does. + opens the picker; picking opens today's **Configure action** for that slot (its conditions), so a new slot never lands without its rule. Pressing a filled slot opens Configure action too |
| Picker | (implied) | Moves / Food and drink / Ammo. Moves are only this setup's discipline (`bar-draft.js moveOffWeapon`, never an off-weapon move), each with its cooldown and mana from `ABILITIES`. Food, drink and ammo are what the bag holds and what the store sells, with the counts and prices the bar already shows. "On the bar already" is dimmed, still pickable |
| Sort automatically | yes | see below. Client-only on the draft, saved by Save |
| Clear | yes | empties the draft's 20 slots. Save sends it. The engine then fights with its role defaults, as an empty bar does today |
| Footer | Close, Copy code, Save to Bestiary, Save and use | **Close · Save · Save and use** (the one gold primary). Left of them: the hero's readiness line from `readiness.js`, red when short, or "Not saved yet. Save keeps it, Close throws it away." when the draft differs |

### Sort automatically, defined

The engine tries a hero's slots in bar order, and in each lane (`conditions.js LANE_OF`: moves, food and drink, ammo) the first slot that can fire, fires. `attackOrder` already orders the ammo lane: slots with conditions first, then the worn ammo, then the plain ones. Sort applies that same rule to every lane and lays the lanes out left to right:

1. Moves, then food and drink, then ammo. Lanes run on their own, so this changes nothing the hero does. It makes the bar readable.
2. In each lane, a slot with conditions goes before a slot without. A plain slot fires whenever it can, so one ahead of a ruled slot of the same lane can starve it. This is the one place Sort changes behaviour, and it is the engine's own ammo rule.
3. Ammo keeps `attackOrder` exactly.
4. Slots switched off go to the end of their lane. Otherwise the order the player had is kept (a stable sort).
5. Empty slots go last.

Player line after a sort: "Sorted. Moves first, then food and drink, then ammo. In each, a slot with a rule goes before a plain one." The function is pure and lives in `src/core/hunt/` beside `attackOrder`, with a unit test.

## What stays

- The HUD bar, its plaque and its instant edits (10-25). It still edits the setup in use, one intent each.
- Configure action, unchanged, opened per slot.
- Use and gear changes are town-only. In a hunt, Save still works on the setup in use (the next settle runs it, as the bar's edits do today). Save and use is off with "Setups change in town. This hunt keeps the bar it set off with."
- **Carry in** (while hunting) stays, as a footer button "Carry in" that opens today's list. It is per hunt, not per setup.
- **Ready?** for every open hero: this hero's line sits in the footer. Pressing it opens today's checklist for every open hero.

## Client and server

| Piece | Client only | Server verb |
|---|---|---|
| Pick a setup, the draft, drag, picker, Sort, Clear | yes, display scratch that nothing spends (§6). The draft is rebuilt from the server's row on every pick. If the envelope changes the picked setup while the draft is dirty (the HUD bar edited it), the footer says "This setup changed on the bar. Load it again?" and Save stays off until it is loaded | none |
| Save (slots + stance + target + distance + chase of ANY setup) | | ONE `hr_action_set_options(slot, preset, {slots, stance, target_mode, distance, chase})`. Exists: it takes any preset number and every key in one call (`2027-02-28-setup-slots.sql`) |
| Save and use | | the Save above, then ONE `hr_hunt_preset_apply`. Both exist |
| New, Start from what you wear, rename, delete, buy a slot | | exist (`hr_hunt_preset_save / _rename / _delete`, `hr_setup_slot_buy`) |
| **Show a setup that is not in use** | | **MISSING.** `hunt_presets` carries name, gear and action set id only; `hunt_settings` carries the in-use setup's bar. The builder needs the picked setup's slots and options. Add ONE read-only `hr_hunt_preset_read(p_slot, p_preset)` returning the `hr_hunt_settings_view` shape for that preset, owner only, on demand when a setup is picked (not in every envelope: 5 x 20 slots would bloat it). No money, no ranking. Until it lands the builder can edit only the setup in use and the others show "Use it to edit its bar" |

**Copy code: left out.** We have no share format. If wanted, it is a server feature, not text in the client: `hr_action_set_share(slot, preset)` stores the slots and options (never gear, counts or names) under a short code with a per-day clamp, and `hr_action_set_import(code, slot, preset)` re-checks every slot with `hr_hunt_slot_check` and drops moves the importer's weapon can't use. It crosses players, so it is journalled and goes on the pre-EA Security list (§3.7).

**Save to Bestiary: left out.** Nothing in our game binds a setup to a monster. The closest thing we have is the setup picked on Enter (`hr_hunt_enter p_preset`). See question 1.

## Build lanes

| Lane | What | Size |
|---|---|---|
| C, small | `hr_hunt_preset_read` (read-only, owner only, §4 self-check, schema-drift replay, client RPC baseline row) | about 2 h |
| B | the builder: `hunt-prep.js` split so no module passes the size guard (frame + setups column, grid + drag + picker, footer + readiness + carry in); `src/core/hunt/bar-sort.js` (pure) with its unit test; about 120 lines into `windows.css` (the layout in `mock.css`, tokens only); words into `src/data/text/prep.js`; a happy-path test (pick a setup, drag, Sort, Save sends ONE intent with the whole bar, the screen changes only from the re-read); the phone sheet at 922 x 423 | 1 lane, about a day |
| Retire | today's setup rows and paragraph in Hunt prep, and the HUD's "Saved setups" check button then opens this window on the setup in use | inside lane B |

## Questions for Tyler (at most four)

1. **Save to Bestiary.** Leave it out, or make it "Use on this ground": a setup remembered per hunting ground, so Enter there picks it for you? That one is worth having. It is a small server column.
2. **Share codes.** Worth a server lane now so players can trade bars on Discord, or after Early Access?
3. **Draft and Save.** The builder edits a copy and Save sends it once, like the reference. The HUD bar keeps saving on every drag. OK to have both, or should the builder save every change at once too?
4. **Fights as.** It can't be picked here because your weapon decides it. Is a read-only row with "Wear a bow to fight as a Ranger" clear enough, or drop the row and just name the role in the setup's line?
