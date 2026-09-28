# b559 visual gate — pass 2

Branch `qa/b559-visual-2`, cut from `origin/set/b559` at `a97ce24a98f54ea4047a388f383bd255c57cb289` (BUILD.cache 558). Captured headless with the sandboxed chromium (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) against a local static server over the repo root, `window.__HR_TEST_HARNESS__=true` set before load. **This sandbox cannot reach Supabase or Google Fonts** — every page shows the offline/signed-out state and the "realm is slow" banner as a result; that is expected here and not a finding about the build.

Before every capture: `localStorage['hearthrise:beta-ack']='1'` was set before load, the FTUE welcome card's **Not now** button was clicked (checked again after a 3s re-appear window), and any `[data-hr-dismiss]` sheet was closed via its own close control. `document.querySelectorAll('.hr-sheet.show, .modal.show, .ftue-root').length === 0` was confirmed before every shot except `settings` / `settings-scrolled` (the Settings `.modal.show` IS the subject) and `charm-moment` (its scrim carries neither class and is the subject).

## Files

### `settings-1280x800.png`, `settings-922x423.png`
`window.openSettings()`, Account section's `<summary>` clicked open.
- Section titles from `#settings-body .settings-section summary`, in order: **Audio, Display, Gameplay, Chat & Privacy, Account**. No "Data" section exists.
- Codex row present: `#set-open-codex` button found (rendered inside Gameplay as "Hearth Codex — what everything means → Open").
- Account section expanded (`<details open>`), signed-out card visible:
  - `.ss-card-title` = **"Signed out"**
  - `.ss-card-meta` = **"Signed out — nothing you do now is saved. Sign back in to keep playing."** (this is `HearthriseGate.SIGNED_OUT_COPY`, `src/net/account-gate.js`)
  - No offline/reconnect copy appears inside the card itself; the page-level "The realm is slow — actions may take a moment." banner (top bar) and the sidebar's "Reconnecting…" line are the sandbox's network-loss indicators, unrelated to this card.

### `settings-scrolled-922x423.png`
Same sheet, `.modal-card` (the real scroll container — `max-height:90vh;overflow:auto` in `legacy.css`; `#settings-body` itself just grows to its content height and is NOT the scrollable element) scrolled to `scrollTop = scrollHeight` (894 of 1273px, clientHeight 379px).
- Last section is still **Account** — its content runs past the signed-out card into "Cloud sync" status, a "Beta tester tools" card (Report bug / What's new / Discord) and the `Build v0.9.2-beta (b558)` line; all of that is Account section content, not a 6th section.
- **Observation, not a src/** change**: the modal header (title + Close button) is a normal flex child of `.modal-card`, not `position:sticky`, so scrolling the sheet to its bottom on a 922×423 viewport scrolls the Close button fully out of view (`closeBtnVisible: false` — the button's `getBoundingClientRect()` top is above 0). A player who scrolls down here has to scroll back up (or tap the scrim, if that closes it) to reach Close. Flagging for the Coordinator/Art Director to judge; no source file was touched.

### `fight-no-meter-1280x800.png`, `fight-no-meter-922x423.png`
`window.startCombat('slime')` then `window.showTab('profile')`→`window.showTab('combat')` is NOT needed — the Fight rail is reached via `showTab('combat')` alone (the combat screen mounts straight into the Fight view when `G.activeMonster` is already set). No server vigour meter in this harness.
- `#fs-manage .fsm-head` texts, in DOM order: **Vigour, Loadout (+0 atk · +0 str · +0 def), Provisions, Tonight, Charm & trophy, Drops this fight**.
- Per-block `hidden` / rendered height (1280×800): Vigour `hidden=true, height=0` · Loadout `hidden=false, height=385` · Provisions `hidden=false, height=89` · Tonight `hidden=true, height=0` · Charm & trophy `hidden=true, height=0` · Drops this fight `hidden=false, height=88`. (922×423: same hidden pattern, heights 293/77/74.)
- Net effect: the DOM still carries the Vigour and Tonight headers (so a text-only grep would find them), but both blocks are `hidden` with `height:0`, so nothing bare renders above Loadout — confirmed visually in the PNG, which opens on **LOADOUT** first. This is the b557 vigour-block-hidden fix (this branch's head is the merge of `lane/vigour-block-hidden` into `set/b559`) verified live.

### `fight-with-meter-1280x800.png`, `fight-with-meter-922x423.png`
Same combat state, then the harness seam used by `tests/reachability.mjs`'s `DRY_VIGOUR` fixture (adapted with `remaining_min: 300` instead of `0`, so the meter is NOT dry): `window.HearthriseAccrual.hydrateHunt(window.G, { vigour: {...} })` followed by `window.HearthriseVigourMount.paint()` — no raw `G` write.
- `#fsm-vigour` block: `hidden=false`.
- `#fs-vigour` renders: **"VIGOUR / 420 / 720 min today · 720 free · renews 12:00 AM / Refill +120 min · 6,917 gold / 0 of 5 refills bought today"**.
- The activity bar chip also reads **"Vigour 300 min"** next to the Stop button (visible in the PNG's top strip), matching `vigour-mount.js`'s two-surface design (fight rail block + activity chip, both painted from the same `G._vigour`).

### `charm-moment-1280x800.png`, `charm-moment-922x423.png`
`window.HearthriseAuth.currentUserId = () => 'qa-visual'`, then two `window.HearthriseCharms.noteEnvelope(...)` calls 1.5s apart (`{undead:1}` then `{undead:100, extra_dimensional:5}`), matching the watcher's 1s poll in `hunters-ledger.js`.
- The rank-up sheet (`#hr-charm-moment`) opened with heading **"A charm is earned" / "The Hunter's Ledger"**, block title **"Undead · Marked"**.
- Two separate `<p class="hl-moment-lore">` elements confirmed (`paraCount: 2`, `distinctElements: true`, `distinctText: true`):
  1. Rank lore: *"They know your scent by now; the packs thin where you walk, and what they carry falls to you a little more often"*
  2. Class lore: *"The dead do not tire, but they do remember; every grave you close teaches you how the next one will try to climb back out"*
- Followed by the effect line ("The Bestiary now shows what they are weak to." / "Undead foes now drop their loot a little more often, watching or away.") and "Next: Hunter at 500 Undead kills — you have 100."

### `home-quiet-1280x800.png`, `home-quiet-922x423.png`
`window.showTab('profile')` — note the sidebar's "Home" button's actual tab id is `profile` (`index.html` `data-tab="profile"`, label "Home"); there is no `#panel-home`, so `showTab('home')` is a silent no-op. Booted (no scripted state changes) to confirm nothing regressed.
- `.np-door` count: **0** (no Night Plan doors).
- `.hr-lf-band` (the away lucky-finds band, `src/features/lucky-finds.js`): **absent**.
- 0 overlays open. Dashboard renders normally: daily reward card, "Your first day" quest steps, hero roster.

### `net-banner-1280x800.png`, `net-banner-922x423.png`
`window.HearthriseNetStatus.setMode('offline')`, then restored to `'ok'` after capture.
- `#hr-net-banner` text: **"🔌 You're offline — your activity keeps running on the realm; reconnect to act."**
- Banner renders as a fixed pill under the top bar at both sizes (confirmed in `CHROME_ALLOW`'s own accounting in `tests/reachability.mjs`: it's an allowed fixed-position overlay, "transient, never reaches a panel").

## Not reached / skipped

Nothing was skipped — all 7 screens (13 PNGs total, `settings-scrolled` is 922×423 only per the brief) were captured, both the accrual-seam Vigour meter and the charm rank-up seam were present and used exactly as specced.

## Console noise (expected, sandboxed)

Every boot logs ~17 console/page errors, all Supabase reachability failures from this sandbox with no network egress to `nezapsylztqbbwuwembx.supabase.co`: `ERR_CERT_AUTHORITY_INVALID`, `ERR_TUNNEL_CONNECTION_FAILED`, a `TypeError: Failed to fetch` from `network-status.js`'s probe and the chat backend, a `pageerror: Failed to fetch`, and a blocked realtime WebSocket. None of these are UI regressions; they are why every screen shows "Signed out" / "The realm is slow" / "Offline · reconnect to keep playing".
