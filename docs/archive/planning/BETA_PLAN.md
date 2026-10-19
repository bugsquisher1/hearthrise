# Hearthrise — plan to beta-ready (2026-10-15)

Sources: current-state memory, steam-launch-decisions, PRIORITY_BOARD, ARCHITECTURE_CONTRACTS (AC), prototypes/hunt-sim (HS), reviews/rulings-v2, demolition reviews.

## 1. Beta-ready means
A friend on the allowlist can sign up, play the Mill Cellar tutorial, clear the Sewer and kill the Rat King, and hunt Greenhaven H-001–H-003. They bank, eat and gear up in the new shell UI with style-1 art. **No known issue is open, and nothing half-built can be reached.**

- [ ] Every row in §4 is closed or verified.
- [ ] Deletion set applied; the plot-tier, bounty, hero-slot and bone_key exploits fail closed.
- [ ] Account door: password reset, existing-email sign-up copy, sign-out clears both session copies.
- [ ] Security R3 green; edge "closed" path live.
- [ ] Shell wired, old panel UI gone, no dead tab, button or for-sale item reachable.
- [ ] QA plays the whole start flow on prod with 0 console errors: Cellar → Sewer and Rat King → H-001–H-003.
- [ ] A fresh hero has 0 unplanned falls in the Cellar; Sewer profit is in the sim band (+10–30% over supplies).
- [ ] All player text passes copy lint: no "open beta" or "invite code", no filler names, no leaked names.

## 2. Scope
**IN:**
- Deletion set and M1 drops.
- Account door.
- Shell cutover, then the B1 hunt screen: action bar, end card, Analyzer, bestiary tracker.
- **Combat, XP and loot systems COMPLETE (Tyler 2026-10-15)**, not slices:
  - Combat: 2.0 s swing; wand basics cost mana; ammo per shot; 3 abilities per discipline; elemental weaknesses and resists; runes; Prayer regen; death with XP loss; combat training.
  - XP: Level from kills (+HP/+mana per level, curve XP(L)=20(L−1)³+50(L−1)); Melee, Ranged and Magic train by damage with the held weapon; Defense by blows received; no combat XP cap; party XP share.
  - Loot: standard (1–3 h), rare (10–20 h) and relic (100–150 h, serial number plus broadcast) bands; extra-rares around 150 h; gear instances, classes 1–3; party loot split; analyzer and drop log.
- Instanced hunts (C2, live). Stamina kept.
- Cellar tutorial, the Sewer and Rat King (attack animations only on him), Greenhaven H-001–H-003.
- Style-1 art: sewer map, v2 heroes, walk cycles, VFX.
- The current Common as the town.
- Basic outfit recolours.
- Account-shared bestiary stages.
- **Party hunting (Tyler 2026-10-15):** each player controls ONE hero; up to 4 players hunt one shared instance (AC 10), with the sim's formation rules as the auto-hunt AI (tank pulls and holds, ranged staggered).
- Passive opt-in gathering slice, if approved (D2).
- Screen-audit rows 1–11 and 15, on screens that stay visible.

**OUT (post-beta):**
- Gems and Crowns monetization; every gem item stays hidden.
- Imbuements and charms.
- Housing beyond the starter cottage; the high-end homes.
- Fancy outfits and addons.
- Chat and guilds (hidden).
- Quests, including the cellar breakthrough quest.
- Regions 2–10 and H-004–H-006 (beta only if the critical path holds).
- Audio.
- The map editor walls layer.
- Steam integration.
- Town v0.6 districts.
- Old unmerged lane branches: archived, not merged.

## 3. Phases (critical path: P0 → P2 → P3 → P5 → P6 → P8)
| Phase | Goal and steps | Depends on | Exit gate | Size |
|---|---|---|---|---|
| **P0 Deletion set** | D2 rebuild on C2 (N1–N3, hunt-catalogue regen, §4 drops check) → D1 final merge → Security delta → apply the 10-23 files, regen and merged edge → live-hash and census → M1 drops | — | Security GO; exploit probes fail closed | ~14 h |
| **P1 Account door** (parallel) | password reset screen; existing-email copy; sign-out clears both copies; sign-in copy (K34); R3 verify; guard-anchors; close stale branches | — | QA runs all door flows with 2 accounts on prod | ~8 h |
| **P2 Shell cutover** | wire lane/s-shell-framework (Bag, Gear, Skills, Homestead, Bestiary, Settings); delete the old panels and CSS; hide Market, Chat and gem items; fix nameplate clamping | P0 | no reachable dead window; GitHub green; Tyler plays | ~16 h |
| **P3 B1 hunt screen** | rebase lane/b1-hunt-screen inside the shell; restore combat on prod; render the hunt view per D1 | P2, D1 | QA hunts the Mill Cellar on prod and it settles | ~16 h |
| **P4 Combat + XP + loot systems** (parallel with P3) | full ruling U: abilities, mana, ammo, runes, resists, Prayer regen, death XP loss, training; Level/skill XP curves and training by damage/blows; loot bands (standard, rare, relic, extra-rare), gear instances (player_gear) classes 1–3, relic serial and broadcast; port the hunt-sim balance into catalogue rows; 1-tile footprints; START_KIT tune; ATTENDED and AWAY tests for each | C2 | Security GO on every money/XP surface; sim vs server within ±10% on the Sewer; XP and drop rates match the ruling bands in a 10 h synthetic run | ~45 h |
| **P5 Start-flow content** | import the Sewer map with the sizing rules; Cellar coach chain → breakthrough to the Sewer; Rat King attack animation; knight stance fix | P3, D6 | QA clears Cellar → Sewer → Rat King with no blocked tiles | ~18 h |
| **P6 Greenhaven + loot** | H-001–H-003 data and maps; drop tables for these grounds (systems from P4); bestiary stages; gathering slice (if D2); rename "Forgotten Rootcellar" | P4, P5, Tyler's creatures | a fresh hero plays from level 1 to about 20 | ~20 h |
| **P6b Party hunting** | party invite/accept/leave; shared hunt instance with one pull/respawn state per party (gather-review Security item 13); loot split (even by gold value by default); per-role auto-hunt AI from the sim's formation rules; party UI (members' HP/mana, leader) | P3, P4 | 4 QA accounts clear the Sewer together on prod; Security GO on loot split and shared caps | ~24 h |
| **P7 Screen + copy sweep** | screen-audit rows; copy lint on every string; outfit recolour base | P2, P6 | QUALITY_CHECKLIST passes on every reachable screen | ~12 h |
| **P8 Beta gate** | two full fresh-account playthroughs; re-verify every "verify" row; final Security review; Tyler allowlists friends | all | §1 checklist all ticked | ~8 h |

**Total about 180 agent-hours.** At the 3–4 lane token budget, that is roughly **12–14 working days** after the 10-17 usage reset, targeting **about 11-05**. That leaves November for the EA content.

## 4. Known-issues register
| ID | Issue | Sev | Phase |
|---|---|---|---|
| K1 | Free plot upgrades to tier 5 (hr_plot_tier lost its costs) | P1 | P0 |
| K2 | Login day 7 grants bone_key → unknown_item | P1 | P0 |
| K3 | Hero slots charge gems on the server, the client shows gold | P1 | P0 |
| K4 | Live bounty RPCs pay gold and XP from devtools | P1 | P0 |
| K5 | Deletion set would roll back C2's edge and names items live hunts use | P1 | P0 |
| K6 | No "Forgot password?" | P1 | P1 |
| K7 | Existing-email sign-up says "check your email" and sends nothing | P2 copy | P1 |
| K8 | Sign-out does not clear both session copies | P1 | P1 |
| K9 | "Your session moved" on QA: check it isn't a false trigger | P2 verify | P1 |
| K10 | world-town-home selftest is not in lane-done | P3 | P1 |
| K11 | Old combat is refused on prod; no combat UI until B1 | P1 | P3 |
| K12 | Nameplates and bubbles draw under docked windows | P2 | P2 |
| K13 | Fresh hero falls about 37/h in the Cellar (later 0 at 2.0 s) | P1 verify | P4 |
| K14 | Post-wipe character creation failed (fixed b587) | verify | P8 |
| K15 | "Wren" name leaked; two peers instead of three | P2 verify | P7 |
| K16 | Per-window value cap applied (C2 item 3) | verify | P8 |
| K17 | Hired hands keep banking during hunts | verify | P8 |
| K18 | C2 owes the live-hash drop grammar and census classification | P3 | P0 |
| K19 | Bag shows two filter rows | P1 cosmetic | P7 |
| K20 | Icons at non-integer scale | P1 cosmetic | P7 |
| K21 | House art upscaled and blurry; locked rooms shown as crops | P1 cosmetic | P7 |
| K22 | Phone: Bestiary fold empty; Dungeons tab clipped | P1 cosmetic | P7 |
| K23 | Eight primary buttons on Combat | P2 | P7 |
| K24 | Primer banner on every tab | P2 | P7 |
| K25 | Filler names (58 hits) incl. "Forgotten Rootcellar" | P2 copy | P6/P7 |
| K26 | Inter font import; 27 monospace uses | P2 | P7 |
| K27 | Bestiary art shown at 36 px, dimmed | P2 | P7 |
| K28 | Paper doll and icon language | P2 | P7 |
| K29 | Hunt board is equal card tiles | P2 | P3 |
| K30 | Farm plots are stripe gradients | P3 | P7 or hide farm |
| K31 | Skills shown as identical tiles | P3 | P7 |
| K32 | Radius, glow and gradient debt on touched screens | P3 | P7 |
| K33 | World polish: nameplates, decals, frames | P3 | P7 |
| K34 | Sign-in copy says "open beta", "invite code" | P2 copy | P1 |
| K35 | Hired-worker help text describes the old model | P3 copy | P7 |
| K36 | Gem cosmetics on sale but never rendered | P1 | P2 (hide) |
| K37 | Gem mint paths (hr_apply gem arm, start kit, Hearth Token) | P1 verify | P0 |
| K38 | Knight's legs stubby and spread; knight missing NE walk | P2 art | P5 (in flight) |
| K39 | Sewer: square walls, flat floor, needs life | P2 art | P5 (in flight) |
| K40 | Sprite size must not equal footprint | P2 | P4 |
| K41 | Hunt sim: NE room ~2× its clear target; profit swings with loot luck | P3 | P4 |
| K42 | design/world-shell prototype imports removed ART_ROWS | P3 | P2 |
| K43 | art-batch2 (8-facing Aldric) superseded | P3 | P1 (close) |
| K44 | Map editor uncommitted; saved maps need a maskHash rebuild | P3 | P5 |
| K45 | Two ELEMENTS lists; engine hooks for demolished systems | P2 | P4 |

## 5. Decisions for Tyler
| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| D1 | ~~Hunt view~~ DECIDED (Tyler 2026-10-15): one hero per player; party hunting with real players is IN for beta | — | — |
| D2 | Passive gathering slice (~11 h) in beta? | Yes, ground-only pull dial | P6 |
| D3 | Home and bestiary shared per account; extra-rares at 150 h | Already yes | — |
| D4 | Bestiary stages: relic boost only, or small permanent bonuses too? | Relic boost only for beta | P6 |
| D5 | Beta grounds: H-001–H-003, or all 6? | 3 now, 3 at EA | P6 |
| D6 | Sewer roster and your PixelLab creature delivery date | Ship the 5 sewer creatures + Rat King we have; your art by 10-22 | P5, P6 |
| D7 | Beta town: current Common, or the v0.6 districts? | Current Common | P5 |
| D8 | Farm, Market and Chat in beta? | Hide Market and Chat; keep farm only if K30 is fixed | P2, P7 |

## 6. Top risks
1. **Stale staged bundles.** Every prod apply invalidates bundles staged before it. Rebase and re-review after each apply; one lane C at a time.
2. **Usage limits.** At most 4 lanes; write a resume doc at about 85% usage.
3. **D1 left open.** P3 and P5 churn until it is decided.
4. **Art supply.** The creature roster depends on your time; existing sprites are the fallback.
5. **Sim/server balance drift.** Gate P4 on parity, or testers report first-hour falls again.
