# Asset Director — running log

_Your private journal. Newest at top. Team-wide items also go to `DISCOVERIES.md` / `HANDOFFS.md`._

## Standing knowledge
- `assets/` curated 949→155; structure FROZEN (icons-bundle paths wired ~360 places in legacy.js + smoke). Prefer add over rename.
- Icons baked into `src/data/glyphs.js` — no runtime asset fetch (offline must work).
- Unused art archived in gitignored `_archive/` (reserve-art, pixel-packs, raw-packs, asset-tooling). Move, never hard-delete.
- Map = `ASSET_MANIFEST.md` + `_archive/README.md`. Keep them true.
- Verify migrations: 0 404s (`read_network_requests`), clean console, smoke 175/175.

## Log
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
