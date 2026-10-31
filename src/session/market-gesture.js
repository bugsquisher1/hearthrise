// ════════════════════════════════════════════════════════════════════════
// src/session/market-gesture.js — ONE KEY PER GESTURE (Security market review change 4).
//
// PURE. A market write takes its idempotency key from the caller (market-intents.js). The
// window mints one when the player presses and holds it until a definite answer. A lost
// answer means the server may have acted, so only that same key may be sent again: the
// server then replays its decision instead of buying twice.
// ════════════════════════════════════════════════════════════════════════

/** A fresh idempotency key for one gesture. */
export function marketKey() { return globalThis.crypto.randomUUID(); }

/** Did the answer get lost on the way back? The server may have acted: only the SAME key may be sent again. */
export function answerLost(r) {
  return !!r && r.ok !== true && typeof r.error === 'string' && (r.error === 'network' || r.error === 'no_token' || /^http_5\d\d$/.test(r.error));
}
