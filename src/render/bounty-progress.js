// ============================================================
// src/render/bounty-progress.js — whose count is on the bounty bar (render layer)
//
// Render-layer extraction out of src/legacy.js, following the playbook in
// docs/design/render-extraction-pattern.md.
//
// WHAT THIS IS: the four presentation-side seams the Bounty Board needs once
// the envelope carries the server's own progress —
//   shown()      the number a bar/label may display
//   attempt()    "does the player believe this contract is finished?"
//   noteServer() adopt `state.bounty` off an arriving envelope
//   turnIn()     the board's Claim control
// The JUDGEMENT is pure and lives in src/core/bounty.js (shownProgress /
// attemptProgress / adoptServerBounty); this module is the DOM-side glue that
// supplies the inventory-derived proof count and routes a finished contract
// into the EXISTING two-phase turn-in. It computes no reward, mints nothing and
// writes exactly one field on the active bounty: `_serverConfirmed`, a display
// number sourced from a server receipt.
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

/** The number a bar or label may show. The server's when it has spoken; the
    local pre-echo only until then. See the block in src/core/bounty.js. */
export function shown(b) {
  const C = core();
  if (!C || typeof C.shownProgress !== 'function') {
    // Pre-core boot: the honest fallback is the local counter, as it always was.
    return Math.max(0, Math.min(Number(b && b.required) || 1, Number(b && b.progress) || 0));
  }
  return C.shownProgress(b, proofHave(b));
}

/** "Does the player believe this is finished?" — the HIGHER of the two counts.
    The hold-retry timer and the "Verifying your kills…" label read THIS, not
    shown(): the retry exists for the case where the local count is at target
    and the server's is still catching up under the plausibility cap. */
export function attempt(b) {
  const C = core();
  if (!C || typeof C.attemptProgress !== 'function') return Number(b && b.progress) || 0;
  return C.attemptProgress(b, proofHave(b));
}

/* Adopt the envelope's `state.bounty`. The identity checks, the clamping and
   the refusal reasons are src/core/bounty.js `adoptServerBounty`; this writes
   the display number and, when the contract is FINISHED, schedules the existing
   two-phase turn-in — which still goes through hr_claim_bounty and still pays
   from the RESPONSE. A missing key is a no-op, which is exactly the behaviour a
   server without the projection gets.
   @returns a receipt, so the suite asserts the rule and not a rendered string. */
export function noteServer(res) {
  const out = { noted: false, reason: '', progress: null, turnIn: false };
  const has = (o, k) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
  const src = has(res && res.state, 'bounty') ? res.state : (has(res, 'bounty') ? res : null);
  if (!src) { out.reason = 'no_key'; return out; }          // FAIL-SAFE: today's behaviour
  const C = core();
  if (!C || typeof C.adoptServerBounty !== 'function') { out.reason = 'no_core'; return out; }
  const W = w();
  try { if (typeof W.ensureBountyState === 'function') W.ensureBountyState(); } catch (e) {}
  const G = W.G || {};
  const act = (G.bountyHunter && G.bountyHunter.active) || null;
  const v = C.adoptServerBounty(act, src.bounty);
  if (!v.ok) { out.reason = v.reason; return out; }
  act._serverConfirmed = v.progress;
  out.noted = true; out.progress = v.progress;
  /* FINISHED AWAY ⇒ FIRE THE TURN-IN THE PLAYER CAME BACK TO. Only the one type
     the server verifies, only live, and only under the arm — the dormant path
     still owns its own reward and must not be driven from an envelope. */
  const armed = (typeof W.clientMayWriteRecordField === 'function' && !W.clientMayWriteRecordField('gold'));
  const live = (typeof W.inOfflineReplay !== 'function' || !W.inOfflineReplay());
  if (armed && live && act.type === 'cull' && v.progress >= act.required
      && !act._confirming && !act._confirmed && typeof W.completeBounty === 'function') {
    out.turnIn = true;
    try { W.completeBounty(); } catch (e) {}
  }
  try { if (typeof W.renderCombat === 'function') W.renderCombat(); } catch (e) {}
  try { if (typeof W.repaintBounty === 'function') W.repaintBounty(); } catch (e) {}
  return out;
}

/* The player-fired turn-in. The board offers Claim on the SERVER's count,
   because that is the number hr_claim_bounty judges — a Claim drawn off the
   local pre-echo would be a button that refuses. Routes into the same two-phase
   completeBounty() as every other turn-in; nothing here mints anything. */
export function turnIn() {
  const W = w();
  const G = W.G || {};
  const b = (G.bountyHunter && G.bountyHunter.active) || null;
  if (!b) return;
  if (shown(b) < Math.max(1, Math.floor(Number(b.required) || 1))) {
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

/** "12 / 20" — reads shown(), so the text can never disagree with the bar. */
export function progressText(b) {
  if (!b) return '';
  return `${shown(b)} / ${b.required}`;
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
  W.HearthriseBountyView = { shown, attempt, noteServer, turnIn, label, progressText, bbNail, bbCut };
  /* Bare globals too: legacy.js's four render sites and the envelope hook call
     these by name, and the Claim control is an inline onclick. */
  W.bountyShownProgress = shown;
  W.bountyAttemptProgress = attempt;
  W.hrNoteServerBounty = noteServer;
  W.hrTurnInBounty = turnIn;
  W.bountyLabel = label;
  W.bountyProgressText = progressText;
  W._bbNail = bbNail;
  W._bbCut = bbCut;
}
