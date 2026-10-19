# World Events — Cadence, Join Rules, Topbar Timer & Discoverability

**Backlog #15 (cadence + timer) and #14 (discoverability) · P2 · Owner: Systems (Game Designer, Art) · Wave 2**
**Author: Game Designer · 2026-08-08 · Status: SPEC (buildable blueprint, no code changed)**
**Tyler's direction (binding):** world events run **2× per day**, a player may join **once per day**, and a **countdown timer lives at the top of the screen**.

---

## 1. What exists today (ground truth, read from source)

`src/features/world-events.js` does **not** contain events a player can join. It contains a **passive global modifier**:

- `DAILY[7]` and `WEEKLY[4]` pools of pure `getBonus` deltas (Gathering Surge +25% gather, Scholar's Day +15% all XP, etc.).
- The active entry is derived deterministically: `FNV-1a('hr-daily-' + utcDayKey()) % DAILY.length`. Every client on earth computes the same result with **no server involvement** — a genuinely elegant piece of engineering that should be preserved.
- `window.getBonus` is wrapped with a thin additive layer, so gathering / artisan / combat XP / farming all inherit the bonus with zero further wiring.
- UI is a **banner strip injected at the top of `#panel-profile`**, re-injected every 5 seconds (`setInterval(injectBanner, 5000)`) because home re-renders wipe it, plus one login toast per UTC day.

**There is no join, no timer, no schedule, no participation, no reward, and no server state.** So #15 is not a change to world events — it is the design of a new joinable activity layer. This spec defines that layer and folds the existing modifier into it so the game does not end up with two unrelated things both called "world event".

Also relevant:
- `src/features/raids.js` already proves the async-cooperative pattern this game needs (shared pool, server-clamped contribution, per-member ledger, idempotent claim). Reuse it wholesale.
- Topbar markup: `index.html:175-196` — `.topbar` holds `.player` (avatar/name/clan tag/status pill) and `.top-stats` (CL, TL, Gold, Gems, streak, bell, save, settings). It is already dense.

---

## 2. The design: one event, two layers

Today's world event becomes **the day's event, in two layers**:

1. **The Blessing (ambient, all day, everyone).** The existing passive `getBonus` modifier, unchanged. Free, automatic, no login required, no FOMO. This is the fairness valve: missing the muster costs you a chest, never your day.
2. **The Muster (live, twice a day, join once).** A 45-minute window in which players who join pool their ordinary activity into one shared community objective and earn a chest.

Same name, same fiction, two layers. A player who never engages loses nothing they have today.

### 2.1 The two slots are DIFFERENT events — and that is the point

Slot A and slot B derive from different hash inputs, so they are different musters with different contribution sources. Because you can only join **one**, the once-per-day limit stops being a restriction and becomes a **decision**:

> *"The morning muster is the Ashen Horde — that's combat. The evening one is the Deep Seam — mining and woodcutting. I'm training Mining today, so I'll wait for the evening."*

That single design choice is what makes this feature worth building rather than a timer with a button under it.

### 2.2 The muster pool (original content — no emoji art, "Forge & Stone")

| id | Name | Contributing activity | Flavour |
|---|---|---|---|
| `ashen_horde` | **The Ashen Horde** | combat damage / kills | Cinder-wolves pour off the burnt ridge. The watch-fires are already lit. |
| `long_harvest` | **The Long Harvest** | farming harvests + gathering | Storm on the horizon. Every field must be cleared before dusk. |
| `forge_levy` | **The Forge Levy** | smithing + crafting | The realm has called for arms by nightfall. Every anvil in the valley answers. |
| `deep_seam` | **The Deep Seam** | mining, woodcutting, fishing | A new vein opened under Ironvale, and it will not stay open. |
| `keep_kitchens` | **The Kitchens of the Keep** | cooking | Feed the muster or it marches hungry. |
| `all_hands` | **The Muster of All Hands** | every activity, at half rate | Every hand in the realm, whatever it holds. *(Larger community goal, higher chest.)* |

Each event's ambient Blessing is the `getBonus` delta matched to its own theme (Ashen Horde → `combatXP +0.20`; Deep Seam → `gatherSpeed +0.25`), which lets the existing `DAILY` table be reused nearly as-is instead of maintaining two content sets.

---

## 3. The schedule

### 3.1 Recommendation: **fixed UTC slots, 12 hours apart, at 01:00 and 13:00 UTC. Live window 45 minutes.**

### 3.2 Why fixed UTC rather than rolling-per-player

A rolling schedule (event N hours after *your* daily reset) is always convenient and always lonely. The entire value of a world event is that **the world is in it with you** — the shared progress bar, the clan chat noise, the sense that this is a live game with other people in it. Rolling schedules destroy that, and they are also materially harder to make server-authoritative (every player needs their own validated window instead of one global one). For an online-only social idle-RPG whose north star is OSRS-scale community, fixed slots are correct.

### 3.3 Why 12 hours apart solves the timezone problem completely

Two slots exactly 12h apart means the local times are always 12h apart. Combined with **join-once-per-day**, a player needs exactly **one** convenient slot — not two. 01:00/13:00 UTC delivers that for every inhabited offset:

| Local zone | Slot A | Slot B | Convenient slot |
|---|---|---|---|
| UTC−8 (US Pacific) | 17:00 | 05:00 | **17:00** |
| UTC−5 (US Eastern) | 20:00 | 08:00 | **both** |
| UTC−3 (Brazil) | 22:00 | 10:00 | **10:00** |
| UTC±0 (UK) | 01:00 | 13:00 | **13:00** |
| UTC+1 (CET) | 02:00 | 14:00 | **14:00** |
| UTC+2 (EET / South Africa) | 03:00 | 15:00 | **15:00** |
| UTC+5:30 (India) | 06:30 | 18:30 | **18:30** |
| UTC+8 (China / SEA / Perth) | 09:00 | 21:00 | **both** |
| UTC+9 (Japan / Korea) | 10:00 | 22:00 | **both** |
| UTC+10 (Sydney) | 11:00 | 23:00 | **11:00** |
| UTC+12 (New Zealand) | 13:00 | 01:00 | **13:00** |

No offset is left without a slot between 09:00 and 23:00 local. This is the justification for "2× per day" being exactly the right number: **one slot is unfair, three is noise, two is the minimum that is globally fair.**

### 3.4 Why 45 minutes

30 minutes is the genre standard but assumes a player who is *sitting there*. Hearthrise players are idling — they check in, set an activity, and leave. 45 minutes means a player who opens the game at any point in that window can still join, contribute, and claim without rearranging their evening. It also keeps total daily live-time at 90 minutes (6% of the day), so the countdown stays scarce enough to be worth watching.

### 3.5 Derivation (client and server compute the same thing — no schedule table)

```
SLOT_UTC_HOURS = [1, 13]
WINDOW_MIN     = 45
day_key    = YYYY-MM-DD (UTC)                     // reuse HearthriseWorldEvents.utcDayKey shape
event_key  = day_key + '#' + slot                 // e.g. "2026-08-08#1"
event      = EVENTS[ FNV1a('hr-muster-' + event_key) % EVENTS.length ]
```

The client derives it for display; the server **re-derives it from `now()`** for validation. The only rows stored are participation and claims. This keeps the elegant zero-server property of the current module for everything except the two things that genuinely need authority.

**Server time, not device time.** The countdown must be driven by a server-derived clock. On session start, take the `Date` response header from any Supabase call (or a trivial `select now()` RPC), store `serverSkewMs`, and compute all slot maths from `Date.now() + serverSkewMs`. Without this, a player with a wrong device clock sees a wrong countdown, presses Join, and gets rejected by the server — which reads as a broken feature, not a wrong clock. **Flag to Systems: this is a small piece of infrastructure with no current equivalent in the codebase.**

---

## 4. Joining: what counts, and how it is enforced

### 4.1 Definition

**"Joined" = a row exists in `world_event_joins` for `(day_key, user_id)`.** The row is created by pressing **Join** during a live window. Joining is the commitment; it is what consumes your once-per-day.

Deliberate consequences:
- Joining slot A **blocks slot B** the same UTC day. The primary key is `(day_key, user_id)`, so the database itself is the rule — not application logic that can drift.
- Joining and then contributing nothing still burns the day. The UI must therefore make this unmistakable before the first ever join: a one-time confirm — *"Join The Ashen Horde? This is your muster for today."* Once per account, not once per day.
- Leaving and rejoining is not a thing. There is no leave.

### 4.2 Participation window

Joining opens a **45-minute personal participation window** (clipped to the end of the muster). While it is open:
- Your ordinary activity feeds the shared bar. **You do not play a minigame.** Kills, gathers, cooks, smiths, crafts, harvests already fire counters (`updateDaily` / `updateQuest` call sites in `legacy.js`); those same call sites batch a delta to the server every 30s.
- You get a small live aura: **+10% all XP while mustered.** Visible, immediate, and the reason joining feels good in the first 10 seconds rather than at the end.
- A **Rally** button gives one large one-shot contribution (a single `simulateStrike`-shaped roll of your real stats, exactly like `raids.js`), so a player with 60 free seconds can still participate meaningfully. One Rally per muster.

### 4.3 The community bar

`progress / goal`, where `goal = max(MIN_GOAL, GOAL_PER_PLAYER × participants)`, with `GOAL_PER_PLAYER = 2,000` points and `MIN_GOAL = 6,000`.

**The goal freezes 10 minutes into the window.** Everyone who joins after that raises progress but not the goal, so late joiners are pure help. This is what lets the same content work for a 5-player beta and a 5,000-player launch without a rebalance.

### 4.4 Contribution points (tuned so ~30 min of ordinary play ≈ Silver)

| Source | Points |
|---|---|
| Monster killed | `10 × monster.tier` |
| Damage dealt (combat tick) | `dmg / 20` |
| Gathering action (log/ore/fish) | 4 |
| Artisan item (cook/smith/craft) | 12 |
| Crop harvested (per produce item) | 6 |
| **Rally** (one-shot) | `floor(simulateStrike() / 12)` — typically 80-800 by gear |

Only the *active* event's sources score. `all_hands` scores everything at ×0.5.

### 4.5 Server enforcement (this is the whole security model)

| Rule | Where enforced |
|---|---|
| Can only join a **currently live** slot | `world_event_join` RPC recomputes the slot from `now()`; a client-supplied `event_key` that is not live is rejected. **Never trust the client's clock.** |
| Once per UTC day | primary key `(day_key, user_id)` — conflict returns `already_joined` |
| Must have joined to contribute | `world_event_contribute` checks the join row and that `now()` is inside the participation window |
| No fabricated contribution | per-call delta clamp (**≤ 400 points**) and a per-muster total cap (**≤ 6,000 points**), mirroring `raid_strike`'s hard 50k clamp |
| One claim per join | `claimed boolean` flipped by a conditional update, exactly like `raid_contributions` |
| Guests | **The community layer requires sign-in.** A signed-out player may run a *labelled solo muster*; they never touch the shared bar, the participant count, the median, the leaderboards or a Muster Seal. See the ruling below. |

> **Designer ruling, 2026-08-08 — the b220 guest-solo-join deviation is RATIFIED, and this table row is rewritten above to match.**
>
> The spec originally hard-gated the whole feature behind sign-in. The implementer instead let a signed-out player join a muster labelled *"(solo muster)"* which grants the floor band only (`SOLO_BAND` — 1,500 gold, 2 gems, **0 seals**), shows *"Solo muster — the shared community bar needs a signed-in session"* in place of the bar, and keeps the sign-in upsell on screen. Citing the raids precedent (the solo Lone Hunt), which is correct.
>
> **Why the deviation is better than what I specced.** The sign-in gate was written to protect the *community* layer, and the implementation protects exactly that — no shared bar, no participants count, no median, no Seal, none of which can be honest without a server. But hard-gating the whole feature would have aimed the topbar countdown — Backlog #15's headline ask, deliberately visible to everyone — at a locked door, for precisely the player it exists to convert. A labelled solo muster shows that player what they are missing *while they are missing it*, which is a conversion funnel; a wall is not. My own §6.2 already rules that there is no "you missed it" state, for the same reason.
>
> **Three conditions, binding on any future change:**
> 1. **The solo band is the FLOOR band and nothing else.** No Silver, no Gold, no "the realm held" multiplier, and never a Muster Seal — those four are all measured against other players, and a session with no other players cannot measure them.
> 2. **The label and the upsell stay.** A solo muster that reads as the real thing is a fake, and the Final Directive forbids fakes. The player must be able to see, without asking, that there is a bigger version of this.
> 3. **Nothing solo is ever written to a server-facing surface** — not the community bar, not the participant count, not leaderboards.
>
> *Not blocking, flagged to Systems:* a signed-out session derives its window from the local clock, so a clock-rolled guest can re-claim the floor band. This is the same class as the P3 solo-raid-claim hole and is not muster-specific — the underlying question is whether a locally-earned save is trusted on first sign-in. That is one economy-integrity question for Systems, not three feature-level patches.

---

## 5. Rewards — sizing for the new scarcity

### 5.1 Where this must sit in the economy

Measured from the live data:

| Existing source | Cadence | Payout |
|---|---|---|
| One daily task (`legacy.js:1207-1217`) | 3/day | 350-900g |
| Daily login (`daily-reward.js:27-33`) | daily, 7-day cycle | 500-20,000g, 0-30 gems |
| Weekly quest (`legacy.js:10799-10803`) | weekly | 2,500-5,000g, 3-5 gems |
| Clan raid chest (`raids.js:30-38`) | weekly | 10,000-14,000g, 25-30 gems, rare mats |

A **daily** world-event chest must land above a daily task and clearly below the weekly raid chest.

### 5.2 The chest

Three additive bands. Contribution tiers are measured against the muster's **median contributor**, not an absolute number, so they mean the same thing on a quiet beta night and at launch scale.

| Band | Condition | Gold | Gems | Other |
|---|---|---|---|---|
| **Answered the call** | joined + any contribution | 1,500 | 2 | — |
| **Silver rally** | ≥ 60% of median | +1,500 | +2 | — |
| **Gold rally** | ≥ 150% of median | +2,000 | +2 | 1 event-tier material |
| **The realm held** | community goal met (everyone who joined) | ×1.5 on the above | +2 | **+1 Muster Seal** |

**Daily ceiling: ~7,500 gold, 10 gems, 1 Muster Seal, 1 material.**

Sanity check against the economy: 10 gems/day ≈ 300/month, the same order as daily login (up to 45/week) and well under the 500-1,000 gem cosmetic prices in `legacy.js:312-316` — so events accelerate cosmetic access without collapsing it, and gold roughly doubles a casual player's daily income from ~2,000 (dailies) to ~9,500. That is a reward worth planning a login around, and it is still ~half a weekly raid chest per week.

### 5.3 Muster Seals — the value goes here, not into gems

`muster_seal` is a **new bind-on-pickup currency**, max 1/day (~30/month). It buys from a Muster Quartermaster: cosmetics, seed bundles, a **Farmer's Deed** (currently a 0.1%-per-kill drop — a guaranteed alternate route is a genuinely good sink), and tier-appropriate materials. Price items 10-60 seals.

Putting the headline value in a PvE-internal currency rather than gems is deliberate: it keeps events *desirable* without inflating the currency that is also sold for money.

**Hearth Tokens are never awarded. Not at any band, not for the community goal, not ever** (Final Directive: IAP-only, never PvE-minted).

### 5.4 Anti-abuse for rewards

- Alt-stuffing does not pay: rewards are personal and modest, and every extra participant *raises* the community goal by `GOAL_PER_PLAYER`. Stuffing makes the goal harder for the stuffer's own main.
- The median band is computed over contributors with **≥ 200 points**, so a swarm of near-zero alts cannot depress the median to farm Gold rally.
- The unclaimed chest expires at the next UTC day roll. One outstanding chest maximum.

---

## 6. The topbar timer (Backlog #15's headline ask)

### 6.1 Placement

One compact **event pill**, inserted as the first child of `.top-stats` (`index.html:186`), so it reads left-to-right as *"what's happening"* before *"what I own"*. It must never grow taller than the existing `.t-stat` chips.

- **Desktop:** `[glyph] MUSTER · 03:41:12` (or state text).
- **Mobile** (`max-width:540px`): glyph + time only; the label word is dropped. The topbar is already tight there.
- Clicking the pill opens the **World Event modal** — reuse the existing scrim pattern (`hr-rn-scrim` in `renown.js`, `hr-dl-scrim` in `daily-reward.js`). Do not invent a third overlay pattern.
- Tick the pill's text node at 1Hz. Do not re-render the topbar; `updateTopbar()` (`legacy.js:1582`) writes five elements and is called from a dozen places — keep the timer out of it.

### 6.2 States (all seven — every one must be designed, including the boring ones)

| # | State | Pill copy | Treatment | Action on click |
|---|---|---|---|---|
| 1 | **Upcoming** | `Muster in 3:41:12` | quiet, `--ink-3` | modal: what the next two musters are, and which activity each rewards |
| 2 | **Upcoming, imminent** (T−15m) | `Muster in 14:02` | warms to `--gold-2`; toasts once at T−15m and T−5m (respect a Settings opt-out) | same |
| 3 | **Live · joinable** | `LIVE · 41:20 left` | gold, gentle pulse — **the loudest the topbar is ever allowed to be** | modal with the primary **Join** button |
| 4 | **Live · joined** | `Mustered · 41:20` | gold, no pulse; shows your contribution | modal: community bar, your contribution, **Rally** |
| 5 | **Live · already joined today** | `Live · joined this morning` | muted, no CTA. Then `Next muster 7:12:00`. | modal, read-only. **No nagging.** An idle game must never punish a player for having played earlier. |
| 6 | **Reward ready** | `Reward ready` | gold with a claim dot — outranks state 1 | modal with **Claim** |
| 7 | **Signed out** | `Sign in to join` | quiet, no countdown urgency | sign-in flow |

State 6 outranks state 1; state 3 outranks everything.

**Deliberately absent: a "you missed it" state.** After both slots pass unjoined, the pill silently returns to state 1 for tomorrow. Guilt is a churn mechanic, not a retention mechanic.

---

## 7. Discoverability (Backlog #14) — the harder half

### 7.1 What is actually wrong (measured, not assumed)

1. **The Dungeons nav button is injected and then hidden.** `src/dungeons.js:355-365` creates a `nav-btn[data-tab=dungeons]` in the sidebar; `src/styles/theme-cozy.css:268-271` sets `.nav-btn[data-tab="dungeons"], .bn-btn[data-tab="dungeons"] { display:none !important }`. The *only* route to dungeons is a secondary `btn btn-sm` appended to the combat style ribbon by `src/nav-consolidation.js:19-46`.
2. **On mobile there is no route at all except that ribbon button.** The bottom nav is Home/Character/Combat/Skills/Farm/More (`index.html:392-396`) and the More modal offers Items / House / Social / Store (`index.html:407-410`). Dungeons appears in neither.
3. **The weekly clan raid lives inside the hidden panel.** `raids.js:179` renders the raid card into `#panel-dungeons`. So the game's flagship *social* feature is nested inside a *combat sub-panel* that has no navigation entry. A player can be in a clan for a month and never learn raids exist.
4. **World events are a passive strip on Home** that re-injects itself every 5 seconds and cannot be interacted with — trivially scrolled past, and it teaches the player that the words "world event" mean "a line of text".

### 7.2 Recommendation: one top-level **Events** destination

Do **not** build an "Adventure hub" that adds a hop. Restore a top-level entry, rename it, and let it own everything scheduled or instanced:

**`Events`** — nav group *Adventure*, directly after *Combat*. Contents, in this order:

1. **Today's muster** — the live/upcoming card with the same countdown as the topbar, both slots shown, Join / Rally / Claim.
2. **The Blessing** — today's and this week's ambient bonuses (the existing banner content, relocated here from Home where it is noise).
3. **Weekly clan boss** — the `raids.js` card, moved out of `panel-dungeons` (see `clan-boss-events.md`).
4. **Dungeons** — the existing `DUNGEONS` list, with locked entries shown.

Concrete changes:
- Delete the two hide rules at `theme-cozy.css:268-271` for `dungeons`; relabel the injected button to **Events**.
- Keep `nav-consolidation.js`'s combat-ribbon shortcut but relabel it `Events →` so the old path still works.
- **Mobile:** add **Events** to the More modal grid (`index.html:407-410`), and put a state dot on the More button whenever a muster is live or a reward is unclaimed. The More button is the only spare surface in a 6-tab bottom nav; use it rather than fighting for a seventh tab.

### 7.3 Home-screen surfacing

`src/features/home-dashboard.js` already renders a prioritised **"Next up"** list of `hd-card` rows with CTAs, and the daily reward already claims the top slot via `hd-daily` (`home-dashboard.js:311-329`). Extend that exact pattern — no new component:

| Priority | Condition | Row |
|---|---|---|
| 1 | muster live, not joined | `The Ashen Horde is mustering — 38:12 left` · **[Join]** |
| 2 | reward unclaimed | `Muster chest ready` · **[Claim]** |
| 3 | in a clan, boss alive, no strike today | `Weekly boss: The Emberclad Tyrant — 62% remains` · **[Strike]** |
| 4 | muster upcoming | quiet row: `Next muster in 3h 41m — The Deep Seam (mining, woodcutting, fishing)` |

Row 4 is the important one: it teaches the player *what tomorrow's decision is* before they ever press Join. Row 3 alone fixes the "nobody knows raids exist" problem for every clan member.

### 7.4 First-unlock guidance

Dungeons gate on combat level 25-45 plus a key item; raids gate on `REQ_COMBAT_LV = 30` (`raids.js:42`). Today nothing announces any of it.

- **Show locked content, don't hide it.** The Events panel lists dungeons and the clan boss with their requirement (`Combat Lv 30 — 4 levels to go`) and a live progress bar. Hidden content is nothing; visible locked content is a goal. This is the same principle already used well by the crops guide (`legacy.js:2061-2070`).
- **Fire a one-time unlock moment** at CL 25 and CL 30: a toast plus a top-priority Next-up card routing to Events. Store the flag in `G.stats`/`G.flags` so it fires once per character.
- **The topbar timer is itself the discovery mechanism** and must be visible from level 1, before anything is unlocked. A level-3 player who watches a countdown reach zero every day will find out what it is. State 1's modal should say plainly what the muster is and what it needs (no level requirement to join a muster — musters are open to everyone; only dungeons and the clan boss gate).

---

## 8. Server work (hand-off to Systems)

Additive; nothing destructive.

```sql
-- 8.1 world_event_joins  (the once-per-day rule IS the primary key)
--     day_key text, user_id uuid, event_key text, joined_at timestamptz,
--     points bigint default 0, claimed boolean default false,
--     primary key (day_key, user_id)
--     RLS: readable; NO direct client insert/update — RPCs only.

-- 8.2 world_event_totals  (the shared community bar)
--     event_key text primary key, participants int, goal bigint,
--     goal_frozen_at timestamptz, progress bigint, met_at timestamptz

-- 8.3 world_event_join(p_event_key text) -> jsonb
--     Recompute the live slot from now(); reject if p_event_key is not live.
--     Insert join row (conflict -> already_joined). Bump participants; recompute
--     goal unless goal_frozen_at has passed.

-- 8.4 world_event_contribute(p_event_key text, p_points int) -> jsonb
--     Membership-of-join check + window check. p_points := least(p_points, 400).
--     Enforce per-muster total cap 6000. Add to totals.progress; set met_at when
--     progress >= goal. Same clamp philosophy as raid_strike.

-- 8.5 world_event_claim(p_day_key text) -> jsonb
--     Idempotent conditional flip of claimed=false -> true; computes the band
--     from the median of contributors with >= 200 points; returns the reward.
--     Reward computation MUST be server-side — never trust a client-computed band.

-- 8.6 server time: a trivial `select now()` RPC (or reuse any response Date
--     header) so the client can compute serverSkewMs. No table needed.
```

**Client work Systems owns:** the topbar pill + 1Hz text tick, `serverSkewMs`, the Events panel, the batched 30s contribution flush wired into the existing `updateDaily`/`updateQuest` call sites, the Home "Next up" rows, and the nav/CSS changes in §7.2.

---

## 9. Test coverage required (per `CLAUDE.md`)

1. **Slot derivation.** Freeze the clock at 00:59, 01:00, 01:44, 01:46, 12:59, 13:44 UTC and assert the state machine returns upcoming / live / live / upcoming / upcoming / live.
2. **Two slots are different events.** Assert `eventFor(day,'0') !== eventFor(day,'1')` across 30 consecutive days.
3. **Regression — once per day.** Join slot A, then attempt slot B → rejected with `already_joined`.
4. **Regression — cannot join a dead slot.** Submit a stale `event_key` → rejected regardless of client clock.
5. **Contribution clamp.** Submit 10,000 points → recorded as 400; submit until the 6,000 cap → further calls add zero.
6. **Claim idempotency.** Claim twice → second returns `already_claimed`, gold/gems granted exactly once.
7. **Timer states.** Drive all seven states in §6.2 and assert the pill copy + that state 3 outranks state 6 outranks state 1.
8. **Discoverability regression.** Assert a top-level `Events` nav entry exists and is **not** `display:none` — this is precisely the failure mode that produced #14, and it must have a tripwire.

---

## 10. Hand-offs & flags

- **Systems:** everything in §8; the `serverSkewMs` infrastructure (§3.5) has no current equivalent and is the easiest thing on this list to overlook; the contribution flush must piggyback existing counters rather than add new ones.
- **Art Director:** the topbar pill in seven states without growing the topbar (§6), the Events panel layout, the mobile More-button state dot, and a Muster Seal icon for `assets/icons-bundle/`. No emoji.
- **Game Designer (me):** owns `SLOT_UTC_HOURS`, `WINDOW_MIN`, the contribution point table (§4.4), `GOAL_PER_PLAYER`, and the reward bands (§5.2). First re-tune after one week of live participation data; the lever if participation is low is `WINDOW_MIN`, not the reward.
- **Semantic conflict — the word "world event" is currently overloaded.** `HearthriseWorldEvents` is a passive `getBonus` wrapper, and `raids.js` reads `_hash`/`utcDayKey`/`utcWeekKey` from it as a shared clock utility (`raids.js:44-50`). Renaming or restructuring that module **breaks raids**. Recommendation: keep `HearthriseWorldEvents` as the clock+Blessing module and add `HearthriseMuster` alongside it. Raise in `CONFLICTS.md`.
- **Cross-spec dependency:** §7.2 moves the raid card out of `panel-dungeons`, which `clan-boss-events.md` also depends on. These two must ship in the same wave or the raid card lands in a panel that no longer exists in the IA.
