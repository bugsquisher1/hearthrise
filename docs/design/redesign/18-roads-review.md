# The Roads: talent system review

Three independent reviews, none by the Roads' author: design and balance (`18-roads-review-design.md`), real-engine measurements (`18-roads-review-measured.md`), and UX for desktop and phone (`18-roads-review-ux.md`, mock `18-roads-ux-mock.html`). This is the summary. The detail and evidence are in those three files.

**Tags.** MEASURED = run on the real engine (Muster Barrows, Level 60, Steady, 8 seeds × 8 h, ± standard error). COMPUTED = arithmetic on the docs and data. CODE = read from the code. JUDGMENT = a design call, still to be tested.

**Verdict.** Keep the Roads. The map, the roads out of Havora, crossroads, vows and border towns are the right shape. But today the map is mostly decoration: about 76% of its points don't matter, the auto bar can't use a lot of what it promises, and border towns are badly mispriced. Each of those has a clear fix that keeps the depth.

---

## 1. Current state

| Piece | State |
|---|---|
| Roads, crossroads, vows, border towns, 635 nodes | **Paper only.** No talent code, table or RPC exists (CODE) |
| Move branches (16) | Docs. The base moves exist in `abilities.js` |
| Points per Level, resets by Level, saved builds | Docs (02 1b). Reset price uses the wage, which is built |
| Power step, gear in steps, Traits, wage | **Built** on the set (R9, G, W) |
| Auto bar | Built. It can't test target health %, Marks, Bleed stacks or the last move cast (CODE) |
| Block | Doesn't exist in the engine (CODE) |
| Fist line | Switched off in data (CODE) |
| Prayer | Not in the game or the redesign. The Inner Flame is the closest system |

## 2. Strengths to keep

- **The road map identity.** Havora at the center, countries, travel and commitment. It reads as ours, and it's the fantasy you want.
- **Crossroads and vows** are where the real decisions are. Both are good ideas.
- **Border towns as the hybrid route.** Measured: two heroes each borrowing a heal recover 72% of what a party loses without its healer, but still land 62.5 ± 10.2 steps below a real healer. A hybrid is a real build, not a trap, and the specialist still wins at its job (MEASURED).
- **Free drafts, the dummy and cheap first resets** make experimenting safe.
- **One size unit (steps) across Levels, gear, Traits and talents** is the right foundation.

## 3. Critical issues

1. **Most of the map is choice in appearance only** (COMPUTED). 480 of the 635 nodes are equal "+2%" milestones, the same kind of stat track we measured as unfeelable (about 2% between best and worst). That leaves about 30 real decisions by Level 200.
2. **The numbers break the ceiling** (COMPUTED). Written values are far off the step budget. Single Combat's +20% is about 52 steps against a vow budget of 3–4. Crossroads, vows and a Signature together reach about 37% over the suggested path, against the 5–10% ceiling.
3. **Border towns are mispriced** (MEASURED).
   - A borrowed Greater Mend on a hammer: +49.9 ± 4.2 steps at 0%, +39.1 at −30%, +33.2 at −40%, still +15.7 at −80%. That's about two gear tiers for one point, and the penalty barely moves it.
   - Borrowed Shelter: about +8 steps at every penalty level.
   - A flat penalty is wrong in both directions. One point returns 18–117× its cost.
4. **The auto bar switches off whole groups of nodes** (CODE).
   - The bar can't test target health %, Marks, Bleed stacks or the last move cast. That affects 11+ nodes.
   - Low-health effects can't fire under Steady and Careful, because the party falls back first.
   - Cooldown cuts do nothing on lanes that are already about 83% full.
   - Block nodes need a block mechanic the engine doesn't have.
   - A solo Shield hero's whole country does nothing.
5. **Saved builds per ground undo the balance** (docs). A vow that is +4 here and −3 elsewhere is simply +4 if you only wear it here.
6. **The ring caps hybrids and can't grow** (docs + CODE). It allows only 7 of 21 weapon pairs, leaves out Destruction with Restoration, and adding a country cuts a border. The fist generalist has no home.
7. **Vows come late** (COMPUTED). The second slot arrives around day 47, which is too late for the best part of the system. "Spend as suggested" also takes a vow with a downside without asking.
8. **The map is unreadable today** (seen). On desktop the labels draw at 6.4 px. Restoration is 2–3× denser than every other country. There's no "where am I", no route preview, and locked and owned nodes look alike.

## 4. Hidden dependencies

- **Every node that touches healing or defense** also moves death risk, supply cost, hunt length and held depth. Measured: the borrowed heal cost +173 to +459 gold a hero-hour in supplies, about 20,000 mana and 120 more drinks an hour, for +49.9 steps and the same gold.
- **The Risk stances decide which nodes are alive.** Low-health nodes only work on Bold.
- **Lanes:** a borrowed move sits in an idle lane, so its real cost is mana, not the penalty.
- **Spell training:** borrowed casts could train Magic fast.
- **Gold an hour doesn't follow held depth** in today's engine (MEASURED). That matters for the build preview and for pay by depth.
- **Signatures count inside the same ceiling** as talents.
- **Wave 3 is bigger than planned.** Traits, Signatures, branches and the Roads together need about 40 new engine pieces.

## 5. Recommended changes (ranked by player impact)

| # | Change | Cost | Basis | How we check it |
|---|---|---|---|---|
| 1 | **Price borrowing by value, not a flat −30%.** At full power: worth 4 steps or less, no penalty; 4–10, −30%; 10–20, −50%. Heals need their own rule: heal from the borrower's Magic, use Mend's cooldown, or share a clock with Mend | M | MEASURED (Fireball at −50% lands in band). The heal rule is JUDGMENT | Re-run the borrowed Greater Mend cell with each heal option. Target: under about 10 steps |
| 2 | **Cut milestones to about a quarter.** Roads become short travel. Ranks live on the moves' own roads. A real decision every 2–4 Levels | S | COMPUTED | Count decisions per 10 Levels in the Shield walk-through. Phone read |
| 3 | **Give vows a real budget,** about half a tier where they fit and −10 steps where they don't. Write every tooltip from steps | S | COMPUTED | Each vow on its best and worst ground, 8 seeds × 12 h |
| 4 | **Balance against the best saved build per ground,** not the mix. A vow's downside has to bite on the ground where it's worn | S | docs | Library test per ground with a two-build plan |
| 5 | **Fix the dead nodes before writing more.** Add the 4 missing bar metrics. Key low-health effects to "near the fall-back line". Drop cooldown cuts on full lanes. Hold the block nodes until block exists. Give solo Shield something | M (Systems) | CODE | The dummy analyzer shows how often each node fires |
| 6 | **Borders become a data list, not a ring.** Add Destruction·Restoration and Sword·Shield. A new country adds rows and never cuts one | S data, M art | CODE | A Level 40 wand-and-staff hybrid walk-through |
| 7 | **The Hearth becomes the fist generalist's home.** Borrows at a lower penalty and can hold 3 borrowed moves, with lower native power | M | JUDGMENT | A fist seat should be top 3 nowhere and bottom 3 nowhere |
| 8 | **Second vow at Level 50.** "Spend as suggested" never takes a vow on its own | S | COMPUTED | Days to each slot |
| 9 | **Make builds visible in the report:** healing by source, damage taken by seat, supply bill per depth | M | JUDGMENT | A blind read of two reports |
| 10 | **Free re-spend when content arrives,** and a new choice every 50 Levels past 200 | S | JUDGMENT | Walk-through at Level 600 |

Smaller merges: one "faster" option per weapon instead of three near-copies, and Wide Circle folded into a waystone.

## 6. Balance validation plan

All on the real engine through `tools/balance-program/redesign/v1-climb.mjs`, held start, Steady unless noted. Report held depth, deaths, XP/hr, gold/hr and supply bill, never a single score.

1. Borrowing: every borrowable move at 0% for its value, then the value-based rule. Each borrow should land at or under its band.
2. Heals: borrowed Greater Mend with each heal option until it's under about 10 steps.
3. Vows: each on its best and worst ground, 8 seeds × 12 h.
4. The best saved build per ground vs the suggested path: the gap must stay within 5–10%.
5. Library test: 10 named builds across 3+ ground mixes. Each must be top 3 somewhere and top in no more than 25% of cells.
6. Bold runs for the low-health nodes, since Steady never reaches them. Steady had 0 deaths in 256 seed runs.
7. The fist generalist on 3 ground mixes.

Measured cost: one 8-seed cell takes about 5–9 CPU-minutes on this PC.

## 7. UX plan (keeps the roads concept)

1. **Three zoom levels with fixed-size labels:** Country, Road and Node. Labels stay readable (14.5 px or larger in the mock).
2. **Open where you are:** the frontier at Road view, plus Recenter and a minimap.
3. **Route preview:** tap a far node to draw its path with a cost badge. The card shows points, the Level you'd reach it, what's on the way, and what it needs and unlocks.
4. **One look per node type,** with four states: locked, can buy, on route, owned. Only owned roads are gold. Vows become steel standing stones.
5. **Road weight:** thick trunks out of Havora, then move roads, then dotted side paths, with gate marks at borders.
6. **Restoration gets about 2.5× the space.**
7. **Phone:** a full-screen map with a 300 px slide-out sheet, pinch to snap between zoom levels, tap for the route, and a country list in Country view. The design review also suggests a road card for phones as the default (the next fork, its cost, the options), with the map as the planning view.
8. **Build preview lives inside Talents,** as a footer showing the draft's changes. "Test on dummy" opens the existing hunt analyzer.
   - Per-click engine runs don't fit (MEASURED: 29–65 s per 8 h seed).
   - A nightly cached table does: about 2,040 entries (ground × Level band × build type), 9–15 h on this PC, no spend.
   - Reliable metrics are held depth, healing, mana, supplies, kills/hr and XP/hr.
   - Gold/hr needs 8 h hunts.
   - Death risk can't be shown at Steady because it never happens. Show it as a Bold-only line.
   - Every preview number is labeled an estimate.

## 8. Decisions for you

1. **Cut milestones to about a quarter?** The map stays, you still get a point every Level, and there's a real choice every 2–4 Levels instead of every 15. It changes the look you approved.
2. **Let vows be big (about half a tier)?** More variety, more risk of a best build. The alternative is vows around +1.5%, which nobody will feel.
3. **Borders as a list instead of a ring, with the Hearth as the fist generalist's home?**

Everything else above is a design or engineering call we'll make.

## 9. Roadmap

1. **Engine first.** The 4 bar metrics and a decision on block. A ruling on which blow a borrowed cast uses. These decide which nodes are alive.
2. **Pricing.** Value-based borrowing and the heal rule, measured.
3. **Data model.** Nodes as data rows in steps, borders as data, presets with a gap cap.
4. **Sample.** Shield, Restoration and their border with your 3 decisions applied: 5 Lab allocations plus a two-build plan, played on a phone with "Spend as suggested" on and off.
5. **UX.** Zoom levels, route preview, node states, phone sheet. The art lane redraws Restoration.
6. **Build preview.** The nightly benchmark table and the Talents footer.
7. **Expand.** The remaining countries in batches, each through the library test before it ships.

**Gates:** nothing goes into game data before step 1. No country ships without passing the library test. Every release runs the library test with its new rows.
