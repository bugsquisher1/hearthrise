# Client architecture and machinery audit — 2026-11-19 (systems-engineer, read-only)

Base: claude/nice-einstein-6h7s9n (= set/v0.2.142 + the settle fix). The client's runtime is at a studio bar; its delivery and the release gate are not.

## Top 10

| # | Change | Why | Evidence | Effort | Files |
|---|---|---|---|---|---|
| 1 | Minify each module at publish | 57% less script, loading and tests unchanged | 570 game modules: 2,203 KB gzip, 45% of raw bytes are comments; 893 KB minified per file | S | `tools/lib/version-stamp.mjs` (`stampFile`), `tools/build-site.mjs`, `pages.yml`, `package.json` |
| 2 | Give the mutant gate a real base on a retry | A retry after a main-first fix runs the full sweep on an empty diff | Gate log "main already holds this commit … fail safe" on 2 of 3 release runs read; about 2,040 job-minutes a run | S | `tools/mutant-gate.mjs`, `tools/lib/ci-history.mjs` |
| 3 | Ratchet the player's boot path | Nothing watches it | 346 modules on 10-31, 616 scripts at sign-in now (+78% in 19 days) | S | `tools/build-site.mjs` (new SITE rule + baseline) |
| 4 | Self-host the fonts | Render-blocking third-party stylesheet; fails offline or in a Steam wrapper | Google Fonts link in both pages, 0 `@font-face` | S | `play.html`, `index.html`, `src/styles/tokens.css`, `assets/fonts/` |
| 5 | Bundle the game half at publish | About 616 requests to about 10; return visits stop revalidating about 650 URLs | 694 KB gzip as one bundle; live is `max-age=600` with no service worker | M | `tools/build-site.mjs`, `src/app/boot.js`, `src/app/game-half.js` |
| 6 | Take mutation sweeps off the release path | Most of the gate; the nightly already runs them | At least 56% of step-minutes; 18 of 73 releases green first run; 1.89 runs x 65 min per release | M | `.github/workflows/smoke.yml` (changes §3.6, needs Tyler) |
| 7 | Split Hunt screen as Alpha windows was | Next-largest suite | 245 job-minutes, 12 shards | M | `tests/hunt-screen.mjs` |
| 8 | Generate `smoke.yml` from guard headers | Most-contended code file | 8,313 lines, 32 touches, 56,689 changed lines in 3 weeks | M | `tests/ci-shape.mjs`, `.github/workflows/smoke.yml` |
| 9 | Load ground packs on need | Boot data grows with every ground | 9 packs, 288 KB, all eager, 2 not open | M | `src/data/grounds/index.js`; the 10 data-to-core breaches in `tests/layering.baseline.json` first |
| 10 | Baseline the migration chain at the EA wipe | The replay cannot shrink before then | 810 files, 34 MB; `chain-retire --list` finds 0 candidates, 160 files kept because code names them | L | `supabase/migrations/`, `tools/chain-retire.mjs` |

## Measured (one run per profile, local world on loopback, headless Chromium, 0 console errors)

| | Desktop 1280x720 | Phone 844x390, CPU 4x |
|---|---|---|
| Reload to HUD | 1.5 s | 3.2 s |
| Reload to world painted | 1.6 s | 3.6 s |
| Frame rate, town and Mill Cellar | 60 fps | 59 fps |
| Window open | 115-179 ms | 414-628 ms |
| Heap in a hunt | 23 MB | 22 MB |

- Delivery: 631 requests to the sign-in screen, 700 on a reload; live is HTTP/2 with gzip.
- CI: two green release runs at 2,047 and 2,038 job-minutes, 65 min wall; nightly 8 green of the last 20.

**Derived:** first visit about 2.6 MB before sign-in and 4.3 MB to the first town; one browser mutant about 83 s; a release about two hours of gate.

**Assumed, not verified:** transfer time on a real phone line; a real device, and a party of four on a late ground; how many product bugs the mutation proofs have caught; the engine risks at population (a world-shape change restarts every running hunt; stale tabs mispredict after an edge deploy); the bundled and minified builds were sized, not run.

**Caveats:** `local-world` needs Node 23.6+ (`/opt/node24` used). The 11-18 audit's items 8, 9 and 11 were not read. No disagreement with planned work; one caution: the alpha split's "617 to 93" holds only when the gate narrows, which it did not on the runs read.
