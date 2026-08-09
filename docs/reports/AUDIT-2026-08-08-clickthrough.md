# Click-through audit — every control, every screen

**Build under test:** v0.9.2-beta (b224) + the account wall (`4bda860`), main tree, served on 127.0.0.1:8159.
**Method:** headless Chromium, wall passed through the harness seam `window.__HR_TEST_HARNESS__` (the same
global `tests/run-smoke.mjs` injects — never a URL flag, and inert on the player hosts).
**Auditor:** QA Engineer · 2026-08-08 · read-only, no code changed.

---

## 1 · What was actually done

Two automated sweeps clicked **418 controls (177 distinct)** across the 13 nav destinations, the persistent
chrome, and every overlay a control could open. Each click was bracketed by an idle baseline sample so the
idle game's own ticking could be subtracted, then every control that showed no effect was **re-tested by
hand-built probes** with a corrected detector. Five deeper probe passes exercised the contract-level
questions ("does the toggle change behaviour?") that a DOM diff cannot answer.

| Surface | Controls exercised | Notes |
|---|---|---|
| Persistent chrome (nav ×13, muster pill, quests, bell, save, settings, bug report) | 24 | all |
| Home / Character / Combat / Events / Bounty / Skills / Stable / Inventory / Market / Farm / House / Social | 153 | all visible controls, multi-pass to catch content that only appears after a sub-tab click |
| Overlays reached and swept | 9 | `settings-modal`, `hr-bug-modal`, `hr-dl-modal`, `hr-mu-scrim`, `hr-id-scrim`, `quests-modal-overlay`, `mob-preview`, `inv-detail-overlay`, `hr-cl-scrim` |
| Disabled-state controls confirmed inert-by-design | 49 | level/material gates that state their own reason |

**Console health: 0 errors and 0 page errors across all 418 clicks.** No control threw.

### Two detector bugs I found in my own harness — worth recording
Both produced false "dead control" readings, and both are traps for anyone repeating this:
1. **Toasts render with class `.notif`, not `.toast`.** Any control whose only feedback is a toast looked
   dead. Fixed by hooking `window.notify` directly.
2. **Element index paths go stale.** The panels re-render on a timer, so a path captured at enumeration can
   point at a different element (or an already-active tab) by the time it is clicked.

After correction, **0 of 33** flagged candidates were genuinely dead — every one had toast, native-dialog or
re-render feedback. The real dead controls below were found by asking what *consumes* the value, not by
diffing the DOM.

---

## 2 · Findings

### P2 — dead controls (click → nothing, and nothing ever)

**#1 · Settings › Audio — the entire section is inert (4 controls)**
Screen: Settings modal, Audio (the section that is **open by default**, so it is the first thing a player sees).
Controls: `Master sound` toggle, `Music volume` slider, `Sound effects volume` slider, `Mute when window unfocused` toggle.
Expected: sound turns on/off; volume changes.
Actual: **the build has no audio subsystem at all.** Runtime probe: `document.querySelectorAll('audio').length === 0`,
no `AudioContext`, no sound/sfx/music global, no audio script tag. The four controls write `G.settings.*`
and nothing anywhere reads them. Measured before/after on each: `changedBeyondSetting: false`.
Owner: **Game Designer** (decide: hide the section, or it becomes a promise Audio must keep) → then Systems/Art.

**#2 · Settings › Display › UI scale — a 6-option select that scales nothing**
Expected: "150%" makes the UI bigger. Especially load-bearing given backlog #1/#19 ("text too small everywhere").
Actual: set to `150` → `document.documentElement` zoom `1` → `1`, font-size `16px` → `16px`, `.app` transform
`none` → `none`, width `1440` → `1440`. `bindControls` (`src/settings-page.js:504-531`) applies side effects for
exactly three keys — `reduceFx`, `theme`, `autoEatPct` — and `scale` is not one of them. No consumer exists in
any JS or CSS.
Owner: **Art + Systems.** This is the control a player reaches for *before* filing "text too small".

**#3 · Topbar "Notifications" bell has no handler at all**
Screen: top bar, between the streak badge and Save game. `index.html:217` — `<button class="icon-btn notif-bell" id="btn-notif" title="Notifications">`.
Expected: opens notifications.
Actual: `onclick` property `false`, `onclick` attribute `null`, and no `addEventListener` for `#btn-notif`
anywhere in `src/` (the only references are icon-path maps in `icon-set.js`, `icon-swap.js`, `ui-overlap.js`).
Measured: clicking changes zero bytes of `document.body.innerHTML` and adds zero nodes. Its badge `#nb-dot`
is hardcoded `0` with class `hide` and has no writer — it never appears.
Note: `#notifs` is **not** this button's panel; it is the toast column (`toasts.js container()`).
Owner: **Systems** — wire it or remove it. A permanently dead button in the top bar is seen on every screen.

### P2 — placeholders shipped as live controls (violates the FINAL DIRECTIVE: no placeholders)

**#4 · Inventory › "Manage"** → toast `Manage UI coming soon` (`src/legacy.js:8814`). Panel unchanged.
**#5 · Inventory › "Loadouts"** → toast `Loadout manager coming soon` (`src/legacy.js:8823`). Panel unchanged.
Both sit in the inventory toolbar next to "Multi-select", which works. Measured: `changed: false` for both.
Owner: **Game Designer** to rule (remove vs build), **Systems** to execute.

### P2 — the control works, the screen lies

**#6 · Bounty Board › "Accept" does not refresh the Bounty Board**
Screen: Bounty Board tab (`#panel-bounty`).
Expected: the accepted notice leaves the board; the active-bounty card with "Fight target / Abandon" appears.
Actual: `G.bountyHunter.active` is set and a toast fires (`Accepted bounty: Goblin`), but
`panelChanged: false`, `showsAbandon: false`, board button count unchanged at 9. The player sees the notice
still pinned to the board and no sign they took it. Navigating away and back repaints correctly
(`showsAbandon: true, showsFight: true`).
Root cause: `acceptBounty()` (`src/legacy.js:1204-1211`) ends in `renderCombat()`, which repaints
`#combat-area` via `renderBountyPanel()`. The Bounty **tab** is drawn by `renderBountyTab()`
(`src/legacy.js:4345`), which is only ever called from `showTab('bounty')` (`:4404`).

**#7 · Bounty Board › "Abandon" — same fault, inverted**
Actual: after clicking, `G.bountyHunter.active === null` and the toast fires, but the panel **still shows
"Abandon"** and "Fight target" for a bounty that no longer exists. `abandonBounty()` (`:1213-1219`) also ends
in `renderCombat()`. `rerollBountyBoard()` (`:1221`) shares the same ending and the same exposure.
Owner (#6/#7): **Systems** — one fix: have the three bounty mutators repaint whichever surface is showing.

**#8 · Market › "Premium Store" button deletes itself after any Market action**
Screen: Market tab, top-right. It is the route to `panel-shop`.
Measured sequence: present on arrival (`true`) → list an item → **gone** (`false`) → type in search → still
gone → navigate away and back → present again.
Root cause: `nav-consolidation.js injectMarketStoreLink()` appends `#hr-store-link` as a child of
`#panel-market`; `market.js render()` does `panel.innerHTML = …` (`src/market.js:935`) and destroys it.
Re-injection only runs on a nav click / `showTab` (plus a 6 s boot settle), never on Market's own re-render —
and a Market re-render fires on every list, cancel, sort change and **search keystroke**.
Owner: **Systems.**

### P2 — validation bypass

**#9 · Home › the "Rename" pencil is a third display-name writer with no rules**
Screen: Home, the pencil beside the player name (`.hd-rename`, `src/features/home-dashboard.js:393`).
Expected: the same rules as everywhere else. `src/settings-page.js:547-552` carries an explicit b221 comment —
*"One writer, one rule set"* — and routes Settings' rename through `HearthriseIdentity.validateName` +
`claimName`.
Actual: the pencil calls native `prompt()` then `LP().setDisplayName(nm)` (`:619-621`), and
`setDisplayName` (`src/features/profile-launchpad.js:228-242`) does `trim().slice(0, 24)` and writes
`G.playerName` — **no validator, no uniqueness, no server row.**
Repro (measured): answer the prompt with `‮evil​<img src=x onerror=alert(1)>`.
`validateName()` returns `{ok: false, reason: 'long'}`; the pencil accepts it anyway and
`G.playerName` becomes `‮evil​<img src=x onerror` — rendered in the Home hero and the topbar with the
RTL-override (U+202E) and zero-width joiner intact. Length rules also disagree (24 here vs 20 there).
**Not** an XSS — output is correctly escaped (`&lt;img …`, `injectedImgs: 0`), and the hostile-input clearance
from my b223 pass still holds for the identity path.
Owner: **Systems** — route the pencil through the identity seam, or delete it (Settings already has rename).

### P2 — keyboard: Escape does not close most modals, and none take focus

**#10 · Escape closes 2 of 8 modals; no modal moves focus into itself on open**

| Modal | Escape closes? | Focus on open |
|---|---|---|
| `settings-modal` | **yes** (legacy `.modal.show` handler) | body |
| `quests-modal-overlay` | **yes** | body |
| `hr-cl-modal` (Collection Log) | no | body |
| `hr-rn-modal` (Renown ladder) | no | body |
| `hr-dl-modal` (Daily reward) | no | body |
| `hr-bug-modal` (Bug report) | no | input (only one that focuses) |
| `hr-mu-scrim` (Muster) | no | body |
| `hr-welcome-modal` (What's new) | no | body |

Root cause: `src/legacy.js:1917/3179` handles Escape at the **document** level for the older `.modal.show`
family; the newer scrim-based modals either bind nothing or bind to themselves. `RoomModal`
(`src/features/clan-seat-ui.js:1352`) is the clearest case — `sc.addEventListener('keydown', …)` only fires if
focus is already inside the scrim, and nothing puts it there, so its Escape handler can never run in practice.
No modal traps Tab either, so keyboard focus walks out into the page behind the scrim.
Not a hard trap — every one of these has a visible close affordance, so a mouse user is never stuck — but it
is a uniform keyboard failure across the whole newer modal family.
Owner: **Systems** (one shared scrim behaviour: document-level Escape + initial focus + Tab containment).

### P3 — mislabeled controls

**#11 · Social › "Sign in" does not sign you in.** `src/features/clans.js:282` — when `HearthriseAuth.showSignIn`
is absent it falls back to `notify('Open Home → Sign in','info')`. Measured: that is exactly what happened.
A button labelled "Sign in" that emits directions to a different "Sign in" is a dead end, and with the b224
account wall this is the state a lapsed session lands in. Owner: **Systems**.

**#12 · Events › "Strike the boss (1/day)" is enabled at every level and always refuses.**
At combat level 3 the button is fully enabled; clicking returns `Reach combat level 30 to hunt`
(`src/features/raids.js:764`). Directly beneath it, six dungeon buttons do the opposite and better — disabled,
with the requirement in the label (`Combat Lv 25 required (you are 3)`). Two conventions on one screen.
Owner: **Game Designer** (pick the convention) → **Systems**.

**#13 · Settings › Display › "Theme" is a picker with one option.** `HearthriseTheme.list()` returns exactly
one card (`hearthlight`), already active, so the control can never change anything. The fallback list in
`settings-page.js:231-235` still names three themes that no longer exist.
Owner: **Art** — one theme means this is a label, not a chooser.

### P3 — data safety

**#14 · Settings › Data › "Import save" accepts any JSON object, including `null`.**
`src/settings-page.js:810-820` guards with `typeof parsed !== 'object'` — which `null` and any array pass —
then writes it straight to `hearthbound-save-v2` and calls `location.reload()`. No shape check, no version
check, and the pre-import save is not snapshotted (unlike "Restore backup", which does snapshot). The copy is
at least honest ("cannot be undone unless you have a backup").
Not reachable by accident (needs a file picker), so P3, but it is a one-click character wipe.
Note: the destructive siblings behave correctly — "Reset character" with `confirm → No` left the save intact
(measured `before: true, after: true`), and "Restore backup" auto-snapshots first.
Owner: **Systems**.

**#15 · Offline chat channels sit on "Loading…" forever.** Global and Trade both render `Loading…` with no
resolution and no offline state; only Clan explains itself ("Join a clan to unlock this channel"). The Clan
input also stays enabled with placeholder "Join a clan to chat here" and only refuses on Send.
Owner: **Systems** (degraded-state copy).

### P4 — informational

**#16 · The dev admin panel is one URL parameter away and sticky.** `src/admin.js` ships in `index.html:699`.
`?admin=1` writes `hearthrise:admin=1` to localStorage **permanently** (only `?admin=0` clears it), after which
the panel is available every session with Add Gold, Add Gems, Max All skills, Spawn Item, tier jumps and God
Mode. Verified it is **not** reachable without opt-in (no panel, no `window.Admin`, Ctrl+Shift+A no-ops). It
grants client-side state that then syncs to cloud, so it is an economy surface, not just a debug toy.
Owner: **Systems** — a call on whether it ships in the beta build at all.

**#17 · Emoji in live controls and copy** (FINAL DIRECTIVE: no emoji anywhere). Observed while clicking, not
grepped for: `⚔️ Fight` (monster preview button), `Saved 💾` (save toast), `⚠️ Erase + reload` (Settings),
`☁️ Cloud save active` (Settings), `📖 New discovery` (toast), `🦐` (market row), `🎣 🩸 📈 ⚔️ 💎` (quest
titles), `🔒 💎` (Hearth Hall paywall card), `❔` (collection log), `🌾 Planted 2 plots` (farm toast),
`🧍 ⚔️ ❓` (combat empty state, `src/legacy.js:2212`).
Owner: **Art**.

---

## 3 · Cleared with evidence — do not re-test blind

- **Every "dead" candidate from the automated sweeps is alive** (33/33). Named individually because they look
  dead and will be re-flagged otherwise: inventory category chips (all 10 call `_invSetCat` + re-render),
  inventory search + Reset, market item picker and sort select, farm plot tiles, `Plant all`, `Water all`,
  house `Buy`, `Save game`, skills activity tiles, combat tier chips, doll tabs, leaderboard chips.
- **Locked content is honestly locked, not silently inert.** All 49 gated controls carry
  `pointer-events: none` or `disabled` *and* state their requirement in the label.
- **Market list → cancel round-trips correctly offline.** Listing with nothing selected refuses
  (`Unknown item`); a real pick shows the vendor hint and lists; Cancel returns the items with a toast.
- **Market sort and search ARE wired** (`src/market.js:938-960`) — they appear inert only because they filter
  the *browse* list, which is empty with no other sellers online. Do not file this.
- **Bounty accept/abandon guard correctly** — a second Accept while one is active refuses with
  `Finish or abandon your active bounty first.`
- **The muster "Join" is a two-step confirm**, not a stuck button: Join → *"Join The Ashen Horde? … / Not
  today"* → Join actually joins (`You answer The Ashen Horde — +10% all XP`). Looks like a no-op state bug in a
  DOM diff; it is not.
- **The 8 extra `.farm-tile` nodes are 0×0 and hidden** — not dead plots.
- **Collection-log Bestiary cells are non-clickable *by design* when undiscovered** (`hr-cl-cell miss`) —
  drill-in is gated on discovery, not broken.
- Working settings controls, measured: `Reduce motion` (sets `--reduce-fx`, consumed by
  `audit-overrides.css:371`), `Auto-eat HP threshold` (mirrors to `G.autoEatPct`), all four chat toggles,
  whisper permission, Block list open/close/empty state, Export save (emits
  `hearthrise-save-2026-08-09.json`), Save now, What's new, Replay tutorial (relaunches at "Step 1 of 6").
- Quests modal Daily↔Weekly tabs swap content correctly; chat opens, switches all three channels, sends,
  refuses the clan channel with a reason, and collapses.

---

## 4 · Coverage gaps — what I could NOT exercise

Everything below needs a signed-in Supabase session or progression a fresh account cannot have. None of it is
cleared; it is untested.

1. **Every clan/castle control** — Clan Seat, castle rooms and the `RoomModal` action/ladder/field kinds,
   feast call states, hunt declare states, contribute/deposit, clan upgrades. The Social tab offline shows
   leaderboard chips and one "Sign in" button; there is no clan surface to click.
2. **Market buy paths** — Buy, the buy-qty modal, buy offers and cancel-offer. The browse list has no
   listings from other sellers offline, so no `Buy` button ever renders.
3. **Identity "Claim this name"** — correctly `disabled` without a server; the claim/collision/confirm states
   were not reachable.
4. **Server muster join/claim, leaderboard writes, cross-client whisper delivery.**
5. **Dungeon runs and raid strikes** — all six dungeons gated at combat 25-95 and the boss at 30; a fresh
   account is level 3. I clicked the gates, not the content.
6. **Collection-log drill-in, back and claim** — 0/31 bestiary and 0/280 items discovered on a fresh account.
7. **Most House rooms** — 8 `Build` buttons disabled for want of materials; only the property-upgrade path
   was exercised.
8. **Avatar upload** — confirmed the button opens the native file chooser; the chooser leg is not drivable
   headless, so encode/reject behaviour was not re-verified here (it was cleared in my b223 pass).
9. **Import save** — the file-chooser leg is not drivable; finding #14 is from source, not a live wipe.
10. **Real pointer-drag of the chat pill**, and **mobile / landscape layouts** (deferred by project decision).

---

## 5 · Scoreboard

| | count |
|---|---|
| Controls clicked | 418 (177 distinct) |
| Console errors / page errors | **0** |
| Genuinely dead controls | **7** (4 audio + UI scale + notification bell + theme picker) |
| Placeholder controls shipped live | **2** |
| Mislabeled controls | **3** |
| Controls that work but leave the screen stale | **3** |
| Validation bypasses | **1** |
| Modals Escape cannot close | **6 of 8** |
| States that trap the player (no way out) | **0** — every modal has a visible close affordance |

Known/in-flight items (#18, #19, wall UX, my own b223 routed findings, BACKLOG/CONFLICTS entries) were
excluded and are not re-filed here.
