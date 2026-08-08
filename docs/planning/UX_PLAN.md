# Hearthrise — Mobile UX Plan (b113 → b116)

How we get from "playable in both orientations" to "premium in both orientations" without breaking what works.

This document captures the design thinking explicitly so we don't drift, and so each push has a clear verification gate before the next one starts.

---

## Design principles (the constraints we don't violate)

1. **Don't force orientation.** Most phone users are reflexively in portrait. Forcing landscape annoys ~60-70% of players. Both orientations must feel intentional.
2. **Don't break the desktop layout.** All mobile rules live behind media queries; desktop is untouched.
3. **Each push is verifiable.** No giant rewrites. Each push has a clear "did it work?" test on a real phone before we move on.
4. **Senior-quality discipline.** When in doubt, do less per push and verify more.

---

## Portrait phone (≤540px wide)

**Where we are after b110-b112:** ✅ Solid baseline.

- Top: topbar (60px) + activity bar (~30px)
- Middle: panel with sub-tab strip (~56px) + content scrolling vertically
- Bottom: 6-button bottom nav (~60px including safe-area)
- No floating chat pill (chat in More menu)

**What's good:** dense lists, sub-tab nav inside Combat/Inventory/Skills, 5-col bag grid, hand-painted icons.

**Open polish (low priority):** house/bounty/market dense rows (was originally in the b112 plan but punted to focus on landscape).

---

## Landscape phone (~800-900px wide × 380-440px tall)

**Where we are after b113:** ⚠️ Functional but cramped.

The current b113 patch makes the portrait mobile rules fire in landscape too, plus a "compact chrome" block that shrinks the topbar / nav / sub-tabs. The result works but the chrome eats ~30% of the precious vertical space because horizontal-bottom-nav and horizontal-sub-tab are the wrong ergonomics for landscape.

**The real answer:** restructure for landscape, don't shrink for it.

```
┌─────────────────────────────────────────────────────────┐
│ [Topbar — slim 32px: stats only]                        │
├─────┬───────────────────────────────────────────────────┤
│ 👤  │                                                   │
│ ⚔️  │  [Sub-tab strip — slim 32px]                     │
│ 🎯  │  ┌───────────────────────────────────────────┐    │
│ ⛏️  │  │                                           │    │
│ 🎒  │  │  [Content — full remaining height]         │    │
│ 🏠  │  │                                           │    │
│ ⋯   │  │  Two-column where appropriate              │    │
│     │  │                                           │    │
│     │  └───────────────────────────────────────────┘    │
└─────┴───────────────────────────────────────────────────┘
  ↑
  Side rail (60px wide)
  Vertical icon column
  Replaces bottom nav in landscape
```

Content gets ~310px vertical × ~720px horizontal. That's enough for two-column layouts (monster list + arena, bag + paper-doll, recipes + materials).

---

## Push plan with verification gates

### b113 — landscape baseline + this plan (✅ this push)

**Scope:**
- All `@media (max-width: 540px)` rules now also fire in landscape phones (`max-height: 540px and max-width: 900px`)
- Add landscape-specific "compact chrome" block (smaller topbar / nav / sub-tabs in landscape)
- Ship `UX_PLAN.md` (this doc)

**Verification gate:**
- Tyler tests on real phone, both portrait and landscape
- Pass: both orientations are navigable, no broken layout
- Fail: hotfix before b114

**Status:** in progress, ready to ship.

### b114 — landscape side-rail nav

**Scope:**
- In landscape only: bottom nav becomes a **left side rail** (vertical column of nav icons)
- Topbar shrinks to 32px slim strip with just the stats
- Activity bar moves into the right edge as a slim vertical strip OR stays at top
- Sub-tab strips compress to 32px height in landscape

**No DOM changes** — same buttons, just rotated layout via CSS. Lower risk.

**Verification gate:**
- iframe test at 800×380 — should look like the diagram above
- Tyler tests on real phone in landscape — content area should now be ~70% of screen, not 50%
- Pass: real phone landscape feels spacious, not cramped
- Fail: hotfix before b115

### b115 — landscape-aware content layouts

**Scope:** use the new horizontal real estate intentionally.

- **Combat in landscape:** monster picker left half, arena right half. Sub-tab strip becomes redundant for these two — keep it for Style which is one-time setup. Player can fight while browsing foes.
- **Inventory in landscape:** bag grid left, paper-doll right. Sub-tab strip becomes redundant — show both side-by-side.
- **Activities in landscape:** skill strip stays horizontal, but skill detail can use 2-column (e.g. nodes left, current XP/rates right).
- **House / Farm / Profile:** content in 2-column where reasonable.

**Verification gate:**
- iframe test at 800×380 confirms both orientations work cleanly
- Tyler tests both orientations on real phone, walks every tab
- Pass: both feel premium, neither is afterthought-y
- Fail: hotfix before b116

### b116 — final polish + ship to friends

**Scope:** whatever surfaces from b115's verification.

- Fix specific bugs Tyler / iframe testing finds.
- Add an in-game "Install on Home Screen" hint that nudges users to PWA-install.
- Confirm PWA flow works on real phone after the b111 SW fix.
- Send the URL to 2-3 friends with a beta invite code.

**This is the gate to public-ish beta.** No more structural changes after this until we have real feedback.

---

## What NOT to do (avoiding senior-anti-patterns)

- ❌ One giant landscape rewrite shipped without verification gates
- ❌ Force orientation to avoid solving the harder problem
- ❌ Add a "rotate your phone" overlay as the only landscape support — that's giving up
- ❌ Ship landscape changes that break portrait or desktop
- ❌ Skip the iframe-test or real-phone-test gates between pushes

---

## Verification quick reference

For each push, three checks:

1. **Desktop unchanged:** open the live site at >900px wide. Looks identical to before. (Browser DevTools responsive mode or just resize.)
2. **Portrait phone:** iframe at 380×780. Walk every tab. No regressions.
3. **Landscape phone:** iframe at 820×400. Walk every tab. No regressions.

If any of those three fails after a push, hotfix before continuing.

---

Last updated: build 113.
