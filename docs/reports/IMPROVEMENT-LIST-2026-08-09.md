# The Improvement List — consolidated from the three 2026-08-08 audits

_Coordinator synthesis of `AUDIT-2026-08-08-{player-journey,ui-review,clickthrough}.md` (66 raw findings), deduplicated, re-ranked, and reconciled against everything shipped through b226. This is the Wave-5 menu._

## Already fixed since the audits ran (verified shipped)
| Finding | Fixed in |
|---|---|
| **P0** offline pays identical to active play (the economy said "close the tab") | b226 pacing overhaul |
| Name re-prompt for every backfilled account + rough sign-in sequence | b226 login hotfix |
| Rate displays lying (18,000 xp/hr advertised for a 5,250 action) | b226 |
| Quick-sell paid half of every other sell button | b226 |
| Text below readable floor (51% of all text) | b225 |
| Clan buried inside Social | b225 |
| FTUE tour wedged by post-tour tab click | b225 |
| Rank-up 🎉 + Quests 📊 emoji | b225 |
| Identity/daily/post-signup modal stacking holes | b226 |

## P1 — the Wave-5 core (recommended scope)
1. **The two to-do lists** *(journey #2 — Designer+Systems)*: Home "Next up" and topbar "Quests" are two systems with 7 non-overlapping objectives; "View" on one opens the other, which doesn't contain it. Unify into ONE quest surface (the designed onboarding chain lives inside it).
2. **The game never says why anything matters** *(journey #3 — Designer)*: FTUE ends with the player idle; activity cards never name what they produce or what it's for; the renown ladder never says how renown is earned; the collection log is 311 anonymous "?" tiles. One comprehension pass across those four surfaces.
3. **112 emoji still render as art on 8 unswept surfaces** *(ui #1 — Art+Systems)*: Stable (22 @ 48px — that screen's entire art), collection log (32), events/dungeons (24), house themes (6), store equipment (5), combat (4), settings (4), house plot (3). Ship the auditor's DOM-sweep as a permanent guard test with the fix.
4. **Stable shows raw machine keys** *(ui #2 — Systems)*: `Locked · skill:woodcutting:2500` as player copy. One `describeUnlock()` formatter, six branches.
5. **Skills detail pane lies until clicked** *(ui #3 — Systems)*: shows Level 1 + padlocks for a level-58 skill until first click.
6. **Castle rooms vs Tyler's brief** *(ui #4 — Art)*: door strip is a text table; interiors greybox; crop the existing `ROOM_ART` into the door tiles; remove the Supabase filename from player copy; deepen per-room theming.
7. **Remaining modal-stack pairs** *(ui #5 — Systems)*: Settings+FTUE, More+What's-New (the b226 fix covered the identity/daily holes; these two remain).
8. **Character page labels Ranged/Magic rows "Attack/Strength"** *(ui — Systems, small)*.
9. **Clan-boss meter renders 100% full captioned "Unmeasured"** *(ui — Systems, small; related: flip `w_siege` live when raid damage reports)*.
10. **Account wall composition** *(ui — Art)*: a 402×386 card in a 78%-empty field, value prop stated twice.

## P2 — strong follow-ups
- **Settings sells things that don't exist** *(clickthrough #1/#2)*: an Audio section for a build with no audio (opens by default!) and a UI-scale control that scales nothing. Remove or build — recommend remove Audio / wire UI-scale (it's the control people reach for about text size). **Needs a Tyler preference.**
- **Dead notification bell** on every screen *(clickthrough #3)* — wire it (the toast queue history is the obvious feed) or remove it.
- **Bounty Accept/Abandon repaint the wrong surface** *(clickthrough #4)*.
- **Home rename pencil bypasses the name validator** *(clickthrough #5)* — route through the one gate.
- **Inventory "Manage"/"Loadouts" toast "coming soon"** — directive violation; build or remove.
- **Market Premium Store button deletes itself** on every market re-render/search keystroke.
- **Welcome-back modal reports HALF the offline yield** *(QA b223; re-verify against the b226 budget rework before fixing — the display model changed)*.
- **Multi-tab = silent last-writer-wins save loss** *(QA b223)* — tab lock or storage-event reconciliation.
- **Farm page dies on one unknown cropId** *(QA b223)* — guard the two renderers.
- **Market listings keep the old seller name after rename** — Designer ruling: re-render vs immutable ledger.
- **post-signup-welcome still renders cozy-light literals** — the roughest screen left in the login sequence.
- **Mobile-landscape: chat dock + bug button cover the More tab at ≤900px** — a navigation block, not cosmetic.

## P3 / decisions parked with Tyler
- Cozy Day theme isn't actually selectable — retire (≈2,400 more dead CSS lines fall out) or make real.
- `processOffline` idempotency (latent, no live trigger).
- `#panel-combat` clips ~290px on 420px-tall landscape phones (mobile pillar is deferred).
- Hen icon + homestead dusk plates + shopfront plate still need a human/paid artist (nothing suitable in the archive — verified).
- Discord changelog webhook — offer stands, needs a webhook URL.

## The big feature next to all of this
**Homestead Phase 1** (`docs/design/homestead-deepening.md`): room modals on the existing rooms via the castle's `HearthriseRoomModal` seam, the Cellar repurpose, Kitchen/Library L4-L5 flagship ladders — the second pillar catching up to the first. Pairs naturally with P1 items #2 and #6.
