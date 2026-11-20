---

Written by the cloud Coordinator session (claude.ai/code, branch `claude/nice-einstein-6h7s9n`) on 2026-11-20 for the PC Coordinator. Tyler was away from the PC 11-19 evening; this session read `HANDOFF-2026-11-19.md` (still the plan of record for 142/143) and worked only on its own branch: no production, no `main`, no applies, no deploys, no Discord. Read that handoff first; this one adds to it.

## 1. The branch: `claude/nice-einstein-6h7s9n` (pushed, tip 5db6a058)

It is `set/v0.2.142` (93f37022, unchanged on origin) plus 13 commits, so it fast-forwards the set.

| Commit | What | Ship needs |
|---|---|---|
| f52c944b | **fix(engine)** `src/core/combat-sim.js`: a window's stamped end (gold_out, rule, runes, died, boss) no longer renames a partner whose OWN end holds at the same boundary (`party_member_left` instead of `heals_out`). The nightly 44518115684 `settle-properties` DB-SPLIT red. Test: `hunt-sessions-settle` PARTY-LEAVE-RULE "the dry pair" + mutant | **Edge moves**: `pack-edge --hash` on the branch = `0639229072db…` (the 142 handoff's `ae42195c…` predates it). ONE local `run-smoke` before the deploy (§3.3) |
| 4165c5f1 | test(settle-properties): the DB tier settles through any seat still hunting (tick.js roster). A harness gap the fix exposed; still red on the pre-fix engine | none |
| 64857b3a | fix(world): **practice yard shut** (`SANDBOX.open: false`). `world-sandbox` plays switched copies both ways + SB-9 "shut in the repo" | none |
| 13fccaab (merge 074fb69e) | feat(signin): **Hearth Square behind the account screens** (art audit §5 free fix). `assets/brand/hearth-square.png` 173 KB, made by `tools/world-art/signin-backdrop.mjs`; `src/app/auth-backdrop.js` loads it after the crest; `client-boot` B-23 + 3 mutants; in `build-site` publish list and `play.html` preload | Visual gate: Coordinator read desktop 1280x720 + phone 667x375 (cloud). `client-boot` **B-19 is red in the cloud container on the BASE too** (Chromium 1243 vs pinned 1234): judge it on GitHub / the PC |
| 712d1941, 6f6860db, 879ce39a, 1984e216, 42dec8c4 | The four 11-19 audits (below), filed as `tools/qa/audit-2026-11-19-*/findings.md` + server probe + 7 playthrough shots | none (tools/qa only) |
| 14973b33, 064adadd, 5db6a058 | Luck v1 design: `tools/balance-sim/staged/luck*.js`, plan **§15** (proposal) | none (superseded by v2, §3) |

EXIT 0 per commit message. Local guards were run one at a time in the cloud; the full GitHub matrix has NOT run on this branch.

**Recommendation:** fast-forward `set/v0.2.142` to this branch before releasing 142. The edge deploy 142 already needs carries the engine fix at no extra cost, and the next nightly goes green only once `main` has f52c944b. CHANGELOG lines: "Party hunts: a hero who runs out of food now says so, instead of 'party member left'"; "The sign-in screen now opens on Hearth Square".

## 2. Nightly 44518115684 (red), read

- `in-page-39`, `in-page-26`: Ubuntu mirror timeouts at "Install Playwright + Chromium" (infra, nothing to fix).
- `settle-properties`: a real engine bug, fixed above. Proven on the nightly seed with `--db-runs 200` green, plus both replay paths.

## 3. In flight in the CLOUD session (WIP branches PUSHED to origin, Tyler OK 11-20)

Container restarts killed both lanes twice; each resumed from its WIP commits. When one finishes, the cloud session merges it into `claude/nice-einstein-6h7s9n` and pushes. If the cloud session is gone, pick each up from its pushed WIP branch (`git fetch origin <branch>`), re-dispatch into a worktree of it, and finish the brief below.

| Lane | Branch / state | What |
|---|---|---|
| First-hour next step (systems-engineer, default model) | `worktree-agent-a99fe28a5d333f524`, WIP c20bcba4 (pushed) | (1) An outgrown end (Cellar at Level 5) leads with "Go to <next ground>" on the summary and the away card, visible at 1440x900 / 1280x720 / 667x375. (2) A low-stamina return names the stamina-free loops the server says are unlocked. (3) The Hunts window doesn't enable Enter for a ground a member has outgrown, and the refusal names the real reason (was "Wren is not ready"). 18 files: `src/shell/{after-hunt,away-recap,back-in-town,hunt-list,intent-words}.js`, `windows/{away,hunt-summary,hunts,scale-pane}.js`, `src/data/text/*`, `summary.css`, tests in alpha-windows, away-recap-world, hunt-floor-warning, hunt-summary, shell-core, instant-press |
| Luck v2 (game-designer, **Fable**) | `worktree-agent-adfad44d0385f44f7`, WIP 70187bf3 (pushed) | Revising §15 to Tyler's 11-20 rulings (§4). Returns a spec; the Coordinator replaces §15 |

## 4. New rulings (add to `rulings-of-record`)

- **Tyler 2026-11-20, LUCK:** "If it's going to be per account it needs to be adjusted. Either the bestiary only counts per account or they only get 1/4 the kills. My vote is it only counts per account and we should add a similar system that luck I gained from other sinks like salvaging instead of selling (like gw2)." So: ONE Bestiary count per creature per account (every hero's kills add); stages re-sized so four heroes don't earn Luck 4x as fast; a SECOND Luck feed from salvaging instead of selling, with a safeguard so gold- or Crowns-bought gear can't become drop rate. Still open for Tyler from v1: the ceiling (+25% designer's pick), and cutting the dead charm ladder + the four foods' drop buffs.
- **Tyler 2026-11-19, MODELS:** Fable runs design and audit work; build lanes use the default model ("those things don't need to be on [Fable] just the design and audit work for now").

## 5. The four audits (11-19, Fable, read-only)

Page for Tyler: https://claude.ai/artifact/P6xyB6mUTwhdZZtcDK3gbE (private).

| Audit | Headline | File |
|---|---|---|
| Retention & revenue (designer) | Revenue is structurally $0: no Crowns ledger, purchase RPC or checkout. Model: F2P, account-wide Premium ~$5.99/mo (no XP), Founder packs $19.99/39.99/79.99, cosmetics. Loses players at the Cellar end, the 12 h in starter kit, and the day-2 low-stamina card | `audit-2026-11-19-retention-revenue/` |
| Blind playthrough (QA) | No P0. Three P1s at the Level 5 Cellar end (two in the lane above; P1-3: a Level 5+ player has no ground to share with a new friend, and the Thicket's "high death risk" was wrong in play). P2 list incl. phone away card hiding rewards, no level-up moment, no shop-buy confirm | `audit-2026-11-19-playthrough/` |
| Client architecture (systems) | 60 fps, 1.5 s / 3.2 s to HUD. ~616 modules at sign-in, 2.2 MB gzip, comments 45% of bytes: minify at publish (needs the Pages flip), self-host fonts, a boot-path ratchet. Release gate ~2,040 job-min; mutant gate falls back to full on retries | `audit-2026-11-19-architecture/` |
| Server & scale (backend) | ~110-130 accounts online before DB 70% CPU (DERIVED from the 11-02 rig). Walls: watched-hero commits, the 128-instance tick dial, ledger prune. Close 3 dead client-writable tables (`game_events`, `clan_members`, `session_claims`); PITR + a restore drill; a possible just-in-time Blessing via the 32 s seed horizon (read, not executed); drop the 60 s off-screen `hr_load` poll | `audit-2026-11-19-server/` |

**Open with Tyler (from the audits):** the F2P model and prices; the Crowns training items (paid skill XP on ranked boards, the designer says don't launch with them); PITR (a spend); the Pages flip (already open in 11-19 §6); mutation sweeps off the release path (§3.6).

## 6. Notes for whoever runs lanes next

- Agent worktrees were cut from `main`, not the named base: every brief must start with `git merge --ff-only <base>`.
- Subagents' harness refused writing report `.md` files: have them return findings as text and file them yourself.
- Cloud container restarts every hour or two: lanes must commit WIP often and chunk long runs.
- `local-world` needs Node 23.6+ (`/opt/node24` in the cloud).
