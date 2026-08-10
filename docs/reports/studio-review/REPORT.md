# Hearthrise — Studio-Grade Creative Review

*Executive Producer synthesis of six discipline reviews (Art Direction, Asset Direction, Game/Economy Design, QA-Desktop, QA-Mobile, Systems Engineering) covering the b268–b281 itemization/progression rework.*

---

## 1. Executive Summary

**Is this shipping-quality today? No.** The b268–b281 rework is not shippable to a studio-grade beta in its current state, and the reason is unusually clean to diagnose: **the endgame — the content we most want to look finished — is the least finished content in the game.**

Here is the honest shape of the gap. Hearthrise has, underneath, a genuinely professional foundation. `art-direction.css` (b217) is a real design system with earned containment, one-job colour roles, a surface value-ladder and a coherent medieval type hierarchy. The save/migration layer is production-grade (versioned to v12, backed-up, idempotent). The armour-triangle data model is clean, threaded through the existing combat summation with zero engine change. The landscape mobile chrome is well-engineered. This is not a weak project; it is a strong project with a **discipline lapse concentrated entirely in its newest, most-marketed code.**

That lapse is consistent across four independent disciplines and it is the same lapse: **the b268–b281 content was bolted on without obeying the systems the game already owns.** It renders large OS emoji as on-screen art (an 84px 👺 is literally the boss you fight), reintroduces the exact off-palette moss-green and soft 8–9px radii that five prior builds were spent removing, ships ~69 armour pieces plus every signature weapon on emoji fallback, and — worse than missing art — renders a *wrong* plate-helm silhouette on every leather/cloth caster helmet. This is a direct, repeated violation of the FINAL DIRECTIVE ("zero emoji art") and the CLAUDE.md HARD RULE ("no hardcoded colors").

Layered on top of the visual gap are **two real economy-safety defects** (dungeon scrip is destroyed at a full bag on both earn and purchase paths — unrecoverable currency loss of up to 800 scrip), **a combat-math bug** (plate warriors can see a negative Total ATK because cross-style attack is summed into one number), **a gamed set bonus** (mismatched same-tier pieces wrongly trigger a "full set" crit), and **a claimed-but-unbuilt architecture win** (bosses.js is billed as the single source of truth that kills the name-split, but no surface reads it — the boss name is now hand-duplicated across four files, held in sync only by a comment).

**Net gap to studio-grade:** this is roughly **2–3 focused work-waves**, not a rewrite. Almost nothing here is architectural. The fixes are: make the new content speak the vocabulary the game already owns (art + CSS tokens), close two currency-loss paths, fix one combat sum, and actually wire the registry that was already written. The talent and the systems are present; the newest code simply didn't use them.

---

## 2. Top 5 Things Separating This From Studio-Grade (ranked)

1. **Emoji-as-art in the flagship endgame.** The marquee dungeon encounter is built from system emoji rendered as art — an 84px colour-emoji boss, emoji phase buttons, emoji puzzle options. This is the loudest "web prototype" tell in the medium, sitting on the exact screen a player earns by reaching the endgame. *(Art P0, Asset P0)*

2. **The armour triangle — the rework's headline feature — is the least-painted content in the game.** ~69 leather/cloth/plate pieces render flat emoji, and every caster/ranged helmet renders a *wrong* iron plate-helm silhouette (a substring-match bug), actively asserting the wrong art with confidence on a robe set. The feature's whole visual premise is broken at the doll. *(Asset P0 ×2, Art P1)*

3. **Two unrecoverable currency-loss paths in the new scrip economy.** At a full bag, earning scrip silently drops it and buying from the Quartermaster deducts scrip *before* granting the item with no rollback — spend 800 scrip, receive nothing. The economy loop the rework is built on eats the player's currency. *(Systems P1 ×2)*

4. **The new content abandons the design system the game spent five builds enforcing.** Retired moss-green (`#7f9a4f`) is back, off-palette one-off hexes and soft 8–9px web-card radii replace the forged near-square token language, and a dead token reference (`--font-display`) silently drops boss names out of Cinzel. The newest screens look assembled by a second team to a lower standard. *(Art P1 ×2, Art P2)*

5. **Correctness bugs that break the loadout decisions the rework introduced.** Character equipment sums cross-style attack into one Total ATK (plate warriors see *negative* totals), and the set bonus keys on tier alone so five mismatched-class pieces trigger a "full set" crit — trivially gaming the very set-vs-triangle tension the rework created. *(QA-Desktop P1, Systems P2)*

---

## 3. Per-Discipline Sections

### 3.1 Art Director

**Strengths.** `art-direction.css` (b217) is a real design system, not decoration — earned containment, a documented colour-role table (action/danger/success/premium/quiet), a four-treatment surface ladder, and a near-square 2/3/5px radius language that reads as forged. The tonal-range fix (section 24) widens bg-0..bg-3 so the screen reads as a lit place with a direction of light. Emoji was *systematically purged* from the original screens (topbar, skills, farm, character, bounty, market, inventory) — proof the team knows how to do this right. Type hierarchy is coherent (Cinzel titling, Alegreya Sans SC labels, tabular figures). The `--ui-scale` choke-point and tint-class material ladder show mature systems thinking.

| # | Sev | Issue | Evidence |
|---|-----|-------|----------|
| 1 | **P0** | Emoji-as-art in flagship endgame encounter — 84px emoji boss, emoji phase buttons (⚔️/⏳/🛡️), emoji puzzle options. FINAL DIRECTIVE violation on the content most meant to look shipped. | `dungeons.js:660,664,671,836,99,158`; `audit-overrides.css:1323,1377` |
| 2 | **P1** | Emoji-as-art leaking across every new reward surface — scrip bar 🎟️, set-bonus 🛡️, compare-tooltip 🏹/🔮, armour archetype glyphs baked into gear-tier data rows. | `dungeons.js:407`; `legacy.js:10355`; `item-ux.js:134-135`; `gear-tiers.js:113,117,124` |
| 3 | **P1** | New CSS reverts the b217 shape + colour system — soft 8–9px radii, a 4th off-palette green `#6fae7f`, and the **retired moss-green `#7f9a4f`** reappearing in puzzle states (HARD-RULE violation). | `audit-overrides.css:1191,1204,1216,1218,1481,1482` |
| 4 | **P2** | Label typography drift + dead token — `.dgn-boss-line b` uses `var(--font-display)` which **does not exist** (real token `--f-display`), so boss names silently drop out of Cinzel. | `audit-overrides.css:1197,1215`; `art-direction.css:58,191` |
| 5 | **P2** | Class-name collision — Quartermaster modal borrows `.qm-modal`, the *Quests* overlay's class; a future Quests restyle silently restyles the shop. | `dungeons.js:276`; `theme-cozy.css:4480,4546`; `legacy.css:3431` |
| 6 | **P3** | Combat-triangle downside invisible at the decision point — archetype tag shows only the upside, never the magic/ranged penalty that is the whole point of the triangle. | `item-ux.js:121-125`; `gear-tiers.js:98-124` |

### 3.2 Asset Director

**Strengths.** Gathering-tool tiers 1–5 and the 30-portrait field-monster roster are fully painted — the pre-rework discipline is real. Icon-path hygiene is clean: every mapped path resolves under the shipped bundle; the unshipped `BUNDLE_*` "shopping list" literals are deliberately *not* applied, so there is no 404 risk. The generated-gear matcher was already hardened (b224) against the keystone false-positive. Weapon families resolve via `SLOT_ART` with tier conveyed by rarity border — the "one silhouette, border = tier" direction works where art exists.

| # | Sev | Issue | Evidence |
|---|-----|-------|----------|
| 1 | **P0** | Combat-triangle armour has no art — ~69 leather/cloth/plate-legs/boots pieces render flat emoji on doll, inventory and craft tiles. `SLOT_ART` has no boots/pants/body key. **12 base silhouettes clears all ~69.** | `gear-tiers.js:112-131`; `legacy.js:14063-14072` |
| 2 | **P0** | Wrong silhouette on caster/ranged helmets — every leather/cloth helmet (14 pieces) matches the `helm` key via a `'_helm'` substring test, so a mage's hat and ranger's coif render an **iron plate helmet**. Worse than emoji: confidently wrong. | `legacy.js:14086-14089`; ids from `gear-tiers.js:120-129` |
| 3 | **P1** | 5 signature dungeon weapons (the bind-on-pickup endgame chase items, 150–800 scrip) all render emoji — no `.tier`, not hand-mapped. Highest art ROI per item in the game. | `items.js:518,522,526,529,541`; `dungeons.js:224` |
| 4 | **P1** | Boss of the Day + Weekly cards draw `m.icon` emoji instead of painted portraits **that already ship** (dragon, lich, death_knight have 128px art). Two most-viewed cards; zero art cost. | `boss-of-the-day.js:191,255`; `legacy.js:14146-14177` |
| 5 | **P1** | 9 artisan tools (hammer/needle/knife ×3 tiers) render emoji — a whole new lane with no art. 3 base silhouettes clears it. | `items.js:40-48` |
| 6 | **P1** | Quartermaster shop rows have **no icon element at all** — the new scrip storefront is a text spreadsheet. | `dungeons.js:262-265` |
| 7 | **P2** | 5 new economy items (scrip + 4 trophies/mats) emoji-only, including the high-frequency scrip token on the bar and every loot preview. | `items.js:538,519,523,530,542`; `dungeons.js:407` |
| 8 | **P2** | Dungeon reward-summary row draws `item.icon` emoji instead of `_itemPath`, so even rewards with painted art show emoji at the payoff moment. | `dungeons.js:598` |
| 9 | **P2** | Ember/Dawnsteel gathering tools (tiers 6–7) regress to emoji — grinding to the best tools is a downgrade from painted t5. Reuse t5 silhouette + rarity border, 0 new base art. | `items.js:213-218` |
| 10 | **P2** | 6 dungeon bosses have no portrait; `bosses.js` registry has no icon field. The endgame's named antagonists have no face. | `bosses.js:32-75`; `dungeons.js:33-193,453` |
| 11 | **P3** | Gold ring/amulet jewelry lane renders emoji, visually indistinct from the copper pieces it should progress past. | `items.js:77-78` |

### 3.3 Lead Game & Economy Designer

**Strengths.** *(Review supplied a scoped/test summary; single finding below.)*

| # | Sev | Issue | Evidence |
|---|-----|-------|----------|
| 1 | **P1** | Reward-scarcity exploit — a manual dungeon perfect-clear adds a **flat +0.20** to BoP drop chance, turning a 3% Dragonfang Pike into 23%. The signature-weapon chase collapses. Make the bonus multiplicative or cap it at +0.02 for sub-5% drops. | `dungeons.js:591` |

### 3.4 Senior QA — Desktop

**Strengths.** *(Review supplied a scoped summary; single finding below.)*

| # | Sev | Issue | Evidence |
|---|-----|-------|----------|
| 1 | **P1** | Character Equipment card sums cross-style attack into one Total — **plate warriors see a negative Total ATK** (their large ranged/magic penalties subtract from melee attack in the combined number). | Character Equipment card |

### 3.5 Senior QA — Mobile (landscape-only)

**Strengths.** The landscape chrome is genuinely well-engineered: bottom-nav rotates into a fixed left rail with per-theme tokens (the b114 fix, rail buttons min-height 46px). The Quartermaster caps at `max-height:80vh` with overflow scroll; the dungeon grid collapses to one column. The pet badge has an explicit 28px mobile rule with a data-pet no-op guard. The combat panel uses a dedicated mobile sub-tab bar that force-switches to Arena on fight start. A landscape smoke guard exists and uses `getBoundingClientRect` so it catches spill under clipping.

| # | Sev | Issue | Evidence |
|---|-----|-------|----------|
| 1 | **P1** | **Touch-target rule dead on the live theme** — the game-wide `.btn{min-height:44px}` mobile block (spec 0,1,0) is outranked by `body[data-theme] .btn{min-height:32px}` (spec 0,2,1) which loads last. Live theme always sets `data-theme`, so nearly every button — including Quartermaster Buy/scrip — renders 32px, ~27% below WCAG 2.5.5 / Apple HIG. This is the "cozy-light CSS dead on live theme" trap recurring. | `art-direction.css:238` vs `audit-overrides.css:2482`; `index.html:98/103`; `theme-picker.js:45` |
| 2 | **P1** | **Landscape smoke guard blind to all new UI** — it only walks `.panel.active *`, skips `position:fixed`, and only measures horizontal spill. The Quartermaster overlay, More sheet and every modal are invisible to it; vertical clip / off-bottom / tap-size never checked. The flagship economy screen ships with zero automated landscape coverage. | `run-smoke.mjs:207-213`; `dungeons.js:281` |
| 3 | **P2** | Quartermaster close is a fixed 30×30px control, not a `.btn` and not matched by the `.modal .btn-sm` rule (it lives in `.qm-overlay`). Below 44px. | `legacy.css:3447`; `dungeons.js:275-277` |
| 4 | **P2** | `.dgn-boss-line` is a flex row with **no flex-wrap** packing skull + label + boss name + weakness tag — squishes on narrow landscape cards where most dungeon browsing happens. | `audit-overrides.css:1209-1214`; `dungeons.js:453-454` |
| 5 | **P3** | Arena pet badge (`bottom:-6px`, 28px) may overlap the name/HP row in the single-column landscape combat layout on 360px screens. | `audit-overrides.css:634-642,2449-2455` |
| 6 | **P3** | Quartermaster header + scrip balance scroll out of view mid-purchase on short (≈288px) landscape — player loses sight of their balance while shopping 19 rows. | `audit-overrides.css:1202`; `dungeons.js:246-268` |

### 3.6 Principal Systems Engineer

**Strengths.** The b268–b281 *data* layer is the cleanest part of the codebase. The armour triangle is 100% data — negative range/magic atk fields fold into the existing per-style equipment summation, so the triangle needed no combat-engine change and cannot drift from the generator. `tools.js` is a clean, DOM-free, testable ESM helper. `getPlayerCombatRolls` centralizes ACC_DEF_MUL, the food-buff reader, crit and the set bonus into one function both the tick and the stats panel call, so displayed and applied numbers stay consistent. `save-migrations.js` is production-grade: contiguous chain to v12, pre-run backups, try/catch rollback, idempotency guards, correct bank re-grandfather for returning players. New systems have better-than-typical test coverage (armour-triangle, set-bonus 5-vs-4, boss-registry + scrip earn/spend).

| # | Sev | Issue | Evidence |
|---|-----|-------|----------|
| 1 | **P1** | **Scrip lost at bank cap (earn)** — `dungeon_scrip` lives in `G.inventory` and is counted by `bankUsed()`; at cap, `addItem` returns false and `awardDungeonScrip` silently drops the reward. Gold/gems avoid this by living on scalars. | `dungeons.js:203-211`; `legacy.js:2148-2152`; `items.js:538` |
| 2 | **P1** | **Scrip destroyed at bank cap (purchase)** — `buyFromQuartermaster` removes scrip *before* `addItem`; a full-bag buy of a new-stack item spends up to 800 scrip and returns nothing, no rollback. | `dungeons.js:229-243` |
| 3 | **P1** | **Boss registry is a 4th shape, not a migration** — `bosses.js` is billed as the single source of truth but no surface reads it (cards use `d.boss.name`, scavenger uses its own `bossName`, MONSTERS/raids untouched). Read only for a decorative weakness line. Name hand-duplicated across 4 files, synced by a comment. The demanded divergence guard was not added. | `bosses.js:32-75` vs `dungeons.js:453` vs `dungeon-scavenger.js:42` vs `main.js:79` |
| 4 | **P2** | **Set bonus ignores armourClass** — counts by material tier only, so five *mismatched-class* same-tier pieces trigger a "full set" crit. Trivially games the set-vs-triangle tension. | `legacy.js:1432-1439` |
| 5 | **P2** | `dungeons.js` still a self-described SKELETON/stub yet now carries the scrip economy, Quartermaster DOM, key hooks and the run mini-game (~950 lines, monkeypatching `showTab`/`killMonster`). Growing the entangled window-global surface. | `dungeons.js:1-18,322-365,929-949` |
| 6 | **P3** | Test gaps — the two currency-loss paths, the boss-name divergence guard, and a tool-tier double-yield/XP E2E are all outside the net. The defects most likely to ship are untested. | `smoke-test.js:2394-2425`; `tools.js:45-54` |

---

## 4. Cross-Cutting Themes (raised by ≥2 disciplines)

**A. Emoji-as-art is the defining flaw of the rework — 3 disciplines.** Art (P0/P1), Asset (P0×2, P1×4, P2×3) and Systems (via the data rows that store glyphs) all converge: the newest, most-marketed content renders OS emoji where the game elsewhere uses painted art. It spans the boss you fight, the armour you equip, the weapons you chase, the currency you earn, the shop you spend in, and the reward popup you celebrate with. This single theme is the largest driver of the "generated / unfinished" read and directly violates the FINAL DIRECTIVE. **It is the #1 studio-grade blocker and it is fixable without any architecture change.**

**B. The new content abandons the design system the game already owns — 2 disciplines.** Art flags reverted radii, off-palette hexes, the retired moss-green and a dead token; Mobile flags the touch-target rule silently outranked on the live theme. Both are the same failure mode: the b268–b281 CSS was written *against* the established token/cascade discipline rather than through it. The moss-green resurrection and the "cozy-light CSS dead on live theme" recurrence are both regressions the team had already solved once.

**C. New surfaces ship without test coverage that can see them — 2 disciplines.** Systems names the untested currency-loss and boss-drift paths; Mobile names the landscape guard that structurally cannot inspect the Quartermaster overlay or any modal. The flagship economy screen has effectively zero automated verification on either axis. The defects most likely to reach live are precisely the ones outside the net.

**D. Balance / economy integrity is fragile at the exact new loops — 2 disciplines.** Economy Design's flat +0.20 BoP bonus (3% → 23%) collapses the signature-weapon chase; Systems' set bonus keying on tier alone games the set incentive; and both currency-loss paths punish the player for engaging the loop. The new economy is generous where it should be scarce and lossy where it should be safe.

**E. The combat triangle is built in data but not honoured on screen — 2 disciplines.** Art notes the downside penalty is invisible at the decision point; QA-Desktop notes the Total-ATK sum makes plate warriors read negative; Systems notes the set bonus ignores class entirely. The triangle's depth exists in the model and is undermined by the presentation and the math layered on top of it.

---

## 5. Prioritized Action Plan

*Ordered so the highest-impact studio-grade wins land first. Effort: S ≤ half-day, M ≈ 1–2 days, L ≈ 3+ days.*

### P0 — Ship blockers (endgame must not look or behave like a prototype)

1. **[Systems, S]** Fix both scrip-loss paths: exempt `tag:'currency'` from the bank-cap check in `addItem` (or store scrip on a `G.scrip` scalar like gold/gems); this resolves both earn-at-cap and the purchase order-of-operations. Add a rollback guard on failed `addItem` in `buyFromQuartermaster` regardless. `dungeons.js:203-243`, `legacy.js:2148-2152`.
2. **[Asset, S]** Gate the `'_helm'` substring match to plate ids only (or prefer emoji over a wrong plate-helm) so caster/ranged helmets stop rendering an iron helm on a robe set. Immediate correctness fix ahead of the art. `legacy.js:14086-14089`.
3. **[QA-Desktop → Engineer, S]** Split Total ATK by style on the Character Equipment card so plate warriors stop seeing a negative total.
4. **[Asset, L]** Paint the 12 base armour silhouettes (heavy/leather/cloth × body/legs/boots/gloves), add boots/pants/body keys to `SLOT_ART`, tier via rarity border — clears ~69 emoji pieces. `gear-tiers.js:112-131`, `legacy.js:14063-14072`.
5. **[Asset, M]** Paint the 5 signature dungeon weapons (bespoke, not tier-reuse) and hand-map in `LOCAL_ITEM_ICON` — highest art ROI in the game. `items.js:518-541`.
6. **[Art → Engineer, M]** Replace all dungeon-encounter emoji (84px boss, phase buttons, puzzle options) with the painted-asset pipeline and styled `.drm-btn` controls with SVG/text labels. `dungeons.js:660,664,671,836,99,158`; `audit-overrides.css:1323,1377`.

### P1 — Must-fix before beta (integrity, cascade, and the visible art gaps)

7. **[Mobile, S]** Theme-prefix the 44px touch-target rule (or move it after `art-direction.css`) so it wins on the live theme; add a smoke assertion that a sampled `.btn` computes ≥44px at 820×360. `art-direction.css:238`, `audit-overrides.css:2482`.
8. **[Economy → Engineer, S]** Make the perfect-clear BoP bonus multiplicative or cap it at +0.02 for sub-5% drops so the signature chase survives. `dungeons.js:591`.
9. **[Systems, S]** Key the set bonus on tier **AND** armourClass (5+ same-class-same-tier); extend the set-bonus test to assert a mixed-class loadout does not trigger. `legacy.js:1432-1439`.
10. **[Asset, S]** Swap Boss of the Day + Weekly cards and the dungeon reward-summary row to painted portraits/`_itemPath` with emoji fallback — pure render fixes, zero new art. `boss-of-the-day.js:191,255`; `dungeons.js:598`.
11. **[Asset, S]** Add an icon cell to Quartermaster shop rows (`_itemPath` + emoji fallback). `dungeons.js:262-265`.
12. **[Asset, S]** Paint 3 artisan-tool silhouettes (hammer/needle/knife), hand-map all 9 ids. `items.js:40-48`.
13. **[Art, S]** Route every new radius through `--r`/`--r-sm`/`--r-lg` and every colour through role tokens; delete the one-off hexes and the resurrected moss-green `#7f9a4f`. `audit-overrides.css:1191,1204,1216,1218,1481,1482`.
14. **[Systems → Engineer, M]** Migrate surfaces to READ `bosses.js` (dungeon cards, scavenger, daily/weekly), delete the duplicated name from `DUNGEONS.boss`, and add a smoke test asserting `DUNGEONS[id].boss.name === BOSS_BY_DUNGEON[id].name`. `bosses.js:32-75`, `dungeons.js:453`, `dungeon-scavenger.js:42`.
15. **[Mobile → QA, M]** Extend the landscape guard to open the Quartermaster/More/settings overlays, drop the blanket fixed-skip for explicitly-opened modals, and assert card-fits-in-viewport-height + no interactive child clipped + sampled tap-target ≥44px. `run-smoke.mjs:207-213`.
16. **[Systems → QA, S]** Add regression tests for award-at-cap, purchase-at-cap, and a tool-tier double-yield/XP E2E. `smoke-test.js:2394-2425`.

### P2 — Polish that closes the "assembled by two teams" gap

17. **[Art, S]** Fix `--font-display` → `--f-display` (restores Cinzel on boss names) and use `--f-label` for Quartermaster group labels. `audit-overrides.css:1197,1215`.
18. **[Art, S]** Give the Quartermaster its own overlay/modal class instead of piggy-backing the Quests `.qm-modal` chrome. `dungeons.js:276`.
19. **[Asset, S]** Paint the scrip token + 4 trophy/mat icons; hand-map. `items.js:519-542`.
20. **[Asset, S]** Reuse the t5 axe/pick/rod silhouette with ember/dawn rarity border for tiers 6–7 — 0 new base art. `items.js:213-218`.
21. **[Asset, L]** Add an `icon`/`portrait` field to the `bosses.js` schema and paint 6 boss portraits; wire dungeon cards + boss phase + Final-boss line. `bosses.js:32-75`, `dungeons.js:453`.
22. **[Mobile, S]** `.qm-close{min-width:44px;min-height:44px}` in the mobile block; add `flex-wrap:wrap` to `.dgn-boss-line`. `legacy.css:3447`, `audit-overrides.css:1209-1214`.
23. **[Art → Engineer, S]** Surface the triangle downside (penalty line in `--role-danger`) on the archetype tag so both sides of the loadout decision are legible. `item-ux.js:121-125`.

### P3 — Backlog (maintainability + minor fit)

24. **[Systems, M]** Extract scrip + Quartermaster into `src/features/quartermaster.js` reading `DUNGEONS`/`BOSSES` as data; leave `dungeons.js` as the run engine and update the stale SKELETON header. `dungeons.js:1-18`.
25. **[Asset, S]** Paint gold ring + amulet (or tint copper pieces with a gold border). `items.js:77-78`.
26. **[Mobile, S]** Pin the Quartermaster header + scrip balance; scroll only `#quartermaster-body` (mirror the existing `.qm-body` pattern). `audit-overrides.css:1202`.
27. **[Mobile, S]** Verify the arena pet badge on a real 360px landscape device with a pet; tuck to `right:-4px/bottom:-2px` or 24px if it overlaps. `audit-overrides.css:634-642`.