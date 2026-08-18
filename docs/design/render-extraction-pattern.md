# Render-layer extraction pattern

_The playbook for strangler-figging the render/UI layer out of `src/legacy.js`
into `src/render/*`. Established 2026-08-18 with the first extraction
(`src/render/lifetime-stats.js`). Every subsequent extraction follows this so the
work is mechanical and low-risk. This is task #129, Phase 3.5._

## Why this track exists

`src/legacy.js` is ~18.8k lines and is now **mostly UI wiring + presentation glue**
(146 `innerHTML`, 199 `getElementById`). The data and logic have already
strangler-figged out into `src/core/*` (pure, dual-runtime) and `src/data/*`. The
render layer scored ~20% against the four-layer target (CLAUDE.md "Architecture
direction") and is the biggest remaining structural liability — it is also the
source of the recurring visual-gate breaks (b361), because presentation logic that
lives tangled in a monolith is impossible to review in isolation.

The audit ruling on extraction ORDER: **UI-render helpers → `src/render/*` FIRST,
then the tab/screen controllers, leaving data/logic (already out) last.**

## The one hard rule

**A render extraction is a PURE refactor. Behavior AND appearance are IDENTICAL.**
No new features, no redesign, no "while I'm here" cleanups that change a pixel.
The DOM output is byte-for-byte the same; every event wiring is preserved. If the
extraction cannot be done without changing behavior, it is the WRONG extraction —
stop and report the coupling rather than force it.

## 1 — Choosing a domain

Pick a **self-contained, medium-complexity render surface** — a single
panel/screen's render plus its small private helpers. Not the hardest tangled one,
not a trivial 20-liner.

Good candidates share these traits:

- **Read-mostly.** It reads `G`/derived getters and paints; it does NOT write
  authoritative game state (gold, inventory, XP). A read-only surface has a blast
  radius of one dialog and cannot corrupt the economy or the save. (The first
  extraction, Lifetime Stats, writes nothing.)
- **Few private helpers, all exclusive.** Helpers used ONLY by this surface move
  with it. Helpers shared with other code stay put and are read via `window.*`.
- **Its entry point is the coupling surface.** Map every caller before you move
  it (`Grep` the whole `src/` tree). Inline `onclick="fooBar()"` handlers in
  legacy.js template strings require the function to stay a **global** — so the
  module must re-export it onto `window`.
- **CSS already tokenised, or convertible without appearance change.** Check the
  selectors in `src/styles/*.css`. If the surface bakes hardcoded theme colours,
  convert them to tokens as part of the extraction (see §4).

State clearly WHICH domain and WHY (dependencies, coupling, blast radius) before
touching code.

## 2 — The module shape

Create `src/render/<domain>.js` as a **classic-script IIFE** — the same shape as
`src/features/*` (e.g. `death-sheet.js`), NOT an ESM module. The render features in
this codebase load via `<script src>` tags in `index.html`, not through the
`main.js`/`core-bridge.js` module graph. Match that convention.

```js
// src/render/<domain>.js — <one-line what-this-is> (render layer)
// FIRST/Nth render-layer strangler-fig extraction out of src/legacy.js.
// PURE REFACTOR — identical DOM + behaviour to legacy.js <fn names>.
(function () {
  'use strict';

  // private helpers that were exclusive to this surface move here verbatim

  function render<Domain>() {
    // globals resolved at CALL time via window.*, so load order is free
    var G = window.G || {};
    var balText = window.balText || function () { return '0'; };
    // ... build innerHTML, wire events ...
  }
  window.render<Domain> = render<Domain>;   // only if an inline handler needs it

  // self-install triggers / ESC / showTab re-wraps that lived beside the fn
})();
```

Rules:

- **Resolve globals at call time via `window.*`** (`window.G`, `window.balText`,
  `window.getCombatLevel`, `window.showTab`). Never capture them at module-eval
  time — that would reintroduce a load-order dependency. This is why the module can
  load in any order after legacy.js.
- **Re-export onto `window` ONLY what an external caller needs** (inline
  `onclick`, another module). Keep everything else module-private.
- **Move the whole neighbourhood.** The self-installing trigger button, the ESC
  `keydown` listener, the `showTab` re-wrap, the `console.log('… loaded')` — if it
  lived beside the render function and served only this surface, it moves too, so
  legacy.js loses the entire concern, not just the render call.

## 3 — Wiring into index.html

Add one `<script>` tag AFTER `src/legacy.js` (so its globals exist when the module
self-installs), carrying the current `?v=` — `bump-version.sh` maintains it in
lockstep with `index.html` and `build-info.js`. Group render extractions together
with a comment so the load section stays legible.

```html
<script src="src/render/<domain>.js?v=NNN"></script>
```

`?v=` discipline: this is a browser-loaded `src/**` file, so it MUST carry `?v=`
(unlike `supabase/functions/**` and `tests/**`, which carry none — b332).

## 4 — Colours move to tokens as you go

CLAUDE.md hard rule: **no hardcoded colours — every colour from a CSS token.** When
you extract a surface:

- If its inline styles/CSS bake hex or named theme colours, convert them to the
  `var(--token)` for that role (defined per theme in `theme-cozy.css` /
  `legacy.css`). `cozy-light` must look UNCHANGED; Hearthlight must resolve dark
  via the tokens.
- If the CSS is ALREADY tokenised (as Lifetime Stats' `.stats-*` selectors were —
  `var(--gold-2)`, `var(--ink)`, `var(--line-soft)`, plus theme-neutral
  `rgba(255,255,255,.04)` overlays), there is nothing to convert; say so.
- **Do NOT change appearance to "fix" pre-existing debt** (emoji-as-glyph, scoped
  `data-theme=lane1/dark` hex overrides). That is a separate, appearance-changing
  job — log it as standing debt; a pure refactor leaves it pixel-identical.
- Keeping the CSS in `src/styles/*.css` (rather than inlining a `<style>` in the
  module) is fine and lower-risk when other theme-lane selectors reference the same
  classes — moving it would fragment specificity. Colocate CSS in the module only
  when the surface fully owns its selectors.

## 5 — Test + visual gate

- **Add/extend a smoke test** (`src/features/smoke-test.js`) that opens the
  extracted surface via its entry point and asserts it renders the expected content
  and its interactions still work (e.g. ESC closes it). Behavior-identical is the
  contract; the test encodes it. See `render: lifetime stats modal (extracted
  surface)`.
- `node tests/run-smoke.mjs` must be FULLY green, plus the b305 save battery and
  every existing guard.
- **RELEASE VISUAL GATE (non-negotiable).** Because appearance-identical cannot be
  proven by the smoke suite, the Coordinator/Art Director boots the assembled
  release and reads screenshots of the extracted screen + combat + inventory at
  desktop (1440×900) AND landscape phone (922×423), in BOTH cozy-light and
  Hearthlight, and confirms they are identical to pre-extraction. Screenshots exist
  before the push.

## 6 — Report

State: which domain + why, the new module + how it bridges, colours moved to
tokens (or "already tokenised"), files changed, line-count moved out of legacy.js,
and confirmation smoke is green + behavior/appearance identical. Log the extraction
and any coupling discovered for the next one.

---

### Extraction log

| # | Domain | Module | Lines out of legacy.js | Notes |
|---|--------|--------|------------------------|-------|
| 1 | Lifetime Stats modal | `src/render/lifetime-stats.js` | ~155 (`_fmtTime` + `openLifetimeStats` + `addStatsTrigger` + ESC) | Read-only; CSS already tokenised; re-exports `window.openLifetimeStats` for inline `onclick` callers (profile toolbar + trigger button). |
| 2 | Active Effects panel (Profile card) | `src/render/active-effects.js` | ~165 (legacy.js block 8: `injectActiveEffectsCard` + `_formatBuffKindLabel` + `renderActiveEffects` + 1s live timer + `renderProfile` re-wrap + initial paint) | Read-only; writes nothing; whole block moved. No hardcoded colours in the JS (emoji glyphs pre-existing, `.eff-*` CSS untouched). Re-exports `window.renderActiveEffects` for callers (buff/gold paths in legacy.js, admin.js, item-ux.js). Reads `window.getBonus`/`pruneBuffs`/`BUFFS_DEF` at call time. **Coupling noted for #3:** the Companions/Stable panel (legacy.js block 32) is DUPLICATED by `src/features/companions.js` — do NOT pick it next without resolving the double-render first. |
