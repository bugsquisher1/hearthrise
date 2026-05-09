# Hearthrise — Beta Prep Audit (b143 baseline)

> Code-only audit of the cloud / observability / PWA paths. No real
> accounts created. Compiled from reading auth.js, sync.js,
> supabase-bootstrap.js, observability.js, ftue.js, beta-banner.js,
> and the PWA blob-url scaffolding in legacy.js.

## P0 — Crash reporting is silent

- **Sentry DSN is `null`** in `src/observability.js` `DEFAULTS.sentryDsn`. If you don't paste a real DSN before launch, **every crash during the beta is lost** — we can't see what testers are hitting.
- **Fix:** get a free Sentry account, copy your project DSN (looks like `https://abc123@o123456.ingest.sentry.io/789`), and update DEFAULTS in `src/observability.js`. Or set `window.HEARTHRISE_OBSERVABILITY = {sentryDsn: '...'}` before observability.js loads.
- **Effort:** 5 min once you have the DSN.

## P1 — Stale release tag + dev environment

- In `observability.js` DEFAULTS: `release: 'hearthrise@0.4.0'` and `environment: 'dev'`. Should be `'hearthrise@0.9.1-beta'` and `'beta'`.
- I'm shipping a fix in b144 that pulls the release version dynamically from `BUILD.version` so this stays in sync forever.

## P1 — Cloud auth depends on Skypack CDN

- `auth.js` does `await import('https://cdn.skypack.dev/@supabase/supabase-js')` — dynamic ESM import from skypack.dev.
- During my earlier audit I saw this request stuck in "pending" status. If Skypack is slow or down on launch day, **signup is broken globally** for the beta cohort.
- **Mitigation options (post-beta):** bundle supabase-js into the deploy, or pin to a specific Skypack revision URL with explicit cache headers. Too risky to change pre-launch — flagging only.

## P1 — Default Supabase config is hardcoded

- `supabase-bootstrap.js` has a real URL + anon key baked in (`nezapsylztqbbwuwembx.supabase.co`). That's intentional and correct (anon keys are public).
- **You need to verify** in your Supabase dashboard:
  - Row-Level Security is enabled on every table players write to (`game_events`, `profiles`, `market_listings`, etc.). If RLS is OFF anywhere, beta testers can write each other's rows.
  - Email signup is enabled in Supabase Auth → Providers
  - Email confirmation is configured (you probably want it OFF for beta testers — easier signup) or you have an email sender wired up

## P1 — PWA manifest + service worker are blob-url generated at runtime

- `legacy.js` line ~2273 creates a `Blob` of the manifest JSON, then `URL.createObjectURL()` and injects a `<link rel="manifest">`.
- Same pattern for the service worker at line 2389.
- **iOS Safari is finicky** about blob-url manifests for "Add to Home Screen." The PWA install may work on Chrome desktop and Android but fail on iOS.
- **Mitigation:** ship a real `manifest.webmanifest` file at the repo root + a real `sw.js` file. Both can stay generated for now if you want to ship to web first and hold mobile-PWA for v0.9.2.
- **Recommend:** for Friday beta, label the game as "best on Chrome desktop or any phone browser." Leave the install-PWA story as a stretch.

## P2 — Analytics endpoint is null

- `analyticsEndpoint: null` in observability.js DEFAULTS. Events buffer to localStorage but never POST anywhere.
- For beta-week, that's fine — buffer limits at 500 events and rotates. After beta, point this at a Supabase RPC or a sink.

## ✅ What's working

- **FTUE flow** runs cleanly end-to-end (verified live walkthrough, all 6 steps, sidebar highlighting, completion flag persists).
- **Beta banner** correctly defers while FTUE pending, shows on the second load, persists ack flag.
- **Save migrations** (v3→v5) are in place with backup/rollback.
- **ITEMS divergence check** is firing on every boot, currently green.
- **Smoke test** at 120/120 (last verified).
- **Cloud sync** falls back to local buffer cleanly when offline.
- **Bug-report Discord webhook** is wired (last verified b117).

## Manual tests YOU need to do before launch

These need real accounts / real devices / your Supabase dashboard. They're cheap on time but I literally can't do them.

| # | Test | Where | How |
|---|---|---|---|
| 1 | RLS policies on every table | Supabase dashboard → Database → Policies | Each table that players write should have a policy like `auth.uid() = user_id` for inserts/updates |
| 2 | Email signup enabled | Supabase dashboard → Auth → Providers → Email | "Enable email signup" should be ON. "Confirm email" — flip OFF for easier beta. |
| 3 | Real signup → save → reload → sign back in | Live site, throwaway email | Create acc, get to TL 5+, sign out, close tab, sign in again, verify save state present |
| 4 | Cross-device save sync | Live site on phone + on desktop | Sign in same account on both; play on phone; verify desktop reload pulls phone's progress |
| 5 | PWA install — iPhone Safari | Live site on iPhone | Share button → "Add to Home Screen" — does it install? Open icon — does it launch fullscreen? Check log console for SW activation |
| 6 | PWA install — Android Chrome | Live site on Android | Three-dot menu → "Install app" — same checks |
| 7 | In-game bug-report → Discord | Live site | Click 🐞 button, fill out, submit; verify it appears in your Discord #bug-reports |
| 8 | Beta banner → Discord button | Live site, fresh state | Complete FTUE, reload, click "Join Discord" on banner; verify it goes to your real invite |

## Reminders

- Discord invite placeholder still says `https://discord.gg/your-invite-here` in TWO files: `src/beta-banner.js` and `src/settings-page.js`. Replace before launch.
- Sentry DSN paste in `src/observability.js` line ~33.
