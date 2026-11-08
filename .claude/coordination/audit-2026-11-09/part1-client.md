# Architecture audit, part 1 of 3: the client and the authority line (2026-11-09)

Systems Engineer, read-only, on `origin/main` 0c0196bf0 (v0.2.108). Scope: src/session, src/app, src/shell, src/hunt-view,
src/social, src/world, src/render, src/net, src/styles, play.html, index.html. Rules: CLAUDE.md §1, §6, §7, the 11-08
"formulas are public, one data source" ruling, and the build-systems-correctly / zero-new-debt memory rules.

Method: read the standing guards first (no-client-xp-mint, client-intent-surface, no-client-copy-of-projection, residue,
world-no-authority, window-globals-exist, token-single-source, css-literal-ratchet, breakpoint-guard, client-module-size,
dead-exports, dead-css), then looked for what they cannot see. The only command run was `node tests/client-module-size.mjs`
(exit 0) to settle F8. Every finding below is a line I read. Severity: P1 = a player can see something false or the client
authors something; P2 = structural debt that will bite; P3 = style.

**Verdict:** the authority line holds. I found no client value that reaches another player, no number merged upward, no
client mint, and no global "current player". The debt is at the edges: one false line of player text, an old second hunt
render path, two formula copies with nothing pinning them to the server, residue that feeds one intent, and dead legacy theme code.

## Findings

| ID | Sev | Rule broken | Where | Smallest correct fix | Lane |
|---|---|---|---|---|---|
| F1 | P1 | §6 browser never disagrees; §1 no client fallbacks | src/shell/windows/inventory/elsewhere.js:61, :36-40 | Drop `localRows`; show "Searching…" until `hr_account_items` answers, its refusal words if it fails | A |
| F2 | P2 | one render path; nothing ported from the old client | src/world/world-boot.js:79-83, :276-291; src/world/hunt-scene.js; choreo.js; beat.js | Delete the legacy hunt staging (hunt-scene, choreo, beat, `bareSnapshot`); a combat with no `hunt` session shows the town + the unmapped banner | B |
| F3 | P2 | one formula, one source (Tyler 11-08); no duplicated rules | src/shell/market-model.js:77-91 vs 2027-01-12-market-account.sql:657 | Move fee/cut into `src/core/market-fees.js`; market-v2's replay asserts core == SQL over a sweep | B (+C test) |
| F4 | P2 | §6 residue gates and spends nothing; one path per verb | src/shell/windows/hunt-summary.js:198-201; src/session/character-session.js:317-321 | Summary's Hunt again calls `cs.restartHunt(id)` (server reads its own session); drop `bag/preset/hoursLimit` from the residue card; delete `huntAgain` | B (+C if "bag now" is wanted in `hr_hunt_restart`) |
| F5 | P2 | §6 gates fail safe to "not unlocked" | src/shell/windows/hunt-prep.js:136-137 | `slots ? slots.count : 0`: no free setup slot until the server states the count | A |
| F6 | P2 | build systems correctly (an account setting has no home) | src/session/replay-pref.js:5-9, :34-48; src/world/town-zoom.js:13 | An account preference row projected in `account`, one RPC; residue keeps per-hero display only | C then B |
| F7 | P2 | §7 Charcoal & Gold only; nothing ported; zero debt | src/styles/tokens.css:62-95, 100-134, 138-170, 255-294, 298-344, 873-915, 918-960 | Delete the six dead theme/palette blocks and the unread layout tokens; add a "defined but never read" check to token-single-source with `--selftest` | B (art-director signs) |
| F8 | P2 | no monoliths (guard blind spot) | tests/client-module-size.mjs:22; src/world/render/canvas-backend.js (649 lines) | Add `src/world` to `CLIENT_DIRS`; split canvas-backend.js in the same commit | B |
| F9 | P3 | no hardcoded caps; read the data row | src/session/character-session.js:272, :349, :355, :377, :414, :420 | Bound by `ACTION_SET_LIMITS.presets`, `PARTY.maxSize`, `BLESSING_TIERS.length`, `MAX_TROPHY_STAGE` | B |
| F10 | P3 | §1 the client never authors a server field | src/session/account-session.js:94, :407 | Pass the roster read's age to the clock measurement; never rewrite the envelope's `now` | B |
| F11 | P3 | say why, truthfully | hunt-prep.js:134; inventory/actions.js:190; inventory/grid.js:237 | Replace "switch on when the server starts keeping them" with "Reading this hero…" | A |
| F12 | P3 | half-built stays hidden; zero debt | src/session/item-sections.js:258-277; inventory/advanced.js:86 | Delete `imbuementsOf` / `IMBUE_KINDS`; add the inverse KEEP check (every key the client reads is projected) | B |
| F13 | P3 | §7 text at least 12 px | src/world/render/canvas-backend.js:307 | `Math.round(12 * dpr)`, as `font()` at :319 | A |
| F14 | P3 | one stylesheet per surface; one chrome | shell.css:258-269 + windows.css:65-101, :190; hunt.css:606 + shell.css:168, :437 | One owning sheet per selector; the Forged Steel frames as tokens (one frame image written into 13 `border-image` declarations) | B (art-director) |
| F15 | P3 | each system gets one home; no copies | character-session.js (595/600 lines); 15 `*-intents.js`; `newIdem` re-declared | One exported `newIdem`; party/services intents move out of CharacterSession into their intent modules | B |
| F16 | P3 | clarity (a stale reason) | src/session/character-sections.js:104-106 vs envelope.js:15-19 | Correct the comment (frames carry the whole envelope) | B |

## Evidence

**F1 (P1). The Inventory search tells the player the server can't do a search it can.**
`elsewhere.js:61`:
`text(box.querySelector('.hw-find-from'), server ? 'All your characters' : 'Characters open here (the account-wide search is not on the server yet)');`
`hr_account_items` has been on the server since 2026-10-25-account-items.sql (and on `CLIENT_RPCS`,
tests/client-intent-surface.mjs:85). The false label shows on every search while the 300 ms debounce and the round trip run
(`server = sc.rows && sc.asked === q`, :58), and it stays up after any refused or failed read (`sc.rows = r.ok ? r.rows : null`, :82).
Meanwhile the list is a client-built fallback. Its Storage row comes from the first open hero's own envelope
(`if (!bankDone && p.read('bank')) { add(p.read('bank'), 'bank'); ...`, :38), not from the account's newest copy that `bankOf`
reads (item-sections.js:201-213). So with two heroes open, the count it shows can be an older one.

**F2 (P2). A second hunt renderer in src/world, carried over from the old client.**
`world-boot.js:277`: `if (character && huntOf(character)) return liveState(sc);`. Otherwise it builds `createHuntScene` from
src/world/hunt-scene.js (a different function from src/hunt-view/scene.js:169 with the same name) on `choreo.js` (248 lines),
fed by `bareSnapshot`:
`foeHp: n(G.monsterHp), foeMaxHp: n(G.monsterMaxHp), heroHp: n(G.playerHp),` (:81). world-view.js:23 never sets
`monsterHp`, `playerHp` or `combatKillsThisFoe`, so this path would draw a fight that never moves. It runs only when the
record says combat but holds no `hunt` session (scene-route.js:6, "a training fight on a rat is fought in the cellar").
beat.js:7 says it "moved here from the old client's src/render/combat-observer.js". `beatOf`/`fightOf` have no caller in src/;
only tests/world-hunt.mjs:85-134 calls them, and dead-exports counts tests as a caller. The `G`-named view and its old field
names (store.js:52, world-boot.js:79-104) are the same leftover.

**F3 (P2). The market's fee and cut exist twice, and nothing ties the copies together.**
`market-model.js:78`: `return Math.max(rules.feeMin, Math.ceil(qty * ask * rules.feeBp / 10000));`. The server, at
2027-01-12-market-account.sql:657: `v_fee := greatest(v_cfg.list_fee_min, ceil(p_qty::numeric * p_ask_each::numeric * v_cfg.list_fee_bp::numeric / 10000)::bigint);`.
`netEachOf` / `netLotOf` / `evenAskOf` (:82-100) copy the cut the same way. tests/market-window.mjs:68-75 checks the client copy
against hand constants, and tests/market-v2.mjs:341 holds a third copy as its own oracle. So the fee the Sell sheet shows
(sell.js:154) is a client formula, and nothing checks it against the server's. The Tyler 11-08 ruling puts every formula in ONE
data source. The bench fee already does it right: `src/core/bench-tax.js` is shared, and bench-fee.js reads it.

**F4 (P2). The summary card's Hunt again sends residue values into an intent, on a second path.**
`hunt-summary.js:201`: `cs.huntAgain(againWithBag(args, packFor(bagOf(cs))))`. `args` is `huntAgainOf(cur)`
(summary-model.js:179-185): the preset, the hours limit and each line's `essential` mark read from the `huntSummaries` residue
(hunt-summaries.js:46, `p[2] === 1`). `huntAgain` checks only `Array.isArray(a.bag)` and sends `p_bag: a.bag` as given
(character-session.js:319-320). `enterHunt` validates each line and strips it to `{ item, qty }` (:272-275). The server acts on
the mark: `v_ess := coalesce((v_line->>'essential')::boolean, ...)` (2027-02-10-party-instance-reset.sql:221), and that changes
when `heals_out` / `ammo_out` end the hunt. The alert's Hunt again uses the other verb, `cs.restartHunt(a.session)`
(widgets/alerts.js:120), where the server reads its own session's preset, hours and bag (2026-10-25-party-invites.sql:310-320).
So one button label has two semantics. Only the player's own hunt is affected, so it's not an exploit. But the residue
"gates and spends nothing" rule is broken.

**F5 (P2). Setup slots fail open.** `hunt-prep.js:137`: `const count = slots ? slots.count : MAX_PRESETS;`. With no
`setup_slots` section, all 5 setups show as free, and only 3 are (slots 4-5 cost 15,000 and 40,000). The server refuses, so
the screen offers what the server will refuse. That's the §6 residue-ahead shape. `setup_slots` is projected today, so this
shows only on an envelope without it.

**F6 (P2). An account-wide privacy choice is stored per hero.** replay-pref.js:6-8: "a press goes to EVERY open hero and
what counts is the newest pick any open hero holds". `replayWanted` reads only the open heroes (:34-38). A hero that wasn't
open at the press keeps its older pick. Opened later without the others, that older pick decides whether PostHog records the
screen, against the player's last choice. Today that needs a hero that wasn't open at the press (more heroes than the
play-at-once limit, or a failed open), so it's rare. But a per-hero residue can't hold an account setting correctly, and the
town zoom copies the same pattern (town-zoom.js:13).

**F7 (P2). tokens.css still carries the old client's themes.** `body[data-theme="lane1"]` (:100, "legacy.css · theme
"lane1" (Stardew retheme...)"), `"dark"` (:138, "cozy dark wood"), `"cozy-dark"` (:255, "deep warm chocolate"), `"classic"`
(:298), `data-theme-palette="midnight"` (:873, navy) and `"iron"` (:918). Nothing in src/, play.html or index.html sets
`data-theme` or `data-theme-palette`. That's about 240 dead lines, with brown and navy palettes that the 10-14/16 rulings
replaced with Charcoal & Gold. The legacy layout tokens `--nav-w`, `--top-h`, `--rail-w`, `--hr-fab-col`,
`--hr-rail-foot-h` and `--hr-panel-pad-t` (:62-95, the left-rail dials) have no reader anywhere. Why no guard sees it:
token-single-source C fails a token that is read but never defined, never one that is defined but never read, and dead-css
counts only classes.

**F8 (P2). The size guard doesn't measure the World.** client-module-size.mjs:22 lists app, session, shell, net, render,
hunt-view and social. It ran green (exit 0, "218 client modules, every one ≤ 600 lines") while
src/world/render/canvas-backend.js is 649 lines and world-boot.js is 593.

**F9 (P3).** `preset > 7` (character-session.js:272, :349, :355), while the data and the server allow 5
(rule-subjects.js:107 `ACTION_SET_LIMITS = Object.freeze({ presets: 5, slots: 20 })`; hunt-prep.js:46 reads it). Also
`seat > 7` (:377) against `PARTY.maxSize: 4`, `tier > 9` (:414) against 3 `BLESSING_TIERS`, and `stage > 4` (:420) against
`MAX_TROPHY_STAGE` (bestiary.js:108). Each one is a second copy of a rule, and each will drift from its data row.

**F10 (P3).** account-session.js:94:
`const agedBy = (body, ms) => (... Object.assign({}, body, { now: new Date(Date.parse(body.now) + ms).toISOString() }) ...)`, applied to the
roster's read (:407). The record's `now` is then a client-made number. `storageOf` takes `now` as the Storage's instant
(item-sections.js:195), and `_noteStorage` orders copies by it (account-session.js:235). So an aged read can outrank a
newer Storage read for up to `rosterReadFreshMs`.

**F11 (P3).** "Saved setups switch on when the server starts keeping them." (hunt-prep.js:134), "Locks switch on when the
server starts keeping them." (inventory/actions.js:190) and "Loot plans switch on…" (inventory/grid.js:237) show only when
`hunt_presets` / `bag_rules` is missing. Both are projected, so if one ever shows, its reason is false.

**F12 (P3).** item-sections.js:261: "`imbuements` (ruling D v2; NOT on the server yet)". `imbuements` isn't in the pinned
projection (tests/no-client-copy-of-projection.baseline.json), and inventory/advanced.js:86 still reads it. The
projection guard checks that the client keeps every projected key. Nothing checks the other direction.

**F13 (P3).** canvas-backend.js:307, the bleed badge: `const px = Math.max(Math.round(4.5 * zs), Math.round(11 * dpr));`,
which is 11 CSS px. The plates and floats floor at 12 (`font`, :319).

**F14 (P3).** 26 selectors are styled in two sheets (a comment-stripped selector census of src/styles, tokens.css excluded). Examples: `.hw-primary` (shell.css:258-267 for the look,
windows.css:65-67, :80, :100-101 for display), `.hw-tip, .hw-menu` (shell.css:269, windows.css:190), and the Settings window's
`.st-*` in hunt.css:606 and shell.css:168, :437. `url('../../assets/ui/steel-frame-thin.png')` is written into `border-image` 13
times across app/hunt/shell/windows/world.css. Section 8 of tokens.css calls the frame "the one chrome for every window", but
no token holds it.

**F15 (P3).** CharacterSession is 595 of its 600 allowed lines. Most of it is ~25 intent methods (party, services, presets,
storage, outfit, rename). 15 `*-intents.js` modules hold the rest as `(account, cs)` functions, so an intent has two homes.
`newIdem` is exported from catch-up.js:20 but re-declared in account-session.js:131 and nine intent modules, and inlined as
`globalThis.crypto.randomUUID()` in town-intents.js:62, :121, hearth-intents.js:32, hero-color-intents.js:40 and
chat-store.js:265.

**F16 (P3).** character-sections.js:105-106: "A pushed frame restates `state` and never `vitals`, `hunt` or
`character_sheet`". envelope.js:15-19 (E2) says a frame carries the whole envelope, and `frameEnvelope` applies it as a load.
The comment is the reason given for working the Level out from `level_xp`. That derivation is itself fine: tests/core-curves.mjs:54
pins `charLevelFromXp` to `hr_char_level`.

## What holds (the architecture is right here)

- **Whole-record replace, by construction.** envelope.js:58-68: a full envelope replaces the record, versions only rise,
  and frames carry the whole character (E2). The record is a deep-frozen copy (:41-49), so nothing in the shell can merge a
  number into it. This closes the "merged upward" class for every surface at once.
- **The residue is a real allowlist.** residue.js:213-234: one sanitizer per field, applied in and out.
  no-client-copy-of-projection pins the projected key set by replaying the chain. A residue key named like a projection is red.
- **No global player.** One CharacterSession per slot, each on its own topic. `AccountSession.view` only moves a pointer
  (account-session.js:276-287). `limit()` stays at 1 until the server states its number (:253-256). The shared purse and
  Storage are ordered by the server's wallet version (:220-226; item-sections.js:101-112). Per-hero scratch is kept in
  WeakMaps keyed by session (world-pane.js:38, bar-draft.js:29, launcher.js).
- **The intent surface is closed and pinned.** Edge bodies carry names and counts only, plus one bounded seller price
  (edge-intents.js:22-31). IS-1..6 pin every RPC, verb and field. Every paid press sends the server's quote and gets
  `quote_changed` back if the price moved (character-session.js:402-433; town, crier, boss, colors, titles the same).
- **The live view is prediction only.** live-engine.js:12-23 runs the server's own engine on the server's swing seeds. The
  drop stream is a constant, `rare_*` events come only from the server (`SERVER_ONLY_EVENTS`), every server commit is
  checked by world hash, and a world it can't run isn't predicted.
- **The town ticker is honest.** town-ticker.js:9-44 runs the server's own loop with every roll on its lowest outcome, and
  shows the result as pending. Every action spends the server's count (inventory/grid.js:147, "The count every action here
  spends is the server's").
- **Theming is clean where it's measured.** CSS and JS colour literals are at zero (css-literal-ratchet baseline). Canvas
  colours come from `tone()` tokens. Text sizes are tokens with a 14.5 px floor (tokens.css:503). No inline colour or font
  style anywhere in the client. play.html loads tokens and world CSS only, with a strict CSP.
- **Shared formulas where it counts.** The bench fee (src/core/bench-tax.js), gear requirements (item-lore.js `needOf` over
  the catalogue), and the Level curve, which is pinned to SQL by tests/core-curves.mjs.
- **Panels build once and patch** through src/render/paint.js, with few `innerHTML` writes per file.

## Guard coverage: what's enforced vs what isn't

Enforced: the RPC, verb and field surface; the one server link; projection keys kept whole; residue names; colour
literals; the breakpoint set; text tokens; module size (outside src/world); world-pane writes and calls.
Gaps this audit relied on reading by hand, each a cheap check:
1. client-module-size skips src/world (F8).
2. No check for a token that is defined but never read (F7).
3. No check that every key the client reads is projected (F12). The scratch scan found exactly one, `imbuements`.
4. dead-exports counts tests as callers, so code kept alive only by its own test passes (F2's beat.js).
5. no-client-xp-mint (XP-3 `G.skills`) and world-no-authority (`G`, `net/accrue`, `HearthriseCore`) police the old
   client's shapes. They're useful tripwires against bringing it back. The new client's real guard is the frozen record.
6. Nothing checks a client copy of a server formula against the SQL (F3). The bench-tax pattern is the template.
