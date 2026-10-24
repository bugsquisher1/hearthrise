// ════════════════════════════════════════════════════════════════════════
// src/session/refusal.js — AN INTENT'S REFUSAL, AS THE EDITOR READS IT. PURE.
//
// CharacterSession._settled hands every refused answer here. The server's
// validation detail (which slot, which condition, which field) goes back to the
// editor as sent, and so does the item a refusal names (hr_apply's detail, one
// level down on an edge refusal): "Needs Defense 20". Nothing is decided here.
// ════════════════════════════════════════════════════════════════════════

const ITEM = /^[a-z0-9_]{1,64}$/;

/** { ok:false, error, verb, slot, condition, field, item, reason } from a refused answer { ok, body, error }; `verb` is
 *  the engine's echo of the intent refused (its words may differ by verb: refusal-words.js REFUSAL_VERB_WORDS). */
export function refusalOf(ans) {
  const b = ans.body && typeof ans.body === 'object' ? ans.body : {};
  const d = b.detail && typeof b.detail === 'object' ? b.detail : {};
  const item = [d.item_id, d.detail && d.detail.item_id, b.item_id].find((x) => typeof x === 'string' && ITEM.test(x)) || null;
  return { ok: false, error: (typeof b.error === 'string' && b.error) || ans.error || 'refused',
    verb: typeof b.verb === 'string' && /^[a-z_]{1,32}$/.test(b.verb) ? b.verb : null,
    slot: Number.isInteger(b.slot) ? b.slot : null, condition: Number.isInteger(b.condition) ? b.condition : null,
    field: typeof b.field === 'string' ? b.field.slice(0, 32) : null, item,
    reason: typeof b.reason === 'string' && /^[a-z_]{1,24}$/.test(b.reason) ? b.reason : null };
}

/* A settle that paid nothing is NOT a refusal when it says why it waits: the window is under the town floor
   (below_min_span), under one action (nothing_accrued), already paid (replayed), or nothing runs (idle). */
const SETTLE_WAITS = Object.freeze(['below_min_span', 'nothing_accrued', 'replayed', 'idle']);

/**
 * The engine's word that it would not settle this character's activity (hr-accrue's {accrued:false} with any other
 * reason: an unknown node or recipe, a bench it may not pay, a clamp): { reason, version } (the version it answered at,
 * null when unstated), else null. The town ticker (src/shell/town-ticker.js) predicts nothing while one stands.
 */
export function settleRefusalOf(ans) {
  const b = ans && ans.ok && ans.body && typeof ans.body === 'object' ? ans.body : null;
  if (!b || b.ok === false || b.accrued !== false || typeof b.reason !== 'string' || SETTLE_WAITS.includes(b.reason)) return null;
  return { reason: b.reason.slice(0, 32), version: Number.isSafeInteger(b.version) ? b.version : null };
}
