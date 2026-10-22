// ════════════════════════════════════════════════════════════════════════
// src/session/refusal.js — AN INTENT'S REFUSAL, AS THE EDITOR READS IT. PURE.
//
// CharacterSession._settled hands every refused answer here. The server's
// validation detail (which slot, which condition, which field) goes back to the
// editor as sent, and so does the item a refusal names (hr_apply's detail, one
// level down on an edge refusal): "Needs Defense 20". Nothing is decided here.
// ════════════════════════════════════════════════════════════════════════

const ITEM = /^[a-z0-9_]{1,64}$/;

/** { ok:false, error, slot, condition, field, item } from a refused answer { ok, body, error }. */
export function refusalOf(ans) {
  const b = ans.body && typeof ans.body === 'object' ? ans.body : {};
  const d = b.detail && typeof b.detail === 'object' ? b.detail : {};
  const item = [d.item_id, d.detail && d.detail.item_id, b.item_id].find((x) => typeof x === 'string' && ITEM.test(x)) || null;
  return { ok: false, error: (typeof b.error === 'string' && b.error) || ans.error || 'refused',
    slot: Number.isInteger(b.slot) ? b.slot : null, condition: Number.isInteger(b.condition) ? b.condition : null,
    field: typeof b.field === 'string' ? b.field.slice(0, 32) : null, item };
}
