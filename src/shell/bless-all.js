// ════════════════════════════════════════════════════════════════════════
// src/shell/bless-all.js — EVERY MISSING BLESSING, ONE SERVER PURCHASE EACH.
//
// The Shop's Services tab (windows/services.js, "Bless all") and the hunt summary's
// Back in town row (windows/hunt-summary.js, "Bless") share this one routine, so the
// two presses can never disagree. The server has no bulk verb: the next tier is bought
// at the price the server's envelope quotes now, then the next from the envelope that
// purchase brought back. Stops at the first refusal (its words are the answer) and never
// asks for the same tier twice, so an envelope that did not move cannot loop. No
// client-side total. The caller's runIntent says the answer.
// ════════════════════════════════════════════════════════════════════════
import { blessingsOf } from '../session/item-sections.js?v=0.2.122';

/** @returns {Promise<{ok:boolean, error?:string}>} the last purchase's answer, or the first refusal */
export async function blessAll(cs) {
  const asked = new Set();
  let r = { ok: false, error: 'blessings_unread' };
  for (;;) {
    const b = blessingsOf(cs);
    const next = b ? b.tiers.find((x) => !x.held) : null;
    if (!next) return asked.size ? r : { ok: false, error: b ? 'blessing_held' : 'blessings_unread' };
    if (asked.has(next.tier)) return r.ok ? { ok: false, error: 'blessing_unchanged' } : r;
    asked.add(next.tier);
    /* the answer, refusal and all, goes back to the press's runIntent, which says it in the window's line (refusalText) */
    const got = await cs.buyBlessing(next.tier, next.price);
    if (!got || !got.ok) return got || { ok: false, error: 'network' };
    r = got;
  }
}
