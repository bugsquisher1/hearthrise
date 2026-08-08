# HANDOFFS

_The primary agent-to-agent teaching mechanism. When your work affects another specialist, write a handoff here. Append newest at top._

## Template
```
### <DATE> · FROM <agent> → TO <agent(s)>
WHAT I LEARNED:
WHAT I CHANGED:
WHAT YOU NEED TO KNOW:
WHAT I NEED FROM YOU:
WHAT MUST NOT BE CHANGED:
WHAT SHOULD BE TESTED:
```

---

### 2026-08-08 · FROM Game Designer → TO Art Director, Systems Engineer
**WHAT I LEARNED:** `clans.upgrades jsonb` + `castle_tier int` already exist in the Supabase schema, unused — the clan castle can build on them with no destructive migration. Current clan panel is "a bank account with a chat channel"; leaderboards never show a sub-top-15 player their own rank; ~135 recipes render as flat scrolls but categories can be **derived** from existing item fields (no hand-tagging).
**WHAT I CHANGED:** Wrote `docs/design/{clan-overhaul,leaderboards,crafting-cooking-taxonomy}.md` (commit `4d54eb3`). No game code.
**WHAT YOU NEED TO KNOW — Art:** three UI packages coming out of these specs: (1) clan castle silhouette with lit vs ghosted wings (a *place*, not a dashboard; no emoji); (2) leaderboard category+skill selector plus a pinned "you + rivals above/below" block; (3) artisan category strips / sub-tabs reusing the `data-lb`/`data-house` pattern. **Systems:** four items filed in `CONFLICTS.md` (perk-stacking cap, `raidPower` key, auto-eat foodClass filter, `snapshot.renown`).
**WHAT I NEED FROM YOU:** Systems' ruling on the perk soft-cap mechanism before Wave 3; Art's visual treatment for the castle panel.
**WHAT MUST NOT BE CHANGED:** Treasury stays gold-only in v1 (server-governed sink); rewards are cosmetic titles/gems — never Hearth Tokens.
**WHAT SHOULD BE TESTED:** n/a (docs only).

### 2026-08-08 · FROM Coordinator → TO all specialists
**WHAT I LEARNED:** The base is clean and green (`119a698`, smoke 175/175, remote in sync, auto-deploy live).
**WHAT I CHANGED:** Established the coordination system (`.claude/coordination/**`), five agent definitions (`.claude/agents/*.md`), and team commands (`.claude/commands/*`). Committed + pushed the asset/doc cleanup.
**WHAT YOU NEED TO KNOW:** Read `PROFESSIONAL_STANDARD.md` and your own `agents/<you>.md` log before starting. Ground truth is in `CURRENT_STATE.md` and `DISCOVERIES.md`. Claim shared surfaces in `ACTIVE_WORK.md` before touching them.
**WHAT I NEED FROM YOU:** When dispatched, work to the Change Contract and update your log + the relevant coordination files before declaring READY.
**WHAT MUST NOT BE CHANGED:** The regression tripwires in `DISCOVERIES.md` (data merge identity, theme scoping, no PvE token mint, XSS sanitization). Keep guard tests green.
**WHAT SHOULD BE TESTED:** `node tests/run-smoke.mjs` (175/175) after any change; plus your domain-specific verification.

---

_(New handoffs below, newest first.)_
