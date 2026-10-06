# SEC — M5 client (lane/m5-live-subscribe @0c90a675): **GO-WITH-CHANGES**; frame_push flip **NO-GO** until F1–F6 hold

| # | Question | Ruling | Evidence |
|---|---|---|---|
| 1 | Another user/slot's frame applies? | **REFUTED.** Only own topic is receivable and nobody can send. The client re-checks topic = current uid:slot on every frame, and the channel is left before a slot switch or sign-out. | Live `pg_policies`: one SELECT policy on `realtime.messages` (`auth.uid()`, `^[0-5]$`, 3 segments), no INSERT. `hr_frame_emit` sends `private=true`. `multi-character.js:396` resets before `activeSlot` moves. |
| 2 | Bag frame "merges upward" (§6) | **Not reachable today, but a real latent violation.** Once the bag is armed, a frame with `inventory` goes through `reconcileInventory` with `baselineComplete=false`, so it merges upward. `FRAME_KEYS` cannot carry `inventory_complete`. Live `hr_tick_config_frame_keys_known` allows `inventory`/`bank`, so one config UPDATE plus the arm makes it live. | `accrue.js` `applyFrame` → refuses as `premature`; `isInventoryAbsolute()` is false while `INVENTORY_ARM_STAGE` is off; live `frame_keys={state,skills,buffs,place}`. |
| 3a | `answer` verdict | **Safe.** It cannot roll state back (only applies at v = floor), and it cannot hang a receipt twice (single-use hold; L3 mutations are caught). Minor: an S1 refusal at the floor uses up the hold, so the real answer's receipt is dropped. That loses part of the display, not value. | `classifyFrame` / `commitFrame` diff; `--selftest` exit 0 (14/14) |
| 3b | `healStuckFloor` | **CONFIRMED rollback.** The healer fires on *legitimate* reorders (a newer answer beating an older frame). It resets the floor to -1 before the hello returns, so any stale frame or HTTP answer in flight then applies as `fresh`. It also fires with **frame_push=false**: the 15 s watchdog acts on reorders counted by the HTTP applier, and the channel still joins. | Executed repro on the branch code: floor 20 / gold 200 → frames 17,18,19 → heal → delayed frame 16 applies: **floor 16, gold 1016**. HTTP only: v50 → 47,48,49 → watchdog heal → late v46 applies: **gold 946 vs truth 500**. |
| 4 | D4 rewrite a loosening? | **No.** Both D4 assertions are unchanged; only the messages changed. **The "hole closed" claim goes too far:** the heal only runs while the channel is joined (Realtime down or the 200-user cap means no heal), and the heal itself is 3b. | `frame-drop-streak.mjs` diff; guard exit 0 |
| 5 | Cost of hello per re-join | **Bounded, no new attacker capability.** hr-accrue is already directly callable; requests are coalesced in flight; server `hr_rate_gate('accrue')` applies. **But** each SUBSCRIBED resets `attempt=0`, so a subscribe→close flap sends about 1 hello/s until the rate gate pushes back. Under the budget freeze that is real Edge spend. | `live.js` `onStatus`/`scheduleRetry` |

**Changes before client ship:**
- **C1.** The healer must not open the floor before the re-read lands. Keep the floor, send a forced hello, and let only *its* answer lower the floor, and only if nothing fresher has been applied since the heal began. Add a guard reproducing 3b (a delayed stale frame or answer between heal and answer must not write G), with a mutation proof.
- **C2.** Hello rate: reset `attempt` only after the channel has stayed joined for at least 30 s, or limit hellos to at most 1 per 30 s.

**frame_push=true only when:**
- **F1.** C1 and C2 are live and played.
- **F2.** `frame_keys` contains neither `inventory` nor `bank` until two things are true: the §7a full ABSOLUTE flip, and the client refuses any bag frame without a frame-carried `inventory_complete===true`.
- **F3.** Condition 8b is re-measured (emit-from-envelope p95 ≤ 10 ms, both peak and quiet hour).
- **F4.** Reliability signs Realtime capacity against the live project limits (`max_concurrent_users=200`, `max_events_per_second=100`) at zero spend, and decides on `private_only` (currently null; public-channel isolation rests on Supabase's documentation, not on a test).
- **F5.** The flip is its own config write with a read-back; the kill is `frame_push=false`.
- **F6.** `flush_seconds` stays 90 at the flip. Going below 60 follows ARM ruling 4 only: floor 30 s, all five conditions, gather armed first, and a separate write.
