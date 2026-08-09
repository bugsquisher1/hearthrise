# Asset Director — running log

_Your private journal. Newest at top. Team-wide items also go to `DISCOVERIES.md` / `HANDOFFS.md`._

## Standing knowledge
- `assets/` curated 949→155; structure FROZEN (icons-bundle paths wired ~360 places in legacy.js + smoke). Prefer add over rename.
- Icons baked into `src/data/glyphs.js` — no runtime asset fetch (offline must work).
- Unused art archived in gitignored `_archive/` (reserve-art, pixel-packs, raw-packs, asset-tooling). Move, never hard-delete.
- Map = `ASSET_MANIFEST.md` + `_archive/README.md`. Keep them true.
- Verify migrations: 0 404s (`read_network_requests`), clean console, smoke 175/175.

## Log
### 2026-08-08 · b229 — the Stable's pet icons ("figure out what to do about pet icons")
Worked in the `manual-stable` worktree (branch `agent-stable`). Full write-up in `ASSET_MANIFEST.md` ("b229 — the Stable's pet icons"); change contract + artist brief here.

**Inventory.** The Stable renders exactly 22 companions/pets: 12 base companions in `src/data/companions.js` + 10 skill/boss pets added b202 (source kinds `skill:`/`boss:`, same file). Confirms the Art Director's audit count ("~22 emoji"). Every one carries an emoji `icon` field that was reaching the DOM raw in six places: the Stable grid (`.sc-icon`), the doll's companion equip slot, the Character page's companion detail pane (`.td-comp-icon`), the profile mini-card (`.cc-icon`), and the shop's "buy a companion" rows (`.si`). Note: `src/legacy.js` carries a second, stale copy of `window.COMPANIONS` (12 entries, missing the 10 pets) and its own dead `renderStable()`/`injectProfileCard()` — the live path is the ESM `src/features/companions.js`, which overwrites `window.COMPANIONS` at boot and wins the DOM race on every `showTab('stable')` (its `setTimeout(renderStable,30)` is scheduled after legacy's). Fixed both copies anyway (defense-in-depth, and legacy.js's is genuinely reachable if `main.js` ever fails to load).

**Promoted (2 files, copied out of `_archive/reserve-art/monster-portraits/`, originals untouched):** `wolf_pup` ← `Animals_07_nobg.png` (a wolf — direct species match), `hawk` ← `Animals_05_nobg.png` (a hooked-beak bird of prey — same "raptor" identity as the companion, even though the file reads more falcon than hawk). Both 256×256 RGBA, transparent background, painterly head/bust crop — same treatment as the existing `painted/monsters/` set. New folder: `assets/icons-bundle/painted/companions/`.

**Rejected, with reasons (20 of 22 stay on the glyph):**
- `sparrow`, `owl`, `heron` — the only other bird in reserve-art is the falcon/hawk file; a fierce raptor face would misrepresent a songbird, an owl's round face, or a heron's wading-bird silhouette. Same mistake class as "dolphin for a fox."
- `whelp`, `dragonling` — the only dragon art in reserve (`Monster_WarDragon_nb.png`) was already promoted b224 as the Hunt boss `crownless_wyrm`'s own portrait. Reusing a raid boss's identity for an unrelated companion (and a "whelp" life-stage mismatch on top) was rejected.
- `fox`, `bunny`, `honeybee`, `badger`, `scorpion`, `raccoon`, `tortoise`, `beaver`, `rock_golem`, `squirrel`, `phoenix_chick`, `forge_imp`, `silkling`, `grave_wisp`, `lichling` — no honest match anywhere. Re-swept all of `_archive/reserve-art/monster-portraits/` (31 files, mostly humanoid/undead bosses) and `_archive/raw-packs/icons3/` (the pre-curation mega-pack; has name-adjacent hits like `phoenix.png`, `summon_imp.png`, dragon/golem/spider skill icons) — raw-packs is a flatter icon-illustration style never promoted into `assets/` and explicitly unshipped per `CLAUDE.md`; mixing it in next to the 2 painted portraits and the painted Hunt bosses would read as inconsistent, not "found."

**Render seam.** `window.companionIconHtml(id, px)` in `src/legacy.js` (defined immediately after `window.COMPANIONS`), mirroring `raids.js`'s `bossPortraitHtml()`: portrait `<img onerror="this.remove()">` for a match, else `HR.medallion('uiPaw', px)` — the shared gilt paw glyph already baked in `src/data/glyphs.js` (never fetched/added). `def.icon` stays emoji in the data; every render site bypasses it through this helper instead of stripping post-render, so there's nothing for a sweep to miss.

**Bug found and fixed in passing:** the doll's companion slot (`window.buildTibiaDoll()`, shared by the Character page and the Inventory page's equip column) resolved the equipped companion via `ITEMS[G.equipment.companion]` like every gear slot — but `equipCompanion()` only mirrors the legacy `fox_companion` item id into `G.equipment.companion` for the fox; every other companion writes its raw `COMPANIONS` id there, which isn't in `ITEMS`. That silently rendered 21 of 22 equipped companions as an **empty slot** in the doll (while the info panel right next to it, which reads `G.companions.equipped` directly, showed the truth). Fixed to resolve the companion slot from `G.companions.equipped`/`window.COMPANIONS` directly; regression-guarded by the same new smoke test (it walks the doll for all 22 ids, not just the grid).

**Guard added:** `src/features/smoke-test.js` — "b229: no emoji in the Stable panel DOM, in any state." Sweeps all-locked, all-owned, and each of the 22 equipped in turn, across both the Stable grid and `buildTibiaDoll()`. Also exposed `window.renderStable` from the ESM module so the test (and the pre-existing "clicks: stable companion cards" test, which was silently racing the 30ms render timer before this) can force a synchronous re-render.

**The artist brief — 20 companions/pets still need a painted portrait.** Spec: 256×256 PNG, RGBA transparent background, head/bust crop, warm painterly lighting — match `assets/icons-bundle/painted/companions/wolf_pup.png` / `hawk.png` (copied from `_archive/reserve-art/monster-portraits/Animals_07_nobg.png` / `Animals_05_nobg.png`) and the existing `painted/monsters/` set for style. Drop finished files straight into `assets/icons-bundle/painted/companions/<id>.png` and add one line to the `COMPANION_PORTRAIT` map in `src/legacy.js` — the render seam already handles the rest (grid, doll, detail pane, profile card, shop row all update from that one map).

| id | display name | role | identity notes |
|---|---|---|---|
| `fox` | Fox | utility | starter companion, everyone has it — highest-value commission first. Small red fox, alert/friendly expression (not menacing — it's a starting buddy, not a boss). |
| `sparrow` | Sparrow | gather | small brown songbird, NOT a raptor — soft, quick, unthreatening. |
| `bunny` | Bunny | gather | rabbit, farm-quest reward — soft/round, farm-cozy tone. |
| `honeybee` | Honeybee | artisan | insect, not mammal/bird — a genuinely different silhouette from the rest of the roster. |
| `badger` | Badger | combat | mustelid, black/white face stripe is the identity marker — don't let it read as a generic brown mammal. |
| `owl` | Owl | artisan | round face, huge forward-facing eyes, short hooked beak — distinct from the hawk/falcon profile already shipped. |
| `tortoise` | Tortoise | combat | shelled reptile, slow/sturdy read (matches its defB/hpRegen bonus). |
| `whelp` | Whelp | combat | a young/small dragon — must NOT reuse `crownless_wyrm`'s adult-dragon portrait (already spoken for as a raid boss); needs its own smaller, less fearsome dragon. |
| `scorpion` | Scorpion | combat | arachnid, pincers + tail stinger are the silhouette. |
| `raccoon` | Raccoon | utility | masked face is the identity marker. |
| `beaver` | Beaver | gather (woodcutting pet) | flat paddle tail + buck teeth are the identity marker. |
| `rock_golem` | Rock Golem | gather (mining pet) | not an animal — a stone/mineral construct face. |
| `heron` | Heron | gather (fishing pet) | long-necked wading bird, thin dagger beak — distinct from the falcon/hawk profile already shipped. |
| `squirrel` | Squirrel | gather (farming pet) | bushy tail, alert small rodent face. |
| `phoenix_chick` | Phoenix Chick | artisan (cooking pet) | a HATCHLING phoenix, not the adult mythic firebird — small, downy, warm-toned (fits the cooking/fire theme) but young/cute, not majestic. |
| `forge_imp` | Forge Imp | artisan (smithing pet) | small impish creature, soot/ember coloring fits the forge theme. |
| `silkling` | Silkling | artisan (crafting pet) | spider-adjacent (silk), small and industrious-looking rather than menacing. |
| `grave_wisp` | Grave Wisp | artisan (prayer pet) | small ghostly wisp/flame — ethereal, not a solid creature. |
| `lichling` | Lichling | utility (lich boss pet) | a small skeletal/undead creature — again must not reuse the `hollow_regent` Hunt boss's portrait (life-stage/identity mismatch, same reasoning as whelp/dragonling). |
| `dragonling` | Dragonling | combat (dragon boss pet) | same brief as `whelp` — a young dragon distinct from both `crownless_wyrm` and whatever gets painted for `whelp` (they're different companions, ideally visually distinct from each other too, not just from the boss). |

**Verified:** smoke 332/332 (+1 guard), `bump-version.sh --check` OK, 0 asset 404s (network log + `read_network_requests`), console clean. Runtime walked at `localhost:8171` (worktree's harness seam, added to `.claude/launch.json`) — Stable grid (22 cards, mixed owned/locked/equipped), Character → Companion tab (both a portrait id and a glyph-only id equipped), Manage gear doll. Commit `<see final report>`.

### 2026-08-08 · b224 — asset promotion pass (Hunt bosses, shop keeper judgment, castle goods, homestead/hen)
Worked in the `agent-asset-pass` worktree. Full change contract in `ASSET_MANIFEST.md` ("b224 — Asset Director promotion pass"); summary here.

**Promoted (9 files, all copied out of `_archive/reserve-art/`, originals untouched):**
- 6 Hunt boss portraits, matched to each boss's flavour text in `raids.js` (not just filename) — Demon_01→emberclad_tyrant, Monster_SkeletonKing→hollow_regent, Monster_Worm→maw_below (a literal gaping maw beat a tentacle for "The Maw Below"), Monster_FrostSkeleton→sunken_choir, Giant_StoneGolem→warden_long_dark, Monster_WarDragon→crownless_wyrm. Wired via a new `BOSS_PORTRAIT` map + `bossPortraitHtml()` helper in `raids.js`, rendered in both Hunt card variants. Fallback is `''` (no `<img>` at all) for an unmapped boss, plus `onerror="this.remove()"` on every tag — never a broken-image icon, glyph is always the backstop.
- `timber_beam` (Res_23_oldwood.png), `field_ration` (Res_137_bread.png), `iron_fitting` (Cog.png) — wired in `LOCAL_ITEM_ICON`/`applyLocalIcons()`.

**Rejected, with reasons:**
- `keystone` — nothing in reserve-art reads as a cut masonry block (only raw ore-pile mounds and polished gems exist). Kept on its gilt atlas glyph.
- Shop keeper (`Duke_nb.png`/`Warrior_nb.png`/`ElfMage_nb.png`) — judged RENDERED by temporarily overlaying each at the keeper's position in the live `SHOP_SCENE`, screenshotting, then removing (nothing committed). All three read as a pasted rectangular photo-bust against the scene's flat vector silhouette art — the exact "sticker" failure the Art Director's b221 log already fixed once for the rim-light. SVG keeper stands.
- Homestead dusk plates (b219) / hen icon (b221) — confirmed nothing fits in reserve-art (`backgrounds/` is one wrong-medium/wrong-tone cartoon ruins scene; the 7 `Animals_*` portraits are dolphin/horse/falcon/boar/wolf/lynx/vulture, no hen anywhere). Both still need a human artist — not closeable by promotion.

**Bug found and fixed in passing (P1-ish — was actively corrupting this pass's own `keystone` decision):** `__mapGeneratedGearIcons()` (bottom of `legacy.js`) matched "id ends with slot key" as `id.indexOf(k) === id.length - k.length`, with no check that `indexOf` found anything — `-1 === -1` false-matches any id exactly one char shorter than a slot key. `keystone` (8 chars) was silently being painted as a steel platebody. Fixed to require a real match; regression test added.

**Manifest:** `_archive/reserve-art/` was re-sorted by purpose since the b216 pass wrote the Quarantine table (flat `resources/`/`medieval/`/`monsters/` → 8 purpose folders); reconciled counts against disk and corrected the stale paths.

**Verified:** smoke 263/263 (+2 guards), `bump-version.sh --check` OK, 0 asset 404s (curl + `read_network_requests`), console clean apart from the documented pre-existing offline-Supabase probe. Commit `<see final report>`.

### 2026-08-08 · bootstrap
Asset library organize already done (2026-08-08) and now committed in `119a698`. No active task.
