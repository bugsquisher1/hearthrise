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

### 2026-08-08 · FROM Art Director → TO clan-seat agent, presence agent, quest-nav agent, stable agent, combat agent, Systems
**WHAT I LEARNED:** Tyler said "text is too small" for the **third** time, and the measurement finally explained why the first two answers failed. b218 multiplied the ramp; b225 set a 13.5px floor. A full computed-size sweep of 19 surfaces then showed **1,093 of 2,112 visible elements (51.8%) sitting at EXACTLY 13.5px** — when half the game stands on the floor, *the floor value IS the reading experience*, and a floor set to "minimum acceptable" reads as "everything is minimum acceptable". A floor is not a safety net once the whole game is resting on it; it has to be a comfortable size.
Second thing learned, the hard way: **`--ui-scale` declared in the shared `:root, body[data-theme=...]` block was completely inert.** The copy on `<body>` re-declared it one level under `<html>` and swallowed the dial's inline value. Measured: the first cut moved **0 of 1,694** rendered elements. Any variable a script sets on `documentElement` must be declared on `:root` ALONE.
Third: hundreds of rules carry `transition: all .15s`, so a computed font-size read immediately after a token changes returns the **old** value. Four elements read as "the dial doesn't reach them" until the probe waited 450ms.
**WHAT I CHANGED (b227):** floor 13.5 → **14.5**, every ramp step +1 (`--t-small` 15→16, `--t-body` 16→17, `--t-lead` 17.5→18.5, h-tiers +1), separations unchanged. **877 font-size declarations** rewritten across five sheets and 25 JS modules into the mandatory form `calc(<n>px * var(--ui-scale, 1))`, plus 4 `font:` shorthands expanded to longhands. Wired **Settings › Display › UI scale** for real (90–130%, 5% steps, live preview) — it was a 6-option select with no consumer anywhere (click-through audit finding #2). Guards 19a–19e in `smoke-test.js`; smoke **333/333**.
**WHAT YOU NEED TO KNOW — the rule that is now enforced:** a bare `font-size: 14px` anywhere in `legacy/art-direction/audit-overrides/theme-cozy/board-and-shop.css` **fails guard 19d**. Write `font-size: calc(14.5px * var(--ui-scale, 1))` or a `--t-*` token. The `, 1` fallback matters: injected `<style>` blocks and the account wall paint before `art-direction.css` is guaranteed applied, and an unresolved `var()` invalidates the whole declaration. Never use the `font:` shorthand for a size — its `<font-size>` slot cannot carry the calc, and it silently resets every `font-*` longhand around it. That shorthand has now cost two type passes their stragglers.
**WHAT I NEED FROM YOU — the sweep I could not run, because you are holding the file.** Rule: every px value gets **+1** (values above 32px keep their number), the result is floored at **14.5**, and it is wrapped in `calc(<n>px * var(--ui-scale, 1))`. Until these land, 58 rendered elements stay below the floor and are listed as exemptions in `TYPE_PENDING_HANDOFF` (smoke-test.js) — **delete your entry when you land yours.**

| File | Owner | Declarations | Sub-floor after b227 | Rendered elements still small |
|---|---|---|---|---|
| `src/features/home-dashboard.js` | presence / quest-nav | 25 (`13.5`×17, `15`×2, `15.5`×2, `17`, `22`, `23`, `31`) + 1 `font:700 13.5px/1` | 17 | **50** — the whole Home screen, the first thing Tyler sees |
| `src/styles/clan-seat.css` | clan-seat agent | 27 (`13.5`×23, `19`×2, `20`, `23`) | 23 | 2 (`.clan-empty`, `.soc-signpost-txt`) |
| `src/features/companions.js` | stable agent | 4 (`13.5`×3, `15`) | 3 | 2 |
| `src/features/world-events.js` | presence agent | 2 (`13.5`×2, inline `style=`) | 2 | 4 |
| `src/features/combat-render.js` | combat agent | 1 (`24px`) | 0 | 0 (dial reach only) |

**Home dashboard is the priority.** It is the landing screen and it accounts for 50 of the 58. Everything else is a handful of labels.
**WHAT MUST NOT BE CHANGED:** `--ui-scale` must stay in its own `:root { --ui-scale: 1 }` rule in `art-direction.css` — moving it back into the shared `:root, body[data-theme="hearthlight"]` block silently kills the dial with no test failure except 19e. The 130% ceiling is measured, not chosen: it is the largest value at which **zero** text is cut anywhere in the game. `--nav-w` scales with the dial (the rail holds nothing but text); the 64px icon rail deliberately does not.
**WHAT SHOULD BE TESTED:** re-run `node tests/run-smoke.mjs` after your sweep and confirm the pending count in 19c's message drops. Verify visually at 90% and 130%, not just 100% — that is where geometry fallout shows.

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
