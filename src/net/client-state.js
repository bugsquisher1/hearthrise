// ============================================================================
// src/net/client-state.js — THE HOME (client half) FOR NON-AUTHORITY RESIDUE.
//
// The server-authority program moved every AUTHORITY field into the fail-closed
// record framework (src/net/record.js): gold, gems, skills, equipment, rooms,
// marks, rested XP, plus the inventory/farming/companion mechanisms. What is
// LEFT in the client-authored snapshot() blob is NON-AUTHORITY residue —
// self-only data that, by CLAUDE.md's mandate, "cannot cross into another
// player's economy or ranking", so it does NOT need the record framework's
// fail-closed accessor + fingerprint + UNKNOWN machinery. It needs a HOME so
// the blob can be retired.
//
// THE RESIDUE (the fields this store carries):
//   · bountyHunter (MINUS marks and xp — both are server-owned)
//   · stats            (kills/gathered/harvested/rareDrops/playMs — counters)
//   · chronicle        (the permanent achievement log)
//   · activeStyle      (which loadout is active — a pref)
//   … plus the self-only tail (settings, houseTheme, daily, collection, quests,
//   entitlements, …). EVERY entry carries its own one-line justification in the
//   list below, in one of exactly two forms: "client-only preference/display
//   state/marker: …", or a named reason why no projection holds the fact yet.
//
// ⚠ THE PURGE (2026-09-14). A field that SHADOWS a value hr_state_of projects
//   does not belong here at any size: ownedThemes, ownedCosmetics, unlockedRecipes,
//   autoEatPct, foodSlot, streak, combatStyle, renownHigh, heroSlotsUnlocked and
//   toolCarry were all deleted in one day, each replaced by the reader that asks
//   the envelope. Their tombstones are inline below, and
//   tests/arm-homing-guard.mjs fails if any of them is re-added or re-written.
//   Adding a field here is a client decision, but adding one the server already
//   holds is a bug — CLAUDE.md §6, "the browser never says one thing while the
//   server says another".
//
// ── THE CONTRACT, DELIBERATELY SIMPLER THAN record.js ───────────────────────
// This is NOT the record framework and must not be mistaken for it. It is a
// VERBATIM key/value store. A forged value here is self-only (the server never
// computes authority on client_state), so there is no fingerprint, no
// fail-closed UNKNOWN, no strip. The one rule it shares with record.js: while
// DORMANT it changes NOTHING — every read falls through to the blob (`G[field]`)
// exactly as today.
//
//   DORMANT  (CLIENT_STATE_SERVER_BACKED=false, or the master switch off):
//            clientField(G, f) === G[f]. The uploader is a no-op seam.
//   ARMED    (flag true AND the master accrual switch on, POST-WIPE only):
//            clientField(G, f) reads the server envelope's `client_state[f]`;
//            putClientState() ships changes to hr_put_client_state.
//
// ── THE SWITCH (post-wipe capstone) ─────────────────────────────────────────
// Flipping CLIENT_STATE_SERVER_BACKED to true is NOT this file's job. It is the
// capstone, and it additionally requires: (1) every residue READ routed through
// clientField / the typed helpers; (2) the residue fields dropped from
// snapshot() (or the blob stops being uploaded entirely); (3) putClientState
// wired into the save loop so a change is persisted; (4) POST-WIPE. Until then
// the const ships false and this module is inert.
//
// DOM-free. Node-importable. `fetch` resolves at call time (accrue.js's rule),
// so a test's override IS the transport.
// ============================================================================

import { resolveActiveSlot } from './accrue.js?v=553';
/* b492 — the property/worker rung OBSERVER. See applyClientState for why the
   boot observation belongs in THIS module. property-record.js imports nothing,
   so it cannot form a cycle with either this file or accrue.js. */
import { notePropertyUnlocks } from './property-record.js?v=553';

/* ── THE ARM (SUPERSEDED BY THE CAPSTONE — THIS CONST IS INERT) ─────────────
   THE VALUE IS false AND STAYS false, BUT THE STORE IS SERVER-BACKED IN PROD.
   armed() below reads `CLIENT_STATE_SERVER_BACKED || capstoneArmed()`, and
   capstoneArmed() delegates to src/net/capstone.js isBlobRetired(), whose
   BLOB_RETIRED has been true since the b454 cutover (2026-08-22). So this const
   contributes NOTHING to the runtime answer — the capstone is the single switch
   for the whole finish line and residue reads follow it without a second flag to
   flip. It is kept (rather than deleted) as the greppable per-field seam and
   because tests/client-state.mjs pins it false: flipping it true would make this
   store server-backed INDEPENDENTLY of the capstone, which is exactly the second
   switch the coupling exists to prevent. Tests drive the armed path via
   __setClientStateArm. */
export const CLIENT_STATE_SERVER_BACKED = false;   // INERT — superseded by capstone.js BLOB_RETIRED (true since b454); armed() ORs the two
let armOverride = null;
/* THE CAPSTONE COUPLING. The blob-retire capstone (src/net/capstone.js) is the
   SINGLE switch for the whole finish line, and residue reads follow it. Since
   b515 that capstone is a CONSTANT (`BLOB_RETIRED`, no kill-switch conjunction),
   so this store is server-backed unconditionally — the old window-global read at
   call time existed to avoid an import cycle with capstone.js, and a constant
   needs no read at all. `__setClientStateArm` remains the way a test drives the
   dormant direction. */
export function isClientStateServerBacked() {
  return armOverride !== null ? !!armOverride : true;
}
/** Test seam, same spirit as record.js's __setSkillsRecordArm. */
export function __setClientStateArm(v) {
  armOverride = (v === null || v === undefined) ? null : !!v;
  return isClientStateServerBacked();
}

/* ── THE RESIDUE ALLOWLIST — THE HYDRATE SECURITY BOUNDARY ────────────────────
   This list lives HERE, in the low-level store, because hydrateInto() below is
   the security-critical writer and MUST NOT trust the bag's key set. `cs` is
   `res.client_state` = the raw `player_state.client_state` jsonb, which
   hr_put_client_state merges VERBATIM — a malicious client can call it on its
   OWN row (RLS permits) with a forged AUTHORITY key (`gold`, `skills`,
   `inventory`, …). If hydrateInto splatted every bag key into G, that forged
   value would poison G.gold / G.skills — a latent authority-forge vector (the
   gold census forbids exactly this). So hydrateInto iterates THIS allowlist and
   writes ONLY these self-only fields; an authority key in the bag is IGNORED.

   capstone.js imports RESIDUE_FIELDS from here (it already depends on this
   module), so there is one list and no cycle. The server enforces the same
   boundary independently (hr_put_client_state deny-list) — defense in depth. */
export const RESIDUE_FIELDS = Object.freeze([
  'bountyHunter',   // client-only board + contract state (completed/board/rerolls/warrants). WHOLLY
                    // residue: marks are the record's top-level G.marks and BH xp is a server SKILL,
                    // and hydrateInto + buildResiduePatch DROP both keys, so the bag shadows neither
  'stats',          // client-only counters (kills/gathered/harvested/rareDrops/playMs). The envelope
                    // projects no lifetime totals — the per-monster kills are hr_bestiary_of's — so
                    // there is nothing here to prefer
  'chronicle',      // client-only log: rank-ups, 99s, first kills. Nothing reads it for a gate;
                    // capped at 500 entries by chronicle.js compaction
  'activeStyle',    // client-only preference: which saved loadout is active (the gear is the record's)
  /* ⚠ `foodSlot` WAS HERE and is DELETED (2026-09-14). The pointer that counts
     is `player_state.auto_eat_food` — the column hr_set_auto_eat writes and
     `chooseFood` picks with, attended and away alike. Measured live the same
     day: the client named `cooked_shrimp` on the HUD, the picker and the death
     sheet while the column held `turnip`. It survives IN MEMORY as the local
     gesture; every reader goes through HearthriseAuto.autoEatFoodId(), which
     prefers the server's nomination and resolves a NULL one the way the engine
     does — the best provision in the bag. Declared in NO_SYNC. */
  'settings',       // client-only preference: sfx / reduceFx / leftHand / uiScale — the device's
                    // own display and audio choices; the server computes nothing from them
  /* ⚠ `ownedThemes` and `ownedCosmetics` WERE HERE and are DELETED, not re-homed
     (2026-09-14). They were the client-written half of the b371 gem dupe: gems
     are SERVER_OF_RECORD and armed, so `G.gems -= price` was only ever a
     prediction the next envelope retired, while the THING BOUGHT sat in a bag
     this file stored verbatim — a free, repeatable premium purchase, and a
     capability a console could forge by typing it. hr_buy_gem_unlock now writes
     a player_progress flag and hr_state_of projects the account's owned set as a
     top-level `gem_unlocks` array; accrue.js reconcileGemUnlocks lands it in the
     `_gemUnlocks` scratch and legacy.js ownsGemUnlock reads ONLY that. Nothing
     in src/ writes either field any more. Re-adding one would give ownership two
     sources, and the residue is the one a cloud restore can rewind (§6). */
  'houseTheme',     // the EQUIPPED theme, a per-character display pointer — NOT ownership.
                    // It stays residue because it is a preference the server has no column for,
                    // and it FAILS CLOSED: legacy.js activeHouseTheme() renders `default` when the
                    // equipped id is not in the server's owned set, silently and without re-granting.
                    // A forged value can therefore only ever paint a wall you already own.
  'plotBuildings',  // client-only display state: which building art sits on which yard tile
  'daily',          // client-only marker: the day's shown task sheet; the PAY is server once-guarded
  'collection',     // client-only progress: {itemId:count}, "have I ever held this". No projection
  'quests',         // client-only display state: the quest sheet's local picks (hr_goal_state pays)
  'entitlements',   // {hearthHall:true,…} convenience flags with no projection yet (hr_unlocks has an
                    // `entitlement` namespace; when hr_state_of projects it, this goes too)
  'playerName',     // the player's OWN copy; cross-player name is server-derived
  'lastSeen',       // the client's own last-active stamp (NOT the authority watermark)
  /* ⚠ `autoEatPct` WAS HERE and is DELETED (2026-09-14). It was the SECOND copy of
     `player_state.auto_eat_pct` — the column the accrual engine prices every
     attended settle and every night with — and hr_state_of has projected it since
     2026-08-15-auto-eat.sql. src/features/auto-actions.js eatThreshold() is the
     one reader: the server's observation when an envelope has carried one, the
     player's unanswered gesture until then, fail-safe at the lowest tier's ceiling
     when nothing has ever been observed. A persisted local copy could only ever be
     a stale rival to that (measured live: the panel promised 50% while the server
     ate at 25%). It survives in memory as the slider's position for the debounce
     window; it no longer survives a reload, because the server's number does. */
  'createdAt',      // the account's Founder date — self-only display; would be lost under arm otherwise
  /* ⚠ `heroSlotsUnlocked` WAS HERE and is DELETED (2026-09-14). hr_state_of
     projects the account's owned slots as a top-level `hero_slots` array
     (2026-09-08-hero-slot-buy.sql); accrue.js reconcileHeroSlots lands it in the
     `G._heroSlots` scratch and multi-character.js ownsSlot() already preferred it,
     so this was a pre-envelope HINT that could only disagree. It disagreed in the
     one direction that matters — a restore-rewindable bag claiming an entitlement —
     which IS the b371 gem dupe. The hero list now renders the server's set, and
     before the first envelope it renders the free slot only: fails closed. */
  /* b462 — THE "SHOWN TODAY" MARKERS. These four were self-only flags that
     lived in the save blob; with the blob retired every reload forgot them, so
     the daily-reward sheet re-opened on every refresh (Tyler, beta morning:
     "every refresh i get a new daily reward"). The SERVER once-guards the pay
     (claim_reward refuses the second claim — those were the not_claimable
     blips) so no gold moved twice, but the player was shown a reward that did
     not land, every time. None of these is an authority field: the server
     derives the real streak from its own claim rows and the quest modal reads
     hr_goal_state under arm; these are "what have I already been shown". */
  'dailyReward',    // client-only marker: { lastClaimDay } — "has today's sheet been SHOWN".
                    // The PAY is server-once-guarded (hr_claim_reward refuses the second claim),
                    // so a forged or lost marker moves no gold; it only re-opens a sheet.
  /* ⚠ `streak` ({count,lastDay}) WAS HERE and is DELETED (2026-09-14). It was a
     PLAY streak counted from the DEVICE clock, per browser profile, against a
     server that has counted the same thing at `player_state.streak_days` since
     2026-08-21-streak-state.sql §4c — measured live the same day: the topbar chip
     read 1 while the column held 3. The number is spendable (renown streakBest ×5,
     Week Warrior / Devoted), which makes a client-advanced copy a faucet as well as
     a lie. accrue.js reconcilePlayStreak mirrors the projection into the
     `G._serverStreak` scratch and playStreakDays(G) is the one reader every surface
     goes through; src/render/streak-chip.js no longer counts anything. Fails closed
     to 0 before the first envelope — an honest "not counted yet", never a local 1
     painted over a server 3. */
  'dailyGoals',     // client-only display state: which goals the quest modal picked for the day and
                    // what it has already shown as claimed (hr_goal_state is the truth for the pay)
  'weeklyGoals',    // same, weekly
  /* b462 — THE SWEEP (CLAUDE.md session criterion 3: kill the class). Every
     `G.<field>` the game writes, minus record ∪ residue ∪ NO_SYNC, classified.
     These twelve are self-only prefs/markers the blob used to carry and nothing
     else persists — each one was a "forgotten on reload" bug waiting for a
     player to report it. None is an authority field (the server's deny-list
     and this allowlist both agree); each is the client's own memory of a
     choice it already made or a sheet it already showed. */
  /* ⚠ `combatStyle` WAS HERE and is DELETED (2026-09-14). `hr_set_style` owns
     `player_state.combat_style` and hr_state_of projects it at
     `state.combat_style` (2026-08-24-combat-style.sql); accrue.js
     reconcileCombatStyle merges it server-wins-per-family into G.combatStyle on
     every envelope and re-sends any family the server has no opinion about. A
     persisted second copy could only be the stale rival that decides which skill
     a settle pays XP into — the "only Attack saves" report. In-session the local
     map is still written the instant the player taps (applyCombatStyle + the
     `_pendingStyle` in-flight hold), so the picker stays responsive; across a
     reload the server's map is the only one. */
  'loadouts',       // client-only preference: saved gear loadouts (the SET is client-authored;
                    // equipping still goes through hr_equip, which is the gate)
  'lockedItems',    // {itemId:true} — the SELL-LOCK. Bounded by the CATALOGUE on the write side
                    // (legacy.js toggleItemLock refuses an id ITEMS does not know), so the key set
                    // can never exceed the item catalogue however long an account is played.
                    // ⚠ It gates nothing SERVER-side and must not: the lock's whole job is to stop
                    // the CLIENT from AUTHORING a vendor-sell / market-list intent for that id. A
                    // forged (or absent) lock therefore takes nothing away and grants nothing — the
                    // opposite direction of the residue-ahead class in §6, where a client flag
                    // unlocks a server capability. Losing it costs a misclick, so it is residue.
  /* ── THE LOOT FILTER ─────────────────────────────────────────────────────────
     The bag's KEPT CLASSES: a deduped array of item-class ids; `[]` = keep all.
     It is the player's STANDING choice, as against the inventory strip's
     momentary one-of-eleven lens (`window._invFilter.category`, scratch, reset
     every reload) — which is the whole reason it needs a home here.

     IT HIDES; IT NEVER DISCARDS. The server owns the inventory (CLAUDE.md §1), so
     a client that dropped items to honour a local preference would be authoring
     the bag. The filter only decides what `renderInvFancy` PAINTS, and a filtered
     view deliberately claims no bag capacity either.

     THE CLASS SET IS DERIVED, NEVER TYPED — legacy.js `CATEGORIES` minus the 'all'
     pseudo-row, the same predicates over the same `src/data` item fields the strip
     uses, so a new item class is ONE row there and the filter gains it for free. A
     second hand-typed list is how a class ends up filterable on one surface and
     invisible on the other.

     FAIL-SAFE, IN BOTH LAYERS: sanitizeResidueField below coerces anything that is
     not an array of short strings to `[]`, and the reader (legacy.js
     lootFilterCats) ignores a class this build does not know and treats "nothing
     recognised" as KEEP ALL. A strict intersection would have shown an EMPTY BAG
     after a class rename, and "my items are gone" is the worst thing a display
     preference can ever be able to say. */
  'lootFilter',
  'autoActions',    // auto-eat food pick / auto-replant prefs (the auto-eat TRIGGER itself is server: hr_set_auto_eat)
  'lastWelcome',    // client-only marker: which build's welcome/changelog sheet has been SHOWN
  'achievements',   // client-only progress: {id:{progress,unlocked}}. Derived from counters the client holds;
                    // re-deriving on every boot re-toasts every unlock, which is the only thing it can get wrong
  /* ⚠ `dungeons` ({ lastRun:{id:ms} }) was the seventeenth name here and is DELETED,
     not re-homed. It was a CLIENT-CLOCK cooldown stamp, and the server now owns the
     re-entry window: hr_dungeon_settle refuses inside it and hr_state_of projects
     the open windows as top-level `dungeon_cooldowns`, mirrored into the
     `_dungeonCooldowns` scratch (accrue.js reconcileDungeonCooldowns) that
     src/dungeons.js canRun() reads. Nothing in src/ writes `G.dungeons` any more.
     Re-adding it would give one gate two clocks, and the client's is the one a
     restore can rewind — the residue-ahead class in §6. */
  'renown',         // client-only marker: { claimed:[], seenRank } — which rank cards have been SHOWN.
                    // The claim is server once-guarded, and the SCORE the ladder is judged against is
                    // the server's `renown_high` (see the renownHigh tombstone below).
  /* ⚠ `unlockedRecipes` WAS HERE and is DELETED, not re-homed (2026-09-14). Its
     own comment claimed "server rows exist; this is the read cache", and the
     first half was never true: 2026-08-16-artisan-progress-model.sql built the
     STORAGE and left the WRITE for a later author who never arrived, so no
     recipe flag had ever been written for anybody. The browser said a recipe was
     learned; the away engine read hr_perks_of, saw `{}`, and stopped eight gated
     recipes at tick 0 every night — CLAUDE.md §6's 2026-09-14 rule exactly.
     hr_recipe_learn now consumes the scroll and writes the flag; hr_state_of
     projects `unlocked_recipes`; accrue.js reconcileRecipes lands it in the
     `_recipeUnlocks` scratch and legacy.js unlockedRecipesMap() is the one read
     both the attended gate and the away engine now agree on. */
  'tools',          // client-only preference: which tools the loadout kit holds
  /* ⚠ `buffs` WAS HERE and is REMOVED, not re-homed here (2026-09-13). The entry
     read "active consumable buffs (remainingMs) — short-lived, but a potion must
     survive a reload", and both halves of that were the problem: a `remainingMs`
     in a bag the PLAYER writes is a buff clock the player owns, and this bag is
     hydrated into G, which feeds the client's getBonus chain. A forged
     `{buffs:[{type:'damage',magnitude:9999,remainingMs:9e9}]}` lived there for as
     long as the player liked. It bought nothing server-side, which is exactly what
     made it LATENT rather than live — §6's "a forged authority value living in G
     is a latent hole" in the costume of a display preference.
     The server owns the buff clock now: player_state.buffs
     ([{type, magnitude, until}], ABSOLUTE expiry, written only by hr_apply's
     buff_apply block from the hr_item_buffs catalogue + now()), projected by
     hr_state_of as the envelope's own top-level `buffs` block. `buffs` is on
     hr_put_client_state's AUTHORITY DENY-LIST as of
     2026-09-13-client-state-buffs-denylist.sql, so leaving the name here would
     make the server refuse EVERY residue patch with forbidden_field — the two
     changes are one commit for that reason, and tests/arm-homing-guard.mjs
     asserts the collision across both deny-list migrations.
     ⚠ STEP 1 OF 3, AND THE GAP IS NAMED: until the step-2 client half adds
       `reconcileBuffs` (mirror `res.buffs` → G.buffs on every envelope, both
       directions) the client's own copy is in-flight display only and is declared
       in NO_SYNC (src/net/events.js). A reload therefore FORGETS a running buff
       on screen while the server keeps holding it — honest under-display, never a
       lost entitlement, and it is the step-2 lane that closes it. When it lands,
       `buffs` moves to SERVER_MECHANISM_FIELDS with the executed proof that list
       now demands, NOT back to this one. */
  'lastActivity',   // client-only display state: the launchpad's "resume what you were doing" card. NOT a copy
                    // of `state.active_kind`/`active_id`, which is what you are doing NOW and goes idle the
                    // moment you stop; this is the last thing you chose, and it deliberately outlives idling
  /* ── b466 — THE SECOND SWEEP (paione, live open beta: "Bestiary achievements
     keep resetting every time you log out and in"). The b462 sweep above was
     run by hand against a hand-typed census, so it only ever found the fields
     somebody remembered to type — `bestiary` had been written by the game since
     b288 and was on no list at all. Re-run MECHANICALLY (every `G.<field>` write
     scanned out of src/ vs record ∪ residue ∪ mechanism ∪ NO_SYNC) it surfaced
     nineteen strands: these FIFTEEN are self-only PROGRESS and reset on every
     single reload today, three are in-flight scratch (now declared in NO_SYNC)
     and one — `traits` — already had a server mechanism (see the note below).
     tests/arm-homing-guard.mjs now derives that census from source, so this
     class cannot come back one player report at a time.
     None of these is an authority field: each name was checked against the
     hr_put_client_state deny-list (gold, gems, hearthTokens, skills, inventory,
     bank, equipment, rooms, marks, restedXp, restedAt, farmPlots, farm,
     companions, offlineBudget) — no collision, so none of these can be refused
     by the server as a forbidden_field. */
  'bestiary',       // client-only progress: {monsterId:{kills,firstKill}}. The server HAS the rows
                    // (`ev:kill_monster:%`) but hr_state_of deliberately EXCLUDES them from the envelope (the
                    // 1000-row cap) and serves them from hr_bestiary_of instead — so this is a cache of a
                    // projection that does not exist on this call, not a shadow of one that does. It becomes a
                    // deletion the day the bestiary is read from its own RPC on the load path
  'dropLog',        // client-only progress: per-monster drop discovery ("have I ever seen this drop?"); the
                    // same `ev:loot:%` exclusion applies
  'collectionLog',  // {claimed:[]} — collection MILESTONE claims. NOT an alias of `collection`
                    // above: `collection` is {itemId:count} (what you have found),
                    // this is which milestone rewards you have taken. Both are real.
  /* ⚠ `traits` is DELIBERATELY NOT HERE. It looks exactly like the rest of this
     list (paid with Marks, self-only, reset on reload) and was the first thing
     the sweep wanted to add — but it already HAS a server home:
     accrue.js reconcileTraits() MIRRORS `res.traits` (hr_state_of projects the
     player_progress `trait:<id>` rows hr_trait_buy writes) onto G.traits on
     every envelope, in BOTH directions, so a trait the server never sold is
     removed rather than gating a surface forever. Adding it here would give one paid entitlement TWO sources
     — the b443 nested-marks bug in a new costume — and would let a forged
     client_state key hydrate a trait the server never sold. It is registered in
     the guard's SERVER_MECHANISM_FIELDS instead. */
  'lifetimeKills',  // client-only counter: the ratcheting all-time kill count. NOT a shadow — the
                    // envelope projects no lifetime kill total (hr_state_of excludes `ev:kill_monster:%`
                    // from `progress`; the per-monster rows are hr_bestiary_of's, a separate RPC), so
                    // there is nothing to prefer. It fails closed to stats.kills, which under-counts.
  /* ⚠ `renownHigh` WAS HERE and is DELETED (2026-09-14). It was the CLIENT
     ratchet's high-water mark, and the client's ladder drifts ahead of the realm's
     BY CONSTRUCTION (2026-09-02-renown-kill-faucet scores a client kill at zero
     server-side) — measured live 2026-09-13: 1193 shown against a `renown_high` of
     1058, a whole rank at the wrong threshold, on a number that hands out perks.
     hr_state_of projects `renown_high` top-level since 2026-09-12 and
     src/features/renown.js countedRenown() is the figure every gate, claim and
     headline decides on. The prediction (`effectiveRenown`) still ratchets within a
     session for the "you are near a rank" display; persisting that prediction only
     ever gave the residue-ahead class a durable store. */
  'homestead',      // client-held CACHE of the property rung, and the ONE shadow deliberately kept:
                    // hr_state_of's `progress` array is TRUNCATED at 1000 rows, so a long-played
                    // account's `property:homestead` unlock can be missing from an envelope that is
                    // otherwise complete. src/net/property-record.js grades the server statement as
                    // EXACT / FLOOR / UNKNOWN and heals G.homestead.tier in BOTH directions (b502
                    // lowers a forged rung, b492 raises a stale one); the residue is only ever read
                    // as a floor under a FLOOR statement, or alone while UNKNOWN. Delete it the day
                    // the rung is projected top-level and un-truncated, not before.
  /* ⚠ `wieldGrandfather` WAS HERE and is DELETED, not re-homed. It was
     `{itemId:true}`, "once worn, always re-wearable", and this entry claimed
     "losing it can un-wield live gear" — untrue since the cutover: the wield gate
     is hr_apply §EQUIPMENT and the worn set the client draws is the server's own
     `equipment` projection, which it never strips. So the flag un-wielded nothing
     and only lit an Equip control the realm refused — §6's residue-ahead class
     with a persisted store behind it. See src/net/equip.js §THE GATE.
     (A stale key may still sit in an old client_state bag; hydrateInto writes
     only THIS allowlist, so it is inert — dead bytes, not state.) */
  'currentCombatTier', // client-only preference: which monster tier the combat picker is showing
  /* ⚠ `toolCarry` WAS HERE and is DELETED (2026-09-14). `player_state.tool_carry`
     is a real server column (2026-08-15-tool-carry.sql), hr_apply accepts the
     engine's `tool_carry` delta key, and hr_state_of projects it at
     `state.tool_carry` — so the fraction the away engine and every settle bank
     lived in TWO places, and the client's copy is the one a restore can rewind.
     accrue.js reconcileToolCarry mirrors the projection onto G.toolCarry on every
     envelope; between envelopes the client still mutates it by reference as
     prediction, exactly as it always did, and the next settle replaces it with the
     server's arithmetic. Absent projection → the local carry is left alone (a
     fraction is never evicted on uncertainty). */
  /* ── E1/E2 — THE CONSUMPTION CARRY. `toolCarry`'s exact twin, one system
     over: `{ <ammoItemId>: 0..1 }`, mutated by reference on every swing by
     src/core/ammo.js. A whetstone burns 0.02 per swing, so 49 swings in 50 bank
     a fraction rather than spending an item, and a carry that reset on reload
     would make every fractional consumable free to anyone who refreshes.
     ⚠ Self-only and worth STRICTLY LESS THAN ONE ITEM by construction — the
       range is [0,1) and `advanceAmmoCarry` pays out whole units the moment it
       reaches 1 — so a forged value cannot mint even a single arrow. That is
       what makes residue the right home rather than a server column today; when
       `player_state.ammo_carry` lands, the server's copy becomes authority and
       this one becomes the prediction, exactly as `toolCarry` did. */
  'ammoCarry',
  'buyback',        // client-only display state: the 15-entry recently-sold list. The BUY-BACK itself is a
                    // normal server purchase; losing the list only costs a misclick its undo
  'dailyGoldStart', // {day,gold,earned} — the day's gold baseline the daily goals measure against;
                    // reset on reload = the gold-earned goal restarts from the current balance
  'raids',          // client-held markers for a surface with no projection yet: {lastStrikeDay, solo:{week,…},
                    // claimed:{}}. The PAY is server once-guarded; the cooldown is the part with no server
                    // clock behind it, so this stays until one exists (b288: a forgotten cooldown is a faucet)
  'muster',         // client-only marker: the day/slot/claimed state the player has already been SHOWN.
                    // The pay is server once-guarded
  'rallyPledge',    // client-only state: a pledge deliberately OUTLIVES the UTC day roll — settlement clears
                    // it, not the clock
  'pendingItemSpends', // item-ledger.js's outstanding client-authored trades. Its own header: an
                    // outstanding trade that did not survive a reload "would be reverted by the first
                    // envelope after it, taking the player's blueprint with it"
]);
const RESIDUE_SET = new Set(RESIDUE_FIELDS);

/* ── NAMES THE RESIDUE PUT MUST NEVER CARRY, WHATEVER BUILT THE PATCH ────────
   hr_put_client_state refuses the WHOLE patch with `forbidden_field` when it sees
   an authority name — not the key, the patch — so one bad name costs the player
   every preference in the bag for as long as the bundle lives. RESIDUE_FIELDS is
   the primary control and `buffs` is already off it; this is the second, and the
   two fail differently on purpose: the allowlist protects against a field being
   FORGOTTEN, this against one being RE-ADDED (`buffs` lived in RESIDUE_FIELDS for
   months as a player-written buff clock, and the "a potion must survive a reload"
   instinct that put it there will recur — it is homed by accrue.js reconcileBuffs
   now, not by this bag).

   ⚠ ENFORCED IN `putClientState`, NOT IN `buildResiduePatch`, and that is not a
     preference. The PUT is the ONE choke point every patch passes through
     whatever assembled it, and capstone.js's builder is SLICED OUT OF ITS SOURCE
     AND RUN STANDALONE by tests/bounty-hunter-xp.mjs (its module graph never
     settles under Node, so the guard executes the real bytes with
     RESIDUE_FIELDS injected). A cross-module call inside that function is a
     ReferenceError in the harness — measured, it turned the whole guard red.
     Enforcing at the seam that owns the list keeps both honest.

   Kept in sync BY A GUARD, not by hand: tests/arm-homing-guard.mjs reads the
   deny-list out of every `*client-state*denylist.sql` migration and fails a
   residue field that collides with it. */
const RESIDUE_NEVER_SEND = Object.freeze(['buffs']);
const NEVER_SEND_SET = new Set(RESIDUE_NEVER_SEND);

/* ── THE THIRD CONTROL: WHAT THE SERVER REFUSED, THIS TAB STOPS SENDING ──────
   RESIDUE_FIELDS and RESIDUE_NEVER_SEND are both authored in THIS bundle, so
   neither can protect a bundle that is already running. The deny-list is a
   SERVER list and it grows on the server's clock:
   2026-09-13-client-state-buffs-denylist.sql applied at 20:47 UTC and every tab
   still on the previous build kept sending `buffs`.

   MEASURED, live, 2026-09-14 15:08 UTC — this is not a hypothetical:
     user b94fa8c0 | code forbidden_field | intent hr_put_client_state
     n=603 today, first refusal 2026-09-13 20:48:28Z — the minute the deny-list
     applied — still refusing 18 hours later.
   hr_put_client_state refuses the WHOLE patch on one denied key, so that account
   saved NO residue for 18 hours: no loot filter, no achievements, no bestiary, no
   "already shown today" markers. Silently. The put returned {ok:false} and the
   caller retried the identical bag sixty seconds later, for ever.

   2026-09-14-client-state-projection-denylist.sql adds NINE more names, so the
   next deny-list apply does this to every tab that has not reloaded.

   THREE THINGS HAPPEN, IN THIS ORDER, AND NONE OF THEM IS A SILENT RETRY:
     1. DROP the refused key for the rest of this page's life. Retrying a name
        the server has declared forbidden cannot succeed, and until the key is
        gone EVERY OTHER FIELD IS LOST TOO. Dropping one preference to save the
        other twenty is the trade, and it is made immediately.
     2. TELL THE PLAYER once, in words they can act on.
     3. RELOAD ONCE per page life, b124-style — purge the caches and unregister
        the service worker first, because "this tab is on an old bundle" and "a
        stale SW is serving old HTML" are the same symptom and a plain reload
        fixes only the first.
   The loop guard is the b124 one: the refused NAME is written to sessionStorage
   before the reload, and a name that is refused AGAIN after a reload never
   reloads again — it is dropped and the tab carries on. A reload loop would be a
   worse bug than the one this fixes. */
const FORBIDDEN_RELOAD_KEY = 'hr-forbidden-field-reload';
const FORBIDDEN_DROPPED = new Set();
let _forbiddenReloadedThisPage = false;
let _forbiddenWarned = false;
let _reloadHook = null;

/** Test seam: capture the reload instead of navigating. Returns the previous hook. */
export function __setClientStateReloadHook(fn) {
  const prev = _reloadHook; _reloadHook = (typeof fn === 'function') ? fn : null; return prev;
}
/** Test / boot seam: forget this page's refusals (NOT the sessionStorage record). */
export function __resetForbiddenField() {
  FORBIDDEN_DROPPED.clear(); _forbiddenReloadedThisPage = false; _forbiddenWarned = false;
}
/** The names the SERVER refused this page life. Exported for the suite and for triage. */
export function forbiddenResidueFields() { return Array.from(FORBIDDEN_DROPPED); }

function forbiddenSeen(field) {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    const raw = sessionStorage.getItem(FORBIDDEN_RELOAD_KEY);
    return !!raw && String(raw).split(',').indexOf(field) >= 0;
  } catch (e) { return false; }
}
function rememberForbidden(field) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const raw = sessionStorage.getItem(FORBIDDEN_RELOAD_KEY) || '';
    const list = raw ? String(raw).split(',') : [];
    if (list.indexOf(field) < 0) list.push(field);
    // Bounded: the deny-list is a server list of names, not an open set, and a
    // hostile answer must not be able to grow a storage key without limit.
    sessionStorage.setItem(FORBIDDEN_RELOAD_KEY, list.slice(-24).join(','));
  } catch (e) {}
}

/* The b124 kill-switch's body, minus its mismatch detection: purge every cache,
   unregister every service worker, then reload. Best-effort and never fatal —
   if the purge fails we still reload, because an un-purged reload is strictly
   better than a tab that keeps losing its saves. */
function purgeAndReload() {
  /* The test seam short-circuits the whole thing, SYNCHRONOUSLY: a suite that
     had to await an unobservable cache purge to see the decision would be
     asserting on a timer. */
  if (_reloadHook) { _reloadHook(); return; }
  const go = () => {
    try { if (typeof location !== 'undefined' && location.reload) location.reload(); } catch (e) {}
  };
  let pending = null;
  try {
    if (typeof caches !== 'undefined' && typeof navigator !== 'undefined' && navigator.serviceWorker) {
      pending = Promise.all([
        caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))),
        navigator.serviceWorker.getRegistrations().then((rs) => Promise.all(rs.map((r) => r.unregister()))),
      ]);
    }
  } catch (e) { pending = null; }
  if (pending && typeof pending.then === 'function') pending.then(go, go);
  else go();
}

/* Handles {ok:false, error:'forbidden_field', field}. Returns true when the key
   was dropped, so the caller can report it. */
function handleForbiddenField(body) {
  const field = (body && typeof body.field === 'string' && body.field) ? body.field.slice(0, 120) : '';
  /* A refusal with NO field is the server telling us a key is forbidden without
     saying which — we cannot drop anything, so the reload is the only move, and
     it is still made only once. The sentinel keeps the loop guard honest. */
  const key = field || '(unnamed)';
  if (field) FORBIDDEN_DROPPED.add(field);
  const seenBefore = forbiddenSeen(key);
  try {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[client-state] the server refused the residue patch on `' + key + '` — dropping it '
        + 'for this session' + (seenBefore ? ' (already reloaded once for this key; not reloading again)'
          : ' and reloading once on a fresh bundle') + '.');
    }
    if (typeof window !== 'undefined') {
      const T = window.HearthriseTelemetry;
      if (T && typeof T.event === 'function') T.event('client_state_forbidden_field', { field: key, reloaded: !seenBefore });
    }
  } catch (e) {}
  if (seenBefore || _forbiddenReloadedThisPage) return !!field;
  _forbiddenReloadedThisPage = true;
  rememberForbidden(key);
  try {
    if (!_forbiddenWarned && typeof window !== 'undefined' && typeof window.notify === 'function') {
      _forbiddenWarned = true;
      window.notify('This tab is running an older build — reloading to keep your settings.', 'kill');
    }
  } catch (e) {}
  purgeAndReload();
  return !!field;
}

/* ── THE SIZE GUARD'S CLIENT HALF ────────────────────────────────────────────
   hr_put_client_state already refuses an oversized bag (2026-08-22-client-state-
   denylist.sql → `patch_too_large` / `state_too_large`). That cap protects the
   COLUMN, not the player: it is a WHOLE-BAG cap, so the first field to grow
   without a bound stops `settings`, `bestiary` and every other pref from saving
   too — one runaway field costs the player the entire residue. A field whose key
   set is driven by player input therefore carries its own bound HERE, applied in
   BOTH directions (hydrateInto on the way in, buildResiduePatch on the way out)
   so neither a forged bag nor a long-played account can grow it.
   Fields with a fixed shape (`homestead`, `streak`, …) need nothing; the table is
   data, so bounding the next one is a row, not a new mechanism. */
const LOOT_FILTER_MAX = 32;   // the bag has 10 filterable classes; the cap is headroom, not a design limit
export function sanitizeResidueField(field, v) {
  if (field !== 'lootFilter') return v;
  /* Coerce hard: anything that is not an array of short strings is "keep all"
     ([]), which is the FAIL-SAFE direction — a garbage filter must never hide a
     player's bag. Dedupe, drop non-strings, cap the length. Unknown class ids
     stay (harmless): the reader intersects with the classes it knows and treats
     an empty intersection as keep-all, so meaning is enforced there and SIZE
     here — one job per place. */
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const c of v) {
    if (typeof c !== 'string' || !c || c.length > 24) continue;
    if (out.indexOf(c) === -1) out.push(c);
    if (out.length >= LOOT_FILTER_MAX) break;
  }
  return out;
}

/* ── THE SERVER-SUPPLIED VERBATIM BAG ────────────────────────────────────────
   Populated from an envelope's top-level `client_state`. Module-scoped rather
   than stamped onto G, because it is NOT part of the save blob and must never
   ride back up into it — the whole point is to get this OUT of the blob. A
   monotonic-ish guard is unnecessary: this is a verbatim store, not a watermark,
   and a stale envelope simply re-supplies the same bag. */
let serverBag = null;   // null = never received; an object once an envelope arrives.
/* b455 — has the bag been WRITTEN INTO G this session? The bag itself is
   refreshed by every envelope; the hydrate happens once. See applyClientState. */
let hydratedOnce = false;

/** Feed a server envelope (the hr_load / hr-accrue shape) into the store. Only
 *  consulted while ARMED, but always safe to call. A malformed / absent
 *  client_state leaves the previous bag untouched (an absent key is not a
 *  reason to forget what the last good envelope supplied).
 *
 *  ── HYDRATE-INTO-G (the capstone model) ──────────────────────────────────────
 *  When `G` is supplied, every residue field is written STRAIGHT INTO G from the
 *  bag, so G becomes server truth and every existing `G.<residue>` read site is
 *  already correct with ZERO per-site routing — this is what retires the
 *  1,001-site read sweep. Residue is NON-AUTHORITY (self-only), so there is no
 *  forgery concern and no fail-closed per-site accessor is needed: a hydrated G
 *  is exactly as trustworthy as the server bag it came from.
 *
 *  ⚠ bountyHunter USED TO HOLD A NESTED AUTHORITY FIELD (bountyHunter.marks). Marks
 *  have MIGRATED to the top-level scalar `G.marks` — a plain record field like gold
 *  — so bountyHunter is now WHOLLY residue. hydrateInto still DROPS any `marks` key
 *  defensively (a forged bag key or a stray legacy nested marks must never shadow the
 *  top-level record authority), and buildResiduePatch (capstone.js) likewise excludes
 *  it on the way out. No residue field carries a nested field owned elsewhere anymore
 *  (audited: stats/chronicle/collection/daily/quests/settings/… are wholly self-only). */
export function applyClientState(res, G) {
  /* ── b492 — THE BOOT OBSERVATION OF THE PROPERTY RUNG. ───────────────────────
     THE LIVE P1: `homestead` is one of the residue fields BELOW ("without it the
     boot RE-DERIVES a grandfathered tier … silently demoting a paid upgrade").
     That comment described a hazard; it became a live bug the week the rpc-gate
     froze client_state_put — the residue never saved, the tier fell back to 0,
     and a Homestead owner lost their worker slot, half their farm plots and
     their room gates with it. The rung the player PAID for was in the envelope
     the whole time (`progress`, kind='unlock', key='property:homestead').

     WHY HERE. The rung must be observed on the BOOT hr_load too, not only on an
     accrued settle — an idle boot answers {accrued:false} and applyEnvelopeState
     never runs, which is the exact class that stranded inventory (b46x) and the
     crew (b477). record.js's settle() calls THIS function with the always-full
     hr_load body, and this module is the one that owns `homestead` as residue,
     so the correction to that residue is sourced from the same place it is
     hydrated. It is deliberately NOT a write: notePropertyUnlocks only ratchets
     a module cache, so it is immune to the ordering hazard that a G write would
     have here (hydrateInto below would clobber it), and the repair happens at
     the READ instead (features/homestead.js getTier → healPropertyTier).

     ⚠ BEFORE the early returns ON PURPOSE. A character that has never uploaded
     residue has no usable `client_state`, and that is precisely the player whose
     tier is stale — bailing out above the observation would skip the heal for
     exactly the population that needs it. Guarded: an observation must never
     break a record load. */
  try { notePropertyUnlocks(res); } catch (e) {}
  /* AND WHAT THE REALM HAS COUNTED IN RENOWN, off the same body and for
     the same reason: the boot load is the only envelope an idle session gets,
     and the renown mirror (src/features/renown.js noteServerRenown) is what the
     rank headline and the rank-up card read. Today it learns the `renown_claim:`
     once-guard flags out of `progress` (a FLOOR under the server's high-water);
     the day hr_state_of projects `renown_high` the same call picks it up EXACT.
     Observation only — nothing is written into G — and guarded, because an
     observation must never break a record load. */
  try {
    const RN = (typeof window !== 'undefined') && window.HearthriseRenown;
    if (RN && typeof RN.noteServerRenown === 'function') RN.noteServerRenown(res);
  } catch (e) {}
  /* AND THE PLAYER'S OWN PLACE — `place:{zone,quiet}` — for the same reason and
     by the same rules: the boot load is the only envelope an idle session gets,
     and the presence opt-out is a setting a player must see the TRUTH of. It
     lands in `G._place` scratch (src/net/town.js notePlace); `zone`/`quiet` are
     deliberately NOT residue — a client-held copy of a server capability is the
     residue-ahead class, and a stale "you are hidden" is the worst shape this
     surface can take. Observation only, and guarded. */
  try {
    const TW = (typeof window !== 'undefined') && window.HearthriseTown;
    if (TW && typeof TW.notePlace === 'function') TW.notePlace(res);
  } catch (e) {}
  if (!res || typeof res !== 'object' || res.ok !== true) return false;
  const cs = res.client_state;
  if (cs === null || typeof cs !== 'object' || Array.isArray(cs)) return false;
  serverBag = cs;
  /* HYDRATE ONLY WHEN ARMED. Populating serverBag is inert while dormant (nothing
     reads it), but WRITING into G is observable — so the hydrate is gated on the
     arm, keeping the dormant load path byte-for-byte unchanged even though
     record.js calls this on every load. */
  if (!G || typeof G !== 'object' || !isClientStateServerBacked()) return true;
  /* ── b455 — HYDRATE **ONCE**. A LOAD IS NOT A RECONCILE. ────────────────────
     MEASURED LIVE, in a 12-second window mid-fight:
         start {kills:3756, …}   ← the kill landed instantly
         +12s  {kills:3755, …}   ← this function put the old number back
     The residue bag is SELF-ONLY and the CLIENT is its only writer; the server
     merely stores it and returns whatever was last uploaded, which is by
     definition BEHIND the live session (the residue rides the save cadence).
     record.js calls this on every `hr_load`, and processOffline re-runs one on
     every visibility return / focus — so re-hydrating meant a stale, uploaded
     copy of the player's own counters overwriting the ones they were watching
     move. Kills, quest progress, the collection log and the chronicle all
     rubber-banded backwards.

     There is nothing to reconcile here and no authority to defer to: hydrating
     is a LOAD, it happens once per session, and after that the live G is the
     freshest copy in existence. Later envelopes still refresh `serverBag` above
     (so `clientField` and `isClientStateFromServer` stay current) — only the
     WRITE into G is once.

     ⚠ The latch is cleared by `__resetClientState`, which is the sign-out /
       fresh-character seam. A slot switch reloads the page, so a new character
       always gets its own hydrate. */
  if (hydratedOnce) return true;
  hydratedOnce = true;
  hydrateInto(G, cs);
  return true;
}

/** Has the residue been written into G this session? Exported so a diagnostic
 *  (and the guard) can tell "the bag arrived" from "the bag was applied". */
export function isClientStateHydrated() { return hydratedOnce; }

/** Write the residue bag into G — ALLOWLISTED. Iterates RESIDUE_FIELDS, never the
 *  bag's own key set, so a forged AUTHORITY key in `cs` (gold/skills/inventory/…)
 *  is IGNORED and can never reach G. This is the security boundary: the bag is the
 *  raw, client-writable player_state.client_state, so it is untrusted input. The
 *  bountyHunter/marks carve-out preserves the record-owned marks. */
/* EXPORTED (b466) so the round-trip is testable as a PURE function. The live
   hydrate is once-per-session and latched (see applyClientState), so a test that
   drove it through the envelope path would either be vacuous — the latch is
   already closed on a booted page — or would have to reset the session's own
   bag. This is the same function the load path calls, on a caller-supplied
   object; nothing about the session is touched. */
export function hydrateInto(G, cs) {
  for (const f of RESIDUE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(cs, f)) continue;   // bag didn't supply it
    if (f === 'bountyHunter') {
      /* Marks MIGRATED to the top-level scalar `G.marks` (a record field like gold),
         so bountyHunter is now WHOLLY residue — there is no nested authority to
         preserve. We still DROP any `marks` key defensively: a forged marks in the
         bag, or a stray nested marks from a legacy blob, must never land inside
         G.bountyHunter and shadow the record's top-level authority. */
      const bagBH = cs[f];
      if (bagBH === null || typeof bagBH !== 'object' || Array.isArray(bagBH)) { G[f] = bagBH; continue; }
      const merged = { ...bagBH };
      delete merged.marks;                  // never a nested marks — top-level G.marks is authority
      /* ── AND NEVER A NESTED `xp` (b503) ────────────────────────────────────
         Bounty-Hunter XP is a SKILL: it lives in player_skills on the server and
         is read through the record as `G.skills.bountyHunter`. `bountyHunter.xp`
         was a client-authored mirror of that server value, and a residue field
         shadowing a server-owned one is the SA-002 class — the shape that
         deadlocked the property tier. Dropped on the way IN for the same reason
         `marks` is: a legacy blob, or a forged bag, must never put a second copy
         of a server number into G where a read site might prefer it. */
      delete merged.xp;
      G[f] = merged;
      continue;
    }
    if (f === 'autoActions') {
      /* NEVER HYDRATE THE `eat` BRANCH. It is the three auto-eat COLUMNS
         (auto_eat_enabled / auto_eat_pct / auto_eat_food), read back off the
         envelope by src/features/auto-actions.js; a bag copy — forged or merely
         stale — would put a second answer into G where the cold-path fallback
         could read it. The other branches are real client-only prefs and ride.
         Symmetric with buildResiduePatch, which strips the same key on the way
         out; a stale `eat` left in an old bag is inert, not state. */
      const bagAA = cs[f];
      if (bagAA === null || typeof bagAA !== 'object' || Array.isArray(bagAA)) { G[f] = bagAA; continue; }
      const mergedAA = { ...bagAA };
      delete mergedAA.eat;
      G[f] = mergedAA;
      continue;
    }
    G[f] = sanitizeResidueField(f, cs[f]);
  }
}

/** Test / boot seam: forget the server bag (a fresh character, a sign-out). */
export function __resetClientState() { serverBag = null; hydratedOnce = false; }

/* ── THE READ ────────────────────────────────────────────────────────────────
   The ONE accessor every residue read should route through. DORMANT → the blob
   value, byte-for-byte as today. ARMED → the server bag's value; a key the
   server has never supplied yields `fallback` (default undefined), matching how
   a fresh field reads before it is ever written. There is no UNKNOWN/fail-closed
   state, on purpose: a self-only pref that briefly reads as its default cannot
   be exploited, and blocking the UI on it (the record framework's behaviour for
   money) would be user-hostile for zero security benefit. */
export function clientField(G, field, fallback) {
  if (!G || typeof G !== 'object') return fallback;
  if (!isClientStateServerBacked()) {
    return Object.prototype.hasOwnProperty.call(G, field) ? G[field] : fallback;
  }
  if (serverBag && Object.prototype.hasOwnProperty.call(serverBag, field)) {
    return serverBag[field];
  }
  return fallback;
}

/** Is the residue currently sourced from the server (armed AND a bag received)? */
export function isClientStateFromServer() {
  return isClientStateServerBacked() && serverBag !== null;
}

/* ── THE WRITE (dormant seam) ────────────────────────────────────────────────
   Builds and POSTs a shallow-merge patch to hr_put_client_state. It is EXPORTED
   but NOT wired into the live save loop — the capstone does that. Dormant, it is
   never called; armed, the caller passes the SUPABASE_URL, an anon key, a JWT
   and a fetch (resolved at call time so a test can inject transport). The patch
   is a plain object of the residue fields that changed; the server merges it
   over the stored bag. p_idem makes a replay a no-op (the merge is naturally
   idempotent regardless).

   Returns {ok, ...} from the RPC, or {ok:false, error} on a transport failure —
   a failed put is NEVER fatal (residue is self-only), it just retries next save.

   ── OVERFLOW IS NOT A GENERIC FAILURE (b486) ─────────────────────────────────
   The whole residue bag shares ONE 256 KiB server cap (hr_put_client_state
   raises `state_too_large` once the merged bag would exceed it). That is not a
   transient — retrying sends the same over-cap bag and fails identically forever,
   so EVERY residue field silently stops persisting. Swallowed into the generic
   {ok:false} it is an invisible infinite retry (self-only data quietly stops
   saving). So this ONE failure is surfaced (console.error + telemetry + a
   one-time visible warning) and flagged with `capExceeded` so a caller can tell
   it apart from a transient. It is still non-fatal (no throw). */
let _capWarned = false;
function surfaceClientStateCap(body) {
  try {
    if (_capWarned) return;
    _capWarned = true;
    const err = (body && body.error) || 'state_too_large';
    const cap = (body && body.cap) || 262144;
    const msg = '[client-state] residue over the ' + cap + '-byte cap (' + err + ') — self-only '
      + 'progress is NO LONGER being saved and every retry will fail identically. Needs attention.';
    if (typeof console !== 'undefined' && console.error) console.error(msg);
    if (typeof window !== 'undefined') {
      try {
        const T = window.HearthriseTelemetry;
        if (T && typeof T.event === 'function') T.event('client_state_too_large', { error: err, cap });
      } catch (e) {}
      try { if (typeof window.captureException === 'function') window.captureException(new Error(msg), { source: 'client-state-cap' }); } catch (e) {}
      try { if (typeof window.notify === 'function') window.notify('Save warning: too much local progress to store — please report this.', 'kill'); } catch (e) {}
    }
  } catch (e) {}
}
/** Test seam: reset the one-time cap warning latch. */
export function __resetClientStateCapWarned() { _capWarned = false; }

/* ── THE REQUEST BUILDER (accrue.js's buildAccrueRequest convention) ──────────
   Split out of putClientState so the ONE periodic write the armed game makes is
   a pure, inspectable value — same reason buildAccrueRequest /
   buildKeepaliveRequest are split out in accrue.js, and the same reason the
   suite can assert on the literal init rather than on a mock's side effects.

   ── KEEPALIVE (the tab-close save) ──────────────────────────────────────────
   `snapshotIfDue(true, true)` fires from `visibilitychange`→hidden and
   `pagehide`. Without `keepalive`, the browser cancels the in-flight request the
   moment the document is torn down, so up to a full cadence (60s) of self-only
   progress — bestiary kills, achievements, quest state, dungeon cooldowns,
   buffs, the daily-reward shown-marker — is silently lost on EVERY tab close and
   every mobile backgrounding. The blob upsert below the capstone branch in
   sync.js always set it; the residue branch that replaced it never did.

   OPT-IN, never global: the periodic cadence save must NOT be keepalive. A
   keepalive request draws on the browser's small shared inflight quota and is
   un-abortable; spending it on a save that has a whole page-lifetime to complete
   is exactly how the quota is exhausted for the send that actually needs it.

   BODY-SIZE LIMIT (Fetch spec): the inflight keepalive body quota is 64 KiB per
   origin, and a `fetch` whose body exceeds it REJECTS outright — it does not
   degrade. The residue patch is the WHOLE residue bag every save (see
   capstone.js buildResiduePatch — it is not a diff), and the server cap on that
   bag is 256 KiB, four times the keepalive ceiling, so an over-64-KiB body is
   reachable for a mature account (bestiary + collection + dropLog + achievements
   + quests). Over the ceiling we therefore send the SAME request WITHOUT
   keepalive rather than let it reject: a normal unload fetch is best-effort (the
   browser may still kill it) but it is strictly better than a guaranteed
   rejection, and it is exactly today's behaviour, so this can only improve on
   the status quo. It is warned about, never silent. */
export const KEEPALIVE_MAX_BODY_BYTES = 64 * 1024;

function utf8ByteLength(s) {
  try {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
  } catch (e) {}
  // No TextEncoder (old runtime): assume the worst case for the BMP rather than
  // undercount and hand the browser a body it will reject.
  return String(s).length * 3;
}

export function buildClientStatePutRequest(patch, opts) {
  const o = opts || {};
  const slot = (o.slot !== undefined && o.slot !== null) ? o.slot : resolveActiveSlot(o.pinnedSlot);
  const idem = o.idem || (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID() : String(Date.now()) + '-' + Math.floor(Math.random() * 1e9));
  const body = JSON.stringify({ p_slot: slot, p_patch: patch, p_idem: idem });
  const init = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': o.anonKey,
      'Authorization': 'Bearer ' + o.jwt,
    },
    body,
  };
  if (o.keepalive) {
    if (utf8ByteLength(body) <= KEEPALIVE_MAX_BODY_BYTES) {
      init.keepalive = true;
    } else if (typeof console !== 'undefined' && console.warn) {
      console.warn('[client-state] residue body is ' + utf8ByteLength(body) + ' B — over the '
        + KEEPALIVE_MAX_BODY_BYTES + ' B keepalive quota, so the tab-close save is sent as a normal '
        + 'best-effort request and may not survive teardown.');
    }
  }
  return { url: String(o.url || '').replace(/\/$/, '') + '/rest/v1/rpc/hr_put_client_state', init };
}

export async function putClientState(patch, opts) {
  const o = opts || {};
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, error: 'bad_patch' };
  }
  /* ── THE ALLOWLIST PROJECTION, AT THE ONE SEAM EVERY PATCH CROSSES ──────────
     THE OUTGOING PATCH IS ITS OWN ALLOWLIST PROJECTION, ALWAYS — `patch ⊆
     RESIDUE_FIELDS`, computed HERE, as the last thing before the body is built.
     This used to be a NAME-BY-NAME deny-list (RESIDUE_NEVER_SEND ∪
     FORBIDDEN_DROPPED), and a deny-list can only ever refuse the names somebody
     remembered to type: any other non-residue key — a field left over from an
     older bundle, a rename of a permitted one, a caller that assembled its own
     bag — sailed through, and hr_put_client_state refuses the WHOLE patch on ONE
     such key. Measured on 2026-09-16: 569 `forbidden_field`/`buffs` refusals in a
     day from one character, ~1 per 2–3 minutes, which is that character saving NO
     residue at all — no loot filter, no bestiary, no achievements, no "already
     shown today" markers — for as long as it keeps happening.

     hydrateInto (the way IN) has always iterated RESIDUE_FIELDS rather than the
     bag's key set, for exactly this reason. The way OUT is now symmetric, so the
     two directions cannot disagree about what the residue IS, and no assembly
     path — present, future, or a bundle a tab is still running — can put a
     non-allowlisted key on the wire.

     THE TWO NAMED CONTROLS REMAIN, AND STILL FAIL DIFFERENTLY: RESIDUE_NEVER_SEND
     is the tripwire for a name being RE-ADDED to RESIDUE_FIELDS (`buffs` lived
     there for months; the "a potion must survive a reload" instinct will recur),
     and FORBIDDEN_DROPPED is what the SERVER refused at runtime — the only one of
     the three that can name a field this bundle believes is legitimate residue.
     Subtracted here too, so the ordering is: allowlist ∩ patch, minus refused.

     A copy, never a mutation of the caller's object: the patch is also the
     caller's record of what it tried to save. Silent by design — this is a
     backstop for a key that should never have been assembled, and a warning the
     player cannot act on is noise in the console of a live game. */
  const allowed = (f) => RESIDUE_SET.has(f) && !NEVER_SEND_SET.has(f) && !FORBIDDEN_DROPPED.has(f);
  for (const k of Object.keys(patch)) {
    if (!allowed(k)) {
      patch = Object.fromEntries(Object.entries(patch).filter(([f]) => allowed(f)));
      break;
    }
  }
  const url = o.url;
  const anonKey = o.anonKey;
  const jwt = o.jwt;
  if (!url || !anonKey || !jwt) return { ok: false, error: 'not_configured' };
  /* b459: honor an injected transport FIRST — sync.js passes fetchWithAuthRetry
     here so the capstone save write gets the gateway-retry + auth-accounting
     hardening (the bare global fetch had silently bypassed both), and a test's
     override really is the transport, as the header promises. */
  const f = (typeof o.fetch === 'function') ? o.fetch
    : (typeof fetch !== 'undefined') ? fetch : null;
  if (!f) return { ok: false, error: 'no_fetch' };
  try {
    const req = buildClientStatePutRequest(patch, o);
    const resp = await f(req.url, req.init);
    if (!resp || !resp.ok) return { ok: false, error: 'http_' + (resp && resp.status) };
    const body = await resp.json();
    /* The RPC answers HTTP 200 with {ok:false,error:'state_too_large'} on overflow
       (also 'patch_too_large' for a single over-cap patch). Surface + flag it
       instead of letting it look like any other {ok:false}. */
    if (body && body.ok === false && (body.error === 'state_too_large' || body.error === 'patch_too_large')) {
      surfaceClientStateCap(body);
      return Object.assign({ capExceeded: true }, body);
    }
    /* Not a transient either, and the more expensive of the two: the WHOLE bag
       stops saving until this key stops being sent. See FORBIDDEN_RELOAD_KEY. */
    if (body && body.ok === false && body.error === 'forbidden_field') {
      const dropped = handleForbiddenField(body);
      return Object.assign({ forbiddenField: true, dropped }, body);
    }
    return body;
  } catch (e) {
    return { ok: false, error: 'transport', detail: e && e.message };
  }
}

if (typeof window !== 'undefined') {
  window.HearthriseClientState = {
    clientField, isClientStateServerBacked, isClientStateFromServer,
    applyClientState, putClientState, isClientStateHydrated,
    hydrateInto, RESIDUE_FIELDS, __resetClientStateCapWarned,
    buildClientStatePutRequest, KEEPALIVE_MAX_BODY_BYTES,
    forbiddenResidueFields, __setClientStateReloadHook, __resetForbiddenField,
  };
}
