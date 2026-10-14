# Quality Checklist: when work is actually done

Read this before reporting a feature, content batch or UI change as done. It adds to the CLAUDE.md gates (lane-done, GitHub, the visual and play gates) and never replaces them. Every line is pass, fail, or "not checked", and every pass names its evidence: a screenshot path, a test or guard name with its exit code, a vitals or analyzer number, or a played step. A line with no evidence counts as "not checked". (Tyler, 2026-10-14.)

## 1. The pass/fail gate (every substantial change)
| # | Check | Evidence |
|---|---|---|
| 1 | It works: the happy path is played, the edge cases are named and tried | play log / test name |
| 2 | It's server-true: every actionable number comes from the envelope and survives a reload | reload repro |
| 3 | It fits the systems: there's a source and a consumer, catalogue-coherence is green | guard exit code |
| 4 | It reads: text is ≥ the minimum size, it's readable at 922×423 and desktop, there's a clear next action | screenshots read |
| 5 | It's consistent: tokens only, the house icon style, no mixed pixel scales, no blur (`ART_DIRECTION.md`) | screenshots read |
| 6 | It's original: no banned filler names, no copied layout, it passes the `DESIGN_STANDARDS.md` §4 purpose test | brief answer |
| 7 | It's balanced: any number change is backed by a sim, the analyzer or vitals, or is marked unverified | numbers |
| 8 | It's safe: no regression in the touched screens + combat + inventory, the error states have been seen | screenshots / tests |

The report says, in separate lists: **done and verified**, **done and not verified**, **assumptions**. "Production-ready" is never written without lines 1–8 carrying evidence.

## 2. The review score (art-director and game-designer reviews only)
Score only things that were looked at or played. Each score gets one line of evidence. Mediocre is 5, not 8.

| Category | Weight |
|---|---|
| Visual consistency | 20% |
| Originality | 20% |
| Readability | 15% |
| Game feel | 15% |
| Purposeful design | 15% |
| Polish | 15% |

The internal target is ≥ 85% with no category below 7. The score is a review signal, not proof of readiness. A builder never scores their own work: the score comes from an independent review pass.

## 3. Fresh-eyes playtest (humans only)
Generated reports never substitute for real players. When Tyler brings new players (Discord), watch or ask them without hints:
1. Where would you go to hunt, and why there?
2. How do you set up how your hero fights?
3. How do you put on better gear?
4. How would you earn more XP, or more gold?
5. What does the bestiary give you?
6. What's the next thing you're trying to do?

Log each answer as understood / confused / wrong on the priority board. A confused answer is a clarity bug.
