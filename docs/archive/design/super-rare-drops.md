# Super-Rare Drops — the "WOW I got something super rare" system

Status: DESIGN SPEC (not built). Priority: **behind** the server-authority + pre-scale
program. This is content/retention design to slot in **after integrity lands** — it is
written to be buildable when scheduled, not before.

Author: Game Designer. Date: 2026-08-17 (b374).

Tyler's brief (verbatim): *"we need to make sure we are implementing some top tier super
rare drops... I just looted [an 'Otherworldly gloves'] in idle clans and it's super
exciting because the drop rate is so low. lets make sure we are making our game have those
'WOW I got something super rare' moments."* He screenshotted it and posted to Discord — **the
SHARE is part of the thrill.** This doc treats the reveal, the broadcast, and the share as
one loop, not three features.

---

## 0. AUDIT — what already exists (read, not assumed)

| Piece | Where | State | Reuse verdict |
|---|---|---|---|
| Rarity tiers | `src/features/rarity.js` | **Present.** 7 tiers: common→unique, colour + glow tokens, `window.RARITY.of/classFor/colorFor`. Value-threshold auto-assignment + explicit `ITEMS[id].rarity` + a `UNIQUE{}` named-override map. | **Reuse + extend.** Add one tier on top. |
| Drop tables | `src/data/monsters.js` | **Present.** `drops:[{id, ch}]` rows; `ch` is a float chance. Rare rows already go to `.005`–`.02` (e.g. `goblin_totem .01`, `hell_ember .005`, `ancient_fragment .015`). | **Reuse.** New tier = new low-`ch` rows. Pure data-add. |
| Drop-chance semantics | `src/core/drops.js` | **Present + authoritative.** `DROP_BAND_MAX={rare:.05,...}`, `dropBand(ch)`, `effectiveDropChance`, `rollDropTable` — **already emits `events:[{type:'drop', id, band, rare}]`.** ONE definition shared by the live client and the Edge-Function away path. | **This is the hook.** The reveal reads the event `band`; we add a `mythic`/`fabled` band above `rare`. |
| Server-side roll | `src/core/combat-sim.js` → `rollDropTable` | **Present.** The kill resolver already calls `rollDropTable` with an injected seeded `ctx.rng`; the Edge Function (`hr-accrue`) runs the *same* core for away kills. Drops are **already server-computed** for the away path. | **Critical: the roll is already trustworthy where it matters.** See §5. |
| Collection Log | `src/features/collection-log.js` | **Present.** Browsable bestiary+items, completion %, milestone rewards, `???` unknown slots, first-discovery toast via a `notify(...,'loot')` hook on `addItem`. | **Reuse.** A fabled drop is a headline collection entry; the log is where a chase item gets remembered. |
| Combat drop reveal | `src/features/combat-render.js` | **Present.** Renders drop rows with rarity bands (`r-rare`, `r-vrare` at `ch>=.01`), a per-kill drop modal. | **Reuse + escalate.** Today rare=coloured row. We add the fanfare beat above it. |
| Reveal-moment infra | `src/features/death-sheet.js` (b373), level-up notice (b374) | **Present + proven.** A full-screen scrim + `describeX()` pure-model + tokens-only renderer pattern. Death sheet = "receipt + door" scrim. | **Reuse the pattern directly.** The fabled sheet is a sibling of the death sheet. |
| Chat / broadcast | `src/net/supabase-chat-backend.js`, `src/chat.js` | **Present.** `chat_messages` table, channels `global|trade|clan:<id>|whisper`, realtime INSERT subscription, server-validated body. | **Reuse as the broadcast transport** — a system message row (see §3). |
| Clans | `src/features/clans.js`, `clan-seat.js` | **Present.** Clan membership, `clan:<id>` chat channel, server-authoritative seat/deposit RPC pattern. | **Reuse** for clan-scoped broadcast. |
| Toasts / notify | `src/features/toasts.js`, `window.notify` | **Present.** Typed toasts (`loot`, `gold`, ...). | **Reuse** for the low-tier "glint". |
| Bestiary Charms | mentioned as "approved" | **NOT FOUND as a built system.** Only a naming echo in `library2-items.js` ("Charms & amulets, Tibia's bestiary-charm idea as equipment"). | Treat as **not present.** Do not couple this design to it. |
| Kindling/Beacon ember events | mentioned as "approved" | **NOT FOUND as a built system** in code (`world-events.js`, `renown.js` reference embers/beacons thematically but no ember-drop event engine exists). | Treat as **not present.** A future hook (§6), not a dependency. |

**Headline of the audit:** the plumbing is 80% there. `rollDropTable` already returns a
per-drop `band`/`rare` event, already runs server-side for away kills, and we already have a
scrim-reveal pattern (death sheet) and a realtime message bus (chat). The missing pieces are
(a) one rarity tier + a handful of items, (b) a fanfare tier on the reveal, (c) a
server-attested broadcast message type, (d) a share-card generator. Nothing here needs a new
engine.

---

## 1. THE RARITY LADDER

### The new top tier
Add **one** tier above `unique`, the chase apex:

- **`fabled`** — label "Fabled", colour a shifting iridescent/prismatic (distinct from
  unique's teal and mythic's red so it reads instantly as "different"). This is the tier that
  earns the full fanfare + broadcast + share card. Everything below it stays exactly as-is.

`rarity.js` `ORDER` becomes `[...existing, 'fabled']`. Add the `TIERS.fabled` entry (colour +
a stronger glow token) and a `.rr-fabled` CSS rule with an animated sheen (the only animated
frame — animation itself signals "this is the special one").

### Target drop rates (the randomness IS the thrill — no pity on top)
| Band | `ch` range | Reveal | Broadcast | Feel |
|---|---|---|---|---|
| common / always | `> .15` | nothing | no | routine |
| uncommon | `.05–.15` | coloured row (today) | no | "nice" |
| rare | `.01–.05` | coloured row + subtle glint | no | "oh good" |
| **very rare** | `.001–.01` | **glint + short chime** | no | "oh nice!" |
| **fabled** | **`≤ .001` (sub-0.1%)** | **full fanfare sheet** | **yes** | **"WOW"** |

- Fabled rows sit at **1/1,000 to 1/5,000** per eligible kill (`ch` `.0002`–`.001`). Idle
  Clans' Otherworldly-class items sit in this neighbourhood; that's the reference feel.
- **No pity, no bad-luck protection, no ramping odds on the fabled tier.** A guaranteed-if-you-
  grind chase item is not a chase item. The story Tyler wants to tell on Discord is *"the drop
  rate is so low"* — pity erases exactly that story. (Pity mechanics remain fine for
  mid-game progression items; they must never touch the fabled band.)
- Keep fabled rows OFF the `min(0.95,...)` drop-buff scaling in spirit: dropRate buffs already
  multiply `ch`, which is acceptable (a +drop buff nudging 1/2000 → 1/1600 is fine and gives
  buffs a reason to exist), but **cap total fabled effective chance at, e.g., `.003`** so no
  stack can trivialize it. Enforced in `effectiveDropChance` with a per-band ceiling.

### What qualifies as a fabled item (aspirational, not just +stats)
The current top items (`wave3-uniques.js`: Dragonrend, Crown of the Fallen King, Nightstalker's
Pelt) are **craftable** capstones — they are goals you *build*. Fabled items are the opposite:
you *find* them, and you could play forever and never see one. Rules for a fabled item:

1. **Unique look + name first, stats second.** A distinct icon, an evocative name
   ("Otherworldly gloves" energy), and a flavour line in `item-descriptions.js`. The name is
   what gets screenshotted.
2. **Sidegrade-or-slight-edge power, never a mandatory BiS.** A fabled item must not become
   the item every serious player *needs*, or it stops being a joyful surprise and becomes a
   grind wall / market-price monster. Give it a cosmetic-leaning identity: a small unique
   stat hook (a rare stat combo, a tiny cosmetic aura), roughly on par with a same-tier
   crafted unique. Excitement comes from **rarity + identity**, not raw power.
3. **Cosmetically loud.** Where the frame-border system (rarity.js) shows tier, fabled items
   should also read on the equipped avatar if art allows (hand-off to Art Director — do not
   redesign UI here; document the desire).
4. **Tied to a source with story.** Each real boss / notable monster gets ONE signature fabled
   drop from its table, so "the thing that drops from X" becomes lore. With only ~2 real
   bosses today, seed 4–6 fabled items across the highest-tier monsters + the two bosses; grow
   the roster as bosses are added.

Fabled items are **untradeable OR carefully priced** (see §5 economy note) — leaning
untradeable keeps the thrill personal and dodges a market-manipulation surface.

---

## 2. THE REVEAL MOMENT

Escalating feedback, keyed off the drop event's band (already emitted by `drops.js`):

| Band | Beat |
|---|---|
| common/uncommon | current behaviour — drop row in the kill list. Nothing extra. |
| rare | drop row + a brief border glint on the row. |
| very rare | glint + a short ascending chime + a `notify(...,'loot')` toast that names the item. |
| **fabled** | **the Fabled Sheet** — a full-screen scrim that HALTS the moment. |

### The Fabled Sheet (sibling of the death sheet)
Build it exactly like `death-sheet.js`: a pure `describeFabledDrop(model)` that returns the
render model, and a tokens-only scrim renderer. No hardcoded colours; glyphs, not emoji
(Final Directive). Structure:

- **Dim-to-black flash**, then the item icon fades up inside an animated prismatic `.rr-fabled`
  frame, scaling in with a soft bloom.
- **Eyebrow:** `FABLED FIND` (letter-spaced, prismatic).
- **Headline:** the item name, large, in the display serif.
- **Sub:** the source + the odds, stated plainly — *"Dropped by the Hollow King · roughly 1 in
  2,000."* Naming the odds is the point; it's the sentence that goes on Discord.
- **Flavour line** from `item-descriptions.js`.
- **Two actions (the "door"):** `[ Share ]` (opens the share card, §4) and `[ Continue ]`
  (dismiss, resume the run). Mirror the death sheet's receipt-plus-door discipline: the moment
  interrupts nothing the player still owed — the kill already resolved; this is celebration.
- **Sound:** a distinct 1.5s fanfare stinger, separate asset from the very-rare chime.
  Respects the existing sound/mute setting.

Copy voice: warm, awed, plain — Hearthrise's cozy register, not a slot-machine JACKPOT. "The
world hands you something it almost never gives." Say the odds; let the number do the bragging.

**Away-kill case:** a fabled drop earned while the player was away has no live moment. Surface
it on the **welcome-back receipt** (`maybeShowWelcome`) with the same Fabled Sheet treatment,
promoted to the top of the return summary — "While you were away, the world gave you
something." This reuses the existing away-summary surface (no new path; the away drop already
comes back in the accrual envelope's `events[]`).

---

## 3. THE BROADCAST — "X just looted Y"

When a player earns a fabled drop, announce it. This is the social multiplier that turns one
player's luck into everyone else's aspiration.

### Scope ruling: **clan-first, global-gated.**
- **Clan channel: always.** A fabled drop posts a system message to the looter's `clan:<id>`
  channel: *"⟡ Mara just found the Otherworldly Gloves — roughly 1 in 2,000."* Clanmates feel
  it, congratulate, and now want their own. This is the highest-signal, lowest-spam surface —
  a clan sees a fabled drop rarely enough that it stays special.
- **Global feed: only the rarest sub-band, rate-limited.** A truly ultra-rare fabled (the
  `≤1/5,000` sub-band, or a first-ever server discovery of a given item) posts to a dedicated
  **`global` server-broadcast** ("world announce"). Ordinary fabled drops do NOT hit global —
  at scale (OSRS-scale is the north star) a global feed of every 1/2,000 drop would be
  unreadable noise and would *cheapen* the thrill.
- **Solo players (no clan):** their fabled drop still fires their own Fabled Sheet + share card;
  it simply has no clan feed to post to. It can still qualify for the global feed if it's in the
  ultra sub-band.

### Anti-spam
- Server-side rate limit on world-announce (e.g. max N per minute globally; overflow is
  dropped, not queued — an old announcement isn't interesting).
- Dedupe per (user, item, day) so a repeat can't be replayed.
- Never announce untradeable-cosmetic churn or test items — only entries flagged
  `broadcast:true` in the item data.

### Transport
Reuse `chat_messages`: a new reserved channel semantics — a `system` `from_id` (a fixed
server identity) writing to `clan:<id>` or `global`. The client already subscribes to those
channels and renders messages; a system message just gets a distinct style (prismatic, an
item chip). **No new realtime infra** — one new message *kind*, rendered specially.

---

## 4. THE SHAREABLE CARD

Close the marketing loop Tyler ran by hand: an in-game **[ Share ]** button (on the Fabled
Sheet and on the item's collection-log entry) that produces a Discord-embed-style card image.

- **Card content:** the item icon in its prismatic frame, item name, "FABLED FIND", the odds
  line, the character name + (optional) clan tag, and a small Hearthrise wordmark + a
  play-link. Composed to Discord's embed aspect so it looks native when pasted.
- **Generation:** client-side canvas render (the bug-report screenshot path in
  `src/bug-report.js` already proves canvas capture works here) → downloadable PNG or
  copy-to-clipboard. **No auto-post** — the player pastes it themselves (respects the
  send-on-behalf boundary; the human chooses to share). This is exactly the flow Tyler did
  manually; we just make the artifact one tap.
- **Later (optional):** a real OG-image share URL so a pasted *link* unfurls into the card
  without an attached PNG. Server-rendered, behind server attestation (§5). Phase 4+, not
  required for the win.

Hand the card's visual composition to the **Art Director** (this doc owns *that it exists and
what data it carries*, not its pixels).

---

## 5. SERVER-AUTHORITY FIT

Non-negotiable given the integrity program: a fabled drop must be **server-attested**, or the
broadcast becomes a client-forgeable "I got X" and the whole thrill economy is fake.

- **The roll is already server-owned on the away path.** `rollDropTable` runs in `hr-accrue`
  with the server's seeded RNG; the away drop arrives in the accrual envelope. Good.
- **The live-kill path must become server-attested for fabled specifically.** Live kills are
  currently client-predicted for responsiveness (allowed — display only). For a fabled drop we
  cannot let the *broadcast/collection credit* be minted by the client. Two options, in order
  of preference:
  1. **Server confirms the fabled roll.** The client reports the intent/kill; the server
     re-derives (or authoritatively rolls) the fabled outcome against server-known
     level/gear/seed and only *it* writes the fabled item to inventory + fires the broadcast.
     The client's fanfare is optimistic UI reconciled to the server result. This is the
     server-authority model already mandated (client sends intents, renders server truth).
  2. If (1) can't land with the combat rework yet, **gate only the broadcast + collection-log
     credit behind a server confirmation**, letting the local sheet show optimistically but
     marking it "pending" until the server RPC attests it. A forged local value then gets a
     fanfare but **cannot cross into another player's feed** — which is exactly the target
     property ("a forged client value cannot cross into another player's economy or ranking").
- **The broadcast is a server event, written only by a `SECURITY DEFINER` RPC** (the
  clan-deposit pattern): the server verifies the drop happened in its own ledger, derives the
  display name server-side (never trust a client name), stamps `now()`, and inserts the system
  `chat_messages` row. **The client can never POST a fabled announcement directly.**
- **Journalled:** every fabled grant + broadcast lands in an append-only ledger so abuse is
  detectable and the "rarest ever" claims are auditable.
- **Economy:** leaning untradeable for fabled items sidesteps the market-forgery surface
  entirely. If any fabled item is made tradeable, its quantity lives in the server item table
  like every other tradeable (never the client save blob).

**Do NOT ship the broadcast before the live-kill fabled roll is server-attested.** An
un-attested global "X looted Y" feed is a griefing/lying vector. The reveal + share card
(personal, non-crossing) can ship earlier; the broadcast waits for attestation.

---

## 6. PHASED BUILD PLAN (ranked — cheapest high-excitement win first)

> All phases sit BEHIND the server-authority + pre-scale program. Estimates are build-effort
> once scheduled, not calendar.

**Phase 1 — The tier + the items + the escalated reveal. (~1.5–2.5 days) ← DO THIS FIRST**
- Data-add: `fabled` tier in `rarity.js` (+ animated `.rr-fabled` frame). *Data + a little CSS.*
- Data-add: a `fabled` / very-rare band in `drops.js` (`≤.001`), per-band effective-chance
  ceiling.
- Data-add: 4–6 fabled items in `items.js` + descriptions + low-`ch` rows on top monsters/bosses.
- New: `fabled-sheet.js` modeled on `death-sheet.js` (pure model + tokens scrim) + the
  very-rare chime + fabled stinger sound assets.
- Wire the reveal off the existing `events[].band`; add away-case to the welcome-back receipt.
- **This alone delivers the "WOW" moment** — personal, no server dependency beyond the already-
  server-rolled away path, no broadcast risk. Highest excitement per hour of work.
- Tests: `describeFabledDrop` model unit tests; a drop-table guard that fabled rows are
  `≤.001`; a smoke test that a fabled event opens the sheet.

**Phase 2 — The share card. (~1–2 days)**
- Client canvas card generator (reuse bug-report capture infra), `[ Share ]` on the sheet +
  collection-log entry, PNG download / clipboard.
- Art Director owns the card layout.
- Closes Tyler's manual Discord loop. Low risk (personal artifact, no cross-player write).

**Phase 3 — The broadcast. (~2–4 days, GATED on server-attested live fabled roll)**
- Server `SECURITY DEFINER` RPC that attests the fabled grant and inserts the system
  `chat_messages` row (clan channel always; global for the ultra sub-band, rate-limited +
  deduped).
- Client renders the system message kind (prismatic, item chip) on channels it already
  subscribes to.
- Requires the combat rework's server-attested live path (§5). Do not ship before it.
- Tests: RPC rejects a client-forged fabled claim; rate-limit + dedupe unit tests.

**Phase 4 — Optional polish. (open-ended)**
- Server-rendered OG share URL (link unfurls to the card).
- "Rarest finds this week" server leaderboard / hall of fame (server-attested only).
- Hook fabled reveals into any future Kindling/Beacon ember event or Bestiary Charm system
  when those get built (not dependencies today).

---

## 7. Known limitations / open questions
- **Only ~2 real bosses today.** Fabled roster starts small; it grows as bosses ship. Note the
  standing backlog item about routing ~25 tier-3–6 vendor-trash drops into armour tiers — a
  couple of those source monsters are good fabled homes.
- **Live-kill attestation depends on the combat server-authority work landing.** Phase 3 is
  blocked on it by design, not by choice.
- **Art dependencies:** the prismatic fabled frame, per-item unique icons, the share-card
  layout, and any equipped-avatar treatment are Art Director hand-offs. This doc specifies
  intent + data, not pixels (UI-redesign boundary).
- **Sound:** two new audio assets (very-rare chime, fabled stinger) needed.
- **Balance/exploit review:** fabled leaning untradeable + no-pity + per-band chance ceiling +
  server attestation together keep this off the pay-to-win and market-forgery surfaces. No new
  mintable value in PvE.

---

### Headline recommendation
**Ship Phase 1 alone as the first slice the moment integrity work frees a window.** A single
`fabled` tier, ~5 hand-named items on the top monsters, and a death-sheet-clone "Fabled Sheet"
reveal delivers the entire "WOW I got something super rare" feeling for ~2 days of work,
with **zero new server risk** (the away roll is already server-owned; the reveal is display).
The broadcast and share-card are the social/marketing multipliers — valuable, but Phase 1 is
the emotional payload and it is nearly free because `drops.js` already tells us a drop was rare.
