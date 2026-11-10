# Sound list for sourcing (2026-11-10)

Lane: `lane/b-sound`. The system is built and ships switched off (`src/data/sound-buses.js` `SOUND.shipped: false`). No audio file exists. This is the list to source against. Every row is one entry of the sound map (`src/data/sounds.js`) and the file name it expects under `assets/audio/`.

**The sound of Hearthrise:** a small medieval town and the wild ground around it. Hand-made things: wood, iron, leather, rope, stone, cloth, coin, fire, water. Recorded, not synthesised. No synth blips, no arcade chimes, no orchestral stingers, no "magic sparkle" stock. A press is a wooden latch, a purchase is coin on a counter, a level is a bell someone actually struck. Magic is the element itself (a fire catching, ice cracking), not a laser.

**Format:** OGG Vorbis, mono for effects, stereo for beds and music, 44.1 kHz, peaks around -3 dB, no silence at the head. One-shots are trimmed tight. Loops must loop without a click.

**Priority:** 1 = the ten sounds that matter most in the first ten minutes. 2 = needed before sound is switched on. 3 = can follow.

## One-shots (29)

| # | Event id | File | What it is, in the world | Length | Pri |
|---|---|---|---|---|---|
| 1 | `loot_rare` | `loot/loot-rare.ogg` | The rare drop. A small bronze hand bell struck twice, the second higher, over a heavy coin purse set down on wood. The one sound in the game nothing else resembles. The world goes quieter under it. | 1.5-2.5 s | **1** |
| 2 | `hero_hit` | `combat/hero-hit.ogg` | A hero's blow landing: a blunt thud of iron on hide. Short and dry. It plays more than any other sound, so it must not tire the ear: no ring, no clang. Needs 3 or 4 takes later. | 0.1-0.2 s | **1** |
| 3 | `monster_die` | `combat/monster-die.ogg` | A monster going down: a body dropping on earth with a short breath out. Not a scream. A pack dying is one or two of these layered, never eight. | 0.3-0.5 s | **1** |
| 4 | `hero_hurt` | `combat/hero-hurt.ogg` | The viewed hero taking a blow: a hit on leather and mail with a grunt held back. Must read as "that was me" against `hero_hit`. | 0.2-0.3 s | **1** |
| 5 | `level_up` | `moments/level-up.ogg` | A Level gained: the town's hearth bell rung once, full, with a flare of fire behind it. Warm, not triumphant brass. | 1.5-2.5 s | **1** |
| 6 | `loot_common` | `loot/loot-common.ogg` | Ordinary loot: a few coins and a small thing dropped into a leather pouch. Quiet. It plays every few kills. | 0.2-0.4 s | **1** |
| 7 | `hunt_start` | `moments/hunt-start.ogg` | Leaving for a hunt: the gate latch lifted and a hunting horn, one short call, from a little way off. | 1-2 s | **1** |
| 8 | `hunt_end` | `moments/hunt-end.ogg` | Back in town: the gate closing behind you and a pack set down on a bench. Relief, not fanfare. | 1-2 s | **1** |
| 9 | `ui_press` | `ui/press.ogg` | Any button: a wooden latch or peg clicked home. Very short, very soft. Heard hundreds of times a session. | under 0.1 s | **1** |
| 10 | `purchase` | `ui/purchase.ogg` | A purchase or a sale the server agreed to: coins counted onto a wooden counter. | 0.3-0.6 s | **1** |
| 11 | `hero_death` | `moments/hero-death.ogg` | The hero dies: a body and its gear falling, then one low bell stroke, damped. Sad and short. The world goes quieter under it. | 2-3 s | 2 |
| 12 | `skill_up` | `moments/skill-up.ogg` | A skill level gained: a smaller bell than the Level's, or a whetstone's last clean stroke. One note. | 0.6-1 s | 2 |
| 13 | `refusal` | `ui/refusal.ogg` | The server said no: a dull knock on wood, a locked door tried once. Not a buzzer. | 0.2-0.3 s | 2 |
| 14 | `cast_fire` | `spells/cast-fire.ogg` | A fire spell: a torch swung hard, the flame catching with a whoosh. | 0.4-0.7 s | 2 |
| 15 | `cast_ice` | `spells/cast-ice.ogg` | An ice spell: pond ice cracking and a cold breath of air. | 0.4-0.7 s | 2 |
| 16 | `cast_heal` | `spells/cast-heal.ogg` | A heal: spring water poured over stone, with a small glass chime under it. | 0.5-0.8 s | 2 |
| 17 | `cast_strike` | `spells/cast-strike.ogg` | A weapon skill (Power Strike, Cleave, Precision Shot): a heavy swing through air and a harder impact than `hero_hit`. | 0.3-0.5 s | 2 |
| 18 | `window_open` | `ui/window-open.ogg` | A window opens: a leather-bound ledger opened, or parchment unrolled. | 0.2-0.3 s | 2 |
| 19 | `window_close` | `ui/window-close.ogg` | A window closes: the same ledger shut. | 0.2-0.3 s | 2 |
| 20 | `party_invite` | `social/party-invite.ogg` | A party invite: two knocks on a door and a short horn note. Must be heard over a fight. | 0.8-1.2 s | 2 |
| 21 | `chat_message` | `social/chat-message.ogg` | Someone else's chat line or a private message: a quill tapped on an inkwell. Tiny. | 0.1-0.2 s | 2 |
| 22 | `ally_hurt` | `combat/ally-hurt.ogg` | A party member taking a blow: the same family as `hero_hurt`, duller and further off, no voice. | 0.2 s | 3 |
| 23 | `blow_miss` | `combat/blow-miss.ogg` | A miss, a dodge or a blow a barrier swallowed: a blade through empty air. | 0.15-0.25 s | 3 |
| 24 | `cast_poison` | `spells/cast-poison.ogg` | A poison spell (Green Sickness): something thick bubbling, a wet hiss. | 0.4-0.7 s | 3 |
| 25 | `cast_ward` | `spells/cast-ward.ogg` | A shield spell (Arcane Barrier, Protective Ward): stone grinding into place, a low hum settling. | 0.5-0.8 s | 3 |
| 26 | `cast_shout` | `spells/cast-shout.ogg` | The tank's Challenge and other support casts: a shield beaten once with a sword hilt. | 0.4-0.6 s | 3 |
| 27 | `boss_phase` | `combat/boss-phase.ogg` | A called boss crosses a line (adds, enrage): a deep roar in a stone hall, with the floor shaking. | 1.5-2.5 s | 3 |
| 28 | `eat` | `combat/eat.ogg` | The hero eats: one bite of crusty bread. | 0.2-0.3 s | 3 |
| 29 | `drink` | `combat/drink.ogg` | The hero drinks: a swallow from a clay cup. | 0.3-0.4 s | 3 |

## Loops: ambience (11) and music (2)

| # | Event id | File | What it is | Length | Pri |
|---|---|---|---|---|---|
| 30 | `amb_town` | `ambience/town-square.ogg` | Havora's square: distant voices, a cart, birds, the great hearth burning somewhere behind. The default for every place in town with no bed of its own. | 60-90 s loop | 2 |
| 31 | `amb_wilds` | `ambience/wilds.ogg` | Open country (Bramble Edge, the Thicket, Ridge Camp, and any new ground that names no bed): wind in grass, birds, a brook. | 60-90 s loop | 2 |
| 32 | `amb_forge` | `ambience/forge.ogg` | The Smithy: bellows, the forge's roar, a hammer on an anvil now and then (not a steady beat). | 45-60 s loop | 3 |
| 33 | `amb_hearth` | `ambience/hearth.ogg` | At the Hearth: a very large fire, close. Deep crackle and draw. | 45-60 s loop | 3 |
| 34 | `amb_farm` | `ambience/farm.ogg` | The farm: hens, a breeze, a hoe in soil, water in a ditch. | 45-60 s loop | 3 |
| 35 | `amb_yard` | `ambience/training-yard.ogg` | The Training Yard: wooden swords on a post, a straw dummy struck, a sergeant's voice without words. | 45-60 s loop | 3 |
| 36 | `amb_cellar` | `ambience/cellar.ogg` | Mill Cellar: a low room under a mill. Dripping, the wheel turning overhead, something small moving in grain. | 45-60 s loop | 3 |
| 37 | `amb_sewer` | `ambience/sewer.ogg` | The Sewer and the Rat King's Hall: running water in a brick tunnel, echo, rats. | 45-60 s loop | 3 |
| 38 | `amb_warren` | `ambience/warren.ogg` | Goblin Warren, Coppercap Warrens and the Chief's Hall: tunnels, a pick on rock far off, pots clinking. | 45-60 s loop | 3 |
| 39 | `amb_glade` | `ambience/glade.ogg` | Mosslight Glade: a spring rising, wet moss, very still air, a high soft ringing from the copper water. | 45-60 s loop | 3 |
| 40 | `amb_ruin` | `ambience/ruin.ogg` | Wickstead, the burned farm: wind through broken timber, a loose shutter, crows. | 45-60 s loop | 3 |
| 41 | `music_town` | `music/town.ogg` | Town music: one or two real instruments (a lute, a wooden flute, a small hand drum). Slow, in a major key, room to breathe. It sits under the ambience. | 2-3 min loop | 3 |
| 42 | `music_hunt` | `music/hunt.ogg` | Hunt music: the same instruments, a steady low pulse, no melody that tires after an hour. A hunt runs for hours. | 2-3 min loop | 3 |

**The ten that matter most in the first ten minutes** (rows 1-10): the rare drop, the hero's blow, a monster's death, the hero being hit, the Level-up, common loot, the hunt's start, the hunt's end, the button press, the purchase. With those ten the game is no longer silent in any moment a new player meets. Ambience and music can follow.

**Variants.** The map holds one file per event today and tunes each play by a few percent so repeats differ. For `hero_hit`, `monster_die` and `hero_hurt` three or four takes each would be better. That is one more field in the map when the files exist, not a redesign.

## Three ways to source them

**Not checked today.** Everything below is from what I know of these sources, not from a visit. No site was opened and nothing was downloaded. Prices and licence terms change. Each needs a read of its current licence page before a single file is committed, and the licence text kept in the repo beside the files.

### A. A CC0 library (free)
Sources of this kind: Freesound (filtered to its CC0 licence), Kenney's audio packs, the CC0 section of OpenGameArt, Sonniss's yearly GDC give-away bundle (royalty-free under its own licence, not CC0).

- **Cost:** no money. The cost is time: a day or two of searching and trimming for the ten, a week for all 42.
- **Licence:** CC0 needs no credit and allows commercial use on Steam. The trap is that these sites mix licences. Freesound also hosts CC-BY (credit required) and CC-BY-NC (no commercial use, unusable for us). Each file's own licence has to be read and recorded, one by one. An uploader can also post something they had no right to.
- **Quality:** uneven. Forty-two sounds from thirty recordists in thirty rooms do not sound like one game without work: matching loudness, tone and tail. Kenney's packs are consistent with each other but lean toward clean interface clicks, close to the "generated dashboard" sound to avoid.
- **Fits:** good for the first ten, to hear the game with real sound this week and replace later. Weakest for the rare drop and the Level-up, which should be ours alone.

### B. A paid pack
Sources of this kind: a medieval or fantasy RPG sound pack from a game audio store (Unity Asset Store, itch.io, Epidemic Sound's or Soundly's libraries, Boom Library, Ovani Sound, Sonniss).

- **Cost:** from what I know, a focused indie pack runs about 20 to 100 USD once, and a premium library 100 to 300 USD. Subscription libraries charge per month and their licence may end with the subscription, which is the wrong shape for a shipped game. Needs Tyler's approval for the spend.
- **Licence:** normally royalty-free for use inside a shipped game, with no credit required and no right to resell the raw files. Two things to check on the exact pack: that files may sit in a public web build where anyone can download them (this game is served from GitHub Pages; some licences ask that assets be "embedded" or not easily extracted), and that the licence is per studio and perpetual.
- **Quality:** one recordist, one room, one mastering pass, so the set sounds like one world from the first day. Other games bought the same pack, so the rare drop will not be unique.
- **Fits:** the best cost for the result for combat, the interface and ambience. Pair it with a custom rare drop, Level-up and death.

### C. Commissioned
A freelance game sound designer, briefed with this list.

- **Cost:** from what I know, roughly 15 to 60 USD a sound for simple effects, more for the signature moments and loops, and music priced by the finished minute (often 150 to 500 USD a minute from an indie composer). All 42 would land somewhere around 1,000 to 3,000 USD, and the ten priority sounds alone a few hundred. These are ranges, not quotes. Needs Tyler's approval and a written contract.
- **Licence:** whatever the contract says. Ask for full ownership or an exclusive perpetual licence for the game, its trailers and its store pages, and state whether the designer may reuse the sounds elsewhere.
- **Quality:** the only route where every sound is made for this list and no other game has them. Slowest: two to four weeks with revision rounds.
- **Fits:** the signature moments (rare drop, Level-up, death, hunt start and end) and the two music loops, where being recognisable matters most.

### How they combine
The three are not exclusive. The usual indie path is B for the bulk, C for the five signature sounds and the music, and A only to hear the game while the others arrive. No choice has to be made to merge this lane: the system runs today on generated test tones (`play.html?sound=tones`) and on nothing at all without that flag.

## How to switch it on, once files exist
1. Put the files under `assets/audio/` at the paths above, with the licence text beside them.
2. Set `SOUND.shipped` to `true` in `src/data/sound-buses.js`. `tests/sound.mjs` rule SND-3 then fails for any file the map names that is missing.
3. Play it, tune `vol`, `cooldownMs` and `voices` per row in `src/data/sounds.js`, and have the art director listen before release.
