// ============================================================================
// src/net/capstone.js — RETIRE THE CLIENT SAVE BLOB (the server-authority CAPSTONE).
//
// b432–b439 moved every AUTHORITY field off the client-authored save blob onto
// the server: gold, gems, skills, inventory, bank, equipment, rooms, marks,
// rested XP, farming, companion-XP (record.js / the RPCs / the accrual engine),
// and gave every remaining SELF-ONLY residue field a server home in
// player_state.client_state (client-state.js: clientField / putClientState /
// applyClientState). What is LEFT to do is the finish line: stop authoring the
// character on the client at all — load the WHOLE character from the server on
// boot, save only the residue (not the authoritative blob), and REMOVE the
// device-handoff reconcile modal ("this will replace your local progress"),
// which cannot exist once there is no rival local copy to reconcile against.
//
// ── THE ONE FLAG ────────────────────────────────────────────────────────────
// This is the SINGLE switch for the entire capstone. It is the highest-risk
// change in the program — it reworks the boot/load/save path and removes the
// reconcile safety net the b305 stress battery guards — so it ships FULLY
// DORMANT and is armed only POST-WIPE, as a coordinated live op.
//
//   DORMANT (BLOB_RETIRED=false, or the master accrual switch off):
//           EVERYTHING behaves BYTE-FOR-BYTE as today. The blob is uploaded,
//           decideRestore + pullAndMaybeRestore run, the reconcile modal can
//           still appear, and clientField reads G[field]. Nothing changes live.
//   ARMED   (BLOB_RETIRED=true AND the master switch on, POST-WIPE only):
//           · the save path STOPS uploading snapshot()'s authoritative blob and
//             instead ships the residue via putClientState (authority fields
//             flow through their existing server writes: record / RPCs / accrual);
//           · the load path takes the WHOLE character from the server — authority
//             from the hr_load / hr-accrue envelope (record.js applyRecord), the
//             residue HYDRATED straight into G from client_state
//             (applyClientState(res, G)) — and consults NO local authoritative
//             save for authority;
//           · pullAndMaybeRestore / decideRestore / the reconcile modal are
//             BYPASSED: the server is the sole source, so there is nothing to
//             reconcile and no prompt is ever shown.
//
// ── HYDRATE G, DON'T ROUTE READS (the low-risk model) ───────────────────────
// Residue is NON-AUTHORITY (self-only) — there is no forgery concern, so unlike
// gold/skills it needs NO fail-closed per-site accessor. On load under arm the
// server bag is written STRAIGHT INTO G (client-state.js hydrateInto), so every
// existing `G.<residue>` read is already server-truth with ZERO per-site
// changes — the ~1,001-site read sweep disappears. clientField remains a thin
// optional helper; it is not required at call sites. There is no longer any
// nested-ownership carve-out: marks migrated to the top-level record field
// `G.marks`, so bountyHunter is wholly residue and hydrateInto/buildResiduePatch
// merely DROP any stray nested `marks` defensively (see those functions).
//
// ── THE MASTER-SWITCH COUPLING ──────────────────────────────────────────────
// isBlobRetired() ALSO requires isServerAccrualEnabled(), the same master switch
// record.js's arms ride. The capstone cannot be "on" while the record system as
// a whole is off — that would strip/retire the blob while the authority fields
// were still client-authored, stranding the character. One switch decides whose
// record it is; this flag decides whether the blob still exists at all, and it
// can only matter once the record system is live.
//
// ── WHY A GLOBAL, NOT AN IMPORT, FOR accrue.js/gold.js ──────────────────────
// accrue.js gates its replacement modal on this flag, and accrue.js is imported
// BY this module (for isServerAccrualEnabled) — so accrue.js reads the flag off
// window.HearthriseCapstone at CALL time (the same cycle-avoidance gold.js uses
// for isReconcilePending, see accrue.js ~1828). This module's own reference to
// accrue is call-time too, so the cycle is benign either way, but the global
// keeps accrue.js import-free of the capstone.
//
// ── FAIL-CLOSED, THE NEW MODEL'S CORE SAFETY PROPERTY ───────────────────────
// The b305 battery defends "a newer local is never rolled back / a fresh local
// never clobbers a real cloud". Under arm there is NO local authoritative save
// to roll back or clobber — so those invariants are vacuously safe FOR THE
// DORMANT PATH (unchanged) and are REPLACED under arm by a stricter one:
//
//   an UNCERTAIN / ABSENT / GARBAGE server envelope must NEVER destroy the
//   character, and must NEVER fall back to a client-authored save. If the
//   server character cannot be loaded, the client REFUSES TO PROCEED (online-
//   only) rather than authoring one locally.
//
// canProceedArmed(G) is that gate: armed, it is true only once the record has a
// version AND the client_state bag has arrived (or the server said no_character,
// a legitimate fresh start). Everything else keeps the boot in its pre-character
// state — exactly like a failed hr_load today leaves the balance UNKNOWN.
//
// DOM-free. Node-importable. `fetch`/`window` resolve at call time.
// ============================================================================

import { isServerAccrualEnabled } from './accrue.js?v=443';
import { isClientStateFromServer, RESIDUE_FIELDS } from './client-state.js?v=443';

/* ── THE ARM ─────────────────────────────────────────────────────────────────
   Same shape as record.js's per-field arms (SKILLS_RECORD_ARM_ENABLED et al):
   a greppable const defaulting OFF, a test override seam, and a runtime
   predicate that ALSO requires the master accrual switch. */
export const BLOB_RETIRED = false;   // DORMANT — post-wipe capstone arm only
let armOverride = null;
export function isBlobRetired() {
  const on = armOverride !== null ? armOverride : BLOB_RETIRED;
  return !!on && isServerAccrualEnabled();
}
/** Test seam, same spirit as record.js's __setSkillsRecordArm. */
export function __setBlobRetired(v) {
  armOverride = (v === null || v === undefined) ? null : !!v;
  return isBlobRetired();
}

/* ── THE RESIDUE CENSUS ──────────────────────────────────────────────────────
   RESIDUE_FIELDS is defined in client-state.js (the low-level store) and imported
   here, so there is ONE list and it lives next to hydrateInto — the security
   boundary that must not trust an arbitrary bag key. Re-exported for callers /
   the guard. See client-state.js for the full rationale.

   AUDIT — NESTED FIELDS PARTIALLY OWNED ELSEWHERE: NONE remain. `bountyHunter`
   used to hold the nested authority `bountyHunter.marks`; marks migrated to the
   top-level record field `G.marks` (like gold), so bountyHunter is now wholly
   residue. buildResiduePatch still DROPS any `marks` key on the way OUT and
   hydrateInto on the way IN — purely defensive, so a forged/legacy nested marks can
   never shadow the top-level record. Everything on the list is wholly self-only.

   PLAYERNAME: the cross-player AUTHORITATIVE display name is derived server-side
   from `display_names`; the hr_load/hr_state_of envelope does NOT carry it. So the
   player's OWN copy of playerName lives in client_state and hydrates from the bag
   like any other residue — no per-site routing, no new server projection. */
export { RESIDUE_FIELDS };

/** Build the residue patch to ship via putClientState. Only present, defined
 *  fields ride; an absent field is simply not sent (a shallow server merge). */
export function buildResiduePatch(G) {
  if (!G || typeof G !== 'object') return {};
  const out = {};
  for (const f of RESIDUE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(G, f) || typeof G[f] === 'undefined') continue;
    if (f === 'bountyHunter') {
      // ⚠ bountyHunter MINUS marks — marks is AUTHORITY (server-owned via the
      // record). It must never ride in the self-only client_state bag, or the
      // client would re-author a server-owned balance (the two-sources bug).
      const bh = G.bountyHunter;
      if (bh && typeof bh === 'object' && !Array.isArray(bh)) {
        const copy = {};
        for (const k in bh) {
          if (!Object.prototype.hasOwnProperty.call(bh, k)) continue;
          if (k === 'marks') continue;
          copy[k] = bh[k];
        }
        out[f] = copy;
      } else {
        out[f] = bh;
      }
      continue;
    }
    out[f] = G[f];
  }
  return out;
}

/* ── THE ARMED FAIL-CLOSED GATE ───────────────────────────────────────────────
   Under arm, the character is the server's. This answers: is the server
   character actually here yet? It is the online-only refusal made checkable —
   the boot must not proceed to author/upload anything until BOTH halves have
   arrived:
     · the RECORD has a version (record.js stamped `G._record.version` from a
       real envelope), OR the server definitively said no_character (a fresh
       account — legitimate, nothing to load);
     · the client_state bag has arrived (isClientStateFromServer()), OR — same
       fresh-account case — there is no residue to load yet.

   DORMANT this always returns true (the old path owns proceeding). It is only
   consulted on the armed branches, and its whole job there is to make an
   UNCERTAIN load a NON-EVENT: the client keeps waiting (UNKNOWN balances, no
   upload), never substituting a local authored save. */
export function canProceedArmed(G, opts) {
  if (!isBlobRetired()) return true;             // dormant — old path decides
  const o = opts || {};
  if (o.noCharacter === true) return true;       // server said fresh account — proceed clean
  const rec = G && G._record;
  const hasRecord = !!(rec && Number.isFinite(Number(rec.version)));
  const hasResidue = isClientStateFromServer();
  return hasRecord && hasResidue;
}

if (typeof window !== 'undefined') {
  window.HearthriseCapstone = {
    BLOB_RETIRED, isBlobRetired, __setBlobRetired,
    RESIDUE_FIELDS, buildResiduePatch, canProceedArmed,
  };
}
