// ============================================================
// src/render/bounty-progress.js — whose count is on the bounty bar (render layer)
//
// Render-layer extraction out of src/legacy.js, following the playbook in
// docs/design/render-extraction-pattern.md.
//
// WHAT THIS IS: the presentation-side seams of the Bounty Board —
//   view()               the ONE figure every surface prints: server's, or '—'
//   attempt()            "does the player believe this contract is finished?"
//   noteServerProgress() the ONE writer of G._bountyServer
//   noteServer()         adopt `bounty` off an envelope or the boot hr_load
//   turnIn()             the board's Claim control
// The JUDGEMENT is pure and lives in src/core/bounty.js (bountyView /
// attemptProgress / judgeServerBounty); this module is the DOM-side glue that
// supplies the inventory-derived proof count and routes a finished contract
// into the EXISTING two-phase turn-in. It computes no reward, mints nothing and
// writes exactly one field: `G._bountyServer`, the server's figure as received.
//
// THE BUG BEHIND IT: a bounty's `progress` is a client-local counter moved on
// ATTENDED kills only. In a semi-idle game most kills are SETTLED (away), so a
// character with 218 real kills of its target sat at a board reading 9/20 and
// could never turn the contract in — while hr_claim_bounty had been judging it
// as hr_bounty_kills - baseline all along. The server was right and the client
// was blind; hr_state_of now projects the number, and this reads it.
//
// Globals are read via window.* (the established src/features|render convention)
// and resolved at CALL time, so this module may load in any order after
// legacy.js. Published on window because the board's Claim button is an inline
// onclick and legacy.js's render sites call the readers by bare global.
// ============================================================

const w = () => (typeof window !== 'undefined' ? window : {});

/** The proof-bounty count is inventory-derived, and inventory is legacy's. */
function proofHave(b) {
  const f = w().bountyProofHave;
  return (b && b.type === 'proof' && typeof f === 'function') ? (Number(f(b)) || 0) : 0;
}

function core() {
  const CK = w().HearthriseCore;
  return (CK && CK.bounty) ? CK.bounty : null;
}

/* THE ONE WRITER of G._bountyServer, the server's figure for the contract it
   names. Rules are src/core/bounty.js judgeServerBounty: a different contract
   REPLACES, the same one is raise-only, `null` records "no contract". `_`-prefixed
   top-level scratch is never on RESIDUE_FIELDS, so it is never saved or hydrated. */
export function noteServerProgress(p) {
  const C = core(), G = w().G;
  if (!C || !G || typeof C.judgeServerBounty !== 'function') return null;
  const m = C.judgeServerBounty(p, G._bountyServer || null);
  if (m) G._bountyServer = m;
  return m;
}

/** THE ONE VIEW every bounty surface prints: the server's figure, or '—'. */
export function view(b) {
  const C = core(), G = w().G;
  if (!C || typeof C.bountyView !== 'function') {
    const r = Math.max(1, Math.floor(Number(b && b.required) || 1));
    return { known: false, progress: null, mark: '—', required: r, text: `— / ${r}`, claimable: false, confirming: false, orphan: false };
  }
  return C.bountyView(b, (G && G._bountyServer) || null, { proofHave: proofHave(b), inFlight: !!(b && b._confirming) });
}

/** "Does the player believe this is finished?" — the retry timer reads THIS. */
export function attempt(b) {
  const C = core();
  if (!C || typeof C.attemptProgress !== 'function') return Number(b && b.progress) || 0;
  return C.attemptProgress(b, proofHave(b), view(b).progress);
}

/* Adopt the envelope's (or hr_load's) `bounty`, top-level or under `state`. The
   mirror is stored whenever the key is present, even before the contract is
   hydrated; the receipt is then judged against `active`. When the contract is
   FINISHED, schedule the existing two-phase turn-in (hr_claim_bounty still
   judges it and still pays from the RESPONSE). A missing key is a no-op.
   @returns a receipt, so the suite asserts the rule and not a rendered string. */
export function noteServer(res) {
  const out = { noted: false, reason: '', progress: null, turnIn: false };
  const has = (o, k) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
  const src = has(res && res.state, 'bounty') ? res.state : (has(res, 'bounty') ? res : null);
  if (!src) { out.reason = 'no_key'; return out; }          // FAIL-SAFE: today's behaviour
  const C = core();
  if (!C || typeof C.judgeServerBounty !== 'function') { out.reason = 'no_core'; return out; }
  const W = w();
  try { if (typeof W.ensureBountyState === 'function') W.ensureBountyState(); } catch (e) {}
  if (!noteServerProgress(src.bounty)) { out.reason = 'bad_progress'; return out; }
  const G = W.G || {};
  const act = (G.bountyHunter && G.bountyHunter.active) || null;
  if (!act) { out.reason = 'no_active'; return out; }
  const v = view(act);
  if (!v.known) { out.reason = src.bounty === null ? 'no_server_bounty' : 'mismatch'; return out; }
  out.noted = true; out.progress = v.progress;
  /* FINISHED AWAY ⇒ FIRE THE TURN-IN THE PLAYER CAME BACK TO. Only the one type
     the server verifies, only live, and only under the arm — the dormant path
     still owns its own reward and must not be driven from an envelope. */
  const armed = (typeof W.clientMayWriteRecordField === 'function' && !W.clientMayWriteRecordField('gold'));
  const live = (typeof W.inOfflineReplay !== 'function' || !W.inOfflineReplay());
  if (armed && live && act.type === 'cull' && v.claimable
      && !act._confirmed && typeof W.completeBounty === 'function') {
    out.turnIn = true;
    try { W.completeBounty(); } catch (e) {}
  }
  try { if (typeof W.renderCombat === 'function') W.renderCombat(); } catch (e) {}
  try { if (typeof W.repaintBounty === 'function') W.repaintBounty(); } catch (e) {}
  return out;
}

/* The player-fired turn-in. The board offers Claim on the SERVER's figure,
   because that is the number hr_claim_bounty judges — a Claim drawn off the
   local count would be a button that refuses. Routes into the same two-phase
   completeBounty() as every other turn-in; nothing here mints anything. */
export function turnIn() {
  const W = w();
  const G = W.G || {};
  const b = (G.bountyHunter && G.bountyHunter.active) || null;
  if (!b) return;
  if (!view(b).claimable) {
    if (typeof W.notify === 'function') W.notify('The board has not counted enough kills yet.', 'kill');
    return;
  }
  if (typeof W.completeBounty === 'function') W.completeBounty();
  if (typeof W.repaintBounty === 'function') W.repaintBounty();
}

/* ── THE BOARD'S STRINGS AND ITS TWO PAPER FLOURISHES ───────────────────────
   Moved here from legacy.js in this pass, unchanged: they are pure
   presentation, every caller is renderBountyPanel or the suite, and nothing
   captures them at parse time (so publishing them on window at ESM boot is
   behaviour-identical). They pay for the lines this feature added to the
   monolith, in the file the feature was written in. */

/** The task line on a notice. */
export function label(b) {
  const W = w();
  const m = (W.MONSTERS || {})[b.target];
  if (!m) return 'Unknown Bounty';
  /* A proof bounty is a requirement like any other — "Collect 5 Wolf Pelt" is
     only actionable if you know which monster drops one, so the item name opens
     its flyout, where the reverse index names the drop. */
  if (b.type === 'proof') {
    const pn = ((W.ITEMS || {})[b.proofItem] || {}).n || b.proofItem;
    return `Collect ${b.required} ${typeof W.hrInspectSpan === 'function' ? W.hrInspectSpan(b.proofItem, pn) : pn}`;
  }
  // `neutral` is retired (DEC-NEUT-01), so every weapon bounty names a real type.
  if (b.type === 'weapon') return `Defeat ${b.required} ${m.name}s using ${(W.WEAPON_TYPES || {})[b.requiredWeaponType] || 'any weapon'}`;
  if (b.type === 'streak') return `Defeat ${b.required} ${m.name}s without dying`;
  return `Defeat ${b.required} ${m.name}s`;
}

/** "12 / 20", or "— / 20" while the server has not named this contract. A
    contract the server refused to accept (no row) says so, with the way out. */
export function progressText(b) {
  if (!b) return '';
  const v = view(b);
  if (!v.orphan) return v.text;
  const why = String(b._acceptError).replace(/[&<>"']/g, '');
  return `${v.text} · The realm refused this contract (${why}) — abandon it and accept another.`;
}

export function bbNail() { return '<span class="bb-nail" aria-hidden="true"></span>'; }

/* The painted portrait is printed onto the notice, not pasted on top of it:
   sepia-toned inside an inked oval, the way a woodcut would sit on paper. */
export function bbCut(id) {
  const src = w()._monsterIcon && w()._monsterIcon[id];
  return '<span class="bb-cut">' + (src ? '<img src="' + src + '" alt="" loading="lazy" draggable="false" />' : '') + '</span>';
}

export function setupBountyProgress() {
  const W = w();
  W.HearthriseBountyView = { view, attempt, noteServer, noteServerProgress, turnIn, label, progressText, bbNail, bbCut };
  /* Bare globals too: legacy.js's four render sites and the envelope hook call
     these by name, and the Claim control is an inline onclick. */
  W.hrBountyView = view;
  W.hrNoteBountyProgress = noteServerProgress;
  W.bountyAttemptProgress = attempt;
  W.hrNoteServerBounty = noteServer;
  W.hrTurnInBounty = turnIn;
  W.bountyLabel = label;
  W.bountyProgressText = progressText;
  W._bbNail = bbNail;
  W._bbCut = bbCut;
}
