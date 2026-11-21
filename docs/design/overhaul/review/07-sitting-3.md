# The third sitting: two questions for Tyler

Written 2026-11-21 on `lane/d-plan-rest`, with chapter 14 (`../14-the-rest.md`). Docs only.

Each question is a design call in the rest of the overhaul that would reverse a ruling of yours, so it is yours to veto. Both were on the reversal list and let stand on the page in about a second. The first build keeps your rulings, so nothing here changes it. No option is recommended. Each says what it costs. Labels: MEASURED is a run on the real engine with its GitHub run id, COMPUTED is arithmetic on named inputs, JUDGMENT is an opinion, UNKNOWN means nobody knows. The same text is in `07-sitting-3.json` for the Rulings page.

## S-19. Prices for gear upgrades: a share of band gold, or typed

On 2026-11-18 you kept typed Hallmark prices on purpose (150,000, 250,000, 400,000 and 600,000 for tiers 4 to 7), and said upgrades should cost more than a hero can afford in a band so players choose what matters. The book's GR-8 prices Tempering, Hallmarks and linings as a share of a band's gold, so a band's upgrades total 1.2 to 1.4 of what the band earns. You let it stand on the page in about a second (reversal row 6). The first build keeps your typed prices. The rest of the overhaul must pick one. Which?

- **A. A share of band gold.** Every standing upgrade costs a share of the band's simulated gold, so the 1.2 to 1.4 holds at every Level and no price goes stale as Levels climb. MEASURED on run 44920906999, before the engine fix: full best gear costs about 0.18 of a band's net gold for a lone hero, far under the size you asked for. Cost: your four typed Hallmark numbers are replaced by shares, and every price is as true as the calibration of the simulator's gold (chapter 14, section 2). The screen can still say a price in gold and in hours of hunting.
- **B. Typed, re-sized.** Prices stay typed numbers, written by the designer for each tier so a band's upgrades total 1.2 to 1.4 of its simulated gold, and re-typed when each region is written. Cost: your four Hallmark numbers still change, because they sit under the size you asked for. A typed table grows with every band and goes stale if the gold a band earns moves, which the formula brief asks to avoid. JUDGMENT.
- **C. Your numbers as typed.** Your four Hallmark numbers stand exactly, and later tiers get typed numbers in the same spirit. Cost: COMPUTED from the measurement in a, a band's upgrades cost a small part of what it earns, so the choice between upgrades that you asked for on 2026-11-18 does not bite until prices rise. With upgrades this cheap every player fills them, so the sinks you meant on 2026-11-18 as the place where bought gold becomes an edge hold little.

## S-20. The yard's rate

Three times (2026-11-14, and twice on 2026-11-20) you kept a flat yard rate, with the screen saying what an hour buys. The book's GR-54 makes the yard's XP an hour follow the skill curve, capped at half of what hunting pays that skill, with the fee following the rate. You let it stand on the page in about a second (reversal row 11). The first build keeps the flat rate and the fee you ruled, 100 gold times the skill level an hour. Which is the yard?

- **A. Follows the skill curve.** The yard pays a share of each skill level's cost and never more than half of what hunting pays that skill. Its size is set in the simulator against the town-hour model. Cost: it reverses your three rulings. JUDGMENT from the book: skill levels cost more as they climb, so any flat rate is too strong early and worth almost nothing late.
- **B. Flat, as ruled.** The yard pays a flat XP an hour and the screen says what an hour buys, as you ruled. The fee stays 100 gold times the skill level an hour. Cost: JUDGMENT from the book: early the flat hour can be worth more than hunting gives that skill, and late it is worth little, so the yard matters in a middle stretch. UNKNOWN where that stretch sits until the town-hour model runs.
- **C. Flat, set per band.** A flat rate that the designer types once for each skill band from the simulator, so the screen still names a plain number and the rate keeps some worth at every band. Cost: a typed table that grows with every band, which the formula brief asks to avoid. JUDGMENT.

## Where each question comes from

| Question | Source |
|---|---|
| S-19 | GR-8, reversal row 6 of `../00-the-game.md` section 5.3, the critical review section 1.4, and the ruling of 2026-11-18. Lane FR-3 of chapter 14 waits on it |
| S-20 | GR-54, reversal row 11, the critical review section 1.4, and the rulings of 2026-11-14 and 2026-11-20. Lane FR-3 waits on it |
