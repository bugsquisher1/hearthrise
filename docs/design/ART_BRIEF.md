# Art Brief: Tyler's calls (read FIRST before any art job)

These are Tyler's own decisions from 2026-10-15, consolidated here so they stop getting re-litigated. The references live in `docs/design/refs/`. When this file and anything older disagree, this file wins.

## YES (what he likes)
- **Huntera's hunting terrain:** dark, textured ground with rich foliage. **Huntera's monsters** are "the right look and feel" (`huntera-hunt-*`, `huntera-monsters-*`).
- **The TARGET town** (`TARGET-topdown-town-*`): high top-down, roofless cut-away interiors, thick stone walls, warm light pools, dense purposeful props, lots of ground variety (beach, grass with flowers, dirt, cobble).
- **The Discord creature set** (`STYLE-creatures-discord-*`, for the look only): detailed, characterful, strong silhouettes. **But not too gritty.**
- **The new dark-armour Aldric**, and the gritty cobble/stone textures (the 2026-10-15 wall proof).
- **VARIATION.** Straight structures are fine. Uniform flat fills and ruled flat edges are not.
- **Tibia's look and its OUTFIT system:** a base model with Head/Body/Legs/Feet recolour regions, plus purchasable outfits with addons (cosmetic only). Start simple.

## NO (rejected)
- **Huntera's TOWN** (`ANTI-huntera-town-*`): flat grey grids, flat bright furniture.
- **Stardew Valley** look (style A), **Zelda** look (style B), anything **cartoonish or chibi**, **bold accent colours**.
- **Too gritty or painterly** (style C).
- **Today's live game art** (style E): "a full tier below".
- **Characters leaning on straight terrain** (one angle for the whole scene).
- **Characters bigger than houses.**
- **Scenes made of mismatched pieces:** every element must look drawn by ONE artist, with the same outline, detail density, palette and light.

## CURRENT DIRECTION
- **Style D** (modern top-down like the TARGET town, 64 px characters at ×2) is the closest. Its gap is that the **characters don't match the scenery**.
- **Fix:** generate the characters with the SCENE as the style reference, so outline, detail, palette and light match.
- **OPEN:** oblique (Tibia fake-3/4) via `create_tiles_pro` `tile_type:"oblique"` (`oblique_lean`) for tilesets and buildings, under test. If it works, the oblique version of D competes.

## PROCESS RULES
- Show Tyler ONLY complete in-game-looking scenes (building + street + grass + props + hero facing the camera + creatures), at in-game zoom.
- One sheet, at most 3 options. Don't change instructions mid-run.
- Every world asset goes through `tools/world-art`, with the live atlases as the bar until the new style is approved.

## THE REAL TEST (Tyler, 2026-10-15)
Design the art around **four adventurers fighting monsters**, not a medieval village. Every style must be proven in a BUSY COMBAT scene in a hunting ground: a party of 4 (knight, archer, healer, sorcerer), a swarm of about 6 monsters, HP bars, damage/crit/heal numbers, an AoE effect, projectiles, loot and a target ring, plus the HUD. The criterion is READABILITY UNDER CHAOS: party vs monsters instantly distinguishable, units pop from the ground, and effects are legible. Busy ground that looks great empty but turns to mush in a fight FAILS.

## CHOSEN STYLE (Tyler, 2026-10-15): STYLE 1, CLASSIC MMORPG READABILITY
The reference is `refs/CHOSEN-style1-classic-combat-2026-10-15.png`. Tibia-like clarity with modern pixel quality: a straight top-down camera, calm bright ground, crisp readable sprites. Tyler loves the character shapes and sizes. Combat rules: effects sit under the HP bars and numbers; big bursts are semi-transparent; monster colours are kept away from ground colours. Change it with small tweaks along the way, not re-explorations.
