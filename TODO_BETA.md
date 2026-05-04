# Hearthrise — Beta TODO

Stuff I noticed during the v0.9.1-beta polish pass but consciously didn't fix
before pushing. Capture > perfection. When friends start sending feedback,
prioritize against this list rather than guessing.

Format: each item has **Severity** (P0 = breaks gameplay, P1 = visible bug,
P2 = polish, P3 = nice-to-have) and a **Repro** if non-obvious.

---

## Live-site walkthrough findings (build 94 → 101)

Walked the live site after Tyler's first push. Build was at `v=94`, which means
the post-signup welcome, clickable activity bar, and market form fix were
**not yet deployed** — they're now bumped to `v=101` and need a fresh push.

### NEW P0 (now fixed in v=101 locally — needs push)
- **Bounty Board raw HTML in monster names.** `class="icon-fallback" style=...> Field Rat`. Caused by `paintBountyMonsters` using `innerHTML.replace()` with regex; that fought with `image-fallback.js`'s injected spans during re-renders and produced corrupted DOM. Rewrote with proper DOM API (createElement + appendChild). Fix lives in legacy.js around line 4514.

### Confirmed working on live (v=94)
- Crest + sidebar + parchment + wax-stamp Sign In button
- Profile sheet with corner flourishes
- Character page hero block + heroes row + Hearth Hall premium banner + 3 combat-style stat blocks (Melee/Ranged/Magic) + Best Rates by Skill + Equipment summary
- Activities tile sidebar + Woodcutting tree options + actually starting Woodcutting (XP ticks, "Active — click to stop" works, activity bar shows "Woodcutting — Normal Tree")
- Combat: tier monster list, loadout paper-doll, Suggested for your level, Dungeons button, combat-style header
- Bounty Shop right rail (Reroll Token, Auto-Accept, etc. all render fine — bug was specific to bounty-option monster cards)

### Other live observations
- **P1 — Character page HP shows "— / —"** instead of actual numbers (e.g. should say `10 / 10`). Top of Character sheet under "Skilled Brawler · Top skill: Hitpoints Lv 10".
- **P2 — Character portrait area is empty.** Just a tiny hex-shape glyph in the parchment box. Already noted in original list.
- **P2 — Activity sidebar tile icons faint.** The icon-fallback color/size CSS fix is queued in v=100/101 but not yet on live; will land with the next push.
- **P2 — Tree option icons (Oak/Willow/Maple/Yew) very faint** in Activities → Woodcutting. Same icon-fallback styling issue.
- **P2 — Topbar / Profile state mismatch.** Topbar shows email `themphill22+1@gmail.com` while Profile says "Offline play · sign in to sync." Likely cached topbar state from a previous signed-in session — auth state didn't flush down to Profile render. Worth investigating; possibly fixed by the auth re-render hook from v=94.
- **P3 — Activity bar click-to-jump:** doesn't work yet because `activity-bar-clickable.js` is in v=101, not yet deployed.

### Items still owed (uncommitted local changes, need push)
- `src/post-signup-welcome.js`
- `src/activity-bar-clickable.js`
- `src/legacy.js` (the new bounty fix at paintBountyMonsters)
- `src/styles/theme-cozy.css` (market form bg fix)
- `index.html` (cache-buster bumps to v=101 + new script tags)
- `CHANGELOG.md` (v0.9.1-beta entries)
- `TODO_BETA.md` (this file)

**Re-push command:**
```
git status
git add -A
git commit -m "v0.9.1-beta b101: bounty raw-HTML hotfix + post-signup welcome + clickable activity bar + market form bg + TODO/CHANGELOG"
git push
```

---

## Visual / UI

### P1 — Bounty Board monster icons fall back to wood-crate
- **Where:** Combat → Bounty Board cards
- **Symptom:** Some monsters render the generic crate icon instead of their actual silhouette.
- **Cause:** `window._monsterIcon` mapping has 31 entries, but those PNGs may not all be hosted on the live deploy (the `assets/raw-bundle/monster-rpg-256x256-icons/shadow/13.png` path 404s on GitHub Pages). image-fallback then swaps to the emoji glyph, which is correct behavior but visually inconsistent with the SVG case.
- **Fix sketch:** Confirm whether `assets/raw-bundle/` is actually committed + deployed (check `.gitignore`). If not, either commit those PNGs or migrate to inline SVG icons matching the rest of the system.

### P2 — Bounty card name still wraps awkwardly on narrow widths
- **Where:** Combat → Bounty Board on viewports < 900px
- **Symptom:** Monster name + reward chip can collide on the second line.
- **Fix sketch:** Add `flex-wrap: wrap; gap: 4px 8px` to `.bounty-option > b` row, or set `min-width: 0` on the name so it truncates with ellipsis.

### P2 — Inventory paper-doll slot labels disappear when slot is filled
- **Where:** Profile → Hero → Equipment paper doll
- **Symptom:** Empty slots show a label ("Helm", "Chest", etc.); once equipped, the label is replaced by the item icon and there's no fallback text.
- **Fix sketch:** Render label as a `<small>` under the slot regardless of filled state, or as a `title` attribute so hover reveals it.

### P2 — Settings → Account section visual hierarchy
- **Where:** Settings tab, Account block
- **Symptom:** Sign-in form, "signed in as" state, and sign-out button all sit in the same parchment block with no visual separation.
- **Fix sketch:** Either subdivide with hr lines or break into two consecutive parchment cards.

### P3 — Welcome modal "What's New" formatting
- **Where:** First load after a new build, welcome modal
- **Symptom:** Long bullet list scrolls inside a fixed-height modal — emoji bullets render OK but the modal feels cramped.
- **Fix sketch:** Increase max-height to 80vh, or split into "Highlights" (3 bullets) + "Full changelog" (collapsed details).

### P3 — Hero portrait is a placeholder
- **Where:** Profile sheet, top-left corner
- **Symptom:** Currently shows a generic silhouette + class glyph; no actual character art.
- **Fix sketch:** Either commission/generate a small set of class portraits, or design a parchment "no portrait" state that feels intentional rather than missing.

---

## Mobile

### P1 — Mobile viewport audit not done
- **Where:** Everything
- **Symptom:** The session focused on desktop. Mobile is "supported" per the changelog but I haven't walked it tab-by-tab on a real narrow viewport.
- **Fix sketch:** Walk every tab at 380px width: chat dock, character sheet, combat arena, market filter chips, bounty cards, settings forms.

### P2 — Activity bar truncation on mobile
- **Where:** Topbar activity indicator on phones
- **Symptom:** "Idle — pick an activity" is fine but mid-training labels like "Training Strength — 12s" might overflow into the Stop button.
- **Fix sketch:** `text-overflow: ellipsis; min-width: 0` on the label child.

---

## Auth / Networking

### P0 — Email confirm link UX needs verification on a fresh browser
- **Where:** Signup flow
- **Symptom:** Per CHANGELOG: "Email confirmation links may need a fresh browser tab to complete sign-up." This is documented but not actually verified end-to-end on a clean profile.
- **Fix sketch:** Test signup → check email → click link in same tab vs. new tab → confirm landing flow. Document the working path or fix the broken one.

### P2 — Display name not back-filled into Supabase user_metadata until first login
- **Where:** Signup form
- **Symptom:** Display name is captured as `data: {display_name}` on signUp, but I'm not 100% sure Supabase persists user_metadata before email confirmation completes. Edge case.
- **Fix sketch:** Verify with a test signup that `session.user.user_metadata.display_name` is present immediately after confirm-click sign-in.

### P3 — No "resend confirmation email" button
- **Where:** Settings → Account when in pending-confirm state
- **Fix sketch:** Add a small text link that calls `supabase.auth.resend({type: 'signup', email})`.

---

## Gameplay

### P2 — Some achievements still client-side only
- Already noted in CHANGELOG. Need to migrate the achievement check + persistence to the cloud-save schema.

### P2 — Bestiary client-side only
- Same as above. Currently kill-counts live in localStorage.

### P3 — Stable page placeholder content
- **Where:** Stable tab
- **Symptom:** Walked it during the session — feels light, mostly UI scaffolding.
- **Fix sketch:** Either flesh out companion management UI or hide the tab until it has real content.

---

## Infrastructure

### P1 — Push v=100 to deploy this session's fixes
- **Status:** All changes from the v0.9.1-beta polish are local. Tyler needs to:
  1. `git add -A`
  2. `git commit -m "v0.9.1-beta: character sheet UI, atmospheric BG, post-signup welcome, bounty fix"`
  3. `git push`
- **Watch for:** GitHub Pages deploy logs in the repo's Actions tab; Supabase URL Configuration must list the live Pages URL as an Allowed Redirect URL.

### P2 — Discord URLs are placeholders
- **Where:** Settings → Beta tester tools, Bug-report dialog
- **Symptom:** Discord invite URL + bug-report webhook URL are not configured.
- **Fix sketch:** Once Discord server exists, drop URLs into config and ship a v=101.

### P3 — Phase 3.5 refactor: split `src/legacy.js`
- **Status:** Multi-week, post-beta. Currently `legacy.js` is the monolith. Per-concern ESM modules already in flight (auth, settings, activity-bar, post-signup-welcome) — need to keep extracting until `legacy.js` shrinks to <2000 lines.
- **Order of attack:**
  1. Combat loop → `src/combat/engine.js`
  2. Bounty board rendering → `src/combat/bounty-board.js`
  3. Inventory + equipment → `src/inventory/`
  4. Market → `src/market/` (partially done)
  5. Skills/training → `src/skills/`

---

## Things I'm intentionally NOT fixing pre-beta

- Hero portrait art (P3, placeholder is acceptable)
- Achievement migration to cloud (works client-side, friends won't notice yet)
- Mobile pixel-perfection (functional > polished for first beta wave)
- Full ESM refactor (would block ship for weeks)

---

## Triage flow when feedback comes in

1. Friend reports issue in Discord or via 🐛 button
2. Add to this file with severity + repro
3. P0/P1 → fix + ship same day
4. P2 → batch into next weekly push
5. P3 → "after we have actual players" pile

Last updated: 2026-05-03 (v0.9.1-beta pre-push)
