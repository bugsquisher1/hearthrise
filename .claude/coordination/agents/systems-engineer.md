# Systems Engineer — running log

_Your private journal. Newest at top. Team-wide items also go to `DISCOVERIES.md` / `HANDOFFS.md`._

## Standing knowledge
- Content authored ONCE in `src/data/*`; `main.js` identity-merges ESM into `window.__LEGACY_INLINE`. Never reintroduce the data double-copy (top-level `const` shadowing). Guard test asserts identity.
- Theme: `:root` = dark tokens; `body[data-theme="cozy-light"]` for retired light. Guard tests fail if unscoped patterns return. When a visual bug recurs, find what re-asserts it — don't stack overrides.
- Economy server-authoritative (Supabase, `schema.sql` applied); no PvE Hearth Token mint; race-safe market + seller ledger.
- Save: `snapshotG` = manual 24-field allowlist (fragile); new state must survive save/load.
- Don't rewrite working architecture without strong evidence. Think at 10× content.

## Standing debt (b214 audit, grade C−)
`showTab` wrapped 23×; `wrapShowTab`/`HearthriseIdentity` built, 0 consumers; 27 files use `localStorage` directly vs 3 on the seam; ~3,000 lines inert cozy-light CSS deletable; gear wield/level-requirement seam unbuilt.

## Log
### 2026-08-08 · Wave 1b — raid economy hardening (server-authoritative) · branch `worktree-agent-a285ce3822eaee1fb`
Closed the Game Designer's three live production exploits **plus a fourth I found while writing the SQL**. Files: `supabase/migrations/2026-08-08-raid-hardening.sql` (new), `supabase/schema.sql` (kept canonical — the two agree), `src/features/raids.js`, `src/features/smoke-test.js`. No balance number changed.

**The shape of the fix.** Everything the client was *trusted* with moved into Postgres; `raids.js` is now explicitly a mirror for UX.
- **P1 unlimited strikes** — `raid_strike` derives the UTC day itself (`hr_utc_day_key`, byte-identical to `HearthriseWorldEvents.utcDayKey`: unpadded `2026-8-8`) and gates on it. The gate IS the contribution upsert: `on conflict … do update … where last_strike_day is distinct from excluded.last_strike_day` — Postgres row-locks before evaluating the WHERE, so two concurrent same-day strikes cannot both pass; `row_count = 0` ⇒ refuse. **Critical sub-finding:** a day gate keyed on a client-supplied `p_week` is no gate at all — invent a fresh week key per request and you get a fresh gate. `p_week` is now validated against the server's own key, never trusted.
- **P2 chest-hopping** — new `raid_claims` table, PK `(user_id, week_key)`. The primary key *is* the rule: one chest per player per UTC week regardless of how many clans you join. `raid_claim()` additionally requires membership `joined_at <= clan_raids.downed_at` (turning up after the kill earns nothing) and ≥1 recorded strike on that pool. The client's direct `PATCH raid_contributions` policy is **revoked** — which also stops a tampered client forging the `damage` figure the Wave-3 bands will read.
- **P3 solo claim replay** — solo claims go into the same server ledger (`scope='solo'`). `G.raids.claimed[wk]` is now a render mirror only.
- **P4 pool forgery (new, mine)** — `raid_strike` took the pool size from the *client* (`p_max_hp`). The first striker of the week could declare a 1-HP boss and hand the whole clan a free chest. `p_max_hp` is now accepted-for-signature-compatibility and **ignored**; 250,000 is a server constant (same number, so not a balance change).

**Backward compatibility — deliberately engineered, this was the hard part.** `raid_strike` keeps its EXACT 5-arg signature (a changed signature would 404 for every cached client). `raid_claim` is NEW, so the client feature-detects it (404 / `PGRST202` → falls back to the b209 PATCH) with a 10-min negative-probe expiry so a session open across the migration self-heals. Pure reducers `_reduceStrike` / `_reduceClaim` carry the contract and are directly unit-tested, including the pre-migration response shape (`{ok,hp_remaining,downed}` with no `day`/`week`/`max_hp`). **Order matters: ship the client, THEN run the migration** — the legacy PATCH policy is revoked by the migration, and it is safe to revoke because per the designer's audit no clan pool has ever been downed in production.

**Two design decisions worth remembering.** (1) The mirror now moves *after* the server accepts, not before-with-rollback — a failed request can no longer lock an honest player out of a real strike. (2) Clock disagreement is reconciled with a *self-expiring* correction (`clockFix` keyed on the local key it disagreed with) and exactly ONE bounded retry, never a loop.

**Verify:** smoke **179/179**, 0 runtime errors (both new tests confirmed to FAIL when the guard they protect is removed — I broke each and re-ran). `bump-version.sh --check` OK. Browser (own static server :8133): clock matches `HearthriseWorldEvents`, offline/anon solo path — strike lands, second same-day strike refused, chest pays 4,000g/10 gems (0.4× Hollow Regent) exactly once, replay refused, card re-renders to "Chest claimed"; console clean. Did NOT bump build/CHANGELOG.

**Known limitation, stated plainly:** `grantReward` still applies gold/gems/items *client-side*. The server now decides *whether* and *how often* a chest is granted, which is what closes all four exploits — but a fully rewritten client can still mint its own inventory. That is the pre-existing "full server inventory authority is the next pass" gap noted in `schema.sql` §3, not something this migration regressed.

**Handoff — Art Director (not mine, not touched):** `#hr-raid-card` renders **16px tall** (collapsed) inside `#panel-dungeons`, whose used `grid-template-rows` gives row 1 only 26px against a 159px card. Reproduced identically on pristine b218 at :8134, so it is pre-existing and NOT from this change; an inline `grid-column:1/-1;display:block` does not fix it, so the fix is in CSS, which is off-limits to me this wave. Note `world-event-cadence.md` §7.2 plans to move this card to the Events panel anyway — fix it there rather than twice.

### 2026-08-08 · Wave 0 — backlog #3 (sub-tab snap-back) + #4 (companion tab) · branch `worktree-agent-a5fe79b25379a4838`
Both fixed. Files: `src/legacy.js` (buildTibiaDoll), `src/styles/theme-cozy.css`, `src/features/smoke-test.js`.

**#3 root cause:** the equipment doll (Equipment | Stats | Companion sub-tabs, `buildTibiaDoll()` ~L7280) is rebuilt from scratch on every panel re-render. On the Inventory page that re-render fires from the wrapped `updateTopbar`/`addItem`/`equip`/`unequip` (i.e. every resource gain / kill while idle-training), and each rebuild hardcoded the Equipment pane `active` — snapping the player back within seconds. NOT an idle-timer bug: 7s idle on inventory = 0 rebuilds; the trigger is activity. **Fix:** persist selected pane in `window._tdPane` (same `window._*` UI-state convention as `_invFilter`/`_invMultiSelect` — no new global pattern) and restore it via `applyPane(activePane)` on build.

**#4 root cause:** the Companion sub-tab pane held ONLY the companion equip slot (a lone icon) — no companion level/XP/stats. Beside the doll, `invc-stats-col` always shows the PLAYER's Hero/Weapon-Styles/Bonuses sheet, so opening "Companion" left the player looking at their own stats. All companion progression data already exists and is exposed on window by the companions ESM module (`companionLevelFromXp`, `companionXpToReach`, `getCompanionBonus`, `COMPANIONS[id]`), rendered correctly in the Stable + profile card but never wired into the doll tab. **Fix (contained, per task):** render the equipped companion's own name/level/XP-bar/effective-bonuses/proc into the pane, reusing those existing functions. Styled with tokens, scoped `body[data-theme="hearthlight"]`. No invented fields → nothing routed to Game Designer.

**Verify:** smoke 177/177 (added 2 b218 regression tests), 0 runtime errors; `bump-version.sh --check` OK. Browser (own server :8132, cache-busted, confirmed live code): Companion + Stats sub-tabs survive real `addItem`/`updateTopbar` re-renders and a 6s wait; Companion pane shows "Fox Lv 1 · UTILITY · 0/50 XP · +1 STR +2% XP +1 gold"; console clean. Did NOT bump build version / CHANGELOG (Coordinator does at integration).

### 2026-08-08 · bootstrap
Domain seeded. No active task. Base green at `119a698`.
