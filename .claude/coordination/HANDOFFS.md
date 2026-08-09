# HANDOFFS

_The primary agent-to-agent teaching mechanism. When your work affects another specialist, write a handoff here. Append newest at top._

## Template
```
### <DATE> · FROM <agent> → TO <agent(s)>
WHAT I LEARNED:
WHAT I CHANGED:
WHAT YOU NEED TO KNOW:
WHAT I NEED FROM YOU:
WHAT MUST NOT BE CHANGED:
WHAT SHOULD BE TESTED:
```

---

### 2026-08-09 · FROM Game Designer → TO Systems Engineer, homestead agent, QA
**WHAT I LEARNED:** `getBonus` is a base function **plus six additive monkey-patch wrappers** (rooms/renown/capstone → companions → food buffs → clan → castle → muster → blessings). **42 live bonus sources across 7 layers**, 4 more outside the chain, 6 ghost keys. The only fuse in the game sits at **layer 4** and reduces *only layer 4's own contribution* — companions, food buffs, the muster aura and the entire blessing calendar are added afterwards and **nothing clamps them**. Three sources no spec ever budgeted: a **level-30 companion is `smithSpeed` +24.5%** (base ×`1+0.05×(lv−1)` over 30 levels), food buffs reach **+50%** (Lich Soul Soup) and are indefinitely renewable, and `forge_fires` + `guild_works` is **+50% smith AND craft from the calendar alone**.
**WHAT I CHANGED:** New spec `docs/design/bonus-rebase.md`. No game code.
**WHAT YOU NEED TO KNOW — Systems (b228):** the grammar is **whole percents only, 2% step, 1% half-step for wide keys** (`allXP`/`combatXP`/`goldFind`). **Permanent ceiling +15% per key, fuse 0.20, temporary budget +15%, absolute peak +30%.** Full current→new table in §3; every one of the ~30 assertions to retune is listed with its line number in §4.3. **The fuse must move out of `clan-seat-ui.js` into a final `power-budget.js` wrapper installed last** — a fuse in the middle of a seven-layer chain cannot police it. Constants: `PERMANENT_ALLXP_CAP` 0.60→**0.20** (and per-key, not `allXP`-only), `CASTLE_KEY_CAP` 0.10→**0.05**, `CASTLE_TOTAL_CAP` 0.25→**0.12 and actually applied** (today it is declared and enforced against nothing). **Two migrations**, not none: the feast ladder (`clan-seat.sql:1104`) and rested potency (`:1151`/`:1170`) are server-mirrored; castle *building* perks are client-side only.
**WHAT YOU NEED TO KNOW — homestead agent:** your provisional is **ratified** (speeds +2/4/6/8/10, Library/Trophy +1/2/3/4/5, Garden flat, `noBurn` unchanged, procs 4/8) with **three amendments** in §5.1: (1) **P1 — Workshop and Shrine are still at +10/25/50/50/60**, six rooms retuned and two missed; (2) the **Cellar goes back UP to +20/40/60/80/100%** — duration is exempt from the grammar and was cut by mistake; (3) Library L4/L5's `restedXp` 4/8% is dead on arrival — ship the XP-quantum payload or ship it inert.
**WHAT I NEED FROM YOU:** Systems' ruling on the final-wrapper fuse (it needs permanent and temporary to be separately accumulable) **before b228 builds**; and a call on `smoke-test.js:8746`, which breaks *structurally* under a final clamp (it forces a synthetic 0.50 all-keys blessing and asserts 1.0) while guarding the load-bearing offline-replay latch.
**WHAT MUST NOT BE CHANGED:** the **gathering tool ladder** (.05→.35) is deliberately out of scope — it is gear, and the 57.2-day floor was derived *with* it applied, so touching it re-opens the anchor Tyler approved. `PACE.xp`/`PACE.actionMs` and the whole b226 pacing test block are untouched. Kitchen `noBurn` 13/19/25, Garden flat `farmYield`, Shrine bulk-bury, renown's six offline-hour ranks and Tavern leftovers 5% are all **unchanged on purpose** — duration/capacity/reliability/access are exempt from the grammar and are the preferred payload for expensive rungs.
**WHAT SHOULD BE TESTED:** four new tests in §4.4. The one that matters is **the grammar test** — walk every source table and assert every percentage is a whole number of percent. Nothing like it exists today, and it is what stops the whole thing re-drifting. Also: a **whole-chain per-key** fuse test (the suite has no aggregate ceiling test for any non-`allXP` key — that gap is how `smithSpeed` reached +90% unnoticed).

### 2026-08-08 · FROM Game Designer → TO Systems Engineer, castle-panel builder, Art Director, QA
**WHAT I LEARNED:** Three seams built in b222 are still inert and this wave should consume two of them — `registerBuffScaler` (SEAM 2, built explicitly for a second consumer; the homestead Cellar is it) and `G.restedXp` (SEAM 3, banks 80 charges of offline time but `getBonus('restedXp')` is 0, so the whole bank does nothing). Also: the Hunt-forged level gates were inverted against `gear-tiers.js`, and `farm-progression.js` never unlocks the three b215 crops.
**WHAT I CHANGED:** Six ratifications recorded in `clan-boss-events.md` (§3.1, §3.4a, §8.6), `clan-overhaul.md` (§4.5, §6.5) and `world-event-cadence.md` (§4.5). New spec `docs/design/homestead-deepening.md`. Narrow data edit (Task 1.2 authority only): four Hunt-forged `req` values in `src/data/recipes.js` + comment corrections in `src/data/items.js`, with a derived regression test in `smoke-test.js`. Smoke **270/270**.
**WHAT YOU NEED TO KNOW — castle-panel builder:** the room-modal descriptor is specced in `homestead-deepening.md` §5 as **pure data** — `{id, pillar, title, kicker, flavour, art, state, lockReason, now[], ladder[], actions[], footer}`. Two rules make it a seam rather than a shape: the renderer must **never branch on `pillar`** (it is a CSS data attribute), and the **full ladder always renders**, owned rungs included. Costs are `{id, need, have}` triples so b217's `fmtCostRow` checklist is reused verbatim. Build it once and the homestead consumes it with zero new machinery. **Systems:** three one-line seams for homestead Phase 1 — `getBonus('yield_'+skillId)` at `doArtisanAction`'s `addItem` (**only if `!ITEMS[out].type`**), a `restedXp ≤ 0.50` clamp, an artisan-speed `≤ 0.85` clamp. **Art:** 8 room illustrations in lit/ghosted/locked, same "Forge & Stone" language as the castle view — produce them with the castle art or the twins won't look like twins.
**WHAT I NEED FROM YOU:** (1) the P1 in `CONFLICTS.md` — `farm-progression.js TIERS` makes Goldenroot/Emberfruit/Moonbloom unplantable at MAX plot level, so farming's last 37 levels have nothing to plant; five-line data fix, ship it independently. (2) Systems' call on the craft-to-vendor gold margin (`invSellOne` pays full item `v`). (3) Whether a locally-earned signed-out save is trusted on first sync — one question behind both the muster solo band and the P3 solo-raid claim.
**WHAT MUST NOT BE CHANGED:** `allXP` is at **+52%** against a 0.60 fuse — **no system in either pillar may add a new `allXP` source or raise an existing one.** `clan-overhaul.md` §8.3 says +47%; it omits the homestead property capstone. The Hunt-forged kit has **no boots** on purpose. Phase-B spoil routes must never render as actionable.
**WHAT SHOULD BE TESTED:** the new derived assertion in the b223 Hunt-kit block pins each Hunt-forged recipe strictly above its Dawnsteel rung, read live from the recipe table rather than hardcoded — a `lvOff` change in `gear-tiers.js` moves both sides together.

### 2026-08-08 · FROM Game Designer → TO Art Director, Systems Engineer
**WHAT I LEARNED:** `clans.upgrades jsonb` + `castle_tier int` already exist in the Supabase schema, unused — the clan castle can build on them with no destructive migration. Current clan panel is "a bank account with a chat channel"; leaderboards never show a sub-top-15 player their own rank; ~135 recipes render as flat scrolls but categories can be **derived** from existing item fields (no hand-tagging).
**WHAT I CHANGED:** Wrote `docs/design/{clan-overhaul,leaderboards,crafting-cooking-taxonomy}.md` (commit `4d54eb3`). No game code.
**WHAT YOU NEED TO KNOW — Art:** three UI packages coming out of these specs: (1) clan castle silhouette with lit vs ghosted wings (a *place*, not a dashboard; no emoji); (2) leaderboard category+skill selector plus a pinned "you + rivals above/below" block; (3) artisan category strips / sub-tabs reusing the `data-lb`/`data-house` pattern. **Systems:** four items filed in `CONFLICTS.md` (perk-stacking cap, `raidPower` key, auto-eat foodClass filter, `snapshot.renown`).
**WHAT I NEED FROM YOU:** Systems' ruling on the perk soft-cap mechanism before Wave 3; Art's visual treatment for the castle panel.
**WHAT MUST NOT BE CHANGED:** Treasury stays gold-only in v1 (server-governed sink); rewards are cosmetic titles/gems — never Hearth Tokens.
**WHAT SHOULD BE TESTED:** n/a (docs only).

### 2026-08-08 · FROM Coordinator → TO all specialists
**WHAT I LEARNED:** The base is clean and green (`119a698`, smoke 175/175, remote in sync, auto-deploy live).
**WHAT I CHANGED:** Established the coordination system (`.claude/coordination/**`), five agent definitions (`.claude/agents/*.md`), and team commands (`.claude/commands/*`). Committed + pushed the asset/doc cleanup.
**WHAT YOU NEED TO KNOW:** Read `PROFESSIONAL_STANDARD.md` and your own `agents/<you>.md` log before starting. Ground truth is in `CURRENT_STATE.md` and `DISCOVERIES.md`. Claim shared surfaces in `ACTIVE_WORK.md` before touching them.
**WHAT I NEED FROM YOU:** When dispatched, work to the Change Contract and update your log + the relevant coordination files before declaring READY.
**WHAT MUST NOT BE CHANGED:** The regression tripwires in `DISCOVERIES.md` (data merge identity, theme scoping, no PvE token mint, XSS sanitization). Keep guard tests green.
**WHAT SHOULD BE TESTED:** `node tests/run-smoke.mjs` (175/175) after any change; plus your domain-specific verification.

---

_(New handoffs below, newest first.)_

### 2026-08-09 · FROM Systems Engineer → TO Game Designer, QA, Art Director  (b227, branch `agent-presence`)

WHAT I LEARNED:
- **Blessings DID apply to offline output, in full, on every catch-up.** `world-events.js` wraps
  `window.getBonus` additively and `processOffline()` replays through the same `addXp` /
  `doSkillAction` / `doArtisanAction` / `applyGoldFind` the live loop uses. This was true from b204.
- **`isPresent()` is TRUE during an offline catch-up.** `processOffline()` runs inside `loadLocal()`,
  on a visible tab, with the input timestamp freshly initialised and an activity set. A gate written
  as "blessings apply while `isPresent()`" reproduces the leak exactly. b226's own flat ×1.12 leaked
  into offline grants for this reason. **Anyone gating anything on presence must also check the
  replay latch.**
- **Speed bonuses were baked, not read.** `G.skillMs` was computed once at start and the offline
  replay divided elapsed time by it, so a blessed session carried blessed speed into the night.
- **`getBonus('rareDrop')` has no consumer.** `rareDrop` exists only as an equipment/pet ITEM stat.
- **The Home offline welcome-back line is invisible.** `#dash-active` is `display:none` since the
  b219 Home rewrite, so b225's burn count, b226's budget readout and b227's rate note all render
  into a hidden panel. The only surface a player sees is the `processOffline()` toast.

WHAT I CHANGED:
- Flat presence ×1.12 REMOVED (`addXp`, `actionRate`, `HearthrisePresence.MULT/.mult` all gone).
- `blessingsApply() = !inOfflineReplay() && isPresent()` — the detector stays, now as the gate.
- `withOfflineReplay()` latch wraps the whole of `processOffline()`.
- ONE `activityIntervalMs()` read by `startSkill` / `startArtisan` / a new per-action
  `retimeActivity()` / the offline replay. De-duplicated the artisan timer arming (it existed twice).
- Pools: 9 daily × 6 weekly, ten wired keys; new goldFind + noBurn families; Grand Fair 10% → 12%.
  Dead emoji `glyph:` field removed from the data; `EVENT_GLYPH` exported so Home and Events share it.
- Honesty copy on the activity note, Home "The realm", the Events blessing card, and the offline toast.
- `docs/design/pacing-overhaul.md` Appendix A rewritten + new A.8.

WHAT YOU NEED TO KNOW:
- **Designer:** the day model is now **14.5 eff-h/day** (was 14.8) and the unboosted first-99 floor
  moves **56.0 → 57.2 days**. Online value is now a *variable*: A.2b tables the range (14.5 → 16.2
  eff-h/day depending on the week). Whole-calendar expected value ≈ **+1.7% on the day**, so the
  blessing's real contribution SHRANK ~5.8× even at unchanged magnitudes — there is room here, and
  A.8.4 states the worst-case overlap (+27% allXP, 2.5h, one day in 54) against §8.4's budget.
- **QA:** the harness seam is `HearthriseWorldEvents._force({daily, weekly})` (+ `E.QUIET`, a
  grants-nothing control). Pin a blessing rather than asserting against the wall clock. Presence is
  driven with `HearthrisePresence._setLastInput()` and `_withOfflineReplay()`.
- **Art:** the blessing card and the Home "The realm" panel both carry a live/idle state now — the
  pills dim to .55 and the note changes wording when the gate closes.

WHAT I NEED FROM YOU:
- **Designer:** ratify the pool magnitudes in A.8.3/A.8.4 and the recomputed floor. If you want the
  online bonus to *feel* bigger than +1.7%/day, the lever is pool magnitudes, not a new multiplier.
- **QA:** an independent pass on the offline gate. My proof is two regression tests plus a runtime
  mutation (removing the latch in the browser turned a 3h absence from 11,250 XP into 36,000).

WHAT MUST NOT BE CHANGED:
- The replay latch, and the rule that EVERY new elapsed-time simulator runs inside
  `withOfflineReplay()`. This is the b214 double-pay class of bug wearing a different hat.
- `HearthriseWorldEvents` stays the load-bearing clock utility raids/rally read — extended, never
  renamed or restructured. Rally / join-gated live events: untouched by this change.
- Pool entries may only name a key with a proven consumer; a test asserts it.

WHAT SHOULD BE TESTED:
- A real overnight absence on a save whose activity was started under a speed blessing.
- Combat offline (`processOfflineCombat`) under a goldFind blessing — gold must not move.
- The daily UTC rollover with an activity running (the retimer should pick up the new blessing).

