# Art Director — running log (worktree branch copy)

_Coordinator: please fold this entry into the shared `.claude/coordination/agents/art-director.md`._

## Log
### 2026-08-08 · Wave 0 — type scale (#1) + brand wordmark (#2)
**#1 Text too small.** Root cause: ~700 font-size declarations hardcoded in px across `legacy.css` / `audit-overrides.css` / `art-direction.css` (base body was 14px), so a token-only bump would leave row titles/nav/chrome behind and break hierarchy. Fix: uniform proportional scale (~x1.13, rounded to 0.5px) applied mechanically to all reading/UI text in the 7-26px range across the three sheets (hero/celebration display >26px left alone), plus the 8-step `--t-*` token ramp raised to match (body 14->16). Ramp ratios preserved, so hierarchy is unchanged — only the base grew.

**#2 Logo.** The old mark was a light-background crest asset (`assets/brand/hearthrise-logo.svg`) whose dark-brown wordmark sat at near-zero contrast on the near-black hearthlight sidebar — that is why it "looked bad." Replaced the `<img>` with a real game-logo lockup: a compact inline-SVG rising-sun/hearth shield emblem drawn to read on dark, above "HEARTHRISE" in gilt Cinzel caps (ember->struck-gold gradient via background-clip, ember glow + dark contact edge) with a tracked "IDLE HOMESTEAD" SC tagline, on an incised rule. Vertical/centred because the sidebar is only 180px (a horizontal lockup clipped to "HEARTH"). Collapses to emblem-only in the <=1180px icon-rail. SVG file kept for the favicon.

**Verified:** preview on :8131, hearthlight. Screens inspected at desktop: home, character, inventory (+ overflow check: no document/button overflow), skills — all clearly legible, hierarchy intact. Smoke 175/175, 0 runtime errors; `bump-version.sh --check` OK.

**Limitation:** this browser env pins innerWidth at 1745px; `resize_window` had no effect, so mobile-landscape + icon-rail could not be screenshotted. Scaling was applied uniformly inside the mobile media queries so the ramp holds there, but QA should confirm on a real narrow viewport.

**Asset Director brief (non-blocking):** a bespoke drawn wordmark could beat pure type later — see change-contract brief.

**Also spotted (not mine to fix):** a beta-notice / welcome modal renders literal emoji (🌱, 🐛) in its copy — violates the 0-emoji-as-art rule. Owner is content/onboarding (Systems). Flagging for the Coordinator.
