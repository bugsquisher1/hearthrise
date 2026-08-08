# Systems Engineer — running log

_Your private journal. Newest at top. Team-wide items also go to `DISCOVERIES.md` / `HANDOFFS.md`._

## Standing knowledge
- Content authored ONCE in `src/data/*`; `main.js` identity-merges ESM into `window.__LEGACY_INLINE`. Never reintroduce the data double-copy (top-level `const` shadowing). Guard test asserts identity.
- Theme: `:root` = dark tokens; `body[data-theme="cozy-light"]` for retired light. Guard tests fail if unscoped patterns return. When a visual bug recurs, find what re-asserts it — don't stack overrides.
- Economy server-authoritative (Supabase, `schema.sql` applied); no PvE Hearth Token mint; race-safe market + seller ledger.
- Save: `snapshotG` = manual 24-field allowlist (fragile); new state must survive save/load.
- Don't rewrite working architecture without strong evidence. Think at 10× content.

## Standing debt (b214 audit, grade C−)
`showTab` wrapped 23×; `wrapShowTab`/`HearthriseIdentity` built, 0 consumers; 27 files use `localStorage` directly vs 3 on the seam; ~3,000 lines inert cozy-light CSS deletable; gear wield/level-requirement seam unbuilt.

## Log
### 2026-08-08 · bootstrap
Domain seeded. No active task. Base green at `119a698`.
