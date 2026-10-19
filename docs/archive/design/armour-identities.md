# ARMOUR IDENTITIES — the rescale, in numbers

## ✅ RULED 2026-08-15 — Game Designer, under decision authority delegated by Tyler. ACCEPTED AS WRITTEN.

**Status: RULED. The numbers below are FINAL and implementable.** The five open questions in
§12 are closed here; do not re-open them without a new measurement.

| §12 question | RULING |
|---|---|
| 1 · heavy rate 7.5%/pair | **ACCEPTED** (already accepted by Tyler as *Deflect*). No change. |
| 2 · medium: one number or two | **TWO.** `critB +0.025` **and** `critMult +0.05` per pair. **S-4 ships.** Crit chance is capped at 0.60 and a capped currency is the same lie as a literal "+def%"; `critMult` is uncapped, so leather's reward can never saturate. Measured: one number leaves leather at 0.89× cloth (dominated); two puts it at 0.93–0.97×. "You crit more often and your crits hit harder" is still one sentence. |
| 3 · the magic cut (−27…−38%) | **ACCEPTED, UNCHANGED.** See the rationale below. |
| 4 · `plaguewarden_greaves` | **PLATE.** `defB 26` at tier 5 sits between plate (35) and leather (19) and reads heavy; the `strB 4` is unique flavour, not a class signal; and classing it leather would hand it a crit pair it carries no crit for. §11.1's other twelve recommendations are accepted as written (`nightstalker_pelt` → leather, `wraithsilk_shroud` → cloth, the rest plate). |
| 5 · the 0.10 monster-accuracy floor | **LEAVE IT. Closed for round 2.** Plate is "the cheap night", not "the tough night". §8.3 already proved the correct shape: armour buys minutes, food buys nights. Touching `monsterMinAccuracy` re-prices every S1 one-shot-safety sweep and every food projection in `supply-projection.md`, which is a global rebalance and cannot ride an armour data change. Revisit only alongside the consumable-economy program, never before cutover. |

### Why the magic cut is accepted unchanged

The 38% is **not a nerf to magic; it is the removal of a subsidy that belonged to armour.**
Verified independently against the shipped engine, armour-only (no jewelry propping accuracy
up), level 99 vs a tier-6 foe: magic-in-cloth measures **18.47 DPS against 0.69–5.35 for every
other family/armour pairing** — magic is not 1.87× ahead, it is **3.5× ahead of the next best
build in the game**, and every other family's magic accuracy sits pinned at the 0.15 floor.
That is not a tradeoff a player can price; it is one stat line (`magicStrB = 0.4 × plateDef`,
+113 at tier 7) doing the work of an entire archetype. Under the accepted ruling that cloth
pays damage to **every** weapon, that stat cannot keep being magic-exclusive, and the number
that was borrowed comes back. Three further reasons the coefficient does not move:

1. **A mage loses nothing they own.** A staff user in full cloth still receives 100% of
   cloth's damage — they simply stop receiving it *exclusively*. The archetype is intact; the
   monopoly is not.
2. **`0.08` is load-bearing for an ALREADY-ACCEPTED ruling.** The 7.5%/pair Deflect rate was
   solved backwards from the XP-per-food parity table in §4.3, which is computed against
   cloth at `0.08`. Raising cloth to soften the magic cut silently re-opens Tyler's accepted
   heavy rate. One number cannot be tuned without re-deriving the other.
3. **Magic lands mid-pack, not bottom.** Post-change at 99: bow 22.49 · hammer 19.06 ·
   **staff 18.71** · sword 18.45. Magic is the third of four inside a 1.22× spread, and the
   family above it (bow) has an unpaid ammo cost still to come. No compensating identity is
   owed to an archetype that finishes at parity.

**Conditions on the implementation (all three are gates, not preferences):**

- **Re-measure before landing.** §10 conflict 1 stands: `gear-tiers.js`/`recipes.js` were in
  flight when these tables were produced, and the greedy best-in-slot search reads the whole
  catalogue. **ARM-5 at ≤ 1.30× spread on levels 70/85/99 is the acceptance criterion** — if
  the re-measure breaks it, the *weapon* curves move, not these five coefficients.
- **Ship the full §9 test contract**, ARM-7 and ARM-8 included. They are the two that would be
  dropped and the two that matter.
- **No floor on the tier-1/2 cloth damage coefficient.** §3.3's known limitation is accepted
  as stated: a zero is better than a +40%-max-hit tier-1 robe.

**Also ruled, so it is not re-argued when it surfaces (§11.1):** the tier-8 leather and cloth
capstone gap is **REAL and is the intended home for the ~25 tier-3–6 combat drops that
currently have no recipe.** Separate pass, post-cutover, not a blocker. The Hunt-forged plate
five-piece correctly becomes 2 plate pairs (−15% hit chance) and loses its crit; that
re-flavouring is intended.

---

**Original status line, kept for the record: PROPOSAL.** Every number below was a
recommendation. Tyler vetoes numbers; the **direction** is ruled and is not re-litigated here.
**Scope: design + measurement only. No `src/**` was touched writing this.** The tables are
implementation-ready; landing them is a separate data change.

**Method:** every figure was produced by executing the real engine (`src/core/combat.js`,
`src/core/combat-sim.js`, `src/core/auto-eat.js`, `src/core/styles.js`) in Node against the
real catalogue. Nothing is estimated, and nothing is quoted from a source comment. The
harness reproduces the b343 baseline exactly as a control — see the Appendix.

---

## 0 · What is ruled, and what this document decides

**Ruled by Tyler, 2026-08-15 — not open:**

1. *"All armor should be based on defense. as later on based on enemy type people may want
   to mix and match armor types."* → requirements stay **DEFENCE-ONLY**. Closed.
2. *"if someone wants crit instead of armor they can still use cloth with melee .. cloth
   should give the character dps regardless of the weapon type"*, corrected to
   *"or crit instead of armor — **leather***".
   → **plate = survival · leather = crit · cloth = raw damage · all three WEAPON-AGNOSTIC.**
3. *"Heavy armor should give +def%, medium +crit% light +damage% — each 2 pieces gives 2.5%
   boost"* … *"or something like that"*.
   → the identity is (partly) a **per-2-piece set bonus**. The shape is ruled; the **2.5%
   is a suggestion with explicit latitude**, and §4.3 is where I spend that latitude and
   defend it.

**Also closed and untouched here:** the `+52%` / `0.20`-per-key permanent power fuse
(`docs/design/bonus-rebase.md`), and `spdB` (b343 ruling — closed set of ten named uniques).
**Not one item in this proposal carries `spdB`.**

**What this document decides:** the exact coefficients, the set-bonus rates, what happens to
the dead accuracy points, what replaces `armorSetBonus`, and the price of the triangle in
food and hours.

---

## 1 · The measured baseline, and the three defects under it

BiS at level 99 vs the Green Dragon, shipped data, shipped set bonus, best-in-slot chosen
greedily by marginal DPS across the whole 426-item catalogue:

| family \ armour | plate | leather | cloth |
|---|---|---|---|
| sword | 14.90 | **16.05** | 8.71 |
| hammer | 15.92 | **17.15** | 7.24 |
| bow | 6.51 | **19.55** | 9.38 |
| staff | 2.40 | 11.01 | **29.96** |

**Best-of-family spread: 1.87×.**

### 1.1 · Cloth is the only archetype carrying damage, and it pays exactly one weapon
`magicStrB = round(plateDef × 0.4)` on all six pieces — **+113** at tier 7, magic-only. That
single line is the whole 1.87×. The b343 recommendation was to *cut* it; **ruling 2 makes
that wrong**. The defect was never that cloth carries damage — it is that cloth's damage pays
one weapon class out of four.

### 1.2 · Plate's accuracy penalties are a cliff, not a tradeoff — and they veto ruling 1
Plate carries `rangeAtkB = −round(def × 0.25)` and `magicAtkB = −round(def × 0.5)`. Measured
by forcing **all four families into the same armour**, so armour is the only variable:

| level | 10 | 20 | 30 | 40 | 55 | 70 | 85 | 99 |
|---|---|---|---|---|---|---|---|---|
| **all four families in shipped PLATE** | 2.50× | 2.03× | 2.05× | 1.99× | 2.28× | **4.16×** | **7.37×** | **6.64×** |
| all four families in the proposed plate | 2.17× | 1.69× | 1.52× | 1.62× | 1.40× | 1.22× | 1.20× | 1.22× |

A **6.64× spread inside one armour set** is not a tradeoff a player can price. It means a
mage who picks up plate for a magic-resistant foe loses 92% of their damage — so ruling 1's
"mix and match by enemy type" is not merely discouraged today, it is *unavailable*.

### 1.3 · Leather and cloth carry ~186 / ~215 points of accuracy against a ceiling of 133
Confirmed. See §5 — but the b343 conclusion needs one correction: those points are dead at
**level 99**, not everywhere. At level 85 against a tier-6 foe, removing them costs a bow
0.95 → **0.88** accuracy. That correction is what §5's low-tier retention is built on.

### 1.4 · TWO LIVE DATA DEFECTS, found by measurement (P2, both fixed by the rescale)

**(a) Four plate rows are not plate and have no requirement at all.** `iron_helm`,
`steel_helm`, `iron_platebody`, `steel_platebody` are hand-authored in `items.js`, and
hand-authored entries deliberately WIN over the generated row. Executed:

```
iron_helm         armourClass=undefined  reqSkill=undefined  reqLv=undefined  defB=5
steel_helm        armourClass=undefined  reqSkill=undefined  reqLv=undefined  defB=10
iron_platebody    armourClass=undefined  reqSkill=undefined  reqLv=undefined  defB=12
steel_platebody   armourClass=undefined  reqSkill=undefined  reqLv=undefined  defB=22
```

A **level-1 character can equip Steel Helm + Steel Platebody for 32 defence** while the other
four pieces of that set are gated at Defence 30. That is the b246 defence gate with a hole in
it. `armorSetBonus` defaults a missing class to `'plate'`, so the set bonus is accidentally
correct — but the item flyout shows no archetype, and under a per-class system an accidental
default is a liability. **The regeneration fixes all four by construction.**

**(b) Defence is a fully saturated stat from about level 55 upward.** This is the deepest
finding in the pass and it governs every number in §4.

`monsterCombatRolls` clamps the monster's accuracy at `monsterMinAccuracy = 0.10`, reached at
`playerDefence ≥ monster.atk + 66.7`. Measured, BiS per archetype:

| | playerDefence | monsters pinned at the 0.10 floor |
|---|---|---|
| lv40 plate | 100 | 17 / 31 |
| lv40 cloth | 78 | 9 / 31 |
| lv70 plate | 245 | **31 / 31** |
| lv70 cloth | 139 | 27 / 31 |
| lv99 plate | 400 | **31 / 31** |
| lv99 leather | 275 | **31 / 31** |
| lv99 cloth | 209 | **31 / 31** |

**At level 70+ a full cloth kit and a full plate kit take identical incoming damage against
every monster in the game.** Measured directly at 99 vs the dragon: incoming DPS
plate 0.962 / leather 0.957 / cloth 0.960.

**Therefore a literal "+def%" — more defence points — is a null item at endgame**, and
Tyler's heavy bonus would be b343's spdB failure in a new costume: *a binding clamp turns a
reward into a lie.* §4.2 is the answer.

---

## 2 · The design, in one paragraph

**Each archetype has ONE currency, delivered in TWO forms: a flat per-piece stat that scales
with the material tier, and a per-2-piece percentage that scales with commitment.** The flat
stat is the balance lever (it is *additive*, so it compresses the gap between weapon
families); the percentage is the identity lever (it is *multiplicative*, so it preserves
ratios and creates the 2/4/6 decision). Requirements stay defence-only, so any build can wear
any line. Nothing carries an accuracy penalty, so mixing is a tradeoff and never a cliff.

| | per-piece (flat) | per-2-pieces (%) | what it costs you |
|---|---|---|---|
| **plate** — heavy | full defence | they hit you less often | no damage, no crit |
| **leather** — medium | crit chance | more crit, and harder crits | 55% of the defence |
| **cloth** — light | damage, to **every** weapon | more damage | 30% of the defence |

---

## 3 · PROPOSAL — the per-slot, per-tier stat tables

Generated exactly the way `gear-tiers.js` generates today: coefficients off the **plate
defence curve** `ARMOUR_SLOTS[slot].def[tier−1]` (`plateDef` below), not 126 hand-typed
numbers. The plate curve itself is **unchanged**.

```js
const ARMOUR_LINES = [
  { key: 'plate',   defMul: 1.00, fields: () => ({}) },

  { key: 'leather', defMul: 0.55, fields: (plateDef, i) => ({
      critB: round3(plateDef * 0.0008),
      ...(i < 3 ? { rangeAtkB: Math.round(plateDef * 0.20),
                    magicAtkB: Math.round(plateDef * 0.20) } : {}),
    }) },

  { key: 'cloth',   defMul: 0.30, fields: (plateDef, i) => {
      const d = Math.round(plateDef * 0.08);
      return {
        ...(d ? { strB: d, rangeStrB: d, magicStrB: d } : {}),
        ...(i < 3 ? { rangeAtkB: Math.round(plateDef * 0.20),
                      magicAtkB: Math.round(plateDef * 0.20) } : {}),
      };
    } },
];
```

**Five coefficients in total.** `defMul` 1.00 / 0.55 / 0.30 is **unchanged from shipped**.
`round3` = `Math.round(x * 1000) / 1000`.

### 3.1 · PLATE — defence only (identical to today, minus the penalties)

| slot | T1 | T2 | T3 | T4 | T5 | T6 | T7 |
|---|---|---|---|---|---|---|---|
| helmet | 3 | 5 | 10 | 16 | 24 | 33 | 44 |
| body | 6 | 12 | 22 | 34 | 50 | 68 | 90 |
| pants | 4 | 8 | 15 | 24 | 35 | 48 | 64 |
| boots | 2 | 4 | 7 | 11 | 16 | 22 | 30 |
| gloves | 1 | 3 | 5 | 8 | 12 | 17 | 23 |
| belt | 2 | 4 | 7 | 11 | 16 | 22 | 30 |
| **6-pc defB** | **18** | **36** | **66** | **104** | **153** | **210** | **281** |

`rangeAtkB` and `magicAtkB` (the −0.25 / −0.50 penalties) are **DELETED**. Every existing
plate id keeps its exact `defB`, `v`, name and tier — old saves stay valid.

### 3.2 · LEATHER — `defB` = round(plateDef × 0.55) · `critB` = round3(plateDef × 0.0008)

| slot | T1 | T2 | T3 | T4 | T5 | T6 | T7 |
|---|---|---|---|---|---|---|---|
| helmet | 2 / 0.002 | 3 / 0.004 | 6 / 0.008 | 9 / 0.013 | 13 / 0.019 | 18 / 0.026 | 24 / 0.035 |
| body | 3 / 0.005 | 7 / 0.010 | 12 / 0.018 | 19 / 0.027 | 28 / 0.040 | 37 / 0.054 | 50 / 0.072 |
| pants | 2 / 0.003 | 4 / 0.006 | 8 / 0.012 | 13 / 0.019 | 19 / 0.028 | 26 / 0.038 | 35 / 0.051 |
| boots | 1 / 0.002 | 2 / 0.003 | 4 / 0.006 | 6 / 0.009 | 9 / 0.013 | 12 / 0.018 | 17 / 0.024 |
| gloves | 1 / 0.001 | 2 / 0.002 | 3 / 0.004 | 4 / 0.006 | 7 / 0.010 | 9 / 0.014 | 13 / 0.018 |
| belt | 1 / 0.002 | 2 / 0.003 | 4 / 0.006 | 6 / 0.009 | 9 / 0.013 | 12 / 0.018 | 17 / 0.024 |
| **6-pc defB / critB** | **10 / 0.015** | **20 / 0.028** | **37 / 0.054** | **57 / 0.083** | **85 / 0.123** | **114 / 0.168** | **156 / 0.224** |

Plus `rangeAtkB = magicAtkB = round(plateDef × 0.20)` on **tiers 1–3 only** (§5):
3 / 8 / 12 points across six pieces, then nothing.

The 6-piece total of **0.224** is not a taste number — it is the crit budget solved backwards
from the engine cap. See §6.

### 3.3 · CLOTH — `defB` = round(plateDef × 0.30) · damage = round(plateDef × 0.08), paid to **all three** styles

Every cloth piece carries `strB`, `rangeStrB` **and** `magicStrB` at the same value, so
`playerCombatRolls` — which sums `profile.strengthBonusField` — pays exactly one of them
whatever the player is holding. That is the literal implementation of *"cloth should give the
character dps regardless of the weapon type."* Precedent already in the catalogue:
`dragon_gem_earrings` carries `strB: 4, rangeStrB: 4, magicStrB: 4`.

| slot | T1 | T2 | T3 | T4 | T5 | T6 | T7 |
|---|---|---|---|---|---|---|---|
| helmet | 1 / — | 2 / — | 3 / 1 | 5 / 1 | 7 / 2 | 10 / 3 | 13 / 4 |
| body | 2 / — | 4 / 1 | 7 / 2 | 10 / 3 | 15 / 4 | 20 / 5 | 27 / 7 |
| pants | 1 / — | 2 / 1 | 5 / 1 | 7 / 2 | 11 / 3 | 14 / 4 | 19 / 5 |
| boots | 1 / — | 1 / — | 2 / 1 | 3 / 1 | 5 / 1 | 7 / 2 | 9 / 2 |
| gloves | 1 / — | 1 / — | 2 / — | 2 / 1 | 4 / 1 | 5 / 1 | 7 / 2 |
| belt | 1 / — | 1 / — | 2 / 1 | 3 / 1 | 5 / 1 | 7 / 2 | 9 / 2 |
| **6-pc defB / dmg** | **7 / 0** | **11 / 2** | **21 / 6** | **30 / 9** | **47 / 12** | **63 / 17** | **84 / 22** |

Plus the same tiers-1–3 accuracy term as leather.

> **Known limitation, stated rather than hidden:** the coefficient rounds to **zero at tier 1**
> and near-zero at tier 2. At those tiers cloth's identity is carried entirely by the set
> bonus (which is proportional and always live). A floor of 1 would give a tier-1 robe set +6
> damage — measured as roughly **+40% max hit on a level-5 character** — so a floor is worse
> than a zero. If Tyler wants a visible number on an early robe, the cheap answer is a floor
> of 1 on the **body slot only** (+0.6 max hit, harmless); I did not include it because it
> makes the curve stop being a curve.

### 3.4 · A note on why the flat cloth number is small
It is additive into `maxHit = floor(dmgLvl×0.35 + strBonus×0.6 + 2)`, so the **same** number
is a larger relative gain for the family with the weaker weapon. That is why it is the
balance lever: it *compresses* family gaps rather than amplifying them, which is exactly the
1.87× problem. The percentage set bonus preserves ratios and therefore cannot do that job.

---

## 4 · PROPOSAL — the per-2-piece set bonus

### 4.1 · The shape

Counted over the **six armour slots only** (helmet · body · pants · boots · gloves · belt).
Cape and jewelry are excluded, which preserves b343's deliberate decision to keep capes out
of the set system. Pairs are `floor(count / 2)` **per armour class**, so a mixed build gets
several bonuses at once and an odd piece contributes nothing to its own bonus (5 pieces = 2
pairs, same as 4). **Tier is NOT part of the key** — see §4.4.

```js
// PROPOSAL — replaces armorSetBonus()
export function armourSetBonus(equipment, items) {
  const n = {};                       // count per armourClass over ARMOUR_SLOT_KEYS
  ...
  const pairs = (k) => Math.floor((n[k] || 0) / 2);
  return {
    defPct:   pairs('plate')   * 0.075,   // monster accuracy x (1 - defPct), post-clamp
    critB:    pairs('leather') * 0.025,   // crit chance, points
    critMult: pairs('leather') * 0.05,    // ADDED to COMBAT_BALANCE.critMult (1.50)
    dmgPct:   pairs('cloth')   * 0.025,   // maxHit x (1 + dmgPct)
    pairs,
  };
}
```

### 4.2 · Heavy — "+def%" delivered as **a post-clamp multiplier on the monster's accuracy**

This is the one place I depart from the literal wording, and §1.4(b) is the reason: more
defence *points* buy nothing above level 55, so a literal "+7.5% defence" would be a stat
line that does nothing on the content players actually fight.

```js
// monsterCombatRolls, ONE line, AFTER the existing [0.10, 0.85] clamp
return { accuracy: raw * (1 - set.defPct), maxHit };
```

Three properties, each of which is why this and not damage reduction:

1. **It can never saturate.** It multiplies whatever accuracy survived the clamp:
   `0.10 → 0.0925 → 0.0850 → 0.0775` at 2 / 4 / 6 pieces. Verified by execution.
2. **`maxHit` is untouched**, so the shipped **S1 one-shot-safety inequality**
   (`floor(threshold × maxHp) ≥ maxHit`, `docs/design/supply-projection.md` §7.2, swept
   108/108) is **unchanged**. Verified: monster `maxHit` is identical across all three
   archetypes and all four `defPct` values (7 / 26 / 47 vs goblin_brute / death_knight /
   dragon — exactly `max(1, floor(atk × 0.45))`).
3. **It reads to a player exactly as armour should**: "they hit you less often."

The player-facing string should still be the ruled one — *"Heavy · +7.5% armour"* — with the
mechanic in the flyout. **Copy is the Art Director's call; I am specifying the state.**

### 4.3 · The rates — where I spend Tyler's latitude, and the measurement that forced it

**Uniform 2.5% per pair leaves plate strictly dominated at every level above 55.** Measured
at 99 vs the dragon, 12h cap, 600 Cooked Shark, 3 seeds, XP per unit of food:

| heavy set bonus at six pieces | plate XP/food | vs cloth (6136) |
|---|---|---|
| **7.5%** (Tyler's 2.5%/pair) | 5099 | **−17%** |
| 15.0% (5%/pair) | 5681 | −7% |
| **22.5% (7.5%/pair) — PROPOSED** | 6218 | **+1%** |
| 30.0% (10%/pair) | 6946 | +13% |

**Why the asymmetry is correct and not a fudge:** crit and damage are two forms of the same
currency (a point of crit is worth ~0.5 points of damage, because `critMult` is 1.5), so
2.5% / 2.5% for medium and light is right. Plate's currency is a *cost avoided* — but in this
engine **offence also avoids cost**, because killing faster means taking fewer retaliations
per kill. Defence therefore has to be priced roughly 3× to break even. Measured, not assumed.

| | per pair | at 6 pieces | measured worth at BiS 99 |
|---|---|---|---|
| heavy | **−7.5%** chance to be hit | −22.5% | −22.5% food burn; XP/food parity with cloth |
| medium | **+0.025** crit **and +0.05** crit multiplier | +0.075 crit, ×1.65 crits | +19% DPS over plate |
| light | **+2.5%** damage | +7.5% | +28% DPS over plate |

**Why medium gets two numbers.** Crit chance alone cannot carry leather, because it is
**capped at 0.60** while damage is not. Measured with crit chance only, leather lands at
**0.89 × cloth's DPS** and is dominated once defence saturates. The crit *multiplier* is
uncapped, scales with the crit chance leather already has, and lifts leather to **0.89–0.97 ×
cloth** across all four families at 40 / 70 / 85 / 99 — 0.89–0.92 at level 40, tightening to
**0.93–0.97 at 85–99**, i.e. it closes the gap exactly where it would otherwise be worst,
because that is where leather's crit chance is highest. It also gives medium armour a real
identity sentence — *"you crit more often and your crits hit harder"* — instead of being
"cloth, but worse."
**Fallback if Tyler wants one number per pair:** drop `critMult`; leather then sits ~11%
behind cloth instead of ~7%, and the `applyCrit` engine change in §8 is not needed.

### 4.4 · What happens to the existing `armorSetBonus` — REPLACED

The shipped rule is **5 of 6 pieces, same armour class AND same material tier → `critB = tier × 0.01`**.
It is replaced, not layered. Four reasons, in order of weight:

1. **It hands every archetype the LEATHER currency.** A full plate set grants crit today.
   Under an identity triangle that is incoherent.
2. **It is all-or-nothing at 5**, so a 3/3 mix gets nothing — a direct contradiction of
   ruling 1, which exists to make mixing a strategy.
3. **The same-tier requirement punishes exactly the player it should reward** — the mid-game
   player wearing four steel pieces and two mithril drops gets zero. Dropping tier from the
   key is a straight improvement and costs nothing, because the tier is already priced into
   the flat stats.
4. **It is the surface b343 spent a paragraph protecting** (capes were kept out of
   `ARMOUR_SLOTS` specifically so a seventh slot could not dilute the 5-of-6 threshold). Pair
   counting over an explicit six-slot list removes the fragility rather than working around
   it.

**SINGLE POINT OF APPLICATION — stated explicitly because b342's companion double-count lived
in exactly this seam** (every proc, drop and harvest counted twice because a feature was
installed through two wrappers):

| term | computed in | consumed in | consumed anywhere else |
|---|---|---|---|
| `critB`, `critMult`, `dmgPct` | `armourSetBonus()` | `playerCombatRolls()` — once | **no** |
| `defPct` | `armourSetBonus()` | `monsterCombatRolls()` — once | **no** |

`playerCombatRolls` already takes `setBonus` as an **injectable ctx field** with a derive-if-
absent fallback, which is the seam that makes one identity provable. `monsterCombatRolls`
must be given the same field the same way. **The set object must never be summed into
`equipmentStats`, and `dmgPct` must never ride the `getBonus('damage')` channel** — see §6.3.

### 4.5 · The mix-and-match arithmetic, executed

Level 99, sword, vs the Green Dragon. This is the table ruling 1 exists to make possible:

| build | DPS | defB | crit | reads as |
|---|---|---|---|---|
| 6 plate | 14.42 | 301 | 0.080 | −22.5% chance to be hit |
| 4 plate / 2 leather | 14.96 | 278 | 0.158 | −15.0% hit chance · +2.5 crit |
| 4 plate / 2 cloth | 15.06 | 264 | 0.080 | −15.0% hit chance · +2.5% damage |
| 2 / 2 / 2 | 15.91 | 222 | 0.199 | −7.5% hit chance · +2.5 crit · +2.5% damage |
| 4 cloth / 2 plate | 17.39 | 141 | 0.080 | −7.5% hit chance · +5.0% damage |
| 4 cloth / 2 leather | 18.04 | 118 | 0.158 | +2.5 crit · +5.0% damage |
| 6 cloth | 18.45 | 104 | 0.080 | +7.5% damage |
| 3 plate / 3 cloth | 15.27 | 243 | 0.080 | −7.5% hit chance · +2.5% damage (the odd piece pays nothing) |

A smooth 28% DPS dial against a 2.9× defence dial, with no cliff anywhere on it. That is the
whole feature.

---

## 5 · The dead accuracy points — repurposed at the top, KEPT small at the bottom

The b343 finding is correct at level 99 and **overstated below it.** Measured accuracy with a
weapon and jewelry but **no armour accuracy at all**, against a level-appropriate foe:

| level | 10 | 20 | 30 | 40 | 55 | 70 | 85 | 99 |
|---|---|---|---|---|---|---|---|---|
| bow | 0.8625 | 0.8500 | clamped | clamped | clamped | clamped | **0.8800** | clamped |
| staff | 0.7000 | 0.9085 | 0.9200 | clamped | clamped | clamped | 0.9200 | clamped |
| sword / hammer | clamped from lv10–20 with the weapon alone | | | | | | | |

**Ruling:**

- **Tiers 4–7 of leather and cloth: DELETE the accuracy fields.** Between level 40 and 70
  they are 100% wasted. The one place they still bind is level ~85 against a tier-6 foe,
  where deleting them costs a bow **0.95 → 0.88** accuracy — and the flat damage repays it
  even there: best-of-archetype bow DPS at 85 vs the War King goes **15.85 → 16.73 (+6%)**.
  That is the smallest family gain anywhere in this proposal, and it is still a gain.
- **Tiers 1–3: KEEP, at `round(plateDef × 0.20)`, on `rangeAtkB` and `magicAtkB` only.**
  3 / 8 / 12 points across six pieces. Measured effect: level-20 bow **0.85 → 0.93 accuracy
  (+9.4% DPS)**, level-30 staff **0.92 → 0.95**. The term **retires itself** — nobody wears
  tier-3 armour past level 45 — so it can never become the 186-point problem again.
- **No `atkB` on any armour piece, at any tier.** Melee accuracy is already at the 0.95 clamp
  from level 10 with nothing but a weapon, so a melee accuracy term would be a null stat on
  arrival. This is also why plate's number was the honest one all along.
- **All negative accuracy: DELETED** (plate's −0.25/−0.50, leather's −0.15 magic, cloth's
  −0.25 melee / −0.20 ranged). This is the single biggest behavioural change in the proposal
  and it is what makes ruling 1 executable — §1.2.

---

## 6 · Ceilings, budgets, and the exploit review

### 6.1 · The crit cap (`COMBAT_BALANCE.critCap = 0.60`) — non-binding by construction
The leather 6-piece total of **0.224** is solved backwards from the cap, not chosen. Measured
worst case: a BiS leather bow kit **plus** a Scorpion companion (+0.05) **plus** a Void
Banquet (`damage_crit`, +0.05, the only crit food in the game):

| level | armour | set | other gear | total | + companion + banquet | headroom |
|---|---|---|---|---|---|---|
| 40 | 0.053 | 0.075 | 0.035 | 0.163 | 0.263 | 0.337 |
| 70 | 0.122 | 0.075 | 0.110 | 0.307 | 0.407 | 0.193 |
| 85 | 0.168 | 0.075 | 0.150 | 0.393 | 0.493 | 0.107 |
| **99** | 0.225 | 0.075 | 0.160 | **0.460** | **0.560** | **0.040** |

**The cap never binds**, including in the fully-decorated case. That is deliberate and it is
b343's own ruling applied to a second stat: *a binding clamp turns a reward into a lie.*
0.040 of headroom at 99 is thin — **any future item carrying more than ~0.04 crit must be
priced against this table**, and the guard in §9 is what makes that automatic. `critMult` is
uncapped and is therefore the correct place to put future medium-armour rewards.

### 6.2 · The permanent power fuse (≤ 0.20 per key) — untouched
Gear stats (`defB`, `critB`, `strB`, `spdB`) sit outside the `getBonus` chain and therefore
outside the fuse, exactly as they do today. **Nothing in this proposal enters the chain.**

⚠ **The one way this could go wrong, named so it does not:** `playerCombatRolls` already has
a weapon-agnostic damage channel — `bonus('damage')`. It would be one line to route cloth's
`dmgPct` through it, and that would be **wrong**: gear would then consume the permanent
damage budget the fuse governs, and a fused clamp would silently eat part of a set bonus.
`dmgPct` must be its own term. **Combine additively inside ONE floor** —
`maxHit = floor(maxHit × (1 + set.dmgPct + bonus('damage')))` — which is the form measured
here; two successive floors lose up to a point of damage for no reason.

### 6.3 · Exploit review
- **No new mintable channel.** Every number is derived from equipped item ids and the
  six-slot count; nothing is client-supplied, nothing is a rate on a grant.
- **Structurally capped.** There are six armour slots, so one class can reach at most 3
  pairs. There is no ladder to climb and therefore **no route to the spdB failure**: the
  maximum is 22.5% / 0.075+0.15 / 7.5%, permanently, by the shape of the equipment doll.
- **Server parity.** `src/core/**` is vendored byte-for-byte into `hr-accrue`, so the same
  functions compute away accrual. The set bonus must be derived **inside** the roll functions
  from server-owned equipment, never passed in from a request body — the existing
  `setBonus` ctx field already has a derive-if-absent fallback, and that fallback is what the
  server must use.
- **`defPct` reduces incoming accuracy only.** It cannot reduce a monster's max hit, so it
  cannot be used to make an unsurvivable foe read as survivable — S1 is untouched (§4.2).
- **No effect on the Hearth Token bond, the market, or any tradeable value.**

---

## 7 · What it does — BiS DPS, before and after

Best armour for the family, greedy best-in-slot across the whole catalogue, vs a
level-appropriate foe.

| level | family | BEFORE (best arch) | AFTER (best arch) | change |
|---|---|---|---|---|
| 40 | sword | 8.41 (leather) | 9.42 (cloth) | +12% |
| 40 | hammer | 5.60 (leather) | 6.53 (cloth) | +17% |
| 40 | bow | 5.99 (leather) | 6.86 (cloth) | +14% |
| 40 | staff | 8.13 (cloth) | 5.91 (cloth) | **−27%** |
| 70 | sword | 10.45 | 11.88 | +14% |
| 70 | hammer | 12.46 | 13.87 | +11% |
| 70 | bow | 11.49 | 13.07 | +14% |
| 70 | staff | 17.03 | 11.42 | **−33%** |
| 99 | sword | 16.05 | 18.45 | +15% |
| 99 | hammer | 17.15 | 19.06 | +11% |
| 99 | bow | 19.55 | 22.49 | +15% |
| 99 | staff | **29.96** | 18.71 | **−38%** |

**Best-of-family spread: 1.87× → 1.22× at level 99; 1.73× → 1.20× at 85; 1.63× → 1.21× at 70.**

The archetype ladder, sword, with the recommended rates (`critMult` included):

| level | plate | leather | cloth | L/P | C/P | C/L |
|---|---|---|---|---|---|---|
| 20 | 4.77 | 5.08 | 5.17 | 1.06 | 1.08 | 1.02 |
| 40 | 8.01 | 8.68 | 9.42 | 1.08 | 1.18 | 1.09 |
| 55 | 8.84 | 9.74 | 10.44 | 1.10 | 1.18 | 1.07 |
| 70 | 9.66 | 10.89 | 11.88 | 1.13 | 1.23 | 1.09 |
| 85 | 14.42 | 16.73 | 18.03 | 1.16 | 1.25 | 1.08 |
| 99 | 14.42 | 17.23 | 18.45 | 1.19 | 1.28 | 1.07 |

**Plate-wearing builds of every family stay viable at ~78–94% of cloth's DPS** — the success
criterion — and the gap widens with level precisely as defence saturates, which is the trade
being sold.

### 7.1 · Two honest caveats on this table

**(a) Magic takes a 27–38% cut, and that is the correction, not a side effect.** Staff was
2.26× sword at BiS *because cloth's damage paid only magic*. Under ruling 2 it pays everyone,
so the number that was borrowed comes back. It should be communicated as a rebalance, and
round 2 wipes anyway.

**(b) The residual spread below level 55 is the WEAPON ladder, not armour — and this
proposal makes that visible for the first time.** With all four families in identical armour:

| level | 10 | 20 | 30 | 40 | 55 | 70 | 85 | 99 |
|---|---|---|---|---|---|---|---|---|
| spread | **2.17×** | 1.69× | 1.52× | **1.62×** | 1.40× | 1.22× | 1.20× | 1.22× |

Sword is 62% ahead of staff at level 40 on the weapon curve alone. **After this change,
armour contributes nothing to family imbalance at any level**, so the `WEAPON_FAMILIES`
`atk`/`str` curves in `gear-tiers.js` are the only remaining source and can be tuned in
isolation. That is a separate pass and I am not smuggling it in here.

---

## 8 · The away-night price — what plate actually buys

This is what makes the triangle honest in an idle game. Real `simulateSpan`, real
`resolveAutoEat`, seeded, sword family so armour is the only variable.

### 8.1 · Level 40 — 8h, food never runs out

| build | DPS | defB | food burned | food cost | kills | XP | XP per food |
|---|---|---|---|---|---|---|---|
| **vs goblin_brute** (a foe you outgear) | | | | | | | |
| plate | 8.01 | 83 | **206** | 11,330g | 2842 | 1,519,842 | **7378** |
| leather | 8.51 | 54 | 259 | 14,256g | 2984 | 1,612,371 | 6221 |
| cloth | 9.42 | 38 | **330** | 18,172g | 3268 | **1,784,644** | 5401 |
| 4 plate / 2 cloth | 8.01 | 75 | 227 | 12,474g | 2844 | 1,521,777 | 6710 |
| **vs bear** (a foe above your weight) | | | | | | | |
| plate | 6.81 | 83 | **476** | 26,158g | 1293 | 1,389,185 | **2921** |
| leather | 7.23 | 54 | 849 | 46,695g | 1367 | 1,477,022 | 1740 |
| cloth | 7.81 | 38 | **1420** | 78,078g | 1467 | **1,588,643** | 1119 |

**Cloth pays 3.0× the food for 14% more XP** against a foe that can actually hurt you.

### 8.2 · Level 70 — 8h, food never runs out

| build | DPS | defB | food burned | food cost | XP | XP per food |
|---|---|---|---|---|---|---|
| **vs death_knight** | | | | | | |
| plate | 9.66 | 175 | 283 | 254,340g | 2,093,078 | 7407 |
| leather | 10.58 | 107 | 353 | 317,520g | 2,289,479 | 6489 |
| cloth | 11.88 | 69 | 353 | 317,340g | **2,574,153** | 7300 |
| **vs war_king** (a tier above) | | | | | | |
| plate | 10.89 | 175 | **413** | 371,880g | 2,489,546 | **6025** |
| leather | 11.93 | 107 | 535 | 481,680g | 2,725,426 | 5092 |
| cloth | 13.29 | 69 | **1040** | 936,000g | **2,961,743** | 2848 |
| 4 plate / 2 cloth | 11.27 | 156 | 458 | 412,020g | 2,489,310 | 5438 |

**The design statement this table earns:** *the armour triangle is a difficulty dial, and it
only bites on content that can hurt you.* Against a foe at your own level plate saves 20–38%
of the food (37.6% vs goblin_brute at 40, 19.8% vs death_knight at 70); against a foe a tier
above it saves **60%**, and cloth's night costs **2.5× as much gold in provisions for 19%
more XP**. Against a foe you have completely outgeared the three archetypes converge — and
that is correct, not a failure: an armour choice should stop mattering once nothing can
threaten you.

### 8.3 · Time-to-death unattended, no food at all — the pure survival axis (12h span, 5 seeds)

| | plate | leather | cloth | 4 plate / 2 cloth |
|---|---|---|---|---|
| lv40 goblin_brute | **9.2 m** | 5.7 m | 6.1 m | 8.8 m |
| lv40 bear | **3.0 m** | 1.9 m | 1.3 m | 3.0 m |
| lv70 death_knight | **3.5 m** | 2.1 m | 2.5 m | 2.3 m |
| lv99 dragon | 1.8 m | 2.0 m | 1.8 m | 1.7 m |

Two things this says. **(1)** Armour alone buys minutes, never a night — food is the away
system, exactly as `supply-projection.md` §7.3 concluded, and this proposal does not change
that. **(2)** At level 99 the three archetypes are **identical** on this axis, because the
0.10 accuracy floor has swallowed all three defence values. §10 is where that goes.

### 8.4 · The new player — levels 1–20, unattended kills in 8h with no food

| level / foe | plate | leather | cloth |
|---|---|---|---|
| 1 · slime | **85** | 49 | 47 |
| 5 · goblin | **49** | 30 | 31 |
| 15 · wolf | **34** | 14 | 11 |
| 20 · skeleton | **27** | 12 | 11 |

Plate gives 2–3× the unattended survival for 4–8% less DPS in the first twenty levels. The
starting kit is plate, so the first lesson the game teaches about armour is true.

---

## 9 · Test contract

| # | test | asserts | mutation proof |
|---|---|---|---|
| **ARM-1** | every generated armour row carries `armourClass`, `reqSkill:'defense'` and `reqLv === MATERIAL_TIERS[i].smith` | §1.4(a) can never come back | strip the class from `steel_helm` → RED |
| **ARM-2** | leather 6-piece `critB` + the best non-armour crit in every slot + 0.05 companion + 0.05 `damage_crit` **≤ `COMBAT_BALANCE.critCap`** | §6.1, and it re-fires on every future crit item | raise `critK` to 0.0012 → RED |
| **ARM-3** | for every tier, every cloth piece has `strB === rangeStrB === magicStrB` | ruling 2 — cloth is weapon-agnostic | delete `rangeStrB` from one row → RED |
| **ARM-4** | **no armour row carries a negative accuracy field** | §1.2 / ruling 1 | re-add plate's `magicAtkB` penalty → RED |
| **ARM-5** | best-of-family BiS DPS spread ≤ **1.30×** at levels 70 / 85 / 99, computed through the real `playerCombatRolls` | the headline result, guarded | restore cloth's magic-only `magicStrB` → RED at 1.87× |
| **ARM-6** | `armourSetBonus` returns exactly `floor(n/6-slot count / 2)` pairs per class; cape and jewelry contribute **zero** | b343's cape decision survives | add `cape` to the slot list → RED |
| **ARM-7** | monster `maxHit` is invariant under `defPct` and under armour class | **S1 stays true** — `supply-projection.md` §7.2 | make `defPct` touch `maxHit` → RED |
| **ARM-8** | the set-bonus terms appear in exactly **one** consumer each (`playerCombatRolls` / `monsterCombatRolls`) | b342's double-count seam | add a second application → RED |
| **ARM-9** | no armour row carries `spdB` | b343's speed ruling | add one → RED |
| **ARM-10** | away/live parity: a seeded fight with a mixed 4/2 kit is byte-identical through `simulateTick` and `simulateSpan` | AWAY-1's contract extends to the new terms | — |

**ARM-7 and ARM-8 are the two that would be omitted and are the two that matter most.**
ARM-2 is the one that keeps paying: it is the guard that prices every future crit item
automatically instead of by memory.

---

## 10 · Engine changes required — handoff to the Systems Engineer

Data alone cannot deliver this. Four changes, all small, each with its single application
point named:

| # | file | change | risk |
|---|---|---|---|
| S-1 | `src/core/combat.js` | `armorSetBonus` → `armourSetBonus`: pair counting over an explicit six-slot list, class-only (no tier), returning `{defPct, critB, critMult, dmgPct}` | replaces a shipped function; **three named smoke tests move** — see below |
| S-2 | `src/core/combat.js` `playerCombatRolls` | add `set.dmgPct` **additively inside the existing `bonus('damage')` floor**; return `critMult = COMBAT_BALANCE.critMult + set.critMult` | low |
| S-3 | `src/core/combat.js` `monsterCombatRolls` | accept `setBonus` as an injected ctx field with a derive-if-absent fallback (mirroring `playerCombatRolls`); apply `× (1 − set.defPct)` **after** the clamp | low — one line, but it is the whole heavy identity |
| S-4 | `src/core/combat-sim.js` `simulateTick` | pass `roll.critMult` to `applyCrit` instead of the constant | low; **only needed if the `critMult` half of §4.3 ships** |

**Semantic conflicts to raise in `CONFLICTS.md` before any of this lands:**

1. **`gear-tiers.js` and `recipes.js` are being edited right now by another agent.** This
   document deliberately touched neither. The rescale must be applied **after** that work
   lands, and re-measured against it — the greedy best-in-slot search here reads the whole
   catalogue, so a new jewelry or capstone row moves these numbers.
2. **`defPct` vs `bonus('defense')`.** The existing perk channel adds flat defence *points*
   inside `monsterCombatRolls`. Above level 55 those points are saturated too — so **every
   `+defence` perk in the game is currently a null perk at endgame.** That is not created by
   this proposal and is not fixed by it; it is the same finding as §1.4(b) and it should be
   sized by whoever owns the perk stack.
3. **The 0.10 monster-accuracy floor is the real ceiling on the whole triangle.** Everything
   in §8 above level 70 is plate fighting with one hand tied. If Tyler ever wants defence to
   be a genuine third axis at endgame rather than a food discount, the change is to
   `monsterMinAccuracy` — a soft floor instead of a hard one — and it is a global rebalance
   that must be measured on its own, not folded into this.

### 10.1 · The three shipped smoke tests that assert the OLD model and must be rewritten

Found by reading the suite, not by running it — they are named here so nobody "unblocks" the
change by deleting them:

| test | what it asserts today | what it becomes |
|---|---|---|
| `b283: armour set bonus requires same ARCHETYPE + tier (no mixed-loadout trigger)` (~L2632) | a 3-plate/2-cloth loadout grants **nothing**, and 5 same-tier same-class pieces grant the bonus | the mixed loadout must now grant **one plate pair AND one cloth pair**; that is the feature, and the assertion inverts |
| `WAVE-armor: the combat triangle — cloth boosts magic accuracy, plate penalises it` (~L2675) | `archmage_body.magicAtkB > 0`, `dawn_platebody.magicAtkB < 0`, `dragonhide_body.rangeAtkB > 0` | all three fields are deleted above tier 3. **Replace with ARM-3 and ARM-4** — the triangle is asserted on damage/crit/defence, which is what it now is |
| `b343: crit stays under the engine cap even in a perfect kit` (~L15263) | best `critB` per slot + `0.08` (the old tier-8 set bonus) ≤ 0.60 | the `0.08` becomes the new maximum leather set contribution (`0.075`). **Measured: it still passes** — best-in-slot under the proposal sums to 0.519. **ARM-2 supersedes it** by adding the companion and food-buff terms it never counted |

The fourth armour test — `b283: the Character card reads attack per active style` — asserts
only that `atkB`/`rangeAtkB`/`magicAtkB` are reported as **separate fields**, never merged.
That stays true and stays green; **do not touch it.** Its comment mentions plate's magic
penalty as motivation, and that comment needs a one-line update so it does not become a lie
about the data.

---

## 11 · Migration, compatibility, and the items that need a look

**No save migration.** The beta wipes at cutover (CLAUDE.md, locked 2026-08-10), and every
id, name, slot, tier and `v` in the tables above is unchanged — only stat fields move. A
pre-wipe save loads and simply reads different numbers.

**Two things DO move and must be sequenced:**

1. **The catalogue regenerates.** `tools/gen-catalogues.mjs` reads `src/data/*`, so
   `supabase/migrations/2026-08-11-catalogue.generated.sql` must be regenerated and applied.
   Item **count** is unchanged (426); only stat columns move.
2. **The Edge payload digest moves.** `tools/pack-edge.mjs` hashes `src/data/**`, so
   `hr-accrue` must be repacked and redeployed, and `deployedPayloadGuard` will correctly go
   red until it is. Since b332 a cache-buster bump alone no longer moves the digest — **this
   change does**, so the redeploy is real and not optional. Re-run
   `node tools/switch-on-test.mjs` after.

### 11.1 · Items sitting on the old assumptions — each needs an explicit `armourClass`

**Thirteen items occupy the six armour slots and carry no `armourClass`**, so they all
default to `'plate'`. Under a per-class system that default must become a decision:

| item | slot | tier | what its stats say | recommended class |
|---|---|---|---|---|
| `iron_helm`, `steel_helm`, `iron_platebody`, `steel_platebody` | helmet/body | 2–3 | pure `defB`, **no requirement at all** | **plate** — and give them the missing `reqSkill`/`reqLv` (§1.4a) |
| `regent_helm`, `slagheart_platebody`, `abyssal_greaves`, `choirbone_gauntlets`, `warden_girdle` (Hunt-forged, t8) | 5 of 6 | 8 | pure `defB`, very high | **plate** — matches their read |
| `crown_of_the_fallen_king` | helmet | 7 | `defB 36`, `strB 6`, `xpB .03` | plate |
| `nightstalker_pelt` | body | 5 | `critB .02`, `rangeStrB 6`, `rangeAtkB 8`, `spdB .04` | **leather** — it is a leather item wearing a plate label today |
| `wraithsilk_shroud` | body | 5 | `magicAtkB 8`, `spdB .03` | **cloth** |
| `plaguewarden_greaves` | pants | 5 | `defB 26`, `strB 4`, `spdB .02` | plate (judgement call — Tyler's) |

**Two consequences worth flagging before this lands:**

- **The Hunt-forged capstone set is five pieces of plate with no boots.** Today that is
  exactly the 5-of-6 threshold and it grants the best set bonus in the game (`tier 8 × 0.01 =
  0.08 crit`). Under pair counting it becomes **2 plate pairs (−15% hit chance)** and the
  crit goes away. That is a deliberate re-flavouring of the top reward in the game and Tyler
  should see it stated rather than discover it.
- **There is no tier-8 leather or cloth capstone anywhere.** A leather or cloth player who
  wants a Hunt-forged piece must break their own pairs to wear it. That was invisible while
  every archetype shared one generic set bonus; it becomes a visible content gap the day this
  ships. **This is the natural home for the ~25 tier-3–6 combat drops that are currently
  vendor-trash with no recipe** — a leather and a cloth capstone line, sourced from them.
  Separate pass, flagged here because this change is what creates the demand.
- `woolen_cloak` … `dawnlit_mantle` carry `armourClass: 'cape'` and are correctly excluded by
  the six-slot list. `alpha_cloak` / `traveler_cape` have no tier and are excluded today by
  accident; under the six-slot list they are excluded **by construction**, which is better.

---

## 12 · Known limitations, and the open questions for Tyler

**Limitations of this pass, stated rather than buried:**

1. **Leather's away-night rows in §8 exclude the `critMult` half of its set bonus.**
   `simulateTick` calls `applyCrit(pDmg, COMBAT_BALANCE.critMult)` with the constant, and I
   did not patch the engine to measure. The DPS tables in §7 *do* include it, by closed form
   over the same `applyCrit`. So **every leather row in §8 is a lower bound, understated by
   ~4–5%.** It becomes exact the moment S-4 lands.
2. **Best-in-slot is greedy, not exhaustive.** Three passes over six free slots, ranked by
   marginal DPS against the reference foe. It reproduces the b343 armour-only control to
   0.01 DPS, and it finds strictly better kits than b343's hand-picked ones (it discovered
   `chitinweave_cloak` and `panthers_eye_pendant`), but a genuinely adversarial optimum could
   differ by a percent or two.
3. **All measurements use the default combat style** and no perks, companions, blessings or
   buffs, so the ladder is the gear ladder alone. Those channels multiply all three
   archetypes roughly equally, but I did not prove that.
4. **Three seeds on the 12h fixed-stock tables, five on the 8h ones.** Enough to rank; not
   enough to quote a single night to three significant figures.
5. **Ammo consumption does not exist yet** (b343 shipped `ammoPerShot` as inert data), so
   bow's numbers are pre-provisioning. When it lands, bow's 1.22× lead is partly paid back in
   arrows and this table should be re-run.

**Open questions — these are Tyler's calls, not mine:**

1. **The heavy rate: 7.5% per pair (−22.5% at six), or his 2.5%?** §4.3 has the measurement.
   2.5% leaves plate 17% behind on XP-per-food at 99 — a null archetype for anyone past
   level 55. My recommendation is 7.5%, and the honest alternative is to keep 2.5% and make
   **food genuinely scarce** instead (the consumable-economy program), which reaches the same
   place through the economy rather than through combat.
2. **Does medium get two numbers (`+2.5 crit` *and* `+5% crit damage`) or one?** One number
   is more legible; two is what makes leather not-dominated. §4.3 prices both.
3. **The magic cut (−38% at BiS).** It is the correction ruling 2 implies, but it is the
   largest single number in this document and it lands on real beta characters.
4. **`plaguewarden_greaves`' archetype** (§11.1) — the only genuinely ambiguous one.
5. **The 0.10 monster-accuracy floor** (§10, conflict 3). Leaving it alone makes plate "the
   cheap night"; changing it makes plate "the tough night". Both are legitimate games; only
   one of them needs an engine change.

---

## Appendix — every number, and how it was obtained

All figures produced in plain Node against the working tree at commit `d9c5277`, importing
`src/core/combat.js`, `src/core/combat-sim.js`, `src/core/styles.js`, `src/core/auto-eat.js`,
`src/core/rng.js`, `src/core/xp.js`, `src/data/items.js`, `src/data/monsters.js` and
`src/data/gear-tiers.js` directly. No re-implementation of any formula.

| figure | method |
|---|---|
| **CONTROL — the harness reproduces b343** | armour-only BiS at 99 vs the dragon: sword **11.26** DPS against b343's recorded 11.27; sword max hit **54** and staff max hit **130** against b343's recorded 54 and 130. The harness and b343's are the same measurement. |
| BiS DPS | `playerCombatRolls` + `swingIntervalMs`, closed form: `accuracy × E[hit] / (interval/1000)`, where `E[hit]` sums the engine's own `applyCrit` over the uniform `1..maxHit` the engine's `rollAttack` draws. |
| best-in-slot | greedy, 3 passes over cape/necklace/ring1/ring2/earrings(/ammo), ranked by marginal DPS; the six armour slots are FORCED to the archetype under test (it is the axis). |
| accuracy ceiling | `0.55 + ((skill + accBonus) − monsterDef × ACC_DEF_MUL[tier]) × 0.01`, clamped 0.95 — hardest defScore in the game is the Green Dragon's 62 × 1.5 = **93**, so the clamp binds at `skill + accBonus ≥ 133`. |
| the 0.10 floor | `monsterCombatRolls` swept over all 31 monsters at every archetype's BiS, counting `accuracy ≤ 0.1001`. |
| S1 invariance | monster `maxHit` printed for all three archetypes and `defPct ∈ {0, .075, .15, .225}` — constant, and equal to `max(1, floor(atk × 0.45))` in all 12 cells. |
| away nights | real `simulateSpan` with `ctx.away = true`, `tickMs = swingIntervalMs(eq, style)`, and an `fx.autoEat` that calls the real `resolveAutoEat` and decrements a real inventory. 3–5 seeds, means reported. |
| food cost | food burned × the item's shipped `v`. |
| crit budget | best `critB` per non-armour slot at level 99 across the whole catalogue (0.22 total), plus `companions.js` `scorpion` 0.05 and `items.js` `void_banquet` `damage_crit` magnitude 5 → 0.05. |
| the four classless rows | `ITEMS.steel_helm.armourClass === undefined`, and `canWear` with every skill at level 1 returns true. |
| weapon-ladder isolation | all four families forced into the same armour, so armour cannot be the variable; run on both the shipped and the proposed catalogue. |
| proposed catalogue | rebuilt from `MATERIAL_TIERS` × `ARMOUR_SLOTS` with the coefficients in §3, verified to reproduce every shipped `defB` and `critB` exactly before any coefficient was changed. |
