// ============================================================================
// src/net/record.js — MOVING THE RECORD, NOT JUST THE COMPUTATION (b340).
//
// b337 moved a COMPUTATION to the server: on return from an absence the client
// asks `hr-accrue` what it earned instead of working it out. b338/b339 gave the
// server a character to compute against. Security's summary of all three was
// exact and unflattering: **that moved the computation, not the record.** The
// server's answer was written into `G`, `saveLocal()` stamped `lastSeen`, and
// the whole thing went up into `game_saves.snapshot` — a client-authored blob a
// player can edit in devtools. Server-computed, client-recorded, which is
// client-authored with extra steps.
//
// This file is the seam that moves a RECORD. It is deliberately a registry plus
// four small pure functions rather than a feature: the hard part of moving the
// record is not moving one field, it is making sure a moved field has exactly
// ONE source afterwards.
//
// ── THE FAILURE CLASS THIS EXISTS TO PREVENT ────────────────────────────────
// A value with two sources. This program has now shipped that bug twice and
// both times it was invisible until something downstream stopped adding up:
//   • the starting kit existed in `legacy.js`'s fresh-G literal AND in SQL, in
//     two languages in two files, and they disagreed (0 gold + no weapon
//     server-side against 500 gold + a Bronze Sword client-side);
//   • the FNV-1a hash existed in five copies and one of them multiplied in
//     floating point, which silently deleted content.
// A field that is "owned by the server" but still READ BACK OUT OF THE BLOB is
// the same bug wearing a security hat, and it is worse than not moving it at
// all — because everyone downstream now believes it is authoritative.
//
// So the rule this file enforces is mechanical, not cultural:
//
//   **A field on the SERVER_OF_RECORD registry is DELETED from every save blob
//   on the way IN, and is only ever written by applyRecord() from a server
//   envelope. There is no third writer and no fallback.**
//
// ── WHAT `game_saves.snapshot` BECOMES ──────────────────────────────────────
// A CACHE and an offline journal — which is what CLAUDE.md save-invariant #1
// already calls it — and NOT a record. Concretely, and this is the whole reason
// the transition is safe:
//
//   • `snapshot()` in src/net/events.js is UNCHANGED. It is a DENYLIST
//     (invariant #3) and nothing is added to `NO_SYNC`. A moved field keeps
//     riding to the cloud exactly as it did.
//   • b302 (single-active-session), the b305 stress battery and the b314
//     snapshot hold all key off that blob and all keep working, because the
//     blob still contains every field it used to and is still written on the
//     same schedule.
//   • What changes is the READ. A moved field is stripped on the way in, so the
//     blob's copy is never consulted for authority again. Writing it and not
//     reading it is exactly what "cache" means.
//
// That asymmetry is deliberate. Stopping the WRITE would mean adding a
// persistent-progress field to `NO_SYNC`, which CLAUDE.md forbids outright and
// which would make the blob's shape depend on a kill switch — so a save taken
// with the switch on would be missing fields when read with it off. Stopping
// the READ costs nothing and cannot lose data: the worst case is that a field
// is briefly UNKNOWN until the server answers, which is a state this module has
// and which is never silently replaced with a local number.
//
// ── THE READ PATH ───────────────────────────────────────────────────────────
// `hr_load(p_slot)` — `SECURITY DEFINER`, `authenticated`-only, returns the
// whole character in one round trip with its `version`. It is the read half of
// the same envelope `hr_state_of` builds for hr-accrue, so there is one shape,
// not two. See supabase/migrations/2026-08-11-apply-engine.sql §3.
//
//   REQUEST   POST <SUPABASE_URL>/rest/v1/rpc/hr_load
//             Authorization: Bearer <user JWT>   — auth.uid() IS the identity;
//                                                  there is no p_user, so no
//                                                  player can name another.
//             apikey: <anon key>
//             body {"p_slot": N}                 — one integer, re-clamped
//                                                  server-side.
//
//   RESPONSE  200 {ok:true, version, now, state:{…}, skills, inventory, …}
//             200 {ok:false, error:'no_character'}
//             200 {ok:false, error:'rate_limited'}      (180/min)
//             200 {ok:false, error:'not_signed_in'}
//             401/403 / 404 / 5xx
//
// ── WHEN THE SERVER DISAGREES WITH LOCAL ────────────────────────────────────
// It does not disagree. There is nothing to disagree WITH: by the time the
// envelope arrives the blob's copy has already been deleted, so the server is
// not overruling a local value, it is supplying the only one. That is the
// difference between "server authoritative" and "server wins the argument", and
// it is why the strip happens at LOAD rather than at APPLY. A reconciliation
// step is a place where a local number can survive; a deletion is not.
//
// The one ordering rule that IS needed: applyRecord() refuses an envelope whose
// `version` is older than the one already applied this session. hr_load and
// hr-accrue can be in flight at the same time, both answer truthfully, and
// without this the slower one could put back a watermark the faster one had
// already advanced.
//
// ── NO SILENT FALLBACK, SAME AS b337 ────────────────────────────────────────
// If the server cannot be reached, a moved field is UNKNOWN. `recordValue()`
// returns `{known:false}` and every consumer must handle that; nothing in this
// file substitutes a local value, a default, or a zero. `0` is the most
// dangerous possible fallback for a watermark — it means "you were last paid in
// 1970" — so it is not reachable: a field is written only when it decoded from
// a server envelope, and `known` says so.
//
// DOM-free. Node-importable. No fetch seam — `fetch` resolves at call time, so
// a test's override IS the transport (accrue.js's rule, same reason).
// ============================================================================

import { isServerAccrualEnabled, resolveActiveSlot, reconcileCompanions, reconcileFarm, reconcileTraits, reconcileInventory, reconcileBank, reconcileWorkers } from './accrue.js?v=480';
/* THE CAPSTONE RESIDUE FEED (blob-retire). One hr_load envelope populates BOTH
   the authority record (applyRecord) and the self-only residue bag
   (applyClientState). No cycle: client-state.js does not import record.js. */
import { applyClientState } from './client-state.js?v=480';
/* THE DISPLAY-PREDICTION SCRATCH (b455). record.js is the ONE writer of a moved
   field, so it is also the one place that can honestly retire a prediction: the
   number it is about to stamp already contains whatever the client predicted.
   predict.js imports nothing, so there is no cycle. */
import { coverageBoundary, retirePredictions, resetPredictions } from './predict.js?v=480';

/* THE SAME SWITCH AS b337/b338, DELIBERATELY. A separate switch would create a
   state where the record has moved but the computation has not, or the reverse
   — and "which half is on" is not a question anybody should have to ask during
   an incident. One switch, one authority. */
export function isRecordActive() { return isServerAccrualEnabled(); }

/* ── THE REGISTRY ───────────────────────────────────────────────────────────
   DATA, not code, so moving the second field is an entry and not a refactor —
   and so the set of moved fields is greppable in one place rather than being an
   emergent property of scattered `if` statements.

   ORDER OF MIGRATION, and the rule behind it: **the record follows the writer.**
   A field may move only after EVERY path that mutates it has moved, because a
   field with a server record and a live client writer is precisely the
   two-sources bug above — the server's copy goes stale, the strip throws away
   the fresh local value, and the player loses progress. That rule is what puts
   `offlineBudget` first and everything else later:

   | field                    | writer today                  | may move when |
   |--------------------------|-------------------------------|---------------|
   | offlineBudget (accrued_to)| SERVER already (b337 owns it — | NOW. This is  |
   |                          | processOffline returns before  | the only field|
   |                          | claimOfflineMs under the switch| whose writer  |
   |                          | and accrue.js deliberately     | has already   |
   |                          | never advances the watermark)  | moved.        |
   | gold                     | ~40 client sites               | after a gold  |
   |                          |                               | intent surface|
   | inventory qty            | addItem/removeItem everywhere  | after craft/  |
   |                          |                               | gather intents|
   | skills xp                | addXp                          | after the     |
   |                          |                               | activity      |
   |                          |                               | intents       |
   | hearth_token             | 1 mint (IAP) + 4 spends        | after a spend |
   |                          | (dungeons ×3, redeem)          | intent — it is|
   |                          |                               | the smallest  |
   |                          |                               | surface after |
   |                          |                               | this one      |

   `from` names a key inside the envelope's `state` object. `decode` turns the
   wire value into the client's representation and MUST return `null` for
   anything it is not certain about — that is what makes `known:false` reachable
   rather than theoretical.

   `fingerprint` is b347's addition and it is what makes the rule CHECKABLE at
   runtime rather than merely stated. See "THE ACCESSOR MUST NOT VOUCH FOR A
   NUMBER IT DID NOT SEE ARRIVE" below. Every entry must carry all four keys —
   REGISTRY_FIELDS is exported so the guard reads the contract instead of
   restating it, the same shape hr-accrue/intents.js uses for its verb registry
   (a hard-coded list cannot notice a column being ADDED). */
export const REGISTRY_FIELDS = Object.freeze(['field', 'from', 'decode', 'fingerprint']);

export const SERVER_OF_RECORD = Object.freeze([
  Object.freeze({
    field: 'offlineBudget',
    from: 'accrued_to',
    since: 'b340',
    /* `accrued_to` is the instant the server has already PAID UP TO. G's
       `offlineBudget.at` is the instant the client has already accounted for.
       They are the same fact, and CLAUDE.md save-invariant #5 exists entirely
       to defend the client's copy of it — with a cap, because a blob-edited
       watermark of 1970 is otherwise an unbounded mint. Moving the record
       replaces that defence with an absence: there is no local copy to edit. */
    decode: (v) => {
      if (v === null || typeof v === 'undefined') return null;
      const ms = typeof v === 'number' ? v : Date.parse(String(v));
      /* Save-invariant #2's rule, applied to a field instead of a save: act
         only on CERTAINTY. A NaN, a negative, or a zero epoch is not a
         watermark, and answering "1970" would grant a whole capped window. */
      if (!Number.isFinite(ms) || ms <= 0) return null;
      return { at: ms };
    },
    /* NOT JSON.stringify. The watermark is one number inside a wrapper object,
       and the wrapper may legitimately grow a key (b226's `dayKey`/`usedMs` ride
       in the same object); fingerprinting the whole object would report a
       harmless neighbour as tampering. Fingerprint exactly the value the server
       supplied and nothing else. Never NaN and never empty, so `want === have`
       is a real comparison rather than two unknowns matching by accident. */
    fingerprint: (v) => {
      const at = v && typeof v === 'object' ? Number(v.at) : NaN;
      return Number.isFinite(at) ? 'at=' + at : 'absent';
    },
  }),
  /* ── GOLD AND GEMS, ARMED. The record follows the writer, and every writer has
     moved (the b353 rationale kept verbatim below states why). decodeBalance /
     fingerprintBalance are function declarations LIVE below this array — hoisted,
     so they resolve at this reference site. The client READ side goes through
     src/net/balance.js (b356): a moved-but-UNKNOWN balance renders a pending
     glyph and fail-closes affordability rather than throwing, so the strip no
     longer crashes the boot. The gold-verb re-stamp (b395/b396: applyGoldEnvelope
     → applyRecord) keeps the economy UI from fail-closing after a purchase. */
  Object.freeze({ field: 'gold', from: 'gold', since: 'b3xx',
    decode: decodeBalance, fingerprint: fingerprintBalance }),
  Object.freeze({ field: 'gems', from: 'gems', since: 'b3xx',
    decode: decodeBalance, fingerprint: fingerprintBalance }),
  /* ── SKILLS XP, SHIPPED DORMANT (b429) — THE MAP THAT IS ONE RECORD ──────────
     The design question this entry answers: gold is a scalar, skills are a MAP
     ({id: xp} in G, {id:{xp,level}} on the wire). The faithful extension of a
     per-FIELD registry is ONE entry whose value IS the whole map — not fifteen
     entries, one per skill. One entry means one strip (`G.skills` deleted from
     the blob), one fingerprint over the whole map, one monotonic version shared
     with every other field, and it matches hr_state_of exactly, which returns
     `skills` as one object. Fifteen entries would multiply the strip, split the
     provenance across fifteen `known` claims that could disagree, and invent a
     shape the server never sends.

     TWO NEW, MINIMAL FRAMEWORK EXTENSIONS THIS ENTRY INTRODUCES, both data:
       • `pick(res)` — skills ride at the TOP LEVEL of the envelope (`res.skills`),
         a SIBLING of `state`, not `res.state.skills` (see hr_state_of in
         2026-08-11-apply-engine.sql §2, and the header envelope shape above).
         `pick` names where the raw wire value lives; absent it, decodeRecord
         reads `res.state[from]` exactly as before, so gold/gems are untouched.
       • `armed()` — the DORMANT gate. Unlike gold/gems (armed with the master
         switch), skills carries its own enable that DEFAULTS OFF, mirroring the
         inventory-flip's INVENTORY_ARM_ENABLED. While `isSkillsRecordArmed()` is
         false the entry is invisible to serverOfRecordFields / isServerOfRecord /
         decodeRecord / the strip — so shipping it changes nothing byte-for-byte
         until a rollout commit flips SKILLS_RECORD_ARM_ENABLED. That is what
         "ship dormant, do not arm" means mechanically, and it is why this entry
         can land on `main` beside the always-on ones without going live. */
  Object.freeze({ field: 'skills', from: 'skills', since: 'b429',
    pick: (res) => (res && typeof res === 'object') ? res.skills : undefined,
    armed: () => isSkillsRecordArmed(),
    decode: decodeSkills, fingerprint: fingerprintSkills }),
  /* ── EQUIPMENT, SHIPPED DORMANT (b433) — THE FIELD WHOSE WRITER ALREADY MOVED ──
     Unlike skills/inventory, the equipment writer is ALREADY server-authoritative:
     the equip verb (src/net/equip.js → hr_apply §equip) debits the bag under a
     lock, checks the requirement off ITEMS[id] server-side, and writes
     `player_equipment`. hr_state_of ALREADY projects that table as a TOP-LEVEL
     `equipment` sibling of `state` — the same envelope shape skills rides — so this
     entry needs NO migration: the projection exists, the writer has moved, and the
     only thing left client-authored is the LOAD copy in the save blob (the boot
     `Object.assign(G, blob)` that the strip closes).

     ONE entry, ONE strip (`G.equipment` deleted from the blob), ONE fingerprint
     over the whole worn set, ONE monotonic version shared with every other field —
     the same design ruling skills' map entry made, for the same reason.

     ⚠ EMPTY IS A KNOWN STATE HERE, NOT UNKNOWN — the one way this decoder differs
        from decodeSkills. A real character ALWAYS has seeded skills, so `{}` from
        the wire means "the read did not populate" → fail-closed. But a character
        can legitimately wear NOTHING (unequip all), and hr_state_of coalesces that
        to `{}`, so `{}` is an authoritative EMPTY set, not an absence. Absence is
        `undefined` (no equipment key on the envelope at all) → decodeEquipment
        (undefined) → null → UNKNOWN. That distinction is the whole reason empty
        decodes to `{}` and undefined decodes to null.

     DORMANT via EQUIPMENT_RECORD_ARM_ENABLED (defaults OFF, also requires the
     master switch), exactly like skills — invisible to the field list / strip /
     decode loop until a post-wipe rollout flips it AND the client equipment read
     sites are routed through an accessor (the skill-record.js analogue). Shipping
     it changes nothing byte-for-byte. */
  Object.freeze({ field: 'equipment', from: 'equipment', since: 'b433',
    pick: (res) => (res && typeof res === 'object') ? res.equipment : undefined,
    armed: () => isEquipmentRecordArmed(),
    decode: decodeEquipment, fingerprint: fingerprintEquipment }),
  /* ── ROOMS / HOUSE UPGRADES, SHIPPED DORMANT (b431) — THE RECORD THAT NEEDS
     NO NEW PROJECTION ──────────────────────────────────────────────────────────
     `G.rooms` is `{ <roomId>: <rung> }` — the same map-is-one-record shape skills
     use, so it is ONE entry whose value IS the whole map: one strip
     (`G.rooms` deleted from the blob), one fingerprint, one monotonic version.

     WHERE THE WIRE VALUE COMES FROM, and why there is NO server migration in this
     commit: a room rung is ALREADY server-owned. `upgradeRoom()` routes the
     purchase through `hr_unlock_buy` (namespace `room`), which writes a
     `player_progress` row `kind='unlock' key='room:<id>' value=<rung>` under the
     per-character lock — and `hr_state_of` already returns every PERMANENT
     progress row (`period_key=''`, unfiltered, ordered so unlock rows never fall
     off the 1000-row cap) in the top-level `progress` array, which `...res`
     spreads onto BOTH the hr_load envelope and the hr-accrue envelope. So the
     authority and the transport already exist; the only thing missing was the
     client READ, which is this entry. `pickRooms` SHAPES the room rows out of
     that array — a `room:<id>` unlock becomes `{<id>: rung}` — so no new
     `hr_state_of` link (the repo's highest-risk create-or-replace, a generated
     chain) is spent on a record that is already in the envelope.

     UNLIKE SKILLS, AN EMPTY MAP IS A VALID KNOWN STATE. A fresh character owns no
     rooms, so `{}` off the wire means "you own nothing yet", not "the read did not
     populate". The UNKNOWN signal is instead the ABSENCE of a `progress` array
     (pickRooms returns undefined → decodeRooms returns null → the field stays
     UNKNOWN, fail-closed), which is what a malformed / pre-envelope answer is.

     DORMANT: its own `ROOMS_RECORD_ARM_ENABLED`, defaulting OFF and ALSO requiring
     the master accrual switch, exactly like skills. While off the entry is
     invisible to serverOfRecordFields / the strip / decodeRecord, so `G.rooms`
     is neither stripped nor read record-first — shipping it changes nothing
     byte-for-byte until a post-wipe rollout flips the const. */
  Object.freeze({ field: 'rooms', from: 'rooms', since: 'b431',
    pick: pickRooms,
    armed: () => isRoomsRecordArmed(),
    decode: decodeRooms, fingerprint: fingerprintRooms }),
  /* ── BOUNTY MARKS, SHIPPED DORMANT — THE SCALAR THAT MOVES HOME ──────────────
     Marks are a scalar currency exactly like gold/gems, so this entry is modelled
     the SAME way: from:'marks' reads the flat `state.marks` that hr_state_of now
     projects (2026-08-26-marks-record.sql), decoded/fingerprinted by the shared
     balance helpers. The EARNING side already moved (hr_claim_bounty credits
     player_state.marks); the reroll/abandon SPEND moved to hr_bounty_spend; this
     entry closes the READ half — under arm, the marks balance is the server's, not
     the save blob's.

     ⚠ STORAGE-LOCATION NOTE — MIGRATED (b44x). Marks USED to live at
     `G.bountyHunter.marks` (a NESTED field), while a record field is a TOP-LEVEL G
     key. Marks are now the top-level scalar `G.marks` (default G literal +
     ensureBountyState migrate a legacy nested value up on load, gated on the arm),
     read everywhere through src/net/marks-record.js `marksOf(G)` — the server value
     under arm, `G.marks` while dormant. The three arm-blockers this entry once named
     are now CLOSED for a safe arm:
       (1) ✅ every marks READ site (topbar/bounty panel/shop/lifetime-stats/
           affordability) routes through marksOf/canAffordMarks/fmtMarks — see the
           marks-record test's read sweep;
       (2) reroll/abandon SPENDS moved to hr_bounty_spend (goal-claim.js); the
           shop-trait (buyTrait) + bounty-shop-upgrade (spendMarks) spends have NO
           server verb yet and are GATED behind clientMayWriteRecordField('marks'),
           so under arm they FAIL-CLOSED (refuse) rather than raw-debit — a documented
           post-arm UX follow-up (build hr_bounty_spend siblings, or a generic marks
           spend RPC, to re-enable them server-side), NOT a self-mint;
       (3) ✅ storage migrated to top-level `G.marks`; the framework strip removes it
           cleanly and the nested mirror is dropped, so there is exactly ONE client
           home. Still DORMANT (armed()=false) + POST-WIPE only; nothing changes
           byte-for-byte until MARKS_RECORD_ARM_ENABLED flips. */
  Object.freeze({ field: 'marks', from: 'marks', since: 'b4xx',
    armed: () => isMarksRecordArmed(),
    decode: decodeBalance, fingerprint: fingerprintBalance }),
  /* ── RESTED XP, SHIPPED DORMANT — THE COUPLED SCALAR + WATERMARK ─────────────
     Rested XP is a bank of CHARGES (`G.restedXp`, a small integer) governed by a
     WATERMARK (`G.restedAt`, the instant already paid up to). Unlike a skill map
     these are TWO top-level G keys, and the framework strips/writes per top-level
     field — so this is TWO registry entries, not one. They share ONE arm flag
     (isRestedRecordArmed) so arm state cannot split, and the READ side
     (src/net/rested-record.js `restedOf`) couples them: BOTH must be known or the
     bank is UNKNOWN, mirroring the events.js "both fields or neither" rule.

     WHERE THE WIRE VALUE COMES FROM: hr_state_of projects flat `state.rested_xp`
     and `state.rested_at` (2026-08-22-rested-record.sql). The WRITER is the
     accrual engine — accrual.js `accrueRested` banks whole charges over the away
     span on `rested_at`, watermark-idempotent and DRAW-FREE (no rng), so away ==
     live stays byte-identical; hr_apply applies the two ABSOLUTE keys under the
     per-character lock, clamping the watermark monotone and the bank to [0,120].

     ⚠ restedAt is a WATERMARK, decoded EXACTLY like offlineBudget's: a NaN, a
       negative, or a zero epoch is not a watermark and answering "1970" would
       mint a full capped bank — so those decode to null → UNKNOWN, never 0.

     DORMANT via RESTED_RECORD_ARM_ENABLED (defaults OFF, ALSO requires the master
     switch). While off, both entries are invisible to the field list / strip /
     decode loop, so `G.restedXp`/`G.restedAt` are neither stripped nor read
     record-first — byte-for-byte unchanged. Arming additionally requires: (1)
     every rested READ routed through restedOf; (2) the SPEND path (spendRestedCharge,
     consumed by grantXp) moved server-side — only accrual moved here; (3) POST-WIPE.
     Rested potency is 0 today (getBonus('restedXp')===0) so the bank pays nothing
     regardless, which is why this can ship ahead of the spend path. */
  Object.freeze({ field: 'restedXp', from: 'rested_xp', since: 'b437',
    armed: () => isRestedRecordArmed(),
    decode: decodeBalance, fingerprint: fingerprintBalance }),
  Object.freeze({ field: 'restedAt', from: 'rested_at', since: 'b437',
    armed: () => isRestedRecordArmed(),
    decode: decodeRestedAt, fingerprint: fingerprintRestedAt }),
  /* ── b353 — WHY GOLD AND GEMS WERE HELD BACK, AND THIS IS THE MEASUREMENT ────
     ⚠ THE HISTORY BELOW is kept because the reason they were not armed earlier is
       a FACT that was cheap to discover and expensive to rediscover, and because
       the next agent to read the flip list will otherwise re-derive it from
       scratch. The two entries are now ARMED above; the prose is history.

     The b353 flip commit was scoped as "add gold (and gems) to SERVER_OF_RECORD
     — the record follows the writer, and the writer has moved". Every
     server-side precondition for that is genuinely met: one payment choke point
     with a terminating prediction lifecycle, absolute envelope writes through
     one registered seam, `hr_load` carrying both columns.

     What is NOT met is the READ side of the client, and it is not a detail.
     Adding the two entries and running the suite produced, on the very first
     boot:

         Cold-load guard — 1 uncaught error: Cannot read properties of
         undefined (reading 'toLocaleString')
         ...and 6 of 22 browser arms red, the engine never booted.

     The site is `src/legacy.js` in `updateTopbar`:
     `document.getElementById('top-gold').textContent = G.gold.toLocaleString()`
     — one of 359 `G.gold` reads in src/**, none of which has an UNKNOWN case.
     That is what "the field is UNKNOWN until an envelope arrives" costs when
     nothing renders unknown: not a blank balance, a client that does not start.
     And it is WORSE in production than in the harness, because a player whose
     `hr_load` is slow, rate-limited or offline stays in that state.

     SO THE BLOCKER IS NAMED, AND IT IS NOT "wire more gold sites": it is **a
     rendering contract for an UNKNOWN balance** — one accessor every read site
     goes through, which answers a placeholder the player understands and which
     can never be spent, saved or uploaded. That is presentation work with an
     owner (Art Director) and it is the last thing standing between the gold
     seam and the record.

     ✅ b356 — THAT BLOCKER IS CLEARED. `src/net/balance.js` is the accessor and
        the whole client read side goes through it: every display renders a
        pending em dash rather than a number, every affordability check is
        FAIL-CLOSED on UNKNOWN, and no code path does arithmetic on a balance
        it has not been told. Measured with both fields deleted from a live G,
        at 1440×900 and 922×423, in hearthlight AND cozy-light: seven render
        paths, zero throws, zero page errors, zero "NaN"/"undefined"/"0" in any
        balance slot, all ten shop Buy controls correctly disabled.

        WHAT REMAINS BEFORE THE TWO ENTRIES BELOW ARE UNCOMMENTED is no longer
        a client-rendering problem. It is item (5) of the operational list in
        docs/design/HANDOFF-server-authority.md: Security's look at the 33
        deferred-site behaviours in src/net/gold-sites.js, each of which is
        already declared by `flipBehaviourOf`. Arming these entries is that
        commit's one-line change; this file and the screens are ready for it.

     `B353-3` in src/features/smoke-test.js is the guard that makes this
     mechanical instead of remembered: every field on SERVER_OF_RECORD must
     survive being UNKNOWN through a real render. `B353-3b` beside it runs the
     same sweep over the CANDIDATES — gold and gems — so the flip is proven in
     CI before it is proven in production, and it additionally asserts the
     pending state is honest (no "0", a real glyph, a labelled element). The two
     entries that once sat here, commented, are now ARMED at the top of this
     array; this block is the surviving rationale, not the definition.

     The decoders are LIVE below (not commented) and unit-tested, because they
     are the half of this that was reviewed and is correct — a balance off the
     wire is accepted only when it is certain, and `0` is never substituted for
     an absent value.

     ── the original rationale, kept verbatim for the day it is armed ─────────
     THE RECORD FOLLOWS THE WRITER, AND THE WRITER HAS MOVED.
     The ordering rule in the table above put these here and not earlier: a
     field may move only once EVERY path that mutates it has moved. What
     satisfies that rule is not "all ~44 client sites were rewritten" — 31 of
     them are still `deferred` in src/net/gold-sites.js and say so by name. It
     is that the ones that remain no longer AUTHOR a balance:

       · every player gesture that moves gold goes through ONE choke point,
         `HearthriseGold.settleCurrency`, and under the switch its local write
         is a PREDICTION with a terminating lifecycle (gold.js's F1 block) —
         not a record;
       · every server envelope — away grant, activity collect, gold verb,
         market verb — writes gold and gems ABSOLUTELY through
         `applyEnvelopeState`, and retires/sweeps the predictions in the same
         call through the one registered seam;
       · so the only thing a client write can still do is be optimistic for the
         length of a round trip. A deferred site is WRONG for that long and
         then corrected, which is exactly what `flipBehaviourOf` documents per
         row — it is no longer a second RECORD.

     What this entry adds on top of that is the LOAD path, which the prediction
     ledger cannot reach: a save blob is not a gesture, and `Object.assign(G,
     blob)` would put a devtools-edited balance back into a live G every boot,
     under the server's name. Stripping it is what makes "the snapshot is a
     cache" true of money.

     ⚠ THE COST, STATED PLAINLY BECAUSE IT IS PLAYER-VISIBLE. Between a load and
       the first envelope, gold and gems are UNKNOWN — `G.gold` is absent, not
       zero and not stale. That is the honest state and it is the safe one (a
       substituted local number is the two-sources bug), but nothing renders
       "unknown", so the balance reads blank for the width of one `hr_load`.
       Making that an honest piece of UI is presentation work and is filed as
       such; it is NOT a reason to leave a client-authored number in place.

     `gems` rides with `gold` rather than following later for one reason: they
     are ONE prediction (`settleCurrency` covers both fields so they cannot
     acquire separate lifecycles) and one absolute write (`reconcilePredictions`
     sets `G.gems` from every envelope). Moving one and not the other would give
     two halves of one gesture two different records. */
]);

/* ── A BALANCE OFF THE WIRE ──────────────────────────────────────────────────
   Save-invariant #2's rule applied to a number: act only on CERTAINTY. `gold`
   and `gems` are `bigint` columns, and PostgREST hands a bigint back as a JSON
   NUMBER when it fits and as a STRING when it does not — so both are accepted
   and anything that is not a finite non-negative integer is `null`, i.e.
   UNKNOWN. A NaN would poison every later balance; a negative is not a balance
   any invariant in this game permits; and `0` is never substituted for an
   absent value, because "you have nothing" is a claim, not a default. */
export function decodeBalance(v) {
  if (v === null || typeof v === 'undefined') return null;
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/* Never NaN and never empty, so `want === have` in recordValue is a real
   comparison rather than two unknowns matching by accident — the same rule the
   watermark's fingerprint follows. */
export function fingerprintBalance(v) {
  const n = Number(v);
  return Number.isFinite(n) ? 'n=' + Math.floor(n) : 'absent';
}

/* ── THE RESTED WATERMARK OFF THE WIRE (b437) ────────────────────────────────
   `rested_at` is the instant the server has already banked charges up to, the
   twin of offlineBudget's `accrued_to`, and it is decoded with the SAME rule:
   act only on CERTAINTY. hr_state_of projects it as a timestamptz, so it arrives
   as an ISO string (or a number in a test); Date.parse yields the ms. A NaN, a
   negative or a zero epoch is not a watermark — answering "1970" would grant a
   whole capped bank on the next spend — so those are null → UNKNOWN, never 0.
   The client's representation is a NUMBER (ms), exactly as `G.restedAt` is. */
export function decodeRestedAt(v) {
  if (v === null || typeof v === 'undefined') return null;
  const ms = typeof v === 'number' ? v : Date.parse(String(v));
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.floor(ms);
}

/* Never NaN and never empty, so `want === have` in recordValue is a real
   comparison — the same rule offlineBudget's watermark fingerprint follows. */
export function fingerprintRestedAt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? 'at=' + Math.floor(n) : 'absent';
}

/* ── THE SKILLS MAP OFF THE WIRE (b429) ──────────────────────────────────────
   Save-invariant #2's rule applied to a MAP: act only on CERTAINTY, and let a
   SINGLE bad cell condemn the whole map rather than silently substituting a zero
   for it. The wire shape from hr_state_of is `{skill_id:{xp,level}}`; a flattened
   `{skill_id: xp}` (the form hr-accrue's index.ts builds for its own response) is
   accepted too, so one decoder covers both envelope producers. The client's
   representation is `{skill_id: xp}` — the LEVEL is derived, never stored, so it
   is dropped here (a stored level is a second copy of a computed fact and the
   two would drift). Fail-closed: a non-object, an empty map (a real character
   always has seeded skills, so empty means "the read did not populate"), or any
   cell whose xp is not a finite non-negative integer returns null → UNKNOWN. */
export function decodeSkills(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  let count = 0;
  for (const k in v) {
    if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
    const cell = v[k];
    const xp = (cell !== null && typeof cell === 'object') ? Number(cell.xp) : Number(cell);
    if (!Number.isFinite(xp) || xp < 0) return null;   // one bad cell condemns the map
    out[k] = Math.floor(xp);
    count++;
  }
  if (count === 0) return null;                         // empty is not a character
  return out;
}

/* Deterministic over SORTED keys, so the same map always fingerprints the same
   string regardless of key insertion order (jsonb_object_agg gives no ordering
   guarantee). Never NaN and never empty, so `want === have` in recordValue is a
   real comparison — the same rule decodeBalance's fingerprint follows. */
export function fingerprintSkills(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return 'absent';
  const keys = Object.keys(v).sort();
  if (!keys.length) return 'absent';
  let s = 's:';
  for (const k of keys) {
    const n = Number(v[k]);
    if (!Number.isFinite(n)) return 'absent';
    s += k + '=' + Math.floor(n) + ';';
  }
  return s;
}

/* ── THE SKILLS DORMANT ARM (b429) ───────────────────────────────────────────
   Skills does not ride the master accrual switch the way gold/gems do; it has
   its OWN enable that defaults OFF, so the entry ships on `main` fully inert.
   Mirrors src/data/item-authority.js INVENTORY_ARM_ENABLED: one greppable const,
   a test override seam, and a runtime predicate that ALSO requires the master
   switch — so `armed` cannot be true while the record system as a whole is off
   (which would leave `G.skills` un-stripped yet read record-first = a mismatch).

   ⚠ FLIPPING THIS TO true IS THE ARM. Do not do it until: the client read sites
   route skill xp/level through src/net/skill-record.js (skillXpOf), Security has
   reviewed, and it is POST-WIPE (a sparse server skills baseline vs a rich client
   one would strand xp — the same class of loss the inventory flip hit pre-wipe).
   See the writeup / docs for the exact arm procedure. */
export const SKILLS_RECORD_ARM_ENABLED = true;   // DORMANT — post-wipe rollout only
let skillsArmOverride = null;
export function isSkillsRecordArmed() {
  const on = skillsArmOverride !== null ? skillsArmOverride : SKILLS_RECORD_ARM_ENABLED;
  return !!on && isRecordActive();
}
/** Test seam, same spirit as __clearAccrualOverride: force the arm on/off, or
 *  pass null to fall back to the const. Returns the resulting armed state. */
export function __setSkillsRecordArm(v) {
  skillsArmOverride = (v === null || v === undefined) ? null : !!v;
  return isSkillsRecordArmed();
}

/* ── THE MARKS DORMANT ARM ───────────────────────────────────────────────────
   Same shape as SKILLS_RECORD_ARM_ENABLED: a greppable const defaulting OFF, a
   test override seam, and a runtime predicate that ALSO requires the master
   switch (so `armed` cannot be true while the record system is off, which would
   leave marks un-stripped yet read record-first = a mismatch).

   ⚠ FLIPPING THIS TO true IS THE ARM. The three storage/read/spend arm-blockers on
   the `marks` registry entry are now CLOSED (reads routed through marksOf; storage
   migrated to top-level G.marks; reroll/abandon spends moved server-side and the two
   remaining shop spends fail-closed under arm). Do not flip until Security has
   reviewed, the two fail-closed shop spends have a server verb (or their temporary
   unavailability under arm is accepted), and it is POST-WIPE (player_state.marks is
   SPARSE pre-wipe
   — players earned marks into the blob, not all mirrored server-side — so a pre-wipe
   arm would strand marks, the inventory-flip lesson). */
export const MARKS_RECORD_ARM_ENABLED = true;   // DORMANT — post-wipe rollout only
let marksArmOverride = null;
export function isMarksRecordArmed() {
  const on = marksArmOverride !== null ? marksArmOverride : MARKS_RECORD_ARM_ENABLED;
  return !!on && isRecordActive();
}
/** Test seam, same spirit as __setSkillsRecordArm. */
export function __setMarksRecordArm(v) {
  marksArmOverride = (v === null || v === undefined) ? null : !!v;
  return isMarksRecordArmed();
}

/* ── THE RESTED DORMANT ARM (b437) ───────────────────────────────────────────
   Same shape as SKILLS_RECORD_ARM_ENABLED: a greppable const defaulting OFF, a
   test override seam, and a runtime predicate that ALSO requires the master
   switch (so `armed` cannot be true while the record system is off, which would
   leave restedXp/restedAt un-stripped yet read record-first = a mismatch). ONE
   flag governs BOTH the restedXp and restedAt entries, so their arm state can
   never split.

   ⚠ FLIPPING THIS TO true IS THE ARM. Do not, until: (1) every rested READ is
   routed through src/net/rested-record.js `restedOf`; (2) the SPEND path
   (spendRestedCharge → grantXp's restedQuantum) is moved server-side — only the
   ACCRUAL (banking) side moved with this record; (3) Security has reviewed; and
   (4) it is POST-WIPE (player_state.rested_at is fresh-defaulted `now()` per row,
   so a pre-wipe arm on a live character would reset a rich local bank to the
   server's freshly-initialised one — the inventory-flip lesson). */
export const RESTED_RECORD_ARM_ENABLED = true;   // DORMANT — post-wipe rollout only
let restedArmOverride = null;
export function isRestedRecordArmed() {
  const on = restedArmOverride !== null ? restedArmOverride : RESTED_RECORD_ARM_ENABLED;
  return !!on && isRecordActive();
}
/** Test seam, same spirit as __setSkillsRecordArm. */
export function __setRestedRecordArm(v) {
  restedArmOverride = (v === null || v === undefined) ? null : !!v;
  return isRestedRecordArmed();
}

/* ── THE EQUIPMENT SET OFF THE WIRE (b433) ───────────────────────────────────
   Save-invariant #2's rule applied to the worn set: act only on CERTAINTY, and
   let a single bad cell condemn the whole set rather than half-trusting it. The
   wire shape from hr_state_of is `{equip_slot: item_id}` (only occupied slots;
   see the `jsonb_object_agg(equip_slot, item_id)` projection). The client's
   representation is the SAME `{slot: itemId|null}` map, so no reshaping is needed
   — a slot the server omits is simply not worn, which the client already reads as
   falsy. A `null` value is accepted (an explicit empty slot), a string item id is
   accepted when it matches the id grammar, and anything else condemns the map.

   ⚠ EMPTY DECODES TO `{}`, NOT null — the deliberate divergence from decodeSkills.
   The wire's `{}` is an authoritative "nothing equipped", a real and common state
   (a fresh strip, a naked character), NOT the "read did not populate" signal that
   an empty skills map is. UNKNOWN is reserved for the value being ABSENT from the
   envelope (undefined/null at the top), which `pick` yields when the key is
   missing. So a genuinely-unequipped character resolves KNOWN-empty, and only a
   malformed/absent envelope resolves UNKNOWN. */
const EQUIP_SLOT_RE = /^[a-z0-9_]{1,32}$/;
const EQUIP_ITEM_RE = /^[a-z0-9_]{1,64}$/;
export function decodeEquipment(v) {
  if (v === null || typeof v === 'undefined') return null;   // ABSENT → UNKNOWN
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  for (const k in v) {
    if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
    if (!EQUIP_SLOT_RE.test(k)) return null;                 // a bad slot name condemns the set
    const item = v[k];
    if (item === null) { out[k] = null; continue; }          // explicit empty slot
    if (typeof item !== 'string' || !EQUIP_ITEM_RE.test(item)) return null;
    out[k] = item;
  }
  return out;                                                // `{}` is KNOWN-empty, not UNKNOWN
}

/* Deterministic over SORTED keys, so the same worn set always fingerprints the
   same string regardless of key order (jsonb_object_agg gives no ordering
   guarantee). NEVER empty — an unequipped set fingerprints as `eq:` (a real,
   distinct token) so `want === have` in recordValue is a genuine comparison and a
   known-empty set never collides with an absent/unknown one. `null` and a
   non-object fingerprint as `absent`, matching the UNKNOWN they decode to. */
export function fingerprintEquipment(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return 'absent';
  const keys = Object.keys(v).sort();
  let s = 'eq:';
  for (const k of keys) {
    const item = v[k];
    s += k + '=' + (item === null || typeof item === 'undefined' ? '-' : String(item)) + ';';
  }
  return s;
}

/* ── THE ROOM MAP OFF THE WIRE (b431) ────────────────────────────────────────
   Room rungs are not a dedicated envelope key — they ride inside the top-level
   `progress` array as permanent `kind='unlock' key='room:<id>'` rows (see the
   registry entry above for why no `hr_state_of` projection is spent). `pickRooms`
   is the SHAPE step: it turns that array into the `{<id>: rung}` map `G.rooms`
   holds. It is a `pick` (envelope top level) rather than reading `res.state`,
   the same seam skills use.

   FAIL-CLOSED on ABSENCE, not on empty. A missing / non-array `progress` is what
   a malformed or pre-envelope answer looks like → return undefined so decodeRooms
   answers null → the field stays UNKNOWN. A PRESENT progress array with no
   `room:*` rows is a real "owns no rooms yet" and yields `{}`, a known value. */
export function pickRooms(res) {
  if (!res || typeof res !== 'object') return undefined;
  const prog = res.progress;
  if (!Array.isArray(prog)) return undefined;   // no progress array → UNKNOWN, fail-closed
  const out = {};
  for (const row of prog) {
    if (!row || typeof row !== 'object') continue;
    if (row.kind !== 'unlock') continue;
    const key = typeof row.key === 'string' ? row.key : '';
    if (key.indexOf('room:') !== 0) continue;
    const id = key.slice(5);
    if (!id) continue;
    out[id] = row.value;   // decodeRooms validates every cell; a bad one condemns the map
  }
  return out;
}

/* Save-invariant #2's rule applied to the room map: act only on CERTAINTY, and
   let a SINGLE bad cell condemn the whole map rather than silently dropping a
   rung. The client representation is `{<id>: <rung>}`, an integer ≥ 0. UNLIKE
   decodeSkills, an EMPTY object is ACCEPTED (a fresh character owns no rooms);
   the UNKNOWN case is a non-object (which pickRooms only produces from an absent
   progress array). */
export function decodeRooms(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  for (const k in v) {
    if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
    const n = Number(v[k]);
    if (!Number.isFinite(n) || n < 0) return null;   // one bad cell condemns the map
    out[k] = Math.floor(n);
  }
  return out;                                         // {} is a valid "owns no rooms yet"
}

/* Deterministic over SORTED keys (the progress array has no ordering guarantee),
   never NaN, and — because empty is a real value here — an empty map fingerprints
   to a stable non-'absent' string so `want === have` in recordValue is a real
   comparison for the "owns no rooms" state too. */
export function fingerprintRooms(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return 'absent';
  const keys = Object.keys(v).sort();
  let s = 'rm:';
  for (const k of keys) {
    const n = Number(v[k]);
    if (!Number.isFinite(n)) return 'absent';
    s += k + '=' + Math.floor(n) + ';';
  }
  return s;
}

/* ── THE EQUIPMENT DORMANT ARM (b433) ────────────────────────────────────────
   Same shape as the skills arm above (which mirrors item-authority's
   INVENTORY_ARM_ENABLED): one greppable const defaulting OFF, a test seam, and a
   runtime predicate that ALSO requires the master switch — so `armed` can never be
   true while the record system is off (which would leave `G.equipment` un-stripped
   yet read record-first = a mismatch).

   ⚠ FLIPPING THIS TO true IS THE ARM. Do not, until: the client equipment READ
   sites (paperdoll, combat stat rollup, tooltips) route through an accessor that
   fail-closes on UNKNOWN — the skill-record.js analogue — Security has reviewed,
   and it is POST-WIPE. The equip WRITE already moved (equip.js), so unlike skills
   the writer side is done; the remaining arm work is purely the client read
   surface. */
export const EQUIPMENT_RECORD_ARM_ENABLED = true;   // DORMANT — post-wipe rollout only
let equipmentArmOverride = null;
export function isEquipmentRecordArmed() {
  const on = equipmentArmOverride !== null ? equipmentArmOverride : EQUIPMENT_RECORD_ARM_ENABLED;
  return !!on && isRecordActive();
}
/** Test seam, same spirit as __setSkillsRecordArm: force the arm on/off, or pass
 *  null to fall back to the const. Returns the resulting armed state. */
export function __setEquipmentRecordArm(v) {
  equipmentArmOverride = (v === null || v === undefined) ? null : !!v;
  return isEquipmentRecordArmed();
}

/* ── THE ROOMS DORMANT ARM (b431) ────────────────────────────────────────────
   Same shape as SKILLS_RECORD_ARM_ENABLED: a greppable const defaulting OFF, a
   test override seam, and a runtime predicate that ALSO requires the master
   switch (so `armed` cannot be true while the record system is off, which would
   leave `G.rooms` un-stripped yet read record-first = a mismatch).

   ⚠ FLIPPING THIS TO true IS THE ARM, AND IT IS COUPLED TO COOKING. Do not do it
   until: (1) the client room-READ sites route through the record accessor rather
   than reading `G.rooms` raw — `Object.values(G.rooms)` (legacy.js totalLevel /
   room count) and `(G.rooms||{}).kitchen` throw / mis-read when `rooms` is
   UNKNOWN, the same class of crash gold hit before src/net/balance.js; (2)
   Security has reviewed; (3) it is POST-WIPE (a sparse server room baseline vs a
   rich client one would strand rungs, the inventory-flip lesson). Arming rooms is
   what makes `noBurn` server-owned end to end, so it is flipped IN THE SAME
   ROLLOUT as artisan-sim.js COOKING_SETTLEMENT_ARM_ENABLED and item-authority.js's
   twin — see those files. */
export const ROOMS_RECORD_ARM_ENABLED = true;   // DORMANT — post-wipe, coupled with cooking
let roomsArmOverride = null;
export function isRoomsRecordArmed() {
  const on = roomsArmOverride !== null ? roomsArmOverride : ROOMS_RECORD_ARM_ENABLED;
  return !!on && isRecordActive();
}
/** Test seam, same spirit as __setSkillsRecordArm. */
export function __setRoomsRecordArm(v) {
  roomsArmOverride = (v === null || v === undefined) ? null : !!v;
  return isRoomsRecordArmed();
}

/* ── THE ARM FILTER ──────────────────────────────────────────────────────────
   An entry with no `armed` is always active (gold/gems/offlineBudget — governed
   only by the master switch). An entry WITH `armed` is active only when it
   returns true. Every downstream consumer — the field list, the strip, the
   decode loop, isServerOfRecord — reads through this, so a dormant field is
   uniformly invisible and cannot half-exist (stripped but not read, or read but
   not stripped). */
function entryIsActive(e) { return typeof e.armed !== 'function' || !!e.armed(); }
function activeEntries() { return SERVER_OF_RECORD.filter(entryIsActive); }

export function serverOfRecordFields() { return activeEntries().map((e) => e.field); }
export function isServerOfRecord(field) { return serverOfRecordFields().indexOf(field) !== -1; }
export function recordEntry(field) {
  for (const e of SERVER_OF_RECORD) if (e.field === field) return e;
  return null;
}

/* ── MAY THE CLIENT WRITE THIS FIELD? (b347) ────────────────────────────────
   THE RULE THE HEADER ALREADY STATED AND NOTHING ENFORCED. "There is no third
   writer and no fallback" was true of record.js and false of the game: two
   client sites went on writing `offlineBudget` after the strip had deleted it —
   `saveLocal()` advanced it to `lastSeen` on every autosave, and the cloud
   overlay re-stamped it to the snapshot's save time two lines after stripping
   it out of that same snapshot. Measured: the server said 06:00Z and the client
   reported 09:30Z.

   ⚠ THIS IS THE TEMPLATE, WHICH IS WHY A FOUR-LINE PREDICATE IS WORTH A BLOCK
     OF PROSE. Gold (~40 writers), inventory, skill xp and hearth tokens all
     follow this field, and the ordering rule in the table above — the record
     follows the writer — is exactly the rule this function makes askable. Every
     one of those migrations ends with the same sentence at its write sites:
     `if (!mayClientWrite('gold')) return;`

   EXEMPT, DELIBERATELY, AND THE ONLY EXEMPTION: accrue.js's
   `stampAwayWatermarks`, which runs from `setServerAccrualEnabled` at the exact
   instant authority CHANGES HANDS. Flipping ON hands the span to the server
   before any envelope has arrived (nothing is `known` yet, so nothing can be
   overwritten); flipping OFF hands it back, and refusing the write there would
   leave the client with no watermark at all and re-pay the whole span. A
   steady-state writer asks; the switch does not, because it is not a writer of
   the record — it is the thing that decides whose record it is. */
export function clientMayWrite(field) {
  if (!isServerOfRecord(field)) return true;   // not moved — the client still owns it
  return !isRecordActive();                    // moved AND armed — applyRecord is the only writer
}

/* ── THE STRIP ──────────────────────────────────────────────────────────────
   PURE, and it never mutates its argument: the caller may be holding the parsed
   cloud snapshot for logging, and a strip that reached back into it would make
   the log lie about what arrived.

   Called at BOTH blob→G seams, which is the whole of the coverage argument:
     • legacy.js loadLocal()          — the local blob AND the v1 migration path
     • auth.js pullAndMaybeRestore()  — the cloud overlay

   ⚠ A THIRD SEAM WOULD BE A HOLE, AND NOTHING GUARDS AGAINST ONE. This sentence
   originally read "B340-3 asserts there is no other `Object.assign(G, …)` of a
   parsed save". It does not, and no test does — which would have made it the
   eleventh entry in the assertion-that-asserts-nothing family, in a comment,
   where no test can catch it. What is actually true: `grep -rn
   'Object\.assign(\(window\.\)\?G,' src/` on 2026-08-14 returned exactly the
   three lines above (two in loadLocal, one in the overlay) and nothing else.
   That is a fact about one commit, not a guard. Re-run it before adding a
   field, and prefer converting it into a real check to trusting this note. */
export function stripServerOfRecord(blob) {
  if (!blob || typeof blob !== 'object') return { blob, stripped: [] };
  const fields = serverOfRecordFields();
  const stripped = [];
  const out = {};
  for (const k in blob) {
    if (!Object.prototype.hasOwnProperty.call(blob, k)) continue;
    if (fields.indexOf(k) !== -1) { stripped.push(k); continue; }
    out[k] = blob[k];
  }
  return { blob: out, stripped };
}

/** Delete the moved fields from a LIVE G. Separate from stripServerOfRecord
 *  because a blob is copied and G must not be — every module in the game holds
 *  the same `window.G` reference (the b127 rule). */
export function forgetServerOfRecord(G) {
  if (!G || typeof G !== 'object') return [];
  const forgotten = [];
  for (const f of serverOfRecordFields()) {
    if (Object.prototype.hasOwnProperty.call(G, f)) { delete G[f]; forgotten.push(f); }
  }
  /* FOUND BY B340-3, and it is the two-sources bug in miniature. `_record` is
     `_`-prefixed so it never syncs — but it survives a loadLocal() in memory,
     and a stale `known` list would report a field this function has just
     DELETED as authoritative. `recordValue` reads that list rather than the
     field's presence precisely so a leftover value cannot be reported as
     server-supplied; forgetting the value without forgetting the claim would
     have inverted that into reporting `undefined` as server-supplied. */
  /* b455 — AND THE LAST-KNOWN-GOOD CACHE GOES WITH THEM, for exactly the reason
     the `known` list does. The cache is what the DISPLAY falls back on; carrying
     it across a strip (a slot switch, a sign-out, a device handoff) would render
     the PREVIOUS character's balance and levels while the new one loads. The
     prediction scratch goes for the same reason — a predicted gather tick belongs
     to the character it was made about and to no other. */
  if (G._record) G._record = { ...G._record, known: [], stamp: {}, last: {}, forgottenAt: Date.now() };
  try { resetPredictions(G); } catch (e) {}
  return forgotten;
}

/* ── DECODING AN ENVELOPE ───────────────────────────────────────────────────
   PURE. Fail-closed at every step: a field that is absent, malformed or
   undecodable is reported as MISSING, never defaulted. */
export function decodeRecord(res) {
  const out = { ok: false, version: null, fields: {}, missing: [], reason: null };
  if (!res || typeof res !== 'object' || res.ok !== true) { out.reason = 'not_ok'; return out; }
  const st = res.state;
  if (!st || typeof st !== 'object') { out.reason = 'no_state'; return out; }
  const version = Number(res.version);
  if (!Number.isFinite(version)) { out.reason = 'no_version'; return out; }
  out.version = version;
  for (const entry of activeEntries()) {
    /* `pick` names a value at the envelope TOP LEVEL (skills rides beside `state`,
       not inside it); absent it, read `res.state[from]` exactly as before. */
    const raw = typeof entry.pick === 'function'
      ? entry.pick(res)
      : (Object.prototype.hasOwnProperty.call(st, entry.from) ? st[entry.from] : undefined);
    const decoded = entry.decode(raw);
    if (decoded === null) { out.missing.push(entry.field); continue; }
    out.fields[entry.field] = decoded;
  }
  out.ok = true;
  return out;
}

/* ── APPLYING IT — THE ONLY WRITER ──────────────────────────────────────────
   Every moved field in the game is written here and nowhere else. accrue.js's
   applyEnvelope does NOT write them (it writes gold/skills/inventory, none of
   which have moved), and legacy.js routes hr-accrue's envelope through this
   same function, so there is one writer for two callers rather than two
   implementations that agree today. */
export function applyRecord(G, res) {
  const dec = decodeRecord(res);
  if (!G || typeof G !== 'object' || !dec.ok) {
    return { written: [], skipped: 'undecodable', reason: dec.reason || 'no_g' };
  }
  /* MONOTONIC. hr_load and hr-accrue race by design (one is a read, the other
     pays), both answer truthfully, and the slower answer is the OLDER one. */
  const prev = G._record && Number(G._record.version);
  const stale = Number.isFinite(prev) && dec.version < prev;

  /* ── A GAP HAS NOTHING TO REWIND (b422) ──────────────────────────────────────
     The strict-version guard exists so a slow, OLDER envelope cannot put back a
     watermark a newer one already advanced — i.e. it protects a field the record
     already KNOWS. It does NOT protect a field that is currently UNKNOWN, and
     rejecting the whole envelope for a field it does not yet hold was a real,
     player-visible bug:

       On a cold / new-device (cloud-restore) boot the balances are stripped out
       of G and `forgetServerOfRecord` clears `known` while KEEPING the persisted
       `_record.version`; and the away-accrue that races `hr_load` bumps
       `player_state.version` while its lean envelope leaves gold/gems in
       `missing`. Either one leaves `_record.version` >= the version `hr_load`
       returns — so the boot read that DID carry gold was rejected `stale` in
       full, gold stayed UNKNOWN, the top bar showed an em dash and every
       Buy/Sell fail-closed until the first activity settle finally arrived at a
       strictly-newer version carrying full state (~90s later, or never for an
       idle player).

     So a stale envelope still FILLS the gaps — the fields the record cannot
     currently vouch for — and ONLY the gaps. A known field (and therefore the
     monotonic watermark, which is a known field once stamped) is never rewound;
     the version is never lowered. `recordValue().known` is the test, so "gap"
     here means exactly what a reader would see as UNKNOWN — a stamped-but-
     client-overwritten field is NOT refilled from an older read. Fail-closed is
     preserved: the fill is still from a real server envelope (`dec.fields`),
     never from raw G. */
  let candidates = Object.keys(dec.fields);
  if (stale) {
    candidates = candidates.filter((f) => !recordValue(G, f).known);
    if (!candidates.length) {
      return { written: [], skipped: 'stale', version: dec.version, have: prev };
    }
  }

  const written = [];
  for (const f of candidates) { G[f] = dec.fields[f]; written.push(f); }
  /* FOUND BY B340-6. An envelope that supplies NO record must change NOTHING —
     not even the provenance stamp. Stamping it is an assertion that an
     authoritative read happened, and doing that on an answer which carried no
     record is how "the server told us" ends up meaning "the server was asked".
     b337's failure battery holds the same property for grants; this is it for
     the record. The `missing` list still goes to the caller and the console,
     which is where a diagnostic belongs. */
  if (!written.length) {
    return { written: [], missing: dec.missing, skipped: 'no_record_fields', version: dec.version };
  }
  /* THE FINGERPRINT OF WHAT ARRIVED (b347). Taken here, from the decoded value,
     at the only moment this module can honestly claim to have seen the server's
     number. `recordValue` compares against it; without it the accessor reports
     whatever is in G under the server's name, which is how a client write comes
     back labelled `source:'server'`.
     A STALE gap-fill MERGES onto the record a newer envelope already wrote — it
     must never drop that envelope's known fields nor rewind its version — while a
     fresh envelope REPLACES the record wholesale, exactly as before. */
  const base = stale && G._record && typeof G._record === 'object' ? G._record : null;
  const stamp = base && base.stamp && typeof base.stamp === 'object' ? { ...base.stamp } : {};
  const known = base && Array.isArray(base.known) ? base.known.slice() : [];
  for (const f of written) {
    const e = recordEntry(f);
    stamp[f] = e && typeof e.fingerprint === 'function' ? e.fingerprint(G[f]) : null;
    if (known.indexOf(f) === -1) known.push(f);
  }
  const version = stale && Number.isFinite(prev) ? prev : dec.version;
  /* ── THE LAST-KNOWN-GOOD CACHE (b455) ─────────────────────────────────────
     A COPY of the last value the SERVER actually stated for each field, kept
     beside the stamp. It is NOT a second source of authority — `recordValue` does
     not read it and neither does any spend — it exists so the DISPLAY path has
     something honest to fall back on when the stamp stops matching.

     WHY IT IS NEEDED. `recordValue` answers UNKNOWN the instant anything other
     than this function moves a stamped field. Fail-closed is right for authority
     and catastrophic for a renderer: legacy `getLevel()` floors an UNKNOWN skill
     to 1, which is how a single un-gated `G.skills` write turned into the live
     "woodcutting bouncing from lvl 5 to lvl 1 over and over again". With this
     cache the display degrades to a slightly-stale REAL number instead of to 1,
     so a writer this sweep did not find costs freshness and never a bounce.

     Deep-copied for map fields, because `G[f]` is the very object a second writer
     mutates — keeping the reference would cache the corruption it exists to
     survive. Maps here are ~15 keys and this runs once per settle. */
  const lastBase = base && base.last && typeof base.last === 'object' ? { ...base.last } : {};
  for (const f of written) lastBase[f] = cloneRecordValue(G[f]);
  G._record = {
    version,
    at: Date.now(),
    serverNow: (base && base.serverNow) || res.now || null,
    known,
    missing: dec.missing.slice(),
    stamp,
    last: lastBase,
  };
  /* ── RETIRE THE PREDICTIONS THIS ENVELOPE HAS ALREADY INCORPORATED (b455) ──
     The same rule gold.js's `reconcilePredictions` follows — retire what the
     server's number provably contains, CARRY what it cannot describe — applied at
     the record seam, where the "what it contains" question is answered by a
     watermark rather than by an intent key.

     ⚠ THIS IS NOT "the envelope landed, so drop everything". That version was
       measured live and it REWINDS the player:
           start {kills:3756, gold:501, atkXp:5}   ← the kill landed instantly
           +12s  {kills:3755, gold:500, atkXp:1}   ← the settle took it away
       The server settles a LAGGING window; its envelope is authoritative up to
       `state.accrued_to` and says nothing at all about the seconds since. A
       prediction made after that instant is not contradicted by this envelope —
       it is simply not in it yet — and dropping it deletes progress the player
       has already watched happen.

     `coverageBoundary` turns the envelope's watermark into an instant in THIS
     client's clock without ever comparing the two clocks (see its header), and
     `retirePredictions` drops exactly the entries at or before it. What survives
     stays on the display, on top of the new server value, so the sum is
     unchanged across the settle and the number never moves backwards.

     ONLY the fields actually WRITTEN — a lean envelope that supplied no `skills`
     has stated nothing about xp and must retire none of it. */
  let retired = null;
  try {
    const nowMs = Date.now();
    const cover = coverageBoundary(res, nowMs);
    retired = retirePredictions(G, written, cover.at, nowMs);
    if (retired) retired.coverage = cover;
  } catch (e) {}
  return { written, missing: dec.missing, version, filledStale: stale, retired };
}

/** A defensive copy for the last-known-good cache. Scalars pass through; a map
 *  is shallow-copied one level (every record map in this game is `{key: number}`
 *  or `{key: string|null}`), which is enough to be immune to a later in-place
 *  mutation of `G[field]`. */
function cloneRecordValue(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.slice();
  const out = {};
  for (const k in v) if (Object.prototype.hasOwnProperty.call(v, k)) out[k] = v[k];
  return out;
}

/**
 * THE LAST VALUE THE SERVER ACTUALLY STATED for a moved field, or `undefined`.
 *
 * ⚠ NOT AUTHORITY, AND NEVER TO BE USED AS ANY. It is deliberately NOT consulted
 *   by `recordValue`, `balanceOf`, `skillXpOf`, `canAfford`, or anything that
 *   crosses to another player. Its ONE job is to let a renderer show a real,
 *   if slightly stale, number instead of an em dash or a level 1 while the
 *   record is temporarily un-vouchable. See the block in applyRecord.
 */
export function recordLastKnown(G, field) {
  const rec = G && G._record;
  if (!rec || !rec.last || typeof rec.last !== 'object') return undefined;
  const f = String(field == null ? '' : field);
  return Object.prototype.hasOwnProperty.call(rec.last, f) ? rec.last[f] : undefined;
}

/* ── THE ONLY READ ACCESSOR ─────────────────────────────────────────────────
   A consumer that reads `G.offlineBudget` directly gets whatever is there,
   which under the switch is `undefined` — safe, but it does not say WHY. This
   says why, and `known:false` is the answer a consumer has to handle. It reads
   `G._record.known` rather than the presence of the field, so a value left over
   from before a strip can never be reported as authoritative.

   ── THE ACCESSOR MUST NOT VOUCH FOR A NUMBER IT DID NOT SEE ARRIVE (b347) ──
   The `known` list is a claim about the PAST — "an envelope wrote this field
   during this session". It says nothing about the present, and the whole point
   of an accessor built to catch a second writer is that a second writer may
   have run since. Measured, with a control: the server said 06:00Z, a client
   write moved it to 09:30Z, and this function answered
   `{known:true, source:'server'}` — the forged number wearing the server's
   name, which is strictly worse than not having moved the record at all,
   because everyone downstream now believes it.

   So the claim is checked, not trusted. `_record.stamp` holds the fingerprint
   of what applyRecord actually wrote; a mismatch means SOMETHING ELSE wrote it
   and the honest answer is `known:false` — fail-closed, the same direction as
   every other refusal in this file, and a state every consumer already has to
   handle. `source` names the fault so a bug report can say which of the two
   possible bugs it is (a stale claim, or a live second writer).

   THE STALE-SESSION CASE FALLS OUT FOR FREE, and it was a real hole: `_record`
   is `_`-prefixed so it never reaches the cloud, but saveLocal() writes all of
   G, so a `_record` from a PREVIOUS session survives a reload while
   stripServerOfRecord deletes the field it claims. That combination reported
   `known:true, value:undefined`. It now reports `known:false`. */
export function recordValue(G, field) {
  if (!isServerOfRecord(field)) return { known: false, value: undefined, source: 'not-moved' };
  const rec = G && G._record;
  const claimed = !!(rec && Array.isArray(rec.known) && rec.known.indexOf(field) !== -1);
  if (!claimed) return { known: false, value: undefined, source: 'unknown' };
  const entry = recordEntry(field);
  const want = rec.stamp && Object.prototype.hasOwnProperty.call(rec.stamp, field)
    ? rec.stamp[field] : null;
  const have = entry && typeof entry.fingerprint === 'function' ? entry.fingerprint(G[field]) : null;
  if (want === null || want !== have) {
    return {
      known: false, value: G[field], source: 'client-overwrote',
      expected: want, found: have, version: rec.version,
    };
  }
  return { known: true, value: G[field], source: 'server', version: rec.version };
}

/* ── TRANSPORT ──────────────────────────────────────────────────────────────
   Same shape as accrue.js and character.js: config wired once from auth.js,
   accessors never captured, request built as pure data so a test asserts the
   literal bytes. */
let config = null;
let inFlight = null;
let last = null;
/* ── b428: THE BOOT LOAD OUTRUNS ITS OWN CONFIG ──────────────────────────────
   On a fresh new-device tab, legacy.js's processOffline() fires beginRecordLoad()
   during loadLocal — but auth.js only calls configureRecord() once the session is
   established, which is LATER. So the very first boot read returned
   `unconfigured/no_endpoint` and was abandoned: the record stayed empty, gold/gems
   never stamped, and the top bar showed an em dash PERMANENTLY for that session
   (measured live on b428). `wantedBootLoad` records that a boot read wanted to run
   but had no endpoint yet; configureRecord replays it the instant the endpoint
   arrives. `appliedCb` lets the DOM-free record module tell the UI to repaint when
   THAT retried load lands, without importing a renderer. */
let wantedBootLoad = false;
let appliedCb = null;

/** Register a repaint hook fired after ANY load applies a field (initial or the
 *  post-config retry). DOM-free by contract: record.js calls it, legacy.js owns
 *  what it does. Idempotent — one registration replaces the last. */
export function onRecordApplied(cb) { appliedCb = (typeof cb === 'function') ? cb : null; return appliedCb; }

export function configureRecord(cfg) {
  if (!cfg || !cfg.url) { config = null; return null; }
  config = {
    url: String(cfg.url).replace(/\/+$/, ''),
    apiKey: cfg.apiKey || '',
    authToken: cfg.authToken || null,
    slot: Number.isInteger(cfg.slot) ? cfg.slot : null,
  };
  /* THE RETRY, AND IT IS THE WHOLE FIX FOR THE NEW-DEVICE EM DASH. A boot read
     that fired before this call was abandoned with the endpoint missing; now that
     the endpoint exists, run it. Fire-and-forget for the same reason beginRecordLoad
     is — the game must not block a frame — and it repaints through appliedCb when it
     lands. Guarded so a configure that is not answering a pending boot load costs
     nothing. */
  if (wantedBootLoad) {
    wantedBootLoad = false;
    try { beginRecordLoad(); } catch (e) {}
  }
  return getRecordConfig();
}

export function getRecordConfig() {
  if (!config) return null;
  return { url: config.url, slot: resolveActiveSlot(config.slot), pinnedSlot: config.slot,
    endpoint: recordEndpoint(config.url) };
}

export function recordEndpoint(base) {
  return String(base || '').replace(/\/+$/, '') + '/rest/v1/rpc/hr_load';
}

function tokenOf() {
  if (!config || !config.authToken) return null;
  try { return typeof config.authToken === 'function' ? config.authToken() : config.authToken; }
  catch (e) { return null; }
}

export function buildLoadRequest(opts) {
  const o = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (o.token) headers['Authorization'] = 'Bearer ' + o.token;
  if (o.apiKey) headers['apikey'] = o.apiKey;
  /* CONSTRUCTED, never a filtered copy and never a spread of a caller's object.
     One integer — the same rule accrue.js's buildAccrueRequest follows, for the
     same reason: a body assembled by spreading is a body a future field rides
     into. */
  const slot = Number.isInteger(o.slot) && o.slot >= 0 && o.slot <= 5 ? o.slot : 0;
  return {
    url: recordEndpoint(o.url),
    init: { method: 'POST', headers, body: JSON.stringify({ p_slot: slot }) },
  };
}

export const RECORD_OUTCOMES = [
  'loaded',         // the envelope is the record
  'no-character',   // ok:false no_character — nothing to be the record of
  'rate-limited',   // ok:false rate_limited (180/min)
  'not-signed-in',  // ok:false not_signed_in, or HTTP 401/403
  'not-deployed',   // HTTP 404 — hr_load is not in this database
  'unavailable',    // HTTP 5xx
  'refused',        // ok:false with a code this build does not know
  'malformed',      // a 200 that is not an envelope
  'unreachable',    // no answer at all (CORS, DNS, offline)
  'unconfigured',   // no endpoint / no token on this device
];

export function classifyLoadResponse(status, body) {
  const b = (body && typeof body === 'object') ? body : null;
  if (status === 401 || status === 403) return { outcome: 'not-signed-in', body: b };
  if (status === 404) return { outcome: 'not-deployed', body: b };
  if (status >= 500) return { outcome: 'unavailable', body: b, reason: 'http_' + status };
  if (status !== 200) return { outcome: 'malformed', body: b, reason: 'http_' + status };
  if (!b) return { outcome: 'malformed', body: b, reason: 'no_body' };
  if (b.ok === true) {
    /* A 200 that says ok but carries no decodable record is NOT a load. This is
       the branch that keeps the increment independent of whether
       2026-08-11-apply-engine.sql has been applied: an older hr_load whose
       envelope lacks `accrued_to` lands here, the field stays UNKNOWN, and
       nothing local is substituted. */
    const dec = decodeRecord(b);
    if (!dec.ok) return { outcome: 'malformed', body: b, reason: dec.reason };
    if (!Object.keys(dec.fields).length) {
      return { outcome: 'malformed', body: b, reason: 'no_record_fields', missing: dec.missing };
    }
    return { outcome: 'loaded', body: b, version: dec.version, missing: dec.missing };
  }
  switch (b.error) {
    case 'no_character':  return { outcome: 'no-character', body: b };
    case 'rate_limited':  return { outcome: 'rate-limited', body: b };
    case 'not_signed_in': return { outcome: 'not-signed-in', body: b };
    default:              return { outcome: 'refused', body: b, reason: b.error || 'unknown' };
  }
}

export function getRecordState() {
  return { active: isRecordActive(), configured: !!config, pending: !!inFlight, last };
}

export function resetRecord() { inFlight = null; last = null; wantedBootLoad = false; }

/**
 * ASK THE SERVER FOR THE RECORD. Returns a verdict; on `loaded` it has already
 * been applied, because there is nothing a caller could usefully do with an
 * envelope that this module would not do with it.
 *
 * Deliberately NO breaker and NO sheet: accrue.js already owns the "the server
 * is not answering" conversation with the player, and a second modal for one
 * outage is two sheets arguing. A failed load leaves the field UNKNOWN, which
 * is the honest state and is visible in getRecordState().
 */
export async function requestRecord(opts) {
  const o = opts || {};
  if (inFlight) return inFlight;
  /* LATCH, DON'T ABANDON (b428). A boot read that arrives before configureRecord
     wanted to run and could not; record that so configureRecord replays it the
     instant the endpoint (and, on the next line, the token) exists. Fail-closed is
     untouched — the field stays UNKNOWN until a real envelope lands. */
  if (!config) { wantedBootLoad = true; return (last = { outcome: 'unconfigured', reason: 'no_endpoint', applied: false }); }
  const token = tokenOf();
  if (!token) { wantedBootLoad = true; return (last = { outcome: 'unconfigured', reason: 'no_token', applied: false }); }

  const slot = resolveActiveSlot(Number.isInteger(o.slot) ? o.slot : config.slot);
  const { url, init } = buildLoadRequest({ url: config.url, apiKey: config.apiKey, token, slot });

  inFlight = (async () => {
    let res = null;
    try {
      res = await fetch(url, init);
    } catch (e) {
      return settle({ outcome: 'unreachable', reason: String((e && e.message) || e) });
    }
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    return settle({ ...classifyLoadResponse(res.status, body), status: res.status });
  })();

  try { return await inFlight; } finally { inFlight = null; }
}

function settle(verdict) {
  let applied = null;
  if (verdict.outcome === 'loaded') {
    const G = (typeof window !== 'undefined') ? window.G : null;
    applied = applyRecord(G, verdict.body);
    /* ── FEED THE RESIDUE STORE FROM THE SAME ENVELOPE (blob-retire capstone) ───
       The hr_load envelope carries the whole character; under the capstone the
       AUTHORITY fields go through applyRecord (above) and the SELF-ONLY residue
       goes through client_state. Feeding it here means ONE load populates both
       halves from ONE envelope. applyClientState is documented "always safe to
       call" and only CONSULTED while armed — so this is observationally inert
       while dormant (it populates a module bag that clientField ignores until the
       capstone flag is on). Fed unconditionally so the bag is ready the instant
       the flag flips, never gated on a flag that could leave it empty under arm.
       Passing G HYDRATES the residue straight into it (client-state.js
       hydrateInto), so every existing G.<residue> read is server-truth with NO
       per-site routing. Passing the SAME G applyRecord just wrote means
       bountyHunter.marks (authority — set by applyRecord/the marks path) is
       present for hydrateInto to preserve while it merges the residue.
       ✅ hr_state_of already projects a top-level `client_state` key
       (2026-08-28-client-state.sql §2, verified live) — no server migration is
       needed for this load path. A malformed/absent client_state no-ops and the
       bag stays null, which canProceedArmed treats as "not loaded yet"
       (fail-closed). */
    try { applyClientState(verdict.body, G); } catch (e) {}
    /* ── REBUILD THE COMPANION ROSTER FROM THE SAME ENVELOPE (blob-retire) ───────
       The boot hr_load envelope is the ALWAYS-FULL statement of the character
       (accrue's hr-accrue returns nothing on an idle settle, so applyEnvelopeState
       may never run on an idle boot). Companions are SERVER-OWNED under arm —
       ownership rows, the equipped column, and per-id XP — so the roster is rebuilt
       here from `res.companions`, exactly as workers/bank rebuild in
       applyEnvelopeState. Arm-gated inside reconcileCompanions: a pure no-op while
       dormant, so the dormant load path is byte-for-byte unchanged. Guarded — a
       throw here must never break the record load. */
    try { reconcileCompanions(G, verdict.body); } catch (e) {}
    /* ── REBUILD THE FARM PLOTS FROM THE SAME ENVELOPE (blob-retire capstone) ────
       The boot hr_load envelope is the ALWAYS-FULL statement of the character
       (accrue's hr-accrue returns nothing on an idle settle, so applyEnvelopeState
       may never run on an idle boot). Under arm the client stops loading the save
       blob, so NOTHING else rebuilds G.farmPlots / G.plotLevels — and the farm tick
       + render loops would deref an undefined and throw, silently vanishing every
       standing crop. Rebuilt here from `res.farm`, exactly as companions/workers
       rebuild in applyEnvelopeState. Arm-gated inside reconcileFarm: a pure no-op
       while dormant, so the dormant load path is byte-for-byte unchanged. Guarded —
       a throw here must never break the record load. */
    /* {authoritative:true}: the boot hr_load body IS the full statement of the
       farm, so an empty farm here legitimately clears the plots (a new/unplanted
       character). The LEAN accrue-settle path (applyEnvelopeState) passes no flag,
       so an empty array there never wipes a standing farm — the KD420
       disappearing-plots fix. */
    try { reconcileFarm(G, verdict.body, { authoritative: true }); } catch (e) {}
    /* ── HYDRATE THE OWNED TRAIT SET FROM THE SAME ENVELOPE (b46x) ───────────────
       hr_trait_buy is now the server-side writer of a permanent trait, and
       hr_state_of projects the owned ids as a flat `traits` array. The boot
       hr_load envelope is the ALWAYS-FULL statement of the character (an idle
       settle returns nothing, so applyEnvelopeState may never run on an idle
       boot), so ownership is hydrated HERE as well — which is what makes a trait
       bought on one device appear on another. A UNION, never a replace: a trait
       bought before the server verb existed has no server row and must never be
       revoked (see reconcileTraits' header). Guarded — a throw here must never
       break the record load. */
    try { reconcileTraits(G, verdict.body); } catch (e) {}
    /* ── HYDRATE THE BAG + BANK FROM THE SAME ENVELOPE (b46x inventory-hydrate) ───
       THE P1 THIS CLOSES. Inventory hydration lived ONLY in accrue.js's
       applyEnvelopeState, which runs ONLY on `accrued:true`. On an IDLE boot
       hr-accrue answers {accrued:false, reason:'idle'} — so applyEnvelopeState
       never ran and the bag was never applied: the player saw a stale ~3-stack
       remnant while the server held the full inventory (near-total apparent loss
       to anyone whose activity had ended before they reloaded). The boot hr_load
       envelope is the ALWAYS-FULL statement of the character and DOES carry the
       full inventory + bank, so the bag is rebuilt HERE from `verdict.body`,
       exactly as companions/farm/traits rebuild above and through the SAME shared
       apply the accrue path uses (reconcileInventory / reconcileBank).

       NO DOUBLE-APPLY on a non-idle boot (where applyEnvelopeState ALSO runs from
       the hr-accrue envelope): in prod merge-mode the bag is a Math.max ratchet
       (idempotent), the hr_load body carries no `away` block so no debit ever
       deletes on this path, and itemLedger.reconcile only ever removes. The bank
       reconcile is fully inert in prod (invAbsolute false → reconcileBank leaves
       G.bank untouched); it is wired now so the always-full boot path is ready the
       day the inventory flip arms. The prediction sweep is deliberately NOT run
       here — that stays with applyEnvelopeState so gold applyRecord already wrote
       is not re-offset. Guarded — a throw must never break the record load. */
    try {
      reconcileBank(G, verdict.body);       // dormant in prod (invAbsolute false)
      reconcileInventory(G, verdict.body);  // merge-ratchets the full server bag in
      /* b477 — SAME IDLE-BOOT CLASS FOR THE CREW. The worker roster hydrated ONLY
         via applyEnvelopeState (accrue.js), which runs ONLY on accrued:true. On an
         IDLE boot hr-accrue answers {accrued:false}, so a player with a producing
         crew (e.g. Aldric mining) saw G.workers.hired=[] — an "invisible crew" that
         reads as "my workers reset" and makes them re-hire one they already own
         (QA 0a47ba77, live). The hr_load body always carries the full `workers`
         roster (hr_state_of), so rebuild it HERE like inventory/bank/companions.
         reconcileWorkers is fail-closed on a missing array (leaves G.workers alone)
         and idempotent on a non-idle boot (server-owned fields win, display ledger
         preserved by uid). */
      reconcileWorkers(G, verdict.body);
    } catch (e) {}
    /* b465 — the server's daily-login claim row closes the daily-reward sheet's
       question at boot (the residue marker kept losing tab/save races and the
       sheet re-opened on a paid reward). Guarded like its neighbours. */
    try {
      if (window.HearthriseDaily && typeof window.HearthriseDaily.markServerClaim === 'function') {
        window.HearthriseDaily.markServerClaim(verdict.body && verdict.body.progress);
      }
      // b475 — feed the server's authoritative streak (state.streak_days) so the
      // daily-reward sheet displays the day/reward the server will actually pay,
      // not the drifting residue copy.
      if (window.HearthriseDaily && typeof window.HearthriseDaily.noteServerStreak === 'function') {
        window.HearthriseDaily.noteServerStreak(verdict.body);
      }
    } catch (e) {}
    /* ── BOOT-RESUME (b456 QA finding): the boot hr_load envelope carries
       state.active_kind/active_id, but reconcileActivityPointer was only wired
       to the activity-SWITCH hook — so a reload booted to "Idle" while the
       server kept settling the player's real activity. Resume it here, on the
       same envelope that rebuilt everything else. Call-time window reads
       (activity.js imports THIS module — a static import back would cycle).
       Safe at boot: the local pointer is idle, so a genuinely-idle server
       answer no-ops; a throw must never break the record load. */
    try {
      const HA = (typeof window !== 'undefined') && window.HearthriseActivity;
      const rap = (typeof window !== 'undefined') && window.reconcileActivityPointer;
      if (HA && typeof HA.activityOf === 'function' && typeof rap === 'function') {
        const act = HA.activityOf(verdict.body);
        if (act && act.kind && act.kind !== 'idle') {
          rap(act, typeof HA.fightOf === 'function' ? HA.fightOf(verdict.body) : null);
        }
      }
    } catch (e) {}
  } else {
    console.warn('[record] the server did not supply the record (' + verdict.outcome
      + (verdict.reason ? ': ' + verdict.reason : '') + ') — '
      + serverOfRecordFields().join(', ') + ' stay UNKNOWN, and this device will not guess.');
  }
  const didApply = !!(applied && applied.written && applied.written.length);
  last = { outcome: verdict.outcome, reason: verdict.reason || null, at: Date.now(),
    applied: didApply };
  /* REPAINT ON EVERY LAND (b427/b428). record.js is DOM-free, so the UI is told to
     re-read the balance here — for the initial boot read AND for the post-config
     retry, which is the one the new-device em dash was waiting on. Only when a
     field was actually written; a failed/empty load paints nothing. */
  if (didApply && appliedCb) { try { appliedCb(applied); } catch (e) {} }
  return { ...verdict, applied };
}

/** The entry point legacy.js's b337 gate calls, after the character ensure.
 *  Fire-and-forget for the same reason accrue.js's is: the game must not block
 *  a frame on a round trip. */
export function beginRecordLoad(opts) {
  const p = requestRecord(opts);
  p.catch(() => {});
  return p;
}

if (typeof window !== 'undefined') {
  window.HearthriseRecord = {
    SERVER_OF_RECORD, RECORD_OUTCOMES, REGISTRY_FIELDS,
    isRecordActive, serverOfRecordFields, isServerOfRecord, recordEntry, clientMayWrite,
    decodeBalance, fingerprintBalance,
    decodeSkills, fingerprintSkills,
    SKILLS_RECORD_ARM_ENABLED, isSkillsRecordArmed, __setSkillsRecordArm,
    decodeEquipment, fingerprintEquipment,
    EQUIPMENT_RECORD_ARM_ENABLED, isEquipmentRecordArmed, __setEquipmentRecordArm,
    pickRooms, decodeRooms, fingerprintRooms,
    ROOMS_RECORD_ARM_ENABLED, isRoomsRecordArmed, __setRoomsRecordArm,
    MARKS_RECORD_ARM_ENABLED, isMarksRecordArmed, __setMarksRecordArm,
    decodeRestedAt, fingerprintRestedAt,
    RESTED_RECORD_ARM_ENABLED, isRestedRecordArmed, __setRestedRecordArm,
    stripServerOfRecord, forgetServerOfRecord,
    decodeRecord, applyRecord, recordValue, recordLastKnown,
    configureRecord, getRecordConfig, recordEndpoint,
    buildLoadRequest, classifyLoadResponse,
    requestRecord, beginRecordLoad, getRecordState, resetRecord,
    onRecordApplied,
  };
}
